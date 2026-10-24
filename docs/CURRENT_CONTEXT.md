# Huddle current product and architecture

Updated October 24, 2026. This is the current direction agreed with Max. It takes
precedence over conflicting product scope, math requirements, ownership and
hosting proposals in the original build brief and task split. It describes the
target separately from the code that exists today; it does not change a wire
contract by itself.

The current hosting choice is local FastAPI + a tunnel + Maincloud. The
[agent flow plan](AGENT_FLOW_PLAN.md) proposes the interaction and migration
defaults approved by Max and now implemented. See the additive
[coordinator contract](AGENT_CONTRACT.md), [runbook](AGENT_RUNBOOK.md) and
[verification record](AGENT_VERIFICATION.md) for the shipped behavior and checks.

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

1. Start or join a huddle using the existing code/QR flow.
2. Each participant submits their own prompt and reviews any interpretation or
   private clarification. The host's prompt does not speak for everyone.
3. Build the coordinator's context from the confirmed current inputs. Filter
   venue candidates using code, then request a small set of distinct proposals.
4. Validate every proposal and show its itinerary, whole-outing price, concise
   reasoning, relevant trade-offs and unresolved facts.
5. Let participants discuss or correct their own input. Regenerate from the
   updated context and invalidate superseded choices.
6. Participants choose a current valid plan. Keep the existing visibly scripted
   booking/re-plan demonstration until real calls are deliberately implemented.

The shadcn interface proposal remains the design direction: Start a huddle as
the main screen, readable agent conversation, plans and voting accessible from
navigation, and consistent mobile controls. Username/password accounts,
contacts, personal history, voice input and personal provider keys remain
staged proposals. They are not prerequisites for proving agent planning with
the existing device identities. Vendor/MCP settings and real phone calls wait.

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
`/agent/needs` and `/agent/plan`. Each member privately reviews and confirms their
needs; only the host starts planning after everyone confirms. Database jobs carry
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

There are 45 real Berkeley venues. Review aspects are placeholders and scout
facts are cached. Max reaffirmed Bright Data scraping as active next work for
discovering and refreshing alternatives. The scraper and shared catalog/evidence
integration are not implemented yet. Keep a validated cached snapshot for scrape
outages; scraping cannot guarantee a choice that satisfies every hard constraint.
Neither Claude nor scraped reviews replace verified allergy evidence. See
[NEXT_TASKS.md](NEXT_TASKS.md) for the open workstreams and suggested ownership.

The additive contract uses separate requests/results and private agent tables;
it does not populate obsolete math fields. Public explanations are rendered from
catalog facts selected by Claude, so private model prose cannot expose prompts or
caps. The bounded candidate set is not a guarantee of a globally optimal plan.
Unknown allergy evidence blocks planning; qualitative review aspects, ingredients,
live availability and actual prices are still unverified. Private trade-offer
generation, accounts, shadcn migration and personal history are deferred. An
established cap cannot be raised through prompt editing or model interpretation.
Preserve the exact 13-feature order wherever the legacy contract is still used.

## Immediate work split and acceptance

| Person | Focus |
| --- | --- |
| Max | Agent behavior and context requirements, shared contract design, hard-constraint validation and connected verification |
| Eric Wu | Current `api/` implementation owner; coordinate the agent-planner migration and designated local API/tunnel operation with Max |
| Eric Chen | UI, readable prompt/agent/plan flow and SpacetimeDB context/progress integration with Max |

Coordinate file ownership before overlapping edits. Haydn's attendance and
Bright Data access/integration are open tasks for refreshed venue alternatives.

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
