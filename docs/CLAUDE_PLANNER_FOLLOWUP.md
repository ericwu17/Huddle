# Follow-up: Claude proposes and revises outings

Planned October 24, 2026 at Max's request. **Deferred; not implemented in this
change.** Eric Wu is currently building Bright Data → SpacetimeDB ingestion.
This plan changes the next planner design, not the live endpoint shapes or
current runtime. Keep local FastAPI + tunnel + Maincloud and one coordinator.
The broader demo-polish task remains open.

## Responsibility change

Today Python enumerates feasible itineraries, sends at most 120 of them to
Claude, and Claude selects IDs and public fact IDs. That implementation remains
live until its replacement is verified.

In the follow-up, **Claude constructs, compares and revises the itineraries**
using all members' current prompts, confirmed needs, public discussion and a
versioned venue snapshot from SpacetimeDB. It chooses venues, stop order and
proposed times and explains the trade-offs. Python does not generate a menu of
complete itineraries, rank preferences, choose a winner or reintroduce the old
feature/Bayesian/Monte Carlo pipeline.

Python validates hard constraints and factual consistency. Schema checks,
privacy boundaries, authentication and current-revision checks also remain;
these are correctness checks, not preference decisions. Maincloud continues to
own durable context, membership, progress, votes and booking state. The model
receives context through FastAPI; it does not get database credentials.

## Proposed interaction

1. Each member reviews and confirms their own current needs. The host explicitly
   requests plans. Maincloud snapshots membership, private inputs, public
   discussion, exclusions and a catalog version for this run/input revision.
2. Maincloud retrieves relevant venue records and evidence, then sends that
   context to stateless FastAPI. Bound the context by geography, outing window
   and request size; do not silently turn soft wishes into exclusion rules.
   If retrieval is incomplete, expose that limitation and support expansion
   before claiming no feasible outing exists.
3. Claude proposes up to three itineraries from the supplied venue IDs. It
   reasons about each person's preferences and may change stop order or venues.
   Scraped review/menu text is untrusted evidence, never agent instructions.
4. Python resolves the proposed IDs against the same snapshot and checks the
   requirements below. It returns structured failure codes and affected stops
   or members privately to the coordinator, rather than choosing another plan.
5. Claude revises rejected proposals using that feedback. For the first version,
   allow an initial proposal plus at most one repair within a shared model-call
   budget that fits the existing 20-second module deadline. Do not give each
   attempt a fresh 15 seconds. Persist status and provide explicit retry when
   the budget is exhausted; a longer workflow needs separately bounded jobs.
6. Publish only validated plans and grounded public explanations. Keep private
   prompts, caps, validation details and proposed private offers out of shared
   messages. Preserve the existing fact-rendering boundary unless its replacement
   has passed explicit privacy review; do not publish unrestricted model prose.
7. If repair cannot produce a valid plan, show a useful next action: expand the
   search, explain missing evidence or request an explicit compromise. A proposed
   compromise remains conditional and cannot be voted on/booked as a valid plan
   until approved and revalidated. There should be no unexplained null/dead-end
   screen, but the system must not manufacture feasibility.
8. Users vote on the current validated options. Tie-only equal-weight Spin,
   explicit host simulation and stale-result/late-callback guards stay in place.

## What Python must validate

- Every venue ID exists in the supplied snapshot. Costs, categories, coordinates,
  hours and cited evidence agree with that snapshot; Claude cannot invent facts.
- Resolve stop prices from the catalog and sum every stop's per-person cost.
  Reject inconsistent displayed totals and compare the full outing total against
  every member's non-null cap. Zero remains a real cap. Missing prices are not $0.
- Confirmed dietary needs, allergies and must-reject constraints are respected.
  Dietary checks apply to meals/desserts, not tagless activities. Unknown required
  evidence stays unknown, rather than being inferred from model knowledge.
- Opening hours, the outing window, stop durations, travel feasibility and explicit
  hard travel limits are satisfied, using clearly labeled estimates where applicable.
- Excluded/unavailable venues cannot return. Input revision, catalog version and
  current membership still match when results/actions are committed.
