# Huddle Python API — phase zero

The Python service lives in `api/`; the stub integration follow-up also updates
the SpacetimeDB caller and shared place lookups. Max confirmed hacking had
started before implementation. This is a separate Python 3.11+ FastAPI service;
it has no database dependency, external API calls, LLM calls, Bayesian update,
Monte Carlo, real solver, or live council. All venue data and scores are fake.

## Current hand-off

Max's first-phase stubs are connected to `huddle-calhacks` on Maincloud through
`https://conferencing-navigate-deleted-feedback.trycloudflare.com`. All eight
routes passed authenticated HTTP checks through that tunnel, including missing
auth rejection, deterministic fixtures and cumulative budget consistency. The
saved Huddle secret also passed the non-mutating live backend check. Keep the
API and tunnel running and the Mac awake while the team uses this URL.

Eric Wu's voice stub in `voice/` is connected at
`https://restaurants-availability-barbie-lil.trycloudflare.com`. Separate live
Maincloud checks passed its synthetic confirm and full-to-re-plan scenarios,
including one event sequence per booking. It is restored to `confirm`; no real
phone call was made. Eric Chen is leaving and has exhausted his
Claude session usage, so Max is covering backend integration in this Codex
session. Max Li and Eric Wu have confirmed database Admin roles. Max's CLI
2.13.0 is installed and logged in; authenticated management reads verified the
API URL and stub mode stayed unchanged after an environment-only publish of
`VOICE_BASE_URL`. No module/schema was deployed. Current responsibilities and operating commands are in
[`docs/HANDOFF.md`](../docs/HANDOFF.md).

The real solver, Bayesian learning, Monte Carlo, Claude calls and live council
remain later phases. No Bright Data account/key is available; that account and
review pipeline belong to Haydn, with Eric Chen covering the booth task. A key
is not needed for these stubs.

## Run locally

From the repository root, in zsh/bash:

```sh
cd /Users/maxli/Huddle
python3 -m venv api/.venv
api/.venv/bin/python -m pip install -r api/requirements-dev.txt
export STUB_MODE=true
read -r -s 'HUDDLE_SHARED_SECRET?Local shared secret: '
export HUDDLE_SHARED_SECRET
api/.venv/bin/python -m uvicorn api.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

The `read` prompt syntax above is for **zsh**, the workspace shell. In bash use
`read -r -s -p 'Local shared secret: ' HUDDLE_SHARED_SECRET` instead.
Enter a local secret at the prompt; do not put it in a tracked file. For running
only the service, install `requirements.txt`; httpx is a test-only dependency.
The app automatically loads `api/.env`; exported environment variables take
precedence. For persistent local setup, copy `api/.env.example` to `api/.env`,
fill in the shared secret privately, and set `STUB_MODE=true`. The optional
`ANTHROPIC_API_KEY` is reserved for a later phase and remains unused by stubs.
Do not put values in the tracked example or any frontend environment variable.
After filling the private file, no secret export commands are needed in a fresh
terminal. Restart FastAPI after changing the file.

In a second terminal, from the same repository root:

```sh
read -r -s 'HUDDLE_SHARED_SECRET?Same local shared secret: '
export HUDDLE_SHARED_SECRET
curl --fail-with-body -sS -H "X-Huddle-Secret: $HUDDLE_SHARED_SECRET" http://127.0.0.1:8000/health
curl --fail-with-body -sS -H "X-Huddle-Secret: $HUDDLE_SHARED_SECRET" -H 'Content-Type: application/json' --data-binary @api/fixtures/plan.request.json http://127.0.0.1:8000/plan
api/.venv/bin/python -m unittest discover -s api/eval -v
api/.venv/bin/python api/eval/smoke_http.py
```

`smoke_http.py` uses `HUDDLE_SHARED_SECRET` and optionally `FASTAPI_BASE_URL`
(default `http://127.0.0.1:8000`) and exercises all eight operations. The test suite
generates temporary credentials in memory and does not require a running server.

To check both services together, install the server's locked development
dependencies, then use the official SpacetimeDB in-memory module harness:

