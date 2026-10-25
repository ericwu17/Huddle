"""Menu-aware scenarios use synthetic prices/menus, never provider calls."""
import json
from pathlib import Path
import unittest

from api.agent import coordinate
from api.agent_models import AgentCatalog, AgentPlanRequest
from api.catalog import CatalogCache
from api.menu_catalog import enrich_catalog
from api.menu_context import allergy_conflict, allowed_items


def scenario(**hard):
    raw = json.loads(Path("data/places.json").read_text())
    places = [next(p for p in raw if p["category"] == category).copy() for category in ("meal", "dessert", "activity")]
    for p in places:
        p.update(id=p["category"], name="SYNTHETIC TEST " + p["category"], lat=37.87, lng=-122.27,
                 dwellMinutes=30, dietary=[], costPerPerson={"meal": 50, "dessert": 5, "activity": 0}[p["category"]],
                 hours={day: [["09:00", "23:59"]] for day in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")})
    def item(id, name, price, labels):
        return {"id": id, "name": name, "section": "Mains", "description": "", "labels": labels,
                "price": price, "sourceUrl": "https://menu.example.test/menu", "fetchedAt": "2026-10-24T20:00:00Z"}
    evidence = {"meal": {"sources": [], "menu": {"status": "ok", "items": [
        item("vegan", "Vegan entree", 20, ["vegan"]), item("steak", "Steak and fries", 40, []),
        item("peanut", "Peanut tofu bowl", 18, ["vegan"])]}},
        "dessert": {"sources": [], "menu": {"status": "ok", "items": [item("sorbet", "Fruit sorbet", 5, ["vegan"])]}}}
    catalog = AgentCatalog.model_validate({"version": "synthetic-menu-test", "places": places, "evidence": evidence})
    body = AgentPlanRequest.model_validate({"runId": "menu_test", "inputRevision": 1, "date": "2026-10-24",
        "window": {"start": "17:00", "end": "21:00"}, "catalog": catalog.model_dump(), "members": [
            {"memberId": "max", "prompt": "PRIVATE_MAX vegan dinner and dessert", "needs": {"hard": {
                "budgetMaxPerPerson": 30, "dietary": ["vegan"], **hard}}},
            {"memberId": "eric", "prompt": "PRIVATE_ERIC steak and fries then dessert", "needs": {"hard": {"budgetMaxPerPerson": 50}}}]})
    return catalog, body


class MenuModel:
    available = True

    def __init__(self, bad_item=False, unavailable=False):
        self.context = None
        self.bad_item = bad_item
        self.available = not unavailable

    async def call(self, role, system, user, schema, model, timeout, **kwargs):
        self.context = json.loads(user)
        candidates = self.context["candidates"]
        chosen = next((p for p in candidates if {s["placeId"] for s in p["stops"]} == {"meal", "dessert"}), candidates[0])
        orders = []
        for m in self.context["members"]:
            items = []
            for stop in chosen["stops"]:
                place = stop["placeId"]
                if self.context["venues"][place]["category"] == "activity":
                    continue
                desired = ("vegan" if m["memberId"] == "max" else "steak") if place == "meal" else "sorbet"
                if self.bad_item:
                    desired = "invented-item"
                items.append({"placeId": place, "itemId": desired})
            orders.append({"memberId": m["memberId"], "items": items})
        value = {"choices": [{"candidateId": chosen["candidateId"], "reasonIds": ["sequence"], "orders": orders}]}
        kwargs["check"](value)
        return value


class MenuPlannerTests(unittest.IsolatedAsyncioTestCase):
    async def test_person_pays_own_meal_plus_later_stops_not_the_other_meal(self):
        snapshot, body = scenario()
        model = MenuModel()
        result = await coordinate(model, CatalogCache().get(snapshot), body)
        self.assertTrue(result.plans)
        self.assertEqual(result.plans[0].status, "ready")
        self.assertEqual(result.plans[0].costPerPerson, 55)  # unchanged legacy venue baseline
        self.assertEqual(result.plans[0].costRange, {"min": 25, "max": 45})
        self.assertEqual({row.memberId: row.total for row in result.privateOrders}, {"max": 25, "eric": 45})
        self.assertNotIn("PRIVATE_", result.rationale)
        self.assertEqual(result.plans[0].summary, " → ".join(stop.name for stop in result.plans[0].stops))
        self.assertEqual(result.plans[0].costPerPerson, sum(s.costPerPerson for s in result.plans[0].stops))

    async def test_allergy_and_unknown_dietary_evidence_do_not_blank_the_screen(self):
        for hard in ({"allergies": ["peanut"]}, {"dietary": ["kosher"]}):
            snapshot, body = scenario(**hard)
            result = await coordinate(MenuModel(), CatalogCache().get(snapshot), body)
            self.assertTrue(result.plans)
            self.assertEqual(result.plans[0].status, "provisional")
            self.assertNotIn("peanut", result.rationale)
            self.assertEqual(body.members[0].needs.hard.budgetMaxPerPerson, 30)

    async def test_known_conflicting_ingredient_is_not_an_eligible_item(self):
        snapshot, body = scenario(allergies=["peanuts"])
        model = MenuModel()
        await coordinate(model, CatalogCache().get(snapshot), body)
        allowed = model.context["venues"]["meal"]["eligibleItemIdsByMember"]["max"]
        self.assertNotIn("peanut", allowed)
        self.assertNotIn("steak", allowed)
        self.assertIn("vegan", allowed)

    async def test_invented_item_never_becomes_an_order(self):
        snapshot, body = scenario()
        result = await coordinate(MenuModel(bad_item=True), CatalogCache().get(snapshot), body)
        self.assertFalse(result.plans)
        self.assertFalse(result.privateOrders)
        self.assertTrue(result.suggestions)
        self.assertNotIn("invented-item", result.model_dump_json())
        self.assertIn("Claude could not complete", result.warnings[0])

    async def test_zero_cap_and_tiny_window_get_untimed_alternatives_without_relaxation(self):
        snapshot, body = scenario(budgetMaxPerPerson=0, maxOutingMinutes=1)
        result = await coordinate(MenuModel(), CatalogCache().get(snapshot), body)
        self.assertFalse(result.plans)
        self.assertTrue(result.suggestions)
        self.assertIsNone(result.recommendedPlanId)
        self.assertEqual(body.members[0].needs.hard.budgetMaxPerPerson, 0)
        self.assertNotIn("stops", result.suggestions[0].model_dump())

    async def test_missing_price_is_estimated_and_provisional(self):
        snapshot, body = scenario()
        snapshot.evidence["meal"].menu.items[0].price = None
        # Raise cap for the test's unknown-price venue allowance, not in runtime.
        body.members[0].needs.hard.budgetMaxPerPerson = 60
        result = await coordinate(MenuModel(), CatalogCache().get(snapshot), body)
        self.assertEqual(result.plans[0].status, "provisional")
        self.assertEqual(result.privateOrders[0].total, 55)

    async def test_provider_outage_still_shows_labeled_real_catalog_venues(self):
        snapshot, body = scenario()
        result = await coordinate(MenuModel(unavailable=True), CatalogCache().get(snapshot), body)
        self.assertFalse(result.plans)
        self.assertTrue(result.suggestions)
        self.assertIn("catalog suggestions", result.warnings[0])


class RealMenuSidecarTests(unittest.TestCase):
    def test_menu_contract_rejects_bad_sources_dates_and_fractional_cent_prices(self):
        snapshot, _ = scenario()
        for change in ({"sourceUrl": "javascript:alert(1)"}, {"sourceUrl": "https://user:secret@example.test/menu"},
                       {"fetchedAt": "today"}, {"price": 9.999}):
            with self.subTest(change=change):
                raw = snapshot.model_dump()
                raw["evidence"]["meal"]["menu"]["items"][0].update(change)
                with self.assertRaises(ValueError):
                    AgentCatalog.model_validate(raw)

    def test_every_scraped_item_survives_with_source_and_stable_id(self):
        snapshot = json.loads(Path("data/brightdata/catalog.json").read_text())
        details = json.loads(Path("data/brightdata/details.json").read_text())
        result = enrich_catalog(snapshot, details)
        self.assertEqual(result, enrich_catalog(snapshot, details))
        self.assertEqual({v["place"]["id"] for v in result["venues"]},
                         {v["place"]["id"] for v in snapshot["venues"]})
        self.assertEqual(sum(len(v["evidence"]["photos"]) for v in result["venues"]), 386)
        self.assertEqual(sum(len(v["evidence"]["menu"]["items"]) for v in result["venues"]), 950)
        cheese = next(v for v in result["venues"] if v["place"]["id"] == "bd_6cfb614522")
        self.assertIn("pizza", cheese["evidence"]["foodStyle"].casefold())
        self.assertEqual(cheese["evidence"]["menu"]["items"][0]["price"], None)
        self.assertIn("sesame", cheese["evidence"]["menu"]["items"][0]["description"])
        self.assertTrue(all(item["sourceUrl"].startswith(("http://", "https://")) and item["fetchedAt"]
                            for venue in result["venues"] for item in venue["evidence"]["menu"]["items"]))

    def test_explicit_allergen_aliases_do_not_claim_absence(self):
        snapshot, _ = scenario()
        item = snapshot.evidence["meal"].menu.items[0].model_copy(update={"name": "Salad", "description": "tahini dressing"})
        self.assertTrue(allergy_conflict(item, ["sesame"]))
        self.assertFalse(allergy_conflict(item, ["peanut"]))  # unverified, not a safety assertion
