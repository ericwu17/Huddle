# Huddle roadmap

> Primary owner: Eric Chen; Max covers backend/evaluation while Eric Chen works on UI and Eric Wu works in `api/`. Updated through live voice checks, corrected experiments and backend stale-choice guards. Current operating state: [HANDOFF.md](HANDOFF.md). Check things off only when the stated check has passed.
>
> **H0 = Fri 6:00 PM** (the brief assumed 9 PM, so every gate is 3 hours earlier than `huddle.md` says).
> Legend: `[x]` done and in the repo · `[~]` in progress or rough draft · `[ ]` not started · `?` unknown (owner: please update)

## Gates

| Gate | When | What must be true | Status |
| --- | --- | --- | --- |
| H2 stubs | **Fri 8 PM** | Every endpoint exists with contract-shaped fakes; smoke test passes on fakes | `[x]` API and voice stubs connected through Maincloud; live synthetic confirm/full smoke tests pass; frontend flow previously reported passing |
| H8 hand-off | **Sat 2 AM** | places.json v1; Eric Chen's hand-off note | `[~]` places.json done; hand-off note drafted (`docs/HANDOFF.md`), final update before Eric Chen sleeps |
| L1 (H13) | **Sat 7 AM** | 4 phones join by QR, text parses, plan on a map with cost and timing, voting works; stubs-to-real flip done | `[ ]` |
| L2 (H19) | **Sat 1 PM** | Swipes with confidence, 3 named plans with robustness, places.json v2, Mapbox leg times, one eval chart. Decide: council, Fetch.ai, live voice vs recording | `[ ]` |
| L3 (H24) + freeze | **Sat 6 PM** | Offers, scout badge, council streaming, polished screens, voice S1-S3 (or fallback), re-plan loop works once, demo path written | `[ ]` |
| Submit | **Sun 7:30 AM** (hard 9 AM, checked in by 8 AM) | Devpost complete (T7 checklist) | `[ ]` |

**Live backend:** SpacetimeDB Maincloud, `https://maincloud.spacetimedb.com`, database `huddle-calhacks`. Shared secret is passed privately only. Connected to Max's FastAPI stubs (`STUB_MODE=true`) and Eric Wu's separate voice stub; synthetic confirm/full callbacks passed. Voice is restored to `confirm`; current URLs are in [HANDOFF.md](HANDOFF.md).

**Sleep/away times need re-checking against the 6 PM start.** If Eric Chen's away window is fixed in clock time (Sat 6 AM to noon), it is now H12 to H18, not H9 to H15.

## Current coverage and access

- Eric Chen is working on UI; Max covers backend code and integration in this Codex session. Eric Wu is working in `api/`; coordinate before touching that folder. Primary ownership and shared contracts remain unchanged.
- Max Li and Eric Wu are confirmed Admin collaborators on `huddle-calhacks`. Max's CLI 2.13.0 is logged into his own account. An environment-only publish set `VOICE_BASE_URL`; management reads verified API URL/stub mode stayed unchanged. No module/schema was deployed; Eric Wu's CLI setup has not been checked here.
- Eric Wu's voice stub is connected. Six unit tests passed locally; live confirm and voice-originated full-to-re-plan checks passed, with no duplicate replay or automatic replacement call. Service restored to confirm; no real phone calls.
- No Bright Data account/key is available. Haydn owns the account/review pipeline and Mapbox token/routing. Eric Chen's booth visit/key acquisition was temporary coverage; confirm a human owner for the booth task before he leaves. Max's private root `.env` has a blank `BRIGHTDATA_API_KEY` entry only.
- Max's first phase is complete: eight authenticated API routes, deterministic disclosed fixtures, cumulative budget guards, a live tunnel, and local integration checks. The real solver/learning/LLM/council phases have not started here.
- Current work split: Eric Wu is working in `api/`; Max is fixing evaluation and preparing the demo/submission checklist. The next solver comparison waits for Eric to confirm readiness.

## Shared

