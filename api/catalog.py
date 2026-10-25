"""Place catalog for the real solver: feature matrix, opening hours, travel (C3/C4).

Built once at startup from data/places.json, or per live snapshot the module sends with a
coordinator request (CatalogCache). Everything here is group-independent.
"""

from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import date
from functools import lru_cache
import hashlib
import json
from itertools import product
from math import ceil

import numpy as np

from .models import FEATURES, Place

CUISINES = ("asian", "latin", "mediterranean", "american", "cafe_dessert")
CATEGORIES = ("meal", "activity", "dessert")
TEMPLATES = (("meal", "activity", "dessert"), ("activity", "meal"))
# Coordinator only: a meal can be the whole outing; dessert does not require an activity.
SHORT_TEMPLATES = (*TEMPLATES, ("meal", "dessert"), ("meal",))
# Coordinator only: longer outings add distinct activities, never a second meal or dessert,
# so every private order stays one meal item plus at most one dessert item.
LONG_TEMPLATES = {
    4: (("activity", "meal", "activity", "dessert"), ("meal", "activity", "dessert", "activity")),
    5: (("activity", "meal", "activity", "dessert", "activity"),
        ("activity", "activity", "meal", "activity", "dessert")),
}
WEEKDAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
GRID = 15  # minutes between candidate start times
BRANCH = 6  # long routes: nearest feasible next stops tried from each stop
ROUTE_CAP = 3000  # long routes kept per template; Claude sees at most 120 candidates
DIETARY_CATEGORIES = ("meal", "dessert")  # S5.1: activities never need dietary tags


def minutes(clock: str) -> int:
    hour, minute = map(int, clock.split(":"))
    return hour * 60 + minute


def clock(value: int) -> str:
    return f"{value // 60:02}:{value % 60:02}"


def feature_vector(place: Place) -> list[float]:
    # Activities have no cuisine, whatever their cuisine field says.
    return [place.aspects[f].mean for f in FEATURES[:8]] + [
        float(place.category != "activity" and place.cuisine == c) for c in CUISINES
    ]


def haversine_km(lat1, lng1, lat2, lng2):
    lat1, lng1, lat2, lng2 = map(np.radians, (lat1, lng1, lat2, lng2))
    a = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lng2 - lng1) / 2) ** 2
    return 2 * 6371.0 * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def travel_minutes(km):
    """Tier 1 (C4): straight line x1.3; walk 4.5 km/h up to 1.2 km, else 18 km/h."""
    km = np.asarray(km, dtype=float) * 1.3
    return km / np.where(km <= 1.2, 4.5, 18.0) * 60.0


@dataclass(frozen=True)
class Itinerary:
    stops: tuple[int, ...]   # catalog indices
    starts: tuple[int, ...]  # minutes after midnight


