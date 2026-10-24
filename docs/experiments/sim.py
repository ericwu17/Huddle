"""Huddle experiment harness (Part B, build-brief B5).

SIMULATED: every group, taste vector, constraint, and swipe here is synthetic.
Ground truth is the synthetic taste vector we generate, not a real person.
Only the place features (data/places.json) are real data.

Experiment A: compare group-choice rules on ~1,000 synthetic groups.
  Baselines (random, plurality, utilitarian, maximin, Nash) see the TRUE
  synthetic tastes (oracle). "ours" calls the api POST /plan when
  --with-api is passed and the service reports non-stub health; otherwise it
  is skipped (never faked).
Experiment B: random vs uncertainty-based swipe selection. Needs the api's
  /elicit/next and /elicit/update; also requires --with-api.

Utility, normalization, ratios, hard filter, and plan enumeration follow
build-brief C3/C4 (templates [meal, activity, dessert] and [activity, meal],
15-minute grid inside Saturday 17:00-23:00, haversine x1.3 travel).

Run: python docs/experiments/sim.py            (all defaults, seed 7)
     python docs/experiments/sim.py --help
"""

import argparse
import csv
from datetime import datetime
import hashlib
from importlib.metadata import PackageNotFoundError, version
import itertools
import json
import math
import os
import platform
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]

# Contract S5.1 feature order (K = 13).
ASPECTS = ["noise", "crowd", "wait", "value", "romance", "service", "outdoor", "novelty"]
CUISINES = ["asian", "latin", "mediterranean", "american", "cafe_dessert"]
FEATURES = ASPECTS + ["cuisine_" + c for c in CUISINES]
K = len(FEATURES)
DEFAULT_DWELL = {"meal": 75, "activity": 75, "dessert": 30}
TEMPLATES = [("meal", "activity", "dessert"), ("activity", "meal")]
WINDOW = (17 * 60, 23 * 60)  # Saturday 17:00-23:00
GRID = 15
DAY = "sat"
PLAN_DATE = "2026-10-24"  # a Saturday
VETO_CAP = 2
# DEVIATION from C4 as written: the dietary check applies to food places only. Activities in
# places.json carry no dietary tags, so the literal rule would drop every activity (and so
# every plan) for any group with a vegetarian. Flagged to C.
DIETARY_CATEGORIES = ("meal", "dessert")

# Synthetic-group generator settings (all SIMULATED).
P_VETO_CUISINE = 0.25      # chance of a first cuisine veto
P_VETO_CUISINE_2 = 0.10    # chance of a second cuisine veto
P_VETO_DESSERT = 0.05      # chance of vetoing the dessert category (meal/activity vetoes would kill every template)
P_BUDGET = 0.30
BUDGETS = [12, 15, 20, 25]
P_VEGETARIAN = 0.15
P_TRAVEL_CAP = 0.25
TRAVEL_CAPS = [10, 15, 20, 30]
ORIGIN_RADIUS_KM = 1.5
OURS_POSTERIOR_SD = 0.3    # "ours" gets the true taste as posterior mean with this sd (baselines get it exactly)

METHODS = ["random", "plurality", "utilitarian", "maximin", "nash", "ours"]


# ---------------------------------------------------------------- places ---

def hhmm(s):
    h, m = s.split(":")
    t = int(h) * 60 + int(m)
    return 24 * 60 if t == 23 * 60 + 59 else t  # treat 23:59 as midnight


def load_places(path):
    places = json.loads(Path(path).read_text(encoding="utf-8"))
    X = np.zeros((len(places), K))
    for i, p in enumerate(places):
        for k, a in enumerate(ASPECTS):
            X[i, k] = p["aspects"][a]["mean"]
        if p.get("cuisine") in CUISINES:
            X[i, len(ASPECTS) + CUISINES.index(p["cuisine"])] = 1.0
    return places, X


def open_matrix(places):
    """ok[p, g] = place p is open for its whole dwell when starting at grid slot g."""
    starts = np.arange(WINDOW[0], WINDOW[1] + 1, GRID)
    ok = np.zeros((len(places), len(starts)), dtype=bool)
    for i, p in enumerate(places):
        dwell = p.get("dwellMinutes") or DEFAULT_DWELL[p["category"]]
        for s, e in (p.get("hours") or {}).get(DAY, []):
            s, e = hhmm(s), hhmm(e)
            if e <= s:
                e += 24 * 60  # past midnight
            ok[i] |= (starts >= s) & (starts + dwell <= e)
    return starts, ok


def haversine_km(lat1, lng1, lat2, lng2):
    r = 6371.0
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dp, dl = p2 - p1, np.radians(lng2) - np.radians(lng1)
    a = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * r * np.arcsin(np.sqrt(a))


def travel_minutes(km):
    """Tier 1: straight line x1.3; walk 4.5 km/h up to 1.2 km, else 18 km/h."""
    km = np.asarray(km) * 1.3
    speed = np.where(km <= 1.2, 4.5, 18.0)
    return km / speed * 60.0


