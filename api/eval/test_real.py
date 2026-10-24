"""Service checks: parser, learning, solver, offers, council.

No network: Claude is a scripted fake client, so the real retry and validation
paths run. Run: python -m unittest discover -s api/eval -v.
"""

import asyncio
from copy import deepcopy
from datetime import date
import json
from pathlib import Path
import secrets
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
import httpx

from api import council
from api.catalog import WEEKDAYS, minutes
from api.delivery import HttpCouncilDelivery, LocalCouncilDelivery
from api.llm import LLM
from api.main import Settings, create_app
from api.models import FEATURES, CouncilMessage, PlanResponse
from api.parse import SYSTEM as PARSE_SYSTEM, keyword_parse, prior

ROOT = Path(__file__).resolve().parents[2]
PLACES = {p["id"]: p for p in json.loads((ROOT / "data" / "places.json").read_text())}
DEMO = json.loads((ROOT / "data" / "demo_group.json").read_text())


def reply(data) -> SimpleNamespace:
    return SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text=json.dumps(data))])


class FakeClient:
    """Stands in for anthropic.AsyncAnthropic: `messages.create` calls `respond(kwargs)`."""

    def __init__(self, respond):
        self.respond, self.calls = respond, []
        self.messages = self

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        result = self.respond(kwargs)
        if asyncio.iscoroutine(result):
            result = await result
        return reply(result)


def role(kwargs) -> str:
    system = kwargs["system"]
    return "parse" if system == PARSE_SYSTEM else "chair" if system == council.CHAIR_SYSTEM else "advocate"


def valid_advocate(kwargs):
    """A rule-abiding advocate: stance on every plan, cites its own Safe score."""
    seen = json.loads(kwargs["messages"][0]["content"])
    score = seen["tools"]["my_score"]["Safe"]["ratioMean"]
    return {"stance": {k: "accept" for k in seen["plans"]},
            "argument": f"Safe gives me {score} of my ideal outing.",
            "cited": [{"tool": "my_score", "field": "ratioMean", "value": score}]}


def valid_chair(kwargs, pick="Safe"):
    seen = json.loads(kwargs["messages"][0]["content"])
    top = seen["solver_ranking"][0]
    return {"chosenPlan": pick, "rationale": f"{pick} is fine for everyone; the top plan holds {top['robustness']}.",
            "cited": [{"tool": "solver_ranking", "field": "robustness", "value": top["robustness"]}]}


def stable(result):
    """A response minus its wall-clock timing, for determinism checks."""
    result = deepcopy(result)
    result["stats"].pop("elapsedMs")
    return result


