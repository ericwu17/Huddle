# Disclosure

Every library, API, and AI tool used. Cal Hacks requires this.

## AI tools used to build Huddle

- Claude Code (Anthropic), used by each teammate for code generation and review.
- OpenAI Codex, used for the FastAPI stubs, caller integration fixes, local/live verification, experiment feasibility corrections, and demo documentation.

## APIs and services

| Service | Used for | Part |
| --- | --- | --- |
| SpacetimeDB (local server; Maincloud for the demo) | realtime state, reducers, procedures, HTTP routes | B |
| Anthropic Claude API | preference parsing, review extraction, council, voice dialogue | A, C, D |
| Google Places API (New) | place basics (location, price, hours, phone) | B |
| Bright Data | Google Maps reviews, live scout check | A, B |
| Mapbox | maps, walking routes, leg times | A |
| Twilio Programmable Voice | phone call | D |
| Cartesia | text-to-speech (and possibly speech-to-text) | D |
| Deepgram (if chosen) | speech-to-text | D |

## Libraries

| Library | Part |
| --- | --- |
| spacetimedb (server module + client SDK) | B, A |
| Vite, React, React Router, Tailwind CSS, qrcode.react, Mapbox GL JS, oxlint | A |
| FastAPI, uvicorn, pydantic, numpy, anthropic, httpx | C |
| Vitest and SpacetimeDB 2.13.0 native module test harness | B/C development checks |
| NumPy and Matplotlib | B/C synthetic evaluation, separate from the phase-zero API runtime |
| Pipecat, Silero VAD | D |

Phase-zero API runtime uses FastAPI, uvicorn, Pydantic, and python-dotenv; httpx is used
for checks. No numpy, Anthropic SDK, model calls, or live council are implemented
in that phase. All Python dependencies and their versions are listed under `api/`.
