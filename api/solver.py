"""Real group solver (build-brief C3, C4, C7, C8, C9). Stateless; no DB, no model calls.

Pipeline: hard filter -> time-feasible itineraries -> Monte Carlo over each member's
posterior -> robustness (share of samples where nobody falls below tau of their own
best) -> Safe / Bold / Budget. Offers re-run the same machinery with one member's
limit relaxed. Roulette is a seeded draw weighted by robustness squared.
"""

from dataclasses import dataclass
from hashlib import sha256
from math import ceil, sqrt
import random
import time

import numpy as np

from .catalog import CATEGORIES, DIETARY_CATEGORIES, Catalog, Itinerary, clock
from .models import (
    FEATURES, Member, Offer, OffersRequest, OffersResponse, Pareto, Plan, PlanRequest,
    PlanResponse, RouletteRequest, RouletteResponse,
)

OFFER_MAX = 15            # C8: relax one limit by at most $15 or 15 min
OFFER_MIN_GAIN = 0.05     # robustness or minRatio gain that makes an offer worth sending
COMPROMISE_MIN = 0.05     # smaller shortfalls are not worth explaining
DEFAULT_ASPECTS = (
    "Place aspects (noise, romance, novelty, ...) are still default values until review "
    "data lands; plans are separated by cuisine, cost, hours and distance."
)

# How a compromise reads, by the sign of the member's mean taste weight.
LIKES = {"noise": "a lively room", "crowd": "a busy crowd", "wait": "popular spots",
         "value": "value for money", "romance": "romance", "service": "great service",
         "outdoor": "outdoor time", "novelty": "novelty"}
DISLIKES = {"noise": "quiet", "crowd": "fewer crowds", "wait": "short waits",
            "value": "splurging", "romance": "a casual vibe", "service": "low-key service",
            "outdoor": "staying indoors", "novelty": "familiar places"}


def seed_for(*parts) -> int:
    return int.from_bytes(sha256("\0".join(map(str, parts)).encode()).digest()[:8], "big")


def plan_id(run_id: str, it: Itinerary, cat: Catalog) -> str:
    key = ",".join(cat.places[i].id for i in it.stops)
    return "plan_" + sha256(f"{run_id}|{key}".encode()).hexdigest()[:12]


# ---------------------------------------------------------------- filter ---

def place_mask(cat: Catalog, members: list[Member], exclude: list[str]) -> np.ndarray:
    """C4 place filter: exclusions, everyone's vetoes, everyone's dietary needs."""
    vetoed_cuisines = {c for m in members for c in m.hard.vetoCuisines or []}
    vetoed_categories = {c for m in members for c in m.hard.vetoCategories or []}
    needs = {d for m in members for d in m.hard.dietary or []}
    excluded = set(exclude)
    ok = np.ones(len(cat.places), dtype=bool)
    for i, p in enumerate(cat.places):
        if p.id in excluded or p.category in vetoed_categories or p.cuisine in vetoed_cuisines:
            ok[i] = False
        elif p.category in DIETARY_CATEGORIES and not needs <= set(p.dietary):
            ok[i] = False
    return ok


@dataclass
class Limits:
    """Per-member caps, with an optional single relaxation for offers."""
    budget: list[float | None]
    travel: list[float | None]

    @classmethod
    def of(cls, members: list[Member]):
        return cls([m.hard.budgetMaxPerPerson for m in members],
                   [m.hard.maxTravelMinutes if m.origin is not None else None for m in members])

    def relaxed(self, member: int, kind: str, amount: float):
        budget, travel = list(self.budget), list(self.travel)
        target = budget if kind == "budget" else travel
        target[member] = target[member] + amount
        return Limits(budget, travel)


