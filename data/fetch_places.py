"""Build data/places.base.json (and places.json v1) from Google Places API (New).

About 45 Berkeley places: 20 meals, 15 activities, 10 desserts, in the exact Place shape
of docs/CONTRACT.md S5.2. Aspects are defaults (0.5, sd 0.25) until Haydn's review
pipeline writes places.json v2.

    python data/fetch_places.py              # call the API, cache raw JSON, write files
    python data/fetch_places.py --from-raw   # rebuild from data/raw/ without calling the API

Needs GOOGLE_PLACES_API_KEY in the environment or in the repo-root .env.
Raw responses go to data/raw/ (gitignored). Standard library only.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import urllib.error
import urllib.request
from pathlib import Path

DATA = Path(__file__).resolve().parent
ROOT = DATA.parent
RAW = DATA / "raw"

ENDPOINT = "https://places.googleapis.com/v1/places:searchText"
FIELD_MASK = ",".join(
    "places." + f
    for f in [
        "id", "displayName", "formattedAddress", "location", "priceLevel", "regularOpeningHours",
        "internationalPhoneNumber", "rating", "userRatingCount", "types", "primaryType",
        "businessStatus", "servesVegetarianFood",
    ]
)
# Downtown Berkeley, the campus, Elmwood, North Berkeley and the 4th St area.
BERKELEY = {"rectangle": {"low": {"latitude": 37.845, "longitude": -122.300},
                          "high": {"latitude": 37.895, "longitude": -122.235}}}

TARGETS = {"meal": 20, "activity": 15, "dessert": 10}
DWELL = {"meal": 75, "activity": 75, "dessert": 30}
ASPECTS = ["noise", "crowd", "wait", "value", "romance", "service", "outdoor", "novelty"]

# (category, query, cuisine hint for meals). Several queries per category for variety.
QUERIES = [
    ("meal", "asian restaurant", "asian"),
    ("meal", "mexican restaurant", "latin"),
    ("meal", "mediterranean or middle eastern restaurant", "mediterranean"),
    ("meal", "italian restaurant", "mediterranean"),
    ("meal", "american restaurant", "american"),
    ("meal", "vegetarian restaurant", None),
    ("activity", "museum", None),
    ("activity", "bowling alley or arcade", None),
    ("activity", "escape room", None),
    ("activity", "live music venue or comedy club", None),
    ("activity", "movie theater", None),
    ("activity", "park or botanical garden", None),
    ("activity", "board game cafe or pottery studio", None),
    ("dessert", "ice cream or gelato", None),
    ("dessert", "dessert shop", None),
    ("dessert", "bubble tea", None),
    ("dessert", "bakery", None),
]

CUISINE_TYPES = {
    "asian": ["chinese", "japanese", "korean", "thai", "vietnamese", "indian", "ramen", "sushi",
              "asian", "indonesian", "dim_sum", "filipino", "burmese", "nepalese", "taiwanese"],
    "latin": ["mexican", "latin_american", "brazilian", "peruvian", "salvadoran", "cuban",
              "colombian", "argentinian", "taco"],
    "mediterranean": ["mediterranean", "greek", "italian", "middle_eastern", "lebanese", "turkish",
                      "pizza", "spanish", "falafel", "persian", "afghani"],
    "american": ["american", "hamburger", "barbecue", "steak_house", "diner", "brunch",
                 "breakfast", "sandwich", "chicken", "southern", "fast_food"],
}
MEAL_PRICE = {"PRICE_LEVEL_INEXPENSIVE": 12, "PRICE_LEVEL_MODERATE": 25,
              "PRICE_LEVEL_EXPENSIVE": 45, "PRICE_LEVEL_VERY_EXPENSIVE": 70}
PRICE_NUM = {"PRICE_LEVEL_FREE": 0, "PRICE_LEVEL_INEXPENSIVE": 1, "PRICE_LEVEL_MODERATE": 2,
             "PRICE_LEVEL_EXPENSIVE": 3, "PRICE_LEVEL_VERY_EXPENSIVE": 4}
# Activity cost per person: an explicit estimate from type (free/10/15/25), per build-brief B2.
ACTIVITY_COST = [
    (["park", "garden", "botanical_garden", "hiking_area", "plaza", "beach", "playground"], 0),
    (["night_club", "live_music_venue", "comedy_club", "bar", "concert_hall"], 10),
    (["museum", "art_gallery", "movie_theater", "cultural_center", "historical_landmark"], 15),
    (["bowling_alley", "amusement_center", "video_arcade", "escape_room", "amusement_park"], 25),
]
DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]  # Places API: 0 = Sunday

# Text search also returns grocery stores, offices and labs, so each category only keeps
# places whose Google primaryType fits. Chosen from the types the first real pull returned.
MEAL_EXTRA_TYPES = {"restaurant", "noodle_shop", "sandwich_shop", "gastropub", "bar_and_grill"}
ACTIVITY_TYPES = {
    "performing_arts_theater", "museum", "art_museum", "park", "garden", "botanical_garden",
    "live_music_venue", "comedy_club", "movie_theater", "art_gallery", "event_venue", "scenic_spot",
    "bowling_alley", "video_arcade", "amusement_center", "escape_room",
}  # not amphitheatre: the Greek Theatre lists itself as open 24 hours
DESSERT_TYPES = {"ice_cream_shop", "bakery", "tea_house", "dessert_restaurant", "dessert_shop"}


def fits(category: str, p: dict) -> bool:
    t = p.get("primaryType", "")
    if category == "meal":
        return (t.endswith("_restaurant") and t not in {"dessert_restaurant"}) or t in MEAL_EXTRA_TYPES
    if category == "activity":
        return t in ACTIVITY_TYPES
    return t in DESSERT_TYPES


def load_key() -> str:
    key = os.environ.get("GOOGLE_PLACES_API_KEY")
    env = ROOT / ".env"
    if not key and env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            m = re.match(r"\s*GOOGLE_PLACES_API_KEY\s*=\s*(.*)\s*$", line)
            if m:
                key = m.group(1).strip().strip('"').strip("'")
    if not key:
        sys.exit("GOOGLE_PLACES_API_KEY is not set (environment or repo-root .env)")
    return key


def search(key: str, query: str) -> dict:
    body = json.dumps({"textQuery": f"{query} in Berkeley, CA", "pageSize": 20,
                       "locationRestriction": BERKELEY}).encode()
    req = urllib.request.Request(ENDPOINT, data=body, method="POST", headers={
        "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELD_MASK})
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            return json.load(res)
    except urllib.error.HTTPError as e:
        sys.exit(f"Places API error {e.code} for '{query}': {e.read().decode()[:500]}")


def raw_path(i: int) -> Path:
    return RAW / f"places_{i:02d}.json"


def fetch_all(from_raw: bool) -> list[tuple[str, str | None, list[dict]]]:
    RAW.mkdir(exist_ok=True)
    key = None if from_raw else load_key()
    out = []
    for i, (category, query, hint) in enumerate(QUERIES):
        if from_raw:
            if not raw_path(i).exists():
                sys.exit(f"--from-raw: missing {raw_path(i)}; run once without --from-raw")
            data = json.loads(raw_path(i).read_text(encoding="utf-8"))
        else:
            data = search(key, query)
            raw_path(i).write_text(json.dumps({"query": query, **data}, indent=1), encoding="utf-8")
        places = data.get("places", [])
        print(f"  {category:8s} {query!r}: {len(places)} results")
        out.append((category, hint, places))
    return out


def type_words(p: dict) -> list[str]:
    return [t.removesuffix("_restaurant").removesuffix("_shop") for t in [p.get("primaryType", ""), *p.get("types", [])]]


def cuisine_for(category: str, p: dict, hint: str | None) -> str:
    if category == "activity":
        return "none"
    if category == "dessert":
        return "cafe_dessert"
    words = type_words(p)
    for word in words:  # primaryType first, then types
        for fam, keys in CUISINE_TYPES.items():
            if word in keys:
                return fam
    return hint or "american"


def activity_cost(p: dict) -> int:
    types = set(p.get("types", [])) | {p.get("primaryType", "")}
    for keys, cost in ACTIVITY_COST:
        if types & set(keys):
            return cost
    return 15


def hhmm(point: dict) -> str:
    return f"{point.get('hour', 0):02d}:{point.get('minute', 0):02d}"


def hours_for(p: dict) -> dict | None:
    periods = (p.get("regularOpeningHours") or {}).get("periods")
    if not periods:
        return None
    hours: dict[str, list[list[str]]] = {d: [] for d in ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]}
    if len(periods) == 1 and "close" not in periods[0]:  # open 24 hours
        return {d: [["00:00", "23:59"]] for d in hours}
    for per in periods:
        o, c = per.get("open"), per.get("close")
        if not o or not c:
            continue
        day = DAYS[o["day"]]
        # Closes after midnight: end that day at 23:59 (plan window ends 23:00 anyway).
        end = hhmm(c) if c["day"] == o["day"] else "23:59"
        hours[day].append([hhmm(o), end])
    return hours


def e164(phone: str | None) -> str:
    return re.sub(r"[^\d+]", "", phone) if phone else ""


def to_place(category: str, hint: str | None, p: dict, hours: dict) -> dict:
    level = p.get("priceLevel")
    if category == "meal":
        cost = MEAL_PRICE.get(level, 25)
    elif category == "dessert":
        cost = 9
    else:
        cost = activity_cost(p)
    return {
        "id": "",  # assigned after selection
        "googlePlaceId": p["id"],
        "name": p["displayName"]["text"],
        "category": category,
        "cuisine": cuisine_for(category, p, hint),
        "address": p.get("formattedAddress", ""),
        "lat": p["location"]["latitude"],
        "lng": p["location"]["longitude"],
        "priceLevel": PRICE_NUM.get(level),
        "costPerPerson": cost,
        "dwellMinutes": DWELL[category],
        "phone": e164(p.get("internationalPhoneNumber")),
        # Only what Google says; otherwise empty (never guessed).
        "dietary": ["vegetarian"] if p.get("servesVegetarianFood") is True else [],
        "hours": hours,
        # Defaults until places.json v2 (category mean, sd 0.25 per contract S5.2).
        "aspects": {a: {"mean": 0.5, "sd": 0.25} for a in ASPECTS},
        "reviewCount": p.get("userRatingCount", 0),
        "rating": p.get("rating"),
        "sources": ["google"],
    }


def select(results) -> tuple[list[dict], dict]:
    seen: set[str] = set()
    pools: dict[str, list[list[dict]]] = {c: [] for c in TARGETS}
    skipped = {"duplicate": 0, "wrong_type": 0, "not_operational": 0, "no_hours": 0}
    for category, hint, places in results:
        bucket = []
        for p in places:
            if p["id"] in seen:
                skipped["duplicate"] += 1
                continue
            if not fits(category, p):
                skipped["wrong_type"] += 1
                continue
            if p.get("businessStatus", "OPERATIONAL") != "OPERATIONAL":
                skipped["not_operational"] += 1
                continue
            hours = hours_for(p)
            if hours is None:  # the solver needs hours to check "open for the stop"
                skipped["no_hours"] += 1
                continue
            seen.add(p["id"])
            bucket.append(to_place(category, hint, p, hours))
        # Best-known first inside each query, so round-robin picks popular places.
        bucket.sort(key=lambda x: -(x["reviewCount"] or 0))
        pools[category].append(bucket)
    chosen: list[dict] = []
    for category, target in TARGETS.items():
        picked: list[dict] = []
        buckets = pools[category]
        while len(picked) < target and any(buckets):
            for b in buckets:  # round-robin across queries for variety
                if b and len(picked) < target:
                    picked.append(b.pop(0))
        chosen.extend(picked)
    for i, place in enumerate(chosen, 1):
        place["id"] = f"p_{i:03d}"
    return chosen, skipped


def validate(places: list[dict]) -> list[str]:
    problems = []
    for p in places:
        for k in ["id", "name", "category", "cuisine", "lat", "lng", "costPerPerson", "dwellMinutes", "hours", "aspects"]:
            if p.get(k) in (None, ""):
                problems.append(f"{p.get('id')} {p.get('name')}: missing {k}")
        if not p["phone"]:
            problems.append(f"{p['id']} {p['name']}: no phone (fine unless it is a meal stop we book)")
        if set(p["aspects"]) != set(ASPECTS):
            problems.append(f"{p['id']}: aspects keys wrong")
    return problems


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--from-raw", action="store_true", help="rebuild from data/raw/ without calling the API")
    args = ap.parse_args()

    print("Fetching" if not args.from_raw else "Rebuilding from data/raw/")
    places, skipped = select(fetch_all(args.from_raw))
    counts = {c: sum(p["category"] == c for p in places) for c in TARGETS}
    print(f"Selected {len(places)}: {counts}  skipped: {skipped}")
    short = {c: TARGETS[c] - n for c, n in counts.items() if n < TARGETS[c]}
    if short:
        print(f"WARNING: short of target {short}; add queries to QUERIES")
    for problem in validate(places):
        print("  note:", problem)

    base = DATA / "places.base.json"
    base.write_text(json.dumps(places, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    shutil.copyfile(base, DATA / "places.json")  # v1; after this only Haydn's build script writes it
    print(f"Wrote {base.name} and places.json ({len(places)} places)")


if __name__ == "__main__":
    main()
