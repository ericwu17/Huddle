# Hand-off (Eric Chen to Max; Haydn retains Part A)

## Current direction October 24

Read [CURRENT_CONTEXT.md](CURRENT_CONTEXT.md) first. The approved one-Claude
coordinator is implemented across API, private Maincloud context/jobs and the
local frontend. Legacy groups/endpoints retain their math shapes. The additive
[contract](AGENT_CONTRACT.md), [runbook](AGENT_RUNBOOK.md) and
[verification](AGENT_VERIFICATION.md) describe the new behavior.

The current decision is to retain Vercel and Maincloud with local FastAPI behind
a tunnel, accepting that host laptop's availability dependency temporarily.
One designated operator owns the shared API/tunnel URL. Hosted API migration is
deferred; the earlier Render configuration has not been deployed. Local
development keeps Vite and FastAPI separate. The previous all-local database
proposal is blocked as written on 2.13.0. The Bright Data scraper and a 130-venue
live catalog are active on shared Maincloud/Vercel ([operations](ACCOUNTS_RUNBOOK.md));
real calls remain deferred. [NEXT_TASKS.md](NEXT_TASKS.md) records the open task
breakdown, suggested owners and solo-test commands.

**Current operator: Max's Mac, October 24.** FastAPI is on loopback port 8000;
its current public URL is `https://roughly-metabolism-representing-harmony.trycloudflare.com`.
The additive module is published to `huddle-calhacks` with `STUB_MODE=false`, no
data reset, and existing shared secret/unrelated settings preserved. The updated
Vercel UI is `https://huddle.compare/login`; account/catalog source
`a029fb6` is activated. Keep the shared API, tunnel and Mac awake; Vite is not
required for Vercel. The 130-venue rollout preserved 26 existing groups, 57
members and 17 plan runs. Shared verification passed 41 connected, 14 OAuth and
30 desktop/mobile browser checks. New users create shared accounts; preview
accounts are separate. Mac texting is disabled; booking remains simulated.
See [ACCOUNTS_RUNBOOK.md](ACCOUNTS_RUNBOOK.md) for exact restart commands.

The sections below are historical legacy operating notes. In particular, the
Windows-host ownership and past tunnel URLs below no longer describe the current
operator. Do not run another helper that replaces Max's shared API URL.

> Updated after the Maincloud backend deployment and real-API switch on Oct 23, 2026 (Pacific). H0 = Fri 6 PM. Read with [ROADMAP.md](ROADMAP.md), [CONTRACT.md](CONTRACT.md) and [current verification](MAINCLOUD_VERIFICATION.md). Current split: Eric Chen works on UI, Eric Wu works in `api/`, and Max covers backend/evaluation in Codex.

## Where things stand

