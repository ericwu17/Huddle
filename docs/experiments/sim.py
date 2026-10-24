"""Huddle experiment harness (Part B, build-brief B5).

SIMULATED: every group, taste vector, constraint, and swipe here is synthetic.
Ground truth is the synthetic taste vector we generate, not a real person.
Only the place features (data/places.json) are real data.

Experiment A: compare group-choice rules on ~1,000 synthetic groups.
  Baselines (random, plurality, utilitarian, maximin, Nash) see the TRUE
  synthetic tastes (oracle). "ours" calls the api POST /plan when
  FASTAPI_BASE_URL is set; otherwise it is skipped (never faked).
Experiment B: random vs uncertainty-based swipe selection. Needs the api's
  /elicit/next and /elicit/update; skipped until FASTAPI_BASE_URL is set.

Utility, normalization, ratios, hard filter, and plan enumeration follow
build-brief C3/C4 (templates [meal, activity, dessert] and [activity, meal],
15-minute grid inside Saturday 17:00-23:00, haversine x1.3 travel).

Run: python docs/experiments/sim.py            (all defaults, seed 7)
     python docs/experiments/sim.py --help
"""

import argparse
import csv
import itertools
import json
import math
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

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


def feasible_plans(group, plans, mask, lat, lng):
    """Per template: (stop index array, plan index into the global list) passing the group's filter."""
    out = {}
    for tpl, (S, _) in plans.items():
        keep = mask[S].all(axis=1) if len(S) else np.zeros(0, dtype=bool)
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

    def post(self, path, body):
        req = urllib.request.Request(self.base + path, data=json.dumps(body).encode(),
                                     headers={"Content-Type": "application/json",
                                              "X-Huddle-Secret": self.secret}, method="POST")
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            return json.loads(r.read())


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


def ours_ratios(resp, places, v, Vmax):
    """Evaluate the api's Safe plan under the TRUE synthetic tastes."""
    plans = resp.get("plans") or []
    if not plans:
        return None, "no plans returned"
    plan = next((p for p in plans if p.get("kind") == "safe"), plans[0])
    ids = {p["id"]: i for i, p in enumerate(places)}
    stops = [ids.get(s.get("placeId")) for s in plan.get("stops", [])]
    if not stops or None in stops:
        return None, "plan uses a placeId not in our places file"
    vals = v[:, stops]
    if np.isnan(vals).any():
        return None, "plan uses a place our hard filter rejects"
    return vals.mean(1) / Vmax, None


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


def run_experiment_a(args, places, X, api, rng):
    starts, ok = open_matrix(places)
    t0 = time.time()
    plans, lat, lng = enumerate_plans(places, starts, ok)
    n_plans = {"-".join(t): len(S) for t, (S, _) in plans.items()}
    print(f"[A] time-feasible plans (group-independent): {n_plans} in {time.time() - t0:.1f}s")
    center = (float(lat.mean()), float(lng.mean()))

    rows, notes = [], []
    resampled = dropped = 0
    ours_errors = {}
    n_ours = args.ours_groups if args.ours_groups is not None else args.groups
    if api is None:
        notes.append("ours SKIPPED: FASTAPI_BASE_URL is not set (the solver is not ready). No ours numbers were produced.")
    t0 = time.time()
    for g in range(args.groups):
        while True:
            group = make_group(rng, places, center)
            mask = place_filter(places, group["hard"])
            feas = feasible_plans(group, plans, mask, lat, lng)
            if sum(len(f) for f in feas.values()):
                break
            resampled += 1  # no feasible plan: draw a new group
        dropped += group["vetoesDropped"]
        v = normalized_place_values(group["theta"], X, places, mask)
        V = np.concatenate([v[:, plans[t][0][feas[t]]].mean(2) for t in TEMPLATES], axis=1)
        Vmax = V.max(1)
        Vmax = np.where(Vmax > 0, Vmax, 1.0)
        R = V / Vmax[:, None]
        picks = {m: R[:, j] for m, j in choose_baselines(rng, R).items()}
        if api is not None and g < n_ours:
            try:
                r, err = ours_ratios(api.post("/plan", ours_request(g, group)), places, v, Vmax)
            except (urllib.error.URLError, TimeoutError, ValueError, OSError) as e:
                r, err = None, f"request failed: {type(e).__name__}"
            if r is not None:
                picks["ours"] = r
            else:
                ours_errors[err] = ours_errors.get(err, 0) + 1
        for m, r in picks.items():
            rows.append({"group": g, "method": m, "members": len(r), "rho": round(group["rho"], 3),
                         "feasiblePlans": R.shape[1], "minRatio": float(r.min()),
                         "meanRatio": float(r.mean()), "gini": gini(r), "below50": int(r.min() < 0.5)})
    elapsed = time.time() - t0
    print(f"[A] {args.groups} groups in {elapsed:.1f}s ({resampled} infeasible groups redrawn, {dropped} vetoes dropped by the cap)")
    for err, c in ours_errors.items():
        notes.append(f"ours: {c} groups excluded ({err})")
    return rows, notes, {"groups": args.groups, "redrawn": resampled, "vetoesDropped": dropped,
                         "timeFeasiblePlans": n_plans, "elapsedSec": round(elapsed, 1)}


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
            s[key], s[key + "_lo"], s[key + "_hi"] = bootstrap_ci([r[key] for r in rs], rng)
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
        return None, ["Experiment B SKIPPED: FASTAPI_BASE_URL is not set (/elicit/* not available). Scaffolding only."]
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
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)