class World:
    """All time-feasible itineraries for one request, with vectorized feasibility."""

    def __init__(self, cat: Catalog, request: PlanRequest):
        self.cat, self.members = cat, request.members
        self.all = cat.itineraries(request.date, request.window.start, request.window.end)
        self.places_ok = place_mask(cat, request.members, request.excludePlaceIds)
        if self.all:
            self.cost = np.array([cat.cost[list(it.stops)].sum() for it in self.all])
            first = np.array([it.stops[0] for it in self.all])
            self.clean = np.array([self.places_ok[list(it.stops)].all() for it in self.all])
        else:
            self.cost = np.zeros(0)
            first = np.zeros(0, dtype=int)
            self.clean = np.zeros(0, dtype=bool)
        # legs[i, j]: member i's first-leg minutes to itinerary j's first stop.
        self.legs = np.array([
            [cat.first_leg_minutes(m.origin, p) for p in first] if m.origin is not None
            else np.zeros(len(first)) for m in request.members
        ]).reshape(len(request.members), len(first))

    def feasible(self, limits: Limits) -> np.ndarray:
        ok = self.clean.copy()
        for i, (cap, travel) in enumerate(zip(limits.budget, limits.travel)):
            if cap is not None:
                ok &= self.cost <= cap + 1e-9
            if travel is not None:
                ok &= self.legs[i] <= travel + 1e-9
        return np.flatnonzero(ok)


# ------------------------------------------------------------ evaluation ---

def sample_thetas(members: list[Member], samples: int, rng) -> np.ndarray:
    """theta[s, i] ~ N(m_i, Sigma_i). eigh tolerates singular (PSD) covariances."""
    out = np.empty((samples, len(members), len(FEATURES)))
    for i, m in enumerate(members):
        w, q = np.linalg.eigh(np.array(m.posterior.cov))
        root = q * np.sqrt(np.clip(w, 0, None))
        out[:, i] = np.array(m.posterior.mean) + rng.standard_normal((samples, len(FEATURES))) @ root.T
    return out


def plan_values(cat: Catalog, plans: list[Itinerary], theta: np.ndarray) -> np.ndarray:
    """V[..., j] (C3): mean over stops of range-normalized place utility.

    theta has shape (..., K). Normalization is per member and category over the
    places that appear in some candidate plan (the member's feasible places).
    """
    U = theta @ cat.X.T                                  # (..., places)
    used = sorted({i for it in plans for i in it.stops})
    v = np.zeros_like(U)
    for c in CATEGORIES:
        idx = [i for i in used if cat.category[i] == c]
        if not idx:
            continue
        lo = U[..., idx].min(-1, keepdims=True)
        span = U[..., idx].max(-1, keepdims=True) - lo
        v[..., idx] = np.where(span > 1e-12, (U[..., idx] - lo) / np.where(span > 1e-12, span, 1), 1.0)
    V = np.zeros(theta.shape[:-1] + (len(plans),))
    for length in {len(it.stops) for it in plans}:
        cols = [j for j, it in enumerate(plans) if len(it.stops) == length]
        stops = np.array([plans[j].stops for j in cols])
        V[..., cols] = sum(v[..., stops[:, k]] for k in range(length)) / length
    return V


def ratios(V: np.ndarray) -> np.ndarray:
    best = V.max(-1, keepdims=True)
    return np.clip(np.where(best > 1e-12, V / np.where(best > 1e-12, best, 1), 1.0), 0, 1)


@dataclass
class Scores:
    plans: list[Itinerary]
    robustness: np.ndarray   # (P,)
    nash: np.ndarray         # (P,) mean product of V over members
    ratio_mean: np.ndarray   # (n, P) over samples
    ratio_p10: np.ndarray    # (n, P)
    post_V: np.ndarray       # (n, P) at the posterior mean
    post_ratio: np.ndarray   # (n, P) at the posterior mean


