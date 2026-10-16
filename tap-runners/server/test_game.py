import unittest
from unittest.mock import patch

from game import GameRoom, Player, RACE_CONFIG
from simulate import run_trial


class HeatSystemTests(unittest.TestCase):
    def setUp(self):
        self.room = GameRoom("TEST")
        self.player = self.room.add_player("runner", "Runner", object())
        self.room.status = "racing"

    def test_accepted_tap_adds_heat_and_sweet_zone_multiplier(self):
        self.player.heat = 40
        self.player.speed = 0
        self.player.accepted_taps[:] = [9.85, 10.0, 10.15, 10.30]
        with patch("game.time.monotonic", return_value=10.45):
            self.assertTrue(self.room.tap(self.player.id))
        self.assertAlmostEqual(self.player.heat, 40 + RACE_CONFIG["heat_per_tap"])
        self.assertAlmostEqual(
            self.player.speed,
            RACE_CONFIG["tap_boost"] * RACE_CONFIG["tap_multiplier_cap"],
        )

    def test_overheat_blocks_taps_and_recovers_to_configured_heat(self):
        self.player.heat = 94
        self.player.speed = 5
        with patch("game.time.monotonic", return_value=20.0):
            self.assertTrue(self.room.tap(self.player.id))
            self.assertEqual(self.player.heat, RACE_CONFIG["heat_overheat_threshold"])
            self.assertEqual(self.player.times_overheated, 1)
            self.assertEqual(self.player.speed, 5 + RACE_CONFIG["tap_boost"])
            self.assertFalse(self.room.tap(self.player.id))
            self.room._update_heat(self.player, 0.0, 21.5)
            self.assertEqual(self.player.heat, RACE_CONFIG["heat_overheat_reset"])
            self.assertEqual(self.player.overheated_until, 0.0)

    def test_heat_cools_and_final_sprint_prevents_new_overheat(self):
        self.player.heat = 60
        self.room._update_heat(self.player, 0.5, 5.0)
        self.assertEqual(self.player.heat, 60 - RACE_CONFIG["heat_cool_per_second"] * 0.5)

        self.player.distance = self.room.race_distance - RACE_CONFIG["final_sprint_distance"]
        self.player.heat = 99
        with patch("game.time.monotonic", return_value=6.0):
            self.assertTrue(self.room.tap(self.player.id))
        self.assertEqual(self.player.heat, 99)
        self.assertEqual(self.player.times_overheated, 0)
        self.assertEqual(self.player.speed, RACE_CONFIG["tap_boost"] * RACE_CONFIG["final_sprint_tap_multiplier"])

    def test_final_sprint_cancels_existing_overheat(self):
        self.player.distance = self.room.race_distance - 10
        self.player.heat = 100
        self.player.overheated_until = 90
        with patch("game.time.monotonic", return_value=20.0):
            self.assertTrue(self.room.tap(self.player.id))
        self.assertEqual(self.player.overheated_until, 0.0)
        self.assertEqual(self.player.times_overheated, 0)

    def test_state_contains_heat_zone_and_overheated_flag(self):
        self.player.heat = 55
        self.room.started_at = 1.0
        with patch("game.time.monotonic", return_value=10.0):
            payload = self.room.state_payload()
        runner = payload["players"][self.player.id]
        self.assertEqual(runner["heat"], 55)
        self.assertEqual(runner["zone"], "sweet")
        self.assertFalse(runner["overheated"])

    def test_item_boxes_are_seeded_and_weighted_generation_is_authoritative(self):
        first = GameRoom._generate_item_boxes(771, 400)
        self.assertEqual(first, GameRoom._generate_item_boxes(771, 400))
        self.assertEqual(len(first), 8 * RACE_CONFIG["item_boxes_per_lane_per_400m"])
        self.assertTrue(all(box["distance"] < 400 * RACE_CONFIG["item_box_first_half_bias"] for box in first))
        allowed_items = {"BOOST", "SHIELD", "ROCKET"}
        for position in ("leader", "middle", "last"):
            self.assertEqual(set(RACE_CONFIG[f"item_weights_{position}"]), allowed_items)

    def test_item_use_is_one_shot_and_boost_applies_effect(self):
        self.room.status = "racing"
        self.player.item = "BOOST"
        self.player.speed = 10
        with patch("game.time.monotonic", return_value=30.0):
            event = self.room.use_item(self.player.id)
            self.assertEqual(event["item"], "BOOST")
            self.assertEqual(event["targetIds"], [])
            self.assertEqual(self.player.items_used, 1)
            self.assertIn("BOOST", self.player.active_effects)
            self.assertEqual(self.room._effective_speed(self.player, 10.0, 30.0), 14.0)
            with self.assertRaisesRegex(ValueError, "don't have an item"):
                self.room.use_item(self.player.id)
        self.assertEqual(self.player.items_used, 1)

    def test_item_box_pickup_is_per_runner_and_one_shot(self):
        self.room.item_boxes = [{"index": 7, "lane": self.player.lane, "distance": 22.0}]
        events = self.room._pickup_item_boxes(self.player, 21.0, 22.1, 50.0)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["type"], "itemPickedUp")
        self.assertEqual(events[0]["boxIndex"], 7)
        self.assertIsNotNone(self.player.item)
        self.assertEqual(self.room._pickup_item_boxes(self.player, 21.0, 22.1, 50.1), [])

    def test_rocket_hits_nearest_runner_ahead_and_shield_blocks_it(self):
        self.room.status = "lobby"
        nearest = self.room.add_player("nearest", "Nearest", object())
        farther = self.room.add_player("farther", "Farther", object())
        self.room.status = "racing"
        self.player.distance = 10
        nearest.distance = 20
        farther.distance = 30
        self.player.item = "ROCKET"
        with patch("game.time.monotonic", return_value=40.0):
            event = self.room.use_item(self.player.id)
        self.assertEqual(event["targetIds"], [nearest.id])
        self.assertIn("ROCKET", nearest.active_effects)
        self.assertNotIn("ROCKET", farther.active_effects)

        nearest.active_effects.pop("ROCKET")
        nearest.active_effects["SHIELD"] = (100.0, 1.0)
        self.player.item = "ROCKET"
        with patch("game.time.monotonic", return_value=41.0):
            blocked_event = self.room.use_item(self.player.id)
        self.assertEqual(blocked_event["targetIds"], [])
        self.assertNotIn("SHIELD", nearest.active_effects)
        self.assertNotIn("ROCKET", nearest.active_effects)

    def test_rocket_is_not_consumed_without_a_runner_ahead(self):
        self.room.status = "racing"
        self.player.item = "ROCKET"
        with patch("game.time.monotonic", return_value=50.0):
            with self.assertRaisesRegex(ValueError, "no runner ahead"):
                self.room.use_item(self.player.id)
        self.assertEqual(self.player.item, "ROCKET")
        self.assertEqual(self.player.items_used, 0)

    def test_steady_rhythm_beats_mashing_by_at_least_ten_percent(self):
        results = [run_trial(seed, 200) for seed in range(1, 21)]
        masher_average = sum(result["masher"] for result in results) / len(results)
        steady_average = sum(result["steady"] for result in results) / len(results)
        self.assertLessEqual(steady_average, masher_average * 0.9)


if __name__ == "__main__":
    unittest.main()