def demo_members(texts=None):
    members = []
    for i, m in enumerate(DEMO["members"]):
        hard, soft = keyword_parse((texts or {}).get(i, m["text"]))
        members.append(dict(memberId=f"m{i + 1}", name=m["name"], posterior=prior(soft).model_dump(),
                            hard=hard.model_dump(), origin=m["origin"]))
    return members


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.secret = secrets.token_urlsafe(32)
        self.headers = {"X-Huddle-Secret": self.secret}
        self.parse_reply = None
        self.advocate = valid_advocate
        self.chair = valid_chair
        self.fake = FakeClient(self.respond)
        self.deliveries = []

        def delivery_factory():
            delivery = LocalCouncilDelivery()
            self.deliveries.append(delivery)
            return delivery

        self.client = TestClient(create_app(Settings(self.secret), delivery_factory, LLM(self.fake)))
        self.client.__enter__()
        self.addCleanup(self.client.__exit__, None, None, None)
        self.body = dict(runId="run_test_1", date=DEMO["date"], window=DEMO["window"], members=demo_members(),
                         excludePlaceIds=[], options=dict(samples=300, tau=0.6, topK=60, preview=False))

    def respond(self, kwargs):
        kind = role(kwargs)
        if kind == "parse":
            return self.parse_reply(kwargs) if callable(self.parse_reply) else self.parse_reply
        return self.advocate(kwargs) if kind == "advocate" else self.chair(kwargs)

    def post(self, path, body, expected=200):
        response = self.client.post(path, json=body, headers=self.headers)
        self.assertEqual(response.status_code, expected, response.text)
        self.assertNotIn("X-Huddle-Stub", response.headers)
        return response.json()

    def plan(self, body=None):
        return self.post("/plan", self.body if body is None else body)

    def council_body(self, show_who=False):
        result = self.plan()
        return dict(runId=self.body["runId"], plans=result["plans"], pareto=result["pareto"],
                    members=deepcopy(self.body["members"]), scoutFacts=[],
                    options=dict(rounds=2, showWho=show_who, seed=7))

    # ---------------------------------------------------------- parse ---

    def test_parse_uses_the_model_and_never_drops_a_stated_budget(self):
        self.parse_reply = {"hard": {"vetoCuisines": [], "vetoCategories": [], "budgetMaxPerPerson": None,
                                     "dietary": ["vegetarian"], "maxTravelMinutes": None},
                            "soft": [{"feature": "noise", "direction": -1, "confidence": "high"}]}
        result = self.post("/parse-prefs", dict(memberId="m1", text="vegetarian, under $30, somewhere quiet"))
        self.assertEqual(result["hard"]["budgetMaxPerPerson"], 30)
        self.assertEqual(result["hard"]["dietary"], ["vegetarian"])
        self.assertTrue(any("$30" in w for w in result["warnings"]))
        sent = self.fake.calls[-1]
        self.assertIn("<preferences>\nvegetarian, under $30, somewhere quiet\n</preferences>",
                      sent["messages"][0]["content"])
        self.assertEqual(sent["output_config"]["format"]["type"], "json_schema")
        self.assertNotIn("temperature", sent)  # rejected by current Haiku and Sonnet models

    def test_prior_follows_c2(self):
        self.parse_reply = {"hard": {"vetoCuisines": [], "vetoCategories": [], "budgetMaxPerPerson": None,
                                     "dietary": [], "maxTravelMinutes": None},
                            "soft": [{"feature": "noise", "direction": -1, "confidence": "high"},
                                     {"feature": "romance", "direction": 1, "confidence": "low"},
                                     {"feature": "noise", "direction": -1, "confidence": "low"}]}
        posterior = self.post("/parse-prefs", dict(memberId="m1", text="quiet and maybe romantic"))["posterior"]
        noise, romance = FEATURES.index("noise"), FEATURES.index("romance")
        self.assertEqual(posterior["mean"][noise], -1.5)  # the most confident duplicate wins
        self.assertAlmostEqual(posterior["cov"][noise][noise], 0.25)
        self.assertEqual(posterior["mean"][romance], 0.5)
        self.assertAlmostEqual(posterior["cov"][romance][romance], 0.81)
        others = [i for i in range(13) if i not in (noise, romance)]
        self.assertTrue(all(posterior["mean"][i] == 0 and posterior["cov"][i][i] == 1 for i in others))

    def test_invalid_model_output_and_no_key_fall_back_to_keywords(self):
        self.parse_reply = {"hard": {"vetoCuisines": ["sushi"]}, "soft": []}  # fails validation twice
        for llm in (None, "fake"):
            with self.subTest(llm=llm):
                client = self.client
                if llm is None:
                    with patch.dict("os.environ", {"ANTHROPIC_API_KEY": ""}):
                        client = TestClient(create_app(Settings(self.secret, False)))
                with client:
                    response = client.post("/parse-prefs", headers=self.headers, json=dict(
                        memberId="m2", text="no sushi, I love trying new places"))
                result = response.json()
                self.assertEqual(response.status_code, 200)
                self.assertEqual(result["hard"]["vetoCuisines"], ["asian"])
                self.assertIn("novelty", [s["feature"] for s in result["soft"]])
                self.assertIn("keyword rules", result["warnings"][0])

    def test_veto_cap_keeps_two(self):
        self.parse_reply = {"hard": {"vetoCuisines": ["asian", "latin", "american"], "vetoCategories": [],
                                     "budgetMaxPerPerson": None, "dietary": [], "maxTravelMinutes": None}, "soft": []}
        result = self.post("/parse-prefs", dict(memberId="m1", text="no asian, latin or american"))
        self.assertEqual(result["hard"]["vetoCuisines"], ["asian", "latin"])
        self.assertTrue(any("dropped 1" in w for w in result["warnings"]))

    # -------------------------------------------------------- elicit ---

    def test_update_moves_toward_the_winner_and_narrows(self):
        posterior = prior([]).model_dump()
        winner, loser = "p_002", "p_003"  # a latin and a mediterranean meal
        self.assertNotEqual(PLACES[winner]["cuisine"], PLACES[loser]["cuisine"])
        body = dict(posterior=posterior, winnerPlaceId=winner, loserPlaceId=loser)
        result = self.post("/elicit/update", body)["posterior"]
        self.assertEqual(result, self.post("/elicit/update", body)["posterior"])
        d = [a - b for a, b in zip(self.x(winner), self.x(loser))]
        dot = lambda u, v: sum(a * b for a, b in zip(u, v))
        quad = lambda cov: dot(d, [dot(row, d) for row in cov])
        self.assertGreater(dot(result["mean"], d), 0)
        self.assertLess(quad(result["cov"]), quad(posterior["cov"]))
        self.post("/elicit/update", dict(body, loserPlaceId="p_021"), 422)  # meal vs activity
        unknown = self.post("/elicit/update", dict(body, loserPlaceId="stub_safe_meal"), 422)
        self.assertIn("STUB_MODE", unknown["detail"])

    def x(self, pid):
        p = PLACES[pid]
        cuisines = ("asian", "latin", "mediterranean", "american", "cafe_dessert")
        return [p["aspects"][f]["mean"] for f in FEATURES[:8]] + [
            float(p["category"] != "activity" and p["cuisine"] == c) for c in cuisines]

    def test_next_pair_is_unseen_same_category_and_deterministic(self):
        ids = ["p_001", "p_002", "p_003", "p_021"]
        body = dict(memberId="m1", posterior=prior([]).model_dump(), alreadySeen=[],
                    candidatePlaceIds=ids, focusPlaceIds=[])
        pair = self.post("/elicit/next", body)
        self.assertEqual(pair, self.post("/elicit/next", body))
        self.assertEqual(PLACES[pair["a"]]["category"], PLACES[pair["b"]]["category"])
        self.assertNotEqual(PLACES[pair["a"]]["cuisine"], PLACES[pair["b"]]["cuisine"])  # informative
        seen = [["p_001", "p_002"], ["p_003", "p_001"], ["p_002", "p_003"]]
        self.post("/elicit/next", dict(body, alreadySeen=seen), 409)
        self.post("/elicit/next", dict(body, candidatePlaceIds=["stub_safe_meal"]), 422)

    # ---------------------------------------------------------- plan ---

    def test_demo_plans_respect_every_hard_constraint(self):
        result = self.plan()
        PlanResponse.model_validate(result)
        self.assertEqual(stable(result), stable(self.plan()))
        self.assertEqual([p["kind"] for p in result["plans"]], ["safe", "bold", "budget"])
        self.assertEqual(len({frozenset(s["placeId"] for s in p["stops"]) for p in result["plans"]}), 3)
        weekday = WEEKDAYS[date.fromisoformat(self.body["date"]).weekday()]
        for plan in result["plans"]:
            self.assertEqual(plan["costPerPerson"], sum(s["costPerPerson"] for s in plan["stops"]))
            self.assertEqual({r["memberId"] for r in plan["perMember"]}, {m["memberId"] for m in self.body["members"]})
            self.assertTrue(all(0 <= r["ratioP10"] <= 1 and 0 <= r["ratioMean"] <= 1 for r in plan["perMember"]))
            for m in self.body["members"]:
                cap = m["hard"]["budgetMaxPerPerson"]
                self.assertTrue(cap is None or plan["costPerPerson"] <= cap)
            for stop in plan["stops"]:
                place = PLACES[stop["placeId"]]
                self.assertNotEqual(place["cuisine"], "asian")  # Sam's veto
                if place["category"] != "activity":
                    self.assertIn("vegetarian", place["dietary"])  # Alex's need
                self.assertTrue(any(minutes(a) <= minutes(stop["start"]) and minutes(stop["end"]) <= minutes(b)
                                    for a, b in place["hours"][weekday]))
                self.assertGreaterEqual(stop["start"], self.body["window"]["start"])
                self.assertLessEqual(stop["end"], self.body["window"]["end"])
        self.assertEqual(result["stats"]["samples"], 300)
        self.assertLessEqual(len(result["pareto"]), 60)
        self.assertTrue({p["id"] for p in result["plans"]} <= {p["planId"] for p in result["pareto"]})
        self.assertEqual([f["name"] for f in result["posteriorSummary"][0]["features"]], list(FEATURES))
        self.assertTrue(any("default values" in w for w in result["warnings"]))

    def test_exclusions_infeasible_groups_and_preview(self):
        safe_meal = next(s["placeId"] for s in self.plan()["plans"][0]["stops"] if s["category"] == "meal")
        body = deepcopy(self.body)
        body["excludePlaceIds"] = [safe_meal]
        self.assertFalse(any(s["placeId"] == safe_meal for p in self.plan(body)["plans"] for s in p["stops"]))
        body = deepcopy(self.body)
        body["members"][0]["hard"]["budgetMaxPerPerson"] = 0
        result = self.plan(body)
        self.assertEqual(result["plans"], [])
        self.assertEqual(result["relaxationHints"], [])
        self.assertTrue(any("no limit was relaxed" in w for w in result["warnings"]))
        body = deepcopy(self.body)
        body["options"].update(samples=100, preview=True)
        result = self.plan(body)
        self.assertEqual([p["kind"] for p in result["plans"]], ["safe"])
        self.assertEqual(result["pareto"], [])
        self.assertEqual((result["plans"][0]["whyLine"], result["plans"][0]["gaveUp"]), ("", []))

    def test_explanations_name_the_member_who_compromised(self):
        body = deepcopy(self.body)
        for m in body["members"]:
            m["hard"] = dict(vetoCuisines=[], vetoCategories=[], budgetMaxPerPerson=None, dietary=[], maxTravelMinutes=None)
        latin, med = FEATURES.index("cuisine_latin"), FEATURES.index("cuisine_mediterranean")
        body["members"][0]["posterior"]["mean"][latin] = 2.0   # Alex loves latin food
        for m in body["members"][1:]:
            m["posterior"]["mean"][med] = 2.0                   # everyone else, mediterranean
        result = self.plan(body)
        compromised = {g["memberId"] for p in result["plans"] for g in p["gaveUp"]}
        self.assertIn("m1", compromised)
        safe = result["plans"][0]
        if any(g["memberId"] == "m1" for g in safe["gaveUp"]):
            self.assertIn("Alex gave up latin food", safe["whyLine"])

    # -------------------------------------------------------- offers ---

    def test_offers_relax_one_private_limit_and_reveal_nothing(self):
        safe = self.plan()["plans"][0]
        body = dict(deepcopy(self.body), baselinePlanId=safe["id"])
        offers = self.post("/offers", body)["offers"]
        self.assertEqual(offers, self.post("/offers", body)["offers"])
        self.assertTrue(offers)
        self.assertLessEqual(len(offers), 3)
        self.assertEqual(len({o["toMemberId"] for o in offers}), len(offers))
        caps = {m["memberId"]: m["hard"]["budgetMaxPerPerson"] for m in self.body["members"]}
        for o in offers:
            self.assertTrue(0 < o["amount"] <= 15)
            self.assertEqual((o["type"], o["unit"]), ("budget", "usd"))  # demo origins carry no travel caps
            self.assertGreater(o["plan"]["costPerPerson"], caps[o["toMemberId"]])
            self.assertLessEqual(o["plan"]["costPerPerson"], caps[o["toMemberId"]] + o["amount"])
            for member, cap in caps.items():
                if member != o["toMemberId"] and cap is not None:
                    self.assertLessEqual(o["plan"]["costPerPerson"], cap)
            self.assertEqual((o["plan"]["perMember"], o["plan"]["gaveUp"], o["plan"]["whyLine"]), ([], [], ""))
            self.assertGreaterEqual(max(o["robustnessGain"], o["minRatioGain"]), 0.05)
        uncapped = deepcopy(body)
        for m in uncapped["members"]:
            m["hard"]["budgetMaxPerPerson"] = None
        self.assertEqual(self.post("/offers", uncapped)["offers"], [])

    # ------------------------------------------------------- council ---

    def test_council_runs_two_rounds_and_a_chair_without_private_text(self):
        body = self.council_body()
        result = self.post("/council", body)
        self.assertEqual([m["round"] for m in result["messages"]], [1] * 4 + [2] * 4 + [3])
        safe = next(p for p in body["plans"] if p["kind"] == "safe")
        self.assertEqual((result["chosenPlanId"], result["fallbackUsed"]), (safe["id"], False))
        self.assertEqual(result["agreesWithSolver"], safe["id"] == max(body["plans"], key=lambda p: p["robustness"])["id"])
        self.assertEqual([m.model_dump() for m in self.deliveries[-1].messages], result["messages"])
        self.assertEqual({m["memberId"] for m in result["messages"][:4]}, {m["memberId"] for m in body["members"]})
        prompts = [c["system"] + c["messages"][0]["content"] for c in self.fake.calls]
        for prompt in prompts:
            for m in body["members"]:
                self.assertNotIn(m["name"], prompt)
            for word in ("budgetMaxPerPerson", "maxTravelMinutes", "vetoCuisines", "vegetarian, under"):
                self.assertNotIn(word, prompt)
        round_two = json.loads(self.fake.calls[4]["messages"][0]["content"])
        self.assertEqual(len(round_two["transcript"]), 4)

    def test_invalid_messages_are_dropped_and_a_bad_chair_falls_back_to_safe(self):
        body = self.council_body()
        name = body["members"][0]["name"]

        def advocate(kwargs):
            data = valid_advocate(kwargs)
            label = json.loads(kwargs["messages"][0]["content"])["you"]
            if label == "Advocate A":
                data["argument"] = "My budget is 99 dollars."      # number from nowhere
            elif label == "Advocate B":
                data["argument"] = f"{name} would love Safe."      # names a member
            return data

        self.advocate = advocate
        self.chair = lambda kwargs: dict(valid_chair(kwargs), chosenPlan="Bold", rationale="Bold costs 1234.")
        result = self.post("/council", body)
        labels = [m["label"] for m in result["messages"] if m["speaker"] == "advocate"]
        self.assertNotIn("Advocate A", labels)
        self.assertNotIn("Advocate B", labels)
        self.assertEqual(len(labels), 4)  # C and D, both rounds
        safe = next(p for p in body["plans"] if p["kind"] == "safe")
        self.assertEqual((result["chosenPlanId"], result["fallbackUsed"]), (safe["id"], True))
        self.assertEqual(result["messages"][-1]["speaker"], "chair")

    def test_chair_may_pick_another_approved_plan(self):
        body = self.council_body()
        self.chair = lambda kwargs: valid_chair(kwargs, "Budget")
        result = self.post("/council", body)
        budget = next(p for p in body["plans"] if p["kind"] == "budget")
        self.assertEqual((result["chosenPlanId"], result["fallbackUsed"]), (budget["id"], False))
        self.assertEqual(result["messages"][-1]["planId"], budget["id"])

    def test_slow_models_hit_the_deadline_not_the_callers_timeout(self):
        body = self.council_body()

        async def slow(kwargs):
            await asyncio.sleep(5)
            return valid_advocate(kwargs)

        self.advocate = self.chair = slow
        with patch.object(council, "BUDGET_S", 2.0), patch.object(council, "CHAIR_RESERVE_S", 0.2):
            result = self.post("/council", body)
        self.assertTrue(result["fallbackUsed"])
        self.assertLess(result["elapsedMs"], 3500)
        self.assertEqual([m["speaker"] for m in result["messages"]], ["chair"])


class DeliveryTests(unittest.TestCase):
    def test_http_delivery_posts_with_the_shared_secret_and_survives_errors(self):
        seen = []

        def handler(request):
            seen.append(request)
            return httpx.Response(500 if len(seen) > 1 else 200, json={"ok": True})

        delivery = HttpCouncilDelivery("https://db.example/", "huddle", "s3cret", transport=httpx.MockTransport(handler))
        message = CouncilMessage(runId="r", round=3, speaker="chair", label="Chair", memberId=None, planId="p",
                                 stance={}, text="Safe.", cited=[], ts=1)
        asyncio.run(delivery.deliver(message))
        asyncio.run(delivery.deliver(message))  # a 500 is logged, not raised
        self.assertEqual(str(seen[0].url), "https://db.example/v1/database/huddle/route/council-message")
        self.assertEqual(seen[0].headers["X-Huddle-Secret"], "s3cret")
        self.assertEqual(json.loads(seen[0].content)["runId"], "r")


if __name__ == "__main__":
    unittest.main()
