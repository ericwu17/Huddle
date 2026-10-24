# Huddle contract

> Section S5 of build-brief.md, with S5.5 written for SpacetimeDB. Maintained by Eric Chen. Read-only for everyone else: propose changes in the team channel.

## S5.1 Constants

**Feature order (K = 13).** Every vector (taste weights, place features) uses this exact order:

```
0 noise           (1 = very loud)
1 crowd           (1 = very crowded)
2 wait            (1 = long waits)
3 value           (1 = great value for money)
4 romance         (1 = very romantic)
5 service         (1 = great service)
6 outdoor         (1 = outdoor / open air)
7 novelty         (1 = unusual / new experience)
8 cuisine_asian
9 cuisine_latin
10 cuisine_mediterranean
11 cuisine_american
12 cuisine_cafe_dessert
```

Features 0-7 are "aspects" scored in [0,1]. Features 8-12 are 0/1 one-hot (activities have all zeros). A member's taste weight vector theta has the same order: a positive weight means "likes more of this", negative means "wants less". (Example: "somewhere quiet" = negative weight on noise.)

- **Categories:** meal, activity, dessert.
- **Default dwell times:** meal 75 min, activity 75 min, dessert 30 min.
- **Dietary tags:** vegetarian, vegan, gluten_free, halal, kosher.
  Apply dietary requirements to meals and desserts only. Activities do not need
  dietary tags and must not be excluded merely because those tags are empty.
- **Cuisine families:** asian, latin, mediterranean, american, cafe_dessert, none.
- **Time:** local time HH:MM 24h strings; dates ISO YYYY-MM-DD; timestamps in ms since epoch.
- **Default plan window for the demo:** Saturday 17:00-23:00 local.
- **IDs:** strings.
- **Money:** US dollars, per person. Each member's private `budgetMaxPerPerson`
  caps the sum across all stops in the outing. Null means uncapped; zero is a
  real cap. Parsing, planning, voting, council, and fallback paths cannot raise
  or remove an existing cap. Only that member explicitly accepting a current
  private trade offer may raise it.

## S5.2 Data shapes

**Place** (`data/places.json`, array):

```json
{
  "id": "p_001",
  "name": "Example Ramen House",
  "category": "meal",
  "cuisine": "asian",
  "address": "123 Example St, Berkeley, CA",
  "lat": 37.8715,
  "lng": -122.2730,
  "priceLevel": 2,
  "costPerPerson": 22,
  "dwellMinutes": 75,
  "phone": "+15105550123",
  "dietary": ["vegetarian"],
  "hours": {
    "mon": [["11:00", "21:30"]], "tue": [["11:00", "21:30"]], "wed": [["11:00", "21:30"]],
    "thu": [["11:00", "21:30"]], "fri": [["11:00", "22:30"]], "sat": [["11:00", "22:30"]],
    "sun": [["12:00", "21:00"]]
  },
  "aspects": {
    "noise":   {"mean": 0.60, "sd": 0.10},
    "crowd":   {"mean": 0.55, "sd": 0.12},
    "wait":    {"mean": 0.50, "sd": 0.12},
    "value":   {"mean": 0.70, "sd": 0.10},
    "romance": {"mean": 0.30, "sd": 0.12},
    "service": {"mean": 0.65, "sd": 0.10},
    "outdoor": {"mean": 0.10, "sd": 0.05},
    "novelty": {"mean": 0.40, "sd": 0.15}
  },
  "reviewCount": 312,
  "rating": 4.4,
  "sources": ["google", "brightdata"]
}
```

Rules: every aspect has mean and sd; missing data uses the category mean and sd 0.25. The server derives the 13-dim feature vector x (8 aspect means, then 5 cuisine one-hots).

**Hard constraints** (per member):

```json
{"vetoCuisines": ["asian"], "vetoCategories": [], "budgetMaxPerPerson": 30,
 "dietary": ["vegetarian"], "maxTravelMinutes": 25}
```

Any field may be null or empty. Veto cap: at most 2 total entries across vetoCuisines + vetoCategories; extras are dropped and reported in warnings.

