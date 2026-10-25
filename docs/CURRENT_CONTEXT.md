# Huddle current product and architecture

Updated October 24, 2026. This is the current direction agreed with Max. It takes
precedence over conflicting product scope, math requirements, ownership and
hosting proposals in the original build brief and task split. It describes the
target separately from the code that exists today; it does not change a wire
contract by itself.

**Branch preview updates:** city selection/coverage is described in
[CITY_COVERAGE.md](CITY_COVERAGE.md). Calendar addition is now personal: every
participant can add the voted timed plan only to their own connected Google
Calendar from Done. The host cannot trigger writes to friends' calendars.
Shared release remains pending; see [connector contract](CONNECTORS_CONTRACT.md).

**Current model:** both parsing and the outing coordinator use Claude Haiku 5.5
(`claude-haiku-5-5`). The previous coordinator default was Sonnet 5.5. Both
`CLAUDE_MODEL_FAST` and `CLAUDE_MODEL_SMART` now default to Haiku; configure them
only on FastAPI, never in public frontend variables.

The current hosting choice is local FastAPI + a tunnel + Maincloud. The
[agent flow plan](AGENT_FLOW_PLAN.md) proposes the interaction and migration
defaults approved by Max and now implemented. See the additive
[coordinator contract](AGENT_CONTRACT.md), [runbook](AGENT_RUNBOOK.md) and
[verification record](AGENT_VERIFICATION.md) for the shipped behavior and checks.

**Menu update:** see [MENU_RECOMMENDATIONS.md](MENU_RECOMMENDATIONS.md) for sourced
orders, owner-private personal totals, provisional suggestions, fallback behavior,
publish commands and the Google redirect check. This supersedes the old blanket
allergy block and shared-cost notes.

**Planned follow-up, not implemented:** Max wants Claude to construct and revise
itineraries, with Python validating hard constraints and factual consistency
instead of enumerating complete candidate plans. Eric Wu has built Bright Data →
SpacetimeDB ingestion: a versioned venue snapshot (`POST /catalog`, `venue` and
`catalog_state` tables) that the module sends to FastAPI with each coordinator
request (`docs/CONTRACT.md` S5.5, `catalog` in `AGENT_CONTRACT.md`). The merged
implementation is active on shared Maincloud `huddle-calhacks` and Vercel,
with the committed 130-venue snapshot. The separate `huddle-account-max-check`
preview remains available. See [operations](ACCOUNTS_RUNBOOK.md). Menus, prices and attributed
photos now have a coordinated runtime contract; takeout/seating remain follow-ups.

**Account and preference expansion: shared release active October 24.**
Max approved username/password accounts, private saved context, reciprocal friends,
a friend picker and durable in-app invitations with an opening link. New
account-owned huddles use addressed invitations; legacy anonymous groups retain
compatibility. Passwords now require eight characters and can be shown while
entering them. Contacts are created after accepted friendship/membership, never
by importing a phone address book.

Private budget and full-outing-duration controls have an explicit Flexible state,
exact numeric inputs and optional sliders. An optional prompt adds context.
**Save & ready** saves direct inputs without a second confirmation; consequential
ambiguity still requires a private correction. A blank initial submission is
valid. A later blank/Flexible edit cannot erase an established outing cap.
Known allergy input and missing venue evidence are separate states: the person
can finish their input and receive provisional food suggestions. Unverified options
can receive votes and tie Spin; booking/calendar eligibility stays separate.
Impossible timed outings get untimed venue ideas that can also receive exploratory
votes without changing anyone's limits or inventing visit times. Cards show
route names, AM/PM times, ratings/photos and private orders with known menu prices;
source/confirmation boilerplate and unknown price estimates are hidden.

Max authorized and completed the shared activation from `a029fb6` after its main
push. Vercel (`https://huddle.compare`) now uses the updated shared
module/API and 130 real venues. All original groups/members/plan identifiers
survived; the shared rollout passed 41 connected, 14 OAuth and 30 browser checks.
Preview accounts remain separate in `huddle-account-max-check`/local port 5174. See
[ACCOUNTS_CONTRACT.md](ACCOUNTS_CONTRACT.md),
[ACCOUNTS_RUNBOOK.md](ACCOUNTS_RUNBOOK.md) and
[PREFERENCE_ACCEPTANCE_PLAN.md](PREFERENCE_ACCEPTANCE_PLAN.md).
Eric Wu's Bright Data/ingestion files remain untouched. The branch now also
implements invitation-only home intent: Claude resolves actual friends, the
initiator reviews recipients, then explicitly starts invitations. Home text
never becomes a private preference submission; a picker works without Claude.