def enumerate_plans(places, starts, ok):
    """All time-feasible place sequences (group-independent). Keeps the earliest start."""
    lat = np.array([p["lat"] for p in places])
    lng = np.array([p["lng"] for p in places])
    leg = travel_minutes(haversine_km(lat[:, None], lng[:, None], lat[None, :], lng[None, :]))
    dwell = [p.get("dwellMinutes") or DEFAULT_DWELL[p["category"]] for p in places]
    by_cat = {c: [i for i, p in enumerate(places) if p["category"] == c] for c in DEFAULT_DWELL}
    plans = {}
    for tpl in TEMPLATES:
        rows, times = [], []
        for combo in itertools.product(*(by_cat[c] for c in tpl)):
            for g0 in range(len(starts)):
                g, sched, good = g0, [], True
                for k, p in enumerate(combo):
                    if g >= len(starts) or not ok[p, g]:
                        good = False
                        break
                    end = starts[g] + dwell[p]
                    sched.append(int(starts[g]))
                    if k + 1 < len(combo):
                        arrive = end + leg[p, combo[k + 1]]
                        g = int(math.ceil((arrive - WINDOW[0]) / GRID))
                    elif end > WINDOW[1]:
                        good = False
                if good:
                    rows.append(combo)
                    times.append(sched)
                    break
        plans[tpl] = (np.array(rows, dtype=int).reshape(-1, len(tpl)), times)
    return plans, lat, lng


# ---------------------------------------------------------------- groups ---

def make_group(rng, places, center):
    """SIMULATED group: taste = shared component + per-person noise; random hard constraints."""
    n = int(rng.integers(3, 6))
    rho = rng.uniform(0.2, 0.8)  # how much of each taste is shared
    shared = rng.standard_normal(K)
    theta = np.sqrt(rho) * shared + np.sqrt(1 - rho) * rng.standard_normal((n, K))
    hard, origins, dropped = [], [], 0
    for _ in range(n):
        vetoes = []
        if rng.random() < P_VETO_CUISINE:
            vetoes.append(("c", CUISINES[rng.integers(len(CUISINES))]))
            if rng.random() < P_VETO_CUISINE_2:
                vetoes.append(("c", CUISINES[rng.integers(len(CUISINES))]))
        if rng.random() < P_VETO_DESSERT:
            vetoes.append(("k", "dessert"))
        dropped += max(0, len(vetoes) - VETO_CAP)
        vetoes = vetoes[:VETO_CAP]  # contract veto cap: extras are dropped
        hard.append({
            "vetoCuisines": sorted({v for t, v in vetoes if t == "c"}),
            "vetoCategories": sorted({v for t, v in vetoes if t == "k"}),
            "budgetMaxPerPerson": int(rng.choice(BUDGETS)) if rng.random() < P_BUDGET else None,
            "dietary": ["vegetarian"] if rng.random() < P_VEGETARIAN else [],
            "maxTravelMinutes": int(rng.choice(TRAVEL_CAPS)) if rng.random() < P_TRAVEL_CAP else None,
        })
        ang, rad = rng.uniform(0, 2 * np.pi), ORIGIN_RADIUS_KM * np.sqrt(rng.random())
        origins.append((center[0] + rad / 111.0 * np.sin(ang),
                        center[1] + rad / (111.0 * np.cos(np.radians(center[0]))) * np.cos(ang)))
    return {"theta": theta, "rho": rho, "hard": hard, "origins": origins, "vetoesDropped": dropped}


def place_filter(places, hard):
    """C4 hard filter (group level)."""
    vc = {c for h in hard for c in h["vetoCuisines"]}
    vk = {c for h in hard for c in h["vetoCategories"]}
    needs = {d for h in hard for d in h["dietary"]}
    budget = min([h["budgetMaxPerPerson"] for h in hard if h["budgetMaxPerPerson"] is not None], default=None)
    mask = np.ones(len(places), dtype=bool)
    for i, p in enumerate(places):
        if p.get("cuisine") in vc or p["category"] in vk:
            mask[i] = False
        elif needs and p["category"] in DIETARY_CATEGORIES and not needs <= set(p.get("dietary") or []):
            mask[i] = False
        elif budget is not None and (p.get("costPerPerson") or 0) > budget:
            mask[i] = False
    return mask


def feasible_plans(group, plans, mask, lat, lng, costs):
    """Per template: (stop index array, plan index into the global list) passing the group's filter."""
    out = {}
    caps = [h["budgetMaxPerPerson"] for h in group["hard"]
            if h["budgetMaxPerPerson"] is not None]
    for tpl, (S, _) in plans.items():
        keep = mask[S].all(axis=1) if len(S) else np.zeros(0, dtype=bool)
        if caps:
            # An outing's cap covers every stop, not each place separately.
            keep &= costs[S].sum(axis=1) <= min(caps) + 1e-9
        for h, (olat, olng) in zip(group["hard"], group["origins"]):
            if h["maxTravelMinutes"] is not None:
                first = travel_minutes(haversine_km(olat, olng, lat[S[:, 0]], lng[S[:, 0]]))
                keep &= first <= h["maxTravelMinutes"]
        out[tpl] = np.flatnonzero(keep)
    return out


def normalized_place_values(theta, X, places, mask):
    """C3: v_i(p) = (u - min) / (max - min) per member and category over feasible places.
    If a member's utility is flat across a category (max == min), every place gets 1.0."""
    U = theta @ X.T
    v = np.full_like(U, np.nan)
    cats = np.array([p["category"] for p in places])
    for c in DEFAULT_DWELL:
        idx = np.flatnonzero((cats == c) & mask)
        if not len(idx):
            continue
        lo, hi = U[:, idx].min(1, keepdims=True), U[:, idx].max(1, keepdims=True)
        rng_ = hi - lo
        v[:, idx] = np.where(rng_ > 1e-12, (U[:, idx] - lo) / np.where(rng_ > 1e-12, rng_, 1), 1.0)
    return v


# --------------------------------------------------------------- methods ---

def pick_tied(rng, scores, tol=1e-9):
    best = np.max(scores)
    return int(rng.choice(np.flatnonzero(scores >= best - tol)))


