# Huddle frontend (rough draft)

React 19 + React Router v7 (data mode, `createBrowserRouter`) + Vite + Tailwind. It talks to the SpacetimeDB module in [../server/](../server/) through `spacetimedb/react`. Bare-bones UI for testing the backend; not the final design.

## Run

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

## Layout

- `src/router.tsx`: routes (`/`, `/join/:code`, `/g/:groupId/{lobby,prefs,swipe,plans,vote,call,judge}`)
- `src/data.ts`: every read. Each hook subscribes to one `my_*` view and maps it to the types in `src/types.ts`
- `src/module_bindings/`: generated client for the module (tables, reducers, procedures)
- `src/types.ts`: contract types (docs/CONTRACT.md S5)
- `src/session.ts`: the SpacetimeDB token (this phone's identity) and the per-group session, in localStorage
- `src/places.ts`: place details for swipe cards, from the same file the module uses
- `src/components/council/`: council panel; `src/components/call/`: call screen
