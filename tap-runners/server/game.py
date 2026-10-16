"""Authoritative room state and race simulation for Tap Runners."""

import asyncio
import logging
import random
import secrets
import statistics
import time
from dataclasses import dataclass, field
from typing import Any
from database import DatabaseUnavailableError, save_race_result

RACE_CONFIG = {
    # Base movement, input limits, and race pacing.
    "tap_boost": 0.8,
    "drag": 0.82,
    "max_speed": 12.0,
    "max_taps_per_sec": 12,
    # About seven steady taps per second stays in the sweet zone; rapid mashing overheats.
    "heat_per_tap": 6.2,
    "heat_cool_per_second": 42.0,
    "heat_sweet_min": 30,
    "heat_sweet_max": 70,
    "heat_overheat_threshold": 100,
    "heat_overheat_seconds": 1.5,
    "heat_overheat_reset": 60,
    "heat_overheat_speed_multiplier": 0.65,
    "heat_sweet_tap_multiplier": 1.25,
    "rhythm_tap_multiplier": 1.3,
    "tap_multiplier_cap": 1.6,
    "final_sprint_distance": 20.0,
    "final_sprint_tap_multiplier": 1.3,
    "RUBBER_BAND": True,
    "rubber_band_start_gap": 15.0,
    "rubber_band_max_strength": 0.08,
    # Item boxes grant only boost, shield, or rocket; weights favor racers behind.
    "item_boxes_per_lane_per_400m": 4,
    "item_box_first_half_bias": 0.62,
    "boost_multiplier": 1.4,
    "boost_seconds": 2.5,
    "shield_seconds": 6.0,
    "rocket_multiplier": 0.6,
    "rocket_seconds": 2.0,
    "item_weights_leader": {
        "BOOST": 2,
        "SHIELD": 2,
        "ROCKET": 1,
    },
    "item_weights_middle": {
        "BOOST": 2,
        "SHIELD": 2,
        "ROCKET": 2,
    },
    "item_weights_last": {
        "BOOST": 2,
        "SHIELD": 2,
        "ROCKET": 3,
    },
    "tick_rate": 30,
    "distances": (100, 200, 400, 800),
    "default_distance": 200,
    "dnf_timeout": 15.0,
}
TAP_BOOST = RACE_CONFIG["tap_boost"]
DRAG = RACE_CONFIG["drag"]
MAX_SPEED = RACE_CONFIG["max_speed"]
MAX_TAPS_PER_SEC = RACE_CONFIG["max_taps_per_sec"]
TICK_RATE = RACE_CONFIG["tick_rate"]
TRACK_LENGTH = RACE_CONFIG["default_distance"]
RACE_DISTANCES = RACE_CONFIG["distances"]
RACE_THEMES = (
    "sunny-stadium",
    "candy-sunset",
    "desert-run",
    "snow-peak",
)
logger = logging.getLogger(__name__)

PALETTE = [
    "#42e8ff",
    "#ff5da8",
    "#a78bfa",
    "#ffd166",
    "#65f28e",
    "#ff845e",
    "#4d9dff",
    "#f6f76e",
]


@dataclass
class Player:
    id: str
    name: str
    color: str
    websocket: Any
    lane: int
    distance: float = 0.0
    speed: float = 0.0
    finish_time: float | None = None
    top_speed: float = 0.0
    finish_place: int | None = None
    tap_count: int = 0
    tap_times: list[float] = field(default_factory=list)
    accepted_taps: list[float] = field(default_factory=list)
    heat: float = 0.0
    overheated_until: float = 0.0
    times_overheated: int = 0
    item: str | None = None
    used_box_indices: set[int] = field(default_factory=set)
    active_effects: dict[str, tuple[float, float]] = field(default_factory=dict)
    heat_locked_until: float = 0.0
    items_used: int = 0


