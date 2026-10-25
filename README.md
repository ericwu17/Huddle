# Huddle

Everyone describes what they want. A Claude coordinator uses the group's private
inputs to suggest outings, explain the trade-offs and help the group decide.

Cal Hacks 13.0. **Start with [current product and architecture context](docs/CURRENT_CONTEXT.md).**
It supersedes conflicting requirements in the original build brief and task split.

## How it works

New huddles follow this flow:

1. **Start and invite.** Sign in at `/login`, add friends at `/friends`, then
   start and optionally name a huddle from `/start` (`/` redirects there). In
   the lobby, the host invites accepted friends with a picker. Friends accept
   from `/inbox` or their in-app invitation link. Guests can start a huddle
   without an account and share its join code (`/join/:code`).
2. **Private inputs.** In the lobby, each participant chooses a city (or uses
   GPS). Supported cities are Berkeley, Oakland, San Francisco, Albany and
   Emeryville. Each participant then saves optional private limits (total
   budget, time available, number of stops, dietary needs, allergies) and a
   free-text prompt with **Save & ready**, and can pick a preferred time of day. Claude extracts their needs (`/agent/needs`) and asks for a
   private confirmation only when something consequential is ambiguous.
3. **Time.** The host can pick a manual window or search the participants'
   connected Google Calendars for a common opening
   ([api/scheduling.py](api/scheduling.py)). If neither is set, the coordinator
   picks a time automatically.
4. **Plans.** Code builds candidate itineraries of 1–5 stops from the venue
   catalog, and Claude chooses up to three of them (`/agent/plan`). The module
   ([server/src/lib/agent-result.ts](server/src/lib/agent-result.ts)) and the API
   both check every proposal against venue facts, opening hours, everyone's
   cumulative budget, confirmed dietary/allergy restrictions and the current
   input revision. Public explanations are built from catalog facts. Other
   members never see your raw prompt, caps or private order.
5. **Vote.** Participants vote on the current plans, and Spin breaks complete
   ties. If nothing fits every limit, a plan can be offered as *provisional* and
   labeled with the limit it breaks. People can vote on it, but booking and
   Calendar only accept fully validated plans. Saved caps never change.
6. **Done.** The Done page shows a map and directions, lets each participant add
   the plan to their own Google Calendar, and creates a shareable result link
   (`/result/:shareId`). Booking is always a labeled simulation for these
   huddles: no restaurant is called.

Groups created before the coordinator still use the original mathematical
planner: swipes, Bayesian preference learning, the solver, offers and the
advocate council (`/parse-prefs`, `/elicit/*`, `/plan`, `/offers`, `/roulette`,
`/council`). Those routes and module procedures stay for compatibility, but the
current UI no longer creates legacy groups.

Not built yet: voice input, personal AI keys, inferred memory, real phone
bookings, and SMS/email/push invitations. Invitations are delivered in the app.
The optional Mac Messages and Mac Contacts adapters are off by default.

## Architecture and status

| Component | Implementation |
| --- | --- |
| Frontend | React 19, React Router 7, Vite and Tailwind 4, with a custom illustrated theme ([Design.md](Design.md)). Deployed on Vercel at `huddle.compare` |
| State and realtime | SpacetimeDB 2.13 module ([server/](server/)) on Maincloud, database `huddle-calhacks`. It stores accounts, huddles, private inputs, plan runs and the active venue catalog, and runs the jobs that call FastAPI |
| API and planner | Python 3.13 FastAPI ([api/](api/)), run on a designated team laptop and exposed through a Cloudflare quick tunnel ([scripts/tunnels.sh](scripts/tunnels.sh)) |
| Models | Claude via the Anthropic API. `CLAUDE_MODEL_FAST` and `CLAUDE_MODEL_SMART` both default to `claude-haiku-5-5` ([api/llm.py](api/llm.py)). Code validates facts and hard limits; no local LLM is used |
| Booking | Simulated for every coordinator huddle ([server/src/booking.ts](server/src/booking.ts)). Legacy groups can use the scripted [voice/](voice/) service; real calls are not implemented |
| Connectors | Per-account Google Calendar OAuth with encrypted tokens, free/busy search and personal event creation. Optional host-only Mac Messages/Contacts adapters ([docs/CONNECTORS_CONTRACT.md](docs/CONNECTORS_CONTRACT.md)) |
| Maps | Optional Google Maps Embed directions (`NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY`). Without the key, a Leaflet street map shows straight-line distances |

The browser talks only to SpacetimeDB. Module jobs call FastAPI with the private
`FASTAPI_BASE_URL` and `X-Huddle-Secret`. FastAPI is stateless: each request
carries the authorized context and catalog snapshot. Maincloud cannot call a
loopback address (SpacetimeDB rejects private addresses), so a shared API needs
a public tunnel. The earlier [all-local plan](docs/SINGLE_LAPTOP_PLAN.md) is
blocked for this reason. A [Render configuration](docs/HOSTED_API.md)
(`render.yaml`) is prepared but has not been deployed.

### Venue data

- **Active catalog:** [data/catalog/cities.json](data/catalog/cities.json) has
  200 venues: 120 Berkeley, 39 Oakland, 30 San Francisco, 9 Albany and
  2 Emeryville (90 meals, 66 activities, 44 desserts).
  [scripts/publish-menu-catalog.py](scripts/publish-menu-catalog.py) joins it
  with menus and photos from `data/brightdata/details.json`, giving 950 menu
  items and 499 photos, and pushes it to the module's `/catalog` route.
  Oakland/SF venues have no menu data yet.
