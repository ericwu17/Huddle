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

- **Live backend:** SpacetimeDB Maincloud, `https://maincloud.spacetimedb.com`, database `huddle-calhacks`. Connected to the FastAPI service with `STUB_MODE=true`; parse, learning, plans, scores and council remain synthetic there. The real service (Claude parsing, swipe learning, Monte Carlo solver, offers, live council) is implemented behind `STUB_MODE=false` but Maincloud has not been switched; see [api/README.md](api/README.md) and [the switch-over steps](docs/LOCAL_TUNNELS.md#4-point-the-maincloud-module-at-the-tunnels).
- **Voice:** Eric Wu's `/book` stub is connected at `https://restaurants-availability-barbie-lil.trycloudflare.com`. Live synthetic confirm and full-to-re-plan tests passed through Maincloud without duplicate event replay. The service is restored to `STUB_SCENARIO=confirm`. No real phone call is implemented.
- **Access and coverage:** Max Li and Eric Wu are confirmed database Admins. Eric Chen is leaving and has exhausted his Claude session usage; Max can cover backend coding here. Max's CLI 2.13.0 is logged into his own account. An environment-only publish set `VOICE_BASE_URL`; management reads verified the API URL and `STUB_MODE=true` stayed unchanged. No module/schema was deployed.
- **Data:** no Bright Data account/key is available yet. Haydn owns the account, reviews and Mapbox routing; Eric Chen's booth/key task was temporary coverage. Review scores and live scout work remain blocked on that hand-off, not the stub demo.
- **What's done and what's next:** [docs/ROADMAP.md](docs/ROADMAP.md). **Current state, async tasks, operating commands:** [docs/HANDOFF.md](docs/HANDOFF.md).
- **Smoke test:** [Live check commands](api/README.md#check-the-live-connected-stubs) load the saved secret from `api/.env` and test both service scenarios. Each run creates a disposable synthetic group in the selected database.
- **Honesty and disclosure:** [docs/HONESTY.md](docs/HONESTY.md), [docs/DISCLOSURE.md](docs/DISCLOSURE.md).
- **Demo and submission:** [docs/DEMO_CHECKLIST.md](docs/DEMO_CHECKLIST.md). Corrected simulated comparisons and reproducible commands: [docs/experiments/README.md](docs/experiments/README.md); earlier per-stop-budget results are withdrawn.

## Run the connected stubs

Use Python 3.11+ for both Python services. From the repository root:

```sh
api/.venv/bin/python -m uvicorn api.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

FastAPI loads the ignored `api/.env` automatically. It needs the matching
`HUDDLE_SHARED_SECRET`. `STUB_MODE=true` serves the stubs; `STUB_MODE=false` serves the
real service and uses `ANTHROPIC_API_KEY` (the module's `STUB_MODE` must match). Setup and
checks: [api/README.md](api/README.md). Running both services from one laptop behind
Cloudflare tunnels: [docs/LOCAL_TUNNELS.md](docs/LOCAL_TUNNELS.md).

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