```sh
npm ci --prefix server
npm run typecheck --prefix server
npm test --prefix server
api/.venv/bin/python api/eval/check_integration.py
```

The last command starts a temporary localhost API with a generated test secret,
runs real module procedures against it, then stops the API. No database is
published and no real call or vendor API is used. This verifies module logic
and HTTP contracts, not a deployed host, browser subscriptions, or durability.

## Check the live connected stubs

From the repository root, with Node installed and the matching shared secret
saved privately in `api/.env`:

```sh
api/.venv/bin/python api/eval/check_live.py \
  --server https://maincloud.spacetimedb.com \
  --database huddle-calhacks \
  --voice-base-url https://restaurants-availability-barbie-lil.trycloudflare.com \
  --voice-scenario confirm
```

This loads `api/.env` without printing the secret (exported values take
precedence) and runs `scripts/smoke.mjs`. Each run writes a disposable synthetic
group and bookings to the explicitly selected database. It checks voice health
authentication and stub mode before booking, API-backed plans, privacy,
council storage, voting, roulette and one confirm event sequence. The confirm
run also injects a failed/full callback to check backend re-planning.

For a failure originating from the voice service itself, have Eric Wu restart
only that API with `STUB_SCENARIO=full`, keeping its tunnel running. Run the
same command with `--voice-scenario full`. This verifies replacement plans
exclude the full restaurant, voting reopens, and no second call starts
automatically. The flag selects assertions; it does not change the service.
Restore the voice API to `STUB_SCENARIO=confirm` afterwards and rerun confirm.
Both scenarios passed through Maincloud; offers skip because the stub returns
none. These tests use scripted events and make no phone or model calls.

## Configuration

| Name | Meaning |
| --- | --- |
| `HUDDLE_SHARED_SECRET` | Required, nonblank server-to-server secret; never browser-visible. |
| `STUB_MODE` | Defaults to `true`; accepts `true` or `false`. `false` refuses startup because real behavior is not implemented. |
| `PLACES_PATH` | Optional explicit synthetic catalog path, resolved relative to process working directory. Defaults to `api/fixtures/places.fake.json` relative to this module. |
| `FASTAPI_BASE_URL` | Caller/smoke-test setting, default localhost port 8000; the service itself does not read it. |

`api/.env.example` lists service configuration names with empty values. Phase zero
deliberately loads the bundled synthetic catalog rather than teammates' data.
A custom catalog must validate as S5 Place records, have unique IDs and the
`synthetic_stub` source. Only the nine bundled IDs have itinerary templates.
No Convex environment variables, callbacks, SDKs, or replacement SpacetimeDB
transport are implemented. No Anthropic key is needed.

## Endpoint behavior

All eight routes require `X-Huddle-Secret`, including health. Missing/incorrect
credentials return 401. Typed request errors return 422 with input values removed.
All responses carry `X-Huddle-Stub: true`, an `X-Huddle-Notice`, and
`Cache-Control: no-store`. These headers disclose fakes without adding JSON fields
to the shared contracts. Warnings, place names, explanations, and council text
also label synthetic data where the existing shapes allow it.

| Route | Phase-zero behavior |
| --- | --- |
| `GET /health` | `{"ok":true,"stub":true,"placesLoaded":9}`. |
| `POST /parse-prefs` | Four exact demo phrases below map to canned hard/soft fixtures; identity posterior. Unknown text returns 409 instead of silently discarding a budget. |
| `POST /elicit/next` | First deterministic unseen same-category fixture pair; focus preferred, no active learning. |
| `POST /elicit/update` | Validates known same-category distinct place IDs, returns the supplied posterior unchanged. |
| `POST /plan` | Three fixed itineraries, Safe/Bold/Budget with totals $18/$20/$14; filters fixtures against each member's constraints. May return fewer or none. Preview uses the same envelope with at most one Safe plan and no pareto points. If the original Safe is removed, the highest-scored remaining fixture receives kind `safe`. |
| `POST /offers` | `{"offers":[]}`. No fictional gain or budget change. Baseline ID is opaque and not looked up. |
| `POST /roulette` | Seeded draw with weights proportional to supplied robustness squared. Zero-weight plans cannot win. Only accepts an already-approved pool. |
| `POST /council` | Canned two-round transcript (nine messages for four members), then chair picks the supplied Safe plan. A fresh local delivery adapter collects messages; no live streaming or persistence. |

