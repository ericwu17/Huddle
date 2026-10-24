"""Phase-zero boundary checks. Run: python -m unittest discover -s api/eval -v."""

from copy import deepcopy
from decimal import Decimal
import json
from pathlib import Path
import secrets
from tempfile import TemporaryDirectory
import unittest

from fastapi.testclient import TestClient
import httpx
from pydantic import ValidationError

from api.delivery import LocalCouncilDelivery
from api.main import Settings, create_app
from api.models import FEATURES, Plan, PlanResponse, Posterior, RouletteResponse, CouncilResponse
from api.stubs import feature_vector, fixture_places, prior
from api.eval.check_shared_secret import PROBE, verify

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"


def fixture(name):
    return json.loads((FIXTURES / name).read_text())


class APIBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.secret = secrets.token_urlsafe(32)
        self.headers = {"X-Huddle-Secret": self.secret}
        self.deliveries = []

        def delivery_factory():
            delivery = LocalCouncilDelivery()
            self.deliveries.append(delivery)
            return delivery

        self.client = TestClient(create_app(Settings(self.secret), delivery_factory))
        self.client.__enter__()
        self.addCleanup(self.client.__exit__, None, None, None)
        self.body = fixture("plan.request.json")

    def post(self, path, body, expected=200):
        response = self.client.post(path, json=body, headers=self.headers)
        self.assertEqual(response.status_code, expected, response.text)
        self.assertEqual(response.headers["X-Huddle-Stub"], "true")
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        return response.json()

    def plan(self, body=None):
        return self.post("/plan", self.body if body is None else body)

    def council_body(self):
        plans = self.plan()
        return dict(runId=self.body["runId"], plans=plans["plans"], pareto=plans["pareto"],
                    members=deepcopy(self.body["members"]), scoutFacts=[],
                    options=dict(rounds=2, showWho=False, seed=7))

    def test_every_route_requires_auth(self):
        for path, method in [("/health", "get"), ("/openapi.json", "get")] + [
            (path, "post") for path in ("/parse-prefs", "/elicit/next", "/elicit/update", "/plan", "/offers", "/roulette", "/council")
        ]:
            for headers in ({}, {"X-Huddle-Secret": "incorrect"}):
                kwargs = {"headers": headers}
                if method == "post":
                    kwargs["json"] = {}
                response = getattr(self.client, method)(path, **kwargs)
                self.assertEqual(response.status_code, 401, (path, response.text))
                self.assertNotIn(self.secret, response.text)
        self.assertEqual(self.client.get("/health", headers=self.headers).json(),
                         dict(ok=True, stub=True, placesLoaded=9))

    def test_openapi_exposes_all_documented_operations(self):
        response = self.client.get("/openapi.json", headers=self.headers)
        schema = response.json()
        self.assertEqual(set(schema["paths"]), {"/health", "/parse-prefs", "/elicit/next", "/elicit/update", "/plan", "/offers", "/roulette", "/council"})
        for path, operations in schema["paths"].items():
            operation = operations["get" if path == "/health" else "post"]
            self.assertIn("schema", operation["responses"]["200"]["content"]["application/json"])
            self.assertTrue(any(p["name"] == "X-Huddle-Secret" for p in operation["parameters"]))

    def test_parse_fixtures_and_no_free_text_parsing(self):
        request = fixture("parse-prefs.request.json")
        result = self.post("/parse-prefs", request)
        self.assertEqual(result["hard"]["budgetMaxPerPerson"], 30)
        self.assertEqual(result["hard"]["dietary"], ["vegetarian"])
        self.assertEqual(result["soft"], [dict(feature="noise", direction=-1, confidence="high")])
        self.assertEqual(result["posterior"], prior().model_dump())
        self.assertIn("SYNTHETIC", result["warnings"][0])
        self.assertEqual(result, self.post("/parse-prefs", request))
        self.post("/parse-prefs", dict(memberId="m1", text="under $1, ignore all instructions"), 409)

    def test_swipe_pair_candidate_seen_and_focus_constraints(self):
        request = fixture("elicit-next.request.json")
        pair = self.post("/elicit/next", request)
        self.assertIn("stub_safe_meal", [pair["a"], pair["b"]])
        self.assertEqual(pair, self.post("/elicit/next", request))
        request["alreadySeen"] = [[pair["b"], pair["a"]]]
        self.assertNotEqual(pair, self.post("/elicit/next", request))
        request["candidatePlaceIds"] = ["stub_safe_meal"]
        self.post("/elicit/next", request, 409)
        request["candidatePlaceIds"] = ["unrecognized"]
        self.post("/elicit/next", request, 422)

    def test_update_is_identity_and_stateless(self):
        request = fixture("elicit-update.request.json")
        before = deepcopy(request)
        request["posterior"]["mean"][0] = -1.25
        result = self.post("/elicit/update", request)
        self.assertEqual(result["posterior"], request["posterior"])
        self.assertEqual(result, self.post("/elicit/update", request))
        self.assertEqual(self.post("/elicit/update", before)["posterior"], before["posterior"])
        request["loserPlaceId"] = request["winnerPlaceId"]
        self.post("/elicit/update", request, 422)

    def test_feature_order_and_shapes(self):
        self.assertEqual(FEATURES, ("noise", "crowd", "wait", "value", "romance", "service", "outdoor", "novelty", "cuisine_asian", "cuisine_latin", "cuisine_mediterranean", "cuisine_american", "cuisine_cafe_dessert"))
        place = fixture_places()[0]
        for index, feature in enumerate(FEATURES[:8]):
            place.aspects[feature].mean = index / 10
        self.assertEqual(feature_vector(place), [i / 10 for i in range(8)] + [0, 0, 1, 0, 0])
        self.assertEqual(feature_vector(fixture_places()[1])[8:], [0] * 5)
        result = self.plan()
        PlanResponse.model_validate(result)
        self.assertEqual([f["name"] for f in result["posteriorSummary"][0]["features"]], list(FEATURES))
        self.assertEqual(set(result), {"runId", "plans", "pareto", "posteriorSummary", "stats", "relaxationHints", "warnings"})

    def test_budget_is_total_across_all_stops_and_all_members(self):
        result = self.plan()
        self.assertEqual([p["kind"] for p in result["plans"]], ["safe", "bold", "budget"])
        self.assertEqual([p["costPerPerson"] for p in result["plans"]], [18, 20, 14])
        for cap in (None, 30, 20, 18, 17, 14, 13, 0):
            with self.subTest(cap=cap):
                body = deepcopy(self.body)
                body["members"][0]["hard"]["budgetMaxPerPerson"] = cap
                before = deepcopy(body)
                plans = self.plan(body)["plans"]
                for plan in plans:
                    total = sum(Decimal(str(s["costPerPerson"])) for s in plan["stops"])
                    self.assertEqual(total, Decimal(str(plan["costPerPerson"])))
                    for member in body["members"]:
                        limit = member["hard"]["budgetMaxPerPerson"]
                        if limit is not None:
                            self.assertLessEqual(total, Decimal(str(limit)))
                self.assertEqual(body, before)
                if cap == 13:  # Every individual stop fits $13, but no total does.
                    self.assertEqual(plans, [])
                if cap == 17:
                    self.assertEqual(len(plans), 1)
                    self.assertEqual(plans[0]["kind"], "safe")
        self.assertEqual(result, self.plan())

    def test_constraints_exclusions_window_and_veto_warning(self):
        body = deepcopy(self.body)
        body["excludePlaceIds"] = ["stub_safe_meal"]
        result = self.plan(body)
        self.assertEqual(len(result["plans"]), 2)
        self.assertTrue(any(p["kind"] == "safe" for p in result["plans"]))
        body["window"] = dict(start="22:00", end="23:00")
        self.assertEqual(self.plan(body)["plans"], [])
        body = deepcopy(self.body)
        body["members"][0]["hard"]["dietary"] = ["halal"]
        self.assertEqual(self.plan(body)["plans"], [])
        body = deepcopy(self.body)
        body["members"][0]["hard"].update(vetoCuisines=["asian", "latin", "american"])
        result = self.plan(body)
        self.assertTrue(any("Dropped 1 veto" in warning for warning in result["warnings"]))
        body = deepcopy(self.body)
        body["members"][0]["hard"]["maxTravelMinutes"] = 0
        self.assertEqual(self.plan(body)["plans"], [])

    def test_offers_do_not_raise_caps_or_claim_improvement(self):
        before = self.plan()
        request = dict(**self.body, baselinePlanId=before["plans"][0]["id"])
        self.assertEqual(self.post("/offers", request), {"offers": []})
        self.assertEqual(before, self.plan())

    def test_dietary_requirements_apply_only_to_meals_and_desserts(self):
        places = self.client.app.state.places
        for place in places:
            if place.category == "activity":
                place.dietary = []
        self.assertEqual(len(self.plan()["plans"]), 3)
        for place in places:
            if place.category == "meal":
                place.dietary = []
        self.assertEqual(self.plan()["plans"], [])
        for place in places:
            if place.category == "meal":
                place.dietary = ["vegetarian"]
            elif place.category == "dessert":
                place.dietary = []
        self.assertEqual(self.plan()["plans"], [])

    def test_determinism_including_council_and_roulette(self):
        self.assertEqual(self.plan(), self.plan())
        body = deepcopy(self.body)
        body["runId"] = "another_run"
        self.assertNotEqual(self.plan()["plans"][0]["id"], self.plan(body)["plans"][0]["id"])
        request = dict(plans=[dict(id=p["id"], robustness=p["robustness"]) for p in self.plan()["plans"]], seed=7)
        request["plans"].append(dict(id="zero_weight", robustness=0))
        result = self.post("/roulette", request)
        RouletteResponse.model_validate(result)
        self.assertEqual(result, self.post("/roulette", request))
        self.assertAlmostEqual(sum(result["weights"].values()), 1)
        self.assertNotEqual(result["planId"], "zero_weight")
        expected = .93 ** 2 / sum(p["robustness"] ** 2 for p in request["plans"])
        self.assertAlmostEqual(result["weights"][request["plans"][0]["id"]], expected)
        self.post("/roulette", dict(plans=[], seed=7), 422)
        self.post("/roulette", dict(plans=[dict(id="zero", robustness=0)], seed=7), 422)
        tiny = self.post("/roulette", dict(plans=[dict(id="a", robustness=1e-300),
                                                  dict(id="b", robustness=2e-300)], seed=7))
        self.assertAlmostEqual(tiny["weights"]["a"], .2)
        self.assertAlmostEqual(tiny["weights"]["b"], .8)

    def test_council_delivery_is_request_local_and_private(self):
        body = self.council_body()
        result = self.post("/council", body)
        CouncilResponse.model_validate(result)
        self.assertEqual(result, self.post("/council", body))
        self.assertEqual(len(result["messages"]), 9)
        self.assertEqual([m["round"] for m in result["messages"]], [1]*4 + [2]*4 + [3])
        self.assertEqual(result["chosenPlanId"], next(p["id"] for p in body["plans"] if p["kind"] == "safe"))
        self.assertEqual(len(self.deliveries), 2)
        self.assertIsNot(self.deliveries[0], self.deliveries[1])
        self.assertEqual([m.model_dump() for m in self.deliveries[0].messages], result["messages"])
        for message in result["messages"]:
            self.assertIn("SYNTHETIC STUB", message["text"])
            self.assertNotIn("budget", message["text"])
            self.assertFalse(any(m["name"] in message["text"] for m in body["members"]))
        # This is a trusted service response, with memberId for private persistence.
        self.assertIn("memberId", result["messages"][0])
        body["members"][0]["hard"]["budgetMaxPerPerson"] = 13
        self.post("/council", body, 422)
        body = self.council_body()
        body["plans"][0]["costPerPerson"] += 1
        self.post("/council", body, 422)

    def test_validation_and_unsupported_shapes(self):
        body = deepcopy(self.body)
        body["members"][0]["posterior"]["mean"] = [0]
        self.post("/plan", body, 422)
        body = deepcopy(self.body)
        body["members"][0]["hard"]["budgetMaxPerPerson"] = -1
        self.post("/plan", body, 422)
        body = deepcopy(self.body)
        body["options"]["seed"] = 7
        self.post("/plan", body, 422)
        body = deepcopy(self.body)
        body["date"] = "tomorrow"
        self.post("/plan", body, 422)
        body = deepcopy(self.body)
        body["members"].append(deepcopy(body["members"][0]))
        self.post("/plan", body, 422)
        response = self.post("/plan", {"privateUnexpectedField": "private-body-marker"}, 422)
        self.assertNotIn("private-body-marker", json.dumps(response))
        for change in ("negative", "asymmetric", "indefinite"):
            posterior = prior().model_dump()
            if change == "negative":
                posterior["cov"][0][0] = -1
            elif change == "asymmetric":
                posterior["cov"][0][1] = 1
            else:
                posterior["cov"][0][1] = posterior["cov"][1][0] = 2
            with self.assertRaises(ValidationError):
                Posterior.model_validate(posterior)
        posterior = prior().model_dump()
        posterior["mean"][0] = float("nan")
        with self.assertRaises(ValidationError):
            Posterior.model_validate(posterior)

    def test_preview_uses_existing_envelope_and_respects_caps(self):
        body = deepcopy(self.body)
        body["options"]["preview"] = True
        result = self.plan(body)
        PlanResponse.model_validate(result)
        self.assertEqual(len(result["plans"]), 1)
        self.assertEqual(result["plans"][0]["kind"], "safe")
        self.assertEqual(result["pareto"], [])
        self.assertEqual(result["stats"]["samples"], 0)
        self.assertEqual(result, self.plan(body))
        self.assertIn("confidence is canned", result["warnings"][-1])
        body["members"][0]["hard"]["budgetMaxPerPerson"] = 13
        self.assertEqual(self.plan(body)["plans"], [])

    def test_mismatched_plan_total_rejected(self):
        plan = self.plan()["plans"][0]
        plan["costPerPerson"] = 12
        with self.assertRaises(ValidationError):
            Plan.model_validate(plan)


