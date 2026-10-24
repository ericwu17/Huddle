# Huddle frontend (rough draft)

React 19 + React Router v7 (data mode, `createBrowserRouter`) + Vite + Tailwind. It talks to the SpacetimeDB module in [../server/](../server/) through `spacetimedb/react`. Bare-bones UI for testing the backend; not the final design.

## Current direction October 24

Branch-only account review: [ACCOUNTS_RUNBOOK.md](../docs/ACCOUNTS_RUNBOOK.md)
uses isolated Maincloud `huddle-account-max-check` and local port 5174. `/login`
supports registration/sign-in; `/start` lists only the signed-in account's saved
huddles. Logout revokes the device binding and clears cached group state. Do not
point this branch UI at the shared module before its additive account code is
reviewed and deliberately deployed. Friends, in-app invitation links, private saved defaults and optional preference
sliders are implemented on the isolated branch. See the account runbook for
review steps; no shared rollout before Max approves it. Home text is invitation
intent with reviewed contact matching and a picker-only fallback. `/connectors`
contains optional per-user Google Calendar and host-Mac Messages settings. See
[connector contract](../docs/CONNECTORS_CONTRACT.md); real provider writes remain
unverified. A public branch UI tunnel requires one exact hostname in
`HUDDLE_PREVIEW_HOST`, and both API/module frontend-base settings must target
that same preview database.

Max authorized the combined account/connector/catalog push to main after syncing
`156697c`. Shared backend activation still needs the matching module and API;
a Vercel frontend build alone cannot supply those services. The isolated preview
now has 130 venues. Plan cards read `catalog_venues` for scraped IDs, address,
ratings and source observation dates, keeping the bundled lookup for older IDs.
Menus/photos/takeout/seating from `details.json` remain a follow-up integration.

Read [current product context](../docs/CURRENT_CONTEXT.md) and the
[interface proposal](../docs/INTERFACE_PROPOSAL.md). The illustrated design in `Design.md` guides the UI for
each participant's prompt/clarification, coordinator progress, validated plans,
explanations and group choice. New huddles now use private needs confirmation,
one Claude coordinator, validated plans, current votes and simulated booking.
They have no swipe or numerical confidence screens. Existing groups retain the
legacy flow. See the additive [contract](../docs/AGENT_CONTRACT.md),
[runbook](../docs/AGENT_RUNBOOK.md) and [verification](../docs/AGENT_VERIFICATION.md).

Keep Vite and FastAPI separate locally. For this phase, shared access uses
Vercel, Maincloud and a designated laptop's FastAPI through a public tunnel.
Accept that laptop's availability dependency temporarily; hosted API migration
is deferred. Follow [the approved agent flow](../docs/AGENT_FLOW_PLAN.md) when changing
swipe/progress gates or shared contracts. Accounts and contacts work in the
isolated preview; inferred history, voice input and personal keys remain later
work. Keep raw participant prompts
and private budget caps out of shared agent messages.

## Run against the shared Maincloud backend

Create the ignored `web/.env.local` with these public connection values:

```env
NEXT_PUBLIC_SPACETIMEDB_URI=https://maincloud.spacetimedb.com
NEXT_PUBLIC_SPACETIMEDB_DB=huddle-calhacks
```

From `web/`, run `npm ci` then `npm run dev`. Restart Vite after changing the
file. Never put `HUDDLE_SHARED_SECRET`, Claude or Bright Data keys here. The
optional `NEXT_PUBLIC_MAPBOX_TOKEN` is a public map token only.

FastAPI is reached through SpacetimeDB; the browser does not call its private
endpoints directly. The recorded Maincloud setup uses scripted module booking
with the separate voice service disconnected. See
[the current hand-off](../docs/HANDOFF.md) for service URLs and test status.

## Run against a local backend

An isolated local module can exercise its fake paths. It cannot currently call
a loopback FastAPI from procedures on SpacetimeDB 2.13.0; the private-address
restriction blocks the earlier all-local full stack. See
[current context](../docs/CURRENT_CONTEXT.md) before treating this as a connected
demo. For an already published isolated module, set the public variables to
that explicit local target before starting Vite:

```sh
npm install
cp .env.example .env.local   # NEXT_PUBLIC_SPACETIMEDB_URI / _DB; NEXT_PUBLIC_MAPBOX_TOKEN is optional
npm run dev
```

## When server/ changes

```sh
npm run generate   # rewrites src/module_bindings/ from ../server (needs the spacetime CLI)
```

Don't edit `src/module_bindings/` by hand.

## Current coverage

Eric Chen leads the current UI work; Eric Wu wrote the initial app and owns the
call screen, and Max covers context/contracts and integration verification.
Coordinate overlapping files. The rapid redirect to Vote after council
and the bounce when reopening Plans are fixed in `0d224a5` (`GroupLayout.tsx`
follows each run's status once and leaves phones on Plans). It still needs a
legacy browser check. The new coordinator flow passed two-user desktop/mobile
browser testing, including readable plans, voting and booking after refresh.
The landing page lives in `index.html` and `landing/` and is served
at `/`; the application entry is `/start`.

## Layout

- `index.html` + `landing/`: the landing page at `/`. Its form sends `?name=` to `/start`
- `app.html`: the React app's entry. Every other path is the app (`vite.config.ts` in dev, `vercel.json` on Vercel)
- `src/router.tsx`: routes (`/start`, `/join/:code`, `/g/:groupId/{lobby,prefs,swipe,plans,vote,call,judge}`)
- `src/doodle/`: the stick figures and drawn world, shared by the landing page and the app
- `src/data.ts`: every read. Each hook subscribes to one `my_*` view and maps it to the types in `src/types.ts`
- `src/module_bindings/`: generated client for the module (tables, reducers, procedures)
- `src/types.ts`: contract types (docs/CONTRACT.md S5)
- `src/session.ts`: the SpacetimeDB token (this phone's identity) and the per-group session, in localStorage
- `src/places.ts`: place details for swipe cards, from the same file the module uses
- `src/components/council/`: council panel; `src/components/call/`: call screen
