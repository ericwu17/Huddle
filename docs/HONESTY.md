# Honesty list

Everything cached, seeded, simulated, scripted, or hardcoded. Say these out loud in the pitch and put them on Devpost.

| Item | Where | Status |
| --- | --- | --- |
| Account foundation uses username/password checks through FastAPI Users/Argon2 and private Maincloud device bindings | `docs/ACCOUNTS_CONTRACT.md`, `docs/ACCOUNTS_RUNBOOK.md` | Branch-only isolated review, not shared/Vercel release; no password reset, contacts, invitations or personal memory; legacy guests remain during migration |
| One coordinator uses all current confirmed member prompts and chooses from code-validated catalog itineraries | `api/agent.py`, `server/src/agent.ts`, `docs/AGENT_VERIFICATION.md` | implemented for new huddles; real-Claude connected and two-user browser checks pass; old mathematical evaluation does not validate this method |
| Public coordinator explanations are catalog fact sentences selected by Claude, not unrestricted agent prose | `api/agent.py` | prevents raw private prompt/cap disclosure; explanations are intentionally limited to known facts |
| Candidate context is bounded to 120 feasible itineraries; no mathematical global optimum is claimed | `api/agent.py` | cheapest subset plus deterministic diversity sample; Claude chooses alternatives |
| Allergy evidence is missing; confirmed allergies block planning instead of claiming safety | `api/agent.py`, `server/src/agent.ts` | deliberate limitation; dietary tags are not cross-contact certification |
| Agent booking is always a module simulation, including full-to-replan callbacks | `server/src/booking.ts` | visible labels; no restaurant called; new vote and host action required after replacements |
| Local FastAPI behind a public tunnel remains the shared API | `docs/CURRENT_CONTEXT.md`, `scripts/host-api.ps1`, `scripts/tunnels.sh` | chosen for this phase; the designated laptop must remain awake and connected; restart can change the tunnel URL |
| Persistent hosted API replacing the laptop/tunnel | `render.yaml`, `docs/HOSTED_API.md` | deferred alternative; configuration and Linux dependency checks passed, but no Render service or Maincloud cutover occurred |
| Earlier tunnel-free single-laptop design | `docs/SINGLE_LAPTOP_PLAN.md` | blocked as written: isolated SpacetimeDB 2.13.0 procedure-to-loopback HTTP test was rejected; not a working local full-stack demo |
| Place dataset is a cached snapshot (45 Berkeley places from Google Places, pulled once) | `data/places.json` | in use on Maincloud with `STUB_MODE=false` until the live catalog is published |
| Live catalog of 130 venues (the 45 plus 85 new) from a one-time Bright Data Google Maps scrape of 936 Berkeley places on 2026-10-24. Ratings carry source and fetch date; new restaurants' prices come from Google Places price levels mapped to estimates; aspects are defaults | `data/brightdata/catalog.json`, `docs/BRIGHTDATA.md` | activated in isolated Maincloud `huddle-account-max-check`; shared `huddle-calhacks` activation pending. A snapshot, not live availability |
| Venue details: menus from venue websites read by Claude (each item verified verbatim against the page), takeout/seating/photos from Google Places, dietary tags marked `explicit_menu` or `inferred`; unknowns stay null | `data/brightdata/details.json` | collected for 130 venues; not yet read by the module, API or UI. No tag establishes allergen or cross-contact safety |
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
| Bright Data refresh is manual: discovery ran once; Yelp discovery returned no records, so all scraped data is from Google Maps | `data/reviews/collect.py`, `docs/BRIGHTDATA.md` | implemented; no scheduled refresh |
| Legacy council messages use advocates/chair with validated numbers and a Safe fallback; the new flow uses one coordinator and catalog fact explanations | `api/council.py`, `api/agent.py` | legacy groups only use the old council; no seven-agent debate in new flow |
| The real solver runs on placeholder place aspects (every place 0.5 for noise, romance, novelty, ...), so tastes like "quiet" or "romantic" do not change plans yet; plans differ by cuisine, cost, dietary tags, hours and distance. Every plan response says so | `data/places.json`, `api/solver.py` | in use on Maincloud until review data lands |
| Legacy robustness, ratios and confidence are Monte Carlo model outputs, not measured satisfaction | `api/solver.py`, `api/elicit.py` | retained for legacy groups; absent from new coordinator results/UI |
| Travel times are straight-line estimates (x1.3 detour, fixed walking/driving speeds), not routed ETAs | `api/catalog.py` | in use |
| When Claude is unavailable or returns invalid output, preferences are parsed by keyword rules; the member sees a warning | `api/parse.py` | in use on Maincloud (fallback path) |
| Auth is hackathon-grade: each phone is whoever holds its SpacetimeDB token (kept in local storage); services share one secret header | `server/src/http.ts` | in use |
| Demo mode: if the api or voice service is unreachable (or the host turns demo mode on), the group switches to labeled synthetic data and a scripted call; plans carry a `fallback:` warning and the UI shows "Demo mode: cached data" | `server/src/lib/demo.ts` | in use |
| Maincloud smoke uses four generated identities and synthetic preference text, not four people on physical phones. Confirmation callbacks are scripted; the new deployment's full callback was injected into an active test booking | `scripts/smoke.mjs`, `docs/MAINCLOUD_VERIFICATION.md` | verified; not a real restaurant call or browser rehearsal |

