# Huddle voice service: stub phase

`POST /book` (contract S5.4) accepts a booking right away and then posts a scripted
call to SpacetimeDB's `/route/call-event`, one event every 1.2 s, signed with
`X-Huddle-Secret`. No phone call is placed. Twilio and Pipecat (`/twiml`, `/ws`,
`/status`) come later.

| `STUB_SCENARIO` | Events | Effect in the app |
| --- | --- | --- |
| `confirm` (default) | dialing, connected, disclosure, 19:00 taken / 19:45 offered, slot_offered, accept, confirmed 19:45, ended | booking confirmed, group booked |
| `full` | dialing, connected, disclosure, "fully booked", failed `reason: "full"`, ended | booking failed, re-plan starts |

The module only plays its own fake call when `VOICE_BASE_URL` is unset. Once it
points here, this service's `STUB_SCENARIO` decides. The service never sends
`X-Huddle-Stub`: that header makes the module replay its fake on top of ours.

## Run

From the repo root:

```sh
# one time (system python is 3.9; use 3.11+)
python3.13 -m venv voice/.venv
voice/.venv/bin/python -m pip install -r voice/requirements.txt
cp voice/.env.example voice/.env      # fill HUDDLE_SHARED_SECRET (same value as api/.env)
brew install cloudflared

# each session, two terminals
caffeinate -dis voice/.venv/bin/python -m uvicorn voice.main:app --host 127.0.0.1 --port 8001
cloudflared tunnel --no-autoupdate --url http://localhost:8001   # prints https://<random>.trycloudflare.com
```

`caffeinate` keeps the laptop awake. If the tunnel dies, the module quietly falls
back to its own fake call.

Send the tunnel URL to Eric Chen by DM. He runs:

```sh
VOICE_BASE_URL=https://<random>.trycloudflare.com spacetime publish huddle-calhacks -s maincloud --env-only
```

Each `cloudflared` restart gives a new URL, so send it again. To switch scenario,
restart uvicorn only (the URL stays the same): `STUB_SCENARIO=full voice/.venv/bin/python -m uvicorn ...`.
Exported values override `voice/.env`. Switch back to `confirm` afterwards so the
smoke test passes.

## Check

```sh
voice/.venv/bin/python -m unittest discover -s voice/eval -v
SPACETIMEDB_URI=https://maincloud.spacetimedb.com SPACETIMEDB_DB=huddle-calhacks node scripts/smoke.mjs  # after VOICE_BASE_URL is set
```

The uvicorn log prints one line per event with the module's status code. A `400
unknown booking` means the booking ID doesn't exist on the module (for example a
hand-made curl). That call stops; this is expected.
