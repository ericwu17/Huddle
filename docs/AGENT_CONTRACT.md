# Coordinator contract

Implemented from the approved [agent flow](AGENT_FLOW_PLAN.md), October 24,
2026. This is an additive contract for agent huddles. Existing mathematical
endpoints, tables and legacy huddles remain compatible. Never encode agent
results as fake posteriors, robustness or utility ratios.

The [propose/validate/revise follow-up](CLAUDE_PLANNER_FOLLOWUP.md) is planned,
not part of this implemented wire contract. Venue snapshots, menus and catalog
versions are implemented; arbitrary itinerary construction and structured
propose/revise feedback remain a coordinated follow-up.

## Menu and provisional extension (October 24)

The implemented [menu extension](MENU_RECOMMENDATIONS.md) supersedes earlier
blanket evidence blocks and uniform per-person cost checks for `own_orders`.
It adds sourced menu/photo evidence, provisional status, untimed suggestions
and owner-private menu selections/totals. Legacy shapes remain compatible.

## FastAPI

Both endpoints require the existing `X-Huddle-Secret` and use the configured
Claude API key. Schemas are validated by `api/agent_models.py` and exposed in
the authenticated `/openapi.json`. No database calls occur in agent functions.

### POST /agent/needs

Request: `memberId`, private `text` (1–4000 characters), and `currentHard`
(the last confirmed hard requirements, or null).

Response: `hard`, `preferences`, `questions`, `warnings`. Questions are blocking
private clarifications. Qualitative wishes are preferences; unsupported review
aspects receive limitations rather than invented scores.

`hard` contains:

| Field | Shape |
| --- | --- |
| `budgetMaxPerPerson` | Nonnegative number or null; whole-outing per-person cap |
| `dietary` | Array of supported dietary tags |
| `allergies` | Array of stated allergies; missing venue evidence makes food suggestions provisional |
| `vetoCuisines` | Array of refused cuisine families |
| `vetoCategories` | Array of refused stop categories |
| `rejectedTerms` | Array checked against catalog names/category/cuisine labels; not ingredient verification |
| `maxTravelMinutes` | Nonnegative first-leg travel limit or null; requires an origin to verify |

Lists of preferences, questions and warnings contain bounded plain strings.
Neither interpretation nor confirmation can raise/remove an established cap.
A first interpretation only establishes a cap when its owner confirms it.
The existing explicit, owner-only private-offer acceptance remains the only
permitted increase path; generating new agent trade offers is deferred.

### POST /agent/plan

Request: `runId`, `inputRevision`, ISO `date`, `window` with `start`/`end`,
`members`, `excludePlaceIds`, and optional public `discussion` strings.
Each member supplies `memberId`, private `prompt`, confirmed `needs` from the
needs endpoint, and optional `origin` (`lat`, `lng`). Two or more members are
required. The module controls membership and confirmation, not model output.

Optional `catalog` (sent whenever the module holds a live venue snapshot, see
CONTRACT.md S5.5 "Live venue catalog"): `{version, places, evidence}`. `places`
is 3–160 contract Places with unique IDs and every stop category present.
`evidence` maps place IDs to `{sources: [{source: gmaps|yelp|google_places,
url (https or null), fetchedAt, rating, reviewCount}]}`. When present, the API
plans from those places only and the module validates the reply against the
same snapshot. Without it the API uses the catalog it loaded at startup. One
public fact uses evidence: the meal venue's scraped rating, review count, source
and fetch date. It appears only when the evidence records all of these.

Response:

| Field | Shape |
| --- | --- |
| `mode` | Literal `agent` |
| `runId`, `inputRevision` | Echo the exact request context |
| `plans` | Zero to three validated distinct itineraries |
| `recommendedPlanId` | One of the returned IDs, or null when blocked |
| `rationale` | Grounded public explanation of the recommendation |
| `conflicts`, `warnings` | Bounded public messages with no private prompt/cap disclosure |