- **Bright Data scrape:** `data/brightdata/places.json` has 5,932 Google Maps
  places across Berkeley, Oakland and SF. `data/brightdata/catalog.json` is the
  earlier 140-venue Berkeley-area snapshot. See [docs/BRIGHTDATA.md](docs/BRIGHTDATA.md)
  and [docs/CITY_COVERAGE.md](docs/CITY_COVERAGE.md).
- **Fallback:** if no catalog has been pushed, the module falls back to the
  45 bundled Berkeley places in `data/places.json`.
- **Not verified:** review aspects (noise, crowd and so on) are placeholder
  values, and the scout cache is a fixed sample. Allergen evidence is not
  verified, so plans for members with allergies stay provisional and cannot be
  booked. Takeout and seating details are collected but not used by the planner.

## Layout

| Path | Owner | What |
| --- | --- | --- |
| `web/` | Eric Chen; coordinate overlapping work | Vite + React app (see [web/README.md](web/README.md)) |
| `web/src/components/council/` | Eric Chen | Agent conversation / council panel |
| `web/src/components/call/` | Eric Wu | Call screen |
| `server/` | Eric Chen with Max on integration | SpacetimeDB module: tables, private views, reducers/procedures, jobs, HTTP routes |
| `shared/` | Coordinate | City list, Census city boundaries and outing-timing rules shared by `web/` and `server/` |
| `api/` | Eric Wu on implementation; Max on planner/context/contracts and verification | FastAPI service ([api/README.md](api/README.md)); coordinate file ownership before edits |
| `voice/` | Eric Wu | Scripted booking-call service; live phone calls deferred ([voice/README.md](voice/README.md)) |
| `data/` | Eric Wu for Bright Data ingestion; coordinate venue corrections | Venue catalogs, Bright Data scrape and collectors (`data/reviews/`), geography, fakes, caches |
| `docs/` | Max maintaining current context with the team | Context, contracts, runbooks, verification, hand-off and disclosure |
| `scripts/` | Coordinate with Eric Chen and Max | Tunnels and hosting helpers, catalog build/publish, connected smoke checks |

The additive [agent contract](docs/AGENT_CONTRACT.md) describes the coordinator
flow. The [legacy wire contract](docs/CONTRACT.md) remains valid for existing
groups. Accounts and connectors have their own
[accounts contract](docs/ACCOUNTS_CONTRACT.md) and
[connectors contract](docs/CONNECTORS_CONTRACT.md).

## Local development

FastAPI needs Python 3.13 (`.python-version`). From the repository root:

```sh
uv venv --python 3.13 .venv                    # first setup only
uv pip install --python .venv/bin/python -r api/requirements-dev.txt
.venv/bin/python -m uvicorn api.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

FastAPI loads the ignored `api/.env` (template: [api/.env.example](api/.env.example)).
It requires `HUDDLE_SHARED_SECRET`, and the coordinator endpoints need
`ANTHROPIC_API_KEY`. Never put either in frontend configuration. The API has no
stub mode, so the calling module must run with `STUB_MODE=false`. See
[API implementation and checks](api/README.md).

Start the frontend separately, with the public SpacetimeDB variables described
in [web/README.md](web/README.md):

```sh
npm ci --prefix web
npm run dev --prefix web -- --host 127.0.0.1 --port 5173 --strictPort
```

To connect the shared Maincloud module to a laptop API, use
[scripts/tunnels.sh](scripts/tunnels.sh) ([guide](docs/LOCAL_TUNNELS.md)). It
expects virtualenvs at `api/.venv` and `voice/.venv`, starts both services and
tunnels, and publishes the new URLs to the module. Only the designated host
should publish its URL. Other developers must not overwrite it with personal
test instances. To try changes without touching shared data, use the isolated
preview database described in the [operations runbook](docs/ACCOUNTS_RUNBOOK.md).

Tests and checks, from the repository root:

```sh
.venv/bin/python -m unittest discover -s api/eval -p 'test_*.py' -q
npm ci --prefix server
npm test --prefix server
npm run typecheck --prefix server
npm run build --prefix web
npm run lint --prefix web
```

After changing `server/`, regenerate the client bindings with
`npm run generate --prefix web` (requires the `spacetime` CLI). Don't edit
`web/src/module_bindings/` by hand.

An isolated local SpacetimeDB can exercise the module's fake paths, but its
procedures cannot reach a loopback API. See [CURRENT_CONTEXT.md](docs/CURRENT_CONTEXT.md).

## Further reading

- [Agent flow plan](docs/AGENT_FLOW_PLAN.md), [runbook](docs/AGENT_RUNBOOK.md)
  and [verification](docs/AGENT_VERIFICATION.md): coordinator scope, commands
  and checks.
- [Accounts runbook](docs/ACCOUNTS_RUNBOOK.md): shared and preview targets,
  release and restart steps.
- [Menu recommendations](docs/MENU_RECOMMENDATIONS.md),
  [city coverage](docs/CITY_COVERAGE.md) and [maps](docs/GOOGLE_MAPS_PLAN.md).
- [Roadmap](docs/ROADMAP.md), [open tasks](docs/NEXT_TASKS.md),
  [hand-off](docs/HANDOFF.md) and [demo script](docs/DEMO_CHECKLIST.md).
- [Interface proposal](docs/INTERFACE_PROPOSAL.md) and [design direction](Design.md).
- [Legacy verification](docs/MAINCLOUD_VERIFICATION.md): the mathematical path
  only. It does not verify the coordinator.
- [Honesty](docs/HONESTY.md) and [disclosure](docs/DISCLOSURE.md): cached data,
  simulated booking, model limitations and incomplete features.