def choose_baselines(rng, R):
    """R: (members, plans) ratio matrix under TRUE tastes. Returns {method: plan column}."""
    picks = {"random": int(rng.integers(R.shape[1]))}
    votes = np.zeros(R.shape[1])
    for i in range(R.shape[0]):
        votes[pick_tied(rng, R[i])] += 1  # each member votes for one of their favorite plans
    picks["plurality"] = pick_tied(rng, votes)
    picks["utilitarian"] = pick_tied(rng, R.sum(0))
    mins = R.min(0)
    top = np.flatnonzero(mins >= mins.max() - 1e-9)
    picks["maximin"] = int(top[pick_tied(rng, R[:, top].sum(0))])  # tie-break by sum
    with np.errstate(divide="ignore"):
        picks["nash"] = pick_tied(rng, np.log(R).sum(0))
    return picks


def load_env():
    """Read FASTAPI_BASE_URL / HUDDLE_SHARED_SECRET from the environment, else the gitignored .env."""
    env = {}
    path = REPO / ".env"
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    get = lambda k: os.environ.get(k) or env.get(k) or None
    return get("FASTAPI_BASE_URL"), get("HUDDLE_SHARED_SECRET")


class Api:
    def __init__(self, base, secret, timeout=15):
        self.base, self.secret, self.timeout = base.rstrip("/"), secret or "", timeout

    def request(self, path, body=None):
        req = urllib.request.Request(self.base + path,
                                     data=json.dumps(body).encode() if body is not None else None,
                                     headers={"Content-Type": "application/json",
                                              "X-Huddle-Secret": self.secret},
                                     method="POST" if body is not None else "GET")
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            if r.headers.get("X-Huddle-Stub", "").lower() == "true":
                raise ValueError("synthetic API response")
            return json.loads(r.read())

    def post(self, path, body):
        return self.request(path, body)


def real_api(base, secret, place_count):
    """Fail closed: a configured URL alone never authorizes scoring stub output."""
    if not base or not secret:
        return None, "API evaluation skipped: configure FASTAPI_BASE_URL and HUDDLE_SHARED_SECRET privately."
    api = Api(base, secret)
    try:
        health = api.request("/health")
        if not isinstance(health, dict) or health.get("ok") is not True or health.get("stub") is not False:
            return None, "API evaluation skipped: /health must explicitly report ok=true and stub=false."
        if health.get("placesLoaded") != place_count:
            return None, "API evaluation skipped: service/catalog place counts differ."
    except (urllib.error.URLError, TimeoutError, ValueError, OSError) as err:
        return None, f"API evaluation skipped: health check failed ({type(err).__name__})."
    return api, None


def ours_request(g, group):
    cov = (np.eye(K) * OURS_POSTERIOR_SD ** 2).tolist()
    members = [{"memberId": f"m{i + 1}", "name": f"Member {i + 1}",
                "posterior": {"mean": group["theta"][i].tolist(), "cov": cov},
                "hard": group["hard"][i],
                "origin": {"lat": float(o[0]), "lng": float(o[1])}}
               for i, o in enumerate(group["origins"])]
    return {"runId": f"sim_a_{g}", "date": PLAN_DATE,
            "window": {"start": "17:00", "end": "23:00"}, "members": members,
            "excludePlaceIds": [],
            "options": {"samples": 300, "tau": 0.6, "topK": 60, "preview": False}}


def finite_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def clock_minutes(value):
    if not isinstance(value, str) or not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", value):
        raise ValueError("invalid HH:MM time")
    h, minute = map(int, value.split(":"))
    return h * 60 + minute


def validate_plan(plan, places, group, request):
    """Independently validate catalog facts and full-outing feasibility before scoring.

    Does not import the solver or trust its claimed utility/cost/feasibility.
    Raises ValueError with a non-sensitive reason; returns catalog indices.
    """
    if not isinstance(plan, dict) or not isinstance(plan.get("id"), str) or not plan["id"]:
        raise ValueError("missing plan id")
    if plan.get("kind") not in ("safe", "bold", "budget"):
        raise ValueError("invalid plan kind")
    if not finite_number(plan.get("robustness")) or not 0 <= plan["robustness"] <= 1:
        raise ValueError("invalid robustness")
    stops = plan.get("stops")
    if not isinstance(stops, list) or not stops or not all(isinstance(s, dict) for s in stops):
        raise ValueError("invalid stops")
    ids = {p["id"]: i for i, p in enumerate(places)}
    stop_ids = [s.get("placeId") for s in stops]
    if any(not isinstance(pid, str) or pid not in ids for pid in stop_ids):
        raise ValueError("unknown placeId")
    if len(set(stop_ids)) != len(stop_ids):
        raise ValueError("repeated placeId")
    indices = [ids[pid] for pid in stop_ids]
    if tuple(places[i]["category"] for i in indices) not in TEMPLATES:
        raise ValueError("invalid plan template")
    if set(stop_ids) & set(request.get("excludePlaceIds", [])):
        raise ValueError("excluded placeId")
    mask = place_filter(places, group["hard"])
    if not mask[indices].all():
        raise ValueError("place violates group hard constraints")
    total = 0.0
    previous = None
    window_start = clock_minutes(request["window"]["start"])
    window_end = clock_minutes(request["window"]["end"])
    for stop, i in zip(stops, indices):
        p = places[i]
        if stop.get("category") != p["category"]:
            raise ValueError("stop category differs from catalog")
        for field in ("lat", "lng", "costPerPerson"):
            value = stop.get(field)
            if not finite_number(value) or not math.isclose(value, p[field], rel_tol=0, abs_tol=1e-7):
                raise ValueError(f"stop {field} differs from catalog")
        if stop["costPerPerson"] < 0:
            raise ValueError("negative stop cost")
        total += p.get("costPerPerson") or 0
        start, end = clock_minutes(stop.get("start")), clock_minutes(stop.get("end"))
        dwell = p.get("dwellMinutes") or DEFAULT_DWELL[p["category"]]
        if start % GRID or end - start != dwell or not window_start <= start < end <= window_end:
            raise ValueError("stop violates grid, dwell or outing window")
        intervals = (p.get("hours") or {}).get(DAY, [])
        def covers(interval):
            opening, closing = map(hhmm, interval)
            if closing <= opening:
                closing += 24 * 60
            return opening <= start and end <= closing
        if not any(covers(interval) for interval in intervals):
            raise ValueError("place closed during stop")
        if previous is not None:
            last, last_end = previous
            leg = float(travel_minutes(haversine_km(last["lat"], last["lng"], p["lat"], p["lng"])))
            if start + 1e-9 < last_end + leg:
                raise ValueError("insufficient travel time between stops")
        previous = p, end
    if not finite_number(plan.get("costPerPerson")) or not math.isclose(plan["costPerPerson"], total, rel_tol=0, abs_tol=1e-7):
        raise ValueError("plan total differs from sum of catalog stop costs")
    first = places[indices[0]]
    for hard, origin in zip(group["hard"], group["origins"]):
        cap = hard["budgetMaxPerPerson"]
        if cap is not None and total > cap + 1e-9:
            raise ValueError("outing exceeds a member cumulative budget")
        travel_cap = hard["maxTravelMinutes"]
        if travel_cap is not None and origin is not None:
            leg = float(travel_minutes(haversine_km(*origin, first["lat"], first["lng"])))
            if leg > travel_cap + 1e-9:
                raise ValueError("first leg exceeds a member travel cap")
    return indices


