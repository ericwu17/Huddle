# Honesty list

Everything cached, seeded, simulated, scripted, or hardcoded. Say these out loud in the pitch and put them on Devpost.

| Item | Where | Status |
| --- | --- | --- |
| One coordinator uses all current confirmed member prompts and chooses from code-validated catalog itineraries | `api/agent.py`, `server/src/agent.ts`, `docs/AGENT_VERIFICATION.md` | implemented for new huddles; real-Claude connected and two-user browser checks pass; old mathematical evaluation does not validate this method |
| Public coordinator explanations are catalog fact sentences selected by Claude, not unrestricted agent prose | `api/agent.py` | prevents raw private prompt/cap disclosure; explanations are intentionally limited to known facts |
| Candidate context is bounded to 120 feasible itineraries; no mathematical global optimum is claimed | `api/agent.py` | cheapest subset plus deterministic diversity sample; Claude chooses alternatives |
| Allergy evidence is missing; confirmed allergies block planning instead of claiming safety | `api/agent.py`, `server/src/agent.ts` | deliberate limitation; dietary tags are not cross-contact certification |
| Agent booking is always a module simulation, including full-to-replan callbacks | `server/src/booking.ts` | visible labels; no restaurant called; new vote and host action required after replacements |
| Local FastAPI behind a public tunnel remains the shared API | `docs/CURRENT_CONTEXT.md`, `scripts/host-api.ps1`, `scripts/tunnels.sh` | chosen for this phase; the designated laptop must remain awake and connected; restart can change the tunnel URL |
| Persistent hosted API replacing the laptop/tunnel | `render.yaml`, `docs/HOSTED_API.md` | deferred alternative; configuration and Linux dependency checks passed, but no Render service or Maincloud cutover occurred |
| Earlier tunnel-free single-laptop design | `docs/SINGLE_LAPTOP_PLAN.md` | blocked as written: isolated SpacetimeDB 2.13.0 procedure-to-loopback HTTP test was rejected; not a working local full-stack demo |
| Place dataset is a cached snapshot (45 Berkeley places from Google Places, pulled once) | `data/places.json` | in use on Maincloud with `STUB_MODE=false` |
| Nine fictional venues for the module's fakes; the API refuses them. Legacy and real catalogs remain lookup-compatible | `api/fixtures/places.fake.json` | in use by the module with its `STUB_MODE=true` (default) or in demo mode |
| Integration checks use real module procedures and the native in-memory test datastore calling a localhost FastAPI without a Claude key (keyword parsing, Safe-fallback council), not a deployed database or browser subscriptions | `api/eval/check_integration.py`, `server/test/` | verified locally |
| Demo group (Alex, Sam, Jordan, Riley) is seeded | `data/demo_group.json` | in use |
| One-phone demo friends are simulated identities with seeded preferences. In agent mode they review/confirm seeded needs and vote for the recommendation; in legacy mode they swipe by fixed tastes, answer offers and vote. They are not autonomous participant agents | `scripts/demo-friends.mjs` | available; say so when used; host still starts planning and booking |
| Legacy groups can enter labeled demo mode with module fakes. New agent groups instead show retryable errors when Claude/API fails | `server/src/lib/fakes.ts`, `server/src/lib/demo.ts`, `server/src/agent.ts` | no synthetic coordinator fallback; scout remains cached and voice scripted |
| Cached plan run used when the api is unreachable | `data/cached_run.json` | placeholder (fake until H24) |
| Scout results may come from a pre-warmed cache ("Checked earlier") | `data/scout_cache.json` | placeholder (fake until H24) |
| The restaurant on the call is a teammate | demo | planned |
| The "we're full" reply in the re-plan demo is scripted | demo | planned |
| Any recorded fallback call is a real earlier call, labeled | demo | planned |
| Evaluation numbers come from synthetic groups/tastes with cumulative budgets enforced. Earlier per-stop-budget results are withdrawn. Baselines know true tastes; optional "ours" also receives a truth-centered posterior, so it is not a learning evaluation. Flat aspect features make the below-50% metric uninformative. | `docs/experiments/` | corrected baselines only; real API comparison is opt-in, rejects stubs and invalid plans, and reports failure coverage; ours/swipe experiment still pending |
| Bright Data scraping and catalog/evidence refresh | `docs/NEXT_TASKS.md` | active next work; no scraper or live integration implemented yet; access/source requirements still need verification |
| Legacy council messages use advocates/chair with validated numbers and a Safe fallback; the new flow uses one coordinator and catalog fact explanations | `api/council.py`, `api/agent.py` | legacy groups only use the old council; no seven-agent debate in new flow |
| The real solver runs on placeholder place aspects (every place 0.5 for noise, romance, novelty, ...), so tastes like "quiet" or "romantic" do not change plans yet; plans differ by cuisine, cost, dietary tags, hours and distance. Every plan response says so | `data/places.json`, `api/solver.py` | in use on Maincloud until review data lands |
| Legacy robustness, ratios and confidence are Monte Carlo model outputs, not measured satisfaction | `api/solver.py`, `api/elicit.py` | retained for legacy groups; absent from new coordinator results/UI |
| Travel times are straight-line estimates (x1.3 detour, fixed walking/driving speeds), not routed ETAs | `api/catalog.py` | in use |
| When Claude is unavailable or returns invalid output, preferences are parsed by keyword rules; the member sees a warning | `api/parse.py` | in use on Maincloud (fallback path) |
| Auth is hackathon-grade: each phone is whoever holds its SpacetimeDB token (kept in local storage); services share one secret header | `server/src/http.ts` | in use |
| Demo mode: if the api or voice service is unreachable (or the host turns demo mode on), the group switches to labeled synthetic data and a scripted call; plans carry a `fallback:` warning and the UI shows "Demo mode: cached data" | `server/src/lib/demo.ts` | in use |
| Maincloud smoke uses four generated identities and synthetic preference text, not four people on physical phones. Confirmation callbacks are scripted; the new deployment's full callback was injected into an active test booking | `scripts/smoke.mjs`, `docs/MAINCLOUD_VERIFICATION.md` | verified; not a real restaurant call or browser rehearsal |
