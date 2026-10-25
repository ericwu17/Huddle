# Honesty list

Everything cached, seeded, simulated, scripted, estimated or incomplete. Say the
first section out loud in the pitch and put this list on Devpost. Updated
October 24, 2026 for the coordinator flow (accounts → invites → private needs →
Claude plans → vote → booking simulation).

## Say these out loud

1. **Booking is a simulation.** No restaurant is called, messaged or reserved.
   The "Booking simulation" screen shows scripted confirmation events.
2. **Voice calls are not implemented.** The `voice/` service only plays scripted
   events. It refuses to start in real-call mode, and the coordinator flow never
   calls it. No phone call has been placed by this code, so no real call
   recording exists.
3. **Friends in a one-phone demo are simulated.** Sam, Jordan and Riley come from
   `scripts/demo-friends.mjs`. They are scripted participants with seeded text,
   not real people and not autonomous agents.
4. **Venue data is a one-time snapshot** from October 24, not live availability,
   prices or opening status.

## Current coordinator flow

| Item | Where | Status |
| --- | --- | --- |
| Booking is a module simulation for every coordinator huddle. It never calls the voice service. A "full"/"closed" re-plan only happens if an operator changes the module's `STUB_SCENARIO` setting | `server/src/booking.ts`, `web/src/routes/Call.tsx` | in use; labeled "Booking simulation" and "No phone call or real reservation is made" |
| Voice service is a scripted stub (confirm/full scenarios). `STUB_MODE=false` raises "real calls are not implemented yet". No Twilio, text-to-speech or speech-to-text is wired in. Used only by legacy groups | `voice/main.py`, `voice/stub.py` | not implemented beyond the stub |
| One-phone demo friends join by code, submit seeded needs ("no sushi", "nothing over $20, outdoors", "romantic, price no object"), confirm them and vote for the coordinator's recommendation. The human host still starts planning and booking | `scripts/demo-friends.mjs`, `data/demo_group.json` | available; say so whenever it is used |
| Automated checks use synthetic accounts and people, real Claude, and simulated booking. No SMS, email, calendar events or calls are created | `scripts/accounts-flow-smoke.mjs`, `scripts/agent-smoke.mjs`, `docs/MENU_RECOMMENDATIONS.md` | verified; not a test with real participants |
| One Claude coordinator reads every member's saved needs and prompt, then chooses from itineraries the code has already checked. Candidates are bounded (up to 120); no global optimum is claimed | `api/agent.py`, `api/menu_planner.py`, `server/src/agent.ts` | in use. Claude does not construct or revise plans itself |
| Code enforces each person's whole-outing budget across all stops, confirmed dietary needs, opening hours, venue facts, and stale votes/bookings after inputs change | `server/src/lib/budgets.ts`, `server/src/lib/agent-constraints.ts`, `api/agent.py` | in use |
| Public explanations are catalog fact sentences chosen by Claude, not free text, so private prompts and budgets do not leak into shared text | `api/agent.py` | in use; explanations are intentionally limited |
| Dietary tags are either `explicit_menu` (on the venue's menu) or `inferred`. No tag means allergen or cross-contact safety | `data/brightdata/details.json`, `api/menu_context.py` | in use. An option without evidence for a stated allergy is **provisional**: it can be voted on but cannot be booked |
| Personal totals use listed menu prices where found. Otherwise costs are catalog estimates: meals from the Google price level or a $25 default, desserts a flat $9, activities $0–$25 by category words. An estimate cannot prove a plan fits a budget | `data/reviews/collect.py`, `api/menu_context.py`, `web/src/components/PrivateOrderSummary.tsx` | in use; estimated plans stay provisional |
| Catalog: 130 Berkeley venues (the original 45 plus 85 new) from a Bright Data Google Maps scrape of 936 places on 2026-10-24. Yelp discovery returned no records, so all scraped data is from Google Maps. Ratings carry their source and fetch date | `data/brightdata/catalog.json`, [BRIGHTDATA.md](BRIGHTDATA.md) | active on shared Maincloud. Refresh is manual; no scheduled scrape |
| Menus were read from venue websites by Claude, and each item was checked verbatim against the page. Photos come from Google Places with attribution | `data/reviews/source_menus.py`, `data/reviews/details.py` | menus, prices and photos are used by the planner and UI. Takeout and seating are collected but **not yet used** |
| Members can choose 1–5 stops, but plans have at most 3; 4 or 5 asks for the longest outing available | `web/src/components/PreferenceFields.tsx`, `api/agent.py` | intentional UI-only extension; the UI says so |
| Planner travel times are straight-line estimates (×1.3 detour, fixed walking/driving speeds). Map route lines come from the public OSRM foot router, with straight segments when it fails | `api/catalog.py`, `web/src/walkRoute.ts` | in use; map lines are not used for timing |
| Tie-break **Spin** is an equal-chance random pick among tied options | `server/src/plans.ts` | in use |
| Invitations are in-app inbox messages. The opt-in Mac Messages sender runs only on the host Mac; one real attempt showed "Not Delivered". Texting and Mac Contacts are disabled on the shared deployment. No SMS, email or push service | `api/connectors.py`, [CONNECTORS_CONTRACT.md](CONNECTORS_CONTRACT.md) | in-app invitations in use; external delivery unverified |
| Google Calendar connection, free/busy lookup and meetup event creation are implemented. Max reports the connection works; group free/busy and event creation have only mocked tests | `api/connectors.py`, `web/src/components/MeetupCalendarAction.tsx` | not verified with a real account |
| Accounts use username/password (FastAPI Users, Argon2). No password reset or account recovery. Services trust one shared secret header | `api/accounts.py`, `server/src/http.ts`, [ACCOUNTS_CONTRACT.md](ACCOUNTS_CONTRACT.md) | hackathon-grade |
| The shared API runs on a teammate's laptop behind a Cloudflare quick tunnel; a restart can change its URL. A Render setup exists but is not deployed | `scripts/tunnels.sh`, `scripts/host-api.ps1`, [HOSTED_API.md](HOSTED_API.md) | in use; the host laptop must stay awake and online |
| New coordinator huddles have no cached or fake fallback. If Claude or the API fails, the UI shows a retryable error | `server/src/agent.ts` | deliberate |
| Earlier tunnel-free single-laptop design | [SINGLE_LAPTOP_PLAN.md](SINGLE_LAPTOP_PLAN.md) | blocked: SpacetimeDB 2.13.0 rejected procedure HTTP to loopback in an isolated test |

## Legacy flow (older groups only)

These apply only to groups created before the coordinator flow. They do not
describe, or provide evidence for, the current product.

| Item | Where | Status |
| --- | --- | --- |
| Mathematical solver on placeholder place aspects (every place 0.5 for noise, romance, novelty…), so "quiet" or "romantic" did not change plans | `api/solver.py`, `data/places.json` | legacy only; uses the original 45 places |
| Robustness, ratios and confidence are Monte Carlo model outputs, not measured satisfaction | `api/solver.py`, `api/elicit.py` | legacy only |
| Advocate/chair council with validated numbers and a Safe fallback | `api/council.py` | legacy only; the new flow has one coordinator |
| Keyword parser fallback when Claude fails | `api/parse.py` | legacy only; shows a warning |
| Labeled demo mode with nine fictional venues when the API or voice service is unreachable | `server/src/lib/demo.ts`, `server/src/lib/fakes.ts`, `api/fixtures/places.fake.json` | legacy only; the API refuses fictional venues |
| Cached plan run and pre-warmed scout results | `data/cached_run.json`, `data/scout_cache.json` | placeholders; live scout was never built |
| Evaluation numbers come from synthetic groups/tastes with cumulative budgets enforced. Earlier per-stop-budget results are withdrawn. Baselines know true tastes; the solver comparison was never run | `docs/experiments/` | do not present as a measurement of Huddle |

## Verification status

- Local checks on `745482f` (October 24): 112 API, 172 server (1 opt-in skip),
  6 voice and 22 data tests pass; the frontend builds and lints.
- The last recorded check of the shared deployment was at `4e4d884`: 49 connected
  menu-flow checks, 15 OAuth wiring checks and 30 desktop/mobile browser
  assertions. Later UI and stop-count commits have not been rechecked on the
  shared deployment.
- Not yet done: two physical phones, an API/tunnel restart rehearsal, real Google
  free/busy/event writes and a confirmed Messages receipt.

Detailed records: [MENU_RECOMMENDATIONS.md](MENU_RECOMMENDATIONS.md),
[ACCOUNTS_RUNBOOK.md](ACCOUNTS_RUNBOOK.md), [AGENT_VERIFICATION.md](AGENT_VERIFICATION.md)
and [MAINCLOUD_VERIFICATION.md](MAINCLOUD_VERIFICATION.md) (legacy).
