"""Google Maps through Bright Data's "Google Maps full information" scraper.

Measured 2026-10-24 (brightdata_googlemaps.md): discover_by=location returned 20 restaurants
0.18-1.20 mi from one point in 259 s; collect_by_url refreshed 3 places in 44 s, sync.
"""

from __future__ import annotations

import math

from brightdata import Client, as_list, cut_url, e164, is_error, pick, strip_people

DATASET = "gd_m8ebnr0q2qlklc02fz"
SOURCE = "gmaps"


def grid(box: dict, step_mi: float = 1.0) -> list[tuple[float, float]]:
    """Points about step_mi apart covering box; one point reaches about 1.2 mi at zoom 15."""
    lo, hi = box["rectangle"]["low"], box["rectangle"]["high"]
    lat_mid = (lo["latitude"] + hi["latitude"]) / 2
    lat_step = step_mi / 69.0
    lng_step = step_mi / (69.0 * math.cos(math.radians(lat_mid)))
    n_lat = max(1, round((hi["latitude"] - lo["latitude"]) / lat_step))
    n_lng = max(1, round((hi["longitude"] - lo["longitude"]) / lng_step))
    return [(round(lo["latitude"] + (i + 0.5) * (hi["latitude"] - lo["latitude"]) / n_lat, 4),
             round(lo["longitude"] + (j + 0.5) * (hi["longitude"] - lo["longitude"]) / n_lng, 4))
            for i in range(n_lat) for j in range(n_lng)]


def discover_inputs(points: list[tuple[float, float]], keywords: list[str], zoom: int = 15) -> list[dict]:
    return [{"country": "US", "lat": lat, "long": lng, "zoom_level": zoom, "keyword": kw}
            for lat, lng in points for kw in keywords]


def discover(client: Client, inputs: list[dict], limit: int = 20) -> tuple[dict, list[dict]]:
    """Slow (minutes): run it as a job, never on a click."""
    params = {"type": "discover_new", "discover_by": "location", "limit_per_input": limit}
    # A big grid can outlast 30 min; if the wait still runs out, `collect.py fetch` downloads it later.
    return params, client.wait(client.trigger(DATASET, inputs, **params), timeout_s=max(1800, 20 * len(inputs)))


def place_id_url(place_id: str) -> str:
    return f"https://www.google.com/maps/place/?q=place_id:{place_id}"


def refresh(client: Client, urls: list[str]) -> tuple[dict, list[dict]]:
    return {"collect_by": "url"}, client.collect(DATASET, [{"url": u} for u in urls])


def refresh_by_place_id(client: Client, place_ids: list[str]) -> tuple[dict, list[dict]]:
    """For catalog places with no saved Maps url. Input field name not yet confirmed: see probe."""
    params = {"type": "discover_new", "discover_by": "place_id"}
    return params, client.wait(client.trigger(DATASET, [{"place_id": p} for p in place_ids], **params))


def found_by(rec: dict):
    inp = pick(rec, "discovery_input", "input")
    if isinstance(inp, dict) and inp.get("keyword"):
        return {"keyword": inp["keyword"], "lat": inp.get("lat"), "lng": inp.get("long")}
    return None


def gcids(rec: dict) -> list[str]:
    idx = rec.get("category_index")
    items = idx if isinstance(idx, list) else [idx]
    return [i["gcid"] for i in items if isinstance(i, dict) and isinstance(i.get("gcid"), str)]


def normalize(rec: dict) -> dict | None:
    """Keep what the app uses. Hours come from open_hours: business_details text is relative to scrape time."""
    if is_error(rec) or not rec.get("place_id"):
        return None
    categories = as_list(rec.get("all_categories")) or as_list(rec.get("category"))
    return {
        "key": rec["place_id"],
        "place_id": rec["place_id"],
        "cid": rec.get("cid"),
        "name": (rec.get("name") or "").strip(),
        "address": rec.get("address") or "",
        "lat": pick(rec, "lat", "latitude"),
        "lng": pick(rec, "lon", "lng", "longitude"),
        "phone": e164(rec.get("phone_number")),
        "url": cut_url(rec.get("url")),
        "categories": categories,
        "gcids": gcids(rec),
        "rating": rec.get("rating"),
        "reviews_count": rec.get("reviews_count"),
        "review_distribution": rec.get("review_distribution"),
        "open_hours": rec.get("open_hours"),
        "services": [s.strip() for s in as_list(rec.get("services_provided"))],
        "reservation_link": cut_url(rec.get("reservation_link")),
        "website": cut_url(rec.get("open_website")),
        "description": rec.get("description"),
        "is_claimed": rec.get("is_claimed"),
        "temporarily_closed": rec.get("temporarily_closed"),
        "permanently_closed": rec.get("permanently_closed"),
        "top_reviews": strip_people(rec.get("top_reviews")),
        "reviews_snippets": strip_people(rec.get("reviews_snippets")),
        "found_by": found_by(rec),
    }
