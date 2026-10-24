# Preference input and acceptance scenarios

Approved by Max for implementation, October 24, 2026. Optional inputs, private
structured limits and Save & ready are implemented on the isolated review branch;
verification is recorded in [ACCOUNTS_RUNBOOK.md](ACCOUNTS_RUNBOOK.md). The full
P01–P30 table remains an acceptance specification, not a claim that every later
planner/data scenario is implemented. Eric Wu owns Bright Data → SpacetimeDB. The
[Claude planner rewrite](CLAUDE_PLANNER_FOLLOWUP.md) stays a deferred follow-up.

## Proposed input experience

Use optional structured controls for limits, plus an optional prompt for context.
One **Save & ready** action replaces separate lobby readiness, Review my needs
and Confirm my needs actions in the ordinary path. Joining shows people and shared outing settings; account huddles use addressed
in-app invitations. Merely joining or loading the form does not
mark anyone ready.

| Input | Default | Meaning and behavior |
| --- | --- | --- |
| Budget cap | Flexible; no cap stated | Optional slider with an exact amount input. Label “Maximum per person for the whole outing.” Show all-stop total, never a per-stop cap. Selecting a value is an explicit hard limit. |
| Time available | Flexible within the group's outing window | Optional duration slider with exact minutes input. Label “Maximum outing length,” for example “Up to 2 hours from the group start.” Includes stops, waits and travel between stops. This is not a travel-to-venue limit. |
| Dietary needs / allergies / must-avoids | No restrictions provided | Optional Add restriction controls/chips for direct entry; they must also work when stated in the prompt. An explicit allergy remains hard. |
| Anything else? | Empty | Optional prompt for food, activities, atmosphere, context or additional restrictions. Example: “Burgers, somewhere quiet, and a walk afterward.” |

The group start/end and date are shown separately. If a person states a departure
deadline, derive their available window from that explicit deadline; ask only if
its interpretation is genuinely ambiguous. A hard maximum travel-to-first-stop
limit belongs in an optional separate control and needs a starting location.
Do not request location for a duration limit or a soft “nearby” wish.

Sliders must have an explicit Flexible/no-cap state, readable current value,
keyboard support and an exact numeric alternative. A default thumb position must
not silently create a cap. Zero budget is a real $0 cap, not the Flexible value.
Use a number field for values outside the visible slider range rather than
silently clamping them. Final ranges/steps are UI decisions before implementation.

## Defaults and ownership

- On a first submission, an omitted option means open to anything for that
  dimension. Do not ask users to complete unused fields or generate inferred
  budget, cuisine, activity, dietary, duration or travel restrictions.
- A completely empty optional form is valid when its owner clicks Save & ready:
  record a flexible participant without a preference-extraction model call.
  Claude still considers that participant when proposing the group outing.
- “No allergies” is an explicit negative declaration. Omitted allergies mean
  “No restrictions provided,” not a claim that the user has no allergies or that
  a venue is allergy-safe. Neither case should create a generic allergy question.
- An omitted field on a later edit does not erase a restriction already stated
  elsewhere or previously saved. Retain an established cap; removing or raising
  it still requires owner acceptance of a current private trade offer. Do not
  let a Flexible toggle bypass that rule. Other restrictions require explicit
  owner edits to remove; silence or model failure is not a removal.
- Structured limits are direct user input, not numbers for Claude to reinterpret.
  Contradictory text/controls require one focused private resolution before
  accepting the affected hard requirement. Never let a host edit invitees' needs.
- Foods, atmosphere and activity wishes are soft unless explicitly stated as
  non-negotiable. Dietary requirements, allergies and clear must-rejects remain
  hard. Do not veto an entire cuisine family because someone dislikes one dish.
- Saving a later change immediately invalidates superseded plans/actions. An
  unsaved draft may be edited freely, but must not be presented as applied.

## Do users need a separate preference confirmation?

**Recommended default: no separate review screen or mandatory second click.**
Show an editable private summary inline, with directly entered limits visible.
The owner's Save & ready action authorizes those explicit inputs for this outing.
For a nonempty prompt, interpret it, preserve explicit limits and save the
summary. If the interpretation is unambiguous, mark the member ready and keep
the summary editable; a model response does not count as an independent approval
to change limits. Do not mark them ready before required interpretation completes.

If the prompt introduces a consequential ambiguity, save it and ask one focused
question beside the relevant field. Only that unresolved input needs attention.
The member's answer completes the same submission; do not restart a full form
or force everyone to reconfirm unchanged needs. Batch only essential questions;
avoid a repeated generic preference interview.

Examples:

| Situation | Proposed behavior |
| --- | --- |
| Budget slider set to $25 | Save as a hard $25 whole-outing cap; no Claude approval step. |
| Blank prompt, untouched sliders | Save as flexible after the owner clicks Save & ready. |
| “Somewhere quiet” | Record a soft wish; no question asking for a numeric noise threshold. |
| “Avoid peanuts” with no other context | Ask privately whether this is an allergy/strict restriction or a preference; do not make an allergy-safety claim while unresolved. |
| Explicit peanut allergy chip | Save the stated restriction without asking whether the user really means it; missing venue evidence is handled separately. |
| Initial slider says $20; prompt says “under $30” | Ask which cap the user intended. If a $20 cap was already established, keep it; a question is not a substitute for private-offer acceptance. |
| Claude is unavailable | Keep directly entered limits and the prompt. Offer Retry for unresolved interpretation; do not silently discard possible restrictions from a nonempty prompt or pretend the model ran. |

The branch implements coordinated input/readiness contracts rather than only
removing a button. Explicit requirements extracted from text remain visible and
correctable. Legacy submit/confirm contracts remain for old clients; shared
release awaits Max's branch review.

## Keep the experience moving when data is missing

Separate the person's input state from the venue's evidence state:

- A clearly entered allergy is understood input. Do not keep asking the person
  to rewrite it because the catalog lacks evidence.
- Continue gathering everyone else's inputs and show planning progress. The
  deferred planner can present conditional ideas, activity alternatives and a
  targeted venue-verification next step rather than an unexplained empty screen.
- A venue with unresolved required evidence is not a validated food stop. Label
  any draft “Needs venue confirmation,” identify what is missing, and keep it
  out of the final selectable/bookable plan until validation can succeed.
- Show “Please clarify your request” only for input ambiguity. Show “Venue
  information missing” for data gaps, “These limits conflict” for infeasibility,
  and “Service unavailable—retry” for provider/network errors.
- Do not reveal whose private cap/allergy caused a group-wide status. Detailed
  questions and compromise offers remain private to the affected member.

Scraping increases evidence and candidates, but reviews/menu mentions do not
certify allergen/cross-contact safety. A confirmation click cannot create missing
venue evidence. No conditional compromise silently raises a cap or removes an
allergy. An infeasible outcome must offer a next action, not a fabricated plan.

## Acceptance scenarios (planned, not executed)

These are behavioral specifications for the next implementation, not passing
test results. Assert inputs, limits, state and source-backed facts; do not assert
identical Claude prose, exact venue ordering or an invented satisfaction score.
All venues/prices in examples are synthetic fixtures, not live Berkeley claims.

### Input, defaults and clarification

| ID | Scenario | Required outcome |
| --- | --- | --- |
| P01 | Empty prompt, no options set, first submission | Save & ready works; all dimensions remain flexible; no extraction call or clarification. Loading the page alone never marks ready. |
| P02 | “Burgers and fries” only | Food request recorded as a wish; no inferred cap, dietary need, travel limit or mandatory activity. Other options stay flexible. |
| P03 | Budget slider $25, empty prompt | $25 whole-outing cap is saved directly; no second confirmation/model interpretation. Private summary shows $25. |
| P04 | Budget explicitly $0 versus untouched budget | $0 only accepts zero-cost eligible outings; untouched means no stated cap. Neither value is confused with the other. |
| P05 | “No allergies or dietary restrictions” | No positive allergy/dietary requirement or spurious follow-up is created. Do not infer venue safety. |
| P06 | “Quiet, outdoors if possible, not too far” | Soft wishes remain soft; no numeric noise threshold or location question blocks readiness. Unknown venue aspects are labeled. |
| P07 | “I dislike sushi” versus “No sushi, must avoid it” | First is a negotiable dislike; second is a hard dish exclusion. Neither automatically excludes all Asian restaurants. Missing menu evidence remains explicit. |
| P08 | Structured peanut allergy plus a normal food wish | Input is saved once; no redundant allergy-meaning question. Venue evidence is evaluated separately from input readiness. |
| P09 | “Avoid peanuts,” meaning unclear | One targeted private question; no assumption that it is merely a dislike or that any venue is safe. Other members can finish their inputs. |
| P10 | Contradictory first-submission budget slider and prompt | One private clarification resolves the intended initial cap. No silent overwrite or multiple generic questions. |
| P11 | Existing $20 cap; later prompt is blank, says Flexible or says $30 | Existing $20 cap remains. Any increase/removal requires that owner's current private-offer acceptance, not model output or host action. |
| P12 | Member never clicks Save & ready; host tries to proceed | No consent/readiness inferred from an untouched form. Show waiting status, not a mandatory preference questionnaire. |

### Time, costs, categories and evidence

For arithmetic cases use a synthetic meal costing $12 (45 minutes), a free
activity (30 minutes), dessert costing $4 (20 minutes), and two 10-minute travel
legs. The example outing costs **$16 per person** and lasts **115 minutes**.
Optional paid activity costs $5; a second meal costs $16; another venue has an
unknown price. These fixtures have explicit hours and evidence supplied by each
case, not facts inferred from their names.

