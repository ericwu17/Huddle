# Huddle

Everyone in the group chat says what they want, and the AI finds a plan nobody hates, has agents argue it out, then books it by phone.

Cal Hacks 13.0. Full README (architecture, how to run) lands at H26.

## Layout

| Path | Owner | What |
| --- | --- | --- |
| `web/` | Haydn | Vite + React app (see [web/README.md](web/README.md)) |
| `server/` | Eric Chen | SpacetimeDB module (Haydn owns `src/geo.ts` and `src/replan.ts`) |
| `web/src/components/council/` | Eric Chen | Council panel |
| `web/src/components/call/` | Eric Wu | Call screen |
| `api/` | Max | FastAPI solver + council |
| `voice/` | Eric Wu | Pipecat / Twilio voice service |
| `data/` | Eric Chen, Haydn (`reviews/`) | Place data, fakes, caches |
| `docs/` | Eric Chen | Contract, honesty list, disclosure |

The API contract is in [docs/CONTRACT.md](docs/CONTRACT.md).

## Run the SpacetimeDB module locally

Needs the `spacetime` CLI 2.13.0 (https://spacetimedb.com/install).

```bash
spacetime start                                   # local server on :3000, leave running
cd server && npm install && cd ..
HUDDLE_SHARED_SECRET=<any local value> spacetime publish huddle-local -p server -s local -y
curl http://127.0.0.1:3000/v1/database/huddle-local/route/health
```

With `FASTAPI_BASE_URL` and `VOICE_BASE_URL` unset, the module uses fakes (see `server/src/lib/fakes.ts`). Set them in your shell and publish again to talk to the real api and voice services.
