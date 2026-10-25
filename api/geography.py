"""Bounded, area-balanced retrieval. Postal addresses are facts, not inferred preferences."""
from collections import defaultdict, deque
from math import ceil
import re


def city(place):
    match = re.search(r",\s*([^,]+),\s*(?:CA|California)\b", place.address)
    return match.group(1).strip() if match else ""


def area(place):
    name = city(place).casefold()
    if name == "san francisco":
        return "sf"
    if name == "oakland":
        return "oakland"
    return "berkeley"


def balanced_venues(places):
    buckets = defaultdict(deque)
    for place in places:
        buckets[city(place) or area(place)].append(place)
    result = []
    while any(buckets.values()):
        for key in sorted(buckets):
            if buckets[key]:
                result.append(buckets[key].popleft())
    return result


def balanced_candidates(plans, catalog, limit=120):
    buckets = defaultdict(list)
    for key, plan in plans.items():
        regions = {city(catalog.places[catalog.index[stop.placeId]]) or area(catalog.places[catalog.index[stop.placeId]]) for stop in plan.stops}
        # Keep each offered outing compact. Cross-Bay itinerary routing remains
        # a separate follow-up; never make a straight-line Bay crossing a stop.
        if len(regions) == 1:
            buckets[next(iter(regions))].append(key)
    queues = {}
    for region, keys in buckets.items():
        ordered = sorted(keys, key=lambda key: (plans[key].costPerPerson, key))
        first = ordered[:8]
        remaining = sorted(set(ordered) - set(first))
        slots = max(1, ceil(limit / len(buckets)) - len(first))
        sampled = remaining[::max(1, ceil(len(remaining) / slots))][:slots]
        queues[region] = deque(first + sampled)
    selected = []
    while len(selected) < limit and any(queues.values()):
        for region in sorted(queues):
            if queues[region]:
                selected.append(queues[region].popleft())
                if len(selected) == limit:
                    break
    return {key: plans[key] for key in selected}
