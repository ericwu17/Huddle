"""Offline tests for the Bright Data collector: no API key, no network.

    python3 -m unittest data/reviews/test_collect.py

Records are hand-made in the shape of the fields listed in brightdata_googlemaps.md and
brightdata.com's Yelp sample; they are not real data.
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import brightdata as bd  # noqa: E402
import collect  # noqa: E402
import source_gmaps  # noqa: E402
import source_places  # noqa: E402
import source_yelp  # noqa: E402

WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def gmaps_rec(place_id, name, lat, lon, categories, **extra):
    rec = {
        "place_id": place_id, "cid": "123", "url": f"https://www.google.com/maps/place/x?hl=en-LK&pid={place_id}",
        "name": name, "category": categories[0], "all_categories": categories,
        "category_index": {"gcid": "gcid:thai_restaurant"}, "address": "2068 University Ave, Berkeley, CA 94704",
        "lat": lat, "lon": lon, "phone_number": "(510) 898-1123", "rating": 4.4, "reviews_count": 1625,
        "review_distribution": {"1": 50, "2": 50, "3": 125, "4": 400, "5": 1000},
        "open_hours": {d: "11 AM–9:30 PM" for d in WEEK}, "is_claimed": True,
        "permanently_closed": False, "temporarily_closed": False,
        "services_provided": [" Vegetarian options", "Does not have assistive hearing loop"],
        "reservation_link": "https://example.com/book?hl=en-BR",
        "top_reviews": [{"review": "Great curry", "rating": 5, "reviewer_name": "https://maps/contrib/1",
                         "reviewer_image_url": "https://img/1"}],
        "discovery_input": {"keyword": "restaurants", "lat": 37.87, "long": -122.27},
    }
    rec.update(extra)
    return rec


def yelp_rec(biz_id, name, lat, lng, categories, **extra):
    rec = {"business_id": biz_id, "name": name, "url": f"https://www.yelp.com/biz/{biz_id}?osq=boba",
           "overall_rating": 4.5, "reviews_count": "1,204", "is_claimed": True, "categories": categories,
           "price_range": "$$", "latitude": lat, "longitude": lng, "phone_number": "+1 510-898-1123",
           "address": "2068 University Ave", "openning_hours": [{"day": "Mon", "hours": "11:00 AM - 9:00 PM"}]}
    rec.update(extra)
    return rec


class Hours(unittest.TestCase):
    def test_ranges(self):
        self.assertEqual(collect.parse_ranges("11 AM–9:30 PM"), [["11:00", "21:30"]])
        self.assertEqual(collect.parse_ranges("11 AM–12 AM"), [["11:00", "23:59"]])  # past midnight capped
        self.assertEqual(collect.parse_ranges("5–9 PM"), [["17:00", "21:00"]])
        self.assertEqual(collect.parse_ranges("11–2:30 PM, 5–10 PM"), [["11:00", "14:30"], ["17:00", "22:00"]])
        self.assertEqual(collect.parse_ranges("11:00 AM - 9:00 PM"), [["11:00", "21:00"]])
        # Real Maps split shift (2026-10-24 run): lunch and dinner on separate lines.
        self.assertEqual(collect.parse_ranges("11\u202fAM\u20132:30\u202fPM\n5\u20138:30\u202fPM"),
                         [["11:00", "14:30"], ["17:00", "20:30"]])
        self.assertEqual(collect.parse_ranges("9\u202fam\u20133\u202fpm\n5\u20139\u202fpm"),
                         [["09:00", "15:00"], ["17:00", "21:00"]])
        self.assertEqual(collect.parse_ranges("Closed"), [])
        self.assertEqual(collect.parse_ranges("Open 24 hours"), [["00:00", "23:59"]])
        self.assertIsNone(collect.parse_ranges("Hours might differ"))

    def test_week_shapes(self):
        h = collect.parse_hours({"Monday": "11 AM–9 PM", "Tuesday": "Closed"})
        self.assertEqual(list(h), ["mon", "tue", "wed", "thu", "fri", "sat", "sun"])
        self.assertEqual(h["mon"], [["11:00", "21:00"]])
        self.assertEqual(h["tue"], [])
        self.assertEqual(h["sun"], [])  # unlisted day = closed
        self.assertEqual(collect.parse_hours([{"day": "Fri", "hours": ["11:00 AM - 2:00 PM", "5:00 PM - 11:00 PM"]}])
                         ["fri"], [["11:00", "14:00"], ["17:00", "23:00"]])
        self.assertEqual(collect.parse_hours(["Saturday: 10 AM–6 PM"])["sat"], [["10:00", "18:00"]])
        self.assertIsNone(collect.parse_hours({"Monday": "Closed"}))
        self.assertIsNone(collect.parse_hours(None))


class Classify(unittest.TestCase):
    def test_groups(self):
        self.assertEqual(collect.classify(["Thai restaurant", "Restaurant"]), ("restaurant", "meal"))
        self.assertEqual(collect.classify(["Thai"]), ("restaurant", "meal"))  # Yelp style
        self.assertEqual(collect.classify(["Bubble Tea", "Juice Bars & Smoothies"]), ("boba", "dessert"))
        self.assertEqual(collect.classify(["Cafe", "Restaurant"]), ("hangout", "dessert"))  # cafe, not a meal
        self.assertEqual(collect.classify(["Board game cafe"]), ("hangout", "activity"))
        self.assertEqual(collect.classify(["Sushi bar"]), ("restaurant", "meal"))
        self.assertEqual(collect.classify(["Bar & grill"]), ("restaurant", "meal"))
        self.assertEqual(collect.classify(["Cocktail bar"]), ("hangout", "activity"))
        self.assertEqual(collect.classify(["Barbecue restaurant"]), ("restaurant", "meal"))
        self.assertEqual(collect.classify(["Park"]), ("hangout", "activity"))
        self.assertEqual(collect.classify(["Wine bar"]), ("hangout", "activity"))
        self.assertIsNone(collect.classify(["Supermarket", "Cafe", "Deli"]))  # Berkeley Bowl
        self.assertEqual(collect.classify(["Bubble tea store", "Cafe"]), ("boba", "dessert"))
        self.assertIsNone(collect.classify(["Wine store"]))  # real 2026-10-24 record: a shop, not a hangout
        self.assertIsNone(collect.classify(["Parking garage"]))
        self.assertIsNone(collect.classify(["Hardware store"]))

    def test_cuisine_cost_diet(self):
        self.assertEqual(collect.cuisine_for(["Latin American restaurant"]), "latin")
        self.assertEqual(collect.cuisine_for(["Burgers"]), "american")
        self.assertEqual(collect.cuisine_for(["Sushi Bars"]), "asian")
        self.assertEqual(collect.cuisine_for(["Pizza"]), "mediterranean")
        self.assertEqual(collect.activity_cost(["Bowling alley"]), 25)
        self.assertEqual(collect.activity_cost(["Park"]), 0)
        self.assertEqual(collect.activity_cost(["Cocktail bar"]), 10)
        self.assertEqual(collect.diets(["Vegetarian options", "No vegan options", "Halal"]), ["vegetarian", "halal"])
        self.assertEqual(source_yelp.price_level("$$$"), 3)
        self.assertIsNone(source_yelp.price_level("Moderate"))


class Normalize(unittest.TestCase):
    def test_gmaps(self):
        row = source_gmaps.normalize(gmaps_rec("ChIJa", "Imm Thai", 37.8719, -122.2691, ["Thai restaurant"]))
        self.assertEqual(row["url"], "https://www.google.com/maps/place/x")
        self.assertEqual(row["reservation_link"], "https://example.com/book")
        self.assertEqual(row["top_reviews"], [{"review": "Great curry", "rating": 5}])
        self.assertEqual(row["services"], ["Vegetarian options", "Does not have assistive hearing loop"])
        self.assertEqual(row["phone"], "+15108981123")
        self.assertEqual(row["gcids"], ["gcid:thai_restaurant"])
        self.assertEqual(row["found_by"]["keyword"], "restaurants")
        self.assertIsNone(source_gmaps.normalize({"error": "dead page", "input": {"url": "x"}}))

    def test_yelp(self):
        row = source_yelp.normalize(yelp_rec("imm-thai-berkeley", "Imm Thai Street Food", 37.8720, -122.2692,
                                             [{"title": "Thai"}]))
        self.assertEqual(row["url"], "https://www.yelp.com/biz/imm-thai-berkeley")
        self.assertEqual((row["price_level"], row["categories"], row["phone"]), (2, ["Thai"], "+15108981123"))
        self.assertIsNone(source_yelp.normalize({"error_code": "dead_page"}))

    def test_grid_and_inputs(self):
        pts = source_gmaps.grid(collect.fp.BERKELEY)
        self.assertEqual(len(pts), 12)
        self.assertTrue(all(collect.in_box(lat, lng) for lat, lng in pts))
        self.assertEqual(len(source_gmaps.discover_inputs(pts, ["boba", "bars"])), 24)
        self.assertIn("find_desc=bubble+tea", source_yelp.discover_inputs(["bubble tea"], "url")[0]["url"])


class Matching(unittest.TestCase):
    def test_same_place(self):
        a = {"name": "Imm Thai Street Food", "lat": 37.8719, "lng": -122.2691, "phone": ""}
        self.assertTrue(collect.same_place(a, {"name": "Imm Thai", "lat": 37.8721, "lng": -122.2692, "phone": ""}))
        # Next door, different name: not the same place.
        self.assertFalse(collect.same_place(a, {"name": "Sliver Pizzeria", "lat": 37.8720, "lng": -122.2691,
                                                "phone": ""}))
        # Same name across town: not the same place.
        self.assertFalse(collect.same_place(a, {"name": "Imm Thai", "lat": 37.8600, "lng": -122.2550, "phone": ""}))
        # A different Google place next door never takes a catalog place's id (real 2026-10-24 case).
        catalog = [{"id": "p_008", "googlePlaceId": "ChIJcomal", "name": "Comal", "lat": 37.8697, "lng": -122.2685, "phone": ""}]
        nextdoor = {"name": "Comal Next Door", "lat": 37.8697, "lng": -122.2686, "phone": ""}
        self.assertIsNone(collect.catalog_match(nextdoor, {"place_id": "ChIJnextdoor"}, catalog))
        self.assertEqual(collect.catalog_match(nextdoor, {"place_id": "ChIJcomal"}, catalog)["id"], "p_008")
        self.assertEqual(collect.catalog_match({**nextdoor, "name": "Comal"}, None, catalog)["id"], "p_008")  # Yelp-only
        # Same phone, no coordinates on one side.
        self.assertTrue(collect.same_place({**a, "phone": "+15105551234"},
                                           {"name": "IMM", "lat": None, "lng": None, "phone": "+15105551234"}))


class BuildAndMerge(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        tmp = Path(self.tmp.name)
        self.saved = (bd.RAW, collect.OUT, collect.PLACES)
        bd.RAW, collect.OUT, collect.PLACES = tmp / "raw", tmp / "brightdata", tmp / "places.json"
        self.catalog = [{
            "id": "p_001", "googlePlaceId": "ChIJa", "name": "Imm Thai Street Food", "category": "meal",
            "cuisine": "asian", "address": "2068 University Ave", "lat": 37.8719, "lng": -122.2691,
            "priceLevel": None, "costPerPerson": 25, "dwellMinutes": 75, "phone": "+15108981123", "dietary": [],
            "hours": {d: [["11:00", "21:30"]] for d in ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]},
            "aspects": {a: {"mean": 0.5, "sd": 0.25} for a in collect.fp.ASPECTS},
            "reviewCount": 1625, "rating": 4.4, "sources": ["google"]}]
        collect.write_json(collect.PLACES, self.catalog)
        bd.save_raw("gmaps", "discover", {}, [], [
            gmaps_rec("ChIJa", "Imm Thai Street Food", 37.8719, -122.2691, ["Thai restaurant"]),
            gmaps_rec("ChIJb", "Boba Guys", 37.8690, -122.2680, ["Bubble tea store"], phone_number="(510) 555-0101",
                      reviews_count=300),
            gmaps_rec("ChIJc", "Gone Diner", 37.8700, -122.2700, ["Diner"], permanently_closed=True),
            gmaps_rec("ChIJd", "Oakland Spot", 37.8000, -122.2700, ["Restaurant"], phone_number="(510) 555-0102"),
            {"error": "dead_page", "input": {"url": "x"}},
        ])
        bd.save_raw("yelp", "discover", {}, [], [
            yelp_rec("imm-thai-berkeley", "Imm Thai", 37.8720, -122.2692, ["Thai"]),
            yelp_rec("arcade-x", "Arcade X", 37.8650, -122.2600, ["Arcades"], phone_number="(510) 555-0103",
                     price_range=None, reviews_count=80,
                     openning_hours={"Fri": "4:00 PM - 12:00 AM", "Sat": "12:00 PM - 12:00 AM"}),
        ])

    def tearDown(self):
        bd.RAW, collect.OUT, collect.PLACES = self.saved
        self.tmp.cleanup()

    def test_build(self):
        rows = {r["name"]: r for r in collect.build(log=lambda *_: None)}
        self.assertEqual(set(rows), {"Imm Thai Street Food", "Boba Guys", "Oakland Spot", "Arcade X"})
        imm = rows["Imm Thai Street Food"]
        self.assertEqual((imm["huddleId"], imm["group"], imm["yelp"]["biz_id"]), ("p_001", "restaurant",
                                                                                 "imm-thai-berkeley"))
        self.assertEqual(rows["Boba Guys"]["group"], "boba")
        self.assertEqual((rows["Arcade X"]["group"], rows["Arcade X"]["category"]), ("hangout", "activity"))
        self.assertNotIn("reviewer_name", json.dumps(rows))
        snaps = json.loads((collect.OUT / "snapshots.json").read_text())
        self.assertEqual(len(snaps), 6)  # 4 gmaps + 2 yelp, the closed diner included
        collect.build(log=lambda *_: None)  # idempotent: no duplicate snapshots
        self.assertEqual(len(json.loads((collect.OUT / "snapshots.json").read_text())), 6)

    def test_merge(self):
        rows = collect.build(log=lambda *_: None)
        merged = collect.merge(self.catalog, rows, {"meal": 5, "dessert": 5, "activity": 5}, log=lambda *_: None)
        by_name = {p["name"]: p for p in merged}
        imm = by_name["Imm Thai Street Food"]
        self.assertEqual(imm["id"], "p_001")
        self.assertEqual((imm["priceLevel"], imm["dietary"], imm["sources"]), (2, ["vegetarian"],
                                                                                ["google", "brightdata"]))
        self.assertEqual((imm["rating"], imm["reviewCount"], imm["costPerPerson"]), (4.4, 1625, 25))
        self.assertNotIn("Oakland Spot", by_name)  # outside the Berkeley rectangle
        boba, arcade = by_name["Boba Guys"], by_name["Arcade X"]
        self.assertEqual((boba["category"], boba["cuisine"], boba["costPerPerson"]), ("dessert", "cafe_dessert", 9))
        self.assertEqual((arcade["category"], arcade["costPerPerson"], arcade["googlePlaceId"]), ("activity", 25, None))
        # New venues get ids from their source key, the same on every run.
        self.assertEqual(boba["id"], collect.stable_id({"bdId": "g:ChIJb"}))
        self.assertRegex(arcade["id"], r"^bd_[0-9a-f]{10}$")
        self.assertEqual(arcade["hours"]["fri"], [["16:00", "23:59"]])
        self.assertEqual(arcade["reviewCount"], 80)
        for p in merged:
            self.assertEqual(list(p), collect.PLACE_KEYS)
        self.assertEqual(collect.fp.validate(merged), [])
        # Running merge again adds nothing new; merging from the original catalog gives the same ids.
        again = collect.merge(merged, rows, {"meal": 5, "dessert": 5, "activity": 5}, log=lambda *_: None)
        self.assertEqual(len(again), len(merged))
        fresh = collect.merge(self.catalog, rows, {"meal": 5, "dessert": 5, "activity": 5}, log=lambda *_: None)
        self.assertEqual([p["id"] for p in fresh], [p["id"] for p in merged])

    def test_priced_merge_looks_up_new_meals_once(self):
        bd.save_raw("gmaps", "discover", {}, [], [
            gmaps_rec("ChIJe", "Pricey Place", 37.8705, -122.2690, ["French restaurant"], phone_number="(510) 555-0201",
                      reviews_count=900),
            gmaps_rec("ChIJf", "Unpriced Place", 37.8706, -122.2650, ["Thai restaurant"], phone_number="(510) 555-0202",
                      reviews_count=800),
            gmaps_rec("ChIJg", "Third Place", 37.8707, -122.2620, ["Pizza restaurant"], phone_number="(510) 555-0203",
                      reviews_count=700),
            gmaps_rec("ChIJh", "Flaky Place", 37.8708, -122.2600, ["Burger restaurant"], phone_number="(510) 555-0204",
                      reviews_count=600),
        ])
        rows = collect.build(log=lambda *_: None)
        answers = {"ChIJe": "PRICE_LEVEL_EXPENSIVE", "ChIJf": None, "ChIJg": "PRICE_LEVEL_INEXPENSIVE"}
        calls = []

        def fake(key, gid):
            calls.append(gid)
            if gid == "ChIJh":
                return {"priceLevel": None, "fetchedAt": "2026-10-24T20:00:00Z", "error": "HTTP 503"}
            return {"priceLevel": answers[gid], "fetchedAt": "2026-10-24T20:00:00Z"}
        saved = (source_places.lookup, source_places.load_key)
        source_places.lookup, source_places.load_key = fake, lambda: "test-key"
        try:
            merged, prices = collect.priced_merge(self.catalog, rows, {"meal": 2}, log=lambda *_: None)
            again, _ = collect.priced_merge(self.catalog, rows, {"meal": 2}, log=lambda *_: None)
        finally:
            source_places.lookup, source_places.load_key = saved
        new = {p["name"]: p for p in merged if p["id"].startswith("bd_")}
        self.assertEqual(set(new), {"Pricey Place", "Third Place"})  # the unpriced one is passed over
        self.assertEqual((new["Pricey Place"]["priceLevel"], new["Pricey Place"]["costPerPerson"]), (3, 45))
        self.assertEqual((new["Third Place"]["priceLevel"], new["Third Place"]["costPerPerson"]), (1, 12))
        self.assertNotIn("ChIJh", prices)  # a failed lookup is not cached as "no price"
        self.assertEqual([p["id"] for p in again], [p["id"] for p in merged])
        self.assertEqual(calls.count("ChIJe"), 1)  # cached in prices.json: paid once
        payload = collect.snapshot_payload(merged, rows, [], "2026-10-24T20:00:00Z", prices)
        ev = next(v["evidence"] for v in payload["venues"] if v["place"]["name"] == "Pricey Place")
        self.assertEqual(ev["sources"][0], {"source": "google_places", "url": None,
                                            "fetchedAt": "2026-10-24T20:00:00Z", "rating": None, "reviewCount": None})

    def test_publish_payload(self):
        rows = collect.build(log=lambda *_: None)
        catalog = collect.merge(self.catalog, rows, {"dessert": 5, "activity": 5}, log=lambda *_: None)
        snaps = json.loads((collect.OUT / "snapshots.json").read_text())
        payload = collect.snapshot_payload(catalog, rows, snaps, "2026-10-24T18:00:00Z")
        self.assertTrue(payload["version"].startswith("2026-10-24T18:00:00Z-"))
        by_id = {v["place"]["id"]: v for v in payload["venues"]}
        imm = by_id["p_001"]["evidence"]["sources"]
        self.assertEqual([s["source"] for s in imm], ["gmaps", "yelp"])
        self.assertEqual(imm[0]["url"], "https://www.google.com/maps/place/x")
        self.assertEqual((imm[0]["rating"], imm[0]["reviewCount"]), (4.4, 1625))
        self.assertEqual(imm[1]["reviewCount"], 1204)  # "1,204" from Yelp
        self.assertTrue(all(s["fetchedAt"] for s in imm))
        for v in payload["venues"]:
            self.assertEqual(list(v["place"]), collect.PLACE_KEYS)
        # Same inputs, same version digest: a re-publish of unchanged data is recognisable.
        again = collect.snapshot_payload(catalog, rows, snaps, "2026-10-24T18:00:00Z")
        self.assertEqual(again["version"], payload["version"])


if __name__ == "__main__":
    unittest.main()
