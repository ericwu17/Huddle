# Huddle roadmap

**Personal Calendar addition, branch preview:** Done exposes **Add to my calendar**
to every participant. Requests/status are owner-scoped, API writes accept one
account, and legacy group-wide dispatch is retired. Provider tests use mocks;
real Google writes need an owner-triggered test. Shared release is pending.

**Current city/location branch preview:** [CITY_COVERAGE.md](CITY_COVERAGE.md).
SF/Oakland retrieval, the preserved 200-venue pilot, optional typed city picker,
GPS city resolution, participant-city plurality/ties, hard city validation and
stale-action invalidation are implemented in the isolated preview. Shared rollout
is pending. Existing menus/photos remain intact; new city menu enrichment and
real transport routing remain Eric Wu/Max follow-ups.

Option comparison and map update: Plans/Vote label evidence-backed differences
in ratings, owner-private total cost, inter-stop travel and variety. Options,
Done and shared results open Google Maps with the blue underlined **Click here
to see the map!** action. The key-free URL phase is implemented. The October 24 city audit and proposed
Routes API/embedded-map rollout are follow-ups in
[GOOGLE_MAPS_PLAN.md](GOOGLE_MAPS_PLAN.md).

Map display update on the review branch: optional free Maps Embed directions,
driving by default with local walking/transit/biking preview controls. Without a
key, show straight-line distances instead of walking minutes. Actual travel-time
validation in planning remains follow-up scope. See [Maps setup](GOOGLE_MAPS_PLAN.md).

Post-vote result: Done shows the chosen route/date/time and each owner's order,
with Calendar download/opt-in creation and a public result link. Public shares
contain venue facts only and are checked against the current winner. Parsing and
the coordinator now default to Haiku 5.5; budgets and factual checks stay in code.

Current menu extension: [MENU_RECOMMENDATIONS.md](MENU_RECOMMENDATIONS.md). Sourced menu orders, private personal totals, photos,
provisional suggestions and untimed alternatives are implemented. Takeout/seating
remain follow-ups. This update
supersedes older blanket allergy-block and personal-cost deferral notes below.

Voting correction: all current timed/provisional and untimed venue suggestions
can receive votes and tie Spin. Booking remains limited to ready timed winners;
Calendar meetup creation requires a current timed winner and explicit opt-in.
The demo UI uses route names, AM/PM times and known menu prices,
without source/confirmation boilerplate. Current budgets and stale-run checks
still apply; exploratory voting never changes saved limits.

## Next work after the local-backend handoff

**Operating baseline:** Eric Wu's script hosts API/voice locally and preserves
its tunnels across service restarts after pulled commits. The shared database
is Maincloud and the frontend runs separately. Max's old shared API on port
8000 and its tunnel are stopped. The new host passed a read of Max's saved
Calendar connection, callback/client checks and signed-out Google preflight;
25 connected app checks passed after that shutdown. The current launcher passed
21 isolated checks, including service restart without tunnel replacement.
Fresh consent for another account and actual Calendar event creation still need
an opted-in participant test. Hosting still depends on Eric's laptop.

The read-only city audit found 140 active venues: **120 Berkeley, 9 Oakland,
9 Albany, 2 Emeryville and no SF**. The committed discovery pool has 5,932 rows,
including 3,197 SF-area and 1,494 Oakland-area rows, but the merge/publish default
is still the Berkeley rectangle. Current detailed evidence supplies 950 menu
items/386 photos; new city rows are not yet equivalent to fully enriched menus.
See [Google Maps and multi-city plan](GOOGLE_MAPS_PLAN.md) for the exact audit,
limits, proposed contracts and acceptance tests. This paragraph records the original read-only audit. The branch implementation
and preview status supersede it in [CITY_COVERAGE.md](CITY_COVERAGE.md); shared
catalog activation remains pending.

