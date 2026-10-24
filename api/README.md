# Huddle Python API — phase zero

Only `api/` belongs to this implementation. Max confirmed the hacking period had
started before implementation. This is a separate Python 3.11+ FastAPI service;
it has no database dependency, external API calls, LLM calls, Bayesian update,
Monte Carlo, real solver, or live council. All venue data and scores are fake.

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
The app reads exported environment variables, not `.env` files automatically.

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
| `POST /plan` | Three fixed itineraries, Safe/Bold/Budget with totals $18/$20/$14; filters fixtures against each member's constraints. May return fewer or none. If the original Safe is removed, the highest-scored remaining fixture receives kind `safe`. |
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
tags, opening intervals, the requested time window, and the initial travel cap
when origin is supplied. First-leg travel is a simple synthetic straight-line
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

1. `preview=true` says to return only the top robustness but defines no response
   object. Phase zero returns 409; agree on that response before implementing it.
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

## SpacetimeDB handoff (decisions still required)

Eric can connect a **trusted server-side caller** to these HTTP contracts using
`FASTAPI_BASE_URL` and the shared secret. For each call, assemble one consistent
snapshot: member IDs/names, private hard constraints and posteriors, optional
origins, date/window, excluded places, `runId`, and documented options. The solver
does not fetch or write database state. Store response IDs with that run; reject
stale results according to an agreed version policy. Replan uses a new runId and
accumulated excluded place IDs.

`CouncilDelivery.deliver(CouncilMessage)` in `delivery.py` is an **internal Python
seam**, not a proposed database endpoint. `LocalCouncilDelivery` is fresh per
request and discards its collector after response. Eric and Max still need to
agree on transport (push or response ingestion), endpoint/module/reducer names,
payload envelope, authentication, timeouts, ordering, retry and deduplication
keys, and stale-run behavior. There is no automatic retry or exactly-once claim.
The current final response includes the transcript so it can be inspected locally;
do not ingest both an adapter stream and response transcript without deduplication.

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

## Integration check against main `2a98c18`

Eric's SpacetimeDB scaffold merges without overlapping API file changes. This is
a source-level compatibility review, not an end-to-end SpacetimeDB test. Setting
`FASTAPI_BASE_URL` is **not yet a working integration switch** for this phase:

- `server/src/lib/places.ts` loads `data/places.fake.json`; this API uses its own
  `stub_*` IDs. `/elicit/next` rejects unknown IDs, and the server cannot resolve
  API stop IDs through its own place catalog. Agree on one synthetic catalog.
- `server/src/prefs.ts` calls `/plan` with `preview=true` and reads
  `plans[0].robustness`. That establishes the caller's current expectation, but
  the shared preview specification is still ambiguous; this API returns 409
  until the shape is agreed, as documented above.
- `server/src/lib/api.ts` labels every successful HTTP response `stub:false`
  without reading `X-Huddle-Stub`. `server/src/council.ts` then assumes messages
  were already delivered externally and skips the response transcript. This API
  delivers only to its request-local adapter, so messages would not be stored.
  Main now documents a `POST /v1/database/{database}/route/council-message` route;
  activation, retry/deduplication behavior, and stub handling still need agreement.
- `server/src/lib/fakes.ts` creates fallback plans without checking member
  cumulative caps. The API's guarantees do not extend to that separate fallback.
  `server/src/plans.ts` can use it after a failed API plan call. Eric must apply
  the authoritative cumulative-budget rule there before relying on that path.
- `server/src/prefs.ts` replaces stored hard constraints with each parse result.
  It must preserve an existing budget cap against increases unless the owner
  explicitly accepted a private offer. The API cannot verify that history from
  the current parse request alone.

These findings do not change shared shapes, activate a transport, or edit
teammates' files. They are handoff blockers for wiring the services together,
not textual Git merge conflicts.

## Honesty and disclosure handoff

Eric owns the shared documentation, so nothing outside `api/` was edited. Copy
these facts into the team's honesty/disclosure files: nine fictional venues;
four canned preference fixtures; unchanged identity/update posterior; three
fixed itineraries; synthetic utility, robustness, pareto, council transcript and
timestamps; empty offers; no live council delivery. Dependencies: Python standard
library, FastAPI/Starlette, Pydantic, uvicorn, httpx for checks (plus their transitive
dependencies). Implementation assisted by OpenAI Codex. FastAPI/Pydantic public
documentation was consulted. No external data or model API was called.
