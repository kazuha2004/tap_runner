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
    # Item boxes and pads are generated from the race seed and simulated by the server.
    "item_boxes_per_lane_per_400m": 4,
    "item_box_first_half_bias": 0.62,
    "item_pickup_radius": 0.6,
    "lane_width": 1.2,
    "turbo_multiplier": 1.4,
    "turbo_seconds": 2.5,
    "shield_seconds": 6.0,
    "slow_trap_multiplier": 0.6,
    "slow_trap_seconds": 2.0,
    "cool_down_seconds": 3.0,
    "magnet_pad_charges": 2,
    "lightning_multiplier": 0.8,
    "lightning_seconds": 1.5,
    "lightning_stun_seconds": 0.6,
    "pad_min_spacing": 40,
    "pad_max_spacing": 60,
    "pad_start_exclusion": 20,
    "pad_finish_exclusion": 15,
    "pad_lane_offset": 3.5,
    "pad_perfect_multiplier": 1.5,
    "pad_perfect_seconds": 1.2,
    "pad_ok_multiplier": 1.15,
    "pad_ok_seconds": 0.6,
    "max_rocket_range": 80.0,
    "rocket_speed_multiplier": 1.8,
    "rocket_min_speed": 22.0,
    "rocket_lifetime": 4.0,
    "rocket_no_target_lifetime": 3.0,
    "rocket_lane_turn_rate": 2.0,
    "rocket_hit_lane_gap": 0.6,
    "knockdown_time": 1.6,
    "getup_time": 0.5,
    "knockdown_speed_multiplier": 0.15,
    "getup_speed_multiplier": 0.6,
    "knockback_distance": 1.5,
    "stun_immunity_seconds": 1.0,
    "item_weights_leader": {
        "TURBO": 2,
        "SHIELD": 2,
        "SLOW_TRAP": 1,
        "COOL_DOWN": 2,
        "MAGNET": 1,
        "LIGHTNING": 0,
        "ROCKET": 0,
    },
    "item_weights_middle": {
        "TURBO": 2,
        "SHIELD": 2,
        "SLOW_TRAP": 2,
        "COOL_DOWN": 1,
        "MAGNET": 1,
        "LIGHTNING": 1,
        "ROCKET": 1,
    },
    "item_weights_last": {
        "TURBO": 2,
        "SHIELD": 2,
        "SLOW_TRAP": 2,
        "COOL_DOWN": 1,
        "MAGNET": 1,
        "LIGHTNING": 2,
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
    used_pad_indices: set[int] = field(default_factory=set)
    stunned_until: float = 0.0
    getup_until: float = 0.0
    stun_immunity_until: float = 0.0
    magnet_charges: int = 0
    perfect_pads: int = 0
    pads_hit: int = 0


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
        self.boost_pads: list[dict[str, Any]] = []
        self.rockets: dict[str, dict[str, Any]] = {}
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
        for rocket in self.rockets.values():
            if rocket["ownerId"] == player_id:
                rocket["ownerId"] = ""
            if rocket["targetId"] == player_id:
                rocket["targetId"] = None
                rocket["noTargetAge"] = 0.0
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
        for player in ranking:
            if player.magnet_charges:
                effects_by_player[player.id].append({
                    "name": "MAGNET",
                    "remaining": player.magnet_charges,
                })
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
                    "shield": "SHIELD" in p.active_effects,
                    "stunned": now < p.stunned_until,
                    "stunRemaining": round(max(0.0, p.stunned_until - now), 2),
                    "getupRemaining": round(max(0.0, p.getup_until - now), 2),
                    "finishTime": round(p.finish_time, 2) if p.finish_time is not None else None,
                    "dnf": p.id not in self.finish_order and self.status == "finished",
                }
                for p in ranking
            },
            "rockets": [
                {
                    "id": rocket["id"],
                    "ownerId": rocket["ownerId"],
                    "lane": round(rocket["lane"], 2),
                    "distance": round(rocket["distance"], 2),
                    "speed": round(rocket["speed"], 2),
                    "targetId": rocket["targetId"],
                    "age": round(rocket["age"], 2),
                }
                for rocket in self.rockets.values()
            ],
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
                    "padsHit": player.pads_hit,
                    "perfectPads": player.perfect_pads,
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
        self.boost_pads = self._generate_boost_pads(self.race_seed ^ 0x4193, self.race_distance)
        self.rockets.clear()
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
            player.used_pad_indices.clear()
            player.stunned_until = 0.0
            player.getup_until = 0.0
            player.stun_immunity_until = 0.0
            player.magnet_charges = 0
            player.perfect_pads = 0
            player.pads_hit = 0
        await self.send_to_all({
            "type": "raceStart",
            "seed": self.race_seed,
            "itemBoxes": self.item_boxes,
            "boostPads": self.boost_pads,
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
                    shield = player.active_effects.get("SHIELD")
                    if shield and shield[0] <= frame_start:
                        player.active_effects.pop("SHIELD", None)
                        item_events.append({
                            "type": "shieldPopped",
                            "id": player.id,
                            "reason": "expired",
                        })
                for player in list(self.players.values()):
                    self._update_heat(player, dt, frame_start)
                    self._update_stun_state(player, frame_start)
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
                    item_events.extend(self._hit_boost_pads(player, old_distance, new_distance, frame_start))
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
                for event in self._advance_rockets(dt, frame_start):
                    await self.send_to_all(event)
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
        self._update_stun_state(player, now)
        if now < player.stunned_until:
            return False
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
        if now < player.stunned_until:
            speed *= RACE_CONFIG["knockdown_speed_multiplier"]
        elif now < player.getup_until:
            speed *= RACE_CONFIG["getup_speed_multiplier"]
        if RACE_CONFIG["RUBBER_BAND"] and leader_distance - player.distance > RACE_CONFIG["rubber_band_start_gap"]:
            gap = leader_distance - player.distance - RACE_CONFIG["rubber_band_start_gap"]
            strength = min(RACE_CONFIG["rubber_band_max_strength"], gap * 0.001)
            speed *= 1 + strength
        return speed

    @staticmethod
    def _update_stun_state(player: Player, now: float) -> None:
        if player.stunned_until and now >= player.stunned_until:
            player.stunned_until = 0.0
            player.getup_until = now + RACE_CONFIG["getup_time"]
            player.stun_immunity_until = player.getup_until + RACE_CONFIG["stun_immunity_seconds"]
        if player.getup_until and now >= player.getup_until:
            player.getup_until = 0.0

    @staticmethod
    def _stun_player(player: Player, now: float, duration: float) -> bool:
        GameRoom._update_stun_state(player, now)
        if now < player.stun_immunity_until:
            return False
        player.stunned_until = now + duration
        player.getup_until = 0.0
        player.heat = 40.0
        player.overheated_until = 0.0
        player.distance = max(0.0, player.distance - RACE_CONFIG["knockback_distance"])
        return True

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

    @staticmethod
    def _generate_boost_pads(seed: int, distance: int) -> list[dict[str, Any]]:
        generator = random.Random(seed)
        pads: list[dict[str, Any]] = []
        index = 0
        for lane in range(len(PALETTE)):
            position = float(RACE_CONFIG["pad_start_exclusion"])
            while position < distance - RACE_CONFIG["pad_finish_exclusion"]:
                position += generator.uniform(
                    RACE_CONFIG["pad_min_spacing"],
                    RACE_CONFIG["pad_max_spacing"],
                )
                if position >= distance - RACE_CONFIG["pad_finish_exclusion"]:
                    break
                offset = generator.uniform(
                    -RACE_CONFIG["pad_lane_offset"],
                    RACE_CONFIG["pad_lane_offset"],
                )
                pad_distance = position + offset
                if not RACE_CONFIG["pad_start_exclusion"] < pad_distance < (
                    distance - RACE_CONFIG["pad_finish_exclusion"]
                ):
                    continue
                pads.append({
                    "index": index,
                    "lane": lane,
                    "distance": round(pad_distance, 2),
                })
                index += 1
        return pads

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
            lane_gap = abs(box["lane"] - player.lane) * RACE_CONFIG["lane_width"]
            if lane_gap > RACE_CONFIG["item_pickup_radius"] or index in player.used_box_indices:
                continue
            if not old_distance < box["distance"] <= new_distance:
                continue
            player.used_box_indices.add(index)
            if player.item is not None:
                continue
            player.item = self._weighted_item_for(player)
            events.append({
                "type": "boxPickup",
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

    def _hit_boost_pads(
        self,
        player: Player,
        old_distance: float,
        new_distance: float,
        now: float,
    ) -> list[dict[str, Any]]:
        events = []
        for pad in self.boost_pads:
            index = pad["index"]
            lane_gap = abs(pad["lane"] - player.lane) * RACE_CONFIG["lane_width"]
            if lane_gap > RACE_CONFIG["item_pickup_radius"] or index in player.used_pad_indices:
                continue
            if not old_distance < pad["distance"] <= new_distance:
                continue
            player.used_pad_indices.add(index)
            recent_sweet_tap = (
                RACE_CONFIG["heat_sweet_min"] <= player.heat <= RACE_CONFIG["heat_sweet_max"]
                and player.accepted_taps
                and now - player.accepted_taps[-1] <= 0.5
            )
            perfect = player.magnet_charges > 0 or recent_sweet_tap
            if player.magnet_charges > 0:
                player.magnet_charges -= 1
            if perfect:
                player.active_effects["PAD"] = (
                    now + RACE_CONFIG["pad_perfect_seconds"],
                    RACE_CONFIG["pad_perfect_multiplier"],
                )
                player.perfect_pads += 1
            else:
                player.active_effects["PAD"] = (
                    now + RACE_CONFIG["pad_ok_seconds"],
                    RACE_CONFIG["pad_ok_multiplier"],
                )
            player.pads_hit += 1
            events.append({
                "type": "padHit",
                "id": player.id,
                "padIndex": index,
                "quality": "perfect" if perfect else "ok",
            })
        return events

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

    def _advance_rockets(self, dt: float, now: float) -> list[dict[str, Any]]:
        events: list[dict[str, Any]] = []
        for rocket_id, rocket in list(self.rockets.items()):
            rocket["age"] += dt
            old_distance = rocket["distance"]
            target = self.players.get(rocket["targetId"]) if rocket["targetId"] else None
            if target is None or target.id in self.finish_order:
                rocket["targetId"] = None
                rocket["noTargetAge"] += dt
                target = None
            if target is not None:
                delta = target.lane - rocket["lane"]
                max_turn = RACE_CONFIG["rocket_lane_turn_rate"] * dt
                rocket["lane"] += max(-max_turn, min(max_turn, delta))
            rocket["distance"] += rocket["speed"] * dt
            impact = None
            impact_distance = float("inf")
            for runner in self.players.values():
                if runner.id == rocket["ownerId"] or runner.id in self.finish_order:
                    continue
                if not old_distance < runner.distance <= rocket["distance"] + 0.5:
                    continue
                lane_gap = abs(runner.lane - rocket["lane"]) * RACE_CONFIG["lane_width"]
                if lane_gap < RACE_CONFIG["rocket_hit_lane_gap"] and runner.distance < impact_distance:
                    impact = runner
                    impact_distance = runner.distance
            if impact is not None:
                point = {
                    "lane": round(rocket["lane"], 2),
                    "distance": round(min(impact.distance, self.race_distance), 2),
                }
                if "SHIELD" in impact.active_effects and impact.active_effects["SHIELD"][0] > now:
                    impact.active_effects.pop("SHIELD", None)
                    events.append({"type": "shieldPopped", "id": impact.id, "reason": "rocket"})
                    events.append({
                        "type": "rocketBlocked",
                        "rocketId": rocket_id,
                        "targetId": impact.id,
                        "ownerId": rocket["ownerId"],
                        "point": point,
                    })
                elif self._stun_player(impact, now, RACE_CONFIG["knockdown_time"]):
                    events.append({
                        "type": "rocketHit",
                        "rocketId": rocket_id,
                        "targetId": impact.id,
                        "ownerId": rocket["ownerId"],
                        "point": point,
                    })
                else:
                    events.append({
                        "type": "rocketBlocked",
                        "rocketId": rocket_id,
                        "targetId": impact.id,
                        "ownerId": rocket["ownerId"],
                        "point": point,
                        "reason": "immunity",
                    })
                self.rockets.pop(rocket_id, None)
                continue
            if (
                rocket["distance"] >= self.race_distance
                or rocket["age"] >= RACE_CONFIG["rocket_lifetime"]
                or (
                    rocket["targetId"] is None
                    and rocket["noTargetAge"] >= RACE_CONFIG["rocket_no_target_lifetime"]
                )
            ):
                self.rockets.pop(rocket_id, None)
        return events

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
        if item not in {
            "TURBO", "SHIELD", "ROCKET", "SLOW_TRAP", "COOL_DOWN", "MAGNET", "LIGHTNING",
        }:
            raise ValueError("That item is not available.")
        targets: list[str] = []
        blocked: list[str] = []
        player.item = None
        player.items_used += 1
        rocket_id: str | None = None
        if item == "TURBO":
            player.active_effects["TURBO"] = (
                now + RACE_CONFIG["turbo_seconds"],
                RACE_CONFIG["turbo_multiplier"],
            )
        elif item == "SHIELD":
            player.active_effects["SHIELD"] = (now + RACE_CONFIG["shield_seconds"], 1.0)
        elif item == "ROCKET":
            ahead = [
                runner for runner in self.players.values()
                if runner.id != player.id
                and runner.id not in self.finish_order
                and 0 < runner.distance - player.distance <= RACE_CONFIG["max_rocket_range"]
            ]
            target = min(ahead, key=lambda runner: runner.distance - player.distance) if ahead else None
            rocket_id = secrets.token_hex(6)
            rocket = {
                "id": rocket_id,
                "ownerId": player.id,
                "lane": float(player.lane),
                "distance": min(self.race_distance, player.distance + 1.5),
                "speed": max(
                    RACE_CONFIG["rocket_min_speed"],
                    player.speed * RACE_CONFIG["rocket_speed_multiplier"],
                ),
                "targetId": target.id if target else None,
                "age": 0.0,
                "noTargetAge": 0.0,
            }
            self.rockets[rocket_id] = rocket
            if target:
                targets.append(target.id)
        else:
            ahead = sorted(
                (
                    runner for runner in self.players.values()
                    if runner.id != player.id
                    and runner.id not in self.finish_order
                    and runner.distance > player.distance
                ),
                key=lambda runner: runner.distance - player.distance,
            )
            if item == "COOL_DOWN":
                player.heat = 40.0
                player.heat_locked_until = now + RACE_CONFIG["cool_down_seconds"]
                player.overheated_until = 0.0
                player.active_effects["COOL_DOWN"] = (
                    now + RACE_CONFIG["cool_down_seconds"],
                    1.0,
                )
            elif item == "MAGNET":
                player.magnet_charges += RACE_CONFIG["magnet_pad_charges"]
            elif item == "SLOW_TRAP" and ahead:
                target = ahead[0]
                if self._apply_negative_effect(
                    target,
                    "SLOW_TRAP",
                    RACE_CONFIG["slow_trap_multiplier"],
                    RACE_CONFIG["slow_trap_seconds"],
                    now,
                ):
                    targets.append(target.id)
                else:
                    blocked.append(target.id)
            elif item == "LIGHTNING":
                for target in ahead:
                    if self._apply_negative_effect(
                        target,
                        "LIGHTNING",
                        RACE_CONFIG["lightning_multiplier"],
                        RACE_CONFIG["lightning_seconds"],
                        now,
                    ):
                        self._stun_player(target, now, RACE_CONFIG["lightning_stun_seconds"])
                        targets.append(target.id)
                    else:
                        blocked.append(target.id)
        rocket = self.rockets.get(rocket_id) if rocket_id else None
        return {
            "type": "itemUsed",
            "id": player.id,
            "sourceName": player.name,
            "item": item,
            "targetIds": targets,
            "blockedIds": blocked,
            "rocketId": rocket_id,
            "incoming": (
                {
                    "type": "incoming",
                    "targetId": targets[0],
                    "eta": round(max(0.0, rocket["distance"] - player.distance) / rocket["speed"], 2),
                }
                if rocket and targets
                else None
            ),
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
        self.boost_pads.clear()
        self.rockets.clear()
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
            player.used_pad_indices.clear()
            player.stunned_until = 0.0
            player.getup_until = 0.0
            player.stun_immunity_until = 0.0
            player.magnet_charges = 0
            player.perfect_pads = 0
            player.pads_hit = 0
        await self.send_to_all(self.lobby_payload())
