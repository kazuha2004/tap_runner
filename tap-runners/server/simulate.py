"""Run quick offline pacing trials for the authoritative race model."""

from __future__ import annotations

import argparse
import random
from unittest.mock import patch

import game
from game import GameRoom, RACE_CONFIG


STRATEGIES = ("masher", "steady", "random")


def run_trial(seed: int, distance: int) -> dict[str, float]:
    room = GameRoom(f"SIM{seed % 1000:03d}")
    room.race_distance = distance
    room.status = "lobby"
    room.started_at = 100.0
    room.race_seed = seed
    room.item_boxes = room._generate_item_boxes(seed ^ 0x5A17, distance)
    room.boost_pads = room._generate_boost_pads(seed ^ 0x4193, distance)
    room._item_random.seed(seed ^ 0xD1B54A35)
    strategies = ("masher", "steady", "random")
    for index, strategy in enumerate(strategies):
        room.add_player(strategy, strategy.title(), object())
    room.status = "racing"

    generator = random.Random(seed)
    next_tap = {
        "masher": 100.0,
        "steady": 100.0,
        "random": 100.0,
    }
    finish_times: dict[str, float] = {}
    last_item_use = {name: 0.0 for name in strategies}
    clock = [100.0]

    with patch("game.time.monotonic", side_effect=lambda: clock[0]):
        tick = 1 / RACE_CONFIG["tick_rate"]
        while len(finish_times) < len(strategies) and clock[0] - 100.0 < 180.0:
            now = clock[0]
            for name in strategies:
                player = room.players[name]
                if player.finish_place:
                    continue
                interval = {
                    "masher": 0.085,
                    "steady": 0.14,
                    "random": generator.uniform(0.07, 0.25),
                }[name]
                if now >= next_tap[name]:
                    room.tap(name)
                    next_tap[name] += interval
                room._update_heat(player, tick, now)
                player.speed = max(0.0, player.speed - player.speed * RACE_CONFIG["drag"] * tick)
                leader_distance = max(runner.distance for runner in room.players.values())
                speed = room._effective_speed(player, leader_distance, now)
                old_distance = player.distance
                new_distance = old_distance + speed * tick
                room._pickup_item_boxes(player, old_distance, new_distance, now)
                room._hit_boost_pads(player, old_distance, new_distance, now)
                rocket_has_target = player.item != "ROCKET" or any(
                    runner.id != player.id
                    and runner.id not in room.finish_order
                    and runner.distance > player.distance
                    for runner in room.players.values()
                )
                if (
                    player.item
                    and rocket_has_target
                    and now >= player.overheated_until
                    and now - last_item_use[name] > 0.1
                ):
                    room.use_item(name)
                    last_item_use[name] = now
                player.distance = min(float(distance), new_distance)
                player.top_speed = max(player.top_speed, speed)
                if player.distance >= distance:
                    player.finish_place = len(finish_times) + 1
                    finish_times[name] = now - 100.0
            room._advance_rockets(tick, now)
            clock[0] += tick
    return finish_times


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--races", type=int, default=20)
    parser.add_argument("--distance", type=int, default=200, choices=(100, 200, 400, 800))
    args = parser.parse_args()
    if args.races < 1:
        parser.error("--races must be at least 1")

    totals = {strategy: [] for strategy in STRATEGIES}
    for seed in range(args.races):
        for strategy, finish_time in run_trial(seed + 1, args.distance).items():
            totals[strategy].append(finish_time)

    print(f"Average finish times over {args.races} {args.distance}m races:")
    for strategy in STRATEGIES:
        times = totals[strategy]
        average = sum(times) / len(times) if times else float("inf")
        print(f"  {strategy:7s} {average:6.2f}s ({len(times)}/{args.races} finished)")


if __name__ == "__main__":
    main()