def evaluate(cat: Catalog, members: list[Member], plans: list[Itinerary], samples: int,
             tau: float, seed: int) -> Scores:
    theta = sample_thetas(members, samples, np.random.default_rng(seed))
    V = plan_values(cat, plans, theta)                   # (S, n, P)
    r = ratios(V)
    mean_theta = np.array([m.posterior.mean for m in members])
    post_V = plan_values(cat, plans, mean_theta)         # (n, P)
    return Scores(
        plans=plans,
        robustness=(r.min(1) >= tau - 1e-12).mean(0),
        nash=V.prod(1).mean(0),
        ratio_mean=r.mean(0), ratio_p10=np.percentile(r, 10, axis=0),
        post_V=post_V, post_ratio=ratios(post_V),
    )


def ranking(cat: Catalog, scores: Scores) -> list[int]:
    """Robustness, then Nash welfare (C7), then mean rating, then a stable key."""
    rating = [np.mean([cat.places[i].rating for i in it.stops]) for it in scores.plans]
    keys = [",".join(cat.places[i].id for i in it.stops) for it in scores.plans]
    return sorted(range(len(scores.plans)), key=lambda j: (
        -round(float(scores.robustness[j]), 9), -round(float(scores.nash[j]), 9), -rating[j], keys[j]))


def named_plans(cat: Catalog, scores: Scores) -> list[tuple[str, int]]:
    """Safe = most robust. Bold = most novel, Budget = cheapest, both above the floor.

    Each pick must use a different place set; ties go to the plan sharing the
    fewest places with plans already picked, then to robustness order.
    """
    order = ranking(cat, scores)
    if not order:
        return []
    safe = order[0]
    top = float(scores.robustness[safe])
    # C7 floor is max(0.5, safe - 0.25). When Safe itself is below 0.5 (wide priors,
    # few swipes) that floor is unreachable and the vote would have one option, so
    # the floor becomes relative: safe - 0.25.
    floor = max(0.5, top - 0.25) if top >= 0.5 else max(0.0, top - 0.25)
    eligible = [j for j in order if scores.robustness[j] >= floor - 1e-12]
    chosen = [("safe", safe)]
    position = {j: k for k, j in enumerate(order)}

    def novelty(j):
        return float(np.mean(cat.X[list(scores.plans[j].stops), 7]))

    def cost(j):
        return float(cat.cost[list(scores.plans[j].stops)].sum())

    for kind, score in (("bold", novelty), ("budget", lambda j: -cost(j))):
        taken = [set(scores.plans[j].stops) for _, j in chosen]
        options = [j for j in eligible if set(scores.plans[j].stops) not in taken]
        if options:
            best = max(options, key=lambda j: (
                round(score(j), 9), -sum(len(set(scores.plans[j].stops) & t) for t in taken), -position[j]))
            chosen.append((kind, best))
    return chosen


# ---------------------------------------------------------- explanations ---

def compromises(cat: Catalog, members: list[Member], scores: Scores, j: int) -> list[tuple[float, int, int]]:
    """C7: per member, the feature where plan j falls furthest below their best plan."""
    xbar = lambda k: cat.X[list(scores.plans[k].stops)].mean(0)
    here = xbar(j)
    found = []
    for i, m in enumerate(members):
        best = int(np.argmax(scores.post_V[i]))
        if best == j:
            continue
        weights = np.array(m.posterior.mean)
        shortfall = weights * (xbar(best) - here)
        k = int(np.argmax(shortfall))
        if shortfall[k] > COMPROMISE_MIN:
            found.append((float(shortfall[k]), i, k))
    return sorted(found, reverse=True)


def compromise_text(weight: float, feature: str) -> str:
    if feature.startswith("cuisine_"):
        name = feature.removeprefix("cuisine_").replace("cafe_dessert", "cafe and dessert")
        return f"{name} food" if weight > 0 else f"skipping {name} food"
    return LIKES[feature] if weight > 0 else DISLIKES[feature]