def ours_ratios(resp, places, v, Vmax, group, request):
    """Validate ALL returned plans, then evaluate Safe under TRUE synthetic tastes."""
    if not isinstance(resp, dict) or resp.get("runId") != request["runId"]:
        return None, "invalid response runId"
    plans = resp.get("plans")
    if not isinstance(plans, list):
        return None, "invalid plans array"
    if not plans:
        return None, "no plans returned"
    try:
        validated = [validate_plan(p, places, group, request) for p in plans]
        if len({p["id"] for p in plans}) != len(plans) or len({p["kind"] for p in plans}) != len(plans):
            raise ValueError("duplicate plan id or kind")
        safe = next((i for i, p in enumerate(plans) if p["kind"] == "safe"), None)
        if safe is None:
            raise ValueError("missing Safe plan")
        vals = v[:, validated[safe]]
        ratios = vals.mean(1) / Vmax
        if not np.isfinite(ratios).all() or np.any(ratios < -1e-9) or np.any(ratios > 1 + 1e-9):
            raise ValueError("ratios outside shared feasible universe")
    except (ValueError, KeyError, TypeError) as err:
        return None, str(err) if isinstance(err, ValueError) else "malformed plan"
    return ratios, None


# --------------------------------------------------------------- metrics ---

def gini(r):
    m = r.mean()
    if m <= 0:
        return 0.0
    return float(np.abs(r[:, None] - r[None, :]).sum() / (2 * len(r) ** 2 * m))


def bootstrap_ci(x, rng, B=2000):
    x = np.asarray(x, dtype=float)
    means = x[rng.integers(0, len(x), (B, len(x)))].mean(1)
    return float(x.mean()), float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5))


def proportion_ci(x):
    """Wilson 95% interval: zero observed failures does not imply zero risk."""
    n = len(x)
    p = float(np.mean(x))
    z = 1.959963984540054
    denominator = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denominator
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denominator
    return p, 0.0 if p == 0 else max(0.0, center - half), 1.0 if p == 1 else min(1.0, center + half)


