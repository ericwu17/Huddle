# Huddle approved agent flow

Approved by Max and implemented October 24, 2026, after syncing main through
`e6412cc` (Demo NPCs). This records the agreed scope; the additive
[contract](AGENT_CONTRACT.md), [runbook](AGENT_RUNBOOK.md) and
[verification](AGENT_VERIFICATION.md) describe the resulting implementation.

## Agreed operating setup

Keep the current setup: Vercel frontend, SpacetimeDB Maincloud and FastAPI on one
designated teammate's laptop behind a Cloudflare tunnel. Developers can also
run Vite on port 5173. FastAPI normally listens on `127.0.0.1:8000`; Maincloud
reaches it through its public tunnel URL, not through that loopback address.
Claude is called through its API, not an installed local language model.

The frontend sends actions to Maincloud. Database jobs call FastAPI with
`X-Huddle-Secret`, store the results, and publish updates to subscribed browsers.
Keep council-message delivery behind an adapter. The existing endpoint response
remains the source of truth if optional streaming delivery fails.

One operator keeps the shared API/tunnel alive and controls changes to
`FASTAPI_BASE_URL`. Other people can use the Vercel app or develop their own
frontend against Maincloud without running Python or receiving service secrets.
Backend developers use isolated tests/a separate module before changing shared
service settings. No local SpacetimeDB or hosted API migration is required for
this phase. Accept the laptop availability dependency temporarily; Render and
other hosting alternatives are deferred.

## Suggested first version

Use **one huddle coordinator agent** that receives every current member's
submitted prompt and confirmed requirements. It proposes and explains plans
using the venue catalog. Code validates the facts and hard constraints before
anything becomes a selectable recommendation.

This replaces mathematical ranking. It does not replace arithmetic or access
checks. Remove mandatory swipes, feature/posterior inference, Monte Carlo
confidence, utility ratios and Pareto scores from the replacement flow. Show
explanations and concrete trade-offs, not invented satisfaction percentages.
Additional participant advocates are optional later work, not a requirement for
the first useful coordinator.

Use the current device identities and code/QR joining first. The shadcn visual
direction remains, but login, contacts, history, voice prompts, personal keys,
MCP integrations and real phone calls do not block this flow. Max subsequently
reaffirmed Bright Data scraping as active next work for refreshed alternatives;
see [NEXT_TASKS.md](NEXT_TASKS.md). Keep booking visibly simulated.

## What participants experience

### 1 Start and join

The host creates a huddle and shares its code or QR link. Participants join on
their own devices. The group sees names and readiness, not private inputs.

Keep the initial demo's existing date/time window and supported stop templates.
Do not add a scheduling wizard or force every outing to have three stops. The
coordinator can propose a supported two- or three-stop itinerary where feasible.
Changing host/date/template controls is a separate contract/UI decision.

### 2 Tell Huddle what each person wants

Every participant gets a private prompt field. Example inputs:

| Person | Private prompt |
| --- | --- |
| Max | "Burger and fries, under $30 for the whole outing." |
| Sam | "Vegetarian. I would like somewhere quiet." |
| Jordan | "Under $20 total, and something outdoors afterward if possible." |

Saving a prompt triggers a bounded interpretation call. The result is a private,
editable summary separating hard requirements, soft preferences and unknowns.
For Max, the summary might show an outing cap of $30 and a preference for burgers.
Sam sees vegetarian as a hard requirement and quiet as a preference, with a
warning if the catalog has no verified evidence about noise.

The agent asks targeted private questions where an answer affects feasibility.
For example, ask whether "avoid peanuts" means an allergy requiring verified
venue information. Do not infer dietary/allergy compatibility from an absence
of tags or from the model's general knowledge. An unknown stays unresolved.

### 3 Confirm each person's needs

Each person chooses **Confirm my needs** after reviewing their own summary.
Others see only statuses such as "Sam is ready" or "Waiting for one person."
Confirmation does not reveal that person's cap or raw prompt.

The host cannot confirm or edit another person's requirements. The agent cannot
mark someone ready. A changed private input needs that member's confirmation
again. Other unchanged member submissions can remain confirmed.

Only generate plans once all current members have confirmed and there are no
blocking unknowns. Suggested first-version trigger: an explicit host action,
**Find plans**, enabled when the group is ready. Avoid hidden repeated calls as
people type or an automatic confidence-based transition.

### 4 Build the coordinator's context

Maincloud stores the durable private inputs, confirmations, corrections and
proposal history. It assembles an authorized snapshot for this huddle and input
revision, including member requirements, the outing window, exclusions and
relevant venue facts. FastAPI receives the snapshot and does not read the
database directly from solver/agent functions.

The coordinator can use everyone's submitted prompts internally. Keep context
isolated per huddle; do not put it in a global Python conversation variable.
The host's starting request is one input, not a substitute for invitees' needs.
Unrelated history and provider credentials never become group prompt context.

