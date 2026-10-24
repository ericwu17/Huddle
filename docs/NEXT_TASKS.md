# Current task: coordinator demo polish (in progress)

Updated October 24, 2026 after Max requested release to main. This task remains
open: the connected coordinator works, but UI, Claude behavior and scraped-data
integration still need polishing. This note supersedes earlier statements that
Bright Data scraping is deferred. Owners below are a suggested split for Max,
Eric Chen and Eric Wu to coordinate before editing overlapping files. Eric Wu has
implemented Bright Data → SpacetimeDB; the catalog is committed but not yet
published ([go live](BRIGHTDATA.md#go-live)).
The [Claude planner follow-up](CLAUDE_PLANNER_FOLLOWUP.md) records the deferred
propose → validate → revise design and the handoff after ingestion is ready.

**Input/acceptance planning, not implemented:** see
[PREFERENCE_ACCEPTANCE_PLAN.md](PREFERENCE_ACCEPTANCE_PLAN.md) for optional
budget/time sliders, an optional prompt, flexible defaults, one Save & ready
action, targeted clarifications and 30 proposed acceptance scenarios. It replaces
mandatory separate review/confirmation in the proposed next flow, not today's
live behavior. The Claude planner rewrite remains deferred.

**Product proposal, not implemented:** [PROFILE_CONTACTS_PROPOSAL.md](PROFILE_CONTACTS_PROPOSAL.md)
adds a prompt-first signed-in home, contacts, account-scoped invitation inbox and
editable saved defaults/today's overrides. Known-contact joining would need no
QR or invitation link. External SMS remains a later delivery adapter. Establish
accounts/memberships and prove invite/accept before expanding memory features.

## Next work, in parallel

| Workstream | Suggested lead | Concrete work | Done when |
| --- | --- | --- | --- |
| Update UI | Eric Chen | Apply the illustrated Huddle theme from Design.md with consistent accessible controls; simplify Join → private needs → coordinator/plans → vote → simulation; make loading, retry, blocked and reconnect states clear; improve plan/category labels, map readability and mobile layouts. Keep private corrections distinct from shared discussion. | Two physical phones can complete the flow without guidance, reopen plans and understand why planning is blocked. |
| Finish Claude behavior | Max | Review realistic prompts: specific foods, mixed stop categories, dietary needs, explicit exclusions and soft wishes. Reduce unnecessary clarifications, preserve every hard restriction, and improve grounded explanations using verified venue facts. Verify each person's input matters; retain the current cap and revision guards. | A reviewed scenario set passes using real Claude, including contradictory needs and provider timeout; no fabricated facts, private disclosures or automatic cap raises. |
| Preference acceptance plan (draft) | Max + Eric Chen | Review optional budget/time sliders with Flexible defaults, optional prompt/restriction chips and one Save & ready action. Distinguish input ambiguity from missing venue evidence; use scenarios P01–P30 before implementation. | Approved semantics and reusable fixtures cover omissions, negation, cumulative caps, duration, allergies, categories, clarifications and stale/private state; no runtime changes claimed. |
| Claude proposes and revises (deferred follow-up) | Max | After the database catalog contract is agreed, let Claude construct itineraries and repair them from structured validation feedback. Remove Python itinerary enumeration/preference ranking from this new path; Python validates hard constraints and factual consistency. See the dedicated follow-up plan. | Claude uses the database snapshot to propose and revise; only validated current plans become selectable, with bounded calls and private, explicit compromise approval when needed. |
| Compromise flow (deferred follow-up) | Max + Eric Chen | Max requested replacing a dead-end “no plan” outcome with specific compromise proposals and a clear next action. Identify what prevents a plan, propose negotiable changes, and obtain explicit approval from affected users before applying them. Improve evidence-blocked messages so users are not told to rewrite a correct allergy. | No dead-end null result in the user journey; suggestions remain clearly conditional until approved and validated. Existing cap increases still require owner acceptance of a private trade offer; unknown allergy evidence never becomes a safety claim. |
| Scrape and refresh venue data (built; publish pending) | Eric Wu | Build Bright Data ingestion into SpacetimeDB; collect source URLs and fetched-at times for venue/menu/review/hours/price evidence; deduplicate and validate categories and dietary tags. Hand off the actual schema, read path, version/refresh behavior and sample records. | Validated Berkeley records exist in SpacetimeDB with stable IDs, source/freshness and explicit unknowns; planner integration is a separate next step. |
| Integrate refreshed candidates | Max + scraping owner | Agree a versioned catalog/evidence shape before changing shared models. Feed the same snapshot to FastAPI and the module's venue validation; republish/restart both together. Extend the public fact whitelist only with supported evidence. | New venue IDs are accepted consistently by API, module and UI; source/freshness is visible and a full venue is excluded on replacement. |
| Backend reliability | Max + Eric Wu | Rehearse API/tunnel stop-and-restart, provider errors and reconnect; preserve saved context and expose explicit retries. Keep one operator for the shared URL. Test budget edits during planning/booking, repeated clicks and late callbacks after replan. | Recovery needs no data reset, and stale results or actions never become current. |
| Frontend release and rehearsal | Eric Chen + Max | Verify the main commit's Vercel status and public Maincloud variables, refresh into a new agent huddle, run physical-phone and solo tests, and fix remaining console/loading/navigation issues. | The deployed UI uses coordinator mode and completes the same flow as local Vite. |

Bright Data adds candidates and factual evidence; it cannot guarantee a valid
choice for every possible set of budgets, allergies, hours and vetoes. Never
silently relax a restriction to force a result. Scraped menus/reviews alone do
not certify allergy or cross-contact safety. Live availability requires explicit
evidence; otherwise show it as unknown. A failed scrape can use the last valid
snapshot, but must not claim that snapshot is current availability.

## Solo test now

1. Open the updated app at `/start`, create a **new** huddle and copy its actual
   four-character code. Existing legacy huddles retain the old flow.
2. From the repository root, replace `YOUR_CODE` below with that code:

   ```sh
   SPACETIMEDB_URI=https://maincloud.spacetimedb.com \
   SPACETIMEDB_DB=huddle-calhacks \
   node scripts/demo-friends.mjs YOUR_CODE --fast
   ```

3. Click **I'm ready** in your browser. The script joins Sam, Jordan and Riley
   using separate simulated identities, submits their seeded needs, confirms
   them and later votes for the coordinator recommendation.
4. Submit your own prompt (for example, a meal and activity under $25 for the
   whole outing), review the summary and click **Confirm my needs**.
5. When all four are confirmed, click **Find plans**, inspect the options and
   shared discussion, then **Go to vote**. Cast your vote. Only you, as host,
   start **Simulate booking** after the full group choice is complete.
6. Change your own budget to a lower cap and review/confirm again. Old choices
   must disappear; regenerated totals must fit the new cap. Refresh to check
   persistence. Stop the helper with Ctrl+C when finished.

The friends are scripted test actors, not three autonomous agents or real
people. The coordinator makes real Claude calls. You can also use a separate
browser profile/device for a second manually controlled participant; tabs in
the same browser profile normally share an identity. Solo testing supplements,
but does not replace, the physical-phone rehearsal.

## Scope and remaining priorities

- [ ] UI polish with the illustrated Huddle theme and accessible shared controls.
- [ ] Real-prompt Claude quality/constraint/category review.
- [ ] Deferred Claude propose → validate → revise flow; Python validates hard
  constraints and factual consistency instead of assembling/ranking itineraries.
- [ ] Deferred compromise flow and targeted conflict/evidence explanations; the
  current release retains blocked states while this follow-up is designed.
- [x] Bright Data scraping, normalization and shared catalog integration ([BRIGHTDATA.md](BRIGHTDATA.md)).
- [ ] Publish the live catalog: module republish, API restart, `collect.py publish` ([go live](BRIGHTDATA.md#go-live)).
- [ ] Use the venue details (menus, takeout, seating, dietary evidence) in coordinator facts.
- [ ] Physical-phone rehearsal, public Vercel flow and restart recovery.
- [ ] Keep documentation and honesty labels aligned with what is actually live.
- [ ] Review the staged profiles/contacts/invitation proposal; account and
  membership ownership must be proven before remembered context or QR-less joining.

Accounts/password login, contacts/history, voice prompt input, personal keys,
vendor/MCP management, real restaurant calls, live booking and persistent hosted
API migration remain later work. Do not expand into those before the current
demo flow is reliable. No mathematical satisfaction/fairness pitch is claimed.
Use [the runbook](AGENT_RUNBOOK.md) for operation and
[verification](AGENT_VERIFICATION.md) for completed checks.