def build_plan(cat: Catalog, request: PlanRequest, scores: Scores, kind: str, j: int,
               explain: bool) -> Plan:
    it = scores.plans[j]
    stops = []
    for i, start in zip(it.stops, it.starts):
        p = cat.places[i]
        stops.append(dict(placeId=p.id, name=p.name, category=p.category, start=clock(start),
                          end=clock(start + p.dwellMinutes), lat=p.lat, lng=p.lng,
                          costPerPerson=p.costPerPerson))
    gave_up, why = [], ""
    if explain:
        found = compromises(cat, request.members, scores, j)
        for _, i, k in found:
            m = request.members[i]
            gave_up.append(dict(memberId=m.memberId, feature=FEATURES[k],
                                text=compromise_text(m.posterior.mean[k], FEATURES[k])))
        why = "; ".join(f"{request.members[i].name} gave up {g['text']}"
                        for g, (_, i, _) in zip(gave_up[:2], found[:2]))
        why = f"{why}." if why else "Close to everyone's favorite plan."
    return Plan(
        id=plan_id(request.runId, it, cat), kind=kind, stops=stops,
        costPerPerson=float(sum(s["costPerPerson"] for s in stops)),
        robustness=round(float(scores.robustness[j]), 4),
        perMember=[dict(memberId=m.memberId, ratioMean=round(float(scores.ratio_mean[i, j]), 4),
                        ratioP10=round(float(scores.ratio_p10[i, j]), 4))
                   for i, m in enumerate(request.members)],
        whyLine=why, gaveUp=gave_up,
    )


# ------------------------------------------------------------------ plan ---

def common_warnings(cat: Catalog, request: PlanRequest) -> list[str]:
    warnings = []
    if cat.default_aspects:
        warnings.append(DEFAULT_ASPECTS)
    dropped = sum(m.hard._dropped for m in request.members)
    if dropped:
        warnings.append(f"Dropped {dropped} veto entries beyond the per-member cap of two; cuisines take precedence.")
    return warnings


def solve(cat: Catalog, request: PlanRequest):
    """Shared by /plan and /offers: the world, feasible plans, scores and picks."""
    world = World(cat, request)
    limits = Limits.of(request.members)
    feasible = [world.all[j] for j in world.feasible(limits)]
    if not feasible:
        return world, limits, None, []
    o = request.options
    scores = evaluate(cat, request.members, feasible, o.samples, o.tau, seed_for(request.runId))
    return world, limits, scores, named_plans(cat, scores)


def plan(cat: Catalog, request: PlanRequest) -> PlanResponse:
    started = time.perf_counter()
    world, _, scores, picks = solve(cat, request)
    warnings = common_warnings(cat, request)
    o = request.options
    plans, pareto = [], []
    if scores is None:
        warnings.append("No plan fits everyone's limits on this date and window; no limit was relaxed.")
    else:
        if o.preview:
            picks = picks[:1]  # contract: at most one Safe plan, no explanations
        plans = [build_plan(cat, request, scores, kind, j, explain=not o.preview) for kind, j in picks]
        if not o.preview:
            ids = {j: p.id for (_, j), p in zip(picks, plans)}
            for j in ranking(cat, scores)[:o.topK]:
                pareto.append(Pareto(
                    planId=ids.get(j) or plan_id(request.runId, scores.plans[j], cat),
                    meanRatio=round(float(scores.post_ratio[:, j].mean()), 4),
                    minRatio=round(float(scores.post_ratio[:, j].min()), 4),
                    robustness=round(float(scores.robustness[j]), 4)))
    return PlanResponse(
        runId=request.runId, plans=plans, pareto=pareto,
        posteriorSummary=[dict(memberId=m.memberId, features=[
            dict(name=f, mean=m.posterior.mean[i], sd=sqrt(max(0.0, m.posterior.cov[i][i])))
            for i, f in enumerate(FEATURES)]) for m in request.members],
        stats=dict(candidatePlans=len(world.all), feasiblePlans=0 if scores is None else len(scores.plans),
                   samples=0 if scores is None else o.samples,
                   elapsedMs=round((time.perf_counter() - started) * 1000)),
        relaxationHints=[], warnings=warnings,
    )


