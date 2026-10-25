# Coordinator contract

Implemented from the approved [agent flow](AGENT_FLOW_PLAN.md), October 24,
2026. This is an additive contract for agent huddles. Existing mathematical
endpoints, tables and legacy huddles remain compatible. Never encode agent
results as fake posteriors, robustness or utility ratios.

Venue snapshots, menus and catalog versions are implemented. Claude chooses
among itineraries Python has already validated; the team decided to keep this
design rather than have Claude construct and revise itineraries itself.

## Menu and provisional extension (October 24)

The implemented [menu extension](MENU_RECOMMENDATIONS.md) supersedes earlier
blanket evidence blocks and uniform per-person cost checks for `own_orders`.
It adds sourced menu/photo evidence, provisional status, untimed suggestions
and owner-private menu selections/totals. Legacy shapes remain compatible.
All current plan/suggestion IDs are valid voting choices, including provisional
and untimed options. Votes/Spin use `availableVotingChoices`; booking retains
strict `availablePlans`/`agentPlans` checks. Calendar meetup creation accepts a
current timed winner with explicit event consent, including provisional venues.
A vote never converts an unverified or untimed suggestion into a bookable
itinerary or raises a cap.

## Optional outing time (October 24)

New coordinator Huddles start without a date or window; legacy seed dates are
not used as calendar availability. The private `huddle_timing` table and scoped
`my_huddle_timing` view record `pending|calendar|manual` and an optional shared
host preference `flexible|morning|afternoon|evening`. The host changes it with
`set_huddle_time_preference`; changes clear the time and invalidate old choices.

Find plans checks the current participants' connected Google calendars when
available. Flexible searches the full day; selected day parts bound the search.
The default search spans the next seven days, not an assigned outing date.
`schedule_huddle.durationMinutes=0` means automatic length: one hour per preferred
stop plus a 15-minute allowance per transfer, capped by every saved private
duration limit. Flexible groups start from two stops (135 minutes). Explicit
lengths remain compatible; no member's time limit is raised automatically.
The module supplies the active venues' weekday opening/closing hours and visit
lengths to `/connectors/calendar/schedule`. Calendar candidates must contain a
complete meal visit inside one opening interval, not merely an arrival before
closing. Claude sees the supplied hours for later stops such as dessert; the
final itinerary independently validates every stop, travel and closing time.
Calendar errors/missing connections leave time unset until Find plans; then
`startAgentRun` assigns an automatic time (`source: auto`): the participants' most
common day part (Morning 09:00–12:00, Afternoon 12:00–17:00, otherwise Evening
17:00–22:00) on the next Pacific day it can start with an hour's notice. A later
calendar or manual choice replaces it. Every run therefore plans a concrete date and window.
The optional manual selection is explicit. No calendar event is created by
finding a time, and the venue's IANA timezone remains in data for correct hours,
DST and calendar writes without the old fixed location label in the interface.

`/agent/plan` still accepts `date:null, window:null` together, but then plans the
next evening (17:00–22:00 Pacific) itself. Every response choice is a timed plan;
`suggestions` is always empty, and the module drops any untimed suggestion (and its
private orders) from an older service. When nothing fits, the API widens the
window (later the same day, then 08:00–23:00), then ignores budgets, outing length
and first-leg travel. Opening hours, venue facts, exclusions, vetoes and destination
cities are never relaxed. Such plans are `provisional` and list what they fall
outside of in `relaxed` (`window|budget|duration|travel`). The module accepts only
declared relaxations on provisional proposals, so they can be voted on and added to
calendars but never booked. Legacy stored results may still hold untimed suggestions.

## Done and shared result

A complete ballot with a unique or Spin-resolved winner opens `/g/:groupId/done`.
Members see the selected route, outing date/time, venues and their own private
menu order. Every new winner is timed; only a legacy untimed venue winner shows an
unset time. Voting remains available to change a choice; changed needs invalidate
the old result. Calendar actions are explicit and preserve the existing opt-in,
current-winner and duplicate-event checks. A calendar-file download contains only
the public itinerary and uses a stable event UID and Berkeley timezone.