@dataclass
class Catalog:
    places: list[Place]
    evidence: dict = field(default_factory=dict)  # place ID -> Evidence (live snapshots only)
    X: np.ndarray = field(init=False)
    index: dict[str, int] = field(init=False)
    category: np.ndarray = field(init=False)
    cost: np.ndarray = field(init=False)
    lat: np.ndarray = field(init=False)
    lng: np.ndarray = field(init=False)
    legs: np.ndarray = field(init=False)
    default_aspects: bool = field(init=False)

    def __post_init__(self):
        self.X = np.array([feature_vector(p) for p in self.places])
        # True while every aspect is the 0.5/0.25 placeholder (no review data yet).
        self.default_aspects = all(a.mean == 0.5 and a.sd == 0.25
                                   for p in self.places for a in p.aspects.values())
        self.index = {p.id: i for i, p in enumerate(self.places)}
        self.category = np.array([p.category for p in self.places])
        self.cost = np.array([p.costPerPerson for p in self.places], dtype=float)
        self.lat = np.array([p.lat for p in self.places])
        self.lng = np.array([p.lng for p in self.places])
        self.legs = travel_minutes(haversine_km(self.lat[:, None], self.lng[:, None],
                                                self.lat[None, :], self.lng[None, :]))
        self._enumerate = lru_cache(maxsize=32)(self._enumerate_uncached)

    def open_for(self, i: int, weekday: str, start: int) -> bool:
        end = start + self.places[i].dwellMinutes
        for open_at, close_at in self.places[i].hours[weekday]:
            lo, hi = minutes(open_at), minutes(close_at)
            hi = 24 * 60 if hi == 23 * 60 + 59 else hi  # 23:59 means midnight
            if lo <= start and end <= hi:
                return True
        return False

    def itineraries(self, day: str, window_start: str, window_end: str,
                    templates: tuple[tuple[str, ...], ...] = TEMPLATES) -> list[Itinerary]:
        """Every time-feasible stop sequence for that day and window, earliest start each."""
        weekday = WEEKDAYS[date.fromisoformat(day).weekday()]
        return self._enumerate(weekday, minutes(window_start), minutes(window_end), templates)

    def _enumerate_uncached(self, weekday: str, lo: int, hi: int,
                            templates: tuple[tuple[str, ...], ...] = TEMPLATES) -> list[Itinerary]:
        grid = list(range(lo, hi + 1, GRID))
        ok = {(i, t) for i in range(len(self.places)) for t in grid if self.open_for(i, weekday, t)}
        by_cat = {c: [i for i in range(len(self.places)) if self.category[i] == c and
                      any((i, t) in ok for t in grid)] for c in CATEGORIES}
        legs = self.legs.tolist()  # plain floats: numpy scalar indexing dominates this loop
        dwell = [p.dwellMinutes for p in self.places]
        result = []
        for template in templates:
            for combo in product(*(by_cat[c] for c in template)):
                for first in grid:
                    starts, t = [], first
                    for k, i in enumerate(combo):
                        if (i, t) not in ok:
                            break
                        starts.append(t)
                        end = t + dwell[i]
                        if k + 1 < len(combo):
                            t = lo + ceil((end + legs[i][combo[k + 1]] - lo) / GRID) * GRID
                        elif end > hi:
                            break
                    else:
                        result.append(Itinerary(tuple(combo), tuple(starts)))
                        break
        return result

    def routes(self, day: str, window_start: str, window_end: str, templates: tuple[tuple[str, ...], ...],
               allowed: set[int], first_ok=lambda i: True, budgets=(), max_elapsed: float | None = None,
               branch: int = BRANCH, cap: int = ROUTE_CAP) -> list[Itinerary]:
        """Bounded search for long templates, where a full product would be hundreds of millions.

        Group-specific, so uncached. Opening hours, window, distinct venues, outing time and
        budgets (each `(cap, lower-bound price per place)`) prune prefixes exactly. Only the
        `branch` nearest feasible next stops are tried, and at most `cap` routes per template are
        kept, spread across first stops. Earliest feasible start per stop sequence, as itineraries().
        """
        weekday = WEEKDAYS[date.fromisoformat(day).weekday()]
        lo, hi = minutes(window_start), minutes(window_end)
        legs = self.legs.tolist()
        dwell = [p.dwellMinutes for p in self.places]
        by_cat = {c: [i for i in sorted(allowed) if self.category[i] == c] for c in CATEGORIES}
        nearest = {c: {i: sorted(by_cat[c], key=legs[i].__getitem__) for i in sorted(allowed)} for c in CATEGORIES}
        opened = {}

        def is_open(i, t):
            if (i, t) not in opened:
                opened[i, t] = self.open_for(i, weekday, t)
            return opened[i, t]

        result = []
        for template in templates:
            if not all(by_cat[c] for c in template):
                continue
            n = len(template)
            # Lower bounds for the stops from position k onward.
            rest = [sum(min(dwell[i] for i in by_cat[c]) for c in template[k:]) for k in range(n + 1)]
            rest_cost = [[sum(min(price[i] for i in by_cat[c]) for c in template[k:]) for k in range(n + 1)]
                         for _, price in budgets]
            if max_elapsed is not None and rest[0] > max_elapsed:
                continue
            firsts = [i for i in by_cat[template[0]] if first_ok(i)]
            per_first = max(1, cap // max(1, len(firsts)))
            seen = set()

            def fits(k, i, start, first_start, spent):
                end = start + dwell[i]
                return (is_open(i, start) and end + rest[k + 1] <= hi and
                        (max_elapsed is None or end + rest[k + 1] - first_start <= max_elapsed) and
                        all(s + price[i] + rc[k + 1] <= limit + 1e-9
                            for s, (limit, price), rc in zip(spent, budgets, rest_cost)))

            def extend(k, route, starts, first_start, spent, found):
                if k == n:
                    if route not in seen:
                        seen.add(route)
                        result.append(Itinerary(route, starts))
                        found.append(route)
                    return
                prev = route[-1]
                end = starts[-1] + dwell[prev]
                tried = 0
                for i in nearest[template[k]][prev]:
                    if tried == branch or len(found) >= per_first:
                        return
                    if i in route:
                        continue
                    start = lo + ceil((end + legs[prev][i] - lo) / GRID) * GRID
                    if fits(k, i, start, first_start, spent):
                        tried += 1
                        extend(k + 1, route + (i,), starts + (start,), first_start,
                               [s + price[i] for s, (_, price) in zip(spent, budgets)], found)

            for first in firsts:
                found = []
                for start in range(lo, hi + 1, GRID):
                    if start + rest[0] > hi or len(found) >= per_first:
                        break
                    if fits(0, first, start, start, [0.0] * len(budgets)):
                        extend(1, (first,), (start,), start, [price[first] for _, price in budgets], found)
        return result

    def first_leg_minutes(self, origin, i: int) -> float:
        return float(travel_minutes(haversine_km(origin.lat, origin.lng, self.lat[i], self.lng[i])))



class CatalogCache:
    """Catalogs for live snapshots, keyed by content (not the version label), most recent kept."""

    def __init__(self, size: int = 4):
        self.size = size
        self._items: OrderedDict[str, Catalog] = OrderedDict()

    def get(self, snapshot) -> Catalog:
        key = hashlib.sha256(json.dumps(snapshot.model_dump(mode="json", exclude={"version"}),
                                        sort_keys=True).encode()).hexdigest()
        if key in self._items:
            self._items.move_to_end(key)
        else:
            self._items[key] = Catalog(list(snapshot.places), dict(snapshot.evidence))
            while len(self._items) > self.size:
                self._items.popitem(last=False)
        return self._items[key]
