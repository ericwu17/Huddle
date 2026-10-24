# Huddle roadmap

> Primary owner: Eric Chen; Max is updating this hand-off and covering backend work while Eric is away. Updated Friday Oct 23 after pulling Eric Wu's voice stub (`7cb6613`). Current operating state: [HANDOFF.md](HANDOFF.md). Check things off only when the stated check has passed.
>
> **H0 = Fri 6:00 PM** (the brief assumed 9 PM, so every gate is 3 hours earlier than `huddle.md` says).
> Legend: `[x]` done and in the repo · `[~]` in progress or rough draft · `[ ]` not started · `?` unknown (owner: please update)

## Gates

| Gate | When | What must be true | Status |
| --- | --- | --- | --- |
| H2 stubs | **Fri 8 PM** | Every endpoint exists with contract-shaped fakes; smoke test passes on fakes | `[~]` backend, UI, smoke test, Max's api stubs (connected on Maincloud) yes; voice `/book` stub built and tunneled, waiting on `VOICE_BASE_URL` publish |
| H8 hand-off | **Sat 2 AM** | places.json v1; Eric Chen's hand-off note | `[~]` places.json done; hand-off note drafted (`docs/HANDOFF.md`), final update before Eric Chen sleeps |
| L1 (H13) | **Sat 7 AM** | 4 phones join by QR, text parses, plan on a map with cost and timing, voting works; stubs-to-real flip done | `[ ]` |
| L2 (H19) | **Sat 1 PM** | Swipes with confidence, 3 named plans with robustness, places.json v2, Mapbox leg times, one eval chart. Decide: council, Fetch.ai, live voice vs recording | `[ ]` |
| L3 (H24) + freeze | **Sat 6 PM** | Offers, scout badge, council streaming, polished screens, voice S1-S3 (or fallback), re-plan loop works once, demo path written | `[ ]` |
| Submit | **Sun 7:30 AM** (hard 9 AM, checked in by 8 AM) | Devpost complete (T7 checklist) | `[ ]` |

**Live backend:** SpacetimeDB Maincloud, `https://maincloud.spacetimedb.com`, database `huddle-calhacks`. Shared secret is passed by DM only. Connected to Max's FastAPI stubs (`STUB_MODE=true`); voice stub (`voice/`) built, not yet wired (`VOICE_BASE_URL` unset).

**Sleep/away times need re-checking against the 6 PM start.** If Eric Chen's away window is fixed in clock time (Sat 6 AM to noon), it is now H12 to H18, not H9 to H15.

## Current coverage and access

- Eric Chen has exhausted his Claude session usage and is leaving soon. Max can cover backend code and integration in this Codex session; primary ownership and shared contracts remain unchanged.
- Max Li and Eric Wu are confirmed Admin collaborators on `huddle-calhacks`. Each uses their own account. Max's browser access is verified; his Mac's CLI launcher is installed, but the runtime download and CLI login are still pending. No publish from Max's CLI has been verified.
- Eric Wu's voice stub has landed. Six voice unit tests pass locally; setting `VOICE_BASE_URL` and verifying confirm/full callbacks against Maincloud remain separate steps.
- No Bright Data account/key is available. Haydn owns the account/review pipeline and Mapbox token/routing. Eric Chen's booth visit/key acquisition was temporary coverage; confirm a human owner for the booth task before he leaves. Max's private root `.env` has a blank `BRIGHTDATA_API_KEY` entry only.
- Max's first phase is complete: eight authenticated API routes, deterministic disclosed fixtures, cumulative budget guards, a live tunnel, and local integration checks. The real solver/learning/LLM/council phases have not started here.

## Shared

- [x] Plan docs (`build-brief.md`, `huddle.md`) updated for SpacetimeDB
- [x] Repo layout, `.gitignore`, `.env.example`
- [x] Contract `docs/CONTRACT.md` (S5.5 rewritten for SpacetimeDB)
- [x] End-to-end smoke test `scripts/smoke.mjs` passes on Maincloud (fakes), 27/27
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
- [ ] Max covering integration: verify/set Eric Wu's `VOICE_BASE_URL`, then test confirm and "full" re-plan with him after CLI login is ready
- [ ] Demo-mode fallbacks: `data/cached_run.json` from a real run; auto demo mode when /health fails
- [ ] Live scout via Bright Data (needs `docs/BRIGHTDATA.md`)
- [x] Council panel `web/src/components/council/` (functional pass; replays synthetic messages, not a live LLM council; restyle at H19)
- [x] Privacy fix: names hidden in plan text and offers unless showWhoCompromised
- [~] Experiment harness `docs/experiments/` (5 baselines run; "ours" waits for Max's real /plan; numbers not pitch-ready until places.json v2)
- [ ] README, Devpost writeup, secret scan, submission checklist

## C. Max: solver and council

- [x] FastAPI stubs for every endpoint, tunnel live and connected (keep it running; send the new URL if it changes)
- [x] Dietary rule applies to meals/desserts only (tagless activities stay eligible)
- [x] Budget guards in the module (`server/src/lib/budgets.ts`)
- [x] Ignored `api/.env` loading and safe live shared-secret check; the saved secret matches Maincloud
- [x] All eight API routes passed HTTP checks through the development tunnel, including auth, deterministic responses and cumulative budgets
- [~] Cover Eric Chen's backend work; complete CLI 2.13.0 installation/login and verify management access using Max's account
- [ ] /parse-prefs with keyword fallback
- [ ] L1 solver: filter, normalization, enumeration, maximin + Nash tie-break, three plans (note: only ~7 activities are open after 7:30 PM Sat; `places.json` has an extra `googlePlaceId` field)
- [ ] Posterior update, active selection, Monte Carlo robustness, Pareto, posteriorSummary
- [ ] /offers, /roulette
- [ ] /council: advocates, chair, validator, POST to `/route/council-message`
- [ ] eval: latency and determinism

## D. Eric Wu: voice

- [x] Claude API key shared with Max and saved privately; unused by the current stubs
- ? Twilio upgraded + number, Cartesia account, tunnel tool, demo phone verified
- [x] `POST /book` stub in `voice/`, confirm + full scenarios, six local unit tests pass; no real calls
- [ ] Supply/confirm the voice tunnel URL with Max or Eric Chen; verify deployed `VOICE_BASE_URL`, smoke test and service-backed "full" re-plan
- [ ] Bug: app jumps to Vote ~400 ms after the council finishes and Plans bounces back to Vote, so the debate is never seen
- [ ] `web/.env.local` pointing at Maincloud (see HANDOFF.md)
- [ ] Voice spike: one Mandarin call end to end; GO / NO-GO
- [ ] State machine, tools, event posting; scenarios S1, S2
- [ ] S3 ("we're full") + re-plan loop with Eric Chen
- [~] Call screen `web/src/components/call/CallScreen.tsx` (draft exists)
- [x] Frontend draft for the whole app in `web/` (bonus; see A)
- [ ] Recorded fallback call (labeled)