| Priority | Work | Proposed owner | Completion check |
| --- | --- | --- | --- |
| P0 | Preview a useful three-city catalog; make publish area-aware; enrich chosen SF/Oakland menus/photos while preserving existing evidence/history | Eric Wu, Max verifies contracts | SF-only and Oakland scenarios use the requested city's real venues; prior Huddles still resolve |
| P0 | Add optional destination-area and explicit travel-mode controls; pass geographic facts to Claude and validate them | Eric Chen UI, Max/API coordination | Flexible has no hidden Berkeley default; city/mode edits invalidate stale results |
| P1 | Add bounded Routes API facts and opening-hour/time validation; remove always-walking navigation for new mode-aware options | Max, Eric Wu integration | Coherent walking/driving/transit timings, including cross-Bay travel, match Maps links |
| P1 | Add lazy Google map views to Options and Done, retaining the external map action | Eric Chen | Phone/desktop preserve ordered stops, selected option and private data boundaries |
| P1 | Finish the approved Claude proposal/revision flow and short grounded compromise explanations | Max with Eric Wu, Eric Chen presentation | Claude proposes/revises sequences from a bounded catalog; Python validates; owners see useful meals rather than sides or invented dishes |
| P1 | Test a fresh Google consent and explicitly opted-in agreed meetup event | Max plus two consenting participants | Availability, event details, single creation and Done work on the shared host |
| P1 | Audit menu/category fit and unknown-price fallbacks in all three areas | Eric Wu data, Max scenarios | Vegan/$30 + steak/$50 + dessert/time scenarios retain correct personal totals and meaningful alternatives |
| P2 | Feed evidenced takeout/shared seating; improve Most daring/Best fit; improve invitations beyond in-app delivery | Joint after core demo | No invented pickup/seating, privacy leaks or false message-delivery claims |
| P2 | Stabilize the public API hostname and document restart/recovery; revisit hosted API only if needed | Eric Wu + project/domain owner | Restarts retain a valid Calendar callback and the team has one tested operator/runbook |

Do not upload the whole discovery file or just raise the 160-place request cap.
Plan a bounded per-area shortlist and the coordinated catalog contract first.
Map transport charges do not change the own-meal-plus-later-stops budget rule
without a separate explicit decision. Implementations and shared activation
remain follow-ups to this plan.

## Earlier release checkpoints, retained for history

[CURRENT_CONTEXT.md](CURRENT_CONTEXT.md) is the current source of product and
architecture direction. The historical math-based milestones below do not
define the next implementation phase.

**Shared release status:** accounts, friends, addressed invitations, private
saved context, optional sliders/Save & ready, password visibility and the real
130-venue catalog are active on shared `huddle-calhacks` and Vercel from
`a029fb6`. The rollout preserved original data and existing secrets/settings.
The shared deployment passed 41 connected, 14 OAuth-wiring and 30 desktop/mobile
browser checks with no browser errors/overflow. Source verification passed 99
Python tests, 129 server tests/one opt-in skip, build and lint before rollout.
The isolated review environment is still separate and available. The remaining
Claude proposal/revision, takeout/seating and provider-write follow-ups
are still open. See [operations](ACCOUNTS_RUNBOOK.md).

- [x] Review Eric Chen's Windows API launcher on main; it hosts the existing API
  through a tunnel and does not introduce a new planner.
- [x] Reproduce the local database-to-loopback HTTP restriction on SpacetimeDB
  2.13.0 using an isolated probe; stop the probe without changing live settings.
- [x] Prepare Render deployment settings and validate the Blueprint/schema plus
  Python 3.13 Linux dependency resolution. No hosted API deployment yet.
- [x] Choose local FastAPI + tunnel + Maincloud for this phase. Accept the
  designated host laptop's availability dependency; defer hosted API migration.
- [x] Approve [AGENT_FLOW_PLAN.md](AGENT_FLOW_PLAN.md): coordinator count, private
  confirmation, plan generation trigger, voting/Spin and migration sequence.
- [x] Confirm Max's Mac as designated operator and verify API/tunnel health before
  shared testing; only that operator changes Maincloud's API URL.
- [x] Implement additive context, confirmation, plan-response and input-revision contracts
  for agent planning across API, database jobs and UI.
- [x] Replace the feature/posterior/swipe/Monte Carlo decision pipeline for new huddles with a
  coordinator using all members' current prompts and confirmed requirements.
- [x] Preserve deterministic whole-outing budget checks, confirmed dietary and
  allergy restrictions, venue validation, privacy and stale-result guards.
- [x] Update the UI for per-member prompts, clarifications, readable agent
  proposals and choice; remove unsupported numerical confidence in the new flow.
- [x] Verify independent groups, prompt/budget changes, invalid model output,
  current votes/roulette/bookings, and separate desktop/mobile browser identities.
