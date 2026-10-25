# Disclosure

Every library, API, and AI tool used. Cal Hacks requires this. Updated
October 24, 2026. Simulated and incomplete parts are listed in [HONESTY.md](HONESTY.md).

## AI tools used to build Huddle

- Claude Code (Anthropic), used by each teammate for code generation and review.
- OpenAI Codex, used for the FastAPI stubs, caller integration fixes, local/live
  verification, experiment feasibility corrections, and demo documentation.

## AI inside the product

Huddle calls the Anthropic Claude API at runtime. Model IDs are set on the API
host with `CLAUDE_MODEL_FAST` and `CLAUDE_MODEL_SMART`; the code defaults to Claude
Haiku 5.5 for both. Confirm the shared API host's values before submitting.

| Use | Model setting |
| --- | --- |
| Reading each member's private needs and optional prompt | `CLAUDE_MODEL_FAST` |
| Coordinator choosing plans, menu orders and explanations | `CLAUDE_MODEL_SMART` |
| Matching an invitation request to friends; choosing one common time from connected calendars' free slots | `CLAUDE_MODEL_FAST` |
| Extracting menus from venue websites (one-time data collection) | `CLAUDE_MODEL_SMART`, default Claude Opus 5.5 |
| Legacy groups only: preference parsing, council advocates and chair | `CLAUDE_MODEL_FAST` / `CLAUDE_MODEL_SMART` |

Claude does not make phone calls; voice calls are not implemented.

## APIs and services

| Service | Used for | Status |
| --- | --- | --- |
| SpacetimeDB Maincloud | realtime state, reducers, procedures, private views, HTTP routes | in use |
| Vercel | hosting the web app | in use |
| Anthropic Claude API | see above | in use |
| Bright Data | Web Scraper API: Google Maps discovery of Berkeley places (ratings, review counts, hours). Web Unlocker: fetching venue menu pages | one-time collection on October 24 |
| Google Places API (New) | place basics (location, price level, hours, phone); takeout, dine-in, outdoor seating and attributed photos | one-time collection; photos served from Google |
| Google OAuth and Google Calendar API | opt-in account connection, free/busy lookup, meetup event creation | implemented; real group use not verified |
| Apple Messages and Contacts (macOS scripting) | opt-in invitation sending and contact lookup on the host Mac | disabled on the shared deployment; delivery unverified |
| OpenStreetMap tiles (via Leaflet) | street map when no Mapbox token is set | in use |
| Mapbox GL JS | map, when a Mapbox token is configured | optional |
| OSRM foot router (routing.openstreetmap.de, run by FOSSGIS) | walking route lines on the map | in use; display only |
| Cloudflare quick tunnels (`cloudflared`) | exposing the laptop-hosted API to Maincloud | in use |

Planned but **not used** in the demo build: Twilio Programmable Voice, Cartesia,
Deepgram, Pipecat and Silero VAD (live restaurant calls), and Render (hosted API).

## Libraries

| Library | Part |
| --- | --- |
| spacetimedb 2.13.0 (server module and client SDK) | server, web |
| React, React DOM, React Router, Vite, Tailwind CSS, Leaflet, Mapbox GL JS, TypeScript, oxlint | web |
| FastAPI, uvicorn, Pydantic, python-dotenv, NumPy, Anthropic Python SDK, httpx, FastAPI Users (Argon2 password hashing), google-auth-oauthlib, cryptography | API (`api/requirements.txt`) |
| FastAPI, uvicorn, Pydantic, python-dotenv, httpx | scripted voice stub (`voice/requirements.txt`) |
| Anthropic Python SDK, pypdf | data collection (`data/reviews/requirements.txt`) |
| NumPy, Matplotlib | synthetic evaluation (`docs/experiments/`) |
| Vitest and the SpacetimeDB native module test harness | development checks |

Exact versions are pinned in each `requirements.txt` and `package-lock.json`.