**Posterior** (a member's taste belief, a Gaussian over theta):

```
{"mean": [0,0,0,0,0,0,0,0,0,0,0,0,0], "cov": [[1,0,...],[0,1,...], "... 13x13"]}
```

**Plan:**

```json
{
  "id": "plan_a1",
  "kind": "safe",
  "stops": [
    {"placeId": "p_001", "name": "Example Ramen House", "category": "meal",
     "start": "18:00", "end": "19:15", "lat": 37.8715, "lng": -122.2730, "costPerPerson": 22},
    {"placeId": "p_020", "name": "Example Arcade", "category": "activity",
     "start": "19:30", "end": "20:45", "lat": 37.8700, "lng": -122.2680, "costPerPerson": 12}
  ],
  "costPerPerson": 34,
  "robustness": 0.93,
  "perMember": [{"memberId": "m1", "ratioMean": 0.82, "ratioP10": 0.64}],
  "whyLine": "Sam gave up novelty; Jordan accepted a longer walk.",
  "gaveUp": [{"memberId": "m2", "feature": "novelty", "text": "novelty"}]
}
```

`kind` is safe, bold, or budget. `ratioMean` is a member's plan utility divided by their own best achievable (so 1.0 is their ideal, 0 their worst).

## S5.3 FastAPI endpoints (owner C; callers: SpacetimeDB jobs in `server/`)

Every request carries header `X-Huddle-Secret`. All endpoints are stateless: callers pass posteriors in. All return JSON. With `STUB_MODE=true`, each returns contract-shaped fake data.

**GET /health**

```
-> {"ok": true, "stub": false, "placesLoaded": 45}
```

**POST /parse-prefs**

```jsonc
// request
{"text": "vegetarian, under $30, somewhere quiet", "memberId": "m1"}
// response
{"hard": {"vetoCuisines": [], "vetoCategories": [], "budgetMaxPerPerson": 30, "dietary": ["vegetarian"], "maxTravelMinutes": null},
 "soft": [{"feature": "noise", "direction": -1, "confidence": "high"}],
 "posterior": {"mean": [...13], "cov": [[...13]x13]},
 "warnings": []}
```

**POST /elicit/next** (choose the next swipe pair)

```jsonc
// request
{"memberId": "m1", "posterior": {...}, "alreadySeen": [["p_001","p_004"]],
 "candidatePlaceIds": ["p_001","p_004"], "focusPlaceIds": ["p_001"]}
// response
{"a": "p_007", "b": "p_012", "category": "meal"}
```

**POST /elicit/update** (one swipe -> new posterior)

```jsonc
// request
{"posterior": {...}, "winnerPlaceId": "p_007", "loserPlaceId": "p_012"}
// response
{"posterior": {...}}
```

**POST /plan**

```jsonc
// request
{"runId": "run_1", "date": "2026-10-24", "window": {"start": "17:00", "end": "23:00"},
 "members": [{"memberId": "m1", "name": "Alex", "posterior": {...}, "hard": {...},
              "origin": {"lat": 37.87, "lng": -122.27}}],
 "excludePlaceIds": [],
 "options": {"samples": 300, "tau": 0.6, "topK": 60, "preview": false}}
// response
{"runId": "run_1",
 "plans": [ Plan, Plan, Plan ],
 "pareto": [{"planId": "plan_a1", "meanRatio": 0.84, "minRatio": 0.71, "robustness": 0.93}],
 "posteriorSummary": [{"memberId": "m1", "features": [{"name": "noise", "mean": -1.1, "sd": 0.4}]}],
 "stats": {"candidatePlans": 24000, "feasiblePlans": 6100, "samples": 300, "elapsedMs": 850},
 "relaxationHints": [],
 "warnings": []}
```

`excludePlaceIds` removes those places from the candidate set (used by the re-plan loop).
`preview: true` uses the same response envelope and Plan shape, with `plans`
containing at most one Safe plan, `pareto: []`, and no compromise explanations.
The confidence ring reads `plans[0]?.robustness ?? 0`. A real implementation uses
fewer samples (100); the synthetic stub honestly reports `stats.samples: 0` and
labels confidence as canned. No feasible plan means `plans: []` for either mode.

**POST /offers** (private trade offers; same body as /plan plus `baselinePlanId`)

```json
{"offers": [{"offerId": "o1", "toMemberId": "m3", "type": "budget", "amount": 7, "unit": "usd",
             "plan": Plan, "robustnessGain": 0.08, "minRatioGain": 0.07}]}
```

`type` is budget or travel (`unit` usd or min). Never include who benefits.

**POST /roulette**

```
{"plans": [{"id": "plan_a1", "robustness": 0.93}], "seed": 7} -> {"planId": "plan_b2", "weights": {"plan_a1": 0.5}}
```

**POST /council** (called by the council job after the scout job; this is where the agents live)

```jsonc
// request
{"runId": "run_1",
 "plans": [ Plan, Plan, Plan ],
 "pareto": [ ... ],
 "members": [{"memberId": "m1", "name": "Alex", "posterior": {...}, "hard": {...}, "origin": {"lat": 37.87, "lng": -122.27}}],
 "scoutFacts": [{"placeId": "p_001", "openNow": true, "vegetarianOptions": true, "checkedAt": 1761350000000, "source": "brightdata", "cached": false}],
 "options": {"rounds": 2, "showWho": false, "seed": 7}}
// response
{"runId": "run_1", "chosenPlanId": "plan_a1", "rationale": "...", "fallbackUsed": false,
 "agreesWithSolver": true, "messages": [CouncilMessage], "elapsedMs": 7400}
```

**Rules (these are the point of the design):**

1. **Acceptable set** = the three named plans in `plans` (they already clear the robustness floor). The chair may recommend only one of them.
2. **Each advocate sees only its own person.** Tools are built from that member's own posterior and constraints and return derived numbers only, never raw caps or vetoes:
   - `my_score(planId) -> {ratioMean, ratioP10, belowFloor}`
   - `my_dealbreakers(planId) -> {budgetSlackUsd, travelSlackMin}` (how much room is left before a hard limit)
   - `my_slack() -> {maxBudgetStretchUsd, maxTravelStretchMin}`
   - `plan_facts(planId)` (public) `-> {costPerPerson, stops, legMinutes, scout}`
3. **Rounds:** Round 1 (four advocates in parallel), then Round 2 (same four, now reading the full transcript), then the chair. Each advocate returns JSON: `{"stance": {"<planId>": "support"|"accept"|"oppose"}, "argument": "<= 40 words", "cited": [{"tool": "my_score", "field": "ratioMean", "value": 0.82}]}`. The chair returns `{"chosenPlanId": "...", "rationale": "<= 60 words", "cited": [...]}`.
4. **Validator (our code):** every number in a message must match a value in that speaker's tool outputs or the public facts (small tolerance); the chosen plan must be in the acceptable set; no message may contain a member's name unless `showWho` is true. An invalid advocate message is dropped and logged. An invalid chair message, a pick outside the set, or a chair timeout sets `fallbackUsed: true` and `chosenPlanId` = the Safe plan.
5. **No user free text enters any council prompt.** Only structured values (tool outputs, plan facts, enums).
6. **Labels:** when `showWho` is false (default), advocates are "Advocate A/B/C/D", shuffled by the seed each run, and names are stripped from text.
7. **Delivery:** phase-zero council returns the transcript in `messages`; the
   caller persists/replays it. `X-Huddle-Stub: true` identifies a synthetic HTTP
   response and must be preserved as the run's `stub` flag. A future live adapter
   may POST validated messages to
   `{SPACETIMEDB_URI}/v1/database/{SPACETIMEDB_DB}/route/council-message` with
   `X-Huddle-Secret`. Response ingestion and callbacks deduplicate by run, round,
   speaker, and member identity so the same transcript is stored once.
8. **Latency:** target 10 s total; hard 8 s timeout per call. A timed-out advocate is skipped for that round.

**CouncilMessage** (what SpacetimeDB stores and the UI shows):

```json
{"runId": "run_1", "round": 1, "speaker": "advocate", "label": "Advocate B", "memberId": "m2",
 "planId": null, "stance": {"plan_a1": "support"}, "text": "Plan A keeps me well inside my limits.",
 "cited": [{"tool": "my_score", "field": "ratioMean", "value": 0.82}], "ts": 1761350000000}
```

`round` is 1, 2, or 3 (3 = chair). `memberId` is stored but never returned by public queries unless `showWhoCompromised` is true. `speaker` is advocate or chair.

## S5.4 Voice endpoints (owner D)

**POST /book** (called by the call job in `server/`)

```jsonc
// request
{"bookingId": "b1", "placeId": "p_001", "restaurantName": "Example Ramen House",
 "restaurantPhone": "+15105550123", "partySize": 4, "time": "2026-10-24T18:00:00-07:00",
 "nameOnReservation": "Alex", "alternativeWindow": {"earliest": "17:30", "latest": "19:30"}, "language": "zh"}
// response
{"accepted": true, "bookingId": "b1"}
```

In demo mode the service dials `DEMO_RESTAURANT_PHONE` only and refuses any other number unless `ALLOW_REAL_CALLS=true`. Twilio-facing routes: `POST /twiml/{bookingId}`, `WS /ws/{bookingId}`, `POST /status`.

**Call events** (voice posts to `POST {SPACETIMEDB_URI}/v1/database/{SPACETIMEDB_DB}/route/call-event`, header `X-Huddle-Secret`):

```json
{"bookingId": "b1", "type": "dialing", "text": null, "slot": null, "ts": 1761350000000}
```

`type` is one of: `dialing`, `connected`, `transcript` (with `text`, `speaker` of agent or restaurant, and optional `textEn` English translation and `lang`), `slot_offered` (with `slot` like "19:45"), `confirmed` (with `slot`), `failed` (with `reason` one of full, closed, no_answer, refused, error, and optional `text`), `ended`.

## S5.5 SpacetimeDB module (owner B; A owns `server/src/geo.ts` and `server/src/replan.ts`; consumed by A, B, C, D)

Module: `server/` (TypeScript, `spacetimedb` 2.13.0). Database name `huddle-dev` locally. Clients see **snake_case** names (a function exported as `submitSwipe` is called as `submit_swipe`; columns too).

**Identity replaces memberId + secret.** Each phone connects with its own SpacetimeDB Identity; the SDK keeps the token in local storage. Every reducer acts on the caller's own membership, so no call takes a `memberId` or `secret`. A phone's "current group" is the group it most recently joined, else the one it most recently created.

**Tables** (all private): group, member, private_prefs, swipe, plan_run, offer, vote, booking, call_event, council_message, scout_check, geo_cache, plus one schedule table per background job (`*_job`). Contract objects owned by the api (hard, posterior, plan results, council result) are stored as JSON strings in `*Json` columns; parse them on the client.

**Views** (public, subscribable, each scoped to the caller's own group). Privacy rules are enforced here:

- `my_group` -> `{id, code, status, date, window_start, window_end, demo_mode, show_who_compromised, confidence?, latest_run_id?, replan_for?, is_host, my_member_id?}`
- `my_members` -> `[{id, name, ready, swipe_count}]`. Never private prefs.
- `my_private` -> the caller's own `{member_id, text, hard_json?, warnings_json, posterior_summary_json?, next_pair_a?, next_pair_b?, next_pair_category?, swipe_count}`. Only the owner ever sees this row.
- `my_offers` -> open offers addressed to the caller on the latest run. Never says who benefits.
- `my_plan_runs` -> `[{run_id, status, result_json?, council_json?, roulette_json?, error?, stub, created_at}]`. `result_json` has `perMember`, `gaveUp` and `posteriorSummary` removed unless `show_who_compromised`.
- `my_council_messages` -> CouncilMessage rows (S5.3) in insert order; `member_id` removed unless `show_who_compromised`.
- `my_scout`, `my_votes`, `my_bookings`, `my_call_events`.

**Procedures callable by phones** (they return values):

- `create_group(name: Option<String>) -> {groupId, code}`. The creator is the host; they still `join_group` to take part.
- `join_group(code, name) -> {memberId, groupId}`
- `do_roulette(run_id) -> {planId}`

**Reducers callable by phones:** `set_ready()`, `set_origin(lat, lng)`, `submit_prefs(text)`, `submit_swipe(winner_place_id, loser_place_id)`, `vote(run_id, plan_id)` (one per member per run, re-voting overwrites), `accept_offer(offer_id)`, `decline_offer(offer_id)`, `start_booking(run_id, plan_id, stop_index)`, `set_demo_mode(on)`, `set_show_who_compromised(on)`. STRETCH: `answer_slot(booking_id, accept)`.

Status flow: `lobby` -> `eliciting` (2+ members, all ready) -> `planned` (stopping rule: confidence >= 0.9 and everyone has >= 4 swipes, or everyone hit 12) -> `voting` -> `booked`.

**Private jobs** (scheduled procedures; the host marks them private so phones cannot call them): parse, swipe (calls /elicit/update then /elicit/next), preview (debounced 1.5 s; /plan with `preview: true`), plan, offers, scout, council, voting cap, call, fake-event replay. Each calls the api with `X-Huddle-Secret`. With `FASTAPI_BASE_URL` / `VOICE_BASE_URL` unset, the module uses canned fakes (`server/src/lib/fakes.ts`).

**HTTP routes** (header `X-Huddle-Secret` required; SpacetimeDB does not authenticate routes, so the module does). Base `{SPACETIMEDB_URI}/v1/database/{SPACETIMEDB_DB}/route`:

- `GET /health -> {"ok": true, "stub": bool, "placesLoaded": n}`
- `POST /call-event` (from voice), body = call event (S5.4)
- `POST /council-message` (from api), body = CouncilMessage (S5.3)

Paths are lowercase (SpacetimeDB requires it). 401 on a bad secret, 400 on a bad body.

**Pipeline after enough swipes** (B owns the wiring):

1. The plan job finishes, then the offers job and the scout job run in parallel (scout falls back to `data/scout_cache.json` and marks rows `cached`).
2. Scout schedules the council job (skipped if `COUNCIL_ENABLED=false`). The UI shows plans immediately and council messages as they arrive. If the council fails, the Safe plan is used with `fallbackUsed: true`.
3. When the council finishes or 12 s pass (voting-cap job), `status = 'voting'`. The vote never waits on the council.

**Re-plan loop:**

1. The `/call-event` route stores every event. On `failed` with reason `full` or `closed`, it inserts a row into `replan_job {groupId, bookingId}`.
2. A's `server/src/replan.ts` defines `spacetimedb.procedure({ onSchedule: replan_job }, ...)` (or a reducer). It adds the booking's placeId to `group.excludedPlaceIds`, calls `startRun(tx, groupId)` from `plans.ts` (which runs plan, offers, scout and council on its own), and sets `group.replanFor = bookingId`. A also exports it from `server/src/index.ts` (tell B).
3. The UI shows "That place is full. New plan ready" with a one-tap "Call again" (`start_booking`, which clears `replan_for`). Never auto-call. Other reasons (no_answer, refused, error) do not replan.

**Env (set at publish; shell values for declared keys are picked up automatically):** `HUDDLE_SHARED_SECRET`, `FASTAPI_BASE_URL`, `STUB_MODE`, `VOICE_BASE_URL`, `COUNCIL_ENABLED`, `AGENT_LANGUAGE`, `STUB_SCENARIO` (fake call: `confirm` or `full`). Update without rebuilding: `spacetime publish huddle-dev --env-only`.

`STUB_MODE` defaults to true in the module and API. Stub candidates share
`api/fixtures/places.fake.json`; `data/places.json` remains intact for the later
real-data mode. Frontend place lookups resolve synthetic, real, and legacy IDs.
Do not set `STUB_MODE=false` until the real Python service is implemented.

**Auth model** (hackathon grade, state this honestly): each phone's SpacetimeDB identity token sits in the browser's local storage; whoever has the token is that member. Service-to-module calls use the shared `X-Huddle-Secret`. This is not production security.