- [x] Previous coordinator release: publish the additive module to `huddle-calhacks` without a data reset;
  preserve existing secrets and point its API URL at Max's current tunnel.
- [x] Previous coordinator release: release the frontend to Vercel; main `57e1656` was pushed and
  Vercel reported deployment completed. Use a new huddle for coordinator mode.
- [x] Bright Data → SpacetimeDB ingestion (Eric Wu): versioned venue snapshot via
  `POST /catalog`, sent to FastAPI with each coordinator request and validated
  by both. 130-venue catalog committed ([BRIGHTDATA.md](BRIGHTDATA.md)).
- [x] Sync main, combine catalog integration with account/connector hard checks,
  regenerate bindings and activate all 130 venues in `huddle-account-max-check`.
  New scraped IDs pass API validation; frontend ratings use the database views.
- [x] Activate the shared module/API and exact committed catalog without a data
  reset. Vercel plans now include new scraped IDs; 130 real venues are active.
- [x] Feed bounded sourced menus/prices and attributed photos through Maincloud,
  Claude and private order cards.
- [ ] Feed evidenced takeout and suitable shared seating into the coordinator.
- [x] Implement optional budget/time sliders, optional prompt, flexible defaults,
  Save & ready and targeted clarifications on the isolated branch. Known allergies
  can finish input; verified venue evidence remains required for final food plans.
- [x] Implement account memberships, friends/requests, an Invite friends picker,
  addressed in-app notification links and owner-editable saved context in SpacetimeDB.
  New account huddles reject code-join bypasses. An opt-in Mac Messages adapter is
  implemented; a real user-triggered submission reached Messages but failed delivery.
- [x] Reduce password minimum to eight characters and add show/hide password.
- [x] Remove QR UI from the account flow; invitation messages carry addressed
  opening links and the Invite friends dropdown selects explicit recipients.
- [x] Include cached rating/review-count/source context for Claude and cached
  ratings on venue cards, with evidence limits preserved.
- [x] Complete the 41-check connected account → friends → invite → preferences →
  real-Claude plans → vote → simulated booking journey on the isolated module.
- [x] Finish the map-fix browser rerun: 30 assertions passed; record exact
  evidence in [ACCOUNTS_RUNBOOK.md](ACCOUNTS_RUNBOOK.md). No main push/shared
  deployment until requested; sync main before any approved release.
- [x] Add reviewed natural-language invitation intent, a picker fallback,
  Connectors, private Google OAuth, common-time scheduling, manual Berkeley time
  fallback and explicitly opted-in agreed meetup events on the isolated preview.
- [ ] Verify real Google consent/free-busy/event creation and one consenting
  Messages invitation. Credentials are configured; provider writes have only
  mocked tests. See [CONNECTORS_CONTRACT.md](CONNECTORS_CONTRACT.md).
- [x] Fix the artificial two-stop minimum for short dinner requests: one meal
  may be a complete coordinator plan, still subject to every hard constraint.
- [x] Add Max-owned Mac Contacts lookup and reviewed per-friend address links;
  explicit recipient opt-out remains authoritative. Real lookup succeeded.
- [ ] Confirm actual Messages receipt after an explicit reviewed invitation.
- [x] Review Eric Wu's actual catalog fields, snapshot boundary and sample records.
- [x] Wire collected menu items/prices/photos through a bounded snapshot extension.
- [ ] Add takeout and seating evidence to that extension. Inferred
  dietary tags and a default $25 meal estimate do not prove vegan/allergen safety
  or actual affordability. Reviews/star distributions are not reported in `/catalog`.
- [x] Implement and validate individual menu totals: each person pays for their
  own meal plus later stops. Store selections privately; preserve the legacy
  public venue baseline. Unknown prices are estimates and remain provisional.
- [ ] Complete Max's guided review with a separate test-bot browser.
- [ ] Rehearse with physical phones; browser mobile emulation is not that test.
- [ ] Consider removing legacy endpoints only after teammate review; they remain
  compatible for existing groups and older frontend clients.

See [AGENT_CONTRACT.md](AGENT_CONTRACT.md), [AGENT_RUNBOOK.md](AGENT_RUNBOOK.md)
and [AGENT_VERIFICATION.md](AGENT_VERIFICATION.md). Allergy evidence is absent,
booking is simulated and review/price/travel limitations remain explicit.