### October 24 account/preference branch preview

- Accounts, memberships, reciprocal friends, addressed in-app invitation links
  and explicitly saved private defaults work on isolated `huddle-account-max-check`.
  No QR UI remains. A later branch expansion adds opt-in host-Mac Messages
  submission; actual OS delivery remains unverified, and no SMS/email/push
  service is integrated.
- Save & ready supports optional prompts and nullable budget/duration controls.
  Known allergies are saved without redundant input confirmation; missing venue
  evidence still prevents validated food recommendations.
- Verified: 84 Python tests, 109 server tests (1 opt-in skipped), 41 connected
  social/planning/booking checks, 28 desktop/mobile browser assertions and five
  real API preference/example scenarios. Booking and all test people are synthetic.
- Cached ratings/counts appear on place cards and in Claude context. Photos,
  specific menu evidence, takeout/shared seating and inferred personal memory
  remain absent; the exact vegan/steak/dessert case is evidence-blocked today.
- Shared Maincloud/Vercel were not changed. See [review runbook](ACCOUNTS_RUNBOOK.md).

- Connector expansion: Google configuration and the Mac Messages readiness probe
  pass. Fourteen connected OAuth wiring checks pass using denied consent, without
  Google authorization. Actual Google free/busy/event creation and a real Messages
  send remain unverified. External-write unit tests use mocked providers. The
  separate 24-check saved-context browser regression also passes.

- Short-outing fix: the reported matching $40/90-minute food request was blocked
  by a two-stop minimum. The coordinator now supports one meal; a real-Claude
  replay returned three Asian-food options, each 75 minutes and $12–$25 in cached
  estimates. Unsupported allergies/diets and shorter limits still block.
- Mac Contacts search returned two matching Eric records on the real host. Only
  selected private friend-address links are retained; this is not continuous
  address-book sync. Actual message receipt remains unconfirmed. Max reports
  Calendar connection now works; group free/busy and meetup writes are separate.

- Final short-outing/Contacts checkpoint: 94 Python tests and 124 native server
  tests passed (one opt-in HTTP test skipped); frontend build/lint passed. The
  41-check connected smoke and a new 30-assertion two-account browser flow passed
  using matching $40/90-minute Asian-food preferences, real Claude, a one-meal
  plan and simulated booking. No page/console errors, mobile overflow or real
  external sends occurred in that automated flow.

- Main sync/release checkpoint: main `156697c` was fast-forwarded and account/
  connector conflicts resolved without changing Eric Wu's scraping/data files.
  The preview now has 130 active venues. All 99 Python and 129 server tests pass
  (one opt-in HTTP skip), frontend build/lint pass, and the 41-check connected
  account journey passes with the scraped catalog and real Claude. Cards and
  Claude context consume catalog source observations; menu/photo/takeout/seating
  details still have no runtime read path. Main push is authorized; shared
  backend publication is separate. No mathematical quality claim is made.
- Real Messages participant check: a user-triggered invite reached Mac Messages,
  which shows Not Delivered. Max also reports ordinary sending and history sync
  fail. This confirms OS submission, not recipient receipt. Calendar connection
  works by Max's report; actual group availability/event writes remain unverified.

- Catalog browser rerun: 30 desktop/mobile assertions passed with real Claude
  after resolving a rating/count/source-date mismatch. No page/console errors,
  console warnings or mobile overflow. Synthetic users completed invitations,
  source-dated cards, voting, simulated booking and refresh; no provider writes.