- [x] Plan docs (`build-brief.md`, `huddle.md`) updated for SpacetimeDB
- [x] Repo layout, `.gitignore`, `.env.example`
- [x] Contract `docs/CONTRACT.md` (S5.5 rewritten for SpacetimeDB)
- [x] End-to-end smoke test `scripts/smoke.mjs` passes on Maincloud with connected API/voice stubs, both confirm and voice-originated full scenarios (offers intentionally skip)
- [ ] Booth answers posted (Meta, Cartesia, Bright Data, Microsoft, Fetch.ai, SpacetimeDB)

## A. Haydn: data, routing, glue

> **Haydn is out until Saturday. Eric Chen covered smoke testing and re-plan.** With Eric leaving, Bright Data and geo remain pending for Haydn; they have not been silently reassigned to Max. Haydn: read this section and HANDOFF.md when you arrive.


- [ ] Bright Data account/key (confirmed unavailable); Mapbox token still unconfirmed
- [x] `scripts/smoke.mjs`: 27 checks incl. re-plan; passes on Maincloud and local (Eric Chen)
- [~] Bare-bones UI: drafted by Eric Wu in `web/` (Vite + React, all screens routed, live on the SpacetimeDB views). Haydn: review and take over or confirm ownership
- [ ] Bright Data review pull + `docs/BRIGHTDATA.md` (Eric Chen needs this for the live scout)
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
- [ ] Live scout via Bright Data (needs `docs/BRIGHTDATA.md`)
- [x] Council panel `web/src/components/council/` (functional pass; replays synthetic messages, not a live LLM council; restyle at H19)
- [x] Privacy fix: names hidden in plan text and offers unless showWhoCompromised
- [x] Raw HTTP error bodies/exception details removed from public fallback warnings; tested alongside cumulative budgets during service failures. Module publish still pending.
- [x] Stale votes/roulette/bookings blocked after budget or run changes; queued-call and late-callback checks added, historical rows retained. 28 native tests pass; live deployment and UI verification still pending. `api/` untouched.
- [~] Experiment harness `docs/experiments/`: cumulative budgets and returned-plan validation fixed; corrected five-baseline run/chart regenerated with zero selected-plan budget violations. Earlier numbers withdrawn. "Ours" and swipe learning wait for Eric Wu's real API; placeholder features still limit pitch claims.
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
- [x] /parse-prefs with keyword fallback (Eric Wu; `STUB_MODE=false`)
- [x] L1 solver: filter, normalization, enumeration, robustness + Nash tie-break, three plans (Eric Wu). Bold/Budget floor is relative when Safe is below 0.5; see [api/README.md](../api/README.md)
- [x] Posterior update, active selection, Monte Carlo robustness, Pareto, posteriorSummary
- [x] /offers, /roulette
- [x] /council: advocates, chair, validator, optional POST to `/route/council-message` (`SPACETIMEDB_URI`/`SPACETIMEDB_DB`)
- [~] eval: determinism and behavior tests in `api/eval/test_real.py`; latency measured ad hoc (demo `/plan` ~70-80 ms, council 6-12 s), no p50/p95 script yet
- [ ] Switch Maincloud to the real API (module and API `STUB_MODE=false` together)

## D. Eric Wu: voice

- [x] Claude API key shared with Max and saved privately; unused by the current stubs
- ? Twilio upgraded + number, Cartesia account, tunnel tool, demo phone verified
- [x] `POST /book` stub in `voice/`, confirm + full scenarios, six local unit tests pass; no real calls
- [x] Voice tunnel URL supplied/configured; live confirm and service-backed "full" re-plan passed with Max, then restored confirm
- [ ] Bug: app jumps to Vote ~400 ms after the council finishes and Plans bounces back to Vote, so the debate is never seen
- [ ] `web/.env.local` pointing at Maincloud (see HANDOFF.md)
- [ ] Voice spike: one Mandarin call end to end; GO / NO-GO
- [ ] State machine, tools, event posting; scenarios S1, S2
- [ ] S3 ("we're full") + re-plan loop with Eric Chen
- [~] Call screen `web/src/components/call/CallScreen.tsx` (draft exists)
- [x] Frontend draft for the whole app in `web/` (bonus; see A)
- [ ] Recorded fallback call (labeled)