| ID | Scenario | Required outcome |
| --- | --- | --- |
| P13 | Caps $25/$20/null; example $16 outing | All caps pass; one uncapped participant does not override another's cap. Total equals $12 + $0 + $4. |
| P14 | Same caps; meal $12 + paid activity $5 + dessert $4 | $21 outing fails the $20 cap even though every individual stop is under $20; Claude revises or proposes an explicitly approved compromise. |
| P15 | Maximum outing length 120 minutes versus 90 minutes | The 115-minute example passes 120, fails 90, counting both travel legs. No starting-location request for duration alone. |
| P16 | Travel-to-first-stop maximum 15 minutes, no origin | Request origin privately or an explicit correction; do not substitute outing duration or ignore the hard travel limit. |
| P17 | One vegetarian member, burger-loving flexible member, tagless activity | A venue with evidenced vegetarian burger options can satisfy both; the activity survives dietary filtering. Do not require every member to like the same dish. |
| P18 | Vegan/halal/gluten-free requirement; catalog only has vegetarian labels | Do not map it to vegetarian or claim compatibility. Retrieve evidence/alternatives and show the precise missing fact. |
| P19 | Explicit allergy; only reviews or absent allergen fields available | No allergy-safe claim. Show conditional ideas/verification action; no validated food plan containing an unresolved required stop. |
| P20 | Test fixture supplies scoped allergen evidence | Validate against that evidence's exact scope/freshness; no generic “safe for all allergies” inference. This fixture does not establish real-world certification. |
| P21 | Only an activity requested, no meal or dessert requirement | Do not invent a meal requirement. Future plan shape must support the approved outing form; current two/three-stop and meal-template limits need coordinated review. |
| P22 | Desired dish, outdoors or quiet lacks source evidence | Claude may explain a tentative fit, but cannot assert the dish/attribute is verified. Review-aspect placeholders must not become factual matches. |
| P23 | Closed stop, unknown hours, unknown price, stale source | Distinguish each reason. Never treat unknown price as free or unknown hours as open; show a draft/evidence request when needed to verify a hard limit. |

### Revision, compromise and privacy

| ID | Scenario | Required outcome |
| --- | --- | --- |
| P24 | No validated complete plan after bounded model repair | Offer specific conditional compromises, broader search or venue verification; no unexplained null result. No automatic approval/booking. |
| P25 | Only a soft wish conflicts, such as quiet versus lively | Claude proposes alternatives/trade-offs without forcing users to answer more questions or labeling soft wishes as hard vetoes. |
| P26 | User lowers $25 cap to $15 while a plan is being generated | Superseded results/actions are invalidated immediately on save; the $16 example cannot become current. Other unchanged members need not resubmit. |
| P27 | A private clarification or budget offer is needed | Only its owner sees details and can accept. Other participants see a neutral progress state; public explanations contain no private prompt/cap. |
| P28 | Two concurrent huddles or a catalog refresh during a run | Context is isolated; commit uses the correct input revision and catalog snapshot/version. No mixed records or stale votes/booking. |
| P29 | Claude timeout or invalid interpretation | Explicit retry state preserves the prompt and structured fields; no invented successful interpretation, lost restriction or duplicate booking. |
| P30 | Venue becomes full after voting | Exclude it, propose/revalidate replacement, require fresh votes and explicit host simulation. Preserve all restrictions, including those not repeated in the latest prompt. |

## Current evidence and gaps

Code/catalog review and two local synthetic diagnostics on October 24 found:

- `api/agent_models.py` currently rejects empty prompt text. The UI also disables
  submitting a blank prompt and requires a separate confirmation action.
- `api/agent.py` blocks any allergy before planning. Its lexical fallback matches
  “allergies” even in “No allergies”; a fake model returning an empty allergy list
  reproduced a spurious clarification. This is a confirmed negation-guard issue,
  not evidence that a live Claude call misread the sentence.
- The current catalog contains no allergen fields, only vegetarian dietary tags,
  broad cuisine families and flat 0.5 review-aspect placeholders. Specific menu
  items and richer dietary/atmosphere evidence are missing.
- There is no per-person maximum whole-outing-duration field; existing
  `maxTravelMinutes` means first-leg travel, not total outing duration.

See the review runbook for executed unit/native/connected/browser checks.
Conditional ideas, scoped allergen evidence, activity-only plan shapes, catalog
version integration and bounded Claude repair are still follow-ups; do not mark
P01–P30 all complete from the account/preference verification.

## Implementation sequence when approved

1. Max + Eric Chen agree the input/readiness semantics and final slider labels.
   Separate direct input, interpreted input and venue evidence. Agree how initial
   caps and later private-offer approvals are represented.
2. Turn these scenarios into reusable synthetic fixtures and meaningful tests;
   preserve failures as evidence instead of marking the proposed behavior complete.
3. Review Eric Wu's actual database catalog/evidence contract. Map each evidence
   field to these scenarios; do not edit his ingestion files concurrently.
4. Coordinate API/schema/view/binding changes for optional prompts, structured
   duration and targeted clarification. No live shapes change in this planning step.
5. Implement the input UX separately from the deferred Claude planner rewrite.
   Then implement the bounded propose → validate → revise/conditional-compromise
   follow-up against the agreed database snapshot, preserving privacy and cap rules.
6. Verify isolated fixtures, real Claude with sourced data, connected groups,
   solo testing and physical phones before shared rollout. Keep calls simulated.