def run_experiment_a(args, places, X, api, rng):
    starts, ok = open_matrix(places)
    t0 = time.time()
    plans, lat, lng = enumerate_plans(places, starts, ok)
    n_plans = {"-".join(t): len(S) for t, (S, _) in plans.items()}
    print(f"[A] time-feasible plans (group-independent): {n_plans} in {time.time() - t0:.1f}s")
    center = (float(lat.mean()), float(lng.mean()))
    costs = np.array([p.get("costPerPerson") or 0 for p in places])

    rows, notes = [], []
    resampled = dropped = 0
    ours_errors = {}
    n_ours = args.ours_groups if args.ours_groups is not None else args.groups
    if api is None:
        notes.append("ours SKIPPED: real API evaluation is disabled or its health check did not pass. No ours numbers were produced.")
    t0 = time.time()
    for g in range(args.groups):
        while True:
            group = make_group(rng, places, center)
            mask = place_filter(places, group["hard"])
            feas = feasible_plans(group, plans, mask, lat, lng, costs)
            if sum(len(f) for f in feas.values()):
                break
            resampled += 1  # no feasible plan: draw a new group
            if resampled > max(1000, args.groups * 100):
                raise ValueError("Too many infeasible groups; inspect the catalog/constraints instead of redrawing forever")
        dropped += group["vetoesDropped"]
        v = normalized_place_values(group["theta"], X, places, mask)
        V = np.concatenate([v[:, plans[t][0][feas[t]]].mean(2) for t in TEMPLATES], axis=1)
        Vmax = V.max(1)
        Vmax = np.where(Vmax > 0, Vmax, 1.0)
        R = V / Vmax[:, None]
        totals = np.concatenate([costs[plans[t][0][feas[t]]].sum(1) for t in TEMPLATES])
        caps = [h["budgetMaxPerPerson"] for h in group["hard"] if h["budgetMaxPerPerson"] is not None]
        cap = min(caps) if caps else None
        if cap is not None and np.any(totals > cap + 1e-9):
            raise AssertionError("Cumulative budget violation in baseline feasible universe")
        chosen = choose_baselines(rng, R)
        picks = {m: R[:, j] for m, j in chosen.items()}
        picked_costs = {m: float(totals[j]) for m, j in chosen.items()}
        sequences = [sequence for t in TEMPLATES for sequence in plans[t][0][feas[t]]]
        picked_stops = {m: [places[int(i)]["id"] for i in sequences[j]] for m, j in chosen.items()}
        if api is not None and g < n_ours:
            try:
                request = ours_request(g, group)
                response = api.post("/plan", request)
                r, err = ours_ratios(response, places, v, Vmax, group, request)
            except (urllib.error.URLError, TimeoutError, ValueError, OSError) as e:
                r, err = None, f"request failed: {type(e).__name__}"
            if r is not None:
                picks["ours"] = r
                safe = next(p for p in response["plans"] if p["kind"] == "safe")
                picked_costs["ours"] = safe["costPerPerson"]
                picked_stops["ours"] = [s["placeId"] for s in safe["stops"]]
            else:
                ours_errors[err] = ours_errors.get(err, 0) + 1
        for m, r in picks.items():
            rows.append({"group": g, "method": m, "members": len(r), "rho": round(group["rho"], 3),
                         "feasiblePlans": R.shape[1], "minRatio": float(r.min()),
                         "meanRatio": float(r.mean()), "gini": gini(r), "below50": int(r.min() < 0.5),
                         "costPerPerson": picked_costs[m], "groupBudgetCap": cap,
                         "stopPlaceIds": json.dumps(picked_stops[m]),
                         "budgetViolation": int(cap is not None and picked_costs[m] > cap + 1e-9)})
    elapsed = time.time() - t0
    print(f"[A] {args.groups} groups in {elapsed:.1f}s ({resampled} infeasible groups redrawn, {dropped} vetoes dropped by the cap)")
    for err, c in ours_errors.items():
        notes.append(f"ours: {c} groups excluded ({err})")
    attempted = min(args.groups, n_ours) if api is not None else 0
    scored = sum(r["method"] == "ours" for r in rows)
    if attempted:
        notes.append(f"ours API coverage: {scored}/{attempted} groups scored, {attempted - scored} failed or returned invalid/empty plans. "
                     "Utility summaries are conditional on success; use paired rows for matched comparisons and report failures alongside them.")
    return rows, notes, {"groups": args.groups, "redrawn": resampled, "vetoesDropped": dropped,
                         "timeFeasiblePlans": n_plans, "elapsedSec": round(elapsed, 1),
                         "budgetViolations": sum(r["budgetViolation"] for r in rows),
                         "oursAttempted": attempted, "oursScored": scored, "oursErrors": ours_errors}


def summarize_a(rows, rng):
    by = {}
    for r in rows:
        by.setdefault(r["method"], {})[r["group"]] = r
    methods = [m for m in METHODS if m in by]
    summary = []
    for m in methods:
        rs = list(by[m].values())
        s = {"method": m, "groups": len(rs)}
        for key in ["minRatio", "gini", "below50", "meanRatio"]:
            values = [r[key] for r in rs]
            s[key], s[key + "_lo"], s[key + "_hi"] = proportion_ci(values) if key == "below50" else bootstrap_ci(values, rng)
        summary.append(s)
    refs = [m for m in ["ours", "maximin"] if m in by]
    paired = []
    for ref in refs:
        for m in methods:
            if m == ref:
                continue
            common = sorted(set(by[m]) & set(by[ref]))
            for key in ["minRatio", "gini", "below50"]:
                d = [by[m][g][key] - by[ref][g][key] for g in common]
                mean, lo, hi = bootstrap_ci(d, rng)
                paired.append({"method": m, "vs": ref, "metric": key, "groups": len(common),
                               "meanDiff": mean, "lo": lo, "hi": hi})
    return summary, paired


# ---------------------------------------------------------- experiment B ---

def run_experiment_b(args, places, X, api, rng):
    """Random vs uncertainty-based swipe selection; top-3 hit rate vs swipes 1-12.
    SIMULATED users answer each swipe by Bradley-Terry on their synthetic taste.
    Needs the api's /elicit/update (both policies) and /elicit/next (uncertainty policy)."""
    if api is None:
        return None, ["Experiment B SKIPPED: real API evaluation disabled or health check failed. Scaffolding only."]
    if args.b_users == 0:
        return None, ["Experiment B SKIPPED: --b-users 0 (plan evaluation only)."]
    meals = [i for i, p in enumerate(places) if p["category"] == "meal"]
    ids = [places[i]["id"] for i in meals]
    swipes = list(range(1, 13))
    hits = {"random": np.zeros(len(swipes)), "uncertainty": np.zeros(len(swipes))}
    done, errors = 0, 0
    for u in range(args.b_users):
        theta = rng.standard_normal(K)
        true_u = X[meals] @ theta
        ok_user = True
        results = {}
        for policy in hits:
            post = {"mean": [0.0] * K, "cov": np.eye(K).tolist()}
            seen, row = [], []
            try:
                for _ in swipes:
                    if policy == "random":
                        pairs = [pr for pr in itertools.combinations(meals, 2)
                                 if [places[pr[0]]["id"], places[pr[1]]["id"]] not in seen]
                        pairs = pairs or list(itertools.combinations(meals, 2))  # all seen: allow repeats
                        a, b = pairs[rng.integers(len(pairs))]
                    else:
                        nxt = api.post("/elicit/next", {"memberId": f"u{u}", "posterior": post,
                                                        "alreadySeen": seen, "candidatePlaceIds": ids,
                                                        "focusPlaceIds": []})
                        a, b = ids.index(nxt["a"]), ids.index(nxt["b"])
                        a, b = meals[a], meals[b]
                    seen.append([places[a]["id"], places[b]["id"]])
                    pa = 1 / (1 + np.exp(-theta @ (X[a] - X[b])))
                    win, lose = (a, b) if rng.random() < pa else (b, a)
                    post = api.post("/elicit/update", {"posterior": post, "winnerPlaceId": places[win]["id"],
                                                       "loserPlaceId": places[lose]["id"]})["posterior"]
                    # random tie-break; a hit is any top-3 pick tied with the user's true best
                    est = X[meals] @ np.array(post["mean"]) + 1e-9 * rng.random(len(meals))
                    row.append(bool(true_u[np.argsort(-est)[:3]].max() >= true_u.max() - 1e-9))
            except (urllib.error.URLError, TimeoutError, ValueError, OSError, KeyError):
                ok_user = False
                break
            results[policy] = row
        if ok_user:
            for policy, row in results.items():
                hits[policy] += row
            done += 1
        else:
            errors += 1
    if not done:
        return None, [f"Experiment B: all {errors} users failed (api errors)."]
    curve = [{"swipes": s, **{p: float(hits[p][k] / done) for p in hits}} for k, s in enumerate(swipes)]
    return curve, [f"Experiment B: {done} simulated users ({errors} dropped on api errors)."]


