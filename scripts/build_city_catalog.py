#!/usr/bin/env python3
"""Build a bounded multi-city pool from committed scrape outputs; no network calls.

Existing catalog rows (including menus/photos) are preserved. Eric's discovery,
merge and scraping files are read only. Publication is a separate explicit step.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "data/reviews"))
from api.agent_models import PublishedCatalog
from api.geography import city
from api.menu_catalog import enrich_catalog, web_url
from api.models import Place
import collect

TARGETS = {"meal": 15, "activity": 8, "dessert": 7}
CITIES = {"sf": "San Francisco", "oakland": "Oakland"}


def listing_key(place):
    return (re.sub(r"\W", "", place["name"]).casefold(),
            re.sub(r"\W", "", place["address"]).casefold())


def build_pool(base, details, rows, snapshots, prices):
    body = enrich_catalog(base, details)
    original = json.loads(json.dumps(body["venues"]))
    ids = {v["place"]["id"] for v in original}
    google_ids = {v["place"].get("googlePlaceId") for v in original} - {None}
    listings = {listing_key(v["place"]) for v in original}
    added = []
    counts = Counter()
    # Prefer well-reviewed listings; stable ID makes selection reproducible.
    # Keep at least several cuisine families instead of filling every meal slot
    # with whichever family dominates the discovery file.
    cuisine_counts = Counter()
    ordered = sorted(rows, key=lambda r: (-collect.reviews(r),
                                         -float((r.get("google") or {}).get("rating") or 0), collect.stable_id(r)))
    for row in ordered:
        g = row.get("google") or {}
        if (g.get("temporarily_closed") or g.get("permanently_closed") or
                float(g.get("rating") or 0) < 4 or collect.reviews(row) < 50):
            continue
        labels = " ".join(g.get("categories") or [])
        if re.search(r"church|religious|school|office|caterer|recording studio|puppet|cannabis|dispensary", labels, re.I):
            continue
        category = row.get("category")
        if category not in TARGETS:
            continue
        area = next((key for key, name in CITIES.items() if re.search(
            r",\s*" + re.escape(name) + r",\s*(?:CA|California)\b", row.get("address") or "", re.I)), None)
        if area is None or counts[area, category] >= TARGETS[category]:
            continue
        if not collect.in_box(row.get("lat"), row.get("lng"), collect.AREAS[area]["box"]):
            continue
        pid = collect.stable_id(row)
        if pid in ids or g.get("place_id") in google_ids:
            continue
        price = prices.get(g.get("place_id"), {})
        place = collect.to_place(row, pid, collect.fp.PRICE_NUM.get(price.get("priceLevel")))
        if place is None or listing_key(place) in listings:
            continue
        Place.model_validate(place)
        if category == "meal" and cuisine_counts[area, place["cuisine"]] >= 5:
            continue
        added.append(place)
        ids.add(pid)
        if g.get("place_id"):
            google_ids.add(g["place_id"])
        listings.add(listing_key(place))
        counts[area, category] += 1
        cuisine_counts[area, place["cuisine"]] += 1
    for area in CITIES:
        for category, target in TARGETS.items():
            if counts[area, category] != target:
                raise ValueError(f"only {counts[area, category]}/{target} usable {area} {category} rows")
    # Use source timestamps rather than today's clock so rebuilding identical
    # inputs produces identical rows, source dates and version IDs.
    generated = max([body["generatedAt"], *[s["fetched_at"] for s in snapshots]])
    fresh = collect.snapshot_payload(added, rows, snapshots, generated, prices)
    raw_by_id = {collect.stable_id(row): row for row in rows}
    for venue in fresh["venues"]:
        place, evidence = venue["place"], venue["evidence"]
        row = raw_by_id[place["id"]]
        source = web_url((row.get("google") or {}).get("url"))
        photos = []
        for url in (row.get("google") or {}).get("photos") or []:
            if source and web_url(url) and url not in [p["url"] for p in photos]:
                photos.append({"url": url, "sourceUrl": source, "attribution": "Photo: Google Maps"})
            if len(photos) == 3:
                break
        evidence.update(menu={"status": "unknown", "items": []}, photos=photos)
        if place.get("label"):
            evidence["foodStyle"] = place["label"]
    venues = original + fresh["venues"]
    digest = hashlib.sha256(json.dumps(venues, sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:12]
    result = {"version": "cities-" + digest, "generatedAt": generated, "venues": venues}
    PublishedCatalog.model_validate({"version": result["version"], "places": [v["place"] for v in venues],
                                     "evidence": {v["place"]["id"]: v["evidence"] for v in venues}})
    assert venues[:len(original)] == original
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "data/catalog/cities.json")
    args = parser.parse_args()
    read = lambda name: json.loads((ROOT / "data/brightdata" / name).read_text())
    body = build_pool(read("catalog.json"), read("details.json"), read("places.json"),
                      read("snapshots.json"), read("google_places.json"))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(body, ensure_ascii=False, separators=(",", ":")) + "\n")
    counts = Counter(city(Place.model_validate(v["place"])) for v in body["venues"])
    print(json.dumps({"version": body["version"], "venues": len(body["venues"]), "cities": counts,
                      "menuItems": sum(len(v["evidence"]["menu"]["items"]) for v in body["venues"]),
                      "photos": sum(len(v["evidence"]["photos"]) for v in body["venues"]), "published": False}))


if __name__ == "__main__":
    main()
