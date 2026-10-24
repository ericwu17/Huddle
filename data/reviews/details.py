"""One venue-details record per catalog venue: ratings, takeout, seating, photos, menu and
dietary evidence, each fact with its source, URL and fetch time.

Inputs are the stores the other steps write: data/brightdata/places.json (Google Maps through
Bright Data), google_places.json (source_places) and menus.json (source_menus).

Rules:
- Unknown stays unknown: a missing fact is {"value": null, "reason": ...}, never false.
- Dietary tags say how they are known. "explicit_menu" means printed on the venue's own menu
  (a label next to the item, or the item's own text). "inferred" means a listing attribute or
  category, not menu evidence.
- No dietary tag, explicit or not, establishes allergen or cross-contact safety (SAFETY_NOTE).
"""

from __future__ import annotations

import math
import re

from source_menus import dedupe

SAFETY_NOTE = ("Dietary tags describe how items are listed or labeled. They do not establish allergen "
               "or cross-contact safety; confirm with the venue.")
NEARBY_M = 250
PUBLIC_SEATING = re.compile(r"\b(park|plaza|garden|square|green)\b", re.I)
STEAK = re.compile(r"\b(steak|ribeye|rib-eye|sirloin|filet mignon|strip loin|carne asada|bistec|tri-tip|skirt)\b", re.I)
FRIES = re.compile(r"\b(fries|frites|french fry|french-fried)\b", re.I)
DESSERT = re.compile(r"\b(desserts?|sweets|cakes?|cheesecake|gelato|ice cream|pie|tiramisu|brownie|cookies?|churros?|"
                     r"flan|pudding|mochi|sundae|panna cotta|tart|cr[eè]me br[uû]l[eé]e|baklava|sorbet)\b", re.I)
TEXT_DIETS = [("vegan", re.compile(r"\b(vegan|plant[- ]based)\b", re.I)), ("vegetarian", re.compile(r"\bvegetarian\b", re.I)),
              ("gluten_free", re.compile(r"\bgluten[- ]free\b", re.I))]
# Removed before matching: they mention a diet without claiming it for the dish
# ("vegetarian-fed beef" on Super Duper's real menu, 2026-10-24; "non-vegan", "not gluten-free").
NOT_A_CLAIM = re.compile(r"\b(?:not|non|no)[- ](?:vegan|vegetarian|gluten[- ]free|plant[- ]based)\b"
                         r"|\b(?:vegan|vegetarian|grass|grain|corn)[- ]fed\b", re.I)


def claims(pattern: re.Pattern, text: str) -> bool:
    return bool(pattern.search(NOT_A_CLAIM.sub(" ", text or "")))


def fact(value, source, url, fetched_at, basis=None, reason=None) -> dict:
    out = {"value": value, "source": source if value is not None else None, "url": url if value is not None else None,
           "fetchedAt": fetched_at if value is not None else None}
    if basis and value is not None:
        out["basis"] = basis
    if value is None:
        out["reason"] = reason or "not stated by any source we read"
    return out


def unknown(reason: str) -> dict:
    return fact(None, None, None, None, reason=reason)


