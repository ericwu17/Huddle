"""Place catalog for the real solver: feature matrix, opening hours, travel (C3/C4).

Built once at startup from data/places.json. Everything here is group-independent.
"""

from dataclasses import dataclass, field
from datetime import date
from functools import lru_cache
from itertools import product
from math import ceil

import numpy as np

from .models import FEATURES, Place

CUISINES = ("asian", "latin", "mediterranean", "american", "cafe_dessert")
CATEGORIES = ("meal", "activity", "dessert")
TEMPLATES = (("meal", "activity", "dessert"), ("activity", "meal"))
WEEKDAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
GRID = 15  # minutes between candidate start times
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

    def itineraries(self, day: str, window_start: str, window_end: str) -> list[Itinerary]:
        """Every time-feasible stop sequence for that day and window, earliest start each."""
        weekday = WEEKDAYS[date.fromisoformat(day).weekday()]
        return self._enumerate(weekday, minutes(window_start), minutes(window_end))

    def _enumerate_uncached(self, weekday: str, lo: int, hi: int) -> list[Itinerary]:
        grid = list(range(lo, hi + 1, GRID))
        ok = {(i, t) for i in range(len(self.places)) for t in grid if self.open_for(i, weekday, t)}
        by_cat = {c: [i for i in range(len(self.places)) if self.category[i] == c and
                      any((i, t) in ok for t in grid)] for c in CATEGORIES}
        legs = self.legs.tolist()  # plain floats: numpy scalar indexing dominates this loop
        dwell = [p.dwellMinutes for p in self.places]
        result = []
        for template in TEMPLATES:
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

    def first_leg_minutes(self, origin, i: int) -> float:
        return float(travel_minutes(haversine_km(origin.lat, origin.lng, self.lat[i], self.lng[i])))

