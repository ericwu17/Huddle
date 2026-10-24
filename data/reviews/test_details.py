"""Offline tests for menus and venue details: no network, no model calls.

    python3 -m unittest data/reviews/test_details.py
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import details  # noqa: E402
import source_menus as sm  # noqa: E402

PAGE = """<html><head><script>var menu = "Fake Item $1";</script><style>.x{}</style></head><body>
<nav><a href="/menu">Our Menu</a> <a href="#top">Top</a> <a href="https://other.example/order">Order</a></nav>
<h2>Mains</h2>
<p>Grilled Ribeye Steak &amp; Fries $34 <br>12 oz, garlic butter</p>
<p>Roasted Cauliflower Bowl (VG) $18</p>
<p>Mushroom Tacos (V) $15</p>
<h2>Desserts</h2>
<p>Chocolate Tart $11</p>
<p>V = vegetarian, VG = vegan</p>
</body></html>"""


class Menus(unittest.TestCase):
    def setUp(self):
        self.text, self.links = sm.page_text(PAGE)

    def test_page_text_drops_scripts_and_finds_menu_links(self):
        self.assertNotIn("Fake Item", self.text)
        self.assertIn("Grilled Ribeye Steak & Fries $34", self.text)
        self.assertEqual(sm.menu_links("https://venue.example/", self.links), ["https://venue.example/menu"])

    def test_menu_pdfs_are_followed_by_meal_words(self):
        # Wood Tavern's real links (2026-10-24): PDFs named for the meal, not "menu".
        links = [("/s/WT-DINNER-102226.pdf", "Dinner"), ("/s/WT-DESSERT-101126.pdf", "Dessert"),
                 ("/press-kit.pdf", "Press"), ("/about", "About")]
        self.assertEqual(sm.menu_links("http://www.woodtavern.net/", links),
                         ["http://www.woodtavern.net/s/WT-DINNER-102226.pdf", "http://www.woodtavern.net/s/WT-DESSERT-101126.pdf"])

    def test_only_verbatim_items_survive(self):
        items = [
            {"name": "Grilled Ribeye Steak & Fries", "section": "Mains", "priceText": "$34", "description": "12 oz, garlic butter",
             "labels": [], "quote": "Grilled Ribeye Steak & Fries $34"},
            {"name": "Roasted Cauliflower Bowl", "section": "Mains", "priceText": "$18", "description": None,
             "labels": ["VG"], "quote": "Roasted Cauliflower Bowl (VG) $18"},
            {"name": "Mushroom Tacos", "section": "Mains", "priceText": "$15", "description": None,
             "labels": ["V"], "quote": "Mushroom Tacos (V) $15"},
            {"name": "Chocolate Tart", "section": "Desserts", "priceText": "$11", "description": None,
             "labels": [], "quote": "Chocolate Tart $11"},
            # Invented by the model: not on the page.
            {"name": "Vegan Cheesecake", "section": "Desserts", "priceText": "$12", "description": None,
             "labels": ["vegan"], "quote": "Vegan Cheesecake $12"},
            # A price that the quote does not contain.
            {"name": "Chocolate Tart", "section": "Desserts", "priceText": "$9", "description": None,
             "labels": [], "quote": "Chocolate Tart $11"},
            # A label the quote does not contain.
            {"name": "Chocolate Tart", "section": "Desserts", "priceText": "$11", "description": None,
             "labels": ["GF"], "quote": "Chocolate Tart $11"},
        ]
        kept, dropped, legend = sm.verify(items, self.text, "https://venue.example/menu", "2026-10-24T20:00:00Z",
                                          "V = vegetarian, VG = vegan")
        self.assertEqual(dropped, 3)
        self.assertEqual([i["name"] for i in kept], ["Grilled Ribeye Steak & Fries", "Roasted Cauliflower Bowl",
                                                     "Mushroom Tacos", "Chocolate Tart"])
        self.assertEqual(kept[0]["price"], 34.0)
        self.assertEqual(kept[1]["labels"], [{"text": "VG", "tag": "vegan"}])
        self.assertEqual(kept[2]["labels"], [{"text": "V", "tag": "vegetarian"}])  # mapped by the page's own legend
        self.assertEqual(legend, "V = vegetarian, VG = vegan")

    def test_labels_without_a_legend_stay_unknown(self):
        self.assertIsNone(sm.map_label("V", None))
        self.assertEqual(sm.map_label("(vegan)", None), "vegan")
        self.assertEqual(sm.map_label("GF", None), "gluten_free")
        kept, _, legend = sm.verify([{"name": "Mushroom Tacos", "section": None, "priceText": "$15",
                                      "description": None, "labels": ["V"], "quote": "Mushroom Tacos (V) $15"}],
                                    self.text, "u", "t", "V = vegan")  # a legend the page does not print
        self.assertIsNone(legend)
        self.assertEqual(kept[0]["labels"], [{"text": "V", "tag": None}])

    def test_prices(self):
        self.assertEqual(sm.price_value("$14.50"), 14.5)
        self.assertIsNone(sm.price_value("MP"))
        self.assertIsNone(sm.price_value("$12-16"))  # a range is not one price
        self.assertIsNone(sm.price_value(None))


ITEMS = [
    {"name": "Grilled Ribeye Steak & Fries", "section": "Mains", "priceText": "$34", "price": 34.0, "description": None,
     "labels": [], "quote": "Grilled Ribeye Steak & Fries $34", "sourceUrl": "https://venue.example/menu",
     "fetchedAt": "2026-10-24T20:00:00Z"},
    {"name": "Roasted Cauliflower Bowl", "section": "Mains", "priceText": "$18", "price": 18.0, "description": None,
     "labels": [{"text": "VG", "tag": "vegan"}], "quote": "Roasted Cauliflower Bowl (VG) $18",
     "sourceUrl": "https://venue.example/menu", "fetchedAt": "2026-10-24T20:00:00Z"},
    {"name": "Vegan Chili", "section": "Mains", "priceText": None, "price": None, "description": None,
     "labels": [{"text": "V", "tag": None}], "quote": "Vegan Chili (V)", "sourceUrl": "https://venue.example/menu",
     "fetchedAt": "2026-10-24T20:00:00Z"},
    {"name": "Chocolate Tart", "section": "Desserts", "priceText": "$11", "price": 11.0, "description": None,
     "labels": [], "quote": "Chocolate Tart $11", "sourceUrl": "https://venue.example/menu",
     "fetchedAt": "2026-10-24T20:00:00Z"},
]


class Details(unittest.TestCase):
    place = {"id": "bd_test", "name": "Test Grill", "category": "meal", "googlePlaceId": "ChIJt", "priceLevel": None,
             "costPerPerson": 25, "dietary": [], "rating": 4.5, "reviewCount": 100}
    row = {"name": "Test Grill", "lat": 37.87, "lng": -122.27,
           "google": {"place_id": "ChIJt", "url": "https://www.google.com/maps/place/t", "rating": 4.5,
                      "reviews_count": 100, "review_distribution": None, "categories": ["Vegetarian restaurant"],
                      "services": ["Wheelchair-accessible seating"], "order_links": [], "located_in": None,
                      "photos": ["https://lh3.googleusercontent.com/p"]}, "yelp": None}
    park = {"name": "Civic Center Park", "lat": 37.8705, "lng": -122.27,
            "google": {"place_id": "ChIJp", "url": "https://www.google.com/maps/place/p", "categories": ["Park"]}}
    fetched = {("gmaps", "ChIJt"): "2026-10-24T19:38:32Z"}

    def test_unknowns_stay_null_with_a_reason(self):
        d = details.venue_details(self.place, self.row, None, None, self.fetched, [self.row])
        self.assertEqual(d["takeout"], {"value": None, "source": None, "url": None, "fetchedAt": None,
                                        "reason": "not looked up on Google Places yet"})
        self.assertIsNone(d["seating"]["outdoorSeating"]["value"])
        self.assertIsNone(d["onlineOrdering"]["value"])
        self.assertEqual(d["menu"]["status"], "unknown")
        gp = {"fetchedAt": "2026-10-24T21:00:00Z", "googleMapsUri": "https://maps.google.com/?cid=1",
              "takeout": True, "dineIn": None, "outdoorSeating": False, "delivery": None,
              "servesVegetarianFood": None, "photos": []}
        d = details.venue_details(self.place, self.row, gp, None, self.fetched, [self.row])
        self.assertEqual(d["takeout"]["value"], True)
        self.assertEqual(d["takeout"]["source"], "google_places")
        self.assertIs(d["seating"]["outdoorSeating"]["value"], False)  # stated false is kept as false
        self.assertEqual(d["seating"]["dineIn"]["reason"], "the Google Places listing does not say")

    def test_seating_and_photos_carry_sources(self):
        d = details.venue_details(self.place, self.row, None, None, self.fetched, [self.row, self.park])
        self.assertEqual(d["seating"]["listedSeating"]["value"], True)
        self.assertEqual(d["seating"]["listedSeating"]["fetchedAt"], "2026-10-24T19:38:32Z")
        near = d["seating"]["nearbyPublicSpaces"]
        self.assertEqual((near[0]["name"], near[0]["distanceM"]), ("Civic Center Park", 56))
        self.assertIn("not verified", near[0]["basis"])
        self.assertEqual(d["photos"][0]["source"], "gmaps")
        self.assertIsNone(d["photos"][0]["attribution"])
        self.assertIn("does not name its author", d["photos"][0]["attributionNote"])

    def test_dietary_evidence_tiers_and_highlights(self):
        menu = {"status": "ok", "items": ITEMS, "pages": [], "legend": None}
        d = details.venue_details(self.place, self.row, None, menu, self.fetched, [self.row])
        explicit = [(x["tag"], x["item"], x["basis"]) for x in d["dietary"] if x["evidence"] == "explicit_menu"]
        self.assertIn(("vegan", "Roasted Cauliflower Bowl", 'printed label "VG"'), explicit)
        self.assertIn((None, "Vegan Chili", 'printed label "V" (meaning not stated on the page; tag unknown)'), explicit)
        self.assertIn(("vegan", "Vegan Chili", "the item's own menu text"), explicit)
        inferred = [(x["tag"], x["basis"]) for x in d["dietary"] if x["evidence"] == "inferred"]
        self.assertEqual(inferred, [("vegetarian", 'Google Maps category "Vegetarian restaurant"')])
        self.assertEqual(d["dietaryCoverage"], "explicit_menu")
        self.assertIn("cross-contact", d["safetyNote"])
        h = d["menu"]["highlights"]
        self.assertEqual([x["name"] for x in h["vegan"]], ["Roasted Cauliflower Bowl", "Vegan Chili"])
        self.assertEqual([x["name"] for x in h["steak"]], ["Grilled Ribeye Steak & Fries"])
        self.assertEqual([x["name"] for x in h["fries"]], ["Grilled Ribeye Steak & Fries"])
        self.assertEqual([x["name"] for x in h["dessert"]], ["Chocolate Tart"])

    def test_feed_and_negations_are_not_dietary_claims(self):
        item = {**ITEMS[0], "name": "Mini Burger", "section": "Burgers",
                "description": "One 1/4 lb all-natural, vegetarian-fed beef patty", "quote": "Mini Burger"}
        d = details.venue_details(self.place, {**self.row, "google": {**self.row["google"], "categories": ["Hamburger restaurant"]}},
                                  None, {"status": "ok", "items": [item, {**item, "name": "Fries", "description": "not vegan"}]},
                                  self.fetched, [self.row])
        self.assertEqual(d["dietary"], [])
        self.assertEqual(d["dietaryCoverage"], "unknown")

    def test_section_heading_is_menu_evidence(self):
        item = {**ITEMS[3], "name": "Buffalo Fried Chicken", "section": "Plant-based customer favorites",
                "quote": "Buffalo Fried Chicken"}
        d = details.venue_details(self.place, self.row, None, {"status": "ok", "items": [item]}, self.fetched, [self.row])
        ev = [x for x in d["dietary"] if x["evidence"] == "explicit_menu"]
        self.assertEqual([(x["tag"], x["basis"]) for x in ev],
                         [("vegan", 'the menu section heading "Plant-based customer favorites"')])
        self.assertEqual([x["name"] for x in d["menu"]["highlights"]["vegan"]], ["Buffalo Fried Chicken"])


if __name__ == "__main__":
    unittest.main()
