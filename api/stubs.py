"""Deterministic synthetic fixtures, not a solver, parser, or learned model.

Only fixed fixture itineraries are considered. Eligibility checks prevent those
fixtures from contradicting supplied constraints. Nothing reads or writes a DB.
"""

from datetime import date
from decimal import Decimal
from hashlib import sha256
from itertools import combinations
from math import asin, cos, radians, sin, sqrt
import random

from .models import (
    FEATURES, CouncilMessage, CouncilRequest, CouncilResponse, Hard, NextRequest,
    NextResponse, OffersResponse, Pareto, ParseRequest, ParseResponse, Place, Plan,
    PlanRequest, PlanResponse, Posterior, RouletteRequest, RouletteResponse,
    UpdateRequest, UpdateResponse,
)

FAKE = "SYNTHETIC STUB: canned data; no parsing, learning, optimization, or live council."
FIXTURE_TS = 1792886400000  # Frozen synthetic clock, not a live event timestamp.


class StubInputError(ValueError):
    def __init__(self, detail: str, status: int = 422):
        super().__init__(detail)
        self.status = status


def prior() -> Posterior:
    return Posterior(mean=[0.0] * 13, cov=[
        [float(i == j) for j in range(13)] for i in range(13)
    ])


def fixture_places() -> list[Place]:
    """Nine fictional Berkeley locations, no phone numbers or external sources."""
    result = []
    for index, (kind, costs, cuisine) in enumerate((
        ("safe", (12, 2, 4), "mediterranean"),
        ("bold", (13, 3, 4), "latin"),
        ("budget", (10, 1, 3), "american"),
    )):
        for stop_index, (category, cost) in enumerate(zip(("meal", "activity", "dessert"), costs)):
            result.append(Place(
                id=f"stub_{kind}_{category}", name=f"SYNTHETIC {kind.title()} {category.title()}",
                category=category,
                cuisine="none" if category == "activity" else "cafe_dessert" if category == "dessert" else cuisine,
                address="Fictional fixture, Berkeley, CA", lat=37.8715 + index * .0001,
                lng=-122.2730 + stop_index * .0001, priceLevel=1, costPerPerson=cost,
                dwellMinutes=30 if category == "dessert" else 75, phone=None,
                dietary=["vegetarian", "vegan", "gluten_free"],
                hours={day: [["00:00", "23:59"]] for day in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")},
                aspects={feature: {"mean": .5, "sd": .25} for feature in FEATURES[:8]},
                reviewCount=0, rating=0, sources=["synthetic_stub"],
            ))
    return result


def feature_vector(place: Place) -> list[float]:
    cuisines = ("asian", "latin", "mediterranean", "american", "cafe_dessert")
    return [place.aspects[f].mean for f in FEATURES[:8]] + [
        float(place.category != "activity" and place.cuisine == cuisine) for cuisine in cuisines
    ]


def seed_for(run_id: str, seed: int = 0) -> int:
    return int.from_bytes(sha256(f"{run_id}\0{seed}".encode()).digest()[:8], "big")


def parse_prefs(request: ParseRequest) -> ParseResponse:
    # Exact demo phrases only. This deliberately does not implement a real parser.
    fixtures = {
        "vegetarian, under $30, somewhere quiet": (
            Hard(vetoCuisines=[], vetoCategories=[], budgetMaxPerPerson=30, dietary=["vegetarian"]),
            [{"feature": "noise", "direction": -1, "confidence": "high"}],
        ),
        "no sushi, i love trying new places": (
            Hard(vetoCuisines=["asian"], vetoCategories=[], dietary=[]),
            [{"feature": "novelty", "direction": 1, "confidence": "high"}],
        ),
        "broke this month, nothing over $20, outdoors if possible": (
            Hard(vetoCuisines=[], vetoCategories=[], budgetMaxPerPerson=20, dietary=[]),
            [{"feature": "outdoor", "direction": 1, "confidence": "med"}],
        ),
        "romantic vibe, i don't care about price": (
            Hard(vetoCuisines=[], vetoCategories=[], dietary=[]),
            [{"feature": "romance", "direction": 1, "confidence": "high"}],
        ),
    }
    match = fixtures.get(request.text.strip().lower())
    if match is None:
        # No guessed constraints and, especially, no silently discarded budget.
        raise StubInputError("SYNTHETIC STUB supports only the four exact demo phrases in README.md", 409)
    hard, soft = match
    return ParseResponse(hard=hard, soft=soft, posterior=prior(), warnings=[
        FAKE, "Posterior is an unchanged identity prior. Sushi maps to the broad asian fixture veto."
    ])


def next_pair(request: NextRequest, places: list[Place]) -> NextResponse:
    by_id = {p.id: p for p in places}
    ids = sorted(set(request.candidatePlaceIds))
    if any(pid not in by_id for pid in ids + request.focusPlaceIds):
        raise StubInputError("Unknown candidate/focus place ID; use IDs from api/fixtures/places.fake.json")
    seen = {tuple(sorted(pair)) for pair in request.alreadySeen}
    pairs = [pair for pair in combinations(ids, 2)
             if pair not in seen and by_id[pair[0]].category == by_id[pair[1]].category]
    pairs.sort(key=lambda pair: (not any(pid in request.focusPlaceIds for pid in pair), pair))
    if not pairs:
        raise StubInputError("No unseen same-category fixture pair; exhausted response shape is undefined", 409)
    a, b = pairs[0]
    return NextResponse(a=a, b=b, category=by_id[a].category)


def update(request: UpdateRequest, places: list[Place]) -> UpdateResponse:
    known = {p.id: p for p in places}
    if request.winnerPlaceId not in known or request.loserPlaceId not in known:
        raise StubInputError("Unknown winner/loser place ID")
    if known[request.winnerPlaceId].category != known[request.loserPlaceId].category:
        raise StubInputError("Swipe places must share a category")
    # Intentionally no learning. Never pretend the covariance narrowed.
    return UpdateResponse(posterior=request.posterior.model_copy(deep=True))


def minutes(clock: str) -> int:
    hour, minute = map(int, clock.split(":"))
    return hour * 60 + minute


def clock(value: int) -> str:
    return f"{value // 60:02}:{value % 60:02}"


def cumulative_cost(plan: Plan) -> Decimal:
    return sum((Decimal(str(stop.costPerPerson)) for stop in plan.stops), Decimal(0))


def within_budgets(plan: Plan, members) -> bool:
    total = cumulative_cost(plan)
    return all(m.hard.budgetMaxPerPerson is None or total <= Decimal(str(m.hard.budgetMaxPerPerson))
               for m in members)


def first_leg_minutes(origin, place: Place) -> float:
    # Fixture eligibility sanity check only, not route optimization or a live ETA.
    lat1, lat2 = radians(origin.lat), radians(place.lat)
    delta_lat, delta_lng = lat2 - lat1, radians(place.lng - origin.lng)
    a = sin(delta_lat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(delta_lng / 2) ** 2
    km = 6371 * 2 * asin(sqrt(min(1, max(0, a)))) * 1.3
    return km / (4.5 if km <= 1.2 else 18) * 60


def fixture_eligible(plan: Plan, request: PlanRequest, by_id: dict[str, Place]) -> bool:
    if not within_budgets(plan, request.members):
        return False
    weekday = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")[date.fromisoformat(request.date).weekday()]
    for stop in plan.stops:
        place = by_id[stop.placeId]
        if stop.placeId in request.excludePlaceIds:
            return False
        if not any(start <= stop.start and stop.end <= end for start, end in place.hours[weekday]):
            return False
        for member in request.members:
            hard = member.hard
            if place.cuisine in (hard.vetoCuisines or []) or place.category in (hard.vetoCategories or []):
                return False
            if not set(hard.dietary or []).issubset(place.dietary):
                return False
    for member in request.members:
        if member.origin is not None and member.hard.maxTravelMinutes is not None:
            if first_leg_minutes(member.origin, by_id[plan.stops[0].placeId]) > member.hard.maxTravelMinutes:
                return False
    return True


def plan(request: PlanRequest, places: list[Place]) -> PlanResponse:
    if request.options.preview:
        raise StubInputError("preview response shape needs team agreement; use preview=false", 409)
    by_id = {p.id: p for p in places}
    candidates = []
    feasible = []
    for kind, robustness, ratio in (("safe", .93, .82), ("bold", .80, .78), ("budget", .85, .75)):
        ids = [f"stub_{kind}_{category}" for category in ("meal", "activity", "dessert")]
        if not all(pid in by_id for pid in ids):
            continue
        stops = []
        current = minutes(request.window.start)
        for pid in ids:
            place = by_id[pid]
            end = current + place.dwellMinutes
            if end > minutes(request.window.end):
                break
            stops.append(dict(
                placeId=pid, name=place.name, category=place.category, start=clock(current), end=clock(end),
                lat=place.lat, lng=place.lng, costPerPerson=place.costPerPerson,
            ))
            current = end + 15  # Fixed synthetic transition gap.
        if len(stops) != 3:
            continue
        candidate = Plan(
            id=f"stub_{kind}_{seed_for(request.runId):016x}", kind=kind, stops=stops,
            costPerPerson=float(sum((Decimal(str(s["costPerPerson"])) for s in stops), Decimal(0))),
            robustness=robustness,
            perMember=[dict(memberId=m.memberId, ratioMean=ratio, ratioP10=ratio - .1) for m in request.members],
            whyLine=FAKE, gaveUp=[],
        )
        candidates.append(candidate)
        if fixture_eligible(candidate, request, by_id):
            feasible.append(candidate)
    # Preserve Safe fallback when the original Safe fixture was filtered out.
    if feasible and not any(p.kind == "safe" for p in feasible):
        best = max(feasible, key=lambda p: p.robustness)
        best.kind = "safe"
    warnings = [FAKE, "Only three fixed fixture itineraries are checked; scores and elapsedMs are canned."]
    dropped = sum(m.hard._dropped for m in request.members)
    if dropped:
        warnings.append(f"Dropped {dropped} veto entries beyond the per-member cap of two; cuisines take precedence.")
    if not feasible:
        warnings.append("No fixed fixture fits the supplied constraints; no cap was raised. Relaxation hint entries are undefined.")
    return PlanResponse(
        runId=request.runId, plans=feasible,
        pareto=[Pareto(planId=p.id, meanRatio=p.perMember[0].ratioMean,
                       minRatio=p.perMember[0].ratioMean, robustness=p.robustness)
                for p in feasible[:request.options.topK]],
        posteriorSummary=[dict(memberId=m.memberId, features=[
            dict(name=f, mean=m.posterior.mean[i], sd=sqrt(max(0, m.posterior.cov[i][i])))
            for i, f in enumerate(FEATURES)
        ]) for m in request.members],
        stats=dict(candidatePlans=len(candidates), feasiblePlans=len(feasible), samples=0, elapsedMs=0),
        relaxationHints=[], warnings=warnings,
    )


def offers() -> OffersResponse:
    # No synthetic improvement claims; never mutate or raise anyone's budget.
    return OffersResponse(offers=[])


def roulette(request: RouletteRequest) -> RouletteResponse:
    # Scaling preserves squared proportions and prevents all tiny inputs underflowing.
    scale = max(p.robustness for p in request.plans)
    weights = {p.id: (p.robustness / scale) ** 2 for p in request.plans}
    total = sum(weights.values())
    weights = {pid: weight / total for pid, weight in weights.items()}
    eligible = [p.id for p in request.plans if weights[p.id] > 0]
    chosen = random.Random(request.seed).choices(eligible, weights=[weights[pid] for pid in eligible])[0]
    return RouletteResponse(planId=chosen, weights=weights)


def council(request: CouncilRequest) -> CouncilResponse:
    """Canned two-round discussion; no prompts, tools, model calls, or DB delivery."""
    safe = next(p for p in request.plans if p.kind == "safe")
    labels = [f"Advocate {chr(65 + i)}" for i in range(len(request.members))]
    random.Random(seed_for(request.runId, request.options.seed)).shuffle(labels)
    messages = []
    for round_number in (1, 2):
        for index, member in enumerate(request.members):
            messages.append(CouncilMessage(
                runId=request.runId, round=round_number, speaker="advocate", label=labels[index],
                memberId=member.memberId, planId=None,
                stance={p.id: "accept" for p in request.plans},
                text="SYNTHETIC STUB: canned advocate; no preference reasoning was performed.",
                cited=[], ts=FIXTURE_TS + len(messages),
            ))
    rationale = "SYNTHETIC STUB: chair selects the supplied Safe plan; no live council ran."
    messages.append(CouncilMessage(
        runId=request.runId, round=3, speaker="chair", label="Chair", memberId=None,
        planId=safe.id, stance={}, text=rationale, cited=[], ts=FIXTURE_TS + len(messages),
    ))
    return CouncilResponse(
        runId=request.runId, chosenPlanId=safe.id, rationale=rationale, fallbackUsed=False,
        agreesWithSolver=safe.id == max(request.plans, key=lambda p: p.robustness).id,
        messages=messages, elapsedMs=0,
    )