Suggested split: Max leads context/contracts and verification; Eric Wu owns the
API migration/local operation with Max; Eric Chen leads UI and coordinates
SpacetimeDB context/progress changes with Max. Coordinate overlapping file edits.
Eric Wu owns the active Bright Data ingestion handoff; Max integrates the
reviewed snapshot and deferred Claude proposal/validation/revision flow. Specific
menu prices, takeout support and shared seating matter before adding more review
text for the current mixed-meal example. See [NEXT_TASKS.md](NEXT_TASKS.md) for concrete
UI/Claude/data tasks, suggested owners and solo testing. Advanced routing, real
calls, vendor/MCP additions, inferred memory and actual-visit history remain later work.
The coordinator task is in progress until these demo-polish checks are complete.

## Historical roadmap and completed legacy work

This section records previous gates, ownership and verification of the existing
mathematical implementation. Old unchecked tasks are backlog, not current
requirements; use the priorities above when choosing work.

> Primary owner: Eric Chen; Max covers backend/evaluation while Eric Chen works on UI and Eric Wu works in `api/`. Updated after the backend deployment and real-API switch. Current operating state: [HANDOFF.md](HANDOFF.md), checks: [MAINCLOUD_VERIFICATION.md](MAINCLOUD_VERIFICATION.md). Check things off only when the stated check has passed.
>
> **H0 = Fri 6:00 PM** (the brief assumed 9 PM, so every gate is 3 hours earlier than `huddle.md` says).
> Legend: `[x]` done and in the repo · `[~]` in progress or rough draft · `[ ]` not started · `?` unknown (owner: please update)

## Gates

| Gate | When | What must be true | Status |
| --- | --- | --- | --- |
| H2 stubs | **Fri 8 PM** | Every endpoint exists with contract-shaped fakes; smoke test passes on fakes | `[x]` API and voice stubs connected through Maincloud; live synthetic confirm/full smoke tests pass; frontend flow previously reported passing |
| H8 hand-off | **Sat 2 AM** | places.json v1; Eric Chen's hand-off note | `[~]` places.json done; hand-off note drafted (`docs/HANDOFF.md`), final update before Eric Chen sleeps |
| L1 (H13) | **Sat 7 AM** | 4 phones join by QR, text parses, plan on a map with cost and timing, voting works; stubs-to-real flip done | `[~]` real API connected; four-identity backend smoke passes; physical-phone/browser check remains |
| L2 (H19) | **Sat 1 PM** | Swipes with confidence, 3 named plans with robustness, places.json v2, Mapbox leg times, one eval chart. Decide: council, Fetch.ai, live voice vs recording | `[ ]` |
| L3 (H24) + freeze | **Sat 6 PM** | Offers, scout badge, council streaming, polished screens, voice S1-S3 (or fallback), re-plan loop works once, demo path written | `[ ]` |
| Submit | **Sun 7:30 AM** (hard 9 AM, checked in by 8 AM) | Devpost complete (T7 checklist) | `[ ]` |

**Live backend:** SpacetimeDB Maincloud, `https://maincloud.spacetimedb.com`, database `huddle-calhacks`. Shared secret is passed privately only. API and module now use `STUB_MODE=false` with 130 real catalog venues for the coordinator (the legacy solver retains the bundled 45); voice remains a scripted `confirm` stub. Backend fixes are deployed without a data reset. Current URLs are in [HANDOFF.md](HANDOFF.md).

**Sleep/away times need re-checking against the 6 PM start.** If Eric Chen's away window is fixed in clock time (Sat 6 AM to noon), it is now H12 to H18, not H9 to H15.

## Historical coverage and access at the original handoff

The ownership/key-availability statements in this and the A–D sections below
describe the original handoff, not the current account-branch or Bright Data
assignment. Eric Wu's current ingestion ownership and the priorities above
supersede them.

