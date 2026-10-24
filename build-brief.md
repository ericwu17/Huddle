# HUDDLE: MASTER BUILD BRIEF v2 (Cal Hacks 13.0, Oct 23-25, 2026)

## Current direction override October 24

Read [docs/CURRENT_CONTEXT.md](docs/CURRENT_CONTEXT.md) first. It supersedes
conflicting product, math, role and hosting requirements below. Hacking has
started. The target is a huddle coordinator agent holding all current members'
submitted prompt context, proposing and explaining outings, with deterministic
budget, dietary/allergy, venue and stale-result validation in code. Retire the
Bayesian/Monte Carlo/swipe-ranking path from the new core flow after a coordinated
contract migration; it remains available for legacy groups. New huddles in the
updated frontend use the approved single-coordinator flow. Do not fabricate numeric
scores or silently change shared request/response shapes.

Keep separate Vite and FastAPI processes for local development. For this phase,
keep Vercel + SpacetimeDB Maincloud + local FastAPI behind a tunnel, accepting
the designated host laptop's availability dependency temporarily. The previous
all-local database-to-API design is blocked on SpacetimeDB 2.13.0 private-address
HTTP restrictions. Hosted API migration is deferred; Render preparation is not
deployed. See [the approved agent flow](docs/AGENT_FLOW_PLAN.md), additive
[contract](docs/AGENT_CONTRACT.md) and [runbook](docs/AGENT_RUNBOOK.md).
UI polish and Bright Data scraping/catalog integration are active next work;
accounts remain staged. See [NEXT_TASKS.md](docs/NEXT_TASKS.md). The original
phases and gates below are historical planning context.

## How to use this document (for the humans)

Paste this whole document into one Google Doc, or keep the .md file. Claude Code reads either.

At kickoff, each teammate opens their own Claude Code session in their own folder and pastes TWO things:

- PART S (shared, everyone), and
- their own part: PART A (Haydn), PART B (Eric Chen), PART C (Max), or PART D (Eric Wu). The roles are proposed, and parts follow roles, so swap names freely.

PART T is for humans only. Do not paste it into Claude Code.

First prompt for each Claude Code session: "Read the pasted brief. Confirm the event has started, then do the first phase of my part. Stop and ask me at every gate."

A brief cannot make four AI sessions run perfectly. You still steer, run the smoke test often, and fix drift between parts. The brief's job is to make the parts fit together.

## What changed from v1

