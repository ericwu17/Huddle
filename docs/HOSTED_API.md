# Host the Huddle API on Render

**Deferred alternative, October 24.** The team chose to keep local FastAPI + a
public tunnel + Maincloud for the agent-flow phase. No Render service was
created and no paid plan is approved. The instructions below are retained for
a later hosting decision, not steps required before current development.

Prepared October 24, 2026. This configuration has not been deployed. Keep Vercel
for the frontend and SpacetimeDB Maincloud for state and realtime. Render hosts
only the existing stateless Python API, replacing the laptop API and its tunnel.
Claude remains an external API; this does not replace the mathematical planner.

## Service configuration

The repository's `render.yaml` describes one Python Web Service. Apply it through
Render's New Blueprint flow after connecting the `ericwu17/Huddle` GitHub repo
and pushing the configuration to main. A Render account with repository access
and billing approval is required before creating the paid service.

For manual creation with New Web Service, use the same settings:

| Setting | Value |
| --- | --- |
| Repository / branch | `ericwu17/Huddle` / `main` |
| Runtime | Python |
| Root directory | Leave blank: use the repository root |
| Python | `3.13`, selected by `.python-version` |
| Build command | `python -m pip install -r api/requirements.txt` |
| Start command | `python -m uvicorn api.main:app --host 0.0.0.0 --port $PORT --no-access-log` |
| Instance | Starter initially; verify planner latency and memory before cutover |
| Auto-deploy | Off; deploy manually during the demo preparation |
| HTTP health-check path | Leave unset to use Render's default TCP check |

Keep the root directory at the repository root: `api/main.py` loads
`data/places.json` outside `api/`. No persistent disk or additional database is
required. The existing API's `/health` requires `X-Huddle-Secret`; configuring an
unauthenticated Render HTTP probe for that path would mark the service unhealthy.
Uvicorn opens its socket after application startup, which validates the catalog.

Render advertises Starter at $7/month for 512 MB / 0.5 CPU, excluding any other
applicable charges. Confirm the price in the dashboard before creating it.
The free instance sleeps after 15 idle minutes and takes about a minute to wake;
Huddle's module currently times out API calls after 20 seconds. Use an always-on
paid instance for the shared demo. Starter performance is not yet measured for
this solver; upgrade only if the connected checks show insufficient capacity.

## Environment

Enter secret values in Render's environment settings, never in Git or a frontend
variable. The Blueprint prompts for the two secrets; it does not generate them.

| Name | Source / value |
| --- | --- |
| `HUDDLE_SHARED_SECRET` | The existing Huddle service secret, identical to the value configured in SpacetimeDB |
| `ANTHROPIC_API_KEY` | The team's existing Claude API key |
| `SPACETIMEDB_URI` | `https://maincloud.spacetimedb.com` |
| `SPACETIMEDB_DB` | `huddle-calhacks` |
| `CLAUDE_MODEL_FAST`, `CLAUDE_MODEL_SMART` | Optional: preserve any working model overrides from the current API host |

The SpacetimeDB values enable the existing council-message callback adapter.
The full `/council` response remains the transcript source of truth if a streaming
callback fails. Leave `PLACES_PATH` unset to use the checked-in real catalog.
The API no longer reads `STUB_MODE`; the database module must retain
`STUB_MODE=false`. A missing Claude key still permits fallback parsing/council,
so HTTP health alone does not prove real Claude calls work.

## Verify, then switch the database URL

1. Deploy the service and obtain its actual public HTTPS URL from Render. Check
   startup/build logs without printing secret values.
2. Run the authenticated HTTP smoke against that URL, using the existing
   private local environment file. Verify health loads 45 places, missing/wrong
   secrets return 401, and planning responses satisfy cumulative budgets. The
   existing smoke reads `FASTAPI_BASE_URL` and `HUDDLE_SHARED_SECRET` from its
   environment; the example below loads the secret from ignored `api/.env`.
3. Before changing Maincloud, record its current public `FASTAPI_BASE_URL` for
   rollback. Preserve its shared secret and all unrelated environment values.
4. Update only the module's `FASTAPI_BASE_URL` to the verified Render URL using
   an environment-only publish, explicit Maincloud target and `--no-config`.
   Retain `STUB_MODE=false`; no module/schema/data publication is needed.
   Do not run the laptop host script afterwards: it can replace this URL.
5. Run the connected group smoke against Maincloud. Confirm real parsing and
   council (no fallback), current whole-outing budgets, voting, roulette and
   scripted booking/re-plan. Exercise a second independent group and verify
   response latency stays within the module's 20-second timeout. Check Render's
   memory/CPU graphs before declaring the initial instance sufficient.
6. Open a new huddle in the Vercel app from two devices. Existing groups already
   in demo mode do not automatically regenerate real results after recovery.
7. Stop only the old API/tunnel owned by the operator after the new path passes.
   Confirm the app continues working with that laptop disconnected.

Direct HTTP smoke, from the repository root with the local API dependencies
installed (substitute the actual Render URL; no secret goes in this command):

```sh
API_URL=https://YOUR-SERVICE.onrender.com api/.venv/bin/python - <<'PY'
import os, runpy
from dotenv import dotenv_values
os.environ['HUDDLE_SHARED_SECRET'] = dotenv_values('api/.env')['HUDDLE_SHARED_SECRET']
os.environ['FASTAPI_BASE_URL'] = os.environ['API_URL']
runpy.run_path('api/eval/smoke_http.py', run_name='__main__')
PY
```

This smoke checks missing authentication and prints any council fallback; also
verify a deliberately wrong secret returns 401, the full stop sum matches each
plan total, and council reports `fallbackUsed=false` before accepting cutover.
Do not treat the smoke's 30-second client timeout as proof of the module's
20-second deadline. The connected test is still required.

Current Maincloud configuration uses the module's scripted booking with no
separate voice URL. This API deployment does not add real phone calls or fix
planner, category or UI defects. A single hosted API is still one service
instance, but removes the dependency on a teammate's laptop and changing tunnel
URL. Render supplies health monitoring and automatic restarts.

If verification fails after cutover, restore the recorded previous public API
URL while its host is still running. If it is no longer healthy, keep the
existing labeled demo fallback until the hosted API is repaired.

## Preparation verification

- Existing API dependency pins resolve for Python 3.13 on Linux x86-64 using
  `uv pip compile`; no application dependency files were changed.
- The Blueprint validates against Render's published JSON schema. Its secrets
  have no values, and its root directory, TCP health check and manual-deploy
  settings were checked locally.
- Hosted build, authenticated HTTP smoke, resource measurements and the
  Maincloud cutover remain pending until the service is created.

References: [FastAPI deployment](https://render.com/docs/deploy-fastapi),
[Python version](https://render.com/docs/python-version),
[health checks](https://render.com/docs/health-checks),
[free-instance behavior](https://render.com/docs/free),
[published Starter pricing](https://render.com/articles/render-vs-railway),
[Blueprint schema](https://render.com/schema/render.yaml.json).