The exact `/parse-prefs` demo phrases (case-insensitive, surrounding space ignored):

- `vegetarian, under $30, somewhere quiet`
- `no sushi, I love trying new places`
- `broke this month, nothing over $20, outdoors if possible`
- `romantic vibe, I don't care about price`

The sushi fixture uses the broad `asian` veto because the contract has no
sushi-specific field; this is canned demo behavior. Parsed preferences are initial
fixtures, not authorization to overwrite a previously stored cap.

Validated shapes and field descriptions are available from authenticated
`GET /openapi.json`. Interactive documentation is disabled to avoid unauthenticated
private-service access. Responses use S5 field names and do not add `stub` fields
except where already specified for `/health`.

The feature order is exactly:

```text
noise, crowd, wait, value, romance, service, outdoor, novelty,
cuisine_asian, cuisine_latin, cuisine_mediterranean, cuisine_american,
cuisine_cafe_dessert
```

Posteriors require 13 means and a finite, symmetric, positive semidefinite 13×13
covariance. Place features use eight aspect means followed by the cuisine one-hot;
activities have five zero cuisine entries. Input models reject unknown fields.

## Cumulative budgets and limits

The cost check uses the decimal sum of **all** stop costs, compared separately
with **every** member's non-null `budgetMaxPerPerson`; zero is a real cap, and null
means no cap. A $13 cap rejects all three templates although every individual
stop is at most $13. A $17 cap keeps only the $14 template. No function raises a
cap, mutates a request, accepts an offer, or writes state.

Fixture filtering also checks excluded IDs, cuisine/category vetoes, dietary
tags on meals and desserts only, opening intervals, the requested time window, and the initial travel cap
when origin is supplied. Tagless activities remain eligible for vegetarian or
other dietary-constrained members. First-leg travel is a simple synthetic straight-line
sanity check, not a live ETA. Stop gaps are fixed at 15 minutes. There is no search
for alternative venues, routes, timings, or real utility. The veto cap keeps the
first two entries (cuisines first), drops extras, and reports a plan warning.
Council rejects over-cap veto input to avoid dropping it without a warning field.

Ratios/robustness are canned, independent of posteriors and options; `tau`,
`samples` do not run inference. `stats.samples=0`, `elapsedMs=0` honestly indicate
no draws and a synthetic timing value. `topK` limits the fixture pareto rows,
which are synthetic points, not a computed frontier. IDs depend on SHA-256 of
`runId`; council labels also use the explicit seed. Timestamps are frozen
synthetic values. Repeating identical requests returns identical JSON.

## Contract questions for Eric Chen and Max

No shared shape was changed to resolve these:

1. Preview is now clarified in `docs/CONTRACT.md`: the existing response envelope,
   at most one Safe plan, `pareto: []`, confidence at `plans[0]?.robustness ?? 0`.
2. `/elicit/next` has no exhausted-pair result. Phase zero returns HTTP 409 with
   standard `detail`; agree on an eventual empty/exhausted success shape.
3. `relaxationHints` entries have no schema. They stay `[]`; no invented entries.
4. C11 asks for a `/plan` seed option, but S5 does not declare it. This phase uses
   `runId` only; extra options, including `seed`, return 422 pending agreement.
5. Roulette's reduced input contains no veto/budget/member data. The caller must
   supply **only currently approved plans**; the endpoint cannot independently
   certify feasibility from `{id, robustness}`. Do not treat a draw as approval.
6. Scout source is a string and unavailable facts can be null here; agree on
   availability semantics before live use. Stub council ignores scout facts.

## SpacetimeDB integration

Eric can connect a **trusted server-side caller** to these HTTP contracts using
`FASTAPI_BASE_URL` and the shared secret. For each call, assemble one consistent
snapshot: member IDs/names, private hard constraints and posteriors, optional
origins, date/window, excluded places, `runId`, and documented options. The solver
does not fetch or write database state. Store response IDs with that run; reject
stale results according to an agreed version policy. Replan uses a new runId and
accumulated excluded place IDs.