The Connectors tab adds per-account Google Calendar consent, private encrypted
credentials, common free/busy time selection and a separate agreed-meetup write
after complete current voting and event opt-in. Manual outing date/time remains
available without calendars; all venue hours use Berkeley time. An optional
Max-Mac Messages adapter submits invitation links only for opted-in recipients.
Max reports Google Calendar connects; group free/busy and real meetup-event
creation still need a participant test. A user-triggered invitation reached Mac
Messages, which reported Not Delivered. Max also reports ordinary sending and
phone-history syncing fail there. OS submission is not recipient delivery; do
not automatically resend an ambiguous submission. See
[CONNECTORS_CONTRACT.md](CONNECTORS_CONTRACT.md). General SMS/email/push, voice
prompts and model-inferred memory remain
follow-ups. Coordinator plans now support a one-meal outing for short time limits; the
old two-stop minimum incorrectly rejected matching $40/90-minute food requests.
Both API and module enforce the expanded one-to-three-stop contract, with only
a meal permitted as a single stop. Legacy templates are unchanged.

Max can search his Mac Contacts and explicitly link a selected address to an
accepted Huddle friend. A reviewed invitation can use that private mapping;
recipient-saved delivery settings, including opt-out, take priority. This is
selected-contact linking, not continuous address-book synchronization. Actual
lookup worked; real message receipt still needs participant confirmation.
Max reports Google Calendar now connects after the tester allowlist update;
shared availability and real meetup-event creation remain separate checks.

The preview planner now receives the active 130-venue database snapshot. Claude
gets its source/fetch evidence; plan cards resolve new `bd_` IDs through public
catalog views and show ratings with observation dates. Shared Vercel now uses
the same 130-venue catalog after coordinated module/API/catalog activation.
Google callback wiring is verified on shared; each user still connects their own
account. Shared Mac Messages/Contacts adapters are disabled while native sending
is unresolved. In-app invitation delivery remains active.

## Goal

Huddle helps a group turn everyone's individual prompts into an outing they can
agree on. A huddle coordinator agent holds the current group's prompt context,
understands each person's needs, proposes feasible options and explains the
trade-offs. Participants can clarify, update their preferences and choose a
plan together.

The demo should show three or four people joining, submitting different needs,
seeing useful agent recommendations, choosing an outing and handling a changed
constraint or unavailable venue. Correctness, clear UI and reliable shared
access take priority over more features or a mathematical fairness pitch.

## Agent planning replaces mathematical ranking

The target decision process is Claude-led reasoning over prompts and venue
facts. Retire the 13-feature taste model, Bayesian swipe learning, Monte Carlo
robustness, utility ratios, Pareto ranking and confidence-driven stopping from
the new core flow. Swipes and a fixed seven-agent debate are not prerequisites.
Existing numeric experiment results do not validate the replacement planner.

Understanding text is still necessary. The agent extracts needs and asks about
ambiguity, but the new flow need not convert every request into a feature vector
or posterior. Distinguish hard restrictions from negotiable preferences and let
each person review their own interpreted requirements before planning.

One coordinator is enough for the first implementation. Participant advocates
can be added as bounded calls if they improve the explanation; each advocate
receives only its person's private context plus the shared proposal. Agent
count and conversational performance are secondary to a useful valid result.

## Context and privacy

The coordinator's private working context contains the current huddle's member
prompts, confirmed requirements, latest corrections, venue facts and proposal
history. It must account for every participating member rather than just the
host's initial request. Group membership determines which submissions belong
in this context.

Store durable context in SpacetimeDB and pass an authorized snapshot to the
stateless FastAPI planner. Do not keep the authoritative conversation in a
global Python variable: API restarts or concurrent huddles must not lose or mix
it. Associate planning work with the current huddle and input revision so late
results cannot overwrite recommendations for newer requirements.

The coordinator can use all submitted prompts internally. Other participants
see shared proposals, explanations and questions, not a dump of everyone's raw
prompts, private caps or offers. User-facing agent messages must preserve that
boundary. API keys and unrelated personal history never enter group context.
Saved personal context is used only when authorized for that user and outing;
the host cannot retrieve invitees' private profiles by naming them.

## Deterministic rules remain in code

Replacing mathematical ranking does not remove validation:

