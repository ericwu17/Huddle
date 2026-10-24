# Huddle frontend (rough draft)

React 19 + React Router v7 (data mode, `createBrowserRouter`) + Vite + Tailwind. It talks to the SpacetimeDB module in [../server/](../server/) through `spacetimedb/react`. Bare-bones UI for testing the backend; not the final design.

## Run against the shared Maincloud backend

Create the ignored `web/.env.local` with these public connection values:

```env
NEXT_PUBLIC_SPACETIMEDB_URI=https://maincloud.spacetimedb.com
NEXT_PUBLIC_SPACETIMEDB_DB=huddle-calhacks
```

From `web/`, run `npm ci` then `npm run dev`. Restart Vite after changing the
file. Never put `HUDDLE_SHARED_SECRET`, Claude or Bright Data keys here. The
optional `NEXT_PUBLIC_MAPBOX_TOKEN` is a public map token only.

Max's FastAPI and Eric Wu's voice service are reached through SpacetimeDB; the
browser does not call their private endpoints directly. See
[the current hand-off](../docs/HANDOFF.md) for service URLs and test status.

## Run against a local backend

Publish the module locally first (see [../README.md](../README.md)), then:

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

Haydn owns core frontend/routing; Eric Wu wrote the initial app and owns the call
screen, and Eric Chen owns the council panel. Max is covering backend/council
integration while Eric Chen is away. The rapid redirect to Vote after council
and the bounce when reopening Plans are fixed in `0d224a5` (`GroupLayout.tsx`
follows each run's status once and leaves phones on Plans). It still needs a
browser check. The static landing page lives in `public/landing/` and is served
at `/landing`.

## Layout

- `src/router.tsx`: routes (`/`, `/join/:code`, `/g/:groupId/{lobby,prefs,swipe,plans,vote,call,judge}`)
- `src/data.ts`: every read. Each hook subscribes to one `my_*` view and maps it to the types in `src/types.ts`
- `src/module_bindings/`: generated client for the module (tables, reducers, procedures)
- `src/types.ts`: contract types (docs/CONTRACT.md S5)
- `src/session.ts`: the SpacetimeDB token (this phone's identity) and the per-group session, in localStorage
- `src/places.ts`: place details for swipe cards, from the same file the module uses
- `src/components/council/`: council panel; `src/components/call/`: call screen
