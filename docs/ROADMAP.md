# Huddle roadmap

> Maintained by Eric Chen. Last updated Fri 7:30 PM (H1.5). Check things off in your own section as you push them.
>
> **H0 = Fri 6:00 PM** (the brief assumed 9 PM, so every gate is 3 hours earlier than `huddle.md` says).
> Legend: `[x]` done and in the repo · `[~]` in progress or rough draft · `[ ]` not started · `?` unknown (owner: please update)

## Gates

| Gate | When | What must be true | Status |
| --- | --- | --- | --- |
| H2 stubs | **Fri 8 PM** | Every endpoint exists with contract-shaped fakes; smoke test passes on fakes | `[~]` backend + UI yes; api and voice stubs missing |
| H8 hand-off | **Sat 2 AM** | places.json v1; Eric Chen's hand-off note | `[~]` places.json done; note not yet |
| L1 (H13) | **Sat 7 AM** | 4 phones join by QR, text parses, plan on a map with cost and timing, voting works; stubs-to-real flip done | `[ ]` |
| L2 (H19) | **Sat 1 PM** | Swipes with confidence, 3 named plans with robustness, places.json v2, Mapbox leg times, one eval chart. Decide: council, Fetch.ai, live voice vs recording | `[ ]` |
| L3 (H24) + freeze | **Sat 6 PM** | Offers, scout badge, council streaming, polished screens, voice S1-S3 (or fallback), re-plan loop works once, demo path written | `[ ]` |
| Submit | **Sun 7:30 AM** (hard 9 AM, checked in by 8 AM) | Devpost complete (T7 checklist) | `[ ]` |

**Live backend:** SpacetimeDB Maincloud, `https://maincloud.spacetimedb.com`, database `huddle-calhacks`. Shared secret is passed by DM only.

**Sleep/away times need re-checking against the 6 PM start.** If Eric Chen's away window is fixed in clock time (Sat 6 AM to noon), it is now H12 to H18, not H9 to H15.

## Shared

- [x] Plan docs (`build-brief.md`, `huddle.md`) updated for SpacetimeDB
- [x] Repo layout, `.gitignore`, `.env.example`
- [x] Contract `docs/CONTRACT.md` (S5.5 rewritten for SpacetimeDB)
- [~] End-to-end check: Eric Chen's 23-check four-phone script passes on Maincloud (fakes). Haydn's `scripts/smoke.mjs` not yet; the script is available as a starting point
- [ ] Booth answers posted (Meta, Cartesia, Bright Data, Microsoft, Fetch.ai, SpacetimeDB)

## A. Haydn: data, routing, glue

- ? Mapbox token, Bright Data account
- [ ] `scripts/smoke.mjs` (H0-2)
- [~] Bare-bones UI: drafted by Eric Wu in `web/` (Vite + React, all screens routed, live on the SpacetimeDB views). Haydn: review and take over or confirm ownership
- [ ] Bright Data review pull + `docs/BRIGHTDATA.md` (Eric Chen needs this for the live scout)
- [ ] Aspect extraction, aggregation, `places.json` v2 (input: `data/places.base.json`; each place has `googlePlaceId`)
- [ ] `server/src/geo.ts`: route geometry, leg times (geo_cache table exists)
- [ ] `server/src/replan.ts`: scheduled procedure on `replan_job` calling `startRun(tx, groupId)`; tell Eric Chen to export it
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
- [x] `docs/HONESTY.md`, `docs/DISCLOSURE.md` (seeded; keep updating)
- [ ] Hand-off note (due Sat 2 AM)
- [ ] Wire Max's real api (`FASTAPI_BASE_URL`) and rerun the test
- [ ] Wire Eric Wu's voice service (`VOICE_BASE_URL`); test the "full" re-plan with him
- [ ] Demo-mode fallbacks: `data/cached_run.json` from a real run; auto demo mode when /health fails
- [ ] Live scout via Bright Data (needs `docs/BRIGHTDATA.md`)
- [~] Council panel `web/src/components/council/` (functional pass in progress)
- [~] Experiment harness `docs/experiments/` (baselines in progress; "ours" waits for Max's /plan)
- [ ] README, Devpost writeup, secret scan, submission checklist

## C. Max: solver and council

- ? Claude API key
- [ ] FastAPI stubs for every endpoint (due H2, 8 PM); tunnel URL to Eric Chen
- [ ] /parse-prefs with keyword fallback
- [ ] L1 solver: filter, normalization, enumeration, maximin + Nash tie-break, three plans (note: only ~7 activities are open after 7:30 PM Sat; `places.json` has an extra `googlePlaceId` field)
- [ ] Posterior update, active selection, Monte Carlo robustness, Pareto, posteriorSummary
- [ ] /offers, /roulette
- [ ] /council: advocates, chair, validator, POST to `/route/council-message`
- [ ] eval: latency and determinism

## D. Eric Wu: voice

- ? Twilio upgraded + number, Cartesia account, tunnel tool, demo phone verified
- [ ] `POST /book` stub posting fake events to `/route/call-event` (due H2, 8 PM); URL to Eric Chen
- [ ] Voice spike: one Mandarin call end to end; GO / NO-GO
- [ ] State machine, tools, event posting; scenarios S1, S2
- [ ] S3 ("we're full") + re-plan loop with Eric Chen
- [~] Call screen `web/src/components/call/CallScreen.tsx` (draft exists)
- [x] Frontend draft for the whole app in `web/` (bonus; see A)
- [ ] Recorded fallback call (labeled)