- Sum all stops' per-person costs. The total must match the displayed plan cost
  and fit every member's non-null private `budgetMaxPerPerson`. Zero is a real
  cap; null is uncapped. Only that member explicitly accepting a current private
  trade offer may raise an established cap. Agent reasoning, parsing and group
  approval cannot raise it.
- Treat confirmed allergies, dietary requirements and explicit must-reject
  requests as hard constraints. Apply dietary checks to meals and desserts;
  do not discard tagless activities solely for lacking dietary labels.
- Use known venue IDs, costs, categories, hours and feasible stop times. Claude
  may suggest choices but cannot invent facts to make an itinerary pass.
- Unknown allergen or dietary evidence is not a verified match. Ask for
  clarification or venue confirmation rather than claiming allergy safety.
  Current place records do not provide verified allergy/cross-contact coverage.
- Recheck current constraints before accepting plans, votes, roulette choices
  or booking requests. Preserve stale-run and late-callback protections.
- If no verified feasible option exists, explain the conflict and request an
  explicit correction. Never silently relax a hard restriction or book anyway.

Code filters candidates and validates structured agent output against the
current facts and requirements. The agent chooses and explains among valid
possibilities. Unsupported satisfaction percentages and canned confidence must
not be presented as results from this new method.

## Implemented coordinator interaction

1. On the branch preview, sign in, start a huddle and invite accepted friends.
   Recipients open their in-app invitation link and explicitly join.
2. Each participant saves their private optional limits/prompt with Save & ready.
   Ask only consequential clarifications. The host cannot submit for invitees.
3. Build the coordinator's context from the confirmed current inputs. Filter
   venue candidates using code, then request a small set of distinct proposals.
4. Validate every proposal and show its itinerary, whole-outing price, concise
   reasoning, relevant trade-offs and unresolved facts.
5. Let participants discuss or correct their own input. Regenerate from the
   updated context and invalidate superseded choices.
6. Participants choose a current valid plan. Keep the existing visibly scripted
   booking/re-plan demonstration until real calls are deliberately implemented.

The custom illustrated theme in Design.md is the design direction: prompt-first
home, clear friends/inbox navigation, readable plans and consistent mobile
controls. Branch accounts, memberships and private saved defaults use SpacetimeDB.
History records proposed/simulated outcomes accurately; no inferred visits.
Voice input, personal provider keys, vendor/MCP settings and real calls wait.

## Runtime and local development

Keep Vite/React and FastAPI as separate processes. Python does not serve the
frontend. FastAPI remains separate from database logic; it accepts context and
venue facts through agreed contracts and returns proposals. Council-message
delivery stays behind the existing adapter. Claude runs through its provider
API, not an installed local inference model.

| Environment | Frontend | State and realtime | Python API |
| --- | --- | --- | --- |
| Shared app for this phase | Existing Vercel deployment | Existing SpacetimeDB Maincloud, `huddle-calhacks` | FastAPI on one designated laptop, reached through a public tunnel |
| Local development | Vite, normally port 5173 | Maincloud for connected testing, or isolated local SpacetimeDB for module/fake tests | FastAPI, normally loopback port 8000; a tunnel is still needed if Maincloud calls it |
| Earlier all-local proposal | Vite on host laptop | Local SpacetimeDB on port 3000 | Blocked direct database-to-loopback API connection on installed SpacetimeDB 2.13.0 |

An isolated standalone test reproduced `HttpError: refusing to connect to private
or special-purpose addresses` for a procedure calling a reachable loopback HTTP
endpoint. This blocks the earlier tunnel-free design as written. An all-local
setup remains possible with a supported networking change or an agreed host
worker architecture, but is not the immediate shared-demo target. Depending on
one laptop also remains an availability problem even if all processes are local.

The latest decision is to accept the laptop availability dependency for now so
the team can implement and test agent planning. One operator keeps FastAPI and
its tunnel running, with a matching private service secret. When its public URL
changes, update Maincloud deliberately; do not let each developer's startup
overwrite the shared API URL.

Render and other hosted API options are deferred, not prerequisites. The earlier
configuration in [HOSTED_API.md](HOSTED_API.md), `render.yaml` and
`.python-version` remains an unimplemented alternative. Configuration/schema
and Linux dependency checks passed; no Render service or hosting cutover has
occurred. No paid service is approved by choosing the current local setup.

