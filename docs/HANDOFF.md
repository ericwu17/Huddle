# Hand-off (Eric Chen to Max; Haydn retains Part A)

> Updated Friday Oct 23 after pulling Eric Wu's voice stub (`7cb6613`). H0 = Fri 6 PM. Read with [ROADMAP.md](ROADMAP.md) and [CONTRACT.md](CONTRACT.md). Eric Chen is leaving and has exhausted his Claude session usage; Max is covering backend coding and integration in Codex.

## Where things stand

- **Backend is live:** SpacetimeDB Maincloud, `https://maincloud.spacetimedb.com`, database `huddle-calhacks` (dashboard: https://spacetimedb.com/@kwunnchen/huddle-calhacks). Eric Chen is owner; Max Li and Eric Wu are confirmed Admin collaborators.
- **Connected to Max's FastAPI stubs** via `FASTAPI_BASE_URL=https://conferencing-navigate-deleted-feedback.trycloudflare.com`, `STUB_MODE=true`. Every plan, parse and council message comes from his service and is labeled SYNTHETIC STUB.
- **Voice stub is merged** (`voice/`, see its README). Six unit tests passed again in Max's checkout. Max's authenticated CLI check confirms `VOICE_BASE_URL` is unset; obtain its tunnel URL, configure it and verify live callbacks before claiming the voice service is connected.
- **Smoke test:** Eric Chen reported 27 passing Maincloud checks; offers skip because the stubs return none on purpose. This was not rerun against Maincloud during this documentation update.
- **Frontend:** Eric Chen reported the Maincloud flow passes. The rapid Plans-to-Vote transition and reopening Plans still need a browser regression check; do not infer those are fixed from the voice stub landing.
- **Max's CLI is ready:** version 2.13.0 installed at `/Users/maxli/.local/bin/spacetime` and logged in with Max's own account. Authenticated management reads returned the correct `FASTAPI_BASE_URL`, `STUB_MODE=true`, and absent `VOICE_BASE_URL`. No live settings were changed and no publish was attempted.
- **Bright Data:** no account/key yet. The ignored root `.env` has a blank `BRIGHTDATA_API_KEY` entry; this is not a configured integration. Haydn owns the account/reviews; Eric Chen was covering the booth task.

| Piece | Real or fake right now |
| --- | --- |
| Places | Max's synthetic fixture while `STUB_MODE=true`; real 45 Berkeley places in `data/places.json` for later |
| Parse, swipes, plans, council | Max's stubs (canned) |
| Offers | none (stub returns none, never faked) |
| Scout badge | cached file, labeled "Checked earlier" |
| Phone call | module fake (confirm scenario) |
| Re-plan on "full" | real logic, tested |

## Async tasks (no Claude needed)

### Eric Chen before leaving

- [x] Smoke test, hand-off and voice stub are on main (pulled through `7cb6613`).
- [x] Add Max Li and Eric Wu as Admin collaborators (confirmed in the dashboard).
- [ ] Confirm the current voice URL/configuration and what has actually been tested with Eric Wu.
- [ ] Assign or finish the Bright Data booth task: prize/credits, Google Maps reviews product, rate limits, usage requirements and key acquisition. Haydn remains the review-pipeline owner; no account exists yet.
- [ ] Optional: free Mapbox token into `.env` as `MAPBOX_TOKEN` (for walking routes).
- [ ] DM the shared secret to Eric Wu if not done. Never post it in a channel.
- [ ] Re-check your Saturday away window against the 6 PM start (6 AM-noon is H12-H18).
- [ ] Devpost: create the project, add all four teammates, pick tracks (Meta, Cartesia, Bright Data, SpacetimeDB if it has a prize).
- [ ] Before sleeping: update this file's "Where things stand" if anything changed.

### Max (solver owner; temporary backend coverage)

- [x] CLI 2.13.0 runtime installed and selected; login and authenticated management reads verified using Max's account, without changing live data.
- [ ] Cover backend integration while Eric is away: wire/verify the voice URL with Eric Wu, then confirm successful booking and full-to-re-plan through Maincloud.
- [ ] Keep the FastAPI server + Cloudflare tunnel running. If the URL changes, send the new one (see "Operating" below).
- [x] First-phase API stubs, auth, deterministic fixtures, budget/dietary fixes, automatic private env loading, shared-secret verification and tunnel smoke checks.
- [ ] Next phase, when started: real `/parse-prefs`, then the L1 solver (filter, normalize, enumerate, maximin). The dietary rule must apply to meals and desserts only (commit 88a6746 already does this). No real solver/learning/LLM work was added during the first phase.
- [ ] Note: only ~7 real activities are open after 7:30 PM Saturday; places carry an extra `googlePlaceId` field.
- [ ] Keep temporary backend changes compatible with the shared contract; sync main before merging/pushing. Max is authorized to cover backend fixes; unresolved shared-shape changes still need agreement.
- [ ] Review `docs/experiments/README.md` method before any number goes on a slide.

### Eric Wu

- [x] **`/book` voice stub** merged: confirm/full scenarios and six passing local unit tests. No phone call is placed.
- [ ] Confirm its tunnel URL with Max or Eric Chen, set/verify `VOICE_BASE_URL`, then test callbacks to `https://maincloud.spacetimedb.com/v1/database/huddle-calhacks/route/call-event` with `X-Huddle-Secret`.
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
2. **Wire Eric Wu's voice URL (Max covering):** env-only publish with `VOICE_BASE_URL`, then test the voice stub's confirm and full callback sequences end to end. A successful synthetic sequence is not a real phone call.
3. **Demo-mode fallbacks:** fill `data/cached_run.json` from a real run; auto demo mode when `/health` fails.
4. **`server/src/geo.ts`:** Mapbox route geometry + leg times with `geo_cache`. Needs `MAPBOX_TOKEN`. Fallback is straight lines.
5. **Rerun experiments** after places.json v2 and Max's real `/plan` (`python docs/experiments/sim.py`).

## Verification after pulling the voice stub

- `api/.venv/bin/python -m unittest discover -s voice/eval -v`: six voice tests passed (local fake event poster; no Maincloud callbacks).
- `npm run typecheck --prefix server`: passed.
- `api/.venv/bin/python api/eval/check_integration.py`: all 12 API/module tests passed, including real HTTP to a temporary local API and an in-memory SpacetimeDB datastore.
- `node --check scripts/smoke.mjs`: syntax passed; the live smoke test was not rerun in this update.
- Earlier tunnel checks passed all eight API routes; both API tunnel health and Maincloud health returned 200 with nine synthetic places. These do not prove the voice service is wired.
- CLI archive matched the official 2.13.0 SHA-256; `spacetime --version`, `spacetime login show`, and management reads of the API URL/stub mode passed. The CLI read of `VOICE_BASE_URL` reported the key is absent. Secret values were not read or printed by these checks.

## Operating

All commands from the repo root, using the logged-in account of an authorized
database administrator. Private configuration files are ignored by Git:
`api/.env` for FastAPI, `voice/.env` for voice, root `.env` (or exported values)
for the Node smoke test, and `web/.env.local` for public frontend configuration.
Max's API secret is saved in `api/.env`; the root `.env` currently only has the
blank Bright Data entry. Do not assume one file is automatically loaded by every
service, and never put shared/provider secrets in frontend variables.

```bash
# Login with your own invited account (once CLI installation is complete)
spacetime login
spacetime login show                 # do not add --token

# Sync before publishing module changes; retain the deployed environment
git pull --no-rebase origin main
spacetime publish huddle-calhacks -p server -s https://maincloud.spacetimedb.com --delete-data never

# Change only the service URL; preserve the shared secret, voice and other settings
FASTAPI_BASE_URL=https://NEW-URL.trycloudflare.com spacetime publish huddle-calhacks -s https://maincloud.spacetimedb.com --env-only

# Smoke test against Maincloud (creates one throwaway group)
SPACETIMEDB_URI=https://maincloud.spacetimedb.com SPACETIMEDB_DB=huddle-calhacks node scripts/smoke.mjs

# Frontend against Maincloud (PowerShell, from web/)
$env:NEXT_PUBLIC_SPACETIMEDB_URI='https://maincloud.spacetimedb.com'; $env:NEXT_PUBLIC_SPACETIMEDB_DB='huddle-calhacks'; npx vite --port 5180
```

`spacetime` is at `%LOCALAPPDATA%\SpacetimeDB\spacetime.exe` on Eric Chen's
laptop. Max's ready CLI is `/Users/maxli/.local/bin/spacetime` (2.13.0); his
existing interactive zsh setup adds `~/.local/bin` to PATH, so open a fresh
terminal or use the full path. Max's own-account CLI management reads are
verified; no publish was performed. Max and Eric Wu have Admin roles and should
use their own logins. Eric Wu's CLI setup has not been checked here. Do not share
Eric Chen's login/token.

## Gotchas (each cost a failed publish or a production-only bug)

- **Maincloud refuses to add or remove a schedule on an existing table.** Do new background work inline, or in a brand-new table. Ask Eric Chen before adding tables or scheduled jobs.
- **Randomness is seeded from the transaction timestamp,** so two transactions can draw the same "random" id. Use `newId(ctx, prefix, taken)` from `server/src/lib/util.ts`.
- **The module entry (`server/src/index.ts`) may only export SpacetimeDB exports;** route paths must be lowercase.
- **Free tunnel URLs die when the laptop sleeps.** Planning falls back to synthetic module plans with a warning; the smoke test's "plan came from the api" check catches it. A failed HTTP request to a configured voice URL instead records a failed/error booking; voice fakes are used only when `VOICE_BASE_URL` is unset.
- **Pull before you commit.** Several people edit `docs/` and `server/`.