`createResultShare({runId,planId}) -> {shareId}` requires a current member and the
completed current winner; repeated creation reuses that result's link. The new
private `result_share` table stores its group/run/revision association.
`getResultShare({shareId}) -> {ok,resultJson?}` permits a nonmember to read an
explicitly shared result at `/result/:shareId`. JSON is strictly
`{date,timeZone,choice}` with whitelisted venue/route facts. It excludes orders,
prompts, context, caps, member names/IDs and arbitrary model prose. Reading grants
no membership. Unknown and stale links return the same unavailable result; needs,
run or ballot changes are checked again on each read. These links publish a
public itinerary; they are not account or invitation credentials.

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
| `preferredStops` | Integer 1–5 or null (Flexible); a soft preference, not a hard limit. Plans have 1–5 stops; a count that does not fit resolves to the nearest feasible count |

Lists of preferences, questions and warnings contain bounded plain strings.
Neither interpretation nor confirmation can raise/remove an established cap.
A first interpretation only establishes a cap when its owner confirms it.
The existing explicit, owner-only private-offer acceptance remains the only
permitted increase path; generating new agent trade offers is deferred.

### POST /agent/plan

Request: `runId`, `inputRevision`, ISO `date` and `window` with `start`/`end`
(or both null for an unscheduled outing),
`members`, `excludePlaceIds`, optional public `discussion` strings, and optional
`destinationCities` (supported city names; empty/omitted means flexible). The module
derives destination cities from participant location preferences: a unique most
frequent city wins; equal most-frequent cities remain alternatives. GPS and typed
city preferences each count once per participant. Python and the module both reject
out-of-city stops; a tied-city itinerary cannot cross between cities.
Each member supplies `memberId`, private `prompt`, confirmed `needs` from the
needs endpoint, and optional `origin` (`lat`, `lng`). Two or more members are
required. The module controls membership and confirmation, not model output.

Optional `catalog` (sent whenever the module holds a live venue snapshot, see
CONTRACT.md S5.5 "Live venue catalog"): `{version, places, evidence}`. `places`
is 3–160 contract Places with unique IDs and every stop category present. This bounded request is selected from the larger published pool (up to 320 stored venues); it includes all three areas when available and keeps menu-rich venues within each area. API responses must use only the IDs in this request, never arbitrary IDs from the stored pool.
The coordinator receives each venue's postal city, address and coordinates; destination requests in member prompts inform Claude's selection. Offered multi-stop candidates stay within one retrieval area. The city picker/GPS plurality rule now supplies the hard destination control. Real route timings remain a follow-up.
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
start/end, coordinates and catalog cost. Proposed coordinator visits are 60 minutes
each, without changing the stored venue estimates or the legacy solver. The
module accepts both 60-minute proposals and original catalog visit lengths during
rollout, while still validating every stop against hours, travel and outing limits.
A coordinator plan has one to five stops. Four- and five-stop plans add distinct activities around one meal and at
most one dessert, so a private order is still one meal item plus at most one
dessert item. A single-stop plan must be a meal venue: a dinner can fit a short outing
without forcing an activity or dessert. Both API and module validate this
additive count change; retained legacy templates/shapes are unchanged.
When members state `preferredStops`, timed candidates keep only the feasible
stop count nearest the mean of the stated values (Flexible members are not
averaged; a halfway mean favors the fuller outing). If the nearest count has no
feasible itinerary, the next nearest feasible count is used. Flexible-only
groups get one to three stops. Four- and five-stop routes come from a bounded
search (nearest feasible next stops, a per-template cap) instead of every
combination, so they are a strong sample, not an exhaustive list. Five stops
need five hours of visits plus travel; the automatic Calendar search now scales
with the chosen count. A shorter feasible route explains
the missing stops in `conflicts`, shown on both Options and Vote. New coordinator
responses use Eric Wu’s automatic timed fallback described above. A private
Time available warning says “Time may be tight: stopping 2 times usually needs
about 2 hours, plus travel.” The count and hour text follow the selected stops;
Flexible inputs do not trigger the warning. The red text and warning triangle
are guidance, not permission to exceed a cap.
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
selection errors allow one repair attempt. The menu coordinator has a 60-second
model-call budget inside a 90-second module HTTP timeout, with no extra HTTP
retry. Parsing and other service calls retain their shorter deadlines. Missing
evidence permits provisional suggestions; missing timed feasibility produces
provisional relaxed plans (above). Provider failure returns the first validated timed
candidates with each member's cheapest eligible items, labeled as not Claude's
choices. Validation feedback identifies a
failed candidate/member without relaxing their budget or returning private
context in the public result.

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
