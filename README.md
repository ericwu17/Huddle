# Huddle

Everyone in the group chat says what they want, and the AI finds a plan nobody hates, has agents argue it out, then books it by phone.

Cal Hacks 13.0. Current operating instructions and hand-off are below; the final submission README is due at H26.

## Layout

| Path | Owner | What |
| --- | --- | --- |
| `web/` | Haydn | Vite + React app (see [web/README.md](web/README.md)) |
| `server/` | Eric Chen; Max covering backend work while Eric is away | SpacetimeDB module (`src/geo.ts`, `src/replan.ts` remain Part A; Eric Chen implemented re-plan while Haydn was out) |
| `web/src/components/council/` | Eric Chen; Max covering integration | Council panel |
| `web/src/components/call/` | Eric Wu | Call screen |
| `api/` | Max | FastAPI solver + council (see [api/README.md](api/README.md)) |
| `voice/` | Eric Wu | Pipecat / Twilio voice service |
| `data/` | Eric Chen, Haydn (`reviews/`) | Place data, fakes, caches |
| `docs/` | Eric Chen; Max maintaining the current hand-off | Contract, roadmap, hand-off, honesty list, disclosure |
| `scripts/` | Haydn (smoke test implemented by Eric Chen) | `smoke.mjs` end-to-end test |

The API contract is in [docs/CONTRACT.md](docs/CONTRACT.md).

## Status

- **Live backend:** SpacetimeDB Maincloud, `https://maincloud.spacetimedb.com`, database `huddle-calhacks`. Connected to Max's separate FastAPI service with `STUB_MODE=true`; parse, learning, plans, scores and council remain synthetic.
- **Voice:** Eric Wu's `/book` stub is merged, with confirm/full event sequences and six passing local tests. Max's authenticated CLI check confirms `VOICE_BASE_URL` is unset; wiring and service-backed booking/re-plan checks remain pending. No real phone call is implemented.
- **Access and coverage:** Max Li and Eric Wu are confirmed database Admins. Eric Chen is leaving and has exhausted his Claude session usage; Max can cover backend coding here. Max's Mac has CLI 2.13.0 installed and logged into his own account. Management reads verified the API tunnel URL and `STUB_MODE=true`; no CLI publish has been performed.
- **Data:** no Bright Data account/key is available yet. Haydn owns the account, reviews and Mapbox routing; Eric Chen's booth/key task was temporary coverage. Review scores and live scout work remain blocked on that hand-off, not the stub demo.
- **What's done and what's next:** [docs/ROADMAP.md](docs/ROADMAP.md). **Current state, async tasks, operating commands:** [docs/HANDOFF.md](docs/HANDOFF.md).
- **Smoke test:** `node scripts/smoke.mjs` (set `SPACETIMEDB_URI`, `SPACETIMEDB_DB`; secret from `.env`).
- **Honesty and disclosure:** [docs/HONESTY.md](docs/HONESTY.md), [docs/DISCLOSURE.md](docs/DISCLOSURE.md).

## Run the connected stubs

Use Python 3.11+ for both Python services. From the repository root:

```sh
api/.venv/bin/python -m uvicorn api.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

FastAPI loads the ignored `api/.env` automatically. It needs the matching
`HUDDLE_SHARED_SECRET` and `STUB_MODE=true`; `ANTHROPIC_API_KEY` is unused in this
phase. Setup and checks: [api/README.md](api/README.md).

The current development tunnel is
`https://conferencing-navigate-deleted-feedback.trycloudflare.com`. Keep the API,
tunnel and Mac awake while others use it. A restarted tunnel needs its new URL
published as `FASTAPI_BASE_URL`. This is temporary development access, not hosted
production infrastructure.

Voice setup: [voice/README.md](voice/README.md). Frontend Maincloud configuration:
[web/README.md](web/README.md). The frontend, SpacetimeDB module, Python API and
voice service are separate processes. The shared secret never goes in frontend
configuration.

## Run the SpacetimeDB module locally

Needs the `spacetime` CLI 2.13.0 (https://spacetimedb.com/install).

```bash
spacetime start                                   # local server on :3000, leave running
cd server && npm install && cd ..
HUDDLE_SHARED_SECRET=<any local value> spacetime publish huddle-local -p server -s local -y
curl http://127.0.0.1:3000/v1/database/huddle-local/route/health
```

With `FASTAPI_BASE_URL` and `VOICE_BASE_URL` unset, the module uses fakes (see `server/src/lib/fakes.ts`). Set them in your shell and publish again to talk to the real api and voice services.