- Soft preferences do not become hard rejections. The model can propose compromises
  on negotiable wishes, but cannot silently relax confirmed hard requirements.

An established budget can increase only when its owner explicitly accepts a
current private trade offer. Prompt edits, host approval and Claude revision do
not raise it. Allergy or cross-contact evidence cannot be created by consent or
by a review mentioning a dish; unresolved safety evidence requires an appropriate
verification path. Do not tell users to delete a real allergy to continue.

## Handoff when Eric Wu finishes ingestion

### 1 Review Eric's actual implementation together

Obtain his commit, actual table/view names and read mechanism, plus a few sample
records (no API keys). Review the code after syncing main and agree on:

| Information | What must be clear |
| --- | --- |
| Stable venue IDs | Provider identifiers, deduplication and identity across refreshes |
| Basic facts | Name, coordinates, supported category/cuisine values and dietary labels |
| Prices | Currency, per-person meaning, estimate/range and unknown handling |
| Hours | Timezone, weekday/exception format, closed versus unknown |
| Evidence | Source URL, fetched-at time, what is actually verified, and unsupported claims |
| Refresh behavior | Catalog version, last valid snapshot, partial/failed scrape behavior |
| Database access | Module job reads approved records; browser sees only appropriate public facts |

Table names, field mappings, version representation and read calls depend on his
implementation. Do not invent them or change his schema before reviewing it.

### 2 Agree the coordinated contract change

The existing `/agent/plan` request does **not** carry venue records and currently
reads `data/places.json`; module validation uses bundled `LIVE_PLACES`. Add a
versioned catalog/evidence snapshot to the planning boundary and define the
structured proposal/validation feedback, progress and compromise states across
API, Maincloud and UI. Preserve existing result fields where possible; document
and coordinate any necessary shape changes before implementation. No live shapes
are changed by this document.

Eric owns ingestion/refresh. Max owns this planner integration and validation.
Eric Chen owns the UI for proposal/revision/conditional-compromise states and
coordinates any view/binding changes. Avoid overlapping Eric Wu's ingestion edits.

### 3 Wire the database snapshot through the existing path

Maincloud job → authorized venue/context snapshot → FastAPI → Claude proposals
→ Python validation/feedback → current result stored in Maincloud → realtime UI.
Use the same catalog version for proposal validation and commit-time checks.
Define whether a refresh invalidates a pending run or the run uses a retained
immutable snapshot; never mix prices/hours from different versions silently.
Review all catalog lookups, including booking/replacement validation, so newly
scraped IDs are not rejected by a remaining bundled-file lookup. FastAPI stays
database-independent; no database token or shared secret goes into the browser.

### 4 Verify before shared rollout

- [ ] A newly scraped venue absent from the old JSON reaches Claude and can become
  a validated itinerary stop; this proves the new data path is actually used.
- [ ] Claude constructs an itinerary rather than selecting preassembled plan IDs;
  a rejected proposal is revised using specific validation feedback.
- [ ] Costs, category mappings, hours and null/unknown values survive ingestion
  and round-trip correctly; current cumulative budgets still hold.
- [ ] Two groups remain isolated; a budget/input change during planning and a
  catalog refresh cannot commit stale results or enable old votes/bookings.
- [ ] Full/closed venue replacement excludes that venue and requires a new vote
  and host simulation action. No automatic booking or real calls.
- [ ] No feasible plan produces an actionable conditional compromise or evidence
  request, never a silently relaxed hard restriction or unexplained empty screen.
- [ ] A scrape failure uses only the last validated snapshot with an honest
  freshness label; missing allergen evidence and actual availability remain explicit.
- [ ] Model errors/timeouts and repair limits have readable retry states without
  leaking private inputs. Private compromise acceptance is owner-only and current.
- [ ] Isolated connected checks pass, then sync main, publish additive shared
  changes without a data reset, release the coordinated UI and rehearse on phones.

Eric's finished ingestion is the handoff point, not proof the planner uses it.
Integrate and prove that data path first, then implement the deferred Claude
propose/validate/revise loop against the agreed snapshot contract.
