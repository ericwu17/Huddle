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

`caffeinate` keeps the laptop awake. If a configured voice tunnel dies, the
module records the booking as failed with reason `error`. Its built-in fake
sequence is used only when `VOICE_BASE_URL` is unset.

Send the tunnel URL to Max (covering backend integration while Eric Chen is
away), or Eric Chen. Max and Eric Wu are now Admin collaborators on
`huddle-calhacks`; use your own CLI login. Max's CLI 2.13.0 and login are ready,
and management reads are verified. Max set `VOICE_BASE_URL` with an
environment-only publish and verified the API URL/stub mode stayed unchanged.
For a new tunnel URL, an administrator updates only that setting (keep other
module configuration out of the publishing shell):

```sh
VOICE_BASE_URL=https://<random>.trycloudflare.com spacetime publish huddle-calhacks -s https://maincloud.spacetimedb.com --env-only --no-config
```

Each `cloudflared` restart gives a new URL, so send it again. To switch scenario,
restart uvicorn only (the URL stays the same): `STUB_SCENARIO=full voice/.venv/bin/python -m uvicorn ...`.
Exported values override `voice/.env`. Switch back to `confirm` afterwards and
rerun the confirm smoke check.

## Check

```sh
voice/.venv/bin/python -m unittest discover -s voice/eval -v
api/.venv/bin/python api/eval/check_live.py \
  --server https://maincloud.spacetimedb.com --database huddle-calhacks \
  --voice-base-url https://restaurants-availability-barbie-lil.trycloudflare.com \
  --voice-scenario confirm
```

The live helper loads the matching shared secret privately from `api/.env`
(exported values win) and creates a disposable synthetic group/bookings.
After restarting the voice API in full mode, use `--voice-scenario full` to
verify voice-originated failure, restaurant exclusion, reopened voting and no
automatic replacement call. The flag does not switch the service's mode.
Restore the API to confirm afterwards; keep the tunnel running throughout.

The uvicorn log prints one line per event with the module's status code. A `400
unknown booking` means the booking ID doesn't exist on the module (for example a
hand-made curl). That call stops; this is expected.

## Current status

The stub is connected at
`https://restaurants-availability-barbie-lil.trycloudflare.com`. All six unit
tests passed in Max's Python environment. Live Maincloud checks passed both
confirm and voice-originated full-to-re-plan, each with exactly one event
sequence. The full case excluded the restaurant, reopened voting and did not
start another booking automatically. The final check verified the service was
restored to `STUB_SCENARIO=confirm`. No Twilio, Pipecat or real call was exercised.
Keep the voice server and tunnel running while teammates test.