- **Backend is live:** SpacetimeDB Maincloud, `https://maincloud.spacetimedb.com`, database `huddle-calhacks` (dashboard: https://spacetimedb.com/@kwunnchen/huddle-calhacks). Eric Chen is owner; Max Li and Eric Wu are confirmed Admin collaborators.
- **Real API back up, hosted on Eric Chen's Windows laptop (Sat Oct 24, 9:30 AM):** `scripts/host-api.ps1` runs `api/` and a quick tunnel, then publishes `FASTAPI_BASE_URL` and `STUB_MODE=false` with `VOICE_BASE_URL` removed, so bookings play the module's scripted confirm call. Connected smoke on Maincloud: **ALL PASS**, including "plan came from the api" and a real 9-message council. If the laptop or tunnel stops, new groups drop into labeled demo mode until the script is rerun (each run gets a new URL). Eric Wu's voice service is not connected; `scripts/tunnels.sh` (macOS) still works for hosting API and voice together.
- **Local SpacetimeDB does not remove the tunnel:** on 2.13.0, procedure HTTP refuses private addresses (127.0.0.1, localhost, LAN IPs), and standalone config has no allowlist. Phase 1 of [SINGLE_LAPTOP_PLAN.md](SINGLE_LAPTOP_PLAN.md) fails for that reason.
- **Voice stub:** scripted `confirm`/`full` callbacks only; it does not place phone calls.
- **Smoke test:** real parsing, swipe updates, plans, council (without chair fallback), a private offer, votes and roulette pass through Maincloud. Plans' cumulative costs fit every private cap. Synthetic confirmation and injected full-to-re-plan pass, including stale-choice rejection. The voice-originated full scenario passed earlier with the old API stubs; it has not been rerun against this new deployment. See [current verification](MAINCLOUD_VERIFICATION.md).
- **Frontend:** Eric Chen reported the Maincloud flow passes. The Plans-to-Vote jump is fixed in `0d224a5`: phones on Plans stay there when voting opens, and Vote links back to the debate. It still needs a browser check ([DEMO_CHECKLIST.md](DEMO_CHECKLIST.md)). The landing page is served at `/landing` (`web/public/landing/`).
- **Backend fixes deployed:** source `7612d0b` was published with CLI 2.13.0, `--delete-data=never`, and the new public service URLs. Existing shared secret and unspecified environment values were preserved; no data reset. Privacy, stale choices/current budgets, queued booking/late callback guards and host-only settings are live.
- **Bright Data:** Eric Wu has an account and key (kept in his ignored `.env`) and ran the full Google Maps scrape on October 24: 936 Berkeley places, plus a 130-venue catalog and venue details. See [BRIGHTDATA.md](BRIGHTDATA.md). Going live needs a module republish, an API restart and `collect.py publish` ([go live](BRIGHTDATA.md#go-live)). That publish step needs only the shared secret, not the Bright Data key.
- **Real API implemented and switched on:** [api/README.md](../api/README.md) describes the implementation and limitations. Real-mode HTTP smoke passed through Eric Wu's tunnel. The API's stub mode has since been removed: `api/` always serves the real service, and the module integration check runs against it. Review aspects are still placeholders and travel times are estimates; scout and phone calls remain cached/scripted.
- **Current work split:** Eric Wu owns current `api/` work; Max covers backend integration/evaluation. This deployment did not edit API files or restart Eric's services.

| Piece | Real or fake right now |
| --- | --- |
| Places | 130 real venues active in the coordinator catalog; legacy solver retains the bundled 45. Review aspects remain placeholders |
| Parse, swipes, plans, council | Real implementation on Maincloud, `STUB_MODE=false`; keyword/Safe fallbacks remain available |
| Offers | Real private offers; the connected test delivered one only to its recipient |
| Scout badge | cached file, labeled "Checked earlier" |
| Phone call | separate voice service, scripted confirm scenario; no phone call |
| Re-plan on "full" | real logic, tested |

## Async tasks (no Claude needed)

### Eric Chen before leaving

- [x] Smoke test, hand-off and voice stub are on main (pulled through `7cb6613`).
- [x] Add Max Li and Eric Wu as Admin collaborators (confirmed in the dashboard).
- [x] Max and Eric Wu confirmed the voice URL/configuration and tested synthetic confirm/full callbacks through Maincloud.
- [~] Bright Data booth task: Eric Wu has the account and key, and the scrape has run. Prize/credits and usage requirements are still unconfirmed.
- [ ] Optional: free Mapbox token into `.env` as `MAPBOX_TOKEN` (for walking routes).
- [ ] DM the shared secret to Eric Wu if not done. Never post it in a channel.
- [ ] Re-check your Saturday away window against the 6 PM start (6 AM-noon is H12-H18).
- [ ] Devpost: create the project, add all four teammates, pick tracks (Meta, Cartesia, Bright Data, SpacetimeDB if it has a prize).
- [ ] Before sleeping: update this file's "Where things stand" if anything changed.

### Max (solver owner; temporary backend coverage)

- [x] CLI 2.13.0 runtime installed and selected; login and authenticated management reads verified using Max's account, without changing live data.
- [x] Cover backend integration while Eric is away: voice URL configured; successful synthetic booking and voice-originated full-to-re-plan passed through Maincloud.
- [ ] Keep the FastAPI server + Cloudflare tunnel running. If the URL changes, send the new one (see "Operating" below).
- [x] First-phase API stubs, auth, deterministic fixtures, budget/dietary fixes, automatic private env loading, shared-secret verification and tunnel smoke checks.
- [x] Real `/parse-prefs`, learning, solver, offers and council: implemented by Eric Wu; `api/` has no stub mode now (dietary rule still meals and desserts only). Review [api/README.md](../api/README.md) decisions before relying on numbers.
- [ ] Note: only ~7 real activities are open after 7:30 PM Saturday; places carry an extra `googlePlaceId` field.
- [ ] Keep temporary backend changes compatible with the shared contract; sync main before merging/pushing. Max is authorized to cover backend fixes; unresolved shared-shape changes still need agreement.
- [x] Review experiment method: cumulative-budget bug fixed, API-plan validator and regression checks added; corrected baseline results regenerated. Old numbers withdrawn. Final pitch claim and real API comparison still pending; see [experiments/README.md](experiments/README.md).

### Eric Wu

- [x] **`/book` voice stub** merged: confirm/full scenarios and six passing local unit tests. No phone call is placed.
- [x] Tunnel URL configured and authenticated callbacks to `https://maincloud.spacetimedb.com/v1/database/huddle-calhacks/route/call-event` tested with Max for confirm and full; restored confirm.
- [x] **Bug fixed in `0d224a5`:** the app no longer jumps to Vote when the council finishes, and Plans can be reopened. Browser check still pending.
- [ ] Add `web/.env.local`: `NEXT_PUBLIC_SPACETIMEDB_URI=https://maincloud.spacetimedb.com`, `NEXT_PUBLIC_SPACETIMEDB_DB=huddle-calhacks`.
- [x] Claude API key shared privately with Max; current stubs do not use it.
- [ ] Voice spike: one Mandarin call end to end; GO / NO-GO.
- [x] Real API in `api/` (`STUB_MODE=false`): 37 unit tests, module integration check, HTTP smoke in both modes, and a local real-mode run of the module procedures with live Claude.
- [x] API stub mode removed: `api/` always serves the real service. 27 unit tests and the module integration check (rewritten for the real API) pass locally.
- [x] Switch Maincloud to the real API with the team: API and module `STUB_MODE=false` together; new four-identity huddle passes connected smoke.

### Haydn (out until Saturday)

- [ ] Read ROADMAP Part A first: Eric Chen covered `scripts/smoke.mjs` and `server/src/replan.ts`.
- [ ] Agree with Eric Wu who owns `web/` from here.
- [x] Bright Data pull + `docs/BRIGHTDATA.md` (Eric Wu): Google Maps places, ratings and venue details. Review text is not mined into aspects yet.
- [~] Bright Data account/key done (Eric Wu); the Mapbox token is still open.

## Remaining work (not dependent on Eric Chen's Claude quota)

1. **Bright Data:** the scrape and live catalog are built ([BRIGHTDATA.md](BRIGHTDATA.md)). Still to do:
   - publish the catalog ([go live](BRIGHTDATA.md#go-live));
   - feed `details.json` (menus, takeout, seating) to the coordinator;
   - the live scout check in `server/src/council.ts` (`runScoutJob`).
2. **Keep both Python services and tunnels awake:** coordinate the current API/voice processes with Eric Wu, who supplied the new endpoints. Report new URLs after a tunnel restart and update the matching module setting. Real voice remains a later phase.
3. **Demo-mode fallbacks:** deployed in `server/src/lib/demo.ts` (Eric Chen). A dead tunnel flips that group to labeled demo mode instead of freezing parse/swipes; the host can also toggle it. Native tests cover this path; the connected real-API run stayed out of fallback mode. `data/cached_run.json` is still a placeholder; labeled fakes serve that role.
4. **`server/src/geo.ts`:** Mapbox route geometry + leg times with `geo_cache`. Needs `MAPBOX_TOKEN`. Fallback is straight lines.
5. **Rerun experiments** after places.json v2; Eric Wu's real API is ready for the opt-in comparison (run it with `STUB_MODE=false`). Baselines run without API calls by default; opt-in commands and failure reporting are in [experiments/README.md](experiments/README.md#reproduce). Demo rehearsal and submission checklist: [DEMO_CHECKLIST.md](DEMO_CHECKLIST.md).

## Earlier verification history

The pending-publish statements below describe earlier checks; the module is now
deployed. Current results and commands are in [MAINCLOUD_VERIFICATION.md](MAINCLOUD_VERIFICATION.md).

- `api/.venv/bin/python -m unittest discover -s voice/eval -v`: six voice tests passed (local fake event poster; no Maincloud callbacks).
- `npm run typecheck --prefix server`: passed.
- `api/.venv/bin/python api/eval/check_integration.py`: all 12 API/module tests passed, including real HTTP to a temporary local API and an in-memory SpacetimeDB datastore.
- `node --check scripts/smoke.mjs`: syntax passed. Live voice-originated full scenario passed in group `NV86`; final confirm passed in group `ZYA6`, including no duplicate replay, privacy, voting and council checks. Offers skipped as expected.
- Earlier tunnel checks passed all eight API routes; API and Maincloud health returned 200 with nine synthetic places. The later smoke runs verified calls through both separate Python services, using scripted results.
- CLI archive matched the official 2.13.0 SHA-256; version/login and management reads passed. The environment-only voice URL update succeeded; API URL/stub mode stayed unchanged. No secret was printed.
- Experiment follow-up: 22 regression checks passed; corrected baselines cover 1,000 feasible groups with zero selected-plan budget violations. An independent Decimal audit checked all 5,000 selected outing totals/caps, and a separate rerun produced byte-identical CSVs/chart. No live API was called or API file changed. Old experimental numbers are withdrawn; the real solver comparison remains pending.
- After merging `059292a`: server typecheck passed; `npm test --prefix server` passed 11 tests with the opt-in HTTP test skipped. No API server was started for that check. The new demo-mode module was not published by Max.
- Backend privacy follow-up: a failing regression reproduced raw service error details leaking into group-visible fallback warnings. Those warnings now contain only endpoint/status or generic unavailability. Server typecheck and 14 native integration tests pass (one opt-in API HTTP test skipped), including tight cumulative caps, a cap lowered during a failed request, and no repeated outbound requests once fallback mode is active. `api/` was untouched; the module update still needs a coordinated publish.
- Stale-choice follow-up: votes, roulette and booking requests now require the latest completed run and current cumulative budgets. Roulette rechecks after HTTP before returning/storing a choice. Public views hide stale/unaffordable votes and roulette choices while retaining stored history. Queued bookings recheck before dispatch; invalid ones fail with a generic error and never call voice or another place. Dispatch is claimed once per booking; late callbacks cannot revive failed bookings or advance/re-plan a newer run. `npm test --prefix server`: 28 passed, one opt-in HTTP test skipped; typecheck passed. Native tests cover normal synthetic confirm/full flows too. No API files, process, schema or shared JSON shapes changed; module publish remains pending.
- Small host-setting correction: the existing host-only UI controls for fallback mode and compromise visibility are now enforced by the reducers too. Tests reject ordinary member changes and preserve host on/off controls. Server typecheck and 30 native tests pass (one opt-in API HTTP test skipped); `api/` unchanged. Broader security work is deferred for the hackathon; module publish remains pending.

Budget changes cannot undo an already-dispatched external call or reservation.
Its confirmation stays in booking/event history, but it does not advance an
unaffordable or superseded group plan to booked. An interrupted worker after
claiming dispatch does not automatically redial; any retry requires an explicit
new booking action. UI labels after budget/run changes still need a browser check
with Eric Chen; these checks exercise module actions and view outputs locally.

## Operating

All commands from the repo root, using the logged-in account of an authorized
database administrator. Private configuration files are ignored by Git:
`api/.env` for FastAPI, `voice/.env` for voice, root `.env` (or exported values)
for the Node smoke test, and `web/.env.local` for public frontend configuration.
Max's API secret is saved in `api/.env`; the root `.env` currently only has the
blank Bright Data entry. Do not assume one file is automatically loaded by every
service, and never put shared/provider secrets in frontend variables. The Python
live-check helper below loads `api/.env`, so no secret needs to be copied to root.

```bash
# Login with your own invited account (once CLI installation is complete)
spacetime login
spacetime login show                 # do not add --token

# Sync before publishing module changes; retain the deployed environment
git pull --no-rebase origin main
spacetime publish huddle-calhacks -p server -s https://maincloud.spacetimedb.com --delete-data never

# Change only the service URL from a shell with no other module env overrides
FASTAPI_BASE_URL=https://NEW-URL.trycloudflare.com spacetime publish huddle-calhacks -s https://maincloud.spacetimedb.com --env-only --no-config

# Smoke test against Maincloud (loads api/.env; creates a throwaway group)
# $VOICE_URL is the voice tunnel URL that scripts/tunnels.sh prints
api/.venv/bin/python api/eval/check_live.py \
  --server https://maincloud.spacetimedb.com --database huddle-calhacks \
  --voice-base-url "$VOICE_URL" \
  --voice-scenario confirm

# Frontend against Maincloud (PowerShell, from web/)
$env:NEXT_PUBLIC_SPACETIMEDB_URI='https://maincloud.spacetimedb.com'; $env:NEXT_PUBLIC_SPACETIMEDB_DB='huddle-calhacks'; npx vite --port 5180
```

`spacetime` is at `%LOCALAPPDATA%\SpacetimeDB\spacetime.exe` on Eric Chen's
laptop. Max's ready CLI is `/Users/maxli/.local/bin/spacetime` (2.13.0); his
existing interactive zsh setup adds `~/.local/bin` to PATH, so open a fresh
terminal or use the full path. Max's own-account CLI management reads are
verified, and the environment-only voice URL update succeeded. Max and Eric Wu have Admin roles and should
use their own logins. Eric Wu's CLI setup has not been checked here. Do not share
Eric Chen's login/token.

To verify the voice-originated full case, Eric Wu restarts only his voice API with
`STUB_SCENARIO=full`, keeping the tunnel running. Run the same helper with
`--voice-scenario full`, then restore the service to `confirm` and rerun confirm.
The test flag selects assertions, not the remote scenario. No real calls are made.

## Gotchas (each cost a failed publish or a production-only bug)

- **Maincloud refuses to add or remove a schedule on an existing table.** Do new background work inline, or in a brand-new table. Ask Eric Chen before adding tables or scheduled jobs.
- **Randomness is seeded from the transaction timestamp,** so two transactions can draw the same "random" id. Use `newId(ctx, prefix, taken)` from `server/src/lib/util.ts`.
- **The module entry (`server/src/index.ts`) may only export SpacetimeDB exports;** route paths must be lowercase.
- **Free tunnel URLs die when the laptop sleeps.** Planning falls back to synthetic module plans with a warning; the smoke test's "plan came from the api" check catches it. A failed HTTP request to a configured voice URL instead records a failed/error booking; voice fakes are used only when `VOICE_BASE_URL` is unset.
- **Pull before you commit.** Several people edit `docs/` and `server/`.