- Roles re-cut. A is now data, routing, and glue, with a bare-bones UI first and polished screens later. Frontend is shared three ways: A (core screens), B (council panel), D (call screen).
- Added: an agent council (four advocates plus a chair), a scout check (Bright Data live check on each plan's restaurant), a re-plan loop (if the restaurant is full, plan again), and voting among the top plans.
- Bright Data replaces Apify and Yelp for reviews. Google Places stays for coordinates, hours, and phone numbers.
- The voice agent speaks Mandarin and understands Cantonese.
- Not used: Wajo, Factory, Grok multi-agent, Apple Wallet (needs a paid Apple Developer certificate). Fetch.ai only if the booth confirms a real prize, decided at the H19 gate.

---

# PART S: SHARED (everyone pastes this)

> Start with [CURRENT_CONTEXT.md](docs/CURRENT_CONTEXT.md). The shared sections
> below preserve the legacy implementation specification. New work targets
> group prompt context and agent-led planning with code-enforced hard constraints;
> historical math phases and the single-laptop proposal are superseded. Existing
> wire contracts remain active until the coordinated migration is agreed.

## S0. Rules for Claude Code (read first, obey always)

1. **Do not start before the event.** If the current time is before the official Cal Hacks 13.0 hacking start (Friday Oct 23, 2026, evening, PDT), write no project code. Answer questions only and tell the human to paste this again at kickoff. All work must be done during the hackathon.
2. **Never run git commit, git push, git init, gh, or create or modify any GitHub repo, PR, issue, or remote.** The human does all commits and pushes by hand. When your work reaches a good state, say "ready to commit" and list the files.
3. **Never publish or deploy anything** (no Vercel/Vultr deploys, no public pages, no sharing links) unless the human explicitly asks in that message. Local runs and tunnels the human asks for are fine.
4. **Stay inside your own folder** (see S3). Never edit another person's folder. If you need a change to the contract (S5) or another part, stop and tell the human exactly what to post in the team channel. Do not silently change shared shapes.
5. **Secrets:** never write a key, token, or phone number into a tracked file. Keys live in `.env` (gitignored) or are set at `spacetime publish` time. Create and maintain `.env.example` with names only. Never print a full key.
6. **Stubs first.** Within the first 2 hours of the event, every endpoint or function in your part must exist and return fake but contract-shaped data. The team wires everything together on fake data before anyone implements for real. Swap one stub for the real thing at a time, then re-test the whole flow.
7. **Keep dependencies minimal.** Prefer what is already in the stack (S4). Ask before adding a new service, API, or large library.
8. **Timebox.** If you are stuck on one problem for more than 45 minutes, stop and propose: (a) cut it, (b) swap for something simpler, or (c) fake it with disclosure, and add it to the honesty list (S6).
9. **Do not add features.** Only build what your part lists. New ideas go to the human's parking lot.
10. **Verify API details against current docs** (SDK class names, endpoints, model strings, field masks change). This brief gives intent and shapes, not guaranteed signatures.
11. **Honesty:** anything cached, seeded, simulated, or hardcoded must be marked in code comments and listed in `docs/HONESTY.md` (owner: B) so the team can disclose it.
12. **Disclosure:** record every library, API, and AI tool used in `docs/DISCLOSURE.md` (owner: B). Cal Hacks requires disclosure.
13. **Work in small, testable steps.** After each step, run something (curl, a script, the dev server) and show the human the result.

## S1. What Huddle is

**One sentence:** Everyone in the group chat says what they want, and the AI finds a plan nobody hates, has agents argue it out, then books it by phone.

**The user:** a group of friends or a couple (3-5 people) who can't decide where to go. Origin story: "I can never think of a date idea with my girlfriend."

**What it does, in order:**

1. **Join.** A host creates a group and shows a QR code. Teammates scan and join on their own phones.
2. **Private preferences.** Each person types what they want ("no sushi, under $30, somewhere quiet") and swipes "this or that" place cards. Preferences are private: the others never see them.
3. **Plan.** The solver finds three plans (dinner, activity, dessert) on a map with cost, timing, and walking routes: Safe (most robustly fair), Bold (more novel), Budget (cheapest).
4. **Confidence.** The app keeps asking for swipes until the best plan is robust, and shows a confidence ring. It reports how sure it is: "In 93% of plausible tastes, nobody is below 60% of their ideal."
5. **Trade offers (privately).** If a better plan exists that requires one person to stretch a limit (budget or travel time), the app privately offers it only to that person: "Stretch your budget by $7 for a plan the group would like better?" It never says who benefits.
6. **Consensus Map.** A scatter of all candidate plans with a fairness dial that slides between "maximize total happiness" and "protect the unhappiest person". The chosen plan changes live as the dial moves.
7. **Scout.** Before anyone votes, each plan's restaurant is checked live through Bright Data (open now? vegetarian options?). A badge shows what was found, or "Checked earlier" if a cached result was used.
8. **Council.** Four advocate agents (one per person, each seeing only that person's numbers) argue in two rounds over the three plans. A chair agent recommends one. The messages stream on screen. The chair can only pick one of the three plans the solver approved; anything invalid falls back to Safe.
9. **Vote or roulette** among the three plans. The council's pick is highlighted, not forced. If tied, a roulette weighted by robustness decides (it can never pick a vetoed plan).
10. **Book by phone.** A voice agent phones the restaurant (in the demo: a teammate playing the restaurant), speaks Mandarin, understands Cantonese, identifies as an AI, and books. A live transcript and a confirmation card appear.
11. **Re-plan loop.** If the restaurant says it is full or closed, the app excludes it, plans again, and shows a replacement with a one-tap "Call again". It never calls without a human tap.

**Demo group (seeded, for reproducibility):**

| Member | Says |
| --- | --- |
| Alex | "vegetarian, under $30, somewhere quiet" |
| Sam | "no sushi, I love trying new places" |
| Jordan | "broke this month, nothing over $20, outdoors if possible" |
| Riley | "romantic vibe, I don't care about price" |

**Pitch line:** "Huddle doesn't just pick for you. It finds the trade each friend would actually accept, privately, then books it."

## S2. Locked decisions (do not reopen)

- **Name:** Huddle.
- **Area:** Berkeley only for v1, about 45 places: 20 meals, 15 activities, 10 desserts. Optional "area packs" (more of the Bay Area, chosen from members' origins, prefiltered to about 25 places per category) only after the H19 gate is green and only by people who are otherwise idle.
- **Realtime and state:** SpacetimeDB (TypeScript module in `server/`). **Solver and council:** Python FastAPI. **Voice:** Pipecat + Twilio + Cartesia, separate Python service.
- **Scraping:** Bright Data (Google Maps reviews scraper and datasets) behind one adapter interface (`data/reviews/source_*.py`). Google Places API (New) for coordinates, price level, hours, and phone numbers. Yelp and Apify are not used; Apify is only an optional second source behind the same adapter.
- **Council:** four advocate agents and one chair agent, built as plain model calls (one orchestrator, a shared transcript, two rounds). Each role is a plain function behind one `llm_call` adapter so the model or transport can be swapped in about an hour. Advocates use `CLAUDE_MODEL_FAST`, the chair uses `CLAUDE_MODEL_SMART`. The validator, the acceptable set, and the Safe fallback live in our own code; no agent can override them. A Fetch.ai wrapper is built only if the booth confirms a real prize for 13.0, decided at the H19 gate.
- **Voice language:** the agent speaks Mandarin and understands Cantonese. No Spanish.
- **Included:** Bayesian preference model, active swipe selection, Monte Carlo robustness, three named plans, trade offers, Consensus Map with fairness dial, scout check, agent council, voting among the top plans, voice booking, re-plan loop, evaluation scripts.
- **Stretch** (only if ahead, built before the H24 freeze, first to cut): live slot approval during the call, language lock on the first "hello", live English translation line in the transcript, per-turn latency display, a distinct Cartesia voice per advocate, calendar (.ics) export of the confirmed plan.
- **Not included (do not build):** negotiation animation, multi-party cryptography, accounts/login, photo memories, payments or bill splitting, iMessage, AR/glasses, blockchain, model training, multi-day trips, Wajo, Factory, Grok multi-agent, Apple Wallet passes.

## S3. Repo layout and ownership

```
huddle/
  README.md                 (B)
  .gitignore  .env.example  (B)
  scripts/
    smoke.mjs               (A)  end-to-end smoke test
  docs/
    CONTRACT.md             (copy of S5; B maintains; read-only for everyone else)
    HONESTY.md              (B)
    DISCLOSURE.md           (B)
    BRIGHTDATA.md           (A)  how we call Bright Data (product, endpoint, params, latency)
    experiments/            (B)  simulation scripts, charts, numbers
  server/                   (B)  SpacetimeDB module: tables, views, reducers, procedures, HTTP routes
    src/geo.ts              (A)  Mapbox procedures: routeGeometry, legTimes, isochrone
    src/replan.ts           (A)  the re-plan job (S5.5)
  web/                      (A)  Vite + React app (TypeScript)
    src/module_bindings/    (generated from server/ by `npm run generate`; never edit by hand)
    src/components/council/ (B)  council panel UI
    src/components/call/    (D)  live call screen UI
  data/
    fetch_places.py, places.base.json, places.fake.json,
    demo_group.json, cached_run.json, scout_cache.json   (B)
    reviews/                (A)  Bright Data adapter, extraction, aggregation, build script
    places.json             (written once by B as v1, then only by A's build script)
  api/                      (C)  FastAPI solver + council service
    eval/                   (C)  latency and determinism checks
  voice/                    (D)  Pipecat/Twilio voice service
```

**Ownership is strict:**

- **A** = `web/` except `web/src/components/council/`, `web/src/components/call/`; plus `server/src/geo.ts`, `server/src/replan.ts`, `data/reviews/`, `data/places.json` (after v1), `scripts/`, `docs/BRIGHTDATA.md`.
- **B** = `server/` (except `geo.ts` and `replan.ts`), `web/src/components/council/`, `docs/` (except `BRIGHTDATA.md`), root files, and the `data/` files listed under B.
- **C** = `api/`.
- **D** = `voice/` and `web/src/components/call/`.

Cross-folder needs go through the human.

## S4. Stack and environment

- **Web (A, B, D):** Vite, React 19, React Router 7 (data mode, `createBrowserRouter`), TypeScript, Tailwind CSS 4, qrcode.react, Mapbox GL JS, oxlint. Env names keep the `NEXT_PUBLIC_` prefix (`vite.config.ts` accepts it). Realtime via the `spacetimedb/react` hooks (`useTable`, `useReducer`, `useProcedure`) on bindings generated from `server/`.
- **SpacetimeDB (B, plus A's geo.ts and replan.ts):** a `spacetimedb` 2.13.0 TypeScript module: tables, views, reducers, procedures (outbound HTTP), schedule tables, HTTP routes. Server secrets are env keys the module declares, set at `spacetime publish` time.
- **API (C):** Python 3.11+, FastAPI, uvicorn, pydantic v2, numpy, the anthropic SDK, httpx.
- **Data:** Python scripts. Bright Data for reviews (A). Google Places API (New) for place basics (B). Claude for review aspect extraction (A).
- **Voice (D):** Python, FastAPI, Pipecat (extras for Twilio, Silero VAD, speech-to-text, Cartesia, Anthropic; check the Pipecat docs for exact names), Twilio Programmable Voice with Media Streams. Speech-to-text: test Cartesia Ink-Whisper (supports zh and yue) against Deepgram Nova-3 (Mandarin and zh-HK Cantonese) and keep whichever is more accurate; set one language per call. Text-to-speech: Cartesia Sonic with a Mandarin voice (Cantonese speech is not listed, so the agent answers in Mandarin). Verify all of this against current docs.
- **Models:** `CLAUDE_MODEL_FAST=claude-haiku-5-5` (parsing, advocates, voice dialogue), `CLAUDE_MODEL_SMART=claude-sonnet-5-5` (review extraction, council chair). Confirm current model strings at docs.claude.com before use.

**Environment variable names** (values never go in files):

```
HUDDLE_SHARED_SECRET        shared by the SpacetimeDB module, api, voice (header X-Huddle-Secret)
SPACETIMEDB_URI             SPACETIMEDB_DB         (api and voice POST to {SPACETIMEDB_URI}/v1/database/{SPACETIMEDB_DB}/route/...)
NEXT_PUBLIC_SPACETIMEDB_URI NEXT_PUBLIC_SPACETIMEDB_DB
NEXT_PUBLIC_MAPBOX_TOKEN    MAPBOX_TOKEN (server)
FASTAPI_BASE_URL            VOICE_BASE_URL         PLACES_PATH
ANTHROPIC_API_KEY           CLAUDE_MODEL_FAST      CLAUDE_MODEL_SMART
GOOGLE_PLACES_API_KEY       BRIGHTDATA_API_KEY     BRIGHTDATA_* (zone or dataset ids, per their docs)
TWILIO_ACCOUNT_SID          TWILIO_AUTH_TOKEN      TWILIO_PHONE_NUMBER
DEMO_RESTAURANT_PHONE       ALLOW_REAL_CALLS (default false)
CARTESIA_API_KEY            CARTESIA_VOICE_ID      STT_PROVIDER (cartesia|deepgram)   STT_API_KEY
AGENT_LANGUAGE (default zh) COUNCIL_ENABLED (default true)
STUB_MODE (api and voice: true returns canned data)
```

## S5. THE CONTRACT (all parts must follow this exactly)

### S5.1 Constants

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
- **Cuisine families:** asian, latin, mediterranean, american, cafe_dessert, none.
- **Time:** local time HH:MM 24h strings; dates ISO YYYY-MM-DD; timestamps in ms since epoch.
- **Default plan window for the demo:** Saturday 17:00-23:00 local.
- **IDs:** strings.
- **Money:** US dollars, per person. Each user sets a private cumulative budget for the entire outing. `budgetMaxPerPerson` limits the sum of `costPerPerson` across all stops, not the cost of each stop separately. A null budget means no budget cap. Only that user's explicit acceptance of a private budget trade offer may raise their cap.

### S5.2 Data shapes

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

### S5.3 FastAPI endpoints (owner C; callers: SpacetimeDB jobs in `server/`)

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

`excludePlaceIds` removes those places from the candidate set (used by the re-plan loop). `preview: true` skips pareto, explanations, and offers, uses fewer samples (100), and returns only the top plan's robustness (used for the confidence ring).

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
7. **Streaming:** each message is POSTed to `POST {SPACETIMEDB_URI}/v1/database/{SPACETIMEDB_DB}/route/council-message` (header `X-Huddle-Secret`) as soon as it passes validation.
8. **Latency:** target 10 s total; hard 8 s timeout per call. A timed-out advocate is skipped for that round.

**CouncilMessage** (what SpacetimeDB stores and the UI shows):

```json
{"runId": "run_1", "round": 1, "speaker": "advocate", "label": "Advocate B", "memberId": "m2",
 "planId": null, "stance": {"plan_a1": "support"}, "text": "Plan A keeps me well inside my limits.",
 "cited": [{"tool": "my_score", "field": "ratioMean", "value": 0.82}], "ts": 1761350000000}
```

`round` is 1, 2, or 3 (3 = chair). `memberId` is stored but never returned by public queries unless `showWhoCompromised` is true. `speaker` is advocate or chair.

### S5.4 Voice endpoints (owner D)

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

### S5.5 SpacetimeDB module (owner B; A owns `server/src/geo.ts` and `server/src/replan.ts`; consumed by A, B, C, D)

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

**Env (set at publish; shell values for declared keys are picked up automatically):** `HUDDLE_SHARED_SECRET`, `FASTAPI_BASE_URL`, `VOICE_BASE_URL`, `COUNCIL_ENABLED`, `AGENT_LANGUAGE`, `STUB_SCENARIO` (fake call: `confirm` or `full`). Update without rebuilding: `spacetime publish huddle-dev --env-only`.

**Auth model** (hackathon grade, state this honestly): each phone's SpacetimeDB identity token sits in the browser's local storage; whoever has the token is that member. Service-to-module calls use the shared `X-Huddle-Secret`. This is not production security.

## S6. Demo mode, fallbacks, and the honesty list

**Demo mode** (`groups.demoMode = true`): uses cached data and cached plan results so the demo works with bad Wi-Fi. Show a small, honest "Demo mode: cached data" label in the UI.

**Degradation ladder:**

| If this fails | Fall back to |
| --- | --- |
| LLM unavailable | keyword parser in /parse-prefs |
| Bright Data or Google Places unavailable | `data/places.json` (cached) |
| Scout unavailable | `data/scout_cache.json`, badge says "Checked earlier" |
| Council unavailable or invalid | skip it, highlight the solver's Safe plan with its whyLine |
| Mapbox unavailable | straight lines and haversine times |
| FastAPI unreachable | cached run at `data/cached_run.json` |
| Voice unavailable | a labeled recording of a real earlier call, played by the UI |

The UI pings /health and switches to demo mode automatically.

**Honesty list items to maintain in `docs/HONESTY.md`:** cached place dataset; seeded demo group; restaurant is a teammate; the "we're full" reply in the re-plan demo is scripted; any cached/recorded fallback (including scout results); synthetic data in evaluations; any scraped data (Bright Data, terms checked); council messages are generated by AI under a validator.

## S7. Gates (every part must hit these; stop and ask the human)

Hours are from the real hacking start. H0 is assumed to be Fri 9:00 PM; shift if different.

- **H2:** every endpoint/function (including /council, the council job, /council-message, voice /book) exists as a stub returning contract-shaped fakes; `scripts/smoke.mjs` passes on fakes end to end.
- **H13 (L1 "works"):** four phones join from a QR code, free text parses, a plan appears on the map with cost and timing, voting works (a bare-bones UI is fine). The stubs-to-real flip (`FASTAPI_BASE_URL`, `STUB_MODE=false`) is done and the smoke test still passes.
- **H19 (L2 "smart"):** swipe loop with confidence, three named plans with robustness %, places.json v2 with review scores, Mapbox leg times, one evaluation chart in progress. Go/no-go decisions at this gate: council, Fetch.ai wrapper, live voice vs recording.
- **H24 (L3 "impressive") then FEATURE FREEZE:** trade offers, scout badge, council streaming, polished ring/cards/Consensus Map, voice scenarios S1-S3 passing (or fallback chosen), re-plan loop works once, demo click path written down.
- **After H24:** no new features. Only demo-path fixes, video, README, pitch.

---

# PART A: DATA / ROUTING / GLUE + CORE SCREENS (Haydn; paste S + this)

You are the integrator. You own: `web/` UI except `web/src/components/council/` and `web/src/components/call/`; plus `server/src/geo.ts`, `server/src/replan.ts`, `data/reviews/`, `data/places.json` (after B writes v1), `scripts/`, and `docs/BRIGHTDATA.md`. You make the parts fit together and catch drift early. The frontend is deliberately not your whole job: a bare-bones UI goes up first, and polished screens come later.

## A1. Your jobs, in order

1. Check the contract across all four services and write the smoke test (H0-2).
2. Bare-bones UI, hard timebox 3 hours (H2-5).
3. Review pipeline with Bright Data, producing places.json v2 (H9-15).
4. Mapbox route and leg-time actions, and the replan action (H15-19).
5. Polished screens, pass 1 (H19-24).
6. After freeze: demo video and pitch lead.

## A2. Smoke test (scripts/smoke.mjs)

A Node script against the live SpacetimeDB database (use the generated TypeScript bindings; one connection per simulated phone, since each identity is one member). Steps, printing PASS or FAIL for each:

1. create_group, then join_group four times (use `data/demo_group.json`).
2. set_ready and submit_prefs for each, then submit_swipe until the group is planned (stub or real).
3. The plan run finished: three plans, contract-shaped.
4. Council messages present for the run (stub or real); scout present.
5. vote four times; start_booking in stub mode; the call events end in `confirmed`.
6. Re-plan check: trigger a `failed` event with `reason: "full"` (stub scenario) and confirm a new run excluding that place appears.

Run it at H2, H8, H13, then every 2 hours. When it fails, work out which part drifted and tell the human exactly what to post to whom. Do not fix other people's folders.

## A3. Bare-bones UI (H2-5): what to build

Six screens, plain Tailwind with the shared `.btn` / `.input` / `.card` classes in `web/src/index.css`, no custom design tokens, no animation, 390px width, light mode. Ugly is fine; working is mandatory.

1. **Home and join:** "Start a huddle" (createGroup), "Join with code", the QR code of `{origin}/join/{code}` (qrcode.react), the big 4-letter code.
2. **Lobby:** member chips, ready state, host-only "Everyone's in".
3. **Preferences:** one text box, a note "Only you see this." (submitPrefs).
4. **Swipe:** card pairs from `myPrivate.nextPair`, two buttons (submitSwipe). Confidence as plain text, for example "62%".
5. **Plans:** three plan cards (name, robustness %, cost, stops) and a Mapbox map with markers (no route line yet).
6. **Vote:** a button per plan, live counts (vote).

Start with static fake JSON (`data/places.fake.json`, copied by the human), then the real SpacetimeDB views. At H5 whatever works ships. Everything else waits for polish. Never show another member's private data. Respect `showWhoCompromised`.

## A4. Review pipeline (data/reviews/) (H9-15)

**Adapter:** `source_brightdata.py` implements `fetch_reviews(place) -> [Review]` using Bright Data's Google Maps reviews scraper. Verify product names, endpoints, and parameters in current Bright Data docs. Use the asynchronous trigger-and-poll flow for the batch of about 45 places; the synchronous call is for single URLs. Keep the boundary clean (`source_*.py`) so a second source can be dropped in later. Cache raw output in `data/raw/` (gitignored). Check Bright Data's terms; this is a hackathon prototype; disclose it.

**docs/BRIGHTDATA.md (by H13):** write down which product you used, the exact endpoint and parameters, a sample response, typical latency, and per-record cost, so B can build the live scout check (runScout) from it.

**Spike first:** run extraction on 20 real reviews and report whether the JSON is consistent.

The three pipeline steps below follow the original design (extraction with evidence offsets, recency-weighted shrinkage aggregation, validated build):

3. **extract_aspects.py** (offline batch, ~10 reviews per Claude call, `CLAUDE_MODEL_SMART`): strict JSON per review:

   ```json
   {"reviewId": "r1", "aspects": {"noise": {"value": 1, "evidence": [12, 40]}, "wait": {"value": null}}}
   ```

   `value` in {-1, 0, 1, null}: +1 means the review indicates HIGH of that aspect (loud, crowded, long wait, great value, romantic, great service, outdoor, novel), -1 LOW, 0 neutral, null not mentioned. `evidence` is character offsets into the review text and is required when value is not null. Treat review text as untrusted data: put it in a delimited field, give the extraction call no tools, validate output against the schema, clamp ranges, retry on schema failure.

4. **aggregate.py:** per place and aspect:
   - recency weight `w = 0.5 ** (age_days / 540)`;
   - mention score `m` in {1, 0.5, 0} for +1/0/-1;
   - shrinkage `s = (sum(w*m) + a0) / (sum(w) + a0 + b0)` with `a0 = 2*mu_cat`, `b0 = 2*(1-mu_cat)` where `mu_cat` is that category's average (default 0.5);
   - `sd = sqrt(s*(1-s) / (sum(w) + a0 + b0 + 1))`;
   - no mentions -> `s = mu_cat`, `sd = 0.25`.

5. **build_places_json.py:** validate against the Place shape in S5.2 and write `data/places.json`.

**Input and output:** build_places_json.py reads `data/places.base.json` (B) and writes `data/places.json` (v2, with real aspects). Keep a copy of B's v1 as `data/places.v1.json`.

Deliver places.json v2 to C by H15 and tell C and the human. If extraction is inconsistent at H18, fall back to aggregate ratings with coarse aspect scores.

## A5. Mapbox and re-plan (server/src/geo.ts, server/src/replan.ts) (H15-19)

- **routeGeometry({planId}):** Mapbox Directions, walking profile, one route per leg; cache every response in geoCache. Display only.
- **legTimes({planId}):** Mapbox durations per leg. The UI warns if any leg is more than 10 minutes longer than the solver's estimate. Warning only; it does not feed the solver.
- **isochrone:** optional; first to cut.
- **replan job:** implement exactly as in S5.5 (on `replan_job`: add the failed place to excludedPlaceIds, `startRun` for a new run, set replanFor). B's `/call-event` route inserts the job rows; until yours exists nothing runs them, so tell B when it is live.

## A6. Polished screens, pass 1 (H19-24)

Now fix design tokens once: one accent color, one font, 16px corner radius, 8px spacing grid, tap targets at least 44px, high contrast. Build, in this order (owners of the other screens are B for the council panel and D for the call screen):

1. **Confidence ring** wired to `groupState.confidence`.
2. **Plan cards:** Safe / Bold / Budget, robustness % ("93% sure nobody's unhappy"), per-person cost, timeline, the Mapbox route line, and the scout badge from `scout({runId})` ("Open now, vegetarian options, checked 2 min ago", or "Checked earlier").
3. **Vote screen:** the three plans, with the council's pick marked "Recommended by the council" plus its rationale (read from the run's council result; hide the badge if fallbackUsed). Roulette ("Can't decide? Spin") calls doRoulette and animates a wheel.
4. **Consensus Map:** SVG scatter, x = meanRatio, y = minRatio, one dot per pareto entry, chosen plan highlighted. A fairness dial w in [0,1]; the highlighted plan maximizes `w * minRatio + (1 - w) * meanRatio` among the pareto points, all computed client-side. Tapping a dot shows its plan card.
5. **Offers inbox (private):** trade offers only to the member they are addressed to, with accept and decline.
6. **Re-plan banner:** when `groupState.replanFor` is set, show "That place is full. New plan ready" and a one-tap "Call again".
7. **Judge panel** (hidden, long-press the logo): posterior bars with intervals from posteriorSummary, robustness, the stats block, and the Consensus Map full screen.

Also: loading skeletons, error toasts, the "Demo mode: cached data" banner, and a demo-mode toggle (setDemoMode).

## A7. Phases

| Phase | Hours | Work |
| --- | --- | --- |
| P0 | H0-2 | Contract check with every part's stubs; write `scripts/smoke.mjs`; run it. |
| P1 | H2-5 | Bare-bones UI (A3). Hard stop at H5. |
| Sleep | H5-9 | Leave a hand-off note: what is done, half-done, and where files are. |
| P2 | H9-13 | Read B's hand-off note (B is away until about H15). Bright Data spike, then the batch pull and extraction. Write `docs/BRIGHTDATA.md`. |
| L1 gate | H13 | Do the stubs-to-real flip with the human (`FASTAPI_BASE_URL`, `STUB_MODE=false`); run the smoke test; switch the UI to the live SpacetimeDB views everywhere. |
| P3 | H13-15 | Finish aggregation, build places.json v2, deliver to C. Cover anything B left half-done. |
| P4 | H15-19 (L2 gate) | routeGeometry, legTimes, replan; run the smoke test every 2 hours. |
| P5 | H19-24 (L3 gate) | Polished screens (A6). Freeze at H24. |
| P6 | H24-26 | Record the demo video with D; project image and screenshots. |
| Sleep | H26-30 | |
| P7 | H30-34 | You are pitch lead: final script and roles, rehearse 3 times with a timer, set up the demo laptop (zoom 125%, notifications off, logged in, seeded group, backup video open) and the phones. |

## A8. Done-when and cut rules

- **L1:** four phones join one group and see one converged plan on a map.
- **L2:** places.json v2 is live; the confidence ring tightens as swipes arrive; Mapbox leg times show.
- **L3:** polished screens on the demo path; an offer appears only on the intended member's phone; the re-plan banner works.

**Cut first:** Consensus Map dial polish, then isochrone, then review extraction (use aggregate ratings). Never add settings, profile, or login screens. If you are writing council or voice code, stop.

---

# PART B: SPACETIMEDB + COUNCIL PANEL + SUBMISSION (Eric Chen; paste S + this)

You own `server/` (everything except `src/geo.ts` and `src/replan.ts`), `web/src/components/council/`, `docs/` (except `BRIGHTDATA.md`), root files, and these `data/` files: `fetch_places.py`, `places.base.json`, `places.fake.json`, `demo_group.json`, `cached_run.json`, `scout_cache.json`. You make four phones agree on one reality and make everything survive bad Wi-Fi. You are away or asleep from about H9 to H15, so everything others depend on lands by H8, with a hand-off note.

## B1. SpacetimeDB (server/)

Implement every table, view, reducer, procedure, job, and HTTP route in S5.5, including council messages, scout checks, the scout and council jobs, `POST /council-message`, and the pipeline and re-plan scheduling described there.

**Schema (fields):**

- **groups:** code (4 chars, unique), status (lobby|eliciting|planned|voting|booked), date, windowStart, windowEnd, demoMode, showWhoCompromised, confidence, latestRunId, excludedPlaceIds, replanFor?, createdAt.
- **members:** groupId, name, secret, origin?, ready, swipeCount, joinedAt.
- **privatePrefs:** memberId, text, hard, prior, posterior {mean, cov}, nextPair?, updatedAt. Readable only through myPrivate with a matching secret.
- **swipes:** memberId, winnerPlaceId, loserPlaceId, ts.
- **planRuns:** groupId, idempotencyKey, status (running|done|error), result?, error?, createdAt.
- **offers:** runId, toMemberId, type, amount, unit, planId, text, status (open|accepted|declined). Readable only by toMemberId.
- **votes:** runId, memberId, planId. Unique on (runId, memberId); re-voting updates.
- **council_message:** the CouncilMessage shape from S5.3. The view strips memberId unless showWhoCompromised.
- **scoutChecks:** runId, placeId, openNow?, vegetarianOptions?, checkedAt, source, cached.
- **booking, call_event, geo_cache** (key = hash of request, value = response).

**Flows:**

- **submitPrefs** schedules parsePrefs (calls /parse-prefs, stores hard, prior, posterior).
- **submitSwipe** records the swipe, calls /elicit/update, increments swipeCount, then schedules nextPair and a debounced previewConfidence (calls /plan with `preview: true` and stores `groups.confidence`). Stopping rule: when confidence >= 0.9 and every member has swipeCount >= 4, set status to planned and run the full runPlan. Cap swipes at 12 per member.
- **runPlan:** idempotent by runId; builds the /plan request from members' hard + posterior (+ origins) and excludePlaceIds; stores the result; then runs the pipeline from S5.5 (offers and scout in parallel, then council).
- **acceptOffer:** applies the relaxation to that member's hard (budget cap += amount, or maxTravelMinutes += amount), marks the offer accepted, and re-runs runPlan with a new runId.
- **call job:** calls the voice service `POST /book`; the voice service posts back to `POST /call-event`, which you store in call_event; on `failed` with reason `full` or `closed`, insert a `replan_job` row for A's replan.

A shared helper `callApi(path, body)`: adds `X-Huddle-Secret`, 20 s timeout, one retry for idempotent calls, structured error.

**Privacy rules to enforce:** public queries never include privatePrefs, posterior, others' offers, or council memberId (unless showWhoCompromised). planRun strips perMember and gaveUp unless showWhoCompromised.

## B2. Data basics (data/)

- **fetch_places.py:** Google Places API (New) text search for Berkeley, roughly 20 meals, 15 activities, 10 desserts. Fetch: id, displayName, location, priceLevel, regularOpeningHours, nationalPhoneNumber, rating, userRatingCount, types (use a field mask). Map price level to costPerPerson: meal level 1/2/3/4 = 12/25/45/70; dessert = 9; activity = explicit estimate (free/10/15/25) from type. Map Places types to cuisine and category. Dietary tags only when known; otherwise empty.
- Write `data/places.base.json` in exact Place shape (S5.2) with default aspects (category mean, sd 0.25) and copy it to `data/places.json`. This is v1, delivered by H8. After that, only A's build script writes `data/places.json`.
- **data/places.fake.json:** 12 fake places (4 meals, 4 activities, 4 desserts) in exact contract shape, with varied aspects and prices, for stubs.
- **data/demo_group.json:** the four seeded demo members (S1) with texts, origins, and constraints.
- **data/cached_run.json:** a saved successful plan response for the seeded group (fallback).
- **data/scout_cache.json:** pre-warmed live-check results for the demo plans' restaurants (fill at H24-26 from real runScout output).

## B3. Scout (runScout) (H19-24)

For each of the three plans, take the meal stop's place and run a live check through Bright Data. Use A's `docs/BRIGHTDATA.md` for the product, endpoint, and parameters (synchronous call, 20 s timeout). Store `{openNow, vegetarianOptions, checkedAt, source: "brightdata", cached: false}` in scoutChecks. On timeout or error, use `data/scout_cache.json` and set `cached: true`. Report only what the data says; unknown is null. Never guess.

## B4. Council panel (web/src/components/council/CouncilPanel.tsx) (H19-24)

Reads the `my_council_messages` view live. Shows Round 1, Round 2, then the chair, as speech bubbles that appear as they stream in. Labels are "Advocate A-D" (names only if showWhoCompromised). The chair's bubble ends with "Recommended: {plan name}". If the run's result says fallbackUsed, show "Safe plan used (the council check failed)". Never show messages that failed validation (the api never posts them). Match A's design tokens once A defines them at H19.

## B5. Experiments (docs/experiments/) (H19-26)

Python scripts that call the api over HTTP (/parse-prefs optional, /elicit/*, /plan, /council) with synthetic groups. Be honest everywhere: ground truth is synthetic.

- **A:** ~1,000 synthetic groups (3-5 members; tastes = shared component + noise; random veto structure; real places.json features). Compare random, plurality, utilitarian (max sum), maximin, Nash welfare, and ours. Metrics: min normalized utility, Gini of utilities, share of groups with someone below 50% of their ideal. Paired comparisons with bootstrap 95% confidence intervals.
- **B:** ~500 simulated users: random vs uncertainty-based pair selection. Metric: top-3 hit rate vs number of swipes (1-12). A learning-curve chart.
- **Council:** across the same groups, how often the chair's pick equals the solver's top plan (agreesWithSolver), and the difference in worst-person ratio between the chair's pick and the solver's top plan. If that difference is clearly negative, tell C to tighten the acceptable set.

Priority: B, A, Council. Produce one chart and 2-3 headline numbers for the pitch by H26 and have C review them.

## B6. Phases

| Phase | Hours | Work |
| --- | --- | --- |
| P0 | H0-2 | SpacetimeDB module; draft schema and views (access rules); write `docs/CONTRACT.md` (copy of S5); create folders and `.gitignore` (include `.env`, `data/raw/`); help the human create the repo by hand (you do not). |
| P1 | H1-3 | Module functions stubbed (all of S5.5, returning fakes or simple versions, including council and scout stubs); places.fake.json; callApi; shared public tunnel with C by H3 (the human sets it up; you add the URL to env). |
| P2 | H3-8 | Real module functions against C's stubs; owner-only views; unique votes; /call-event and /council-message HTTP routes; fetch_places.py and places.json v1 by H8. |
| Hand-off | H8 | Hand-off note (required): what is done, half-done, where the files are, and the exact steps to flip from stubs to the real solver (`FASTAPI_BASE_URL`, `STUB_MODE=false`). A does the flip at H13. Then sleep. |
| Away | H9-15 | Nothing critical is owed. |
| P3 | H15-19 (L2 gate) | Read A's notes; fix drift between the module and C's real endpoints; plan, offers and accept_offer end to end; health pings and demo-mode switching; wire /call-event to schedule A's replan. |
| P4 | H19-24 (L3 gate) | runScout, runCouncil, council panel; test the re-plan loop with D (a `full` reply). |
| P5 | H19-26 | Experiments (B5). |
| P6 | H24-26 | Pre-warm all caches; save cached_run.json and scout_cache.json; seed the demo group. |
| P7 | H26-30 | README (what it is, architecture diagram, how to run), `docs/HONESTY.md`, `docs/DISCLOSURE.md`; secret scan (keys in tracked files and history) and .env check; Devpost "How we built it" draft. Sleep H30-34 (with C). |
| P8 | H34+ | Submission captain checklist (T7). |

## B7. Done-when and cut rules

Four phones stay in sync; private data is never visible to others; the app works in demo mode with Wi-Fi off; places.json validates; council messages stream live.

**Cut first:** experiments, then the live scout check (use the cache), then the council panel (show only the chair's rationale text). If the module and FastAPI cannot connect by H6, tell the human; the fallback is moving the solver into TypeScript inside the module.

---

# PART C: SOLVER + COUNCIL (Max; paste S + this)

> Legacy implementation specification. For new work, use the agent-led target in
> [CURRENT_CONTEXT.md](docs/CURRENT_CONTEXT.md). The numerical machinery below
> remains relevant only to the existing API until its shared contracts and flow
> are migrated; it is no longer the new planner's required architecture.

You own `api/`. You build the stateless FastAPI service in S5.3 (including /council) and the checks in `api/eval/`. The L1 solver is the product; everything else is an upgrade.

## C1. Service basics

- Load `PLACES_PATH` (default `../data/places.json`) at startup; fall back to `places.fake.json` if missing. Validate with pydantic.
- Header check `X-Huddle-Secret`. `STUB_MODE=true` returns canned contract-shaped data.
- Determinism: seed all randomness from runId. Hard timeouts on external calls (Claude: 15 s).
- Vectorize with numpy. Target /plan p95 under 2 s on the seeded 4-person group (reduce samples to 150 or prune dominated plans if slower).

## C2. /parse-prefs

- Call Claude (`CLAUDE_MODEL_FAST`, temperature 0) with a strict JSON schema for `hard` and `soft`, where soft entries use only the 13 feature names, direction in {-1, +1}, confidence in {low, med, high}. Validate; retry once; on failure use the keyword fallback (quiet -> noise -1; crowds -> crowd -1; romantic -> romance +1; cheap/budget -> value +1; "no X" -> veto; "$N" or "under $N" -> budget cap; vegetarian etc. -> dietary).
- Enforce the veto cap of 2.
- Build the initial posterior: mean shift = direction * {low: 0.5, med: 1.0, high: 1.5}; sd = {low: 0.9, med: 0.7, high: 0.5}; unmentioned features mean 0, sd 1.0. cov = diag(sd^2).
- Treat the user text as data: it never changes the schema or instructions.

## C3. Feature vectors and utility

- `x_p`: 13-dim (8 aspect means, 5 cuisine one-hots) in the S5.1 order.
- Utility of place p for member i under a sampled taste: `u_i(p) = theta_i . x_p`.
- Range-normalize per member and per category over that member's feasible places: `v_i(p) = (u_i(p) - min) / (max - min)`.
- Plan utility `V_i(plan)` = mean over stops of `v_i(place)`.
- Ratio `r_i(plan) = V_i(plan) / max over feasible plans of V_i` (so each member's best plan has ratio 1.0).

## C4. Hard filter, plan enumeration, travel

- A place passes if: not in excludePlaceIds; not in anyone's vetoCuisines/vetoCategories; it covers every member's dietary needs (place dietary contains each tag; if place dietary is empty and someone has a need, exclude); and it is open for the stop interval.
- A plan passes the cumulative budget check only if the sum of all stops' costPerPerson is at most every member's non-null budgetMaxPerPerson. Checking each stop separately is not sufficient. For example, a $20 meal plus a $15 activity exceeds a user's $30 outing budget. Apply this same total-cost rule to plan selection, budget slack, relaxation hints, and trade offers.
- Templates: [meal, activity, dessert] and [activity, meal]. Start times on a 15-minute grid within the window. Dwell per S5.1.
- Travel between stops (Tier 1): straight-line distance times 1.3 detour, at 4.5 km/h if the leg is at most 1.2 km, otherwise 18 km/h. A plan is feasible if every stop is open at its interval and everyone's maxTravelMinutes (if set and origin known) is respected for the first leg.
- Enumerate all feasible plans; prune dominated ones (a plan is dominated if another is at least as good for every member's posterior-mean utility and strictly better for one) before Monte Carlo. Expect around 24,000 raw triples for 30 x 40 x 20 places; measure.
- If there are no feasible plans: return `plans: []` and fill `relaxationHints` with the smallest single relaxations that produce at least one feasible plan (for example, budget +$X for member Y).

## C5. Posterior update /elicit/update

Bayesian logistic (Bradley-Terry) with a Laplace approximation, applied sequentially. Given the current posterior N(m, Sigma) and a swipe with difference vector `d = x_winner - x_loser`:

1. Maximize `log sigmoid(theta . d) - 0.5 * (theta - m)^T Sigma^-1 (theta - m)` with a few Newton steps (5 is enough) to get the MAP theta*.
2. New mean = theta*. New covariance = `(Sigma^-1 + s(1-s) * d d^T)^-1`, where `s = sigmoid(theta* . d)`.
3. Return the new posterior. (Temperature T = 1.)

## C6. /elicit/next (active selection)

Among pairs of places in the same category from candidatePlaceIds not in alreadySeen (sample at most ~200 pairs; if focusPlaceIds is given, prefer pairs including a focus place), score each pair as `(d^T Sigma d) * p * (1 - p)` where `d = x_a - x_b` and `p = sigmoid(m . d)`. Return the best pair (randomize which is a or b). This picks comparisons that are both uncertain and informative.

## C7. /plan: robust group choice

For S samples (default 300; 100 for preview):

1. Draw `theta_i ~ N(m_i, Sigma_i)` for every member. Optionally perturb place aspect values by their sd.
2. Compute `V_i` for every feasible plan and each member's ideal (best plan) for this sample; compute ratios `r_i`.
3. A plan "succeeds" in the sample if `min_i r_i >= tau` (default tau = 0.6). Robustness = fraction of samples where the plan succeeds. Tie-break by mean Nash welfare (product of `V_i`).

**Three named plans** (all distinct place sets):

- **Safe:** highest robustness.
- **Bold:** highest mean novelty (feature 7) subject to robustness >= max(0.5, safe_robustness - 0.25).
- **Budget:** lowest costPerPerson subject to the same robustness floor.

**Explanations (no LLM):** for each plan, for each member find the feature where the plan falls furthest below that member's best alternative (weighted by the member's mean taste); whyLine = the two largest compromises phrased "Sam gave up novelty; Jordan accepted a longer walk."; gaveUp lists them.

**Pareto output:** for the top topK plans by robustness, return meanRatio (mean over members of posterior-mean `r_i`), minRatio (min over members), and robustness.

**posteriorSummary:** per member, per feature: posterior mean and sd (the diagonal).

## C8. /offers: private trade offers

Find the smallest single-person concession that unlocks a clearly better plan.

- For each member i: consider relaxing only that member's budgetMaxPerPerson by up to +$15 or maxTravelMinutes by up to +15 min. The minimal amount for a candidate plan is computed directly (for budget: plan cost per person - cap; for travel: needed minutes - cap), not by search.
- Candidate plans: feasible under the relaxation for member i but infeasible originally, and feasible for everyone else.
- Evaluate each candidate with the same robustness machinery. Keep it as an offer if robustness(candidate) - robustness(baseline Safe) >= 0.05 or minRatio improves by at least 0.05.
- Return at most 3 offers total and at most 1 per member, each with toMemberId, type, amount, unit, the plan, and the gains. Never output who benefits. (The module stores each offer privately to toMemberId.)

## C9. /roulette

Weights proportional to robustness^2 among the given plans; seeded draw.

## C10. /council: the advocates and the chair (H19-24)

The full contract (request, response, rules, CouncilMessage) is in S5.3. Build it as small, plain functions so the transport can change later:

- **`llm_call(role, system, user, schema, model)`:** the only place that talks to a model. Retries once on schema failure, enforces the per-call 8 s timeout, validates JSON against the schema.
- **`build_tools(member, plans, scout)`:** returns that member's my_score, my_dealbreakers, my_slack, and the shared plan_facts. They return derived numbers only (never a raw budget cap or veto) and are computed from the same ratio machinery as /plan.
- **`advocate(member, round, transcript, tools) -> message`:** runs the model with its tools. System prompt rules: you represent exactly one person; use only numbers your tools return; cite every number; never state a cap, veto, or other private fact; no names; at most 40 words; output JSON only.
- **`chair(transcript, solver_ranking, scout) -> message`:** picks one of the three plans, at most 60 words, cites numbers. Same rules.
- **`validate(message, tool_outputs)`:** implements rule 4 of S5.3. Numbers are matched by regex against the allowed set; reject anything else.
- **`run_council(request)`:** asyncio.gather for each round; post each valid message to `POST {SPACETIMEDB_URI}/v1/database/{SPACETIMEDB_DB}/route/council-message` with `X-Huddle-Secret`; compute agreesWithSolver (chair's pick equals the highest-robustness plan); fall back to Safe on any chair failure.

`STUB_MODE=true` returns a canned transcript of about 9 messages and a chosen plan.

No user free text may enter any prompt. Only structured values. Keep each role as a function that takes plain inputs and returns a message, so a Fetch.ai uAgent shell (if the booth confirms a prize) or another model provider can call the same functions.

## C11. Checks (api/eval/)

- **Latency:** /plan p50 and p95 over 100 runs; /council total time over 20 runs.
- **Determinism:** the same runId and seed give the same plans.
- Review B's experiment numbers (B writes the simulation scripts in `docs/experiments/`; you confirm the method and the headline numbers before they go on a slide). Expose a seed option in /plan so their runs are reproducible.

## C12. Phases

| Phase | Hours | Work |
| --- | --- | --- |
| P0 | H0-2 | With B, fix the contract and the aspect list. Stub every endpoint including /council (canned data). If you are away at kickoff, tell the human; D writes the stubs. Shared tunnel with B by H3. |
| P1 | H2-5 | /parse-prefs (+ fallback) and the L1 solver core on fake data: filter (including excludePlaceIds), normalization, enumeration, maximin with Nash tie-break. Check by hand on a 3-place toy case. Hand-off note, then sleep H5-9 (with A). |
| P2 | H9-13 (L1 gate) | Integrate places.json v1 (from B at H8); first real /plan by H11; three plans with diversity; roulette; explanations; a timing spike of 24,000 plans x 300 samples. Real aspects arrive with places.json v2 at H15; until then the default aspects are fine. |
| P3 | H13-19 (L2 gate) | Posterior update, active selection, Monte Carlo robustness, named plans, Pareto and posterior outputs (to A by H17); swap in places.json v2 when A delivers it (H15). |
| P4 | H19-24 (L3 gate) | /offers; /council (C10); latency tuning. If the council is behind at H22, ship it with `COUNCIL_ENABLED=false` and keep /offers. |
| P5 | H24-26 | Freeze the algorithm; fix seeds; run a 20-minute code walkthrough with all four teammates (everyone must be able to explain the solver and the council); confirm B's chart and numbers. |
| P6 | H26-30 | README "How it works" section for B; technical Q&A (T8); help D make the call reliable. Sleep H30-34 (with B). |

## C13. Done-when and cut rules

- **L1:** /plan returns three sensible plans on real data for the seeded group.
- **L2:** the posterior visibly narrows and robustness is reported.
- **L3:** /offers returns private offers that actually improve robustness; /council streams validated messages and falls back to Safe when it should.

If the posterior is not ready by H18, ship the L1 solver with Monte Carlo over the fixed prior and say so. Never describe something as "learned" if it is not. If offers do not improve the plan, show none rather than fake one. **Cut order inside your part:** council first, then Bold plan; never cut trade offers before the council.

---

# PART D: VOICE + CALL SCREEN (Eric Wu; paste S + this)

You own `voice/` and `web/src/components/call/`. You build the booking voice agent (Mandarin) and the live call screen, and you help with the demo video and call rehearsal. You are also the Cartesia liaison.

## D1. Service (voice/, FastAPI)

- **POST /book** (S5.4). Validates the request, creates the outbound Twilio call to `DEMO_RESTAURANT_PHONE` only (refuse any other number unless `ALLOW_REAL_CALLS=true`), pointing Twilio at `POST /twiml/{bookingId}`.
- **POST /twiml/{bookingId}:** returns TwiML with `<Connect><Stream url="wss://{host}/ws/{bookingId}"/></Connect>`.
- **WS /ws/{bookingId}:** the Twilio Media Streams WebSocket, running a Pipecat pipeline: Twilio transport -> VAD (Silero) -> STT (`STT_PROVIDER`: Cartesia or Deepgram) -> LLM (Anthropic, `CLAUDE_MODEL_FAST`) with tools -> TTS (Cartesia) -> Twilio.
- **POST /status:** Twilio call status callbacks.
- With `STUB_MODE=true`, /book posts a fake timed sequence of events to `/call-event` (dialing, connected, transcript, slot_offered, confirmed) so A can build the UI.

Use Pipecat's phone-bot quickstart as the reference for the exact transport/serializer class names and the tunnel setup.

## D2. Dialogue design

- **First sentence, always:** the Mandarin AI disclosure in D4 (AI disclosure + transcription notice).
- **Finite-state flow:** GREET -> REQUEST (party size, time, name) -> HANDLE_RESPONSE -> CONFIRM -> END.
- **Tools the LLM may call:** `record_slot`, `propose_alternative_time` (only times inside alternativeWindow), `confirm_booking`, `fail_booking(reason: full|closed|no_answer|refused|error)`, `end_call`.
- **Guardrails:** never invent facts; never reveal private group data; max about 3 minutes; silence timeout about 8 seconds; hang up politely if asked to stop; stop immediately on "don't call again."
- **Event posting:** every state change and every transcript line goes to `POST /call-event` on the module (S5.4) with the shared secret.
- **Barge-in:** if the human talks over the agent, cancel TTS immediately.
- **Latency log:** per turn, end-of-speech to first agent audio, in milliseconds; keep a file for the pitch.

## D3. Test scenarios (a teammate plays the restaurant on a verified phone)

- **S1:** accepts the requested time.
- **S2:** "7:00 is taken, would 7:45 work?" -> agent accepts if inside the window.
- **S3:** "We're fully booked." -> agent thanks them, posts `failed` with `reason: "full"`, ends politely (this triggers the re-plan loop).

Run each 10 times. **Pass criteria:** connects 10 of 10; confirmation or clean failure 9 of 10 or better; median turn latency about 1.5 s or less.

## D4. Languages

- **First sentence, always, in Mandarin:** "您好，我是AI助理，代表{nameOnReservation}预订座位。通话可能会被转录。" (AI disclosure plus transcription notice.) A Chinese-speaking teammate must check the wording before the first real test.
- **Understanding:** use one speech-to-text language per call. Test Cartesia Ink-Whisper (zh, yue) and Deepgram Nova-3 (Mandarin, zh-HK) on a Cantonese-speaking teammate and a Mandarin-speaking one, and keep the provider that is more accurate. Set `STT_PROVIDER` and the language per scenario.
- **Speaking:** the agent always replies in Mandarin. Cartesia does not list Cantonese speech, so do not promise it.
- **STRETCH** (only if S1-S3 already pass): language lock (choose the speech-to-text language from the first utterance), an English translation line (`textEn` on transcript events), per-turn latency display, a distinct voice per council advocate.

## D5. Call screen UI (web/src/components/call/) (H19-24)

Reads the `my_call_events` view live. Show: a live transcript (the original line, plus the English line under it when `textEn` is present), a status stepper (dialing, connected, slot offered, confirmed), a confirmation card (name, time, party size), and a "Call failed: that place is full" state that hands off to A's re-plan banner. If the call falls back, play the labeled recording and label it "Recorded earlier." Use A's design tokens once A defines them at H19.

## D6. Phases

| Phase | Hours | Work |
| --- | --- | --- |
| P0 | H0-1 | Visit the Cartesia booth (and Meta); ask about Cantonese speech, the prize, and what counts as a winning project; write their exact 13.0 requirements in the team channel; agree the /book and call-event shapes with B. |
| P1 | H1-2 | The stub /book event sequence, with `STUB_SCENARIO=confirm` (default) and `STUB_SCENARIO=full` (posts `failed` with `reason: "full"`) so A and B can test the re-plan loop. If C is away at kickoff, also write C's stub endpoints if the human asks. |
| P2 | H2-8 | The voice spike: one scripted call end to end in Mandarin; your own public tunnel for the WebSocket; 5 test calls; pick the Mandarin voice and the speech-to-text provider; tune the end-of-speech threshold. |
| GO / NO-GO | H8-9 | GO if the call connects 5 of 5, median turn latency is about 1.5 s or less, and speech is clear. NO-GO: switch to the fallback (a labeled recording of a real earlier call) and help A with the pipeline and the demo path. Post the decision. Hand-off note, then sleep H9-13 (with B). |
| P3 | H13-19 | State machine, tools, event posting; scenarios S1 and S2; the Cantonese-reply test; latency. |
| P4 | H19-24 (L3 gate) | Scenario S3 with `failed` + `reason: "full"` and the re-plan loop tested with B; the call screen (D5); the guardrails and AI disclosure checked; evaluation of the scenarios (10 runs each); record a real fallback clip now (it must be labeled as a recording). Fallback decision at the H19 gate: if S1-S3 are not passing 9 of 10, switch to the recording and stop adding voice features. |
| P5 | H24-26 | Record the demo video with A (capture the call on speaker). Eric Chen is the only Cantonese speaker, so he plays the restaurant for the Cantonese reply test; whoever drives the demo does not play the restaurant. |
| Sleep | H26-30 | With A. |
| P6 | H30-34 | Re-run the three scenarios; record the final call; rehearse the call segment with A; keep the backup recording ready. |
| P7 | H34+ | Be at judging; keep the team through the 4:00 PM ceremony. |

## D7. Safety and cut rules

- Never call a real business in the demo. Always identify as an AI. If you record or transcribe, say so on the call.
- The fallback clip must be a real call, labeled.
- If the spike fails twice at H8, take the fallback. No new voice features after H24.
- Stretch items (D4) are built only before H24 and only if S1-S3 already pass; otherwise cut them.

---

# PART T: TEAM-ONLY (humans; do NOT paste into Claude Code)

## T1. Before kickoff (Fri Oct 23): accounts, keys, and paper only. No code, no repo, no data pulls.

- **Everyone:** charge laptops, pack chargers, a phone hotspot, and layers. Eat before kickoff. Nap if you can.
- **Haydn (A):** Mapbox token and a Bright Data account. Read the council-and-math file. Booth: Meta.
- **Eric Chen (B):** SpacetimeDB (`spacetime` CLI 2.13.0, Maincloud login), Google Places, and Vultr accounts and keys; check each source's quotas and terms. Booth: Bright Data. Ask Bright Data: what is the prize or credit, which product for Google Maps reviews, rate limits, and what counts as using them.
- **Max (C):** the Claude API key; decide the stub /plan shape from the contract; write your default parameters on paper (tau = 0.6, S = 300, veto cap 2); jot 30 example free-text preferences. Booths: Microsoft and Fetch.ai (ask what 13.0 requires for the Fetch prize).
- **Eric Wu (D):** upgrade Twilio (the trial plays an announcement and only calls verified numbers) and buy a number; Cartesia account and a speech-to-text account; install a tunnel tool; verify the demo-restaurant phone number; write the three call scenarios. Booth: Cartesia (ask about Cantonese speech).
- **Everyone, at every booth:** "What does a winning project look like for your prize, and is there an extra form, post, or step at submission?" Write the answers in the team channel.

## T2. Official facts (Cal Hacks 13.0 Devpost)

- Submissions open Fri Oct 23, 6:00 PM PDT and close Sun Oct 25, 9:00 AM PDT (hard deadline). Be checked in at the venue by 8:00 AM Sunday. Winners announced Sun 4:00 PM PDT: stay.
- Teams of 2-4 college students. All work during the event. Include a project image and the GitHub repo link. Pitch: 3 minutes plus 2 minutes of questions. A live or pre-recorded demo is required. Judging criteria: Application, Intentionality, Functionality, Creativity, Technical Complexity.
- Hacking start time and judging slots are not on the Devpost schedule page: confirm at the opening ceremony and shift all hours by the same offset.

## T3. Schedule (H0 = Fri 9:00 PM; shift if different)

| Hours | What |
| --- | --- |
| H0-2 | Stubs wired end to end on fakes; tunnel live; smoke test passes. |
| H2-5 | Bare-bones UI, solver core, voice spike. |
| H5-9 | First sleep shift. |
| H9-13 | Build to L1; H13 L1 gate and the stubs-to-real flip. |
| H13-19 | Smart; H19 L2 gate and go/no-go decisions. |
| H19-24 | Impress; H24 L3 gate + freeze. |
| H24-26 | Record video + code walkthrough. |
| H26-34 | Harden. |
| H34.5 | Submit (Sun 7:30 AM). |
| H36 | Hard deadline. |

**Sleep** (at least two awake always):

- Sat 2-6 AM (H5-9): Haydn (A) + Max (C) sleep.
- Sat 6-10 AM (H9-13): Eric Chen (B) + Eric Wu (D) sleep. Eric Chen is also away until about noon (H15) on Saturday morning, so Haydn is the one covering B's work.
- Sat 11 PM - Sun 3 AM (H26-30): Haydn (A) + Eric Wu (D) sleep.
- Sun 3-7 AM (H30-34): Eric Chen (B) + Max (C) sleep.

Max is away for a short stretch on Friday night. If that overlaps kickoff, Eric Wu writes the stub endpoints.

Before sleeping, post: what is done, what is half-done, and where the files are. Exact windows for Eric Chen and Max are still to be confirmed; adjust this list once they are.

## T4. Rituals

- 5-minute status check every 3 hours: done, next, blocked. Run `scripts/smoke.mjs` every 2 hours (Haydn).
- Blocker over 45 minutes: cut it, swap it, or fake it with disclosure.
- New ideas go in one shared parking lot; review only at gates.
- Git, by hand: one repo, owned folders, small commits, pull before push, never force-push; whoever breaks main fixes it in 15 minutes.
- Secret scan and .env check at H26-30. Stay until the ceremony.

## T5. Global cut order (when behind)

1. Stretch items (live slot approval, language lock, English line, latency display, advocate voices, .ics export), area packs, optional sponsor integrations (Fetch.ai wrapper, Apify second source)
2. Evaluation extras (experiments beyond B, A, and the council check)
3. Consensus Map fairness dial polish
4. Live scout check (use the cache)
5. Council panel (keep the plain rationale), then the council itself
6. Live voice call -> labeled recording
7. Review aspect extraction -> aggregate ratings

**Never cut:** L1 and L2 (join, preferences, swipes with posterior, robust plans, map, vote).

## T6. Pitch (3 minutes + 2 minutes Q&A; proposed roles)

| Time | Who | What |
| --- | --- | --- |
| 0:00-0:20 | Haydn | The problem in one sentence; show the QR code. |
| 0:20-1:30 | Haydn narrates, a teammate drives the phones | Phones join, swipe, plans converge on the map; show the confidence ring. |
| 1:30-2:15 | Haydn, Eric Wu | A private trade offer on one phone; the council debating and recommending; vote; then "Book it": the call plays on speaker (Eric Chen plays the restaurant, with the scripted "full" reply first to show the re-plan loop, if time allows). |
| 2:15-2:45 | Max | The solver, the council's guardrails, the fairness chart, one number. |
| 2:45-3:00 | Eric Wu | Impact and what's next. |
| Q&A | Max on technical questions; Haydn holds the backup video, hotspot, and clock | |

Disclose anything cached or recorded in one plain sentence during the demo. Prepare a 30-second version in case judging is expo-style. Hand a judge a phone to join as the fifth member if time allows.

## T7. Submission checklist (Eric Chen is the captain; target 7:30 AM Sunday)

- [ ] Every teammate added on Devpost
- [ ] Project image uploaded
- [ ] GitHub repo link works in a logged-out browser
- [ ] Demo video attached
- [ ] Targeted tracks selected with any extra steps done (Meta, Cartesia, Bright Data, and any other track the booths confirmed)
- [ ] Honesty and AI-tool disclosure included
- [ ] No keys in the repo

## T8. Technical Q&A cheat sheet

- **What is the hard part?** Turning conflicting, uncertain preferences into a plan we can call robustly fair, then measuring it.
- **Why Bayesian?** A few swipes cannot support a point estimate. The posterior says how sure we are, so we know whom to ask what and when to stop.
- **How do you compare people's utilities?** Range-normalize per person over the feasible set, cap vetoes at 2, and call it a modeling choice.
- **Why robustness and not an average?** An average can sacrifice one person. Robustness is the chance nobody falls below 60% of their ideal across plausible tastes.
- **What are trade offers?** The smallest single-person concession that unlocks a clearly better plan, shown only to that person, never saying who benefits.
- **Privacy?** Preferences are owner-only (hackathon-grade secret check); the group only sees outcomes; veto reasons are never shown; advocates only receive derived numbers.
- **Can the LLM be manipulated?** Reviews are data in a delimited field with schema-constrained extraction and no tools; user text never enters council prompts; every council number is validated against tool outputs.
- **What is mocked?** The cached place set, the restaurant on the call, the seeded group, the scripted "full" reply, and any recorded fallback.
- **How did you evaluate?** Synthetic groups with paired comparisons and bootstrap intervals; real-user validation is future work.
- **What breaks at 1,000 users?** Per-group compute is small and independent; the limits are API quotas and call concurrency.
- **Which parts are AI-assisted?** Disclose the AI coding tools used.
- **Why a council if the math already picks a plan?** The math decides what is acceptable and fair; the council turns it into an explanation the group can follow, uses soft context to choose among near-equal plans, and we measure whether it ever makes the worst-off person worse off.
- **What stops the agents from making things up?** They can only cite numbers their tools return, a validator checks every number, the chair can only pick from the solver's approved plans, and any failure falls back to the Safe plan.
- **Why Bright Data?** It returns far more reviews per place than the Places API's 5, which makes the review scoring meaningful; we also use it for a live open-now and menu check on the winning plan.

## T9. Sponsor tracks (confirm exact requirements at the booths)

- **Must hit:** Meta ("Bringing People Closer Together with AI"; winner advances to a Round 2 at Meta's Menlo Park campus) and Cartesia (voice; Meta glasses prize).
- **Cheap extras that come with the build:** Bright Data (reviews and scout; prize unknown, ask), MLH (Gemini, Vultr, GoDaddy domain).
- **Ask before building:** Fetch.ai (Devpost says $1,500 / $1,000 / $500; Fetch's page says $1,250 / $750 / $500 plus two $250; last year required Agentverse registration and the chat protocol), Microsoft "Built for the Real World", Figma, Creao, Apify (a listed prize if we add it as a second review source).
- **Weak fit or skip:** Visa "Reimagining Shopping"; Hyphenate, Capital One, CRS, Coinbase, SpaceXSI, Solana, Tiger Data, Snowflake.
- **Not used:** Wajo, Factory, Grok multi-agent.

## T10. Honesty list (fill in as you build; say it out loud in the pitch)

Cached place dataset; seeded demo group; restaurant is a teammate; the scripted "full" reply; any cached or recorded fallback (including scout results); synthetic evaluation data; scraped review data (terms checked); council messages are AI-generated under a validator.

## T11. Still open

- Eric Chen's exact Saturday-morning window and Max's exact Friday-night window.
- The real hacking start time (shift every H label).
- Booth answers: Bright Data prize and rules, Cartesia Cantonese speech, Fetch.ai 13.0 requirements.
