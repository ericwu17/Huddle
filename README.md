# Huddle

Everyone describes what they want. A huddle agent uses the group's prompt context
to suggest an outing, explain the trade-offs and help the group decide.

Cal Hacks 13.0. **Start with [current product and architecture context](docs/CURRENT_CONTEXT.md).**
It supersedes conflicting requirements in the original build brief and task split.

## Current goal

Move from mathematical ranking to Claude-led agents using every participant's
submitted prompt and confirmed needs. Keep deterministic code checks for private
cumulative budgets, confirmed dietary/allergy restrictions, venue facts and stale
choices. The coordinator uses prompts internally; the shared UI does not expose
other members' raw prompts, budget caps or offers.

The implemented flow for new huddles is join -> individual prompts/clarification
and private confirmation -> agent proposals
-> validated itineraries and explanations -> group choice -> visibly scripted
booking/re-plan. New huddles use one Claude coordinator. Legacy endpoints/groups
retain the original mathematical planner for compatibility; new results have no
feature vectors, Bayesian swipe gates or Monte Carlo confidence fields.

The UI direction remains shadcn, Start a huddle as the primary screen, and a
readable agent conversation with plans/voting always accessible. Accounts,
contacts, history, voice input and personal AI keys are staged enhancements.

## Architecture and status

| Component | Current implementation | Shared app target |
| --- | --- | --- |
| Frontend | Vite/React, deployed on Vercel | Keep Vercel; improve the prompt/agent/plan flow |
| State and realtime | SpacetimeDB Maincloud, `huddle-calhacks` | Keep Maincloud; store durable huddle context and current input revisions |
| API and planner | Separate Python FastAPI service on Max's Mac/tunnel | One coordinator, with legacy routes retained |
| Models | Claude API for private needs and coordinator choices | Code validates facts and hard limits; no installed local LLM required |
| Booking | Maincloud's scripted booking path; separate voice service disconnected in the recorded setup | Keep the simulation labeled until real calls are implemented |
| Venue data | 45 bundled Berkeley places on Maincloud today; review aspects are placeholders, scout cached. A Bright Data scrape (936 places) and a 130-venue live catalog are built and committed but not yet published ([go live](docs/BRIGHTDATA.md#go-live)) | Publish the live catalog; feed menus/takeout/seating details to the coordinator |

Keep frontend and API as separate processes during local development. The earlier
fully local database proposal is **blocked as written**: SpacetimeDB 2.13.0
procedure HTTP rejected a reachable loopback endpoint in an isolated test. The
single-laptop proposal is retained as [historical context](docs/SINGLE_LAPTOP_PLAN.md).

The current decision is to keep local FastAPI + a public tunnel + Maincloud and
accept the host laptop's availability dependency temporarily. One operator owns
the shared API URL; others can test from Vercel or their own local frontend.
Hosted API migration is deferred. The earlier [Render preparation](docs/HOSTED_API.md)
has not been deployed or connected to Maincloud.

## Layout

| Path | Owner | What |
| --- | --- | --- |
| `web/` | Eric Chen; coordinate overlapping work | Vite + React app (see [web/README.md](web/README.md)) |
| `server/` | Eric Chen with Max on integration | SpacetimeDB state, private views, jobs and realtime |
| `web/src/components/council/` | Eric Chen | Agent conversation / council panel |
| `web/src/components/call/` | Eric Wu | Call screen |
| `api/` | Eric Wu on implementation; Max on planner/context/contracts and verification | Separate FastAPI service; coordinate file ownership before edits |
| `voice/` | Eric Wu | Scripted service; live phone calls deferred |
| `data/` | Coordinate venue corrections; review pipeline deferred | Place catalog, fakes, caches |
| `docs/` | Max maintaining current context with the team | Context, contracts, roadmap, hand-off and disclosure |
| `scripts/` | Coordinate with Eric Chen and Max | Hosting helpers and connected smoke |

The additive [agent contract](docs/AGENT_CONTRACT.md) describes the new flow.
The [legacy wire contract](docs/CONTRACT.md) remains valid for existing groups.

## Current work

- [Approved agent flow](docs/AGENT_FLOW_PLAN.md): the participant journey and scope.
- [Run the stack](docs/AGENT_RUNBOOK.md) and [verification](docs/AGENT_VERIFICATION.md):
  exact local commands, connected checks and remaining limitations.
- [Roadmap](docs/ROADMAP.md): completed coordinator work and remaining release tasks.
- [Open task breakdown and solo test](docs/NEXT_TASKS.md): UI, Claude behavior,
  Bright Data scraping, shared data integration and rehearsal. Work remains in progress.
- [Hand-off](docs/HANDOFF.md): recorded deployment state and operating notes.
- [Interface proposal](docs/INTERFACE_PROPOSAL.md): staged UI/account changes.
- [Existing verification](docs/MAINCLOUD_VERIFICATION.md): legacy API/module
  budgets, privacy, voting, roulette and simulated booking/re-plan. These checks
  do not establish that the proposed agent planner works.
- [Honesty](docs/HONESTY.md) and [disclosure](docs/DISCLOSURE.md): cached data,
  simulated booking, model limitations and incomplete features.

## Local development

The API hosting configuration uses Python 3.13. After installing its dependencies,
start FastAPI from the repository root:

```sh
.venv/bin/python -m uvicorn api.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

FastAPI loads ignored `api/.env`. It needs the matching `HUDDLE_SHARED_SECRET`
and uses `ANTHROPIC_API_KEY`; never place these in frontend configuration.
It has no API stub mode. The calling module must use `STUB_MODE=false` with
the real catalog. [API implementation and checks](api/README.md).

Start the frontend separately, with the public SpacetimeDB variables described
in [web/README.md](web/README.md):

```sh
npm ci --prefix web
npm run dev --prefix web -- --host 127.0.0.1 --port 5173 --strictPort
```

The app starts at `/start` (`/` redirects there). Maincloud cannot call a
loopback API directly. Existing [tunnel helpers](docs/LOCAL_TUNNELS.md) provide
the current shared API connection. Only the designated host should publish its
new URL; backend developers must not overwrite it with personal test instances.

Module tests can run independently:

```sh
npm ci --prefix server
npm test --prefix server
```

An isolated local database can exercise module/fake paths, but that does not
prove its procedures can reach a local API. See the reproduced networking
blocker and environment distinctions in [CURRENT_CONTEXT.md](docs/CURRENT_CONTEXT.md).
