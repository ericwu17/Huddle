"""Coordinator behavior and HTTP contracts. Fake model only; live check is separate."""
import json
from pathlib import Path
import unittest

from fastapi.testclient import TestClient
from pydantic import TypeAdapter

from api.agent import candidates, coordinate, interpret, public_facts
from api.agent_models import AgentCatalog, AgentHard, AgentNeeds, AgentNeedsRequest, AgentPlanRequest
from api.catalog import Catalog, CatalogCache, minutes, COORDINATOR_VISIT_MINUTES
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


def meal_request(duration=90, cap=30, **hard):
    return request(members=[{"memberId": member, "prompt": "Burgers if possible",
                             "needs": needs(cap, maxOutingMinutes=duration, **hard).model_dump()}
                            for member in ("one", "two")])


class Model:
    available = True

    def __init__(self, bad=False, extracted=None, prefer_rating=False, all_reasons=False):
        self.context = None
        self.bad = bad
        self.extracted = extracted
        self.prefer_rating = prefer_rating
        self.all_reasons = all_reasons
        self.schema = None
        self.calls = 0

    async def call(self, role, system, user, schema, model, timeout, **kwargs):
        self.calls += 1
        self.context = json.loads(user)
        self.schema = schema
        if role == "agent-needs":
            value = (self.extracted or needs()).model_dump()
        else:
            value = {"choices": [{"candidateId": "invented" if self.bad else self.context["candidates"][0]["candidateId"],
                                  "reasonIds": [r for r in ("total", "sequence") if r in self.context["reasonTypes"]]}]}
            if self.prefer_rating:
                value["choices"][0]["reasonIds"] = ["ratings"]
            if self.all_reasons:
                value["choices"][0]["reasonIds"] = list(self.context["reasonTypes"])
        kwargs["check"](value)
        return value


class CoordinatorTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = Catalog(TypeAdapter(list[Place]).validate_json(Path("data/places.json").read_text()))

    async def test_unset_time_gets_an_automatic_timed_outing_without_mutating_the_request(self):
        body = request(date=None, window=None)
        result = await coordinate(Model(), self.catalog, body)
        self.assertEqual(candidates(self.catalog, body), {})
        self.assertTrue(result.plans)
        self.assertFalse(result.suggestions)
        self.assertIsNone(body.date)
        self.assertIsNone(body.window)
        self.assertTrue(all(stop.placeId in self.catalog.index for plan in result.plans for stop in plan.stops))

    def test_time_contract_requires_a_complete_window_or_an_explicitly_unscheduled_outing(self):
        for change in ({"date": None}, {"window": None}, {"date": "2026-02-30"}):
            with self.assertRaises(ValueError):
                request(**change)

    async def test_every_prompt_reaches_one_coordinator_and_private_text_cannot_be_published(self):
        model = Model()
        result = await coordinate(model, self.catalog, request())
        self.assertEqual(model.calls, 1)
        self.assertEqual(len(model.context["members"]), 2)
        self.assertIn("PRIVATE_ONLY_BURGERS", model.context["members"][0]["prompt"])
        self.assertNotIn("PRIVATE_ONLY", result.model_dump_json())
        self.assertNotIn("robustness", result.model_dump_json())
        self.assertTrue(result.plans)

    async def test_real_cached_ratings_reach_claude_and_public_reason_uses_only_catalog_facts(self):
        model = Model(prefer_rating=True)
        result = await coordinate(model, self.catalog, request())
        for place_id, fact in model.context["venues"].items():
            venue = self.catalog.places[self.catalog.index[place_id]]
            self.assertEqual(fact["rating"], venue.rating if venue.reviewCount else None)
            self.assertEqual(fact["reviewCount"], venue.reviewCount)
            self.assertEqual(fact["sources"], venue.sources)
        self.assertIn("cached", result.plans[0].whyLine)
        self.assertIn("freshness is not verified", result.plans[0].whyLine)
        self.assertNotIn("PRIVATE_ONLY", result.plans[0].whyLine)
        self.assertLess(len(json.dumps(model.context, separators=(",", ":"))), 45000)
        self.assertLessEqual(len(model.context["venues"]), len(self.catalog.places))
        self.assertTrue(all("publicFacts" not in candidate for candidate in model.context["candidates"]))
        choice_schema = model.schema["properties"]["choices"]["items"]["properties"]
        self.assertEqual(set(choice_schema["candidateId"]["enum"]), {candidate["candidateId"] for candidate in model.context["candidates"]})
        self.assertEqual(set(choice_schema["reasonIds"]["items"]["enum"]), set(model.context["reasonTypes"]))

    async def test_exact_cumulative_costs_and_dietary_activity_exception(self):
        result = await coordinate(Model(), self.catalog, request())
        for plan in result.plans:
            self.assertEqual(plan.costPerPerson, sum(stop.costPerPerson for stop in plan.stops))
            self.assertLessEqual(plan.costPerPerson, 25)
            for stop in plan.stops:
                place = self.catalog.places[self.catalog.index[stop.placeId]]
                if stop.category != "activity": self.assertIn("vegetarian", place.dietary)
        # Activities remain valid alongside food even though they have no
        # dietary tags. A cheaper meal-only recommendation must not hide this.
        with_activity = [plan for plan in candidates(self.catalog, request()).values()
                         if any(stop.category == "activity" for stop in plan.stops)]
        self.assertTrue(with_activity)
        self.assertTrue(any(not self.catalog.places[self.catalog.index[stop.placeId]].dietary
                            for plan in with_activity for stop in plan.stops if stop.category == "activity"))
        for plan in with_activity:
            self.assertEqual(plan.costPerPerson, sum(stop.costPerPerson for stop in plan.stops))
            self.assertLessEqual(plan.costPerPerson, 25)
            self.assertTrue(plan.status == "provisional" or all("vegetarian" in self.catalog.places[self.catalog.index[stop.placeId]].dietary
                                for stop in plan.stops if stop.category != "activity"))

    async def test_matching_burger_requests_can_select_a_grounded_meal_within_ninety_minutes(self):
        body = meal_request()
        available = candidates(self.catalog, body)
        self.assertTrue(available)
        self.assertTrue(all(len(plan.stops) == 1 for plan in available.values()))
        model = Model()
        result = await coordinate(model, self.catalog, body)
        self.assertEqual(model.calls, 1)
        self.assertTrue(result.plans)
        for plan in result.plans:
            self.assertEqual(len(plan.stops), 1)
            stop = plan.stops[0]
            venue = self.catalog.places[self.catalog.index[stop.placeId]]
            self.assertEqual(stop.category, "meal")
            self.assertEqual(stop.name, venue.name)
            self.assertEqual(plan.costPerPerson, venue.costPerPerson)
            self.assertLessEqual(plan.costPerPerson, 30)
            self.assertEqual(minutes(stop.end) - minutes(stop.start), COORDINATOR_VISIT_MINUTES)
            self.assertLessEqual(minutes(stop.end) - minutes(stop.start), 90)
            self.assertEqual(plan.travelMinutes, 0)
        self.assertTrue(all(len(plan.stops) >= 2 for plan in self.catalog.itineraries(body.date, body.window.start, body.window.end)))

    async def test_impossible_limits_are_declared_provisional_and_unknown_diets_remain_provisional(self):
        for body, limit in [(meal_request(duration=59), "duration"), (meal_request(cap=0), "budget")]:
            result = await coordinate(Model(), self.catalog, body)
            self.assertTrue(result.plans)
            self.assertFalse(result.suggestions)
            self.assertTrue(all(plan.status == "provisional" and limit in plan.relaxed for plan in result.plans))
        for body in [meal_request(dietary=["vegan"]), meal_request(allergies=["peanut"])]:
            result = await coordinate(Model(), self.catalog, body)
            self.assertTrue(result.plans)
            self.assertTrue(all(plan.status == "provisional" for plan in result.plans))
            self.assertNotIn("peanut", result.rationale)

    async def test_all_six_supported_public_reasons_are_valid_and_do_not_trigger_a_retry(self):
        model = Model(all_reasons=True)
        result = await coordinate(model, self.catalog, request())
        self.assertTrue(result.plans)
        self.assertEqual(model.calls, 1)
        self.assertIn("cached", result.plans[0].whyLine)

    async def test_zero_budget_stays_zero_when_an_over_budget_alternative_is_declared(self):
        body = request()
        body.members[0].needs.hard.budgetMaxPerPerson = 0
        result = await coordinate(Model(), self.catalog, body)
        self.assertTrue(result.plans)
        self.assertFalse(result.suggestions)
        self.assertEqual(body.members[0].needs.hard.budgetMaxPerPerson, 0)
        self.assertTrue(all(plan.status == "provisional" and "budget" in plan.relaxed for plan in result.plans))
        self.assertTrue(result.conflicts)

    async def test_null_cap_and_whole_outing_change(self):
        body = request()
        body.members[0].needs.hard.budgetMaxPerPerson = None
        body.members[1].needs.hard.budgetMaxPerPerson = 12
        result = await coordinate(Model(), self.catalog, body)
        self.assertTrue(result.plans)
        self.assertTrue(all(p.costPerPerson <= 12 for p in result.plans))

    async def test_unknown_allergy_evidence_allows_provisional_suggestions(self):
        body = request()
        body.members[0].needs.hard.allergies = ["peanut"]
        model = Model()
        result = await coordinate(model, self.catalog, body)
        self.assertTrue(result.plans)
        self.assertTrue(all(plan.status == "provisional" for plan in result.plans))
        self.assertEqual(model.calls, 1)
        self.assertNotIn("peanut", result.rationale)

    async def test_max_vegan_steak_and_dessert_scenario_explains_the_catalog_gap(self):
        body = request(members=[
            {"memberId": "max", "prompt": "Vegan, under $30 for the whole outing", "needs": needs(30, dietary=["vegan"]).model_dump()},
            {"memberId": "eric-wu", "prompt": "Steak and fries, under $50", "needs": needs(50).model_dump()},
            {"memberId": "eric-chen", "prompt": "Good dessert afterwards, under three hours total", "needs": needs(None, maxOutingMinutes=180).model_dump()},
        ])
        model = Model()
        result = await coordinate(model, self.catalog, body)
        self.assertTrue(result.plans)
        self.assertTrue(all(plan.status == "provisional" for plan in result.plans))
        self.assertEqual(model.calls, 1)
        self.assertEqual(body.members[0].needs.hard.dietary, ["vegan"])

    def test_agent_can_offer_dinner_and_dessert_without_forcing_an_activity(self):
        body = request()
        body.members[0].needs.hard.maxOutingMinutes = 180
        plans = candidates(self.catalog, body)
        self.assertTrue(any([s.category for s in plan.stops] == ["meal", "dessert"] for plan in plans.values()))
        # This addition is confined to agent planning; legacy templates remain as documented.
        self.assertTrue(all(tuple(self.catalog.places[i].category for i in plan.stops) != ("meal", "dessert")
                            for plan in self.catalog.itineraries(body.date, body.window.start, body.window.end)))

    def test_stop_preferences_aim_for_the_nearest_feasible_average(self):
        def counts(*stops, duration=None, start="17:00"):
            body = request(window={"start": start, "end": "23:00"})
            for member, preferred in zip(body.members, stops):
                member.needs.hard.preferredStops = preferred
                member.needs.hard.maxOutingMinutes = duration
            return {len(plan.stops) for plan in candidates(self.catalog, body).values()}
        self.assertEqual(counts(None, None), {1, 2, 3})
        self.assertEqual(counts(None, None, start="12:00"), {1, 2, 3})  # Flexible never adds long routes
        self.assertEqual(counts(1, 1), {1})
        self.assertEqual(counts(3, None), {3})  # Flexible members are not averaged in
        self.assertEqual(counts(2, 3), {3})  # a halfway choice first tries the fuller outing
        self.assertEqual(counts(3, 4), {4})
        self.assertEqual(counts(1, 2), {2})
        self.assertEqual(counts(4, 4), {4})
        self.assertEqual(counts(5, 5, start="12:00"), {5})
        self.assertEqual(counts(5, 1), {3})
        # Soft: when a count does not fit the window or time limit, the nearest feasible count remains.
        self.assertEqual(counts(5, 5), {5})  # one-hour visits can now fit with nearby travel
        self.assertEqual(counts(5, 5, duration=240, start="12:00"), {3})
        self.assertEqual(counts(3, 3, duration=180), {2})
        self.assertEqual(counts(3, 3, duration=90), {1})

    def test_one_hour_visits_preserve_catalog_evidence_and_legacy_templates(self):
        before = [place.dwellMinutes for place in self.catalog.places]
        view = self.catalog.coordinator_view
        self.assertIs(view, self.catalog.coordinator_view)
        self.assertTrue(all(place.dwellMinutes == 60 for place in view.places))
        self.assertEqual([place.dwellMinutes for place in self.catalog.places], before)
        self.assertTrue(any(duration != 60 for duration in before))
        body = meal_request(duration=180, preferredStops=2)
        plans = candidates(self.catalog, body)
        self.assertTrue(plans)
        self.assertEqual({len(plan.stops) for plan in plans.values()}, {2})
        self.assertTrue(all(minutes(stop.end) - minutes(stop.start) == 60
                            for plan in plans.values() for stop in plan.stops))

    async def test_a_shorter_outing_explains_the_requested_count_without_raising_limits(self):
        body = meal_request(duration=90, preferredStops=2)
        result = await coordinate(Model(), self.catalog, body)
        self.assertTrue(result.plans)
        self.assertEqual({len(plan.stops) for plan in result.plans}, {1})
        self.assertIn("2 stops", result.conflicts[0])
        self.assertIn("1-stop alternative", result.conflicts[0])
        self.assertTrue(all(member.needs.hard.maxOutingMinutes == 90 for member in body.members))
        self.assertTrue(all(member.needs.hard.budgetMaxPerPerson == 30 for member in body.members))

    async def test_requested_multi_stop_count_is_retained_in_automatic_time(self):
        body = meal_request(duration=180, preferredStops=2).model_copy(update={"date": None, "window": None})
        result = await coordinate(Model(), self.catalog, body)
        self.assertTrue(result.plans)
        self.assertFalse(result.suggestions)
        self.assertEqual({len(plan.stops) for plan in result.plans}, {2})
        self.assertIsNone(body.date)

    def test_long_routes_keep_one_meal_distinct_venues_and_every_limit(self):
        body = request(window={"start": "12:00", "end": "23:00"})
        body.members[0].needs.hard.maxOutingMinutes = 420
        for count in (4, 5):
            for member in body.members:
                member.needs.hard.preferredStops = count
            plans = candidates(self.catalog, body)
            self.assertTrue(plans)
            for plan in plans.values():
                categories = [s.category for s in plan.stops]
                self.assertEqual(len(plan.stops), count)
                self.assertEqual(len({s.placeId for s in plan.stops}), count)
                self.assertEqual(categories.count("meal"), 1)
                self.assertLessEqual(categories.count("dessert"), 1)
                self.assertLessEqual(plan.costPerPerson, 25)
                self.assertLessEqual(minutes(plan.stops[-1].end) - minutes(plan.stops[0].start), 420)
                self.assertLessEqual(minutes(plan.stops[-1].end), minutes("23:00"))
                for a, b in zip(plan.stops, plan.stops[1:]):
                    leg = self.catalog.legs[self.catalog.index[a.placeId], self.catalog.index[b.placeId]]
                    self.assertGreaterEqual(minutes(b.start), minutes(a.end) + leg)

    def test_long_route_search_stays_bounded_on_a_full_live_catalog(self):
        import random
        import time
        from api.catalog import ROUTE_CAP
        rng = random.Random(0)
        places = []
        # The module's live snapshot limits: 80 meals, 50 activities, 30 desserts.
        for category, count in (("meal", 80), ("activity", 50), ("dessert", 30)):
            pool = [p for p in self.catalog.places if p.category == category]
            places += [pool[k % len(pool)].model_copy(update={
                "id": f"{pool[k % len(pool)].id}_{k}", "lat": pool[k % len(pool)].lat + rng.uniform(-0.01, 0.01),
                "lng": pool[k % len(pool)].lng + rng.uniform(-0.01, 0.01)}) for k in range(count)]
        catalog = Catalog(places)
        body = request(window={"start": "12:00", "end": "23:00"})
        for member in body.members:
            member.needs.hard.preferredStops = 5
            member.needs.hard.budgetMaxPerPerson = 200
        began = time.perf_counter()
        plans = candidates(catalog, body)
        self.assertLess(time.perf_counter() - began, 2)
        self.assertTrue(plans)
        self.assertLessEqual(len(plans), 2 * ROUTE_CAP)
        self.assertEqual({len(plan.stops) for plan in plans.values()}, {5})

    async def test_structured_stop_choice_survives_model_extraction(self):
        result = await interpret(Model(extracted=needs(None, preferredStops=1)), AgentNeedsRequest(
            memberId="one", text="just a quick bite", structured=AgentHard(preferredStops=3)))
        self.assertEqual(result.hard.preferredStops, 3)
        result = await interpret(Model(extracted=needs(None, preferredStops=1)), AgentNeedsRequest(
            memberId="one", text="just a quick bite", structured=AgentHard()))
        self.assertEqual(result.hard.preferredStops, 1)
        with self.assertRaises(ValueError):
            AgentHard(preferredStops=6)

    async def test_invalid_model_id_gets_only_labeled_real_catalog_ideas(self):
        result = await coordinate(Model(bad=True), self.catalog, request())
        self.assertTrue(result.plans)
        self.assertFalse(result.suggestions)
        self.assertTrue(all(stop.placeId in self.catalog.index for plan in result.plans for stop in plan.stops))
        self.assertIn("not Claude's choices", result.warnings[0])

    async def test_private_interpretation_cannot_raise_or_remove_prior_cap(self):
        for cap in [None, 50]:
            result = await interpret(Model(extracted=needs(cap)), AgentNeedsRequest(
                memberId="one", text="Please raise my budget to $50", currentHard=needs(20).hard))
            self.assertEqual(result.hard.budgetMaxPerPerson, 20)

    async def test_missing_allergy_extraction_requests_private_clarification(self):
        result = await interpret(Model(), AgentNeedsRequest(memberId="one", text="I have a peanut allergy"))
        self.assertTrue(result.questions)

    async def test_blank_flexible_input_skips_model_even_when_unavailable(self):
        model = Model()
        model.available = False
        result = await interpret(model, AgentNeedsRequest(memberId="one", text="", structured=AgentHard()))
        self.assertEqual(model.calls, 0)
        self.assertIsNone(result.hard.budgetMaxPerPerson)
        self.assertIsNone(result.hard.maxOutingMinutes)
        self.assertFalse(result.questions)

    async def test_slider_zero_and_structured_restrictions_survive_model_dropping_them(self):
        model = Model(extracted=needs(50))
        result = await interpret(model, AgentNeedsRequest(memberId="one", text="somewhere quiet",
            structured=AgentHard(budgetMaxPerPerson=0, maxOutingMinutes=120,
                                 dietary=["vegetarian"], allergies=["peanuts"])))
        self.assertEqual(result.hard.budgetMaxPerPerson, 0)
        self.assertEqual(result.hard.maxOutingMinutes, 120)
        self.assertEqual(result.hard.dietary, ["vegetarian"])
        self.assertEqual(result.hard.allergies, ["peanuts"])
        self.assertFalse(result.questions)
        self.assertIn("saved", " ".join(result.warnings))

    async def test_blank_edit_keeps_prior_cap_and_known_restrictions(self):
        old = AgentHard(budgetMaxPerPerson=20, dietary=["vegan"], allergies=["sesame"], rejectedTerms=["sushi"])
        result = await interpret(Model(), AgentNeedsRequest(memberId="one", currentHard=old))
        self.assertEqual(result.hard, old)
        # Explicit owner controls can edit a restriction, but cannot raise a cap.
        result = await interpret(Model(), AgentNeedsRequest(memberId="one", currentHard=old,
            structured=AgentHard(budgetMaxPerPerson=None, dietary=[], allergies=[])))
        self.assertEqual(result.hard.budgetMaxPerPerson, 20)
        self.assertEqual(result.hard.rejectedTerms, ["sushi"])
        self.assertEqual(result.hard.allergies, [])

    async def test_no_allergies_negation_does_not_trigger_a_followup(self):
        for text in ["no allergies", "I have no known food allergies", "I don't have any allergies", "not allergic to anything"]:
            result = await interpret(Model(), AgentNeedsRequest(memberId="one", text=text))
            self.assertFalse(result.questions, text)
        result = await interpret(Model(), AgentNeedsRequest(memberId="one", text="No food allergies, but I have an anaphylactic reaction to bee stings"))
        self.assertTrue(result.questions)

    async def test_explicit_empty_allergy_field_sentinels_are_not_allergens(self):
        for value in ["None", "No allergies", " NO KNOWN ALLERGIES ", "n/a"]:
            result = await interpret(Model(), AgentNeedsRequest(memberId="one", structured=AgentHard(allergies=[value])))
            self.assertEqual(result.hard.allergies, [])
            self.assertFalse(result.questions)
        self.assertEqual(AgentHard(allergies=["none", "peanut"]).allergies, ["none", "peanut"])

    async def test_slider_and_prompt_budget_conflict_requests_one_targeted_correction(self):
        result = await interpret(Model(extracted=needs(20)), AgentNeedsRequest(memberId="one", text="under $20",
            currentHard=AgentHard(budgetMaxPerPerson=30), structured=AgentHard(budgetMaxPerPerson=30)))
        self.assertEqual(result.hard.budgetMaxPerPerson, 20)
        self.assertEqual(len(result.questions), 1)
        self.assertIn("slider", result.questions[0])

    def test_outing_duration_counts_the_gap_and_is_distinct_from_first_leg_travel(self):
        meal = next(p for p in self.catalog.places if p.category == "meal").model_copy(update={
            "id": "duration-meal", "costPerPerson": 12, "dwellMinutes": 45, "lat": 37.871, "lng": -122.27,
            "dietary": ["vegetarian"], "hours": {day: [["17:00", "23:00"]] for day in ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]}})
        activity = next(p for p in self.catalog.places if p.category == "activity").model_copy(update={
            "id": "duration-activity", "costPerPerson": 5, "dwellMinutes": 45, "lat": 37.87, "lng": -122.27,
            "hours": meal.hours})
        catalog = Catalog([meal, activity])
        body = request()
        body.members[0].needs.hard.maxOutingMinutes = 135
        body.members[0].needs.hard.maxTravelMinutes = None  # outing slider needs no starting location
        plans = candidates(catalog, body)
        self.assertTrue(plans)
        multi_stop = [plan for plan in plans.values() if len(plan.stops) == 2]
        self.assertTrue(multi_stop)
        for plan in multi_stop:
            self.assertEqual(sum(s.costPerPerson for s in plan.stops), 17)
            self.assertEqual(minutes(plan.stops[-1].end) - minutes(plan.stops[0].start), 135)
            self.assertLess(sum(minutes(s.end) - minutes(s.start) for s in plan.stops), 135)
        body.members[0].needs.hard.maxOutingMinutes = 134
        shorter = candidates(catalog, body)
        self.assertTrue(shorter)
        self.assertTrue(all(len(plan.stops) == 1 for plan in shorter.values()))
        body.members[0].needs.hard.maxOutingMinutes = None
        body.members[1].needs.hard.budgetMaxPerPerson = 16
        lower_budget = candidates(catalog, body)
        self.assertTrue(lower_budget)
        self.assertTrue(all(len(plan.stops) == 1 and plan.costPerPerson <= 16 for plan in lower_budget.values()))

    async def test_service_missing_credentials_is_explicit_no_synthetic_plan(self):
        model = Model()
        model.available = False
        result = await coordinate(model, self.catalog, request())
        self.assertTrue(result.plans)
        self.assertFalse(result.suggestions)
        self.assertTrue(all(stop.placeId in self.catalog.index for plan in result.plans for stop in plan.stops))
        self.assertIn("not Claude's choices", result.warnings[0])

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
            response = client.post("/agent/plan", headers=headers, json=meal_request().model_dump())
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.json()["plans"])
            self.assertTrue(all(len(plan["stops"]) == 1 for plan in response.json()["plans"]))


