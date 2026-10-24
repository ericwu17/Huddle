# Hand-off (Eric Chen, Part B + covering Part A)

> Written Fri 8:20 PM (H2.3). H0 = Fri 6 PM. Read with [ROADMAP.md](ROADMAP.md) and [CONTRACT.md](CONTRACT.md).

## Where things stand

- **Backend is live:** SpacetimeDB Maincloud, `https://maincloud.spacetimedb.com`, database `huddle-calhacks` (dashboard: https://spacetimedb.com/huddle-calhacks, Eric Chen's login).
- **Connected to Max's FastAPI stubs** via `FASTAPI_BASE_URL=https://conferencing-navigate-deleted-feedback.trycloudflare.com`, `STUB_MODE=true`. Every plan, parse and council message comes from his service and is labeled SYNTHETIC STUB.
- **Voice stub is built** (`voice/`, see its README) but not wired yet: until `VOICE_BASE_URL` is set, calls use the module's fake event sequence.
- **Smoke test passes on Maincloud** (`node scripts/smoke.mjs`, 27 checks; offers skip because the stubs return none on purpose).
- **Frontend works end to end** against Maincloud: lobby, private prefs, swipes, plans, council recommendation, vote.

| Piece | Real or fake right now |
| --- | --- |
| Places | Max's synthetic fixture while `STUB_MODE=true`; real 45 Berkeley places in `data/places.json` for later |
| Parse, swipes, plans, council | Max's stubs (canned) |
| Offers | none (stub returns none, never faked) |
| Scout badge | cached file, labeled "Checked earlier" |
| Phone call | module fake (confirm scenario) |
| Re-plan on "full" | real logic, tested |

## Async tasks (no Claude needed)

### Eric Chen
- [ ] Commit + push `scripts/smoke.mjs` and these docs.
- [ ] Bright Data booth: prize, which product for Google Maps reviews, rate limits, what counts as "using" them. Post answers. Get `BRIGHTDATA_API_KEY` into `.env`.
- [ ] Optional: free Mapbox token into `.env` as `MAPBOX_TOKEN` (for walking routes).
- [ ] DM the shared secret to Eric Wu if not done. Never post it in a channel.
- [ ] Re-check your Saturday away window against the 6 PM start (6 AM-noon is H12-H18).
- [ ] Devpost: create the project, add all four teammates, pick tracks (Meta, Cartesia, Bright Data, SpacetimeDB if it has a prize).
- [ ] Before sleeping: update this file's "Where things stand" if anything changed.

### Max
- [ ] Keep the FastAPI server + Cloudflare tunnel running. If the URL changes, send the new one (see "Operating" below).
- [ ] Real `/parse-prefs`, then the L1 solver (filter, normalize, enumerate, maximin). The dietary rule must apply to meals and desserts only (his commit 88a6746 already does this).
- [ ] Note: only ~7 real activities are open after 7:30 PM Saturday; places carry an extra `googlePlaceId` field.
- [ ] Ask Eric Chen before editing `server/` (cross-folder edits go through the owner).
- [ ] Review `docs/experiments/README.md` method before any number goes on a slide.

### Eric Wu
- [ ] **`/book` voice stub + tunnel URL** (the last missing H2 piece). It should POST events to `https://maincloud.spacetimedb.com/v1/database/huddle-calhacks/route/call-event` with `X-Huddle-Secret`.
- [ ] **Bug:** the app jumps to Vote ~400 ms after the council finishes, and Plans cannot be reopened (bounces to Vote), so nobody sees the debate. Show the council panel on Vote, or delay the jump and allow going back.
- [ ] Add `web/.env.local`: `NEXT_PUBLIC_SPACETIMEDB_URI=https://maincloud.spacetimedb.com`, `NEXT_PUBLIC_SPACETIMEDB_DB=huddle-calhacks`.
- [ ] Share the Claude API key with Max by DM.
- [ ] Voice spike: one Mandarin call end to end; GO / NO-GO.

### Haydn (out until Saturday)
- [ ] Read ROADMAP Part A first: Eric Chen covered `scripts/smoke.mjs` and `server/src/replan.ts`.
- [ ] Agree with Eric Wu who owns `web/` from here.
- [ ] Bright Data review pull + `docs/BRIGHTDATA.md`, unless Eric Chen has started it (check the roadmap).

## Queued for Claude (next session)

1. **Bright Data:** review pull for `data/places.base.json` (each place has `googlePlaceId`), `docs/BRIGHTDATA.md`, then the live scout check in `server/src/council.ts` (`runScoutJob`). Needs `BRIGHTDATA_API_KEY`.
2. **Wire Eric Wu's voice URL:** env-only publish with `VOICE_BASE_URL`, then a real "full" call to test the re-plan.
3. **Demo-mode fallbacks:** fill `data/cached_run.json` from a real run; auto demo mode when `/health` fails.
4. **`server/src/geo.ts`:** Mapbox route geometry + leg times with `geo_cache`. Needs `MAPBOX_TOKEN`. Fallback is straight lines.
5. **Rerun experiments** after places.json v2 and Max's real `/plan` (`python docs/experiments/sim.py`).

## Operating

All commands from the repo root. The shared secret lives only in `.env`.

```bash
# Publish module changes to Maincloud (keeps every env value you do not pass)
HUDDLE_SHARED_SECRET="$(grep '^HUDDLE_SHARED_SECRET=' .env | cut -d= -f2-)" spacetime publish huddle-calhacks -p server -s maincloud -y

# Change only env values (e.g. Max's new tunnel URL), no rebuild
FASTAPI_BASE_URL=https://NEW-URL.trycloudflare.com spacetime publish huddle-calhacks -s maincloud --env-only

# Smoke test against Maincloud (creates one throwaway group)
SPACETIMEDB_URI=https://maincloud.spacetimedb.com SPACETIMEDB_DB=huddle-calhacks node scripts/smoke.mjs

# Frontend against Maincloud (PowerShell, from web/)
$env:NEXT_PUBLIC_SPACETIMEDB_URI='https://maincloud.spacetimedb.com'; $env:NEXT_PUBLIC_SPACETIMEDB_DB='huddle-calhacks'; npx vite --port 5180
```

`spacetime` is at `%LOCALAPPDATA%\SpacetimeDB\spacetime.exe` on Eric Chen's laptop. Only his login can publish `huddle-calhacks`.

## Gotchas (each cost a failed publish or a production-only bug)

- **Maincloud refuses to add or remove a schedule on an existing table.** Do new background work inline, or in a brand-new table. Ask Eric Chen before adding tables or scheduled jobs.
- **Randomness is seeded from the transaction timestamp,** so two transactions can draw the same "random" id. Use `newId(ctx, prefix, taken)` from `server/src/lib/util.ts`.
- **The module entry (`server/src/index.ts`) may only export SpacetimeDB exports;** route paths must be lowercase.
- **Free tunnel URLs die when the laptop sleeps.** The module then falls back to fakes silently; the smoke test's "plan came from the api" check catches it.
- **Pull before you commit.** Several people edit `docs/` and `server/`.