The frontend/backend connection already exists: React connects to SpacetimeDB
using `NEXT_PUBLIC_SPACETIMEDB_URI` and `NEXT_PUBLIC_SPACETIMEDB_DB`; module jobs
call FastAPI using their private `FASTAPI_BASE_URL` and `X-Huddle-Secret`.
Results are stored in SpacetimeDB and reach subscribed browsers as realtime
updates. For this phase, the module's API URL is the designated host's current
public tunnel address. The frontend retains its Maincloud connection. No service
secret belongs in the browser and no direct browser-to-private-API route is
needed.

Removing the laptop dependency and replacing mathematical planning are separate
deliverables. Prioritize the agent contracts and behavior on the existing
connected setup. A local server still stops when its host laptop stops; this
phase accepts that limitation and does not claim shared-service redundancy.

## Current implementation and migration

New huddles created by the updated frontend use one Claude coordinator through
`/agent/needs` and `/agent/plan`. Each member saves private optional inputs with Save & ready; safe prompt
interpretations become ready automatically, with targeted clarifications only.
Only the host starts planning after everyone is ready. Database jobs carry
input revisions, persist context/results and discard stale replies. The new UI
shows estimated stop costs and grounded explanations without taste scores or
confidence percentages. Equal-weight Spin resolves complete tied ballots only.
Agent booking always uses a clearly labeled module simulation, even if a voice
service URL is configured. No restaurant is called.

The legacy math endpoints, existing groups and their generated shapes remain
available for compatibility. The updated frontend creates agent groups; an older
Vercel frontend continues to create legacy groups until its frontend release.
Eric Chen's `scripts/host-api.ps1` is hosting tooling, not a replacement planner.
Max's Mac is the designated API/tunnel host for this connected implementation test.

Eric Wu collected 936 Berkeley stops and built a 130-venue snapshot (60 meals,
45 activities, 25 desserts), including 85 venues absent from the bundled list.
This snapshot is activated and tested in the isolated preview. Raw scraping and
ingestion files were not edited during the integration. Review aspects and
scout facts remain placeholders/cached. Details for 130 venues exist separately
with menus/prices/photos joined by the menu publisher; takeout/seating are not yet read by the planner. Keep a validated cached snapshot for scrape
outages; scraping cannot guarantee a choice that satisfies every hard constraint.
Neither Claude nor scraped reviews replace verified allergy evidence. See
[NEXT_TASKS.md](NEXT_TASKS.md) for the open workstreams and suggested ownership.

The additive contract uses separate requests/results and private agent tables;
it does not populate obsolete math fields. Public explanations are rendered from
catalog facts selected by Claude, so private model prose cannot expose prompts or
caps. The bounded candidate set is not a guarantee of a globally optimal plan.
Unknown allergy evidence keeps suggestions provisional and unbookable; qualitative review aspects, ingredients,
live availability and actual prices are still unverified. Private trade-offer
generation, inferred memory and actual-visit history are deferred. An
established cap cannot be raised through prompt editing or model interpretation.
Preserve the exact 13-feature order wherever the legacy contract is still used.

## Immediate work split and acceptance

| Person | Focus |
| --- | --- |
| Max | Agent behavior and context requirements, shared contract design, hard-constraint validation and connected verification |
| Eric Wu | Current `api/` implementation owner; coordinate the agent-planner migration and designated local API/tunnel operation with Max |
| Eric Chen | UI, readable prompt/agent/plan flow and SpacetimeDB context/progress integration with Max |

Coordinate file ownership before overlapping edits. Eric Wu owns the active Bright Data ingestion work; Max owns the follow-up
versioned catalog/planner integration and Eric Chen coordinates its UI.

- [x] Confirm Max's Mac as designated local API/tunnel operator and verify the
  Maincloud API URL before shared testing; retain this setup for agent work.
- [x] Document additive input/output and input-revision rules before changing
  shared schemas, generated bindings or UI progress transitions.
- [x] Pass every member's confirmed prompt to the coordinator; privately review
  interpretations and explicitly report infeasible combined requirements.
- [x] Reject invalid venue IDs, fabricated facts, budget violations, hard
  restriction violations and stale outputs even when the agent proposes them.
- [x] Verify independent huddles never share context. Test a budget change,
  late agent response, vote, roulette choice and pending booking.
- [x] Run the complete flow with separate desktop/mobile browser identities,
  explicit error states and labeled booking simulation.
- [ ] Rehearse on physical phones, including API/tunnel stop-and-restart recovery.
  The host remains responsible for availability; hosted migration is deferred.
- [ ] Release the updated frontend to Vercel; local Vite uses the new flow now.

The existing mathematical smoke/evaluation results describe the legacy path.
They must not be relabeled as verification of the new agent planner.