def meters(lat1, lng1, lat2, lng2) -> float:
    if None in (lat1, lng1, lat2, lng2):
        return math.inf
    p1, p2 = math.radians(lat1), math.radians(lat2)
    h = (math.sin((p2 - p1) / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2)
    return 2 * 6371000 * math.asin(math.sqrt(h))


def places_fact(gp: dict | None, field: str, basis: str) -> dict:
    if gp is None:
        return unknown("not looked up on Google Places yet")
    if gp.get(field) is None:
        return unknown("the Google Places listing does not say")
    return fact(gp[field], "google_places", gp.get("googleMapsUri"), gp.get("fetchedAt"), basis)


def ratings(row: dict | None, fetched: dict) -> list[dict]:
    out = []
    for source, sub, key in (("gmaps", (row or {}).get("google"), "place_id"), ("yelp", (row or {}).get("yelp"), "biz_id")):
        if sub and sub.get("rating") is not None:
            out.append({"source": source, "rating": sub["rating"], "reviewCount": sub.get("reviews_count"),
                        "reviewDistribution": sub.get("review_distribution"), "url": sub.get("url"),
                        "fetchedAt": fetched.get((source, sub[key]))})
    return out


def seating(row: dict | None, gp: dict | None, all_rows: list[dict], maps_at: str | None) -> dict:
    g = (row or {}).get("google") or {}
    notes = [s for s in g.get("services") or [] if re.search(r"seating", s, re.I)]
    listed = fact(True, "gmaps", g.get("url"), maps_at, f"Google Maps accessibility note: \"{notes[0]}\"") if notes \
        else unknown("the Google Maps listing has no seating note")
    nearby = []
    if row and row.get("lat") is not None:
        for other in all_rows:
            og = other.get("google") or {}
            if other is row or not og.get("categories") or not PUBLIC_SEATING.search(og["categories"][0]):
                continue
            d = meters(row["lat"], row["lng"], other["lat"], other["lng"])
            if d <= NEARBY_M:
                nearby.append({"name": other["name"], "kind": og["categories"][0], "distanceM": round(d),
                               "source": "gmaps", "url": og.get("url"), "fetchedAt": maps_at,
                               "basis": "inferred: public space on Google Maps within "
                                        f"{NEARBY_M} m; seating there is not verified"})
        nearby.sort(key=lambda x: x["distanceM"])
    return {
        "dineIn": places_fact(gp, "dineIn", "Google Places listing attribute"),
        "outdoorSeating": places_fact(gp, "outdoorSeating", "Google Places listing attribute"),
        "listedSeating": listed,
        "locatedIn": fact(g.get("located_in"), "gmaps", g.get("url"), maps_at, "Google Maps \"Located in\"",
                          "the Google Maps listing does not say") if row else unknown("not on Google Maps in our data"),
        "nearbyPublicSpaces": nearby[:3],
    }


def photos(row: dict | None, gp: dict | None, maps_at: str | None) -> list[dict]:
    out = list((gp or {}).get("photos") or [])
    g = (row or {}).get("google") or {}
    for url in g.get("photos") or []:
        out.append({"url": url, "width": None, "height": None, "source": "gmaps", "sourceUrl": g.get("url"),
                    "fetchedAt": maps_at, "attribution": None,
                    "attributionNote": "Photo from the Google Maps listing; the scrape does not name its author"})
    return out


def menu_highlights(items: list[dict]) -> dict:
    def pick(test):
        return [{"name": i["name"], "priceText": i["priceText"], "price": i["price"], "sourceUrl": i["sourceUrl"]}
                for i in items if test(i)]

    def text(i):
        return f"{i['name']} {i.get('description') or ''}"
    return {
        "vegan": pick(lambda i: any(lab["tag"] == "vegan" for lab in i["labels"])
                      or any(claims(TEXT_DIETS[0][1], t) for t in (text(i), i.get("section") or ""))),
        "steak": pick(lambda i: STEAK.search(text(i))),
        "fries": pick(lambda i: FRIES.search(text(i))),
        "dessert": pick(lambda i: DESSERT.search(i.get("section") or "") or DESSERT.search(i["name"])),
    }


def dietary(place: dict, row: dict | None, gp: dict | None, menu: dict | None, maps_at: str | None) -> list[dict]:
    out = []
    for item in (menu or {}).get("items") or []:
        for lab in item["labels"]:
            out.append({"tag": lab["tag"], "evidence": "explicit_menu", "basis": f"printed label \"{lab['text']}\""
                        + ("" if lab["tag"] else " (meaning not stated on the page; tag unknown)"),
                        "item": item["name"], "quote": item["quote"], "sourceUrl": item["sourceUrl"],
                        "fetchedAt": item["fetchedAt"]})
        body = f"{item['name']} {item.get('description') or ''}"
        section = item.get("section") or ""
        for tag, pattern in TEXT_DIETS:
            if any(lab["tag"] == tag for lab in item["labels"]):
                continue
            if claims(pattern, body):
                basis = "the item's own menu text"
            elif claims(pattern, section):
                basis = f"the menu section heading \"{section}\""
            else:
                continue
            out.append({"tag": tag, "evidence": "explicit_menu", "basis": basis, "item": item["name"],
                        "quote": item["quote"], "sourceUrl": item["sourceUrl"], "fetchedAt": item["fetchedAt"]})
    if gp and gp.get("servesVegetarianFood") is True:
        out.append({"tag": "vegetarian", "evidence": "inferred", "basis": "Google Places servesVegetarianFood "
                    "(listing attribute, not menu evidence)", "item": None, "quote": None,
                    "sourceUrl": gp.get("googleMapsUri"), "fetchedAt": gp.get("fetchedAt")})
    g = (row or {}).get("google") or {}
    for cat in g.get("categories") or []:
        for tag, pattern in TEXT_DIETS:
            if pattern.search(cat):
                out.append({"tag": tag, "evidence": "inferred", "basis": f"Google Maps category \"{cat}\"",
                            "item": None, "quote": None, "sourceUrl": g.get("url"), "fetchedAt": maps_at})
    for tag in place.get("dietary") or []:
        if not any(d["tag"] == tag and d["evidence"] == "inferred" for d in out):
            out.append({"tag": tag, "evidence": "inferred", "basis": "catalog tag (Google Places servesVegetarianFood "
                        "when data/fetch_places.py built it)", "item": None, "quote": None, "sourceUrl": None,
                        "fetchedAt": None})
    return out


def venue_details(place: dict, row: dict | None, gp: dict | None, menu: dict | None, fetched: dict,
                  all_rows: list[dict]) -> dict:
    g = (row or {}).get("google") or {}
    maps_at = fetched.get(("gmaps", g.get("place_id")))
    menu = menu or {"status": "unknown", "reason": "menu not fetched yet", "items": [], "pages": []}
    items = dedupe([], menu.get("items") or [])
    tags = dietary(place, row, gp, menu, maps_at)
    return {
        "id": place["id"], "name": place["name"], "category": place["category"], "googlePlaceId": place.get("googlePlaceId"),
        "ratings": ratings(row, fetched) or [{"source": "catalog", "rating": place.get("rating"),
                                              "reviewCount": place.get("reviewCount"), "url": None, "fetchedAt": None}],
        "price": {"level": place.get("priceLevel"), "costPerPerson": place.get("costPerPerson"),
                  "basis": "Google Places priceLevel mapped to a per-person estimate" if place.get("priceLevel") is not None
                  else "catalog default estimate; no price level known"},
        "takeout": places_fact(gp, "takeout", "Google Places listing attribute"),
        "onlineOrdering": fact(True, "gmaps", (g.get("order_links") or [{}])[0].get("url") or g.get("url"), maps_at,
                               "Google Maps \"Place an order\" action (pickup or delivery not specified)")
        if g.get("order_links") else unknown("no ordering action on the Google Maps listing"),
        "delivery": places_fact(gp, "delivery", "Google Places listing attribute"),
        "seating": seating(row, gp, all_rows, maps_at),
        "photos": photos(row, gp, maps_at),
        "menu": {"status": menu.get("status"), "reason": menu.get("reason"), "website": menu.get("website"),
                 "pages": menu.get("pages") or [], "legend": menu.get("legend"), "itemCount": len(items),
                 "highlights": menu_highlights(items), "items": items, "extractedAt": menu.get("extractedAt")},
        "dietary": tags,
        "dietaryCoverage": "explicit_menu" if any(d["evidence"] == "explicit_menu" for d in tags)
        else "inferred_only" if tags else "unknown",
        "safetyNote": SAFETY_NOTE,
    }
