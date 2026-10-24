"""Collect Berkeley restaurants, boba shops and places to hang out from Google Maps and Yelp
through Bright Data, and optionally fold them into data/places.json. See docs/BRIGHTDATA.md.

    python data/reviews/collect.py probe                  # list Bright Data's Yelp/Maps scrapers (free)
    python data/reviews/collect.py discover --one-point --keywords restaurants --yes   # cheap spike
    python data/reviews/collect.py discover --yes         # full Google Maps grid x all keywords
    python data/reviews/collect.py refresh                # fresh numbers for every known place
    python data/reviews/collect.py build                  # rebuild outputs from data/raw/ (no API calls)
    python data/reviews/collect.py publish --add meal=10,dessert=5,activity=5   # live in SpacetimeDB
    python data/reviews/collect.py merge --add meal=10,dessert=5,activity=5     # bundled fallback file

discover and refresh save raw responses to data/raw/ (gitignored), then run build, which writes
data/brightdata/places.json (one row per place, both sources joined) and appends to
data/brightdata/snapshots.json. publish sends the merged catalog, with source URLs and fetch
times, to the SpacetimeDB module (POST /catalog), which passes it to FastAPI on every
coordinator request. Only merge writes data/places.json. Both keep existing ids.
Needs BRIGHTDATA_API_KEY (repo-root .env or shell); publish also needs SPACETIMEDB_URI,
SPACETIMEDB_DB and HUDDLE_SHARED_SECRET (shell, repo-root .env or api/.env). Standard library only.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import shutil
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE.parent
sys.path.insert(0, str(DATA))

import brightdata as bd  # noqa: E402
import details  # noqa: E402
import fetch_places as fp  # noqa: E402
import source_gmaps  # noqa: E402
import source_menus  # noqa: E402
import source_places  # noqa: E402
import source_yelp  # noqa: E402

OUT = DATA / "brightdata"
PLACES = DATA / "places.json"
DOWNTOWN = (37.8716, -122.2727)
CONFIRM_ABOVE = 2000  # records; Web Scraper API bills per record
USD_PER_1K = 1.5

# What we look for. Several keywords per group because every search caps out (Google about 20
# per point, Yelp 240 per query). A place's group comes from its categories, not its keyword.
GROUPS = {
    "restaurant": ["restaurants", "thai", "chinese", "japanese", "korean", "indian", "vietnamese", "mexican",
                   "pizza", "italian", "mediterranean", "burgers", "sandwiches", "brunch", "vegetarian"],
    "boba": ["boba", "bubble tea", "tea house"],
    "hangout": ["bars", "cafes", "arcade", "bowling", "karaoke", "board game cafe", "escape room", "museum",
                "live music", "comedy club", "movie theater", "parks"],
}


def terms(*words: str) -> re.Pattern:
    return re.compile(r"\b(?:" + "|".join(re.escape(w) for w in words) + r")s?\b")


BOBA = terms("bubble tea", "boba", "tea house", "teahouse", "tea room", "tea shop")
PLAY = terms("board game", "escape room", "arcade", "bowling", "karaoke", "museum", "cinema", "movie theater",
             "comedy club", "live music", "music venue", "billiard", "climbing", "mini golf", "pottery")
SWEET = terms("cafe", "coffee", "dessert", "ice cream", "gelato", "frozen yogurt", "bakery", "bakeries", "donut",
              "patisserie", "creperie", "chocolate", "cupcake", "juice", "bagel")
CUISINE_WORDS = sorted({w.replace("_", " ") for keys in fp.CUISINE_TYPES.values() for w in keys})
FOOD = terms("restaurant", "grill", "diner", "taqueria", "bistro", "eatery", "steakhouse", "deli", "kitchen",
             "gastropub", "noodle", "dumpling", "hot pot", "poke", "salad", "soup", "burger", "bbq", "food",
             "fast food", "falafel", "brunch", "breakfast", "pho", "wings", *CUISINE_WORDS)
FUN = terms("bar", "pub", "brewery", "brewpub", "wine bar", "winery", "cocktail", "lounge", "night club", "nightclub", "arcade",
            "bowling", "karaoke", "board game", "escape room", "museum", "art gallery", "gallery", "music venue",
            "live music", "concert", "comedy", "theater", "theatre", "cinema", "movie", "park", "garden",
            "botanical", "amusement", "billiard", "pool hall", "climbing", "mini golf", "pottery", "jazz",
            "performing arts", "hiking", "beach", "plaza", "landmark")
# (pattern, group, Huddle category), checked in order on each category string, so a board game
# cafe is an activity, a sushi bar a meal and a juice bar a dessert stop.
KINDS = [(BOBA, "boba", "dessert"), (PLAY, "hangout", "activity"), (SWEET, "hangout", "dessert"),
         (FOOD, "restaurant", "meal"), (FUN, "hangout", "activity")]

# Activity cost per person: the same free/10/15/25 estimate as fetch_places.ACTIVITY_COST,
# keyed on words because Maps and Yelp categories are prose, not Google Places types.
ACTIVITY_COST = [(terms("park", "garden", "beach", "trail", "plaza", "playground", "hiking", "landmark"), 0),
                 (terms("bar", "pub", "brewery", "night club", "nightclub", "lounge", "live music", "music venue",
                        "comedy", "jazz", "wine", "cocktail"), 10),
                 (terms("museum", "gallery", "theater", "theatre", "cinema", "movie", "karaoke", "cultural"), 15),
                 (terms("bowling", "arcade", "escape room", "amusement", "climbing", "mini golf", "pottery",
                        "billiard"), 25)]
CUISINE_EXTRA = {"american": ["burger", "bbq", "cajun", "soul_food", "hot_dog", "wings", "californian"],
                 "asian": ["pho", "poke", "dumpling", "hot_pot", "noodle", "szechuan", "cantonese", "shanghainese"],
                 "latin": ["burrito", "empanada", "venezuelan"],
                 "mediterranean": ["kebab", "gyro", "moroccan"]}
DIETS = {"vegetarian": terms("vegetarian"), "vegan": terms("vegan"),
         "gluten_free": terms("gluten-free", "gluten free"), "halal": terms("halal"), "kosher": terms("kosher")}
NEGATIVE = re.compile(r"^\s*(no|not|does not|doesn't|doesn’t)\b", re.I)
LEVEL_NAMES = ["PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE", "PRICE_LEVEL_EXPENSIVE",
               "PRICE_LEVEL_VERY_EXPENSIVE"]
PLACE_KEYS = ["id", "googlePlaceId", "name", "category", "cuisine", "address", "lat", "lng", "priceLevel",
              "costPerPerson", "dwellMinutes", "phone", "dietary", "hours", "aspects", "reviewCount", "rating",
              "sources"]


def plain(text: str) -> str:
    return text.lower().replace("é", "e").replace("&", " and ")


# A place whose primary category is a shop is not a stop, whatever it also sells (a supermarket
# lists "Cafe" and "Deli" too: Berkeley Bowl, 2026-10-24).
NOT_A_STOP = terms("supermarket", "grocery", "grocery store", "convenience store", "liquor store", "beer store",
                   "wine store", "market", "gas station", "pharmacy", "department store", "shopping mall", "caterer")


def classify(categories: list[str]) -> tuple[str, str] | None:
    """(group, Huddle category) from the first category that says anything; the first is the primary."""
    if categories and NOT_A_STOP.search(plain(categories[0])):
        return None
    for cat in categories:
        for pattern, group, category in KINDS:
            if pattern.search(plain(cat)):
                return group, category
    return None


def cuisine_for(categories: list[str]) -> str:
    families = {fam: keys + CUISINE_EXTRA.get(fam, []) for fam, keys in fp.CUISINE_TYPES.items()}
    for cat in categories:
        token = re.sub(r"[^a-z]+", "_", plain(cat).replace(" restaurant", "")).strip("_")
        for fam, keys in families.items():
            if any(k in token for k in keys):
                return fam
    return "american"  # fetch_places.cuisine_for's default too


def activity_cost(categories: list[str]) -> int:
    for pattern, cost in ACTIVITY_COST:
        if any(pattern.search(plain(c)) for c in categories):
            return cost
    return 15


def diets(texts: list[str]) -> list[str]:
    found = [d for d, pattern in DIETS.items()
             if any(pattern.search(plain(t)) and not NEGATIVE.search(t) for t in texts)]
    return found


# Hours. Maps gives one string per weekday ("11 AM–12 AM"); Yelp gives "11:00 AM - 9:00 PM".

DAY = {name: name[:3] for name in ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]}
DAY.update({"tues": "tue", "thur": "thu", "thurs": "thu"})
TIME = re.compile(r"^(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?\s*m?\.?$")


def clock(text: str):
    m = TIME.match(text.strip())
    if not m:
        return None
    h, mins = int(m.group(1)), int(m.group(2) or 0)
    if h > 23 or mins > 59:
        return None
    return h, mins, m.group(3)


def to_minutes(h: int, mins: int, meridiem: str | None) -> int:
    if meridiem == "a":
        h = 0 if h == 12 else h
    elif meridiem == "p":
        h = 12 if h == 12 else h + 12
    return h * 60 + mins


def parse_ranges(text: str):
    """[[start, end], ...] for one day, [] when closed, None when unreadable."""
    t = re.sub(r"[   ]", " ", text).lower().strip()
    if "closed" in t:
        return []
    if "24 hours" in t:
        return [["00:00", "23:59"]]
    out = []
    for part in re.split(r"[,;\n]", t):  # Maps puts split shifts on separate lines
        ends = re.split(r"\s*(?:–|—|-|\bto\b)\s*", part.strip())
        if len(ends) != 2:
            continue
        a, b = clock(ends[0]), clock(ends[1])
        if not a or not b:
            continue
        end = to_minutes(*b)
        start = to_minutes(a[0], a[1], a[2] or b[2])
        if a[2] is None and b[2] == "p" and start > end:  # "11–2:30 PM" means 11 AM
            start = to_minutes(a[0], a[1], "a")
        # Closes at or after midnight: end that day at 23:59, as fetch_places.hours_for does.
        stop = "23:59" if end <= start else f"{end // 60:02d}:{end % 60:02d}"
        if stop == "23:59" and start >= 23 * 60 + 59:
            continue
        out.append([f"{start // 60:02d}:{start % 60:02d}", stop])
    return out or None


def day_key(text) -> str | None:
    word = re.sub(r"[^a-z]", "", str(text).lower())
    return DAY.get(word) or (word if word in DAY.values() else None)


def parse_hours(val) -> dict | None:
    """All seven weekdays (unlisted ones closed), or None if no day could be read."""
    days: dict = {}
    if isinstance(val, dict):
        items = list(val.items())
    elif isinstance(val, list):
        items = []
        for it in val:
            if isinstance(it, dict):
                items.append((it.get("day") or it.get("weekday"), it.get("hours") or it.get("time")))
            elif isinstance(it, str) and ":" in it:
                items.append(tuple(it.split(":", 1)))
    else:
        return None
    for day, text in items:
        key = day_key(day)
        texts = text if isinstance(text, list) else [text]
        if not key or not all(isinstance(t, str) for t in texts):
            continue
        ranges = [parse_ranges(t) for t in texts]
        if any(r is None for r in ranges):
            continue
        days[key] = [pair for r in ranges for pair in r]
    if not any(days.values()):
        return None
    return {d: days.get(d, []) for d in ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]}


# Matching the same place across sources (and against the catalog).

STOP = {"the", "and", "of", "a", "berkeley", "inc", "llc", "co", "restaurant"}


def name_tokens(name: str) -> set:
    return {w for w in re.sub(r"[^a-z0-9]+", " ", plain(name or "")).split() if w not in STOP}


def name_score(a: str, b: str) -> float:
    x, y = name_tokens(a), name_tokens(b)
    return len(x & y) / min(len(x), len(y)) if x and y else 0.0


def meters(lat1, lng1, lat2, lng2) -> float:
    if None in (lat1, lng1, lat2, lng2):
        return math.inf
    p1, p2 = math.radians(lat1), math.radians(lat2)
    h = (math.sin((p2 - p1) / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2)
    return 2 * 6371000 * math.asin(math.sqrt(h))


def same_place(a: dict, b: dict) -> float:
    """Match strength in (0, 1], or 0. Same name within 75 m, or same phone nearby."""
    d = meters(a.get("lat"), a.get("lng"), b.get("lat"), b.get("lng"))
    if a.get("phone") and a.get("phone") == b.get("phone") and (d <= 300 or d == math.inf):
        return 1.0
    score = name_score(a.get("name"), b.get("name"))
    return score if d <= 75 and score >= 0.6 else 0.0


def best_match(row: dict, candidates: list[dict]):
    scored = [(same_place(row, c), i) for i, c in enumerate(candidates)]
    score, i = max(scored, default=(0.0, -1))
    return candidates[i] if score > 0 else None


def catalog_match(row: dict, g: dict | None, catalog: list[dict], by_gid: dict | None = None):
    """A Google record matches a catalog place by place id only: a different id is a different
    place, however similar the name ("Comal" vs "Comal Next Door"). Names and phones decide only
    against catalog places with no Google id, or for Yelp-only records."""
    if by_gid is None:
        by_gid = {p["googlePlaceId"]: p for p in catalog if p.get("googlePlaceId")}
    if g:
        return by_gid.get(g.get("place_id") or g.get("key")) or best_match(
            row, [p for p in catalog if not p.get("googlePlaceId")])
    return best_match(row, catalog)


def in_box(lat, lng, box=fp.BERKELEY) -> bool:
    lo, hi = box["rectangle"]["low"], box["rectangle"]["high"]
    return (lat is not None and lng is not None and lo["latitude"] <= lat <= hi["latitude"]
            and lo["longitude"] <= lng <= hi["longitude"])


# build: data/raw/ -> data/brightdata/{places,snapshots}.json

ADAPTERS = {source_gmaps.SOURCE: source_gmaps, source_yelp.SOURCE: source_yelp}


def snapshot(source: str, row: dict, fetched_at: str) -> dict:
    return {"source": source, "key": row["key"], "fetched_at": fetched_at, "source_url": row.get("url"),
            "rating": row.get("rating"), "reviews_count": row.get("reviews_count"),
            "review_distribution": row.get("review_distribution"),
            "temporarily_closed": row.get("temporarily_closed"), "permanently_closed": row.get("permanently_closed"),
            "is_claimed": row.get("is_claimed"), "hours": row.get("open_hours") or row.get("hours")}


def read_json(path: Path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def unify(latest: dict, first_seen: dict, found: dict, catalog: list[dict]) -> list[dict]:
    google = [r for (s, _), r in latest.items() if s == "gmaps"]
    yelp = [r for (s, _), r in latest.items() if s == "yelp"]
    cells: dict = {}
    for g in google:  # ~200 m cells so matching stays near-linear
        if g.get("lat") is not None:
            cells.setdefault((round(g["lat"] / 0.002), round(g["lng"] / 0.002)), []).append(g)
    taken: set = set()
    pairs = []
    for y in yelp:
        near = google if y.get("lat") is None else [
            g for di in (-1, 0, 1) for dj in (-1, 0, 1)
            for g in cells.get((round(y["lat"] / 0.002) + di, round(y["lng"] / 0.002) + dj), [])]
        g = best_match(y, [c for c in near if c["key"] not in taken])
        if g:
            taken.add(g["key"])
        pairs.append((g, y))
    pairs += [(g, None) for g in google if g["key"] not in taken]

    by_gid = {p.get("googlePlaceId"): p for p in catalog if p.get("googlePlaceId")}
    rows = []
    for g, y in pairs:
        kind = classify(g["categories"] if g else []) or classify(y["categories"] if y else [])
        if not kind or (g and g.get("permanently_closed")) or (y and y.get("permanently_closed")):
            continue
        top = g or y
        lat, lng = (g or {}).get("lat") or (y or {}).get("lat"), (g or {}).get("lng") or (y or {}).get("lng")
        row = {"bdId": f"g:{g['key']}" if g else f"y:{y['key']}", "group": kind[0], "category": kind[1],
               "name": top["name"], "address": top["address"] or (y or {}).get("address", ""),
               "lat": lat, "lng": lng, "phone": top["phone"] or (y or {}).get("phone", ""),
               "distance_mi": None if lat is None else round(meters(*DOWNTOWN, lat, lng) / 1609.34, 2)}
        huddle = catalog_match(row, g, catalog, by_gid)
        keys = [("gmaps", g["key"]) if g else None, ("yelp", y["key"]) if y else None]
        seen = [first_seen[k] for k in keys if k in first_seen]
        row.update({"huddleId": huddle["id"] if huddle else None,
                    "google": {k: v for k, v in g.items() if k not in ("key", "found_by")} if g else None,
                    "yelp": {k: v for k, v in y.items() if k not in ("key", "found_by")} if y else None,
                    "first_seen_at": min(seen) if seen else None,
                    "found_by": unique(f for k in keys if k for f in found.get(k, []))})
        rows.append(row)
    rows.sort(key=lambda r: (r["group"], -reviews(r)))
    return rows


def unique(items) -> list:
    out = []
    for it in items:
        if it not in out:
            out.append(it)
    return out


def count(val) -> int:
    """Review counts can arrive as 312, "312" or "1,234 reviews"."""
    if isinstance(val, (int, float)):
        return int(val)
    digits = re.sub(r"\D", "", val) if isinstance(val, str) else ""
    return int(digits) if digits else 0


def reviews(row: dict) -> int:
    return sum(count((row.get(s) or {}).get("reviews_count")) for s in ("google", "yelp"))


def build(log=print) -> list[dict]:
    prev = {r["bdId"]: r for r in read_json(OUT / "places.json", [])}
    snaps = read_json(OUT / "snapshots.json", [])
    have = {(s["source"], s["key"], s["fetched_at"]) for s in snaps}
    latest: dict = {}
    first_seen: dict = {}
    found: dict = {}
    for r in prev.values():  # keep history from runs whose raw files are gone
        for src, sub in (("gmaps", r.get("google")), ("yelp", r.get("yelp"))):
            if sub:
                key = (src, sub["place_id"] if src == "gmaps" else sub["biz_id"])
                latest[key] = {"key": key[1], **sub}
                if r.get("first_seen_at"):
                    first_seen[key] = r["first_seen_at"]
                found[key] = list(r.get("found_by") or [])
    errors = 0
    for job in bd.raw_jobs():
        adapter = ADAPTERS[job["source"]]
        for rec in job["records"]:
            row = adapter.normalize(rec)
            if row is None:
                errors += 1
                continue
            key = (job["source"], row["key"])
            latest[key] = row
            first_seen[key] = min(first_seen.get(key, job["fetched_at"]), job["fetched_at"])
            if row.get("found_by") and row["found_by"] not in found.setdefault(key, []):
                found[key].append(row["found_by"])
            if (job["source"], row["key"], job["fetched_at"]) not in have:
                snaps.append(snapshot(job["source"], row, job["fetched_at"]))
                have.add((job["source"], row["key"], job["fetched_at"]))
    rows = unify(latest, first_seen, found, read_json(PLACES, []))
    write_json(OUT / "places.json", rows)
    write_json(OUT / "snapshots.json", snaps)
    counts: dict = {}
    for r in rows:
        src = "both" if r["google"] and r["yelp"] else "google" if r["google"] else "yelp"
        counts.setdefault(r["group"], {}).setdefault(src, 0)
        counts[r["group"]][src] += 1
    log(f"build: {len(rows)} places {counts}; {sum(r['huddleId'] is not None for r in rows)} already in the "
        f"catalog; {errors} error/empty records skipped; {len(snaps)} snapshots")
    return rows


# merge: data/brightdata/places.json -> data/places.json (opt-in)

def row_texts(row: dict) -> list[str]:
    g, y = row.get("google") or {}, row.get("yelp") or {}
    return list(g.get("categories") or []) + list(g.get("services") or []) + list(y.get("categories") or [])


def to_place(row: dict, pid: str, price_level: int | None = None):
    g, y = row.get("google") or {}, row.get("yelp") or {}
    hours = parse_hours(g.get("open_hours")) or parse_hours(y.get("hours"))
    rating = g.get("rating") if g.get("rating") is not None else y.get("rating")
    if hours is None or rating is None or row["lat"] is None:
        return None
    category = row["category"]
    categories = list(g.get("categories") or []) + list(y.get("categories") or [])
    level = y.get("price_level") or price_level
    if category == "meal":
        cost = fp.MEAL_PRICE.get(LEVEL_NAMES[level - 1], 25) if level else 25
    elif category == "dessert":
        cost = 9
    else:
        cost = activity_cost(categories)
    place = {
        "id": pid, "googlePlaceId": g.get("place_id"), "name": row["name"], "category": category,
        "cuisine": {"meal": cuisine_for(categories), "dessert": "cafe_dessert"}.get(category, "none"),
        "address": row["address"], "lat": float(row["lat"]), "lng": float(row["lng"]), "priceLevel": level,
        "costPerPerson": cost, "dwellMinutes": fp.DWELL[category], "phone": row["phone"],
        "dietary": diets(row_texts(row)), "hours": hours,
        "aspects": {a: {"mean": 0.5, "sd": 0.25} for a in fp.ASPECTS},
        "reviewCount": count(g.get("reviews_count") or y.get("reviews_count")), "rating": float(rating),
        "sources": ["brightdata"],
    }
    return {k: place[k] for k in PLACE_KEYS}


def parse_add(spec: str | None) -> dict:
    out = {}
    for part in (spec or "").split(","):
        if part.strip():
            cat, _, n = part.partition("=")
            if cat.strip() not in fp.TARGETS or not n.strip().isdigit():
                raise SystemExit(f"--add: expected meal=N,dessert=N,activity=N, got {part!r}")
            out[cat.strip()] = int(n)
    return out


def stable_id(row: dict) -> str:
    """New venues keep one id across runs (from their source key), so earlier plans never point elsewhere."""
    return "bd_" + hashlib.sha1(row["bdId"].encode()).hexdigest()[:10]


def merge(catalog: list[dict], rows: list[dict], add: dict, log=print, prices: dict | None = None,
          missing: list | None = None, skip: set = frozenset()) -> list[dict]:
    """Enrich matched places (only empty priceLevel, extra dietary tags, sources) and append new ones.

    With `prices` (place ID -> Google Places result), a new meal needs a known price: a place
    Google gives no price is passed over, and one not looked up yet goes into `missing`
    (counting toward the target) for priced_merge to look up. Without it, unpriced meals cost 25.
    """
    catalog = json.loads(json.dumps(catalog))
    by_id = {p["id"]: p for p in catalog}
    enriched = 0
    for row in rows:
        p = by_id.get(row.get("huddleId"))
        if not p:
            continue
        before = json.dumps(p)
        if p.get("priceLevel") is None and (row.get("yelp") or {}).get("price_level"):
            p["priceLevel"] = row["yelp"]["price_level"]
        p["dietary"] = p["dietary"] + [d for d in diets(row_texts(row)) if d not in p["dietary"]]
        if "brightdata" not in p["sources"]:
            p["sources"] = p["sources"] + ["brightdata"]
        enriched += json.dumps(p) != before
    added = {c: [] for c in add}
    pending = {c: 0 for c in add}
    taken = set(by_id)
    for row in sorted(rows, key=lambda r: -reviews(r)):
        cat = row["category"]
        if cat not in add or len(added[cat]) + pending[cat] >= add[cat] or row.get("huddleId"):
            continue
        g = row.get("google") or {}
        if catalog_match(row, row.get("google"), catalog) or g.get("temporarily_closed"):
            continue
        if not in_box(row["lat"], row["lng"]):
            continue
        level = None
        if prices is not None and cat == "meal" and not (row.get("yelp") or {}).get("price_level"):
            gid = g.get("place_id")
            if not gid or gid in skip or (gid in prices and not prices[gid].get("priceLevel")):
                continue
            if gid not in prices:
                if missing is not None and to_place(row, stable_id(row)) is not None:
                    missing.append(gid)
                    pending[cat] += 1
                continue
            level = fp.PRICE_NUM.get(prices[gid]["priceLevel"])
        place = to_place(row, stable_id(row), level)
        if place is None or place["id"] in taken:
            continue
        catalog.append(place)
        taken.add(place["id"])
        added[cat].append(place["name"])
    log(f"merge: enriched {enriched} existing places; added "
        + ", ".join(f"{len(v)}/{add[c]} {c}" for c, v in added.items()) if add else
        f"merge: enriched {enriched} existing places; nothing added (use --add)")
    for c, names in added.items():
        if len(names) < add[c]:
            log(f"  short of {c}: only {len(names)} new candidates with hours and a rating inside Berkeley")
    return catalog


def priced_merge(catalog: list[dict], rows: list[dict], add: dict, log=print) -> tuple[list[dict], dict]:
    """merge, looking up each candidate new meal on Google Places first (cached, paid once)."""
    path = OUT / "google_places.json"
    prices = read_json(path, {})
    key, failed = None, set()
    for _ in range(20):
        missing: list = []
        merge(catalog, rows, add, log=lambda *_: None, prices=prices, missing=missing, skip=failed)
        if not missing:
            break
        key = key or source_places.load_key()
        log(f"prices: looking up {len(missing)} new restaurants on Google Places")
        for gid in missing:
            result = source_places.lookup(key, gid)
            if "error" in result:
                failed.add(gid)  # passed over this run, retried next time
            else:
                prices[gid] = result
        write_json(path, prices)
    unpriced = sum(1 for v in prices.values() if not v.get("priceLevel"))
    if prices:
        log(f"prices: {len(prices) - unpriced} priced, {unpriced} without a Google price (not added)")
    return merge(catalog, rows, add, log=log, prices=prices, skip=failed), prices


# publish: the merged catalog straight into SpacetimeDB (POST /catalog, server/src/lib/catalog.ts).
# The module validates the whole snapshot and swaps it in atomically; every coordinator request
# then carries it to FastAPI, so no republish or restart is needed.

MAX_ACTIVE = {"meal": 80, "activity": 50, "dessert": 30}  # same caps as server/src/lib/catalog.ts


def evidence_for(row: dict | None, fetched: dict, price: dict | None = None) -> dict:
    """Source URL, fetch time and rating per source, only as the scrape recorded them."""
    sources = []
    if price and price.get("priceLevel"):  # where a new venue's price came from
        sources.append({"source": "google_places", "url": None, "fetchedAt": price.get("fetchedAt"),
                        "rating": None, "reviewCount": None})
    for source, sub, key in (("gmaps", (row or {}).get("google"), "place_id"), ("yelp", (row or {}).get("yelp"), "biz_id")):
        if not sub:
            continue
        url, rating = sub.get("url"), sub.get("rating")
        sources.append({
            "source": source,
            "url": url if isinstance(url, str) and url.startswith("https://") and len(url) <= 500 else None,
            "fetchedAt": fetched.get((source, sub[key])),
            "rating": float(rating) if isinstance(rating, (int, float)) and 0 <= rating <= 5 else None,
            "reviewCount": count(sub["reviews_count"]) if sub.get("reviews_count") is not None else None,
        })
    return {"sources": sources}


def snapshot_payload(catalog: list[dict], rows: list[dict], snaps: list[dict], generated_at: str,
                     prices: dict | None = None) -> dict:
    by_place: dict = {}
    for r in rows:
        if r.get("huddleId"):
            by_place[r["huddleId"]] = r
        by_place.setdefault(stable_id(r), r)
    fetched: dict = {}
    for s in snaps:
        k = (s["source"], s["key"])
        fetched[k] = max(fetched.get(k, s["fetched_at"]), s["fetched_at"])
    venues = [{"place": p, "evidence": evidence_for(by_place.get(p["id"]), fetched,
                                                     (prices or {}).get(p.get("googlePlaceId")) if p["id"].startswith("bd_") else None)}
              for p in catalog]
    digest = hashlib.sha256(json.dumps(venues, sort_keys=True).encode()).hexdigest()[:8]
    return {"version": f"{generated_at}-{digest}", "generatedAt": generated_at, "venues": venues}


def push_catalog(uri: str, db: str, secret: str, payload: dict):
    req = urllib.request.Request(f"{uri.rstrip('/')}/v1/database/{db}/route/catalog",
                                 data=json.dumps(payload).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "X-Huddle-Secret": secret})
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            status, text = res.status, res.read().decode()
    except urllib.error.HTTPError as e:
        status, text = e.code, e.read().decode(errors="replace")
    except urllib.error.URLError as e:
        return 0, str(e.reason)
    try:
        return status, json.loads(text)
    except json.JSONDecodeError:
        return status, text


# CLI

def keywords_for(args) -> list[str]:
    if args.keywords:
        return [k.strip() for k in args.keywords.split(",") if k.strip()]
    groups = [g.strip() for g in args.groups.split(",")]
    unknown = set(groups) - set(GROUPS)
    if unknown:
        raise SystemExit(f"--groups: unknown {sorted(unknown)}; known: {sorted(GROUPS)}")
    return [kw for g in groups for kw in GROUPS[g]]


def run_jobs(jobs: dict) -> bool:
    """jobs: {(source, kind): (inputs, fn)}. Runs them in parallel, saves raw output, then builds."""
    ok = True
    with ThreadPoolExecutor(max_workers=len(jobs) or 1) as pool:
        futures = {k: pool.submit(fn) for k, (_, fn) in jobs.items()}
        for (source, kind), fut in futures.items():
            try:
                params, records = fut.result()
            except bd.BrightDataError as e:
                print(f"{source} {kind} FAILED: {e}")
                ok = False
                continue
            errs = sum(bd.is_error(r) for r in records)
            path = bd.save_raw(source, kind, params, jobs[(source, kind)][0], records)
            print(f"{source} {kind}: {len(records)} records ({errs} errors) -> {path.relative_to(bd.ROOT)}")
    build()
    return ok


def cmd_probe(args) -> None:
    client = bd.Client(bd.load_key())
    found = [d for d in client.datasets()
             if re.search(r"yelp|google maps", str(d.get("name", "")), re.I)]
    print(f"{len(found)} Yelp / Google Maps scrapers:")
    details = []
    for d in found:
        status, meta = client.metadata(d["id"])
        details.append({**d, "metadata_status": status, "metadata": meta})
        print(f"  {d['id']}  {d.get('name')}")
    bd.RAW.mkdir(parents=True, exist_ok=True)
    (bd.RAW / "brightdata_probe.json").write_text(json.dumps(details, indent=1), encoding="utf-8")
    print("Metadata saved to data/raw/brightdata_probe.json. Set source_yelp.DISCOVER_DATASET / DISCOVER_BY "
          "(or pass --yelp-dataset / --yelp-discover-by) from it.")


def cmd_discover(args) -> None:
    keywords = keywords_for(args)
    jobs = {}
    estimate = 0
    if args.source in ("all", "gmaps"):
        points = [DOWNTOWN] if args.one_point else source_gmaps.grid(fp.BERKELEY)
        inputs = source_gmaps.discover_inputs(points, keywords)
        estimate += len(inputs) * args.limit
        print(f"gmaps: {len(points)} points x {len(keywords)} keywords = {len(inputs)} inputs, "
              f"up to {len(inputs) * args.limit} records")
        jobs[("gmaps", "discover")] = (inputs, lambda: source_gmaps.discover(client, inputs, args.limit))
    if args.source in ("all", "yelp"):
        yinputs = source_yelp.discover_inputs(keywords, args.yelp_discover_by)
        estimate += len(yinputs) * args.yelp_limit
        print(f"yelp: {len(yinputs)} inputs (discover_by={args.yelp_discover_by}), "
              f"up to {len(yinputs) * args.yelp_limit} records")
        jobs[("yelp", "discover")] = (yinputs, lambda: source_yelp.discover(
            client, yinputs, args.yelp_limit, args.yelp_dataset, args.yelp_discover_by))
    if estimate > CONFIRM_ABOVE and not args.yes:
        sys.exit(f"Up to {estimate} records (about ${estimate * USD_PER_1K / 1000:.2f} at pay-as-you-go). "
                 "Re-run with --yes, or narrow with --groups / --keywords / --one-point.")
    client = bd.Client(bd.load_key())
    print("Discovery takes minutes (about 4 min for 20 places in the first measured run).")
    sys.exit(0 if run_jobs(jobs) else 1)


def cmd_refresh(args) -> None:
    rows = read_json(OUT / "places.json", [])
    jobs = {}
    if args.source in ("all", "gmaps"):
        urls = [r["google"]["url"] for r in rows if r.get("google") and r["google"].get("url")]
        known = {r["google"]["place_id"] for r in rows if r.get("google")}
        missing = [p["googlePlaceId"] for p in read_json(PLACES, [])
                   if p.get("googlePlaceId") and p["googlePlaceId"] not in known]
        if args.catalog_by == "url":
            urls += [source_gmaps.place_id_url(pid) for pid in missing]
        elif missing:
            jobs[("gmaps", "catalog")] = ([{"place_id": p} for p in missing],
                                          lambda: source_gmaps.refresh_by_place_id(client, missing))
        if urls:
            jobs[("gmaps", "refresh")] = ([{"url": u} for u in urls], lambda: source_gmaps.refresh(client, urls))
        print(f"gmaps: {len(urls)} urls, {len(missing)} catalog places not yet seen (by {args.catalog_by})")
    if args.source in ("all", "yelp"):
        yurls = [r["yelp"]["url"] for r in rows if r.get("yelp") and r["yelp"].get("url")]
        if yurls:
            jobs[("yelp", "refresh")] = ([{"url": u} for u in yurls], lambda: source_yelp.refresh(client, yurls))
        print(f"yelp: {len(yurls)} urls")
    if not jobs:
        sys.exit("Nothing to refresh: run discover first.")
    client = bd.Client(bd.load_key())
    sys.exit(0 if run_jobs(jobs) else 1)


def latest_fetches(snaps: list[dict]) -> dict:
    fetched: dict = {}
    for s in snaps:
        k = (s["source"], s["key"])
        fetched[k] = max(fetched.get(k, s["fetched_at"]), s["fetched_at"])
    return fetched


def cmd_details(args) -> None:
    """Takeout, seating, photos, menus and dietary evidence for the catalog -> data/brightdata/details.json."""
    rows = read_json(OUT / "places.json", None)
    if rows is None:
        sys.exit("data/brightdata/places.json is missing: run discover or build first.")
    snap = read_json(OUT / "catalog.json", None)  # the last publish (or --dry-run) snapshot
    targets = [v["place"] for v in snap["venues"]] if snap else read_json(PLACES, [])
    if args.only:
        wanted = {x.strip() for x in args.only.split(",")}
        targets = [t for t in targets if t["id"] in wanted]
    if args.limit:
        targets = targets[:args.limit]
    by_gid = {r["google"]["place_id"]: r for r in rows if r.get("google")}
    places_path, menus_path = OUT / "google_places.json", OUT / "menus.json"
    google, menus = read_json(places_path, {}), read_json(menus_path, {})
    if args.places:
        key = source_places.load_key()
        for t in targets:
            gid = t.get("googlePlaceId")
            if gid and (args.refresh or gid not in google):
                result = source_places.lookup(key, gid, args.photos)
                if "error" in result:
                    print(f"  places: {t['name']}: {result['error']} (left unknown)")
                    continue
                google[gid] = result
                write_json(places_path, google)
    if args.menus:
        client = zone = None
        if args.fetch == "unlocker":
            zone = bd.env_value("BRIGHTDATA_UNLOCKER_ZONE")
            if not zone:
                sys.exit("Set BRIGHTDATA_UNLOCKER_ZONE (a Web Unlocker zone name) or pass --fetch direct.")
            client = bd.Client(bd.load_key())
        for t in targets:
            mkey = t.get("googlePlaceId") or t["id"]
            if t["category"] == "activity" or (mkey in menus and not args.refresh):
                continue
            website = ((by_gid.get(t.get("googlePlaceId")) or {}).get("google") or {}).get("website")
            try:
                menus[mkey] = source_menus.menu_for(t["name"], website, args.fetch, client, zone)
            except Exception as e:  # one bad site must not stop a long batch; the reason is kept
                menus[mkey] = {"status": "fetch_failed", "website": website, "pages": [], "items": [], "legend": None,
                               "extractedAt": None, "reason": f"unexpected error: {type(e).__name__}: {e}"[:300]}
            m = menus[mkey]
            print(f"  menu: {t['name']}: {m['status']}, {len(m['items'])} items" + (f" ({m['reason']})" if m.get("reason") else ""))
            write_json(menus_path, menus)
    fetched = latest_fetches(read_json(OUT / "snapshots.json", []))
    order = {t["id"]: i for i, t in enumerate([v["place"] for v in snap["venues"]] if snap else targets)}
    # A full run replaces the file (venues no longer in the catalog go); --only/--limit update in place.
    out = {} if not (args.only or args.limit) else {d["id"]: d for d in read_json(OUT / "details.json", [])}
    for t in targets:
        gid = t.get("googlePlaceId")
        out[t["id"]] = details.venue_details(t, by_gid.get(gid), google.get(gid), menus.get(gid or t["id"]),
                                             fetched, rows)
    write_json(OUT / "details.json", sorted(out.values(), key=lambda d: order.get(d["id"], len(order))))
    done = [out[t["id"]] for t in targets]
    print(f"details: {len(done)} venues -> {OUT / 'details.json'}; menus ok {sum(d['menu']['status'] == 'ok' for d in done)}, "
          f"takeout known {sum(d['takeout']['value'] is not None for d in done)}, "
          f"with photos {sum(bool(d['photos']) for d in done)}, "
          f"explicit menu dietary {sum(d['dietaryCoverage'] == 'explicit_menu' for d in done)}")


def cmd_fetch(args) -> None:
    """Download a finished job by snapshot id (when discover/refresh stopped waiting), then build."""
    records = bd.Client(bd.load_key()).wait(args.snapshot, timeout_s=args.wait)
    path = bd.save_raw(args.source, args.kind, {"snapshot_id": args.snapshot}, [], records)
    print(f"{args.source} {args.kind}: {len(records)} records ({sum(bd.is_error(r) for r in records)} errors) "
          f"-> {path.relative_to(bd.ROOT)}")
    build()


def cmd_merge(args) -> None:
    rows = read_json(OUT / "places.json", None)
    if rows is None:
        sys.exit("data/brightdata/places.json is missing: run discover or build first.")
    catalog = read_json(PLACES, [])
    merged, _ = priced_merge(catalog, rows, parse_add(args.add))
    for problem in fp.validate(merged):
        if "no phone" not in problem:
            print("  note:", problem)
    if args.dry_run:
        print("Dry run: data/places.json not written.")
        return
    backup = DATA / "places.v1.json"
    if not backup.exists():
        shutil.copyfile(PLACES, backup)
        print(f"Backed up the current catalog to {backup.name}")
    write_json(PLACES, merged)
    print(f"Wrote places.json ({len(merged)} places)")


def cmd_publish(args) -> None:
    rows = read_json(OUT / "places.json", None)
    if rows is None:
        sys.exit("data/brightdata/places.json is missing: run discover or build first.")
    catalog, prices = priced_merge(read_json(PLACES, []), rows, parse_add(args.add))
    counts = {c: sum(p["category"] == c for p in catalog) for c in MAX_ACTIVE}
    over = {c: n for c, n in counts.items() if n > MAX_ACTIVE[c]}
    if over:
        sys.exit(f"Too many venues for the coordinator: {over}; caps are {MAX_ACTIVE}. Lower --add.")
    problems = [x for x in fp.validate(catalog) if "no phone" not in x]
    if problems:
        sys.exit("Not publishing an invalid catalog:\n  " + "\n  ".join(problems))
    payload = snapshot_payload(catalog, rows, read_json(OUT / "snapshots.json", []), bd.now_iso(), prices)
    write_json(OUT / "catalog.json", payload)  # the snapshot as sent; the last good one stays live on failure
    sourced = sum(bool(v["evidence"]["sources"]) for v in payload["venues"])
    print(f"Snapshot {payload['version']}: {counts}, {sourced} with Bright Data evidence "
          f"-> {OUT / 'catalog.json'}")
    if args.dry_run:
        print("Dry run: not sent to SpacetimeDB.")
        return
    env = {k: bd.env_value(k) for k in ("SPACETIMEDB_URI", "SPACETIMEDB_DB", "HUDDLE_SHARED_SECRET")}
    missing = [k for k, v in env.items() if not v]
    if missing:
        sys.exit(f"Set {', '.join(missing)} (shell, repo-root .env or api/.env) to publish.")
    status, data = push_catalog(env["SPACETIMEDB_URI"], env["SPACETIMEDB_DB"], env["HUDDLE_SHARED_SECRET"], payload)
    if status != 200:
        sys.exit(f"SpacetimeDB refused the snapshot (HTTP {status}): {data}. The previous snapshot stays live.")
    print(f"Published to {env['SPACETIMEDB_DB']}: {data.get('active')} active venues, "
          f"{data.get('deactivated')} deactivated.")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("probe", help="list Bright Data's Yelp and Google Maps scrapers with their metadata")
    d = sub.add_parser("discover", help="find places (slow, billed per record)")
    # Yelp discovery returned 0 records on url and bounding_box (2026-10-24): opt in with --source yelp/all.
    d.add_argument("--source", choices=["all", "gmaps", "yelp"], default="gmaps")
    d.add_argument("--groups", default=",".join(GROUPS), help="comma list of " + ", ".join(GROUPS))
    d.add_argument("--keywords", help="comma list; overrides --groups")
    d.add_argument("--one-point", action="store_true", help="Google Maps: downtown only instead of the grid")
    d.add_argument("--limit", type=int, default=20, help="Google Maps records per point and keyword")
    d.add_argument("--yelp-limit", type=int, default=100, help="Yelp records per keyword")
    d.add_argument("--yelp-dataset", default=source_yelp.DISCOVER_DATASET)
    d.add_argument("--yelp-discover-by", default=source_yelp.DISCOVER_BY, choices=sorted(source_yelp.INPUT_BUILDERS))
    d.add_argument("--yes", action="store_true", help=f"allow more than {CONFIRM_ABOVE} records")
    r = sub.add_parser("refresh", help="fresh numbers for every known place, one batch per source")
    r.add_argument("--source", choices=["all", "gmaps", "yelp"], default="all")
    r.add_argument("--catalog-by", choices=["url", "place_id"], default="url",
                   help="how to look up catalog places not yet seen on Google Maps")
    f = sub.add_parser("fetch", help="download a finished job by snapshot id, then build")
    f.add_argument("snapshot", help="snapshot id printed by discover/refresh, e.g. sd_…")
    f.add_argument("--source", choices=["gmaps", "yelp"], required=True)
    f.add_argument("--kind", default="discover", choices=["discover", "refresh", "catalog"])
    f.add_argument("--wait", type=int, default=3600, help="seconds to wait if it is still running")
    dt = sub.add_parser("details", help="takeout, seating, photos, menus and dietary evidence for the catalog")
    dt.add_argument("--only", help="comma list of catalog ids (p_005,bd_…)")
    dt.add_argument("--limit", type=int, help="first N catalog venues")
    dt.add_argument("--no-places", dest="places", action="store_false", help="skip Google Places lookups")
    dt.add_argument("--no-menus", dest="menus", action="store_false", help="skip website menus")
    dt.add_argument("--fetch", choices=["unlocker", "direct"], default="unlocker",
                    help="how to fetch websites: Bright Data Web Unlocker (default) or plain HTTPS")
    dt.add_argument("--photos", type=int, default=2, help="Google Places photos per venue")
    dt.add_argument("--refresh", action="store_true", help="look up again even when cached")
    sub.add_parser("build", help="rebuild data/brightdata/ from data/raw/ without calling the API")
    m = sub.add_parser("merge", help="fold Bright Data into data/places.json, keeping existing ids")
    m.add_argument("--add", help="new places per category, e.g. meal=10,dessert=5,activity=5")
    m.add_argument("--dry-run", action="store_true")
    pb = sub.add_parser("publish", help="send the merged catalog to SpacetimeDB (POST /catalog); goes live at once")
    pb.add_argument("--add", help="new places per category, e.g. meal=10,dessert=5,activity=5")
    pb.add_argument("--dry-run", action="store_true", help="write data/brightdata/catalog.json, do not send")
    args = ap.parse_args()
    {"probe": cmd_probe, "discover": cmd_discover, "refresh": cmd_refresh, "fetch": cmd_fetch, "details": cmd_details, "build": lambda a: build(),
     "merge": cmd_merge, "publish": cmd_publish}[args.cmd](args)


if __name__ == "__main__":
    main()