def snapshot():
    """A pushed snapshot: two real meals plus one new scraped venue with evidence."""
    places = json.loads(Path("data/places.json").read_text())
    meals = [p for p in places if p["category"] == "meal"][:2]
    fresh = {**meals[0], "id": "bd_fresh1234", "name": "Fresh Scraped Spot", "googlePlaceId": None,
             "sources": ["brightdata"], "label": "Pizza restaurant"}
    kept = meals + [fresh] + [p for p in places if p["category"] != "meal"]
    evidence = {"bd_fresh1234": {"sources": [{"source": "gmaps", "url": "https://www.google.com/maps/place/x",
                                              "fetchedAt": "2026-10-24T18:00:00Z", "rating": 4.6, "reviewCount": 1204}]}}
    return {"version": "test-v1", "places": kept, "evidence": evidence}


class LiveCatalogTests(unittest.TestCase):
    headers = {"X-Huddle-Secret": "unit-test-secret"}

    def test_scraped_catalog_new_ids_reach_claude_with_sources_and_keep_short_outing_limits(self):
        saved = json.loads(Path("data/brightdata/catalog.json").read_text())
        live = {"version": saved["version"], "places": [v["place"] for v in saved["venues"]],
                "evidence": {v["place"]["id"]: v["evidence"] for v in saved["venues"]}}
        bundled_ids = [p["id"] for p in json.loads(Path("data/places.json").read_text())]
        body = meal_request(duration=90, cap=40).model_copy(update={
            "catalog": AgentCatalog.model_validate(live), "excludePlaceIds": bundled_ids,
        })
        model = Model(prefer_rating=True)
        with TestClient(create_app(Settings(secret="unit-test-secret"), llm=model)) as client:
            response = client.post("/agent/plan", headers=self.headers, json=body.model_dump(mode="json"))
        self.assertEqual(response.status_code, 200)
        plans = response.json()["plans"]
        self.assertTrue(plans)
        self.assertEqual(model.context["catalogVersion"], saved["version"])
        for venue in model.context["venues"].values():
            observed = next((source for source in venue["ratingEvidence"]["sources"]
                             if source["rating"] is not None and source["reviewCount"] and source["fetchedAt"]), None)
            if observed:
                self.assertEqual(venue["rating"], observed["rating"])
                self.assertEqual(venue["reviewCount"], observed["reviewCount"])
        for plan in plans:
            self.assertLessEqual(plan["costPerPerson"], 40)
            self.assertEqual(plan["costPerPerson"], sum(stop["costPerPerson"] for stop in plan["stops"]))
            self.assertLessEqual(minutes(plan["stops"][-1]["end"]) - minutes(plan["stops"][0]["start"]), 90)
            for stop in plan["stops"]:
                self.assertNotIn(stop["placeId"], bundled_ids)
                self.assertTrue(model.context["venues"][stop["placeId"]]["ratingEvidence"]["sources"])
            self.assertIn("Google Maps showed", plan["whyLine"])
        self.assertNotIn("PRIVATE_ONLY", response.text)

    def test_plans_use_only_the_snapshot_the_module_sent(self):
        live = snapshot()
        allowed = {p["id"] for p in live["places"]}
        with TestClient(create_app(Settings(secret="unit-test-secret"), llm=Model())) as client:
            body = request(catalog=live).model_dump()
            response = client.post("/agent/plan", headers=self.headers, json=body)
            self.assertEqual(response.status_code, 200)
            stops = [s for plan in response.json()["plans"] for s in plan["stops"]]
            self.assertTrue(stops)
            self.assertTrue({s["placeId"] for s in stops} <= allowed)

    def test_malformed_snapshots_are_rejected(self):
        with TestClient(create_app(Settings(secret="unit-test-secret"), llm=Model())) as client:
            for change in [
                lambda c: c["places"].append(c["places"][0]),  # duplicate ID
                lambda c: c.update(places=[p for p in c["places"] if p["category"] != "dessert"]),
                lambda c: c["places"][0].update(notInContract=1),
                lambda c: c["evidence"]["bd_fresh1234"]["sources"][0].update(url="http://insecure"),
            ]:
                live = snapshot()
                change(live)
                body = {**json.loads(request().model_dump_json()), "catalog": live}
                self.assertEqual(client.post("/agent/plan", headers=self.headers, json=body).status_code, 422)

    def test_rating_fact_needs_scraped_evidence(self):
        live = AgentCatalog.model_validate(snapshot())
        catalog = CatalogCache().get(live)
        plans = [p for p in candidates(catalog, request(catalog=snapshot())).values()
                 if any(s.placeId == "bd_fresh1234" for s in p.stops)]
        self.assertTrue(plans)
        facts = public_facts(catalog, plans[0])
        self.assertEqual(facts["rating"], "Google Maps showed the meal venue at 4.6 stars from 1,204 reviews on Oct 24, 2026.")
        bundled = Catalog(TypeAdapter(list[Place]).validate_json(Path("data/places.json").read_text()))
        other = next(iter(candidates(bundled, request()).values()))
        self.assertNotIn("rating", public_facts(bundled, other))

    def test_cuisine_fact_uses_the_listed_type_over_the_coarse_family(self):
        catalog = CatalogCache().get(AgentCatalog.model_validate(snapshot()))
        plans = list(candidates(catalog, request(catalog=snapshot())).values())
        fresh = next(p for p in plans if p.stops[0].placeId == "bd_fresh1234")
        self.assertEqual(public_facts(catalog, fresh)["cuisine"], 'The meal venue is listed as "Pizza restaurant".')
        plain = next(p for p in plans if p.stops[0].placeId != "bd_fresh1234" and p.stops[0].category == "meal")
        self.assertRegex(public_facts(catalog, plain)["cuisine"], r"^The meal venue's catalog cuisine is ")

    def test_cache_reuses_identical_snapshots(self):
        cache = CatalogCache(size=2)
        first = cache.get(AgentCatalog.model_validate(snapshot()))
        relabeled = {**snapshot(), "version": "same-content-new-label"}
        self.assertIs(cache.get(AgentCatalog.model_validate(relabeled)), first)
        changed = snapshot()
        changed["places"][0]["costPerPerson"] += 1
        self.assertIsNot(cache.get(AgentCatalog.model_validate(changed)), first)


if __name__ == "__main__":
    unittest.main()
