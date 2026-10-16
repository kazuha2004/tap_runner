"""MongoDB Atlas persistence for completed race results."""

from __future__ import annotations

import asyncio
import logging
import os
import time
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

from pymongo import DESCENDING, MongoClient
from pymongo.collection import Collection
from pymongo.errors import PyMongoError

if TYPE_CHECKING:
    from game import GameRoom

logger = logging.getLogger(__name__)
_client: MongoClient[dict[str, Any]] | None = None
_results: Collection[dict[str, Any]] | None = None
_status = "not_configured"


class DatabaseUnavailableError(RuntimeError):
    """MongoDB is configured but cannot currently serve a request."""


def database_status() -> str:
    return _status


async def initialize_database() -> None:
    global _client, _results, _status

    uri = os.getenv("MONGODB_URI", "").strip()
    if not uri:
        _status = "not_configured"
        logger.warning(
            "MONGODB_URI is not set; completed race results will not be persisted."
        )
        return

    database_name = os.getenv("MONGODB_DATABASE", "tap_runners").strip()
    if not database_name:
        raise RuntimeError("MONGODB_DATABASE must not be empty.")

    client: MongoClient[dict[str, Any]] = MongoClient(
        uri,
        appname="tap-runners",
        connectTimeoutMS=10000,
        serverSelectionTimeoutMS=10000,
        tz_aware=True,
    )
    try:
        await asyncio.to_thread(client.admin.command, "ping")
        results = client[database_name]["race_results"]
        await asyncio.to_thread(
            results.create_index, [("completed_at", DESCENDING)]
        )
    except PyMongoError as error:
        client.close()
        _status = "error"
        raise RuntimeError(
            "MongoDB connection failed. Check MONGODB_URI, the Atlas database user, "
            "and the Atlas network access list."
        ) from error

    _client = client
    _results = results
    _status = "connected"


async def close_database() -> None:
    global _client, _results, _status

    client = _client
    _client = None
    _results = None
    if client is not None:
        await asyncio.to_thread(client.close)
    _status = "not_configured"


def _race_document(room: GameRoom) -> dict[str, Any]:
    ordered_players = sorted(
        room.race_players.values() or room.players.values(),
        key=lambda player: (
            room.finish_order.index(player.id)
            if player.id in room.finish_order
            else len(room.finish_order),
            -player.distance,
        ),
    )
    winner = room.race_players.get(room.winner) or room.players.get(room.winner)
    return {
        "room_code": room.code,
        "completed_at": datetime.now(timezone.utc),
        "duration_seconds": round(time.monotonic() - room.started_at, 3)
        if room.started_at is not None
        else 0,
        "race_distance": room.race_distance,
        "winner": (
            {
                "player_id": winner.id,
                "name": winner.name,
                "color": winner.color,
            }
            if winner is not None
            else None
        ),
        "ranking": [
            {
                "position": position,
                "player_id": player.id,
                "name": player.name,
                "color": player.color,
                "finished": player.id in room.finish_order,
                "distance": min(player.distance, room.race_distance),
                "finish_time": player.finish_time,
                "finish_place": player.finish_place,
                "average_speed": round(
                    room.race_distance / player.finish_time
                    if player.finish_time and player.finish_time > 0
                    else 0,
                    2,
                ),
                "top_speed": round(player.top_speed, 2),
                "taps": player.tap_count,
                "times_overheated": player.times_overheated,
                "items_used": player.items_used,
                "pads_hit": player.pads_hit,
                "perfect_pads": player.perfect_pads,
                "dnf": player.finish_place is None,
            }
            for position, player in enumerate(ordered_players, start=1)
        ],
    }


async def save_race_result(room: GameRoom) -> bool:
    global _status

    if _status == "not_configured":
        return False
    if _status != "connected" or _results is None:
        raise DatabaseUnavailableError("MongoDB is not connected.")

    document = _race_document(room)
    try:
        await asyncio.to_thread(_results.insert_one, document)
    except PyMongoError as error:
        _status = "error"
        raise DatabaseUnavailableError("Could not save the completed race.") from error
    return True


async def recent_race_results(limit: int = 20) -> list[dict[str, Any]]:
    global _status

    if _status != "connected" or _results is None:
        raise DatabaseUnavailableError("MongoDB is not connected.")

    def query() -> list[dict[str, Any]]:
        documents = _results.find(
            {},
            {
                "_id": 0,
                "room_code": 1,
                "completed_at": 1,
                "duration_seconds": 1,
                "race_distance": 1,
                "winner": 1,
                "ranking": 1,
            },
        ).sort("completed_at", DESCENDING).limit(limit)
        return [
            {
                **document,
                "completed_at": document["completed_at"].isoformat(),
            }
            for document in documents
        ]

    try:
        return await asyncio.to_thread(query)
    except PyMongoError as error:
        _status = "error"
        raise DatabaseUnavailableError("Could not read saved race results.") from error