The UI shows understandable progress: gathering confirmed needs, checking
options, then preparing recommendations. These are status messages, not a
fabricated agent debate or hidden model reasoning.

### 5 Propose, validate and display plans

Code first filters known candidate venues by current hard restrictions, hours
and exclusions. Claude receives the current context and eligible venue facts,
then proposes up to three distinct itineraries with concise reasons and
trade-offs. Use fewer options if only one or two are valid; never pad the list
with fictional venues or duplicate plans.

Validate every proposed itinerary against authoritative data. Recompute stop
times and the outing total; never trust a model's claimed total or venue ID.
Use known catalog costs as labeled estimates, not guaranteed live prices. An
unknown cost must not count as zero or produce a "within budget" claim.

For each member with a non-null cap:

`sum(stop.costPerPerson for every stop) <= member.budgetMaxPerPerson`

Also check dietary/allergy requirements, explicit must-reject requests, supported
categories, known venue IDs, opening windows, time feasibility and current
excluded places. Dietary tags apply to meals/desserts; a tagless activity is not
automatically rejected. Where required allergy evidence is missing, pause for
verification rather than presenting the venue as safe.

Each plan card shows the timeline, itemized estimated per-person costs, complete
outing total, grounded explanation and relevant data limitations. Public text
can say "This includes vegetarian choices and an outdoor stop" where supported;
it cannot expose "Jordan only has $20" or quote private prompts. A preference
such as quiet is not a verified venue property while that evidence is missing.

Use one bounded repair attempt for invalid structured output if time allows.
If no valid proposal remains, show the relevant conflict or verification need.
Do not turn validation failure into an automatic restriction relaxation.

### 6 Discuss or update

Keep conversation, plans and voting reachable without forced navigation when
an agent job finishes. Participants can request a change or edit their private
needs. Public discussion is visible to the group; private corrections stay
private and the UI must make that distinction clear.

Apply changed requirements through code, increment the context revision and
mark the prior proposals/choices stale immediately. A reply started for an old
revision cannot overwrite the new state. After the changed member reconfirms,
the host can explicitly regenerate plans from all current inputs.

Example: Jordan lowers the outing cap from $20 to $15. Existing $18 plans are
unavailable for selection, stale votes/roulette choices cannot authorize them,
and a pending booking rechecks the new cap before any external action. The
replacement total must be at most $15, or the app explains that no verified
feasible outing was found.

For an established cap, typing a higher number or asking an agent to "be
flexible" cannot raise/remove it. Preserve the existing rule: only its owner
explicitly accepting a current private budget trade offer can raise it. New
automatic trade-offer generation is deferred; do not silently substitute an
agent suggestion or general confirmation for the existing acceptance action.

### 7 Vote and demonstrate booking

Participants vote on current validated plans. Keep counts and the agent's
recommendation visible, while leaving the decision with the participants.
Suggested first version: wait for every current member's vote before enabling
the host's booking action. No agent chooses or books on someone's behalf.

If there is a tie, keep it unresolved until the group changes its votes or
explicitly uses **Spin**. If Spin stays in the new flow, proposed behavior is an
equal draw among the currently tied, valid plans; the old robustness-squared
weights cannot apply without those scores. This needs explicit agreement in the
contract migration. Spin selects a proposal, not permission to book it.

The host explicitly starts the existing simulated booking. Recheck membership,
run/revision and current cumulative caps before starting. A simulated full/closed
result excludes that venue and proposes replacements through the same flow,
requiring a fresh choice and explicit booking action. A late callback from an
old run must not advance the new one. Do not represent simulation as a real
reservation or assume a changed local state cancels an external action already
sent.

## Conceptual progress states

These are review labels, not new enum strings or a schema patch:

| Stage | What the group sees | What permits the next stage |
| --- | --- | --- |
| Join | Members and ready status | At least two participants enter the prompt flow |
| Needs | Private prompt/summary; group readiness only | All current needs confirmed; blockers resolved |
| Planning | Coordinator progress | Current-revision proposals pass code validation |
| Plans | Itineraries, reasons, limitations and discussion | Participants choose to vote |
| Vote | Current choices and counts | Complete vote; a winning or explicitly resolved choice |
| Booking simulation | Clearly labeled outcome | Explicit host action; current validation succeeds |

An input change returns the group to needs/replanning as necessary. A service
failure shows a recoverable error with an explicit retry. If the existing
synthetic demo fallback is retained, label it prominently and do not count its
output as real agent planning. Preserve private context through API/tunnel
restarts; reconnecting must not silently repeat booking or agent actions.

## Contract decisions resolved by the implementation

Legacy endpoints retain posteriors, scores and Safe/Bold/Budget shapes. The
additive [AGENT_CONTRACT.md](AGENT_CONTRACT.md) uses separate needs/results and
private context tables rather than fake confidence values or arbitrary
posteriors. The implementation resolves the following boundaries:

| Boundary | Required agreement |
| --- | --- |
| Individual needs | Prompt, interpreted hard/soft requirements, unresolved questions, confirmation and private visibility; include explicit allergy evidence/unknowns |
| Huddle snapshot | Membership, outing/window, all confirmed inputs, exclusions, catalog facts, run and input revision |
| Agent result | Current-revision plans, grounded explanations, limitations, conflicts/clarification needs and completion/error status; no mandatory math scores |
| Group actions | Find plans, input changes, stale choices, vote completion, optional equal-weight Spin and explicit host booking |
| Message delivery | Private clarification versus shared coordinator progress/reasons; adapter callbacks scoped to the current run and deduplicated |

Retain `X-Huddle-Secret`, stateless API functions and private database views.
Avoid overloading a single HTTP call with an unlimited conversation: each job
must fit the current 20-second module timeout, including validation/repair.
Persist progress between bounded stages in Maincloud. Ask the user a question
through stored state rather than keeping an HTTP request open for their reply.

## Agreed implementation sequence

| Step | Work | Reviewable result |
| --- | --- | --- |
| 1 Agree contracts | API + database + UI example for one group, unknown allergy, budget change and invalid reply | Documented shapes and state transitions agreed by the team |
| 2 Prove private needs | Add interpretation/clarification and confirmation without feature vectors | Each member can inspect and correct their own needs; no cross-member disclosure |
| 3 Prove the coordinator | Build the context snapshot, bounded model adapter, candidate filtering and deterministic output validation | Real catalog plans satisfy every current hard constraint; invalid replies are rejected |
| 4 Wire Maincloud | Add context/revision/progress storage and jobs, update agreed bindings; preserve run/booking guards | The shared module calls the local API through the tunnel and stores current results |
| 5 Update UI and test actors | Replace swipe/confidence gating with prompt confirmation and readable plans; adapt smoke and `demo-friends.mjs` | Two real browsers complete the new flow; simulated friends remain explicitly labeled |
| 6 Verify and retire legacy path | Connected tests, private/state-change cases, actual devices and API/tunnel restart | New agent mode passes; only then remove obsolete math dependencies/routes/fields together |

Suggested coordination: Max owns plan behavior, contract design and validation;
Eric Wu owns current API implementation and coordinates Python edits with Max;
Eric Chen leads UI and coordinates Maincloud state/jobs with Max. Pick concrete
file owners before overlapping implementation. Keep the legacy live path
available until a compatible agent path passes isolated connected tests.

## Acceptance checklist

- [x] Two independent browser identities can join, submit different prompts,
  privately confirm needs, inspect plans, vote and finish simulated booking.
- [ ] Repeat the rehearsal with physical phones and actual participants.
- [x] Change one person's stated preference in a controlled fixture and verify
  their input reaches the coordinator; a necessary constraint change affects
  eligibility or yields an explicit conflict. Do not require identical LLM prose.
- [x] Invalid IDs, fabricated facts, missing allergy evidence, wrong totals and
  any member's cumulative budget violation cannot become selectable plans.
- [x] A zero cap and an uncapped member are handled correctly; an activity
  without dietary tags survives otherwise-applicable dietary filtering.
- [x] Private prompts, caps and clarifications stay private in views and
  shared agent text; two simultaneous huddles never share context.
- [x] An input update during an in-flight response rejects that old response;
  votes, Spin and queued booking cannot use superseded or newly invalid plans.
- [x] API/model errors have explicit retry states and preserve stored context;
  new agent groups never silently switch to synthetic plans. Native/HTTP tests
  cover errors and duplicate booking guards.
- [ ] Rehearse a physical API/tunnel stop-and-restart while browsers are open.
- [x] Maincloud integration completes within its service deadline with real
  Claude calls; current mathematical smoke results are not reused as proof.
- [x] `demo-friends.mjs` is migrated for agent mode. Its seeded
  identities and scripted choices are test actors, not newly implemented agents.

## Approved defaults

1. One coordinator initially, with everyone's current private prompt context.
2. Each person confirms their interpreted needs; the host explicitly requests plans.
3. Up to three distinct valid plans, with plain reasons and no confidence scores.
4. Shared discussion plus a separate private correction/clarification path.
5. Everyone votes; the host explicitly books. Optional Spin resolves ties equally.
6. Code enforces hard restrictions; no automatic cap increases or fabricated facts.
7. Keep the laptop API + tunnel + Maincloud. No hosting/database migration or new
   account system is required to implement and test this flow.

Max approved these defaults. The resulting flow is implemented and verified as
recorded in [AGENT_VERIFICATION.md](AGENT_VERIFICATION.md); physical-phone
rehearsal, frontend release and removal of legacy code remain separate tasks.