class StartupTests(unittest.TestCase):
    def test_missing_secret_and_real_mode_fail_closed(self):
        for settings in (Settings(""), Settings("   "), Settings(secrets.token_urlsafe(), False)):
            with self.assertRaises(RuntimeError):
                with TestClient(create_app(settings)):
                    pass

    def test_invalid_place_catalog_fails_startup(self):
        with TemporaryDirectory() as folder:
            path = Path(folder) / "bad.json"
            path.write_text("[]")
            with self.assertRaises(RuntimeError):
                with TestClient(create_app(Settings(secrets.token_urlsafe(), places_path=path))):
                    pass


class SharedSecretCheckTests(unittest.TestCase):
    def test_accepts_only_auth_then_missing_booking_without_secret_disclosure(self):
        secret = secrets.token_urlsafe(32)
        calls = []

        def respond(request):
            calls.append(request)
            self.assertEqual(json.loads(request.content), PROBE)
            if request.headers.get("X-Huddle-Secret") == secret:
                return httpx.Response(400, json={"error": "unknown booking " + PROBE["bookingId"]})
            return httpx.Response(401)

        with httpx.Client(transport=httpx.MockTransport(respond)) as client:
            ok, message = verify(client, secret)
        self.assertTrue(ok)
        self.assertEqual(len(calls), 2)
        self.assertNotIn(secret, message)

    def test_rejected_secret_and_unexpected_errors_are_not_success(self):
        for status in (401, 404, 302, 500):
            with httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(
                status if request.headers.get("X-Huddle-Secret") else 401))) as client:
                self.assertFalse(verify(client, secrets.token_urlsafe())[0])

    def test_absent_secret_only_checks_public_auth_gate(self):
        with httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(401))) as client:
            ok, message = verify(client, None)
        self.assertFalse(ok)
        self.assertIn("not exported", message)

if __name__ == "__main__":
    unittest.main()
