# Hand-off (Eric Chen to Max; Haydn retains Part A)

> Updated through live voice checks, corrected experiments, and backend privacy/stale-choice guards. The latest module changes still need a coordinated publish. H0 = Fri 6 PM. Read with [ROADMAP.md](ROADMAP.md) and [CONTRACT.md](CONTRACT.md). Current split: Eric Chen works on UI, Eric Wu works in `api/`, and Max covers backend/evaluation in Codex.

## Where things stand

- **Backend is live:** SpacetimeDB Maincloud, `https://maincloud.spacetimedb.com`, database `huddle-calhacks` (dashboard: https://spacetimedb.com/@kwunnchen/huddle-calhacks). Eric Chen is owner; Max Li and Eric Wu are confirmed Admin collaborators.
- **Connected to Max's FastAPI stubs** via `FASTAPI_BASE_URL=https://conferencing-navigate-deleted-feedback.trycloudflare.com`, `STUB_MODE=true`. Every plan, parse and council message comes from his service and is labeled SYNTHETIC STUB.
- **Voice stub is connected** at `https://restaurants-availability-barbie-lil.trycloudflare.com`. Live synthetic confirm and voice-originated full-to-re-plan checks passed through Maincloud with one event sequence per booking. Eric Wu restored `STUB_SCENARIO=confirm`, verified by the final run. No real phone call was made.
- **Smoke test:** both live voice scenarios passed. The full case produced replacement plans excluding the restaurant, reopened voting and did not auto-call another place. Offers skip because the stubs return none on purpose. See [verification](../api/eval/VERIFICATION.md#live-voice-integration-follow-up).
- **Frontend:** Eric Chen reported the Maincloud flow passes. The rapid Plans-to-Vote transition and reopening Plans still need a browser regression check; do not infer those are fixed from the voice stub landing.
- **Max's CLI is ready:** version 2.13.0 at `/Users/maxli/.local/bin/spacetime`, logged into Max's own account. An environment-only publish set `VOICE_BASE_URL`; management reads verified `FASTAPI_BASE_URL` and `STUB_MODE=true` stayed unchanged. No module/schema deploy or data reset was performed.
- **Bright Data:** no account/key yet. The ignored root `.env` has a blank `BRIGHTDATA_API_KEY` entry; this is not a configured integration. Haydn owns the account/reviews; Eric Chen was covering the booth task.
- **Current work split:** Eric Wu is working in `api/`; Max's current changes are experiments and documentation. Coordinate before touching that folder or evaluating the changing service.

| Piece | Real or fake right now |
| --- | --- |
| Places | Max's synthetic fixture while `STUB_MODE=true`; real 45 Berkeley places in `data/places.json` for later |
| Parse, swipes, plans, council | Max's stubs (canned) |
| Offers | none (stub returns none, never faked) |
| Scout badge | cached file, labeled "Checked earlier" |
| Phone call | separate voice service, scripted confirm scenario; no phone call |
| Re-plan on "full" | real logic, tested |

## Async tasks (no Claude needed)

### Eric Chen before leaving

- [x] Smoke test, hand-off and voice stub are on main (pulled through `7cb6613`).
- [x] Add Max Li and Eric Wu as Admin collaborators (confirmed in the dashboard).
- [x] Max and Eric Wu confirmed the voice URL/configuration and tested synthetic confirm/full callbacks through Maincloud.
- [ ] Assign or finish the Bright Data booth task: prize/credits, Google Maps reviews product, rate limits, usage requirements and key acquisition. Haydn remains the review-pipeline owner; no account exists yet.
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
- [ ] Next phase, when started: real `/parse-prefs`, then the L1 solver (filter, normalize, enumerate, maximin). The dietary rule must apply to meals and desserts only (commit 88a6746 already does this). No real solver/learning/LLM work was added during the first phase.
- [ ] Note: only ~7 real activities are open after 7:30 PM Saturday; places carry an extra `googlePlaceId` field.
- [ ] Keep temporary backend changes compatible with the shared contract; sync main before merging/pushing. Max is authorized to cover backend fixes; unresolved shared-shape changes still need agreement.
- [x] Review experiment method: cumulative-budget bug fixed, API-plan validator and regression checks added; corrected baseline results regenerated. Old numbers withdrawn. Final pitch claim and real API comparison still pending; see [experiments/README.md](experiments/README.md).

### Eric Wu

- [x] **`/book` voice stub** merged: confirm/full scenarios and six passing local unit tests. No phone call is placed.
- [x] Tunnel URL configured and authenticated callbacks to `https://maincloud.spacetimedb.com/v1/database/huddle-calhacks/route/call-event` tested with Max for confirm and full; restored confirm.
- [ ] **Bug:** the app jumps to Vote ~400 ms after the council finishes, and Plans cannot be reopened (bounces to Vote), so nobody sees the debate. Show the council panel on Vote, or delay the jump and allow going back.
- [ ] Add `web/.env.local`: `NEXT_PUBLIC_SPACETIMEDB_URI=https://maincloud.spacetimedb.com`, `NEXT_PUBLIC_SPACETIMEDB_DB=huddle-calhacks`.
- [x] Claude API key shared privately with Max; current stubs do not use it.
- [ ] Voice spike: one Mandarin call end to end; GO / NO-GO.

### Haydn (out until Saturday)

- [ ] Read ROADMAP Part A first: Eric Chen covered `scripts/smoke.mjs` and `server/src/replan.ts`.
- [ ] Agree with Eric Wu who owns `web/` from here.
- [ ] Bright Data review pull + `docs/BRIGHTDATA.md`, unless Eric Chen has started it (check the roadmap).
- [ ] Create the Bright Data account/get the key and obtain the Mapbox token. Coordinate the booth task with Eric Chen; Max is not taking over the review pipeline by default.

## Remaining work (not dependent on Eric Chen's Claude quota)

1. **Bright Data:** review pull for `data/places.base.json` (each place has `googlePlaceId`), `docs/BRIGHTDATA.md`, then the live scout check in `server/src/council.ts` (`runScoutJob`). Needs `BRIGHTDATA_API_KEY`.
2. **Keep both Python services and tunnels awake:** Max owns the API process/tunnel; Eric Wu owns voice. Report new URLs after a tunnel restart and update the matching module setting. Real voice remains a later phase.
3. **Demo-mode fallbacks:** done in `server/src/lib/demo.ts` (Eric Chen). A dead tunnel now flips that group to labeled demo mode instead of freezing parse/swipes; the host can also toggle it. **Needs a Maincloud publish after it is merged** (only then is it live). `data/cached_run.json` is still a placeholder; the labeled fakes serve that role.
4. **`server/src/geo.ts`:** Mapbox route geometry + leg times with `geo_cache`. Needs `MAPBOX_TOKEN`. Fallback is straight lines.
5. **Rerun experiments** after places.json v2 and Eric Wu's real API are ready. Baselines run without API calls by default; opt-in commands and failure reporting are in [experiments/README.md](experiments/README.md#reproduce). Demo rehearsal and submission checklist: [DEMO_CHECKLIST.md](DEMO_CHECKLIST.md).

## Verification after pulling the voice stub

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
api/.venv/bin/python api/eval/check_live.py \
  --server https://maincloud.spacetimedb.com --database huddle-calhacks \
  --voice-base-url https://restaurants-availability-barbie-lil.trycloudflare.com \
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

To verify the voice-originated full case, Eric Wu restarts only his API with
`STUB_SCENARIO=full`, keeping the tunnel running. Run the same helper with
`--voice-scenario full`, then restore the service to `confirm` and rerun confirm.
The test flag selects assertions, not the remote scenario. No real calls are made.

## Gotchas (each cost a failed publish or a production-only bug)

- **Maincloud refuses to add or remove a schedule on an existing table.** Do new background work inline, or in a brand-new table. Ask Eric Chen before adding tables or scheduled jobs.
- **Randomness is seeded from the transaction timestamp,** so two transactions can draw the same "random" id. Use `newId(ctx, prefix, taken)` from `server/src/lib/util.ts`.
- **The module entry (`server/src/index.ts`) may only export SpacetimeDB exports;** route paths must be lowercase.
- **Free tunnel URLs die when the laptop sleeps.** Planning falls back to synthetic module plans with a warning; the smoke test's "plan came from the api" check catches it. A failed HTTP request to a configured voice URL instead records a failed/error booking; voice fakes are used only when `VOICE_BASE_URL` is unset.
- **Pull before you commit.** Several people edit `docs/` and `server/`.