class GameRoom:
    """One in-memory lobby/race. Methods are called on the asyncio event loop."""

    def __init__(self, code: str) -> None:
        self.code = code
        self.players: dict[str, Player] = {}
        self.race_players: dict[str, Player] = {}
        self.host: str | None = None
        self.race_distance = RACE_CONFIG["default_distance"]
        self.theme = "sunny-stadium"
        self.status = "lobby"
        self.winner: str | None = None
        self.finish_order: list[str] = []
        self.game_task: asyncio.Task[None] | None = None
        self.started_at: float | None = None
        self.first_finish_at: float | None = None
        self.results_sent = False
        self.result_saved = False
        self.race_seed = 0
        self.item_boxes: list[dict[str, Any]] = []
        self._item_random = random.Random()

    def unique_name(self, requested: str) -> str:
        base = " ".join(requested.strip().split())[:18] or "Runner"
        existing = {player.name.casefold() for player in self.players.values()}
        if base.casefold() not in existing:
            return base
        suffix = 2
        while f"{base[: max(1, 18 - len(str(suffix)) - 1)]} {suffix}".casefold() in existing:
            suffix += 1
        return f"{base[: max(1, 18 - len(str(suffix)) - 1)]} {suffix}"

    def add_player(self, player_id: str, name: str, websocket: Any) -> Player:
        if self.status != "lobby":
            raise ValueError("This race has already started.")
        if len(self.players) >= len(PALETTE):
            raise ValueError("This room is full (8 players maximum).")
        occupied_lanes = {player.lane for player in self.players.values()}
        lane = next(index for index in range(len(PALETTE)) if index not in occupied_lanes)
        player = Player(
            id=player_id,
            name=self.unique_name(name),
            color=next(color for color in PALETTE if color not in {p.color for p in self.players.values()}),
            websocket=websocket,
            lane=lane,
        )
        self.players[player_id] = player
        if self.host is None:
            self.host = player_id
        return player

    def set_race_distance(self, requester_id: str, distance: object) -> None:
        if requester_id != self.host:
            raise ValueError("Only the host can change the race distance.")
        if self.status != "lobby":
            raise ValueError("Race distance can only be changed in the lobby.")
        if not isinstance(distance, int) or isinstance(distance, bool) or distance not in RACE_DISTANCES:
            options = ", ".join(str(option) for option in RACE_DISTANCES)
            raise ValueError(f"Race distance must be one of: {options} meters.")
        self.race_distance = distance

    def set_theme(self, requester_id: str, theme: object) -> None:
        if requester_id != self.host:
            raise ValueError("Only the host can change the theme.")
        if self.status != "lobby":
            raise ValueError("The theme can only be changed in the lobby.")
        if not isinstance(theme, str) or theme not in RACE_THEMES:
            raise ValueError("Choose one of the available race themes.")
        self.theme = theme

    def remove_player(self, player_id: str) -> bool:
        self.players.pop(player_id, None)
        if not self.players:
            self.host = None
            return True
        if self.host == player_id:
            self.host = next(iter(self.players))
        return False

    def lobby_payload(self) -> dict[str, Any]:
        return {
            "type": "lobby",
            "players": [
                {"id": p.id, "name": p.name, "color": p.color}
                for p in self.players.values()
            ],
            "host": self.host,
            "phase": self.status,
            "raceDistance": self.race_distance,
            "theme": self.theme,
        }

    def state_payload(self) -> dict[str, Any]:
        state_players = self.players.values() if self.status != "finished" else self.race_players.values()
        ranking = sorted(
            state_players,
            key=lambda p: (
                self.finish_order.index(p.id) if p.id in self.finish_order else len(self.finish_order),
                -p.distance,
            ),
        )
        now = time.monotonic()
        leader_distance = max((p.distance for p in ranking), default=0.0)
        effects_by_player = {p.id: self._effects_payload(p, now) for p in ranking}
        return {
            "type": "state",
            "state": "finished" if self.status == "finished" else "racing",
            "t": round((time.monotonic() - self.started_at) if self.started_at else 0, 3),
            "raceDistance": self.race_distance,
            "players": {
                p.id: {
                    "name": p.name,
                    "distance": p.distance,
                    "speed": round(self._effective_speed(p, leader_distance, now), 2),
                    "color": p.color,
                    "lane": p.lane,
                    "finished": p.id in self.finish_order,
                    "finishTime": p.finish_time,
                    "finishPlace": p.finish_place,
                    "topSpeed": p.top_speed,
                    "taps": p.tap_count,
                    "heat": int(round(p.heat)),
                    "zone": self._heat_zone(p.heat),
                    "overheated": now < p.overheated_until,
                    "overheatedRemaining": round(max(0.0, p.overheated_until - now), 2),
                    "timesOverheated": p.times_overheated,
                    "item": p.item,
                    "activeEffects": effects_by_player[p.id],
                    "finishTime": round(p.finish_time, 2) if p.finish_time is not None else None,
                    "dnf": p.id not in self.finish_order and self.status == "finished",
                }
                for p in ranking
            },
            "winner": self.winner,
            "ranking": [p.id for p in ranking],
            "dnfIn": (
                round(max(0.0, RACE_CONFIG["dnf_timeout"] - (time.monotonic() - self.first_finish_at)), 1)
                if self.first_finish_at is not None and self.status == "racing"
                else None
            ),
        }

    def results_payload(self) -> dict[str, Any]:
        ordered = sorted(
            self.race_players.values(),
            key=lambda player: (
                player.finish_place is None,
                player.finish_place or 999,
                -player.distance,
            ),
        )
        elapsed = max(0.0, time.monotonic() - (self.started_at or time.monotonic()))
        return {
            "type": "results",
            "distance": self.race_distance,
            "players": [
                {
                    "id": player.id,
                    "name": player.name,
                    "place": player.finish_place,
                    "time": round(player.finish_time, 2) if player.finish_time is not None else None,
                    "avgSpeed": round(
                        self.race_distance / player.finish_time
                        if player.finish_time and player.finish_time > 0
                        else player.distance / elapsed if elapsed > 0 else 0,
                        2,
                    ),
                    "topSpeed": round(player.top_speed, 2),
                    "taps": player.tap_count,
                    "timesOverheated": player.times_overheated,
                    "itemsUsed": player.items_used,
                    "dnf": player.finish_place is None,
                    "distance": round(player.distance, 2),
                    "color": player.color,
                }
                for player in ordered
            ],
        }

    async def save_result(self, reason: str) -> None:
        if self.result_saved:
            return
        self.result_saved = True
        try:
            await save_race_result(self)
        except DatabaseUnavailableError:
            logger.exception(
                "Race result for room %s could not be saved (%s).",
                self.code,
                reason,
            )

    async def send_to_all(self, message: dict[str, Any]) -> None:
        stale: list[str] = []
        for player in list(self.players.values()):
            try:
                await player.websocket.send_json(message)
            except Exception:
                stale.append(player.id)
        for player_id in stale:
            await self.leave_player(player_id)

    async def start(self, requester_id: str) -> None:
        if requester_id != self.host:
            raise ValueError("Only the host can start the race.")
        if self.status != "lobby":
            raise ValueError("The race is not in the lobby.")
        if not self.players:
            raise ValueError("At least one player is needed to start.")
        self.race_players = dict(self.players)
        self.status = "countdown"
        self.first_finish_at = None
        self.results_sent = False
        self.result_saved = False
        self.finish_order.clear()
        self.winner = None
        self.race_seed = secrets.randbits(32)
        self.item_boxes = self._generate_item_boxes(self.race_seed ^ 0x5A17, self.race_distance)
        self._item_random.seed(self.race_seed ^ 0xD1B54A35)
        for player in self.players.values():
            player.distance = 0.0
            player.speed = 0.0
            player.finish_time = None
            player.finish_place = None
            player.top_speed = 0.0
            player.tap_count = 0
            player.tap_times.clear()
            player.accepted_taps.clear()
            player.heat = 0.0
            player.overheated_until = 0.0
            player.times_overheated = 0
            player.item = None
            player.used_box_indices.clear()
            player.active_effects.clear()
            player.heat_locked_until = 0.0
            player.items_used = 0
        await self.send_to_all({
            "type": "raceStart",
            "seed": self.race_seed,
            "itemBoxes": self.item_boxes,
            "raceDistance": self.race_distance,
            "theme": self.theme,
        })
        self.game_task = asyncio.create_task(self._run_race())

    async def _run_race(self) -> None:
        try:
            for number in (3, 2, 1):
                if not self.players:
                    return
                await self.send_to_all({"type": "countdown", "n": number})
                await asyncio.sleep(1)
            if not self.players:
                return
            await self.send_to_all({"type": "countdown", "n": "GO"})
            self.status = "racing"
            self.started_at = time.monotonic()
            tick = 1 / TICK_RATE
            previous = time.monotonic()
            while self.status == "racing" and self.players:
                frame_start = time.monotonic()
                dt = min(frame_start - previous, 0.1)
                previous = frame_start
                leader_distance = max(
                    (runner.distance for runner in self.players.values()),
                    default=0.0,
                )
                item_events: list[dict[str, Any]] = []
                for player in list(self.players.values()):
                    self._update_heat(player, dt, frame_start)
                    if self.race_distance - player.distance <= RACE_CONFIG["final_sprint_distance"]:
                        player.overheated_until = 0.0
                    old_distance = player.distance
                    player.speed -= player.speed * DRAG * dt
                    player.speed = max(0.0, player.speed)
                    if player.id in self.finish_order:
                        player.speed = max(0.0, player.speed - 3.8 * dt)
                        player.distance += player.speed * dt
                        continue
                    effective_speed = self._effective_speed(player, leader_distance, frame_start)
                    new_distance = player.distance + effective_speed * dt
                    item_events.extend(self._pickup_item_boxes(player, old_distance, new_distance, frame_start))
                    if new_distance >= self.race_distance:
                        distance_covered = new_distance - old_distance
                        fraction = (
                            (self.race_distance - old_distance) / distance_covered
                            if distance_covered > 0
                            else 1.0
                        )
                        player.distance = float(self.race_distance)
                        race_elapsed = frame_start - self.started_at
                        player.finish_time = round(max(0.0, race_elapsed - dt * (1 - fraction)), 2)
                        player.finish_place = len(self.finish_order) + 1
                        self.finish_order.append(player.id)
                        if self.first_finish_at is None:
                            self.first_finish_at = frame_start
                        if self.winner is None:
                            self.winner = player.id
                    else:
                        player.distance = new_distance
                    player.top_speed = max(player.top_speed, effective_speed)
                for event in item_events:
                    await self.send_to_all(event)

                all_finished = len(self.finish_order) == len(self.race_players)
                timed_out = (
                    self.first_finish_at is not None
                    and frame_start - self.first_finish_at >= RACE_CONFIG["dnf_timeout"]
                )
                if all_finished or timed_out:
                    self.status = "finished"
                    await self.send_to_all({"type": "results", **self.results_payload()})
                    self.results_sent = True
                await self.send_to_all(self.state_payload())
                if self.status == "finished":
                    await self.save_result("race completed")
                    return
                await asyncio.sleep(max(0.0, tick - (time.monotonic() - frame_start)))
        except asyncio.CancelledError:
            raise
        finally:
            if self.status == "countdown":
                self.status = "lobby"

    def tap(self, player_id: str) -> bool:
        player = self.players.get(player_id)
        if player is None or self.status != "racing" or player.id in self.finish_order:
            return False
        now = time.monotonic()
        self._update_heat(player, 0.0, now)
        final_sprint = self.race_distance - player.distance <= RACE_CONFIG["final_sprint_distance"]
        if final_sprint:
            player.overheated_until = 0.0
        if now < player.overheated_until:
            return False
        while player.tap_times and now - player.tap_times[0] >= 1:
            player.tap_times.pop(0)
        if len(player.tap_times) >= MAX_TAPS_PER_SEC:
            return False
        player.tap_times.append(now)

        intervals = [
            later - earlier
            for earlier, later in zip(player.accepted_taps, player.accepted_taps[1:])
        ]
        multiplier = 1.0
        if len(intervals) >= 3:
            recent = intervals[-4:]
            mean = statistics.mean(recent)
            if mean > 0 and statistics.pvariance(recent) / (mean * mean) < 0.08:
                multiplier = RACE_CONFIG["rhythm_tap_multiplier"]
        player.accepted_taps.append(now)
        player.accepted_taps = player.accepted_taps[-6:]
        player.tap_count += 1
        sweet = RACE_CONFIG["heat_sweet_min"] <= player.heat <= RACE_CONFIG["heat_sweet_max"]
        if final_sprint:
            multiplier = max(multiplier, RACE_CONFIG["final_sprint_tap_multiplier"])
        elif sweet:
            multiplier *= RACE_CONFIG["heat_sweet_tap_multiplier"]
        multiplier = min(multiplier, RACE_CONFIG["tap_multiplier_cap"])
        player.speed = min(player.speed + TAP_BOOST * multiplier, MAX_SPEED)
        if not final_sprint and now >= player.heat_locked_until:
            player.heat = min(
                float(RACE_CONFIG["heat_overheat_threshold"]),
                player.heat + RACE_CONFIG["heat_per_tap"],
            )
            if player.heat >= RACE_CONFIG["heat_overheat_threshold"]:
                player.overheated_until = now + RACE_CONFIG["heat_overheat_seconds"]
                player.times_overheated += 1
        if now >= player.heat_locked_until:
            player.heat_locked_until = 0.0
        player.top_speed = max(player.top_speed, player.speed)
        return True

    @staticmethod
    def _heat_zone(heat: float) -> str:
        if heat < RACE_CONFIG["heat_sweet_min"]:
            return "cold"
        if heat <= RACE_CONFIG["heat_sweet_max"]:
            return "sweet"
        return "hot"

    @staticmethod
    def _update_heat(player: Player, dt: float, now: float) -> None:
        if now >= player.overheated_until:
            if player.overheated_until:
                player.heat = float(RACE_CONFIG["heat_overheat_reset"])
                player.overheated_until = 0.0
            else:
                player.heat = max(0.0, player.heat - RACE_CONFIG["heat_cool_per_second"] * dt)

    @staticmethod
    def _effective_speed(player: Player, leader_distance: float, now: float) -> float:
        speed = player.speed
        for name, (expires_at, multiplier) in list(player.active_effects.items()):
            if expires_at <= now:
                player.active_effects.pop(name, None)
                continue
            speed *= multiplier
        if now < player.overheated_until:
            speed *= RACE_CONFIG["heat_overheat_speed_multiplier"]
        if RACE_CONFIG["RUBBER_BAND"] and leader_distance - player.distance > RACE_CONFIG["rubber_band_start_gap"]:
            gap = leader_distance - player.distance - RACE_CONFIG["rubber_band_start_gap"]
            strength = min(RACE_CONFIG["rubber_band_max_strength"], gap * 0.001)
            speed *= 1 + strength
        return speed

    @staticmethod
    def _effects_payload(player: Player, now: float) -> list[dict[str, Any]]:
        effects = []
        for name, (expires_at, _) in list(player.active_effects.items()):
            if expires_at <= now:
                player.active_effects.pop(name, None)
            else:
                effects.append({"name": name, "remaining": round(expires_at - now, 2)})
        return effects

    @staticmethod
    def _generate_item_boxes(seed: int, distance: int) -> list[dict[str, Any]]:
        generator = random.Random(seed)
        count = max(1, round(distance / 400 * RACE_CONFIG["item_boxes_per_lane_per_400m"]))
        boxes = []
        box_index = 0
        for lane in range(len(PALETTE)):
            for index in range(count):
                progress = (index + generator.uniform(0.12, 0.88)) / count
                boxes.append({
                    "index": box_index,
                    "lane": lane,
                    "distance": round(
                        distance * RACE_CONFIG["item_box_first_half_bias"] * progress,
                        2,
                    ),
                })
                box_index += 1
        return boxes

    def _pickup_item_boxes(
        self,
        player: Player,
        old_distance: float,
        new_distance: float,
        now: float,
    ) -> list[dict[str, Any]]:
        events = []
        for box in self.item_boxes:
            index = box["index"]
            if box["lane"] != player.lane or index in player.used_box_indices:
                continue
            if not old_distance < box["distance"] <= new_distance:
                continue
            player.used_box_indices.add(index)
            if player.item is not None:
                continue
            player.item = self._weighted_item_for(player)
            events.append({
                "type": "itemPickedUp",
                "id": player.id,
                "boxIndex": index,
                "item": player.item,
            })
        return events

    def _weighted_item_for(self, player: Player) -> str:
        ranking = sorted(self.players.values(), key=lambda runner: runner.distance, reverse=True)
        position = ranking.index(player)
        if position == len(ranking) - 1:
            weights = RACE_CONFIG["item_weights_last"]
        elif position == 0:
            weights = RACE_CONFIG["item_weights_leader"]
        else:
            weights = RACE_CONFIG["item_weights_middle"]
        names = [name for name, weight in weights.items() if weight > 0]
        values = [weights[name] for name in names]
        return self._item_random.choices(names, weights=values, k=1)[0]

    @staticmethod
    def _apply_negative_effect(
        target: Player,
        name: str,
        multiplier: float,
        duration: float,
        now: float,
    ) -> bool:
        GameRoom._effects_payload(target, now)
        if "SHIELD" in target.active_effects:
            target.active_effects.pop("SHIELD", None)
            return False
        target.active_effects[name] = (now + duration, multiplier)
        return True

    def use_item(self, player_id: str) -> dict[str, Any]:
        player = self.players.get(player_id)
        if player is None:
            raise ValueError("Join the race before using an item.")
        if self.status != "racing" or player.id in self.finish_order:
            raise ValueError("Items can only be used during a race.")
        if time.monotonic() < player.overheated_until:
            raise ValueError("Cool down before using an item.")
        if player.item is None:
            raise ValueError("You don't have an item to use.")

        now = time.monotonic()
        item = player.item
        if item not in {"BOOST", "SHIELD", "ROCKET"}:
            raise ValueError("That item is not available.")
        ahead = []
        if item == "ROCKET":
            ahead = [
                runner for runner in self.players.values()
                if runner.id != player.id
                and runner.id not in self.finish_order
                and runner.distance > player.distance
            ]
            if not ahead:
                raise ValueError("There is no runner ahead to target.")

        targets: list[str] = []
        player.item = None
        player.items_used += 1
        if item == "BOOST":
            player.active_effects["BOOST"] = (
                now + RACE_CONFIG["boost_seconds"],
                RACE_CONFIG["boost_multiplier"],
            )
        elif item == "SHIELD":
            player.active_effects["SHIELD"] = (now + RACE_CONFIG["shield_seconds"], 1.0)
        elif item == "ROCKET":
            target = min(ahead, key=lambda runner: runner.distance - player.distance)
            if self._apply_negative_effect(
                target,
                "ROCKET",
                RACE_CONFIG["rocket_multiplier"],
                RACE_CONFIG["rocket_seconds"],
                now,
            ):
                targets.append(target.id)
        return {
            "type": "itemUsed",
            "id": player.id,
            "sourceName": player.name,
            "item": item,
            "targetIds": targets,
        }

    async def leave_player(self, player_id: str) -> bool:
        player = self.players.get(player_id)
        if player is None:
            return not self.players
        name = player.name
        sent_results = False
        if self.status == "countdown":
            self.race_players.pop(player_id, None)
        elif self.status == "racing" and player_id not in self.finish_order:
            self.race_players.pop(player_id, None)
        self.remove_player(player_id)
        await self.send_to_all({"type": "playerLeft", "name": name})
        if not self.players:
            if self.game_task and not self.game_task.done():
                self.game_task.cancel()
            return True

        if self.status == "racing":
            if len(self.players) == 1:
                last_player = next(iter(self.players.values()))
                self.winner = last_player.id
                if last_player.id not in self.finish_order:
                    last_player.distance = float(self.race_distance)
                    last_player.finish_place = 1
                    last_player.finish_time = round(max(0.0, time.monotonic() - (self.started_at or time.monotonic())), 2)
                    self.finish_order.append(last_player.id)
                self.finish_order = [last_player.id] + [
                    finished_id for finished_id in self.finish_order if finished_id != last_player.id
                ]
                for place, finished_id in enumerate(self.finish_order, start=1):
                    self.race_players[finished_id].finish_place = place
                self.status = "finished"
                await self.send_to_all({"type": "results", **self.results_payload()})
                self.results_sent = True
                sent_results = True
                await self.send_to_all(self.state_payload())
                await self.save_result("all other runners left")
        if self.status == "finished" and self.results_sent and not sent_results:
            await self.send_to_all({"type": "results", **self.results_payload()})
        await self.send_to_all(self.lobby_payload())
        return False

    async def play_again(self, requester_id: str) -> None:
        if requester_id != self.host:
            raise ValueError("Only the host can start another race.")
        if self.status != "finished":
            raise ValueError("The race has not finished yet.")
        if self.game_task and not self.game_task.done():
            self.game_task.cancel()
        self.game_task = None
        self.status = "lobby"
        self.winner = None
        self.finish_order.clear()
        self.race_players.clear()
        self.started_at = None
        self.first_finish_at = None
        self.results_sent = False
        self.result_saved = False
        self.item_boxes.clear()
        for player in self.players.values():
            player.distance = 0.0
            player.speed = 0.0
            player.finish_time = None
            player.finish_place = None
            player.top_speed = 0.0
            player.tap_count = 0
            player.tap_times.clear()
            player.accepted_taps.clear()
            player.heat = 0.0
            player.overheated_until = 0.0
            player.times_overheated = 0
            player.item = None
            player.used_box_indices.clear()
            player.active_effects.clear()
            player.heat_locked_until = 0.0
            player.items_used = 0
        await self.send_to_all(self.lobby_payload())
