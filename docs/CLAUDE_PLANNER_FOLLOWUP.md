# Follow-up: Claude proposes and revises outings

Current menu extension: [MENU_RECOMMENDATIONS.md](MENU_RECOMMENDATIONS.md). Sourced menu orders, private personal totals, photos,
provisional suggestions and untimed alternatives are implemented. The full
Claude propose/revise loop and takeout/seating remain follow-ups. This update
supersedes older blanket allergy-block and personal-cost deferral notes below.

Planned October 24, 2026 at Max's request. **Deferred; not implemented in this
change.** Eric Wu is currently building Bright Data → SpacetimeDB ingestion.
This plan changes the next planner design, not the live endpoint shapes or
current runtime. Keep local FastAPI + tunnel + Maincloud and one coordinator.
The broader demo-polish task remains open.

**Catalog handoff checkpoint:** main `156697c` now supplies the existing
`AgentCatalog` snapshot contract, `venue`/`catalog_state`, public catalog views
and authenticated atomic catalog push. This code is merged with accounts/
connectors and verified with 130 active venues in `huddle-account-max-check`;
new scraped IDs reach FastAPI/Claude and public rating metadata. Shared rollout
is pending. The handoff questions below about that basic snapshot are resolved;
menu/photo/takeout/seating evidence, individual meal assignments and the full
Claude propose/validate/revise loop remain follow-ups. `details.json` is a
collected file, not already an active planner contract.

Subsequent [preference/acceptance planning](PREFERENCE_ACCEPTANCE_PLAN.md)
proposes optional budget/time sliders, an optional prompt, flexible defaults and
one Save & ready action instead of a mandatory separate review/confirm sequence.
It separates input ambiguity from venue-evidence gaps. The preference changes
are now implemented on the isolated review branch; the planner rewrite below
remains a follow-up awaiting the versioned catalog contract.

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
- Apply Max's approved follow-up cost rule: each person pays for their own meal
  and their own costs at subsequent stops, including dessert. A person does not
  pay for somebody else's meal when the group splits its meal choices. Sum each
  person's assigned costs across the entire outing and compare that person's
  total against their own non-null cap. Reject inconsistent displayed totals;
  zero remains a real cap and missing prices are not $0. The assignment/item-price
  representation still requires coordinated contract review before implementing
  this rule; the current shared-stop runtime contract remains unchanged.
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

**Eric-reported handoff, pending source and sample-record verification:** Eric
reports that `collect.py` lines 408–433 preserve name, address, coordinates,
phone, category, cuisine, hours, rating, review count and inferred dietary tags.
He reports `priceLevel` remains null without Yelp data and meal costs default
to $25. These are his reported implementation details, not independently
verified claims in this document or an agreed planner wire contract.

He also reports that `/catalog` includes evidence source URL/fetch time and
ratings, while review text and star distributions are **not** included in that
catalog. Photos would require normalizing `main_image` and adding a reviewed
`Place` field; the planner/UI must not assume photos already arrive in the
snapshot. Confirm exact field names, meanings and response shapes in his code
and representative records before wiring them through Maincloud and FastAPI.

For the meal-quality example below, the priority gaps are specific menu items
and prices, takeout support and suitable shared seating. Additional reviews are
secondary context; reviews alone do not establish those facts. Inferred dietary
tags do not verify a vegan meal, an allergen claim or cross-contact safety. A
default $25 meal estimate cannot prove that the person's actual meal and later
stops fit a hard cap. Preserve estimate/unknown labels and request the necessary
evidence instead of presenting these values as verified prices or capabilities.

| Information | What must be clear |
| --- | --- |
| Stable venue IDs | Provider identifiers, deduplication and identity across refreshes |
| Basic facts | Name, coordinates, supported category/cuisine values and dietary labels |
| Prices | Currency, actual item prices versus defaults/estimates, assignment to each person, ranges and unknown handling |
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

The personalized payment rule is approved; its representation is not yet agreed.
Review meal/stop participant assignments, item quantities/prices, evidence and
each member's full-outing total together. A shared per-person stop cost and an
entire party's bill are different quantities. Do not repurpose the existing
single `costPerPerson` field to carry a member-indexed total or silently charge
everyone for all alternative meals.

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
  and round-trip correctly. Under the reviewed personalized-cost contract, each
  person's own meal plus later-stop costs fit their own cumulative cap; another
  person's meal is not added to it. Defaults such as a $25 meal estimate do not
  become verified item prices or proof of actual affordability.
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

## Current acceptance example: a real meal for everyone

Max's October 24 review clarifies the desired quality of Claude's reasoning:

- Max wants vegan food, at most $30 for the whole outing.
- Eric wants steak and fries, at most $50 for the whole outing.
- Eric Chen wants good dessert afterward, within three hours for the whole trip.
- Compare three distinct, independently viable options when the facts support
  them. A full vegan meal at a takeout venue may be a better experience than a
  salad at a steak restaurant; Claude should weigh this nuance and explain it.
  Python validates the hard requirements rather than deciding whose taste wins.
- A split-meal suggestion requires verified takeout support at the meal venues
  **and** a suitable nearby place where the group can actually sit and eat.
  Do not assume every park has accessible seating or permits food at that time.
- A dine-in alternative needs specific evidenced vegan meal options and steak/
  fries at the same venue. A generic vegetarian tag does not prove a vegan dish.
- Add a dessert venue, an achievable route, itemized costs and timings. Do not
  impose a separate activity just to fill an old itinerary template.

The intended public response is a useful conversational suggestion, such as
explaining the two nearby takeout choices, the evidenced shared seating and
where dessert fits afterward. This is an example of response structure, **not**
a claim that any real venues have been verified for this example. Do not expose
private participant prompts, caps or sensitive restrictions in shared prose;
show each owner the relevant private match details. Public explanations should
cite actual venue/menu/route facts and stay grounded in the agreed snapshot.

Each option should show place photos with source attribution, cached/current
rating and review count, the specific menu evidence behind each meal fit, source
freshness, travel and the reason for the trade-off. Unsupported information must
stay visibly unknown. Three viable alternatives are a goal, not permission to
pad with unsupported options or silently drop a restriction.

**Implemented in the branch input/selection step:** optional limits, saved
context, meal → dessert options, cached rating/review-count/source context for
Claude, and cached ratings on place cards. The original catalog currently has
no verified vegan/menu-item, photo, takeout or shared-seating evidence; this
specific example correctly stops at a dietary-evidence gap. The current public
coordinator message is assembled from selected factual sentences, not free-form
Claude prose. The full nuanced proposal/revision response remains this follow-up.

**Cost rule approved; contract implementation remains a follow-up:** Max has
confirmed that each person pays for their own meal plus the stops afterward,
such as their dessert. They do not pay for the other person's meal. This remains
a cumulative outing budget, rather than an independent budget at each stop;
caps cannot be pooled or averaged between people. Split-meal plans therefore
need reviewed participant assignments and evidenced item prices before the
API/module/UI can validate and display the right individual totals.

The existing runtime still charges the same sum of its shared stops against
every person's cap. Keep that contract unchanged until the coordinated update
is documented and tested. For an explicitly synthetic arithmetic check, meals
of $20 and $40 followed by an $8-per-person dessert imply individual outing
totals of $28 and $48, not $68 each. This example asserts no real venue prices
and does not establish a proposed wire shape.