`CouncilDelivery.deliver(CouncilMessage)` in `delivery.py` remains an internal
Python seam. Phase zero uses response ingestion: the module reads `messages`
from `/council`, replays stub messages, and stores the transcript. It recognizes
`X-Huddle-Stub: true` on HTTP responses. Message insertion deduplicates by run,
round, speaker, and member, including a future callback plus response replay.
The local Python adapter still makes no external delivery calls. Live streaming
adapters and stronger retry/version policies remain later work.

Keep hard constraints, caps, posteriors, and offers owner-only. Plan `perMember`
and `gaveUp`, and council `memberId`, must be removed from public subscriptions
unless the agreed consent setting allows them. The API is a trusted internal
boundary: `showWho=false` omits names from canned text/labels but does not strip
the stored `memberId` in the documented internal CouncilMessage shape.

Budget increases belong to an authenticated, owner-authorized, explicit offer
acceptance in the state layer. Eric must verify offer ownership, validity, cap
version, and acceptance before producing a snapshot with a raised cap. Calling
`/offers`, parsing text, voting, or council selection never authorizes an increase.
The existing request shape cannot prove that history; the shared secret alone
is service authentication, not user consent.

## Resolved stub gaps and live connection requirements

- Both services use `api/fixtures/places.fake.json` in stub mode, and frontend
  lookups resolve these IDs. Eric's 45-place `data/places.json` remains intact;
  real and legacy IDs remain resolvable for earlier runs. The module declares
  `STUB_MODE`, defaulting to true, and uses real candidates only with explicit
  `STUB_MODE=false`. Do not flip it while the real Python solver is unavailable.
- Confidence previews use the existing PlanResponse shape, with canned scores
  clearly labeled. No inference is implied by the confidence ring.
- Council response messages are stored/replayed exactly once per logical
  message key. A returned HTTP stub is no longer mistaken for a live council.
- Server fallbacks check the cumulative sum against every cap. Completed plans
  and previews recheck current budgets inside the database transaction. Voting,
  roulette, and booking reject plans outside current budgets.
- Preference reparsing preserves existing caps against increases or removal.
  Tightening remains allowed. Delayed parses cannot overwrite newer text.
  Offer acceptance checks recipient, current run, positive bounded amount,
  correct units, and affordability for all members after the explicit change.

For a deployed backend to use this API, Eric must republish the updated module
with `STUB_MODE=true`, the matching `HUDDLE_SHARED_SECRET`, and a reachable
`FASTAPI_BASE_URL`. A cloud backend cannot reach a laptop's `127.0.0.1` address.
No service was deployed and no tunnel was opened by these changes. Once both
processes are reachable, health and private service calls use the shared secret;
no SpacetimeDB account or deployment token belongs in the Python service.

To check Eric's deployed shared secret, run the following in the terminal where
it is exported (it does not print the value):

```sh
/Users/maxli/Huddle/api/.venv/bin/python /Users/maxli/Huddle/api/eval/check_shared_secret.py
```

The checker also loads `api/.env`. It targets `https://maincloud.spacetimedb.com`, database
`huddle-calhacks`. It expects 401 without credentials and an authenticated 400
for an impossible booking ID. The handler looks up that ID before any insert,
so no booking or event is created. A missing environment value is reported
explicitly; a secret exported in another terminal is not inherited automatically.

## Honesty and disclosure handoff

The shared honesty/disclosure files should include these facts: nine fictional venues;
four canned preference fixtures; unchanged identity/update posterior; three
fixed itineraries; synthetic utility, robustness, pareto, council transcript and
timestamps; empty offers; no live council delivery. Dependencies: Python standard
library, FastAPI/Starlette, Pydantic, uvicorn, python-dotenv, httpx for checks (plus their transitive
dependencies); SpacetimeDB's native module test harness and Vitest for server
checks. Implementation assisted by OpenAI Codex. Official FastAPI, Pydantic,
and SpacetimeDB documentation was consulted. No external data/model API was called.
