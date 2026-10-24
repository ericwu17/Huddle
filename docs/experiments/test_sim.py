"""Regression checks for evaluation feasibility and fail-closed API scoring."""

import copy
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

import numpy as np

import sim


class EvaluationTests(unittest.TestCase):
    def setUp(self):
        self.places = [
            dict(id=pid, category=category, cuisine=cuisine, costPerPerson=cost,
                 dwellMinutes=dwell, lat=0.0, lng=0.0, dietary=["vegetarian"] if category != "activity" else [],
                 hours={"sat": [["17:00", "23:00"]]},
                 aspects={a: {"mean": 0.5, "sd": 0.25} for a in sim.ASPECTS})
            for pid, category, cuisine, cost, dwell in [
                ("m", "meal", "american", 20, 75),
                ("a", "activity", None, 15, 75),
                ("d", "dessert", "cafe_dessert", 5, 30)]
        ]
        self.hard = dict(vetoCuisines=[], vetoCategories=[], dietary=[],
                         budgetMaxPerPerson=40, maxTravelMinutes=None)
        self.group = dict(hard=[copy.deepcopy(self.hard)], origins=[(0.0, 0.0)])
        self.request = dict(runId="test", window={"start": "17:00", "end": "23:00"}, excludePlaceIds=[])
        self.plan = dict(id="safe", kind="safe", costPerPerson=40, robustness=0.8, stops=[
            dict(placeId=p["id"], category=p["category"], lat=0.0, lng=0.0,
                 costPerPerson=p["costPerPerson"], start=start, end=end)
            for p, start, end in zip(self.places, ["17:00", "18:30", "20:00"], ["18:15", "19:45", "20:30"])
        ])

    def feasible(self, costs, caps):
        group = dict(hard=[dict(self.hard, budgetMaxPerPerson=cap) for cap in caps],
                     origins=[(0.0, 0.0)] * len(caps))
        plans = {("activity", "meal"): (np.array([[1, 0]]), [[1020, 1110]])}
        return sim.feasible_plans(group, plans, np.ones(3, dtype=bool),
                                  np.zeros(3), np.zeros(3), np.array(costs))[("activity", "meal")]

    def test_combined_cost_exceeds_budget_even_if_each_stop_fits(self):
        self.assertEqual(len(self.feasible([20, 15, 5], [30])), 0)

    def test_every_member_budget_and_exact_boundary(self):
        self.assertEqual(len(self.feasible([20, 15, 5], [None, 40, 34])), 0)
        self.assertEqual(len(self.feasible([20, 15, 5], [None, 35])), 1)

    def test_zero_budget_is_real_and_null_is_unbounded(self):
        self.assertEqual(len(self.feasible([20, 15, 5], [0])), 0)
        self.assertEqual(len(self.feasible([0, 0, 0], [0])), 1)
        self.assertEqual(len(self.feasible([20, 15, 5], [None])), 1)

    def test_decimal_cost_boundary(self):
        self.assertEqual(len(self.feasible([0.1, 0.2, 0], [0.3])), 1)

    def test_valid_plan_and_vegetarian_activity_without_tags(self):
        self.group["hard"][0]["dietary"] = ["vegetarian"]
        self.assertEqual(sim.validate_plan(self.plan, self.places, self.group, self.request), [0, 1, 2])

    def test_catalog_cost_and_total_are_independently_checked(self):
        for change in ("stop", "total"):
            with self.subTest(change=change):
                plan = copy.deepcopy(self.plan)
                if change == "stop":
                    plan["stops"][0]["costPerPerson"] = 0
                    plan["costPerPerson"] = 20
                else:
                    plan["costPerPerson"] = 39
                with self.assertRaises(ValueError):
                    sim.validate_plan(plan, self.places, self.group, self.request)

    def test_returned_plan_cumulative_budget(self):
        self.group["hard"].append(dict(self.hard, budgetMaxPerPerson=39))
        self.group["origins"].append((0.0, 0.0))
        with self.assertRaisesRegex(ValueError, "cumulative budget"):
            sim.validate_plan(self.plan, self.places, self.group, self.request)

    def test_veto_dietary_and_excluded_places(self):
        for hard, exclusions in [(dict(vetoCuisines=["american"]), []),
                                  (dict(dietary=["vegan"]), []), ({}, ["a"])]:
            with self.subTest(hard=hard, exclusions=exclusions):
                group = copy.deepcopy(self.group)
                group["hard"][0].update(hard)
                with self.assertRaises(ValueError):
                    sim.validate_plan(self.plan, self.places, group, dict(self.request, excludePlaceIds=exclusions))

    def test_template_unknown_and_repeated_ids(self):
        for ids in [["a", "m", "d"], ["unknown", "a", "d"], ["m", "a", "m"]]:
            with self.subTest(ids=ids):
                plan = copy.deepcopy(self.plan)
                for stop, pid in zip(plan["stops"], ids):
                    stop["placeId"] = pid
                with self.assertRaises(ValueError):
                    sim.validate_plan(plan, self.places, self.group, self.request)

    def test_time_grid_dwell_window_and_malformed_time(self):
        for start, end in [("17:01", "18:16"), ("17:00", "17:15"),
                           ("16:00", "17:15"), ("bad", "18:15")]:
            with self.subTest(start=start, end=end):
                plan = copy.deepcopy(self.plan)
                plan["stops"][0].update(start=start, end=end)
                with self.assertRaises(ValueError):
                    sim.validate_plan(plan, self.places, self.group, self.request)

    def test_full_dwell_must_fit_opening_hours(self):
        self.places[0]["hours"]["sat"] = [["17:00", "18:00"]]
        with self.assertRaisesRegex(ValueError, "closed"):
            sim.validate_plan(self.plan, self.places, self.group, self.request)

    def test_between_stop_and_first_leg_travel(self):
        places = copy.deepcopy(self.places)
        plan = copy.deepcopy(self.plan)
        places[1]["lng"] = plan["stops"][1]["lng"] = 1.0
        with self.assertRaisesRegex(ValueError, "travel time"):
            sim.validate_plan(plan, places, self.group, self.request)
        self.group["origins"] = [(1.0, 1.0)]
        self.group["hard"][0]["maxTravelMinutes"] = 1
        with self.assertRaisesRegex(ValueError, "travel cap"):
            sim.validate_plan(self.plan, self.places, self.group, self.request)

    def test_coordinates_category_and_nonfinite_values(self):
        for field, value in [("lat", 1.0), ("lng", float("nan")), ("category", "activity"),
                              ("costPerPerson", True)]:
            with self.subTest(field=field):
                plan = copy.deepcopy(self.plan)
                plan["stops"][0][field] = value
                with self.assertRaises(ValueError):
                    sim.validate_plan(plan, self.places, self.group, self.request)

    def test_all_returned_plans_validated_before_scoring(self):
        response = dict(runId="test", plans=[self.plan])
        ratios, err = sim.ours_ratios(response, self.places, np.ones((1, 3)), np.ones(1), self.group, self.request)
        np.testing.assert_array_equal(ratios, [1.0])
        self.assertIsNone(err)
        bold = copy.deepcopy(self.plan)
        bold.update(id="bold", kind="bold", costPerPerson=1)
        response["plans"].append(bold)
        ratios, err = sim.ours_ratios(response, self.places, np.ones((1, 3)), np.ones(1), self.group, self.request)
        self.assertIsNone(ratios)
        self.assertIn("total", err)

    def test_missing_safe_wrong_run_and_bad_ratios_are_not_scored(self):
        for mode in ("no-safe", "run", "ratio"):
            with self.subTest(mode=mode):
                response = dict(runId="test", plans=[copy.deepcopy(self.plan)])
                if mode == "no-safe":
                    response["plans"][0]["kind"] = "bold"
                if mode == "run":
                    response["runId"] = "wrong"
                ratios, err = sim.ours_ratios(response, self.places, np.ones((1, 3)),
                                              np.array([0.5 if mode == "ratio" else 1.0]), self.group, self.request)
                self.assertIsNone(ratios)
                self.assertIsNotNone(err)

    def test_nonstub_health_and_catalog_match_required(self):
        for health in [dict(ok=True, stub=True, placesLoaded=3),
                       dict(ok=True, placesLoaded=3), dict(ok=True, stub=False, placesLoaded=45)]:
            with self.subTest(health=health), patch.object(sim.Api, "request", return_value=health):
                api, reason = sim.real_api("http://localhost", "private-test", 3)
                self.assertIsNone(api)
                self.assertIsNotNone(reason)
        with patch.object(sim.Api, "request", return_value=dict(ok=True, stub=False, placesLoaded=3)):
            self.assertIsNotNone(sim.real_api("http://localhost", "private-test", 3)[0])

    def test_stub_header_rejected_on_every_response(self):
        response = MagicMock()
        response.headers = {"X-Huddle-Stub": "true"}
        response.read.return_value = b'{"plans": []}'
        response.__enter__.return_value = response
        with patch.object(sim.urllib.request, "urlopen", return_value=response):
            with self.assertRaisesRegex(ValueError, "synthetic"):
                sim.Api("http://localhost", "private-test").post("/plan", {})

    def test_zero_observed_failures_have_nonzero_interval(self):
        mean, lo, hi = sim.proportion_ci([0] * 1000)
        self.assertEqual(mean, 0)
        self.assertAlmostEqual(lo, 0)
        self.assertGreater(hi, 0)

    def test_flat_category_warning_tracks_changed_features(self):
        X = np.ones((3, sim.K))
        places = self.places + [dict(self.places[2], id="d2")]
        X = np.vstack([X, X[2]])
        self.assertIn("dessert", sim.flat_categories(places, X))
        X[3, 0] = 0.0
        self.assertNotIn("dessert", sim.flat_categories(places, X))

    def test_api_failures_reported_in_coverage(self):
        api = SimpleNamespace(post=lambda path, body: dict(runId=body["runId"], plans=[]))
        X = np.array([[0.5] * 8 + [0, 0, 0, 1, 0],
                      [0.5] * 8 + [0, 0, 0, 0, 0], [0.5] * 8 + [0, 0, 0, 0, 1]])
        rows, notes, meta = sim.run_experiment_a(SimpleNamespace(groups=5, ours_groups=2), self.places, X, api, np.random.default_rng(7))
        self.assertEqual((meta["oursAttempted"], meta["oursScored"]), (2, 0))
        self.assertEqual(meta["oursErrors"], {"no plans returned": 2})
        self.assertFalse(any(r["method"] == "ours" for r in rows))
        self.assertEqual(meta["budgetViolations"], 0)
        costs = {p["id"]: p["costPerPerson"] for p in self.places}
        for row in rows:
            self.assertEqual(row["costPerPerson"], sum(costs[pid] for pid in json.loads(row["stopPlaceIds"])))

    def test_default_cli_never_reads_api_config_or_calls_it(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(sim.sys, "argv", ["sim.py", "--groups", "2", "--out", str(root / "results"), "--readme", str(root / "README.md")]), \
                 patch.object(sim, "load_env", side_effect=AssertionError("API config must stay untouched")), \
                 patch.object(sim, "make_chart", return_value=False):
                sim.main()
            result = json.loads((root / "results" / "summary.json").read_text())
            self.assertEqual(result["A"]["oursAttempted"], 0)
            self.assertEqual(result["A"]["budgetViolations"], 0)

    def test_explicit_api_run_fails_closed_when_not_ready(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(sim.sys, "argv", ["sim.py", "--with-api", "--groups", "2", "--b-users", "0", "--out", str(root / "results"), "--readme", str(root / "README.md")]), \
                 patch.object(sim, "load_env", return_value=(None, None)), \
                 patch.object(sim, "make_chart", return_value=False), \
                 patch.object(sim.Api, "request", side_effect=AssertionError("No configured service")):
                self.assertEqual(sim.main(), 1)
            result = json.loads((root / "results" / "summary.json").read_text())
            self.assertEqual(result["A"]["oursScored"], 0)


if __name__ == "__main__":
    unittest.main()
