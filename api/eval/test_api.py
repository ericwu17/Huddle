"""API boundary checks: auth, schema, roulette, validation, startup. Run: python -m unittest discover -s api/eval -v."""

from copy import deepcopy
import json
from pathlib import Path
import secrets
import os
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
import httpx
from pydantic import TypeAdapter, ValidationError

from api.delivery import LocalCouncilDelivery
from api.main import Settings, create_app
from api.catalog import feature_vector
from api.models import FEATURES, Place, Plan, Posterior, RouletteResponse
from api.parse import prior
from api.eval.check_shared_secret import PROBE, verify

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "api" / "fixtures"
PLACES = TypeAdapter(list[Place]).validate_json((ROOT / "data" / "places.json").read_text())


def fixture(name):
    return json.loads((FIXTURES / name).read_text())


class APIBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.secret = secrets.token_urlsafe(32)
        self.headers = {"X-Huddle-Secret": self.secret}
        self.client = TestClient(create_app(Settings(self.secret), LocalCouncilDelivery))
        self.client.__enter__()
        self.addCleanup(self.client.__exit__, None, None, None)
        self.body = fixture("plan.request.json")

    def post(self, path, body, expected=200):
        response = self.client.post(path, json=body, headers=self.headers)
        self.assertEqual(response.status_code, expected, response.text)
        self.assertNotIn("X-Huddle-Stub", response.headers)
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        return response.json()

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
        response = self.client.get("/health", headers=self.headers)
        self.assertEqual(response.json(), dict(ok=True, stub=False, placesLoaded=len(PLACES)))
        self.assertNotIn("X-Huddle-Stub", response.headers)

    def test_openapi_exposes_all_documented_operations(self):
        response = self.client.get("/openapi.json", headers=self.headers)
        schema = response.json()
        self.assertEqual(set(schema["paths"]), {"/health", "/parse-prefs", "/elicit/next", "/elicit/update", "/plan", "/offers", "/roulette", "/council"})
        for path, operations in schema["paths"].items():
            operation = operations["get" if path == "/health" else "post"]
            self.assertIn("schema", operation["responses"]["200"]["content"]["application/json"])
            self.assertTrue(any(p["name"] == "X-Huddle-Secret" for p in operation["parameters"]))

    def test_feature_order_and_shapes(self):
        self.assertEqual(FEATURES, ("noise", "crowd", "wait", "value", "romance", "service", "outdoor", "novelty", "cuisine_asian", "cuisine_latin", "cuisine_mediterranean", "cuisine_american", "cuisine_cafe_dessert"))
        place = next(p for p in PLACES if p.category == "meal").model_copy(deep=True)
        place.cuisine = "mediterranean"
        for index, feature in enumerate(FEATURES[:8]):
            place.aspects[feature].mean = index / 10
        self.assertEqual(feature_vector(place), [i / 10 for i in range(8)] + [0, 0, 1, 0, 0])
        place.category = "activity"
        self.assertEqual(feature_vector(place)[8:], [0] * 5)

    def test_roulette_is_seeded_and_weighted_by_robustness_squared(self):
        request = dict(plans=[dict(id="safe", robustness=.93), dict(id="bold", robustness=.8),
                              dict(id="budget", robustness=.85), dict(id="zero_weight", robustness=0)], seed=7)
        result = self.post("/roulette", request)
        RouletteResponse.model_validate(result)
        self.assertEqual(result, self.post("/roulette", request))
        self.assertAlmostEqual(sum(result["weights"].values()), 1)
        self.assertNotEqual(result["planId"], "zero_weight")
        expected = .93 ** 2 / sum(p["robustness"] ** 2 for p in request["plans"])
        self.assertAlmostEqual(result["weights"]["safe"], expected)
        self.post("/roulette", dict(plans=[], seed=7), 422)
        self.post("/roulette", dict(plans=[dict(id="zero", robustness=0)], seed=7), 422)
        tiny = self.post("/roulette", dict(plans=[dict(id="a", robustness=1e-300),
                                                  dict(id="b", robustness=2e-300)], seed=7))
        self.assertAlmostEqual(tiny["weights"]["a"], .2)
        self.assertAlmostEqual(tiny["weights"]["b"], .8)

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
            posterior = prior([]).model_dump()
            if change == "negative":
                posterior["cov"][0][0] = -1
            elif change == "asymmetric":
                posterior["cov"][0][1] = 1
            else:
                posterior["cov"][0][1] = posterior["cov"][1][0] = 2
            with self.assertRaises(ValidationError):
                Posterior.model_validate(posterior)
        posterior = prior([]).model_dump()
        posterior["mean"][0] = float("nan")
        with self.assertRaises(ValidationError):
            Posterior.model_validate(posterior)

    def test_mismatched_plan_total_rejected(self):
        stops = [dict(placeId=p.id, name=p.name, category=p.category, start=start, end=end,
                      lat=p.lat, lng=p.lng, costPerPerson=p.costPerPerson)
                 for p, start, end in zip(PLACES[:2], ("17:00", "19:00"), ("18:00", "20:00"))]
        plan = dict(id="p1", kind="safe", stops=stops, robustness=.9, perMember=[], whyLine="", gaveUp=[],
                    costPerPerson=sum(s["costPerPerson"] for s in stops) + 1)
        with self.assertRaises(ValidationError):
            Plan.model_validate(plan)


class StartupTests(unittest.TestCase):
    def test_private_env_file_loads_without_overriding_exported_values(self):
        secret = secrets.token_urlsafe()
        exported = secrets.token_urlsafe()
        with TemporaryDirectory() as folder:
            path = Path(folder) / ".env"
            path.write_text(f"HUDDLE_SHARED_SECRET='{secret}'\n")
            with patch.dict(os.environ, {}, clear=True):
                self.assertEqual(Settings.from_env(path).secret, secret)
            with patch.dict(os.environ, {"HUDDLE_SHARED_SECRET": exported}, clear=True):
                self.assertEqual(Settings.from_env(path).secret, exported)

    def test_missing_secret_and_synthetic_catalog_fail_closed(self):
        synthetic = FIXTURES / "places.fake.json"
        for settings in (Settings(""), Settings("   "), Settings(secrets.token_urlsafe(), synthetic)):
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
        self.assertIn("not configured", message)

if __name__ == "__main__":
    unittest.main()
