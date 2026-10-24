"""Yelp through Bright Data's Yelp scrapers.

Known ids (brightdata.com/products/web-scraper/yelp, confirmed by `collect.py probe` on
2026-10-24): businesses overview and business reviews. Discovery runs through the businesses
scraper, which accepts discover_by search_filters, url or bounding_box. Its validation errors
(2026-10-24) give the inputs: bounding_box {location, category}, which splits the area past
Yelp's 240-results-per-search cap; search_filters {country, category, location}; url, which
returned no records for a Yelp search URL. Output field names come from the probe's metadata;
their value formats are still mapped defensively.
"""

from __future__ import annotations

import urllib.parse

from brightdata import Client, as_list, cut_url, e164, is_error, pick, strip_people

BUSINESSES = "gd_lgugwl0519h1p14rwk"
REVIEWS = "gd_lgzhlu9323u3k24jkv"  # not pulled yet; for the aspect pipeline later
SOURCE = "yelp"
LOCATION = "Berkeley, CA"

DISCOVER_DATASET = BUSINESSES
DISCOVER_BY = "bounding_box"


def search_url(keyword: str, location: str = LOCATION) -> str:
    return "https://www.yelp.com/search?" + urllib.parse.urlencode({"find_desc": keyword, "find_loc": location})


INPUT_BUILDERS = {
    "bounding_box": lambda kw: {"location": LOCATION, "category": kw},
    "search_filters": lambda kw: {"country": "US", "category": kw, "location": LOCATION},
    "url": lambda kw: {"url": search_url(kw)},
}


def discover_inputs(keywords: list[str], discover_by: str = DISCOVER_BY) -> list[dict]:
    if discover_by not in INPUT_BUILDERS:
        raise SystemExit(f"unknown Yelp discover_by {discover_by!r}; known: {sorted(INPUT_BUILDERS)}")
    return [INPUT_BUILDERS[discover_by](kw) for kw in keywords]


def discover(client: Client, inputs: list[dict], limit: int, dataset: str = DISCOVER_DATASET,
             discover_by: str = DISCOVER_BY) -> tuple[dict, list[dict]]:
    params = {"dataset_id": dataset, "type": "discover_new", "discover_by": discover_by, "limit_per_input": limit}
    return params, client.wait(client.trigger(dataset, inputs, **{k: v for k, v in params.items()
                                                                 if k != "dataset_id"}), timeout_s=1800)


def refresh(client: Client, urls: list[str]) -> tuple[dict, list[dict]]:
    return {"collect_by": "url"}, client.collect(BUSINESSES, [{"url": u} for u in urls])


def price_level(price) -> int | None:
    if isinstance(price, str) and price.strip() and set(price.strip()) == {"$"}:
        return min(len(price.strip()), 4)
    if isinstance(price, int) and 1 <= price <= 4:
        return price
    return None


def found_by(rec: dict):
    inp = pick(rec, "discovery_input", "input")
    if isinstance(inp, dict):
        kw = inp.get("keyword") or inp.get("category")
        if not kw and isinstance(inp.get("url"), str) and "find_desc=" in inp["url"]:
            kw = urllib.parse.parse_qs(urllib.parse.urlparse(inp["url"]).query).get("find_desc", [None])[0]
        if kw:
            return {"keyword": kw}
    return None


def address(rec: dict) -> str:
    val = pick(rec, "full_address", "address", "location.display_address", "location.address1")
    if isinstance(val, list):
        return ", ".join(str(v) for v in val)
    return val if isinstance(val, str) else ""


def normalize(rec: dict) -> dict | None:
    if is_error(rec):
        return None
    key = pick(rec, "yelp_biz_id", "business_id", "biz_id", "id")
    if not key:
        return None
    price = pick(rec, "price_range", "price", "priceRange.display", "price_level")
    return {
        "key": str(key),
        "biz_id": str(key),
        "name": (pick(rec, "name", "business_name") or "").strip(),
        "address": address(rec),
        "lat": pick(rec, "latitude", "lat", "coordinates.latitude", "location.latitude"),
        "lng": pick(rec, "longitude", "lng", "lon", "coordinates.longitude", "location.longitude"),
        "phone": e164(pick(rec, "phone_number", "phone", "display_phone")),
        "url": cut_url(pick(rec, "url", "business_url", "yelp_url")),
        "categories": as_list(pick(rec, "categories", "category")),
        "rating": pick(rec, "overall_rating", "rating"),
        "reviews_count": pick(rec, "reviews_count", "review_count"),
        "price": price if isinstance(price, str) else None,
        "price_level": price_level(price),
        "hours": pick(rec, "openning_hours", "opening_hours", "hours"),
        "amenities": pick(rec, "amenities", "amenities_and_more"),
        "is_claimed": rec.get("is_claimed"),
        "permanently_closed": bool(pick(rec, "is_closed", "permanently_closed", "closed")),
        "top_reviews": strip_people(pick(rec, "reviews", "top_reviews")),
        "found_by": found_by(rec),
    }