- Eric Chen is working on UI; Max covers backend code and integration in this Codex session. Eric Wu is working in `api/`; coordinate before touching that folder. Primary ownership and shared contracts remain unchanged.
- Max Li and Eric Wu are confirmed Admin collaborators on `huddle-calhacks`. Max deployed source `7612d0b` with CLI 2.13.0 using his own account and `--delete-data=never`. Both public service URLs and real API mode were verified; the existing shared secret was preserved.
- Eric Wu's voice stub is connected. Six unit tests passed locally; live confirm and voice-originated full-to-re-plan checks passed, with no duplicate replay or automatic replacement call. Service restored to confirm; no real phone calls.
- Bright Data: Eric Wu has the account/key and ran the scrape (October 24); see [BRIGHTDATA.md](BRIGHTDATA.md). Haydn still owns the Mapbox token/routing.
- Max's first phase is complete. Eric Wu implemented the real parser/learning/solver/offers/council; Max connected it to Maincloud and ran real-mode HTTP and connected smoke checks. Review aspects are still placeholders, travel is estimated and scout is cached.
- Current work split: Eric Wu owns current `api/` work; Max covers backend integration/evaluation, leaving API files untouched. The next solver comparison can use the verified real API; it still needs to be run and reviewed.

## Shared

- [x] Plan docs (`build-brief.md`, `huddle.md`) updated for SpacetimeDB
- [x] Repo layout, `.gitignore`, `.env.example`
- [x] Contract `docs/CONTRACT.md` (S5.5 rewritten for SpacetimeDB)
- [x] End-to-end smoke test `scripts/smoke.mjs` passes on Maincloud with connected API/voice stubs, both confirm and voice-originated full scenarios (offers intentionally skip)
- [x] Real-API Maincloud switch and connected smoke: private offers, cumulative budgets, council, votes/roulette, synthetic confirm, injected full-to-re-plan and stale-choice rejection
- [ ] Booth answers posted (Meta, Cartesia, Bright Data, Microsoft, Fetch.ai, SpacetimeDB)

## A. Haydn: data, routing, glue

> **Haydn is out until Saturday. Eric Chen covered smoke testing and re-plan.** With Eric leaving, Bright Data and geo remain pending for Haydn; they have not been silently reassigned to Max. Haydn: read this section and HANDOFF.md when you arrive.


- [~] Bright Data account/key done (Eric Wu); Mapbox token still unconfirmed
- [x] `scripts/smoke.mjs`: Maincloud checks now support real council output and terminal booking guards; current results in [MAINCLOUD_VERIFICATION.md](MAINCLOUD_VERIFICATION.md)
- [~] Bare-bones UI: drafted by Eric Wu in `web/` (Vite + React, all screens routed, live on the SpacetimeDB views). Haydn: review and take over or confirm ownership
- [x] Bright Data pull + `docs/BRIGHTDATA.md` (Eric Wu): 936 Google Maps places, top reviews, rating snapshots, 130-venue catalog and venue details
- [ ] Aspect extraction, aggregation, `places.json` v2 (input: `data/places.base.json`; each place has `googlePlaceId`)
- [ ] `server/src/geo.ts`: route geometry, leg times (geo_cache table exists)
- [x] `server/src/replan.ts`: inline re-plan from /call-event; excludes the full place, new run, banner, vote reopens (Eric Chen)
- [ ] Polished screens pass 1 (H19-24)
- [ ] Demo video, pitch lead, rehearsal

## B. Eric Chen: SpacetimeDB and submission