# ---------------------------------------------------------------- offers ---

def offers(cat: Catalog, request: OffersRequest) -> OffersResponse:
    """C8: smallest single-member relaxation that unlocks a clearly better plan.

    The baseline is the Safe plan this request solves to (same runId, same seed),
    so the caller's baselinePlanId is not needed to look anything up. Baseline and
    candidates are compared inside the same relaxed world.
    """
    world, limits, scores, picks = solve(cat, request)
    if scores is None or not picks:
        return OffersResponse(offers=[])
    baseline = scores.plans[picks[0][1]]
    original = set(scores.plans)
    o = request.options
    found = []  # (robustness gain, member, kind, amount, min gain, scores, plan index)
    for i, m in enumerate(request.members):
        per_member = []
        for kind, cap in (("budget", limits.budget[i]), ("travel", limits.travel[i])):
            if cap is None:
                continue
            relaxed = [world.all[j] for j in world.feasible(limits.relaxed(i, kind, OFFER_MAX))]
            if all(it in original for it in relaxed):
                continue
            ev = evaluate(cat, request.members, relaxed, o.samples, o.tau, seed_for(request.runId, i, kind))
            b = relaxed.index(baseline)
            qualifying = []
            for j, it in enumerate(relaxed):
                if it in original:
                    continue
                if kind == "budget":
                    need = float(cat.cost[list(it.stops)].sum()) - cap
                else:
                    need = cat.first_leg_minutes(m.origin, it.stops[0]) - cap
                amount = ceil(need - 1e-9)
                rob_gain = float(ev.robustness[j] - ev.robustness[b])
                min_gain = float(ev.post_ratio[:, j].min() - ev.post_ratio[:, b].min())
                if 0 < amount <= OFFER_MAX and max(rob_gain, min_gain) >= OFFER_MIN_GAIN:
                    qualifying.append((amount, -rob_gain, -min_gain, j))
            if qualifying:
                # Smallest concession first; among equal amounts, the biggest gain.
                amount, neg_rob, neg_min, j = min(qualifying)
                per_member.append((-neg_rob, i, kind, amount, -neg_min, ev, j))
        if per_member:
            found.append(max(per_member, key=lambda f: f[0]))
    found.sort(key=lambda f: -f[0])
    result = []
    for rob_gain, i, kind, amount, min_gain, ev, j in found[:3]:
        plan_ = build_plan(cat, request, ev, "safe", j, explain=False)
        # The offer row is private to its recipient: no other member's numbers.
        plan_ = plan_.model_copy(update=dict(perMember=[], whyLine="", gaveUp=[]))
        member = request.members[i]
        result.append(Offer(
            offerId="o_" + sha256(f"{request.runId}|{member.memberId}|{kind}|{plan_.id}".encode()).hexdigest()[:12],
            toMemberId=member.memberId, type=kind, amount=amount, unit="usd" if kind == "budget" else "min",
            plan=plan_, robustnessGain=round(rob_gain, 4), minRatioGain=round(min_gain, 4)))
    return OffersResponse(offers=result)


def roulette(request: RouletteRequest) -> RouletteResponse:
    """C9: weights proportional to robustness squared, seeded draw."""
    # Scaling preserves squared proportions and prevents all tiny inputs underflowing.
    scale = max(p.robustness for p in request.plans)
    weights = {p.id: (p.robustness / scale) ** 2 for p in request.plans}
    total = sum(weights.values())
    weights = {pid: weight / total for pid, weight in weights.items()}
    eligible = [p.id for p in request.plans if weights[p.id] > 0]
    chosen = random.Random(request.seed).choices(eligible, weights=[weights[pid] for pid in eligible])[0]
    return RouletteResponse(planId=chosen, weights=weights)
