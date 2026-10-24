# Huddle

Everyone in the group chat says what they want, and the AI finds a plan nobody hates, has agents argue it out, then books it by phone.

Cal Hacks 13.0. Full README (architecture, how to run) lands at H26.

## Layout

| Path | Owner | What |
| --- | --- | --- |
| `web/` | Haydn | Vite + React app (see [web/README.md](web/README.md)) |
| `server/` | Eric Chen | SpacetimeDB module (`src/geo.ts`, `src/replan.ts` are Part A; Eric Chen covering while Haydn is out) |
| `web/src/components/council/` | Eric Chen | Council panel |
| `web/src/components/call/` | Eric Wu | Call screen |
| `api/` | Max | FastAPI solver + council (see [api/README.md](api/README.md)) |
| `voice/` | Eric Wu | Pipecat / Twilio voice service |
| `data/` | Eric Chen, Haydn (`reviews/`) | Place data, fakes, caches |
| `docs/` | Eric Chen | Contract, roadmap, hand-off, honesty list, disclosure |
| `scripts/` | Haydn (Eric Chen covering) | `smoke.mjs` end-to-end test |

The API contract is in [docs/CONTRACT.md](docs/CONTRACT.md).

## Status

- **Live backend:** SpacetimeDB Maincloud, `https://maincloud.spacetimedb.com`, database `huddle-calhacks`. Connected to the FastAPI stubs (`STUB_MODE=true`); voice not connected yet.
- **What's done and what's next:** [docs/ROADMAP.md](docs/ROADMAP.md). **Current state, async tasks, operating commands:** [docs/HANDOFF.md](docs/HANDOFF.md).
- **Smoke test:** `node scripts/smoke.mjs` (set `SPACETIMEDB_URI`, `SPACETIMEDB_DB`; secret from `.env`).
- **Honesty and disclosure:** [docs/HONESTY.md](docs/HONESTY.md), [docs/DISCLOSURE.md](docs/DISCLOSURE.md).

## Run the SpacetimeDB module locally

Needs the `spacetime` CLI 2.13.0 (https://spacetimedb.com/install).

```bash
spacetime start                                   # local server on :3000, leave running
cd server && npm install && cd ..
HUDDLE_SHARED_SECRET=<any local value> spacetime publish huddle-local -p server -s local -y
curl http://127.0.0.1:3000/v1/database/huddle-local/route/health
```

With `FASTAPI_BASE_URL` and `VOICE_BASE_URL` unset, the module uses fakes (see `server/src/lib/fakes.ts`). Set them in your shell and publish again to talk to the real api and voice services.