# ---------------------------------------------------------------- output ---

def write_csv(path, rows):
    if not rows:
        return
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]), lineterminator="\n")
        w.writeheader()
        w.writerows(rows)


def make_chart(path, summary, curve, flat=None):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        return False
    panels = 2 if curve else 1
    fig, axes = plt.subplots(1, panels, figsize=(6.5 * panels, 4.2), squeeze=False)
    ax = axes[0][0]
    names = [s["method"] for s in summary]
    y = [s["minRatio"] for s in summary]
    err = [[s["minRatio"] - s["minRatio_lo"] for s in summary], [s["minRatio_hi"] - s["minRatio"] for s in summary]]
    colors = ["#2a6fdb" if n == "ours" else "#8a94a6" for n in names]
    ax.bar(names, y, yerr=err, capsize=4, color=colors)
    for i, value in enumerate(y):
        ax.text(i, value + err[1][i] + 0.015, f"{value * 100:.1f}%", ha="center", fontsize=9)
    ax.set_ylim(0, 1)
    ax.set_ylabel("worst member's ratio (mean, 95% CI)")
    ax.set_title("SIMULATED: worst-off member by choice rule", fontsize=10)
    if curve:
        ax = axes[0][1]
        xs = [c["swipes"] for c in curve]
        ax.plot(xs, [c["random"] for c in curve], "o-", color="#8a94a6", label="random pairs")
        ax.plot(xs, [c["uncertainty"] for c in curve], "o-", color="#2a6fdb", label="uncertainty pairs")
        ax.set_xlabel("swipes")
        ax.set_ylabel("top-3 hit rate")
        ax.set_ylim(0, 1)
        ax.legend()
        ax.set_title("SIMULATED: learning curve", fontsize=10)
    footnote = "Synthetic groups/tastes; cached places. Cumulative budgets enforced; feasible groups only.\n"
    footnote += "Oracle baselines; no implemented-solver result." if "ours" not in names else "API comparison uses a truth-centered posterior, not learned preferences."
    if {"activity", "dessert"} <= set(flat or []):
        footnote += "\nConstant features limit interpretation; the below-50% metric currently has no signal."
    fig.text(0.5, 0.015, footnote, ha="center", fontsize=8)
    fig.tight_layout(rect=(0, 0.13, 1, 1))
    fig.savefig(path, dpi=150)
    plt.close(fig)
    return True


def flat_features(X):
    """Features that never vary across places (e.g. v1 placeholder aspects)."""
    return [FEATURES[k] for k in range(K) if np.ptp(X[:, k]) < 1e-12]


def flat_categories(places, X):
    return [category for category in DEFAULT_DWELL
            if (idx := [i for i, p in enumerate(places) if p["category"] == category])
            and np.all(np.ptp(X[idx], axis=0) < 1e-12)]


