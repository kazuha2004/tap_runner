"""FastAPI and WebSocket transport for Tap Runners."""

import asyncio
import os
import re
import secrets
import string
import uuid
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi import HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from database import (
    DatabaseUnavailableError,
    close_database,
    database_status,
    initialize_database,
    recent_race_results,
)
from game import GameRoom, RACE_CONFIG

rooms: dict[str, GameRoom] = {}
rooms_lock = asyncio.Lock()
CODE_ALPHABET = string.ascii_uppercase
CODE_PATTERN = re.compile(r"^[A-Z]{4}$")


class CreateRoomResponse(BaseModel):
    code: str


@asynccontextmanager
async def lifespan(_: FastAPI):
    await initialize_database()
    try:
        yield
    finally:
        for room in rooms.values():
            if room.game_task and not room.game_task.done():
                room.game_task.cancel()
        await close_database()


app = FastAPI(title="Tap Runners", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.getenv("ALLOWED_ORIGINS", "").split(",")
        if origin.strip()
    ],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "database": database_status()}

@app.get("/config")
async def get_game_config() -> dict[str, Any]:
    development = (
        os.getenv("ENVIRONMENT", "").lower() == "development"
        or os.getenv("DEBUG", "").lower() in {"1", "true", "yes"}
    )
    if not development:
        raise HTTPException(status_code=404, detail="Not found.")
    return {"race": RACE_CONFIG}


@app.get("/races")
async def get_recent_races(
    limit: int = Query(default=20, ge=1, le=100),
) -> dict[str, Any]:
    try:
        results = await recent_race_results(limit)
    except DatabaseUnavailableError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    return {"races": results}


@app.post("/rooms", response_model=CreateRoomResponse)
async def create_room() -> CreateRoomResponse:
    async with rooms_lock:
        while True:
            code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(4))
            if code not in rooms:
                rooms[code] = GameRoom(code)
                return CreateRoomResponse(code=code)


async def send_error(websocket: WebSocket, message: str) -> None:
    await websocket.send_json({"type": "error", "msg": message})


async def broadcast_lobby(room: GameRoom) -> None:
    await room.send_to_all(room.lobby_payload())


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    room: GameRoom | None = None
    player_id: str | None = None
    try:
        first = await websocket.receive_json()
        if not isinstance(first, dict) or first.get("type") != "join":
            await send_error(websocket, "Join a room before sending game actions.")
            await websocket.close(code=1008)
            return
        code = str(first.get("code", "")).strip().upper()
        name = str(first.get("name", "")).strip()
        if not CODE_PATTERN.fullmatch(code):
            await send_error(websocket, "Room codes must be 4 letters.")
            await websocket.close(code=1008)
            return
        if not name:
            await send_error(websocket, "Enter a player name to join.")
            await websocket.close(code=1008)
            return

        async with rooms_lock:
            room = rooms.get(code)
            if room is None:
                await send_error(websocket, "Room not found. Create a new race.")
                await websocket.close(code=1008)
                return
            player_id = uuid.uuid4().hex
            try:
                player = room.add_player(player_id, name, websocket)
            except ValueError as error:
                await send_error(websocket, str(error))
                await websocket.close(code=1008)
                return
            await websocket.send_json(
                {
                    "type": "joined",
                    "code": code,
                    "me": {"id": player.id, "name": player.name, "color": player.color},
                    "isHost": room.host == player_id,
                }
            )
        await broadcast_lobby(room)

        while True:
            message: Any = await websocket.receive_json()
            if not isinstance(message, dict):
                continue
            action = message.get("type")
            try:
                if action == "tap":
                    room.tap(player_id)
                elif action == "start":
                    await room.start(player_id)
                elif action == "useItem":
                    await room.send_to_all(room.use_item(player_id))
                elif action == "setDistance":
                    room.set_race_distance(player_id, message.get("meters"))
                    await broadcast_lobby(room)
                elif action == "setOptions":
                    room.set_race_distance(player_id, message.get("distance"))
                    await broadcast_lobby(room)
                elif action == "setTheme":
                    room.set_theme(player_id, message.get("theme"))
                    await broadcast_lobby(room)
                elif action == "playAgain":
                    await room.play_again(player_id)
                elif action == "backToLobby":
                    await room.play_again(player_id)
                elif action == "leave":
                    is_empty = await room.leave_player(player_id)
                    if is_empty:
                        async with rooms_lock:
                            if rooms.get(room.code) is room:
                                rooms.pop(room.code, None)
                    player_id = None
                    await websocket.close(code=1000)
                    break
                else:
                    await send_error(websocket, "Unknown game action.")
            except ValueError as error:
                await send_error(websocket, str(error))
    except WebSocketDisconnect:
        pass
    except (RuntimeError, ValueError):
        pass
    finally:
        if room is not None and player_id is not None:
            is_empty = await room.leave_player(player_id)
            if is_empty:
                async with rooms_lock:
                    if rooms.get(room.code) is room:
                        rooms.pop(room.code, None)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
