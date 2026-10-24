# Disclosure

Every library, API, and AI tool used. Cal Hacks requires this.

## AI tools used to build Huddle

- Claude Code (Anthropic), used by each teammate for code generation and review.

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
| Next.js, React, Tailwind CSS, shadcn/ui, framer-motion, qrcode.react, Mapbox GL JS | A |
| FastAPI, uvicorn, pydantic, numpy, anthropic, httpx | C |
| Pipecat, Silero VAD | D |
