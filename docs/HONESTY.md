# Honesty list

Everything cached, seeded, simulated, scripted, or hardcoded. Say these out loud in the pitch and put them on Devpost.

| Item | Where | Status |
| --- | --- | --- |
| Place dataset is a cached snapshot (~45 Berkeley places from Google Places, pulled once) | `data/places.json` | planned |
| Fake places used for stubs and early UI | `data/places.fake.json` | in use |
| Demo group (Alex, Sam, Jordan, Riley) is seeded | `data/demo_group.json` | in use |
| The module returns fake plans / council / scout / call data until the real api and voice are wired | `server/src/lib/fakes.ts` | in use (H0-H13) |
| Cached plan run used when the api is unreachable | `data/cached_run.json` | placeholder (fake until H24) |
| Scout results may come from a pre-warmed cache ("Checked earlier") | `data/scout_cache.json` | placeholder (fake until H24) |
| The restaurant on the call is a teammate | demo | planned |
| The "we're full" reply in the re-plan demo is scripted | demo | planned |
| Any recorded fallback call is a real earlier call, labeled | demo | planned |
| Evaluation numbers come from synthetic groups and tastes (baselines are oracles on the synthetic truth; "ours" is only reported from real /plan calls) | `docs/experiments/` | in use (baselines only; ours and swipe experiment wait on the api) |
| Review data is scraped via Bright Data (terms checked) | `data/reviews/` | planned |
| Council messages are AI-generated under a validator | `api/` | planned |
| Auth is hackathon-grade: each phone is whoever holds its SpacetimeDB token (kept in local storage); services share one secret header | `server/src/http.ts` | in use |