- [x] SpacetimeDB module `server/`: schema, all views, reducers, procedures, jobs, HTTP routes (S5.5)
- [x] Privacy rules enforced in views (own prefs/offers only; perMember, gaveUp, council memberId hidden)
- [x] Fakes for every api and voice call, so the whole flow runs before the real services exist
- [x] `POST /call-event`, `POST /council-message`, `GET /health` routes with shared-secret check
- [x] Re-plan trigger: failed/full or closed queues `replan_job`
- [x] `data/fetch_places.py` and `places.json` v1 (45 real Berkeley places)
- [x] Published to Maincloud; four-phone test 23/23 there
- [x] Collaborator access: Max Li and Eric Wu are database Admins (browser role check)
- [x] `docs/HONESTY.md`, `docs/DISCLOSURE.md` (seeded; keep updating)
- [~] Hand-off note `docs/HANDOFF.md` (drafted; final update before sleep, due Sat 2 AM)
- [x] Wired Max's api stubs on Maincloud (`FASTAPI_BASE_URL`, `STUB_MODE=true`); smoke test + frontend flow pass through it
- [x] Max covering integration: set/verify Eric Wu's `VOICE_BASE_URL`, pass confirm and voice-originated "full" re-plan with him; restore confirm
- [x] Demo-mode safety net (`server/src/lib/demo.ts`): host toggle uses fakes; any failed api/voice call switches the group to labeled demo mode instead of freezing. Tested locally with both services dead. `cached_run.json` still a placeholder (fakes are used instead)
- [ ] Live scout via Bright Data (`docs/BRIGHTDATA.md` now exists; the scout itself is not built)
- [x] Council panel `web/src/components/council/` (functional pass; replays synthetic messages, not a live LLM council; restyle at H19)
- [x] Privacy fix: names hidden in plan text and offers unless showWhoCompromised
- [x] Raw service errors removed from public fallback warnings; cumulative budget rechecks, queued booking/terminal callback guards and host-only settings deployed. Server typecheck and 30 native tests pass (one opt-in HTTP test skipped).
- [x] Stale votes/roulette/bookings blocked after budget or run changes; history retained. Connected smoke verifies rejection after re-plan and late failure handling. Budget-change races are covered locally; UI verification remains. `api/` untouched by these fixes/deployment.
- [~] Experiment harness `docs/experiments/`: cumulative budgets and returned-plan validation fixed; corrected five-baseline run/chart regenerated with zero selected-plan budget violations. Earlier numbers withdrawn. The real API is ready for the pending "ours"/swipe comparisons; placeholder features still limit pitch claims.
- [x] Draft demo script and submission checklist in `docs/DEMO_CHECKLIST.md`; final rehearsal/submission still pending
- [ ] README, Devpost writeup, secret scan, submission checklist

## C. Max: solver and council

- [x] FastAPI stubs for every endpoint, tunnel live and connected (keep it running; send the new URL if it changes)
- [x] Dietary rule applies to meals/desserts only (tagless activities stay eligible)
- [x] Budget guards in the module (`server/src/lib/budgets.ts`)
- [x] Ignored `api/.env` loading and safe live shared-secret check; the saved secret matches Maincloud
- [x] All eight API routes passed HTTP checks through the development tunnel, including auth, deterministic responses and cumulative budgets
- [x] CLI 2.13.0 installed and logged in; management reads and environment-only voice URL update verified (no module/schema deploy)
- [~] Cover Eric Chen's backend work and remaining service integration
- [x] /parse-prefs with keyword fallback (Eric Wu)
- [x] L1 solver: filter, normalization, enumeration, robustness + Nash tie-break, three plans (Eric Wu). Bold/Budget floor is relative when Safe is below 0.5; see [api/README.md](../api/README.md)
- [x] Posterior update, active selection, Monte Carlo robustness, Pareto, posteriorSummary
- [x] /offers, /roulette
- [x] /council: advocates, chair, validator, optional POST to `/route/council-message` (`SPACETIMEDB_URI`/`SPACETIMEDB_DB`)
- [~] eval: determinism and behavior tests in `api/eval/test_real.py`; latency measured ad hoc (demo `/plan` ~70-80 ms, council 6-12 s), no p50/p95 script yet
- [x] API stub mode removed; `api/` always serves the real service, and the module integration check runs against it
- [x] Switch Maincloud to the real API (module and API `STUB_MODE=false` together); verified on a new four-identity huddle

## D. Eric Wu: voice

- [x] Claude API key shared privately; the real parser and council use it, while stub mode makes no model calls
- ? Twilio upgraded + number, Cartesia account, tunnel tool, demo phone verified
- [x] `POST /book` stub in `voice/`, confirm + full scenarios, six local unit tests pass; no real calls
- [x] Voice tunnel URL supplied/configured; live confirm and service-backed "full" re-plan passed with Max, then restored confirm
- [~] Bug: app jumped to Vote ~400 ms after the council finished and Plans bounced back to Vote. Fixed in code (`0d224a5`); browser check pending
- [ ] `web/.env.local` pointing at Maincloud (see HANDOFF.md)
- [ ] Voice spike: one Mandarin call end to end; GO / NO-GO
- [ ] State machine, tools, event posting; scenarios S1, S2
- [ ] S3 ("we're full") + re-plan loop with Eric Chen
- [~] Call screen `web/src/components/call/CallScreen.tsx` (draft exists)
- [x] Frontend draft for the whole app in `web/` (bonus; see A)
- [ ] Recorded fallback call (labeled)
