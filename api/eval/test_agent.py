"""Coordinator behavior and HTTP contracts. Fake model only; live check is separate."""
import json
from pathlib import Path
import unittest

from fastapi.testclient import TestClient
from pydantic import TypeAdapter

from api.agent import candidates, coordinate, interpret
from api.agent_models import AgentNeeds, AgentNeedsRequest, AgentPlanRequest
from api.catalog import Catalog
from api.main import Settings, create_app
from api.models import Place


def needs(cap=30, **hard):
    return AgentNeeds.model_validate({"hard": {"budgetMaxPerPerson": cap, **hard}})


def request(**changes):
    data = {"runId": "agent_test", "inputRevision": 7, "date": "2026-10-24",
            "window": {"start": "17:00", "end": "23:00"}, "members": [
                {"memberId": "one", "prompt": "PRIVATE_ONLY_BURGERS under $30", "needs": needs(30).model_dump()},
                {"memberId": "two", "prompt": "PRIVATE_ONLY_QUIET vegetarian", "needs": needs(25, dietary=["vegetarian"]).model_dump()},
            ]}
    return AgentPlanRequest.model_validate({**data, **changes})


class Model:
    available = True

    def __init__(self, bad=False, extracted=None):
        self.context = None
        self.bad = bad
        self.extracted = extracted
        self.calls = 0

    async def call(self, role, system, user, schema, model, timeout, **kwargs):
        self.calls += 1
        self.context = json.loads(user)
        if role == "agent-needs":
            value = (self.extracted or needs()).model_dump()
        else:
            value = {"choices": [{"candidateId": "invented" if self.bad else self.context["candidates"][0]["candidateId"],
                                  "reasonIds": ["total", "sequence"]}]}
        kwargs["check"](value)
        return value


class CoordinatorTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = Catalog(TypeAdapter(list[Place]).validate_json(Path("data/places.json").read_text()))

    async def test_every_prompt_reaches_one_coordinator_and_private_text_cannot_be_published(self):
        model = Model()
        result = await coordinate(model, self.catalog, request())
        self.assertEqual(model.calls, 1)
        self.assertEqual(len(model.context["members"]), 2)
        self.assertIn("PRIVATE_ONLY_BURGERS", model.context["members"][0]["prompt"])
        self.assertNotIn("PRIVATE_ONLY", result.model_dump_json())
        self.assertNotIn("robustness", result.model_dump_json())
        self.assertTrue(result.plans)

    async def test_exact_cumulative_costs_and_dietary_activity_exception(self):
        result = await coordinate(Model(), self.catalog, request())
        for plan in result.plans:
            self.assertEqual(plan.costPerPerson, sum(stop.costPerPerson for stop in plan.stops))
            self.assertLessEqual(plan.costPerPerson, 25)
            self.assertTrue(any(s.category == "activity" for s in plan.stops))
            for stop in plan.stops:
                place = self.catalog.places[self.catalog.index[stop.placeId]]
                if stop.category != "activity": self.assertIn("vegetarian", place.dietary)

    async def test_zero_budget_is_not_uncapped_and_no_candidates_never_calls_model(self):
        body = request()
        body.members[0].needs.hard.budgetMaxPerPerson = 0
        model = Model()
        result = await coordinate(model, self.catalog, body)
        self.assertFalse(result.plans)
        self.assertTrue(result.conflicts)
        self.assertEqual(model.calls, 0)

    async def test_null_cap_and_whole_outing_change(self):
        body = request()
        body.members[0].needs.hard.budgetMaxPerPerson = None
        body.members[1].needs.hard.budgetMaxPerPerson = 12
        result = await coordinate(Model(), self.catalog, body)
        self.assertTrue(result.plans)
        self.assertTrue(all(p.costPerPerson <= 12 for p in result.plans))

    async def test_unknown_allergy_evidence_blocks_without_model_guessing(self):
        body = request()
        body.members[0].needs.hard.allergies = ["peanut"]
        model = Model()
        result = await coordinate(model, self.catalog, body)
        self.assertFalse(result.plans)
        self.assertIn("allergy", result.conflicts[0])
        self.assertEqual(model.calls, 0)

    async def test_invalid_model_id_never_becomes_a_plan(self):
        from fastapi import HTTPException
        with self.assertRaises(HTTPException) as error:
            await coordinate(Model(bad=True), self.catalog, request())
        self.assertEqual(error.exception.status_code, 502)

    async def test_private_interpretation_cannot_raise_or_remove_prior_cap(self):
        for cap in [None, 50]:
            result = await interpret(Model(extracted=needs(cap)), AgentNeedsRequest(
                memberId="one", text="Please raise my budget to $50", currentHard=needs(20).hard))
            self.assertEqual(result.hard.budgetMaxPerPerson, 20)

    async def test_missing_allergy_extraction_requests_private_clarification(self):
        result = await interpret(Model(), AgentNeedsRequest(memberId="one", text="I have a peanut allergy"))
        self.assertTrue(result.questions)

    async def test_service_missing_credentials_is_explicit_no_synthetic_plan(self):
        from fastapi import HTTPException
        model = Model()
        model.available = False
        with self.assertRaises(HTTPException) as error:
            await coordinate(model, self.catalog, request())
        self.assertEqual(error.exception.status_code, 503)

    def test_excluded_ids_and_hard_rejections(self):
        body = request()
        body.excludePlaceIds = [self.catalog.places[0].id]
        body.members[0].needs.hard.rejectedTerms = ["sushi"]
        result = candidates(self.catalog, body)
        for plan in result.values():
            self.assertNotIn(body.excludePlaceIds[0], [s.placeId for s in plan.stops])
            self.assertFalse(any("sushi" in s.name.lower() for s in plan.stops))


class AgentHttpTests(unittest.TestCase):
    def test_auth_validation_and_response_shapes(self):
        with TestClient(create_app(Settings(secret="unit-test-secret"), llm=Model())) as client:
            for route in ["/agent/needs", "/agent/plan"]:
                self.assertEqual(client.post(route, json={}).status_code, 401)
                self.assertEqual(client.post(route, headers={"X-Huddle-Secret": "wrong"}, json={}).status_code, 401)
                self.assertEqual(client.post(route, headers={"X-Huddle-Secret": "unit-test-secret"}, json={}).status_code, 422)
            headers = {"X-Huddle-Secret": "unit-test-secret"}
            response = client.post("/agent/needs", headers=headers, json={"memberId": "one", "text": "under $30"})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(set(response.json()), {"hard", "preferences", "questions", "warnings"})
            response = client.post("/agent/plan", headers=headers, json=request().model_dump())
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["mode"], "agent")
            self.assertEqual(response.json()["inputRevision"], 7)
            self.assertNotIn("posterior", response.json())
            self.assertNotIn("X-Huddle-Stub", response.headers)


if __name__ == "__main__":
    unittest.main()
