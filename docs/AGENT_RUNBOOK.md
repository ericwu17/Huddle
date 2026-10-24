# Run and verify the coordinator flow

The current arrangement is local FastAPI + Cloudflare tunnel + SpacetimeDB
Maincloud, with Vite for local frontend work. The laptop must stay awake and
connected. Claude needs internet access. No local database or paid hosting is
required. See [the contract](AGENT_CONTRACT.md) and [approved flow](AGENT_FLOW_PLAN.md).

## Local API and frontend

From the repository root on Max's Mac, use the root Python environment created
for this implementation. This preserves the older `api/.venv` and its installed
Cloudflare binary.

```sh
cd /Users/maxli/Huddle
uv venv --python 3.13 .venv                         # first setup only
uv pip install --python .venv/bin/python -r api/requirements-dev.txt
.venv/bin/python -m uvicorn api.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

FastAPI loads ignored `api/.env` automatically. It needs the existing
`HUDDLE_SHARED_SECRET` and `ANTHROPIC_API_KEY`; optional model overrides are
`CLAUDE_MODEL_FAST` and `CLAUDE_MODEL_SMART`. Do not place these in Vite variables.
If `.venv` already exists, reuse it; do not clear another developer's environment.

In another terminal, Max's existing tunnel binary is:

```sh
api/.venv/bin/cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8000
```

Use `cloudflared` from PATH instead on another machine with that CLI installed.
Copy the public HTTPS URL it prints. It normally changes on restart. Keep both
processes running. Only one designated operator updates the shared module URL.

After the chosen Maincloud module has the additive agent code and correct API
URL, start Vite with explicit public connection values (use the isolated module
for initial tests; use `huddle-calhacks` after shared rollout):

```sh
NEXT_PUBLIC_SPACETIMEDB_URI=https://maincloud.spacetimedb.com \
NEXT_PUBLIC_SPACETIMEDB_DB=huddle-calhacks \
npm run dev --prefix web -- --host 0.0.0.0 --port 5173 --strictPort
```

Open `http://localhost:5173/start` on the host, or Vite's printed network URL on
phones. For phone QR joining, the host should open that network URL too so QR
links point to the laptop rather than each phone's localhost. The browser talks
to Maincloud; it never receives the private API secret. Vercel shows the new UI
only after the frontend changes are released there.

## Publish and connection changes

Sync main before merging/pushing. Build/check first, then publish only to the
explicit intended module with `--delete-data=never --no-config`. Additive agent
tables preserve legacy rows; never approve a reset to make publishing succeed.
For the isolated module, supply a matching private shared secret. On the existing
shared module, preserve its secret and unrelated environment settings.

Set `FASTAPI_BASE_URL` to the verified tunnel and keep `STUB_MODE=false` for the
real catalog. Module environment values are not returned by the management API;
the operator should retain its public tunnel URL in its own logs. Agent mode
forces simulated booking independently of `VOICE_BASE_URL`. Do not launch a
second host script that silently replaces the shared URL.

## Live venue catalog (Bright Data)

The scraped Berkeley catalog has 130 venues: the bundled 45 plus 85 new ones. It's committed in
`data/brightdata/catalog.json` but isn't live yet. To turn it on, the designated
operator republishes the module (as above, `--delete-data=never --no-config`),
restarts the shared API from the same commit, and then runs
`python3 data/reviews/collect.py publish --add meal=40,dessert=15,activity=30`.
That last step needs `SPACETIMEDB_URI`, `SPACETIMEDB_DB` and `HUDDLE_SHARED_SECRET`
and no scraper keys. The exact commands, checks and rollback are in
[BRIGHTDATA.md, Go live](BRIGHTDATA.md#go-live). Until the catalog is published,
every huddle plans over the bundled 45 places in `data/places.json`.

## Verification commands

```sh
.venv/bin/python -m unittest discover -s api/eval
npm run typecheck --prefix server
npm test --prefix server
npm run build --prefix web
npm run lint --prefix web

.venv/bin/python api/eval/check_live.py --agent \
  --server https://maincloud.spacetimedb.com \
  --database huddle-agent-max-check \
  --api-base-url https://YOUR-CURRENT-TUNNEL.trycloudflare.com
```

The helper loads the service secret from ignored `api/.env` without displaying
it. Connected smoke creates synthetic people, disposable huddles and simulated
booking events and makes real Claude calls. It checks privacy, confirmation,
whole-outing budgets, public explanations without math scores, stale choices,
host-only booking and an injected full-to-replan scenario. It never calls a
restaurant. Use a new group to test coordinator mode; legacy groups remain legacy.

## Browser rehearsal

Use two browser profiles or devices. Join and get ready; submit different private
prompts, inspect summaries and confirm. The host chooses Find plans. Verify
public plans contain no private prompts/caps or satisfaction percentages. Discuss
or edit needs; old choices must become unavailable. Everyone votes, then only
the host starts the clearly labeled booking simulation. Refresh to verify state
and identity persist. Missing allergy evidence deliberately blocks the flow.

For a labeled one-person demo, `node scripts/demo-friends.mjs CODE --fast` adds
three simulated participants on the configured module. Set `SPACETIMEDB_DB`
explicitly when using the isolated module; its default remains `huddle-calhacks`.
The script's seeded preferences/confirmation/votes are not autonomous Claude
agents or real people. The presenter still confirms their own needs and starts
planning/booking.
