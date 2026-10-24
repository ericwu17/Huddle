# Honesty list

Everything cached, seeded, simulated, scripted, or hardcoded. Say these out loud in the pitch and put them on Devpost.

| Item | Where | Status |
| --- | --- | --- |
| Place dataset is a cached snapshot (45 Berkeley places from Google Places, pulled once) | `data/places.json` | in use on Maincloud with `STUB_MODE=false` |
| Nine fictional venues for the module's fakes; the API refuses them. Legacy and real catalogs remain lookup-compatible | `api/fixtures/places.fake.json` | in use by the module with its `STUB_MODE=true` (default) or in demo mode |
| Integration checks use real module procedures and the native in-memory test datastore calling a localhost FastAPI without a Claude key (keyword parsing, Safe-fallback council), not a deployed database or browser subscriptions | `api/eval/check_integration.py`, `server/test/` | verified locally |
| Demo group (Alex, Sam, Jordan, Riley) is seeded | `data/demo_group.json` | in use |
| In a one-phone demo the other three members are simulated: separate identities that join by code, write the seeded preferences, swipe by a fixed taste rule, answer offers and vote (two with the chair, one for its own favourite). Their inputs still go through the real API | `scripts/demo-friends.mjs` | available; say so when used |
| Module fakes are used when a group enters labeled demo mode; normal Maincloud planning now uses the real API. Scout remains cached and voice scripted | `server/src/lib/fakes.ts`, `server/src/lib/demo.ts` | fallback available; connected real-mode smoke stayed out of demo mode |
| Cached plan run used when the api is unreachable | `data/cached_run.json` | placeholder (fake until H24) |
| Scout results may come from a pre-warmed cache ("Checked earlier") | `data/scout_cache.json` | placeholder (fake until H24) |
| The restaurant on the call is a teammate | demo | planned |
| The "we're full" reply in the re-plan demo is scripted | demo | planned |
| Any recorded fallback call is a real earlier call, labeled | demo | planned |
| Evaluation numbers come from synthetic groups/tastes with cumulative budgets enforced. Earlier per-stop-budget results are withdrawn. Baselines know true tastes; optional "ours" also receives a truth-centered posterior, so it is not a learning evaluation. Flat aspect features make the below-50% metric uninformative. | `docs/experiments/` | corrected baselines only; real API comparison is opt-in, rejects stubs and invalid plans, and reports failure coverage; ours/swipe experiment still pending |
| Review data is scraped via Bright Data (terms checked) | `data/reviews/` | planned |
| Council messages are AI-generated (Claude Haiku advocates, Claude Sonnet chair) under our validator: numbers must come from the speaker's own tool outputs, no names or clock times; invalid advocate messages are dropped, an invalid or late chair falls back to the Safe plan | `api/council.py` | in use on Maincloud |
| The real solver runs on placeholder place aspects (every place 0.5 for noise, romance, novelty, ...), so tastes like "quiet" or "romantic" do not change plans yet; plans differ by cuisine, cost, dietary tags, hours and distance. Every plan response says so | `data/places.json`, `api/solver.py` | in use on Maincloud until review data lands |
| Robustness, ratios and confidence are model outputs: Monte Carlo over each member's estimated taste (a Gaussian learned from their text and swipes), not measured satisfaction | `api/solver.py`, `api/elicit.py` | in use on Maincloud |
| Travel times are straight-line estimates (x1.3 detour, fixed walking/driving speeds), not routed ETAs | `api/catalog.py` | in use |
| When Claude is unavailable or returns invalid output, preferences are parsed by keyword rules; the member sees a warning | `api/parse.py` | in use on Maincloud (fallback path) |
| Auth is hackathon-grade: each phone is whoever holds its SpacetimeDB token (kept in local storage); services share one secret header | `server/src/http.ts` | in use |
| Demo mode: if the api or voice service is unreachable (or the host turns demo mode on), the group switches to labeled synthetic data and a scripted call; plans carry a `fallback:` warning and the UI shows "Demo mode: cached data" | `server/src/lib/demo.ts` | in use |
| Maincloud smoke uses four generated identities and synthetic preference text, not four people on physical phones. Confirmation callbacks are scripted; the new deployment's full callback was injected into an active test booking | `scripts/smoke.mjs`, `docs/MAINCLOUD_VERIFICATION.md` | verified; not a real restaurant call or browser rehearsal |
