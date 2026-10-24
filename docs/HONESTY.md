# Honesty list

Everything cached, seeded, simulated, scripted, or hardcoded. Say these out loud in the pitch and put them on Devpost.

| Item | Where | Status |
| --- | --- | --- |
| Place dataset is a cached snapshot (~45 Berkeley places from Google Places, pulled once) | `data/places.json` | planned |
| Nine fictional venues shared by API/backend stubs; legacy and real catalogs remain lookup-compatible | `api/fixtures/places.fake.json` | in use with `STUB_MODE=true` (default) |
| API parser recognizes four exact demo phrases; posterior updates are unchanged; scores, confidence, Pareto rows, and council text/timestamps are canned; offers are empty | `api/`, `server/src/lib/fakes.ts` | in use; synthetic labels included |
| Stub integration checks use real module procedures and the native in-memory test datastore calling localhost FastAPI, not a deployed database or browser subscriptions | `api/eval/check_integration.py`, `server/test/` | verified locally |
| Demo group (Alex, Sam, Jordan, Riley) is seeded | `data/demo_group.json` | in use |
| The module returns fake plans / council / scout / call data until the real api and voice are wired | `server/src/lib/fakes.ts` | in use (H0-H13) |
| Cached plan run used when the api is unreachable | `data/cached_run.json` | placeholder (fake until H24) |
| Scout results may come from a pre-warmed cache ("Checked earlier") | `data/scout_cache.json` | placeholder (fake until H24) |
| The restaurant on the call is a teammate | demo | planned |
| The "we're full" reply in the re-plan demo is scripted | demo | planned |
| Any recorded fallback call is a real earlier call, labeled | demo | planned |
| Evaluation numbers come from synthetic groups | `docs/experiments/` | planned |
| Review data is scraped via Bright Data (terms checked) | `data/reviews/` | planned |
| Council messages are AI-generated under a validator | `api/` | planned |
| Auth is hackathon-grade: each phone is whoever holds its SpacetimeDB token (kept in local storage); services share one secret header | `server/src/http.ts` | in use |