Each plan contains `id`, `title`, `stops`, `costPerPerson`, `whyLine`,
`limitations`, `travelMinutes`. Stops retain the known place ID/name/category,
start/end, coordinates and catalog cost. A coordinator plan has one to three
stops. A single-stop plan must be a meal venue: a dinner can fit a short outing
without forcing an activity or dessert. Both API and module validate this
additive count change; retained legacy templates/shapes are unchanged.
The legacy public baseline equals the sum of every stop. For `own_orders`,
private menu totals govern individual caps; see the extension above.
Prices and travel are explicitly estimates. There is no score or posterior.

Code enumerates feasible catalog itineraries and validates whole-outing caps,
dietary requirements on meals/desserts, opening times, first-leg limits,
rejected names/categories/cuisines and exclusions. The coordinator gets every
member's confirmed prompt and chooses from at most 120 supplied itineraries.
The candidate bound retains low-cost options plus a deterministic sample of
the feasible catalog; this does not guarantee a global preference optimum.

Claude returns candidate IDs and public fact IDs only. Code renders those facts
into public explanations. Arbitrary model prose is never published. Schema or
selection errors allow one repair attempt within a 15-second model-call budget;
missing credentials, timeout or invalid output yield explicit 503/502 errors,
not synthetic recommendations. Missing evidence permits provisional suggestions. Missing timed feasibility permits
untimed venue alternatives; provider failure has explicitly labeled catalog ideas. Each module HTTP call has a 20-second timeout and no extra
agent-route HTTP retry.

## SpacetimeDB

New private tables: `agent_session` (group revision/status/current run),
`agent_need` (member prompt, interpretation, confirmation and private error),
`agent_needs_job` and `agent_plan_job` (private scheduled jobs). Existing storage
is not reset. `plan_run.resultJson` holds the discriminated agent response;
legacy result shapes remain unchanged for legacy groups.

| Action / view | Behavior |
| --- | --- |
| `create_agent_group(name?)` | Create a group with coordinator state; the caller still joins as a participant |
| `submit_agent_prefs(text)` | Owner-only prompt submission; invalidate old results immediately and schedule interpretation |
| `confirm_agent_needs(revision)` | Owner confirms the exact current summary; reject stale revision or unresolved input questions |
| `find_agent_plans()` | Host-only; require all current needs confirmed, then snapshot and schedule planning |
| `post_agent_discussion(text)` | A deliberately shared participant message on the current ready run; considered on the next explicit generation |
| `my_agent_session` | Current group's public status and confirmed member IDs only |
| `my_agent_needs` | Only the caller's current private prompt/result/confirmation/error |

An input or origin update increments the context revision and clears the active
choice. Late interpretation and plan replies are rejected. A new run after an
unavailable venue excludes it, preserves confirmed needs and requires new votes.
New mode does not schedule legacy swipe, offers, scout or council jobs.

Existing `vote`, `do_roulette`, `start_booking` and callback routes remain.
Agent-mode Spin requires everyone to vote and a tie, uses equal weights among
current leaders, and persists a vote signature. A new vote clears that Spin.
Booking requires the host, a complete current choice and no duplicate active
booking for the run; queued dispatch rechecks the current choice. Agent bookings
always use the module simulation even if a separate voice URL is configured.
Terminal/old callbacks cannot advance a newer group run. No booking is automatic.

## Frontend and test clients

New frontend starts call `create_agent_group`. Existing `create_group` remains
available to legacy clients. Agent navigation is Join -> Private needs ->
Coordinator & plans -> Vote -> Booking simulation. Plans and discussion remain
accessible after voting opens. Legacy navigation remains for legacy huddles.

Regenerate `web/src/module_bindings/` from `server/`; do not hand-edit it.
`scripts/agent-smoke.mjs` tests this contract through real Maincloud jobs.
`scripts/demo-friends.mjs` detects coordinator mode and supplies explicitly
simulated participants; they confirm seeded needs and vote, but never swipe,
trigger host planning or book for the presenter.
