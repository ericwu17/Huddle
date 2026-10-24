# Huddle Python API

The stateless FastAPI service behind contract S5.3: preference parsing, swipe
learning, the group solver, private trade offers, roulette and the agent
council. The SpacetimeDB module is its only caller; the browser never reaches it.
Python 3.11+.

## Two modes

| `STUB_MODE` | Places | What every endpoint does |
| --- | --- | --- |
| `true` (default) | 9 fictional fixtures, `api/fixtures/places.fake.json` | Phase-zero canned data, labeled `SYNTHETIC STUB` ([details below](#stub-mode-phase-zero)) |
| `false` | 45 real Berkeley places, `data/places.json` | The real service: Claude parsing, Bayesian swipe learning, Monte Carlo solver, offers, live council |

**The module and the API must use the same mode.** The module picks swipe
candidates from its own catalog (`server/src/lib/places.ts`). A stub-mode module
sends `stub_*` IDs, and a real-mode API rejects them with 422, which puts that
group into demo mode. Switch both together. The order is in
[docs/LOCAL_TUNNELS.md](../docs/LOCAL_TUNNELS.md#4-point-the-maincloud-module-at-the-tunnels).

Real-mode responses carry no `X-Huddle-Stub` header, so the module stores runs
with `stub: false` and ingests the council transcript directly.

## Run locally

From the repository root:

```sh
python3 -m venv api/.venv                      # once; 3.11+
api/.venv/bin/python -m pip install -r api/requirements-dev.txt
cp api/.env.example api/.env                   # once; fill in privately
api/.venv/bin/python -m uvicorn api.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

The app loads `api/.env` itself; exported variables win, so
`STUB_MODE=false api/.venv/bin/python -m uvicorn ...` overrides the file for one
run. Restart uvicorn after editing `api/.env`.

## Configuration

| Name | Meaning |
| --- | --- |
| `HUDDLE_SHARED_SECRET` | Required, nonblank. Every route, `/health` included, needs it in `X-Huddle-Secret`. Never browser-visible. |
| `STUB_MODE` | `true` (default) or `false`. Anything else refuses startup. |
| `PLACES_PATH` | Optional catalog override. Stub mode accepts only `synthetic_stub` places; real mode refuses them. |
| `ANTHROPIC_API_KEY` | Real mode. Without it parsing uses the keyword rules and the council falls back to Safe; nothing else needs it. |
| `CLAUDE_MODEL_FAST`, `CLAUDE_MODEL_SMART` | Default `claude-haiku-5-5` (parser, advocates) and `claude-sonnet-5-5` (chair). |
| `SPACETIMEDB_URI`, `SPACETIMEDB_DB` | Real mode, optional. When both are set, each validated council message is also POSTed to `/route/council-message` as it is produced, so the panel fills live. The response transcript is the source of truth either way; the module deduplicates. |
| `FASTAPI_BASE_URL` | Read by the smoke check and the module, not by this service. |

## How the real service works

Each section maps to the build brief, Part C.

- **`/parse-prefs` (C2), [parse.py](parse.py).** Claude fills a strict JSON
  schema for `hard` and `soft`. The member's text sits inside `<preferences>`
  tags as data, and the schema bounds what can come back. If the reply fails
  validation it retries once, then falls back to keyword rules (quiet, crowds,
  romantic, cheap, outdoors, "no X", "$N", dietary words) and adds a private
  warning. A dollar cap written in the text ("under $30") is never dropped: if
  the model misses it or reads a higher number, the stated cap wins, with a
  warning. The veto cap of two is enforced. The prior follows C2: shift ±0.5 / 1.0 / 1.5
  and sd 0.9 / 0.7 / 0.5 by confidence; unmentioned features are N(0, 1).
- **`/elicit/update` (C5), [elicit.py](elicit.py).** Bradley-Terry with a
  Laplace approximation: five Newton steps to the MAP, then
  `(Σ⁻¹ + s(1−s) d dᵀ)⁻¹`. The mean moves toward the winner and the variance
  along `d` shrinks.
- **`/elicit/next` (C6).** Same-category unseen pairs, at most 200 sampled (focus
  places first), scored `(dᵀΣd)·p(1−p)`. The a/b order is seeded by member and
  swipe count. Exhausted returns 409.
- **`/plan` (C3, C4, C7), [solver.py](solver.py), [catalog.py](catalog.py).**
  - Feasibility: every [meal, activity, dessert] and [activity, meal] itinerary is
    built on a 15-minute grid, earliest start, open for each whole stop, finishing
    inside the window. Legs are Tier 1 travel (straight line ×1.3, walk ≤1.2 km
    at 4.5 km/h, else 18 km/h). Then the group filter: exclusions, everyone's
    vetoes, dietary tags on meals and desserts only, the **cumulative** outing
    cost against every cap, and each member's first-leg travel cap when their
    origin is known.
  - Scoring: 300 samples (100 for preview) from each posterior. Range-normalized
    utility per member and category, plan value = mean over stops, ratio = value
    over that member's best plan in the sample. Robustness = share of samples
    where every ratio ≥ `tau`. Ties go to Nash welfare, then mean rating, then a
    stable key.
  - Named plans: Safe = most robust; Bold = most novel; Budget = cheapest. Each
    uses a different place set, preferring the fewest places shared with plans
    already picked.
  - Explanations: a member's compromise is the feature where the plan falls
    furthest below their own best plan, weighted by their mean taste. `whyLine`
    names the two largest; the module anonymizes it unless the group opts in.
  - Determinism: seeded from `runId`. The same request returns the same plans;
    only `stats.elapsedMs` varies.
- **`/offers` (C8).** For each member with a budget cap (or a travel cap and
  an origin), the plans unlocked by relaxing only that limit by up to $15 /
  15 min are scored in the same relaxed world as the baseline Safe plan. An offer
  needs +0.05 robustness or +0.05 minimum ratio. The smallest qualifying
  concession wins (ties: largest gain), at most one per member and three in
  total. The baseline is recomputed from the same `runId`, so `baselinePlanId`
  is not looked up.
- **`/roulette` (C9).** Weights ∝ robustness², seeded draw. Same code in both
  modes.
- **`/council` (S5.3 rules, C10), [council.py](council.py), [llm.py](llm.py).**
  - Each advocate gets only its own member's tools (`my_score`,
    `my_dealbreakers`, `my_slack`) plus the public `plan_facts`, all computed up
    front. Labels are shuffled by seed. No names, caps or free text reach any
    prompt.
  - Round 1 runs the four advocates in parallel; round 2 reads the round-1
    transcript; then the chair.
  - Our validator rejects a message when any number in it is not in the
    speaker's tool outputs (±0.6%, or written as a percentage), a citation does
    not match its tool, it names a member, contains a clock time, or exceeds 40
    (advocate) / 60 (chair) words. A rejected reply is retried once inside the
    time limit, then the advocate is dropped. A failed chair means Safe with
    `fallbackUsed: true`.
  - Time: 8 s per call and 17 s for the whole council, under the module's 20 s
    HTTP timeout. Measured live: 6 to 12 s.

All Claude calls go through `LLM.call` in [llm.py](llm.py): structured output
(`output_config.format`) at effort `low`, a hard per-call timeout, one retry on
an invalid reply, no SDK-level retries. The current Haiku and Sonnet models
reject a non-default `temperature`, so C2's "temperature 0" is not sent;
determinism comes from the schema and the validators instead.

### Decisions where the brief left room or could not be followed

- **Bold/Budget floor.** C7 says robustness ≥ max(0.5, safe − 0.25). When Safe
  itself is below 0.5 (wide priors, few swipes) nothing can clear that and the
  vote would have one option, so the floor becomes `safe − 0.25` in that case.
- **`relaxationHints` stays `[]`.** C4 asks for hints like "budget +$X for member
  Y", but `result_json` is visible to the whole group (the Plans screen shows
  hints raw) and the contract has no schema for them. Infeasible runs get a
  generic warning instead; the private path to a relaxation is `/offers`.
- **Offer plans carry no `perMember`, `gaveUp` or `whyLine`.** The offer row is
  private to its recipient, but those fields hold other members' numbers.
- **Dominated-plan pruning is skipped.** Ratios are normalized by the best plan
  in each sample, which pruning would change, and the demo group's 1,449
  candidate itineraries score in about 70 ms.
- **`my_slack`** is the most room the member has on any of the three plans
  (null without a cap).

### Known limits

- **Place aspects are placeholders.** Every place in `data/places.json` has
  aspects of 0.5 / 0.25 until the review pipeline lands, so tastes like "quiet"
  or "romantic" cannot separate places yet. Plans differ by cuisine, cost,
  dietary tags, hours and distance. Responses carry a warning and an
  `X-Huddle-Notice` header saying so.
- **Confidence rarely reaches the 0.9 stopping target.** With placeholder
  aspects only meal-cuisine swipes are informative. In a module run with
  scripted (inconsistent) swipes the group reached 0.29 and planned on the
  12-swipe cap.
- **The module's Consensus Map shows only the three named plans.** `/plan`
  returns up to `topK` Pareto points, but `guardPlanResult` in
  `server/src/lib/budgets.ts` keeps only points whose plan is in `plans`.

## Checks

```sh
api/.venv/bin/python -m unittest discover -s api/eval -v   # 37 tests, both modes, no network
api/.venv/bin/python api/eval/check_integration.py         # module procedures + local stub API
FASTAPI_BASE_URL=http://127.0.0.1:8000 HUDDLE_SHARED_SECRET=... \
  api/.venv/bin/python api/eval/smoke_http.py              # any running instance; detects the mode
```

- `test_api.py` covers stub mode and startup; `test_real.py` covers real mode
  with a scripted fake Claude client. That exercises the retry, validation,
  fallback and deadline paths: dropped advocates, a chair falling back to Safe,
  prompts free of names and caps, and the council deadline.
- `smoke_http.py` reads the mode from `/health`. In real mode it parses the
  four demo phrases (live Claude if the server has a key), plans for the demo
  group, and runs offers, roulette and one live council.
- Verified on 2026-10-23:
  - all 37 unit tests;
  - `check_integration.py` (15 module tests);
  - `smoke_http.py` in both modes over HTTP;
  - a one-off run of the real module procedures (parse, 12 swipe rounds,
    preview, plan, offers with `accept_offer`, roulette, scout, council)
    against a real-mode API with live Claude: `stub: false` runs, a 9-message
    council, no demo-mode switch. That run is not part of the suite.

## Check the live connected stubs

End to end through Maincloud. The helper loads the shared secret from `api/.env`
without printing it, runs `scripts/smoke.mjs`, and creates a disposable
synthetic group and bookings in the selected database:

```sh
api/.venv/bin/python api/eval/check_live.py \
  --server https://maincloud.spacetimedb.com --database huddle-calhacks \
  --voice-base-url https://<voice-tunnel>.trycloudflare.com --voice-scenario confirm
```

For a failure that starts in the voice service, restart only the voice API with
`STUB_SCENARIO=full` (keep its tunnel), run the same command with
`--voice-scenario full`, then restore `confirm` and rerun. The flag selects
assertions; it does not change the service.

The smoke test was written against the stubs. Against a real-mode API, two
council checks can fail without anything being wrong: a live advocate can be
dropped (fewer than nine messages), or the chair can pick a plan other than
Safe.

## Stub mode (phase zero)

`STUB_MODE=true` keeps the phase-zero behavior unchanged. There is no parser,
learning, solver or live council; all venue data and scores are fake; responses
carry `X-Huddle-Stub: true` and an `X-Huddle-Notice`.

| Route | Stub behavior |
| --- | --- |
| `GET /health` | `{"ok":true,"stub":true,"placesLoaded":9}` |
| `POST /parse-prefs` | Four exact demo phrases (below) map to canned fixtures with an identity posterior. Any other text returns 409, which leaves the prefs page on "Parsing…" in a module without demo mode. |
| `POST /elicit/next` | First unseen same-category fixture pair, focus first. |
| `POST /elicit/update` | Returns the posterior unchanged. |
| `POST /plan` | Three fixed itineraries ($18 / $20 / $14), filtered against every member's cumulative budget, vetoes, dietary needs, hours, window and first-leg travel. Preview: at most one Safe plan, `pareto: []`. |
| `POST /offers` | `{"offers":[]}` |
| `POST /roulette` | The real seeded draw. |
| `POST /council` | Canned nine-message transcript; the chair picks Safe. |

Demo phrases (case-insensitive): `vegetarian, under $30, somewhere quiet` ·
`no sushi, I love trying new places` · `broke this month, nothing over $20,
outdoors if possible` · `romantic vibe, I don't care about price`.

## Contract notes

No shared shape was changed. Open points:

1. `/elicit/next` has no exhausted-pair result shape; both modes return 409. The
   module stops asking at 12 swipes, far below the number of pairs.
2. `relaxationHints` entries have no schema and would be group-visible; they
   stay `[]` (see above).
3. C11 asks for a `/plan` seed option, but S5 does not declare one. Seeds come
   from `runId`; an unknown option returns 422.
4. Roulette's input has no member data, so the caller must send only plans
   that are currently approved.
5. The module turns any failed API call into demo mode for that group
   (`server/src/lib/demo.ts`), 4xx included, so a mode mismatch shows up as
   demo mode rather than an error.

## Privacy rules this service keeps

- Hard limits, posteriors and offers are owner-only. Plan `perMember` and
  `gaveUp` and council `memberId` are returned to the trusted module, which
  strips them from public views unless the group opts in.
- Group-visible text (`whyLine` aside, which the module anonymizes) and warnings
  never carry a member's cap, veto or name.
- Budget increases happen only through an owner's explicit offer acceptance in
  the module. Parsing, planning, voting and the council never raise a cap.