def make_chart(path, summary, curve):
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
    for i, s in enumerate(summary):
        ax.text(i, 0.02, f"{s['below50'] * 100:.0f}% <50%", ha="center", fontsize=8, color="white")
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
    fig.text(0.5, 0.005, "Synthetic groups and tastes; real place features. Not user data.", ha="center", fontsize=8)
    fig.tight_layout(rect=(0, 0.03, 1, 1))
    fig.savefig(path, dpi=150)
    plt.close(fig)
    return True


def flat_features(X):
    """Features that never vary across places (e.g. v1 placeholder aspects)."""
    return [FEATURES[k] for k in range(K) if np.ptp(X[:, k]) < 1e-12]


def write_readme(path, args, meta, summary, paired, curve, notes, chart, out_rel):
    s = {r["method"]: r for r in summary}
    pct = lambda x: f"{x * 100:.1f}%"
    L = ["# Experiments (SIMULATED)", "",
         "> **Everything here is SIMULATED.** Groups, tastes, constraints, and swipes are synthetic; "
         "ground truth is the synthetic taste vector. Only place features come from real data "
         f"(`{meta['places']}`). Regenerate with `python docs/experiments/sim.py`.", "",
         f"Seed {args.seed}; {meta['A']['groups']} groups of 3-5; generated {time.strftime('%Y-%m-%d %H:%M')}.", ""]
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
          "\"ours\" sees it only through a posterior (mean = true taste, sd "
          f"{OURS_POSTERIOR_SD}) and plans under uncertainty.", "",
          "## Experiment A: choice rules", "",
          "| method | groups | worst ratio (95% CI) | Gini (95% CI) | share with someone < 50% (95% CI) | mean ratio |",
          "| --- | --- | --- | --- | --- | --- |"]
    for r in summary:
        L.append(f"| {r['method']} | {r['groups']} | {r['minRatio']:.3f} [{r['minRatio_lo']:.3f}, {r['minRatio_hi']:.3f}] "
                 f"| {r['gini']:.3f} [{r['gini_lo']:.3f}, {r['gini_hi']:.3f}] "
                 f"| {pct(r['below50'])} [{pct(r['below50_lo'])}, {pct(r['below50_hi'])}] | {r['meanRatio']:.3f} |")
    L += ["", "Paired differences (method minus reference, same groups, bootstrap 95% CI over groups):", "",
          "| method | vs | metric | diff | 95% CI |", "| --- | --- | --- | --- | --- |"]
    for p in paired:
        L.append(f"| {p['method']} | {p['vs']} | {p['metric']} | {p['meanDiff']:+.3f} | [{p['lo']:+.3f}, {p['hi']:+.3f}] |")
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
          "(activities have no dietary tags, so the literal rule leaves any group with a vegetarian zero plans; flagged to C).",
          "- Utility, per-member per-category range normalization, plan utility (mean over stops), ratio to the member's best feasible plan: build-brief C3. "
          "A category where a member's utility is flat gives every place 1.0.",
          "- Plans: build-brief C4 templates, 15-min start grid in Sat 17:00-23:00, each stop starts on the grid after travel (haversine x1.3; 4.5 km/h up to 1.2 km, else 18 km/h), all stops open for their dwell, first leg within each member's travel cap.",
          "- Rules: random feasible plan; plurality (each member votes one favorite, most votes wins); utilitarian (max sum of ratios); maximin (max min ratio, tie-break sum); Nash (max product of ratios). Ties broken at random.",
          "- Metrics per group: min ratio, Gini of ratios, whether min ratio < 0.5. Means with bootstrap 95% CIs (2,000 resamples).",
          "", "Files: " + ", ".join(f"`{out_rel}/{f}`" for f in
                                     ["exp_a_groups.csv", "exp_a_summary.csv", "exp_a_paired.csv", "summary.json"]
                                     + (["exp_b_curve.csv"] if curve else [])
                                     + (["chart.png"] if chart else []))]
    if chart:
        L += ["", f"![SIMULATED results]({out_rel}/chart.png)"]
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
    ap.add_argument("--no-api", action="store_true", help="ignore FASTAPI_BASE_URL")
    args = ap.parse_args()

    rng = np.random.default_rng(args.seed)
    places, X = load_places(args.places)
    base, secret = load_env()
    api = None if (args.no_api or not base) else Api(base, secret)
    print(f"places: {len(places)} from {args.places}; api: {'ON ' + base if api else 'OFF (ours and B skipped)'}")
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
    chart = make_chart(out / "chart.png", summary, curve)
    notes = notes_a + notes_b + ([] if chart else ["matplotlib not installed: chart skipped, CSVs written."])
    try:
        places_rel = Path(args.places).resolve().relative_to(REPO).as_posix()
    except ValueError:
        places_rel = args.places
    meta = {"places": places_rel, "flat": flat, "A": meta_a, "seed": args.seed}
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


if __name__ == "__main__":
    sys.exit(main())