def write_readme(path, args, meta, summary, paired, curve, notes, chart, out_rel):
    s = {r["method"]: r for r in summary}
    pct = lambda x: f"{x * 100:.1f}%"
    floor_note = ("With the current flat features, activities and desserts get normalized value 1. "
                  "Every two-stop plan therefore has utility at least 0.5 and every three-stop plan at least 2/3. "
                  "The below-50% metric cannot distinguish these rules on this dataset. Better features may change the results in either direction."
                  if {"activity", "dessert"} <= set(meta["flatCategories"]) else
                  "Interpret the below-50% rate alongside its interval, feature coverage and infeasible-group redraws; it is not a real-user failure rate.")
    L = ["# Experiments (SIMULATED)", "",
         "> **Everything here is SIMULATED.** Groups, tastes, constraints, and swipes are synthetic; "
         "ground truth is the synthetic taste vector. Only place features come from real data "
         f"(`{meta['places']}`); review aspects may still be placeholders.", "",
         f"Seed {args.seed}; {meta['A']['groups']} feasible groups of 3-5; generated {meta['generatedAt']}.", "",
         "**Correction:** the earlier results did not enforce cumulative outing budgets. "
         "Those numbers and the earlier chart are withdrawn; all outputs below were regenerated with total-cost checks.", "",
         f"**Feasibility audit:** {meta['A']['budgetViolations']} selected-plan budget violations; "
         f"{meta['A']['redrawn']} infeasible groups redrawn. Results describe feasible groups only, "
         "not the probability that an arbitrary group can find an outing.", ""]
    if meta["flat"]:
        L += [f"**Caveat:** these features are identical for every place in this file, so they carry no signal: "
              f"{', '.join(meta['flat'])}. Rerun once `data/places.json` v2 (real review aspects) lands.", ""]
    L += ["## Headline numbers (Experiment A)", ""]
    if "ours" in s:
        o = s["ours"]
        L.append(f"- ours: worst member at {pct(o['minRatio'])} of their ideal on average; "
                 f"{pct(o['below50'])} of groups leave someone below 50%.")
    for m in ["maximin", "utilitarian", "plurality", "random"]:
        if m in s:
            L.append(f"- {m}: worst member at {pct(s[m]['minRatio'])} of ideal; "
                     f"{pct(s[m]['below50'])} of groups leave someone below 50%.")
    L += ["", "Baselines are oracles: they see each synthetic member's true taste. "
          "The optional \"ours\" comparison also supplies the true taste as its posterior mean "
          f"with sd {OURS_POSTERIOR_SD}; this is an oracle-centered uncertainty test, not evidence of learning from swipes.", "",
          "## Experiment A: choice rules", "",
          "| method | groups | worst ratio (95% CI) | Gini (95% CI) | share with someone < 50% (95% CI) | mean ratio |",
          "| --- | --- | --- | --- | --- | --- |"]
    for r in summary:
        L.append(f"| {r['method']} | {r['groups']} | {r['minRatio']:.3f} [{r['minRatio_lo']:.3f}, {r['minRatio_hi']:.3f}] "
                 f"| {r['gini']:.3f} [{r['gini_lo']:.3f}, {r['gini_hi']:.3f}] "
                 f"| {pct(r['below50'])} [{pct(r['below50_lo'])}, {pct(r['below50_hi'])}] | {r['meanRatio']:.3f} |")
    L += ["", "Paired differences (method minus reference, same groups, bootstrap 95% CI over groups):", "",
          "| method | vs | metric | matched groups | diff | 95% CI |", "| --- | --- | --- | --- | --- | --- |"]
    for p in paired:
        L.append(f"| {p['method']} | {p['vs']} | {p['metric']} | {p['groups']} | {p['meanDiff']:+.3f} | [{p['lo']:+.3f}, {p['hi']:+.3f}] |")
    L += ["", "## Experiment B: swipe selection", ""]
    if curve:
        L += ["| swipes | random | uncertainty |", "| --- | --- | --- |"]
        L += [f"| {c['swipes']} | {c['random']:.3f} | {c['uncertainty']:.3f} |" for c in curve]
    else:
        L.append("Not run yet (see notes).")
    L += ["", "## Notes", ""] + [f"- {n}" for n in notes]
    L += ["", "## Method", "",
          "- Taste: theta_i = sqrt(rho) * shared + sqrt(1 - rho) * noise_i, all N(0, I) over the 13 contract features; rho ~ U(0.2, 0.8) per group.",
          f"- Hard constraints per member: cuisine veto p={P_VETO_CUISINE} (second p={P_VETO_CUISINE_2}), dessert-category veto p={P_VETO_DESSERT}, "
          f"cap of {VETO_CAP} vetoes; budget p={P_BUDGET} from {BUDGETS}; vegetarian p={P_VEGETARIAN}; "
          f"travel cap p={P_TRAVEL_CAP} from {TRAVEL_CAPS} min, origin uniform within {ORIGIN_RADIUS_KM} km of the places' centroid. "
          "Groups with no feasible plan are redrawn.",
          "- Hard filter: build-brief C4, except the dietary check applies to meals and desserts only "
          "(the agreed contract correction). Sum every stop's catalog cost and reject an outing above any member's non-null budget. Null is uncapped; zero is a real cap. No cap is raised.",
          "- Utility, per-member per-category range normalization over the common group-hard-filtered place set, plan utility (mean over stops), ratio to the member's best group-feasible plan: build-brief C3. "
          "A category where a member's utility is flat gives every place 1.0.",
          "- Plans: build-brief C4 templates, 15-min start grid in Sat 17:00-23:00, each stop starts on the grid after travel (haversine x1.3; 4.5 km/h up to 1.2 km, else 18 km/h), all stops open for their dwell, first leg within each member's travel cap.",
          "- Rules: random feasible plan; plurality (each member votes one favorite, most votes wins); utilitarian (max sum of ratios); maximin (max min ratio, tie-break sum); Nash (max product of ratios). Ties broken at random.",
          "- Metrics per group: min ratio, Gini of ratios, whether min ratio < 0.5. Continuous means and paired differences use bootstrap 95% CIs (2,000 resamples); the below-50% rate uses a Wilson 95% interval, including when no failures are observed.",
          "- " + floor_note,
          "- Maximin optimizes the same worst-member score used for evaluation under oracle tastes. Its win on that score is expected by construction; it does not establish that the implemented solver or real users do better.",
          "- Optional API outputs are accepted only after non-stub health and per-response stub checks. Every returned plan is checked for known IDs, templates, exclusions, catalog costs/coordinates, cumulative budgets, vetoes, dietary needs, hours, dwell, grid, window and travel. Report invalid/empty/request failures separately; success-only utility is not an overall success rate.",
          "", "Files: " + ", ".join(f"`{out_rel}/{f}`" for f in
                                     ["exp_a_groups.csv", "exp_a_summary.csv", "exp_a_paired.csv", "summary.json"]
                                     + (["exp_b_curve.csv"] if curve else [])
                                     + (["chart.png"] if chart else []))]
    if chart:
        L += ["", f"![SIMULATED results]({out_rel}/chart.png)"]
    L += ["", "## Reproduce", "",
          "Python 3.11+; from the repository root:", "", "```sh",
          "python3 -m venv docs/experiments/.venv",
          "docs/experiments/.venv/bin/python -m pip install -r docs/experiments/requirements.txt",
          "docs/experiments/.venv/bin/python -m unittest discover -s docs/experiments -p 'test_*.py' -v",
          "docs/experiments/.venv/bin/python docs/experiments/sim.py --no-api", "```", "",
          f"Input SHA-256: `{meta['placesSha256']}`. Runtime versions: `{json.dumps(meta['runtime'], sort_keys=True)}`.", "",
          "API evaluation is opt-in and does not load `api/.env` or modify that folder. "
          "When Eric confirms the real service is ready, configure `FASTAPI_BASE_URL` and "
          "`HUDDLE_SHARED_SECRET` privately in the environment or ignored root `.env`. "
          "Use a separate output directory so the baseline report stays intact:", "", "```sh",
          "docs/experiments/.venv/bin/python docs/experiments/sim.py --with-api --ours-groups 100 --b-users 0 \\",
          "  --out docs/experiments/api-results --readme docs/experiments/API_RESULTS.md", "```", "",
          "A stub, unavailable API or catalog-count mismatch produces no `ours` numbers. "
          "`--b-users 0` skips learning evaluation; enable it only after `/elicit/*` is real. "
          "An explicitly requested API evaluation exits nonzero if health fails, any requested plan is not scored, or the requested learning run fails entirely. "
          "Review method and API failure coverage with Max before presenting any numbers."]
    Path(path).write_text("\n".join(L) + "\n", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--groups", type=int, default=1000)
    ap.add_argument("--ours-groups", type=int, default=None, help="call /plan for only the first N groups")
    ap.add_argument("--b-users", type=int, default=500)
    ap.add_argument("--places", default=str(REPO / "data" / "places.json"))
    ap.add_argument("--out", default=str(HERE / "results"))
    ap.add_argument("--readme", default=str(HERE / "README.md"))
    api_flags = ap.add_mutually_exclusive_group()
    api_flags.add_argument("--no-api", action="store_true", help="baselines only (default)")
    api_flags.add_argument("--with-api", action="store_true", help="explicitly enable real API evaluation after a non-stub health check")
    args = ap.parse_args()
    if args.groups < 1 or args.b_users < 0 or (args.ours_groups is not None and args.ours_groups < 0):
        ap.error("groups must be positive; ours-groups and b-users must be nonnegative")

    rng = np.random.default_rng(args.seed)
    places, X = load_places(args.places)
    api, api_note = None, None
    if args.with_api:
        base, secret = load_env()
        api, api_note = real_api(base, secret, len(places))
    print(f"places: {len(places)} from {args.places}; api: {'ON (real health verified)' if api else 'OFF (ours and B skipped)'}")
    if api_note:
        print(api_note)
    flat = flat_features(X)
    if flat:
        print(f"WARNING: features constant across all places (no signal): {', '.join(flat)}")

    rows, notes_a, meta_a = run_experiment_a(args, places, X, api, rng)
    summary, paired = summarize_a(rows, rng)
    curve, notes_b = run_experiment_b(args, places, X, api, rng)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    write_csv(out / "exp_a_groups.csv", rows)
    write_csv(out / "exp_a_summary.csv", summary)
    write_csv(out / "exp_a_paired.csv", paired)
    if curve:
        write_csv(out / "exp_b_curve.csv", curve)
    flat_cats = flat_categories(places, X)
    chart = make_chart(out / "chart.png", summary, curve, flat_cats)
    notes = ([api_note] if api_note else []) + notes_a + notes_b + ([] if chart else ["matplotlib not installed: chart skipped, CSVs written."])
    try:
        places_rel = Path(args.places).resolve().relative_to(REPO).as_posix()
    except ValueError:
        places_rel = args.places
    runtime = {"python": platform.python_version(), "numpy": np.__version__}
    try:
        runtime["matplotlib"] = version("matplotlib")
    except PackageNotFoundError:
        runtime["matplotlib"] = None
    meta = {"places": places_rel, "flat": flat, "flatCategories": flat_cats, "A": meta_a, "seed": args.seed,
            "placesSha256": hashlib.sha256(Path(args.places).read_bytes()).hexdigest(),
            "generatedAt": datetime.now(ZoneInfo("America/Los_Angeles")).isoformat(timespec="seconds"),
            "runtime": runtime}
    (out / "summary.json").write_text(json.dumps({"label": "SIMULATED", **meta, "summary": summary,
                                                  "paired": paired, "curveB": curve, "notes": notes}, indent=2),
                                      encoding="utf-8")
    out_rel = os.path.relpath(out, Path(args.readme).resolve().parent).replace(os.sep, "/")
    write_readme(args.readme, args, meta, summary, paired, curve, notes, chart, out_rel)

    print("\nSIMULATED headline numbers (Experiment A, synthetic ground truth):")
    print(f"{'method':<12} {'worst ratio':>22} {'Gini':>8} {'someone<50%':>12}")
    for s in summary:
        print(f"{s['method']:<12} {s['minRatio']:.3f} [{s['minRatio_lo']:.3f},{s['minRatio_hi']:.3f}]"
              f" {s['gini']:>8.3f} {s['below50'] * 100:>11.1f}%")
    for n in notes:
        print("note:", n)
    print(f"\nwrote {out} and {args.readme}")
    return int(args.with_api and (api is None or meta_a["oursScored"] < meta_a["oursAttempted"]
                                  or (args.b_users > 0 and curve is None)))


if __name__ == "__main__":
    sys.exit(main())
