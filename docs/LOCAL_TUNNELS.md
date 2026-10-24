# Running api/ and voice/ on this laptop behind Cloudflare tunnels

How to serve the real FastAPI service (`api/`) and the voice service (`voice/`)
from this Mac, expose them with `cloudflared`, and have the Vercel frontend use
them.

We always run the **real API** (`STUB_MODE=false`): Claude parsing, swipe
learning, the Monte Carlo solver, offers and the live council, over the 45
Berkeley places in `data/places.json` ([api/README.md](../api/README.md)). The
API's old stub mode still exists in code for tests, but don't deploy it.
`voice/` has no real mode yet, so it still plays scripted call events and never
places a phone call.

## How the pieces connect

The browser never calls `api/` or `voice/`. It only talks to SpacetimeDB
Maincloud. The **SpacetimeDB module** calls the two Python services, using the
`FASTAPI_BASE_URL` and `VOICE_BASE_URL` values stored in the database's environment.

```
Vercel (web/)  --websocket-->  Maincloud module (huddle-calhacks)
                                   |  FASTAPI_BASE_URL  --> tunnel --> localhost:8000  (api)
                                   |  VOICE_BASE_URL    --> tunnel --> localhost:8001  (voice)
                                   ^
                                   +-- api POSTs live council messages, voice POSTs call events
                                       back to Maincloud (outbound, no tunnel needed)
```

So:

| Where | What to set |
| --- | --- |
| **SpacetimeDB module env** (Maincloud) | `FASTAPI_BASE_URL`, `VOICE_BASE_URL` = the two tunnel URLs, and `STUB_MODE=false`. **This is the main change.** |
| **Vercel env** | Only `NEXT_PUBLIC_SPACETIMEDB_URI` and `NEXT_PUBLIC_SPACETIMEDB_DB`. These don't change when tunnels change. |
| `api/.env` (local, ignored) | `HUDDLE_SHARED_SECRET` matching the module's value, `STUB_MODE=false`, `ANTHROPIC_API_KEY`. |
| `voice/.env` (local, ignored) | The same `HUDDLE_SHARED_SECRET`, `STUB_SCENARIO=confirm`. |

The module's `STUB_MODE=false` is required too. It picks swipe candidates from
its own copy of the catalog: with `true` it sends the nine fixture IDs, and the
real API rejects them.

Never put `HUDDLE_SHARED_SECRET` (or any other secret) in Vercel. Every
`NEXT_PUBLIC_*` value is baked into the public JS bundle.

## Quick path: `scripts/tunnels.sh`

[scripts/tunnels.sh](../scripts/tunnels.sh) runs steps 1–4 below in one command.
It starts the real API and voice service plus both quick tunnels, and checks them
from outside (including that the API reports `"stub":false`). After you confirm,
it publishes `FASTAPI_BASE_URL`, `VOICE_BASE_URL` and `STUB_MODE=false` to the
module, in an `env -i` shell. Ctrl-C stops everything.

```sh
scripts/tunnels.sh                    # run, tunnel, ask, publish
scripts/tunnels.sh --no-publish       # run and tunnel only
scripts/tunnels.sh --unset-on-exit    # on Ctrl-C, unset the URLs so the module falls back to fakes
scripts/tunnels.sh --scenario full --smoke   # voice in "full" mode, then run check_live.py
scripts/tunnels.sh --help
```

The script forces `STUB_MODE=false` for the API whatever `api/.env` says. It
also points the API's live council messages at the same database it publishes
to. Logs go to `logs/tunnels/` (gitignored). Read step 0 first. Vercel (step 5)
is still a one-time manual check. If a tunnel dies, the script exits; rerun it
to get new URLs.

## 0. Before you start

**Coordinate with the team first.** Maincloud now points at Eric Wu's real API
and scripted voice service; current URLs are in [HANDOFF.md](HANDOFF.md).
Changing them moves service traffic onto your laptop for everyone. Keep the old
services running until the new endpoints and configuration have been verified.

What this laptop needs:

- `cloudflared` (`brew install cloudflared`) and the `spacetime` CLI, logged in
  as a database Admin (`spacetime login show`)
- `api/.venv` with the real-API dependencies:
  `api/.venv/bin/python -m pip install -r api/requirements.txt`
- `voice/.venv` ([voice/README.md](../voice/README.md))
- `api/.env` with `HUDDLE_SHARED_SECRET`, `STUB_MODE=false` and
  `ANTHROPIC_API_KEY`. Without the key, parsing falls back to keyword rules and
  the council to the Safe plan.
- `voice/.env` with the same `HUDDLE_SHARED_SECRET`, `STUB_SCENARIO=confirm`,
  and `SPACETIMEDB_URI=https://maincloud.spacetimedb.com` / `SPACETIMEDB_DB=huddle-calhacks`

Check that your local secret matches the one deployed on Maincloud. This
doesn't print the secret or write any data:

```sh
api/.venv/bin/python api/eval/check_shared_secret.py
```

It should report a 401 without credentials and a 400 with them. If it fails,
ask Max or Eric Chen for the deployed value and put it in **both** `api/.env`
and `voice/.env`.

## 1. Start the two services

Run each command in its own terminal tab, from the repo root. `caffeinate`
stops the Mac from sleeping (sleep kills the tunnels).

```sh
# tab 1: api (real mode; SPACETIMEDB_* streams council messages live)
STUB_MODE=false SPACETIMEDB_URI=https://maincloud.spacetimedb.com SPACETIMEDB_DB=huddle-calhacks \
  caffeinate -dis api/.venv/bin/python -m uvicorn api.main:app --host 127.0.0.1 --port 8000 --no-access-log

# tab 2: voice
caffeinate -dis voice/.venv/bin/python -m uvicorn voice.main:app --host 127.0.0.1 --port 8001
```

Both services load their own `.env`. Values you export in the shell override the file.

## 2. Start the tunnels

Quick tunnels need no Cloudflare account. Each process gives you one random URL.

```sh
# tab 3
cloudflared tunnel --no-autoupdate --url http://localhost:8000   # api

# tab 4
cloudflared tunnel --no-autoupdate --url http://localhost:8001   # voice
```

Copy the `https://<words>.trycloudflare.com` URL from each log. The steps below
call them `$API_URL` and `$VOICE_URL`:

```sh
export API_URL=https://....trycloudflare.com
export VOICE_URL=https://....trycloudflare.com
```

The URL changes whenever `cloudflared` restarts. To avoid that, see
[Stable URLs](#optional-stable-urls-with-a-named-tunnel).

## 3. Check the tunnels from outside

```sh
SECRET=$(grep '^HUDDLE_SHARED_SECRET=' api/.env | cut -d= -f2-)
curl -sS -o /dev/null -w '%{http_code}\n' "$API_URL/health"     # expect 401
curl -sS -H "X-Huddle-Secret: $SECRET" "$API_URL/health"        # {"ok":true,"stub":false,"placesLoaded":45}
curl -sS -H "X-Huddle-Secret: $SECRET" "$VOICE_URL/health"      # {"ok":true,"stub":true,"scenario":"confirm"}
FASTAPI_BASE_URL="$API_URL" HUDDLE_SHARED_SECRET="$SECRET" api/.venv/bin/python api/eval/smoke_http.py
unset SECRET
```

If curl can't resolve a brand-new tunnel hostname, macOS has probably cached a
"not found" answer from a lookup made before the record existed. Wait a minute
or run `sudo dscacheutil -flushcache`. Maincloud isn't affected.

## 4. Point the Maincloud module at the tunnels

You're an Admin on `huddle-calhacks`, so use your own login:

```sh
spacetime login show        # should show your account; otherwise run `spacetime login`
```

Then update the two URLs and `STUB_MODE`. An `--env-only` publish keeps every
other stored value and doesn't redeploy the module or touch data.

Watch out: any module variable that is exported in your shell is also sent,
including empty ones. The declared variables are `HUDDLE_SHARED_SECRET`,
`FASTAPI_BASE_URL`, `STUB_MODE`, `VOICE_BASE_URL`, `COUNCIL_ENABLED`,
`AGENT_LANGUAGE` and `STUB_SCENARIO`. Running the command with `env -i` gives it
a clean environment:

```sh
env -i HOME="$HOME" PATH="$PATH" \
  FASTAPI_BASE_URL="$API_URL" VOICE_BASE_URL="$VOICE_URL" STUB_MODE=false \
  spacetime publish huddle-calhacks -s https://maincloud.spacetimedb.com --env-only --no-config
```

The CLI lists the keys it's sending. Check that it shows only those three before
you confirm. If `env -i` makes it ask you to log in again, run the command
without `env -i`, from a fresh terminal where none of the variables above are exported.

Start a **new** huddle afterwards. Groups that were mid-swipe on the old stub
catalog hold place IDs the real API rejects, so they drop into demo mode.

## 5. Vercel

The Vercel project only needs the two public connection values. If they're
already there, **nothing on Vercel changes when you switch tunnels.**

In Vercel, open the project's **Settings → Environment Variables**. For Production
(and Preview, if you use preview deploys), set:

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_SPACETIMEDB_URI` | `https://maincloud.spacetimedb.com` |
| `NEXT_PUBLIC_SPACETIMEDB_DB` | `huddle-calhacks` |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | optional, public `pk.*` token only |

Also check that **Settings → General → Root Directory** is `web` (that's where
`vercel.json` and `vite.config.ts` live).

Vite bakes these values in **at build time**. After adding or changing any of
them, redeploy: open **Deployments**, click the ⋯ menu on the latest deployment
and choose **Redeploy**. If a page says "`NEXT_PUBLIC_SPACETIMEDB_URI` … is not
set", the build ran without them.

(Your local `web/.env.local` points at a local `huddle-dev` database. That only
affects `npm run dev` on this laptop, not Vercel.)

## 6. End-to-end check

Open the Vercel URL on a phone, create a huddle and go through to booking:

- Members can type anything on the prefs screen.
- The council takes 6 to 12 seconds, and its messages appear one by one.
- The voice tab (tab 2) should log one line per call event with a 200 status.

There's also a scripted check against Maincloud. It loads the secret from
`api/.env` and creates a disposable synthetic group:

```sh
api/.venv/bin/python api/eval/check_live.py \
  --server https://maincloud.spacetimedb.com --database huddle-calhacks \
  --voice-base-url "$VOICE_URL" --voice-scenario confirm
```

Look for the "plan came from the api" check and real-mode health: together they
verify Maincloud reached the real API tunnel without module fallback. The smoke
now accepts validated real council output with fewer than nine messages or a
different supplied plan. It checks whole-outing budgets and rejects stale votes,
roulette and booking requests after a re-plan. The confirm scenario injects a
full callback into a separate active test booking; the full scenario requires
restarting the voice service as described below.

Expect this from the real API, too: confidence rarely reaches 0.9 while place
aspects are placeholders, so groups usually move on at the 12-swipe cap.

## Keeping it running

- Keep the laptop plugged in with the lid open (or on an external display).
  `caffeinate` prevents idle sleep, but not lid-close sleep on battery.
- **If a `cloudflared` process restarts**, its URL changes. Repeat steps 3–4 for
  that URL only, e.g. `env -i HOME="$HOME" PATH="$PATH" VOICE_BASE_URL=<new> spacetime publish ...`.
- **If uvicorn restarts**, the tunnel URL stays the same, so there's nothing to republish.
  (To test the full-to-re-plan path, restart only the voice server with
  `STUB_SCENARIO=full`, then switch back to `confirm`.)
- What happens when a tunnel is down but its URL is still configured: once the
  module with `server/src/lib/demo.ts` is published, the affected group switches
  to demo mode (labeled fakes, "Demo mode: cached data" banner, a scripted call)
  and stays there until the host turns demo mode off. Before that publish,
  planning falls back to synthetic module plans with a warning and bookings fail
  with reason `error`.
- Update the URLs in [HANDOFF.md](HANDOFF.md) and the top-level README status
  so teammates know where things live.

## Turning it off

Point the module somewhere else before you shut the laptop:

```sh
# back to the module's built-in fakes
env -i HOME="$HOME" PATH="$PATH" \
  spacetime publish huddle-calhacks -s https://maincloud.spacetimedb.com --env-only --no-config \
  --unset-env FASTAPI_BASE_URL --unset-env VOICE_BASE_URL

# or hand over to another teammate's tunnel (their API must also run STUB_MODE=false)
env -i HOME="$HOME" PATH="$PATH" FASTAPI_BASE_URL=https://<their-url> \
  spacetime publish huddle-calhacks -s https://maincloud.spacetimedb.com --env-only --no-config
```

## Optional: stable URLs with a named tunnel

A named tunnel keeps the same hostnames across restarts, so you configure the
module once. It needs a free Cloudflare account and a domain added to that
account (DNS managed by Cloudflare).

```sh
cloudflared tunnel login                         # pick the domain in the browser
cloudflared tunnel create huddle
cloudflared tunnel route dns huddle huddle-api.<your-domain>
cloudflared tunnel route dns huddle huddle-voice.<your-domain>
```

`~/.cloudflared/config.yml`:

```yaml
tunnel: huddle
credentials-file: /Users/<you>/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: huddle-api.<your-domain>
    service: http://localhost:8000
  - hostname: huddle-voice.<your-domain>
    service: http://localhost:8001
  - service: http_status:404
```

Then one process serves both: `caffeinate -dis cloudflared tunnel run huddle`.
Set `FASTAPI_BASE_URL=https://huddle-api.<your-domain>` and
`VOICE_BASE_URL=https://huddle-voice.<your-domain>` once (step 4).

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Plans say synthetic module fallback / smoke "plan came from the api" fails | `FASTAPI_BASE_URL` is wrong or stale, the API tunnel is down, or the secrets differ (API returns 401). |
| Group shows "Demo mode: cached data" | An API or voice call failed: tunnel down, timeout, 5xx, or a 4xx. `unknown place IDs` in the module logs means the module still has `STUB_MODE=true`; publish `STUB_MODE=false` (step 4) and start a new huddle. Fix the cause, then the host turns demo mode off. |
| API `/health` says `"stub":true` | `STUB_MODE` in `api/.env` isn't `false` and wasn't overridden. Set it and restart uvicorn. |
| Parse warnings say keyword rules were used, or the council always picks Safe | `ANTHROPIC_API_KEY` missing or invalid in `api/.env`. |
| Council panel fills only at the end | The API wasn't started with `SPACETIMEDB_URI` / `SPACETIMEDB_DB`. The transcript still arrives in the response. |
| Booking immediately fails with reason `error` | Voice tunnel down or `VOICE_BASE_URL` stale. |
| Voice log shows `401` posting call events | `voice/.env` secret doesn't match the module's `HUDDLE_SHARED_SECRET`. |
| Voice log shows `400 unknown booking` | Event for a booking that doesn't exist (e.g. a hand-made curl). Expected. |
| Two call transcripts play for one booking | Something sent `X-Huddle-Stub: true` from voice, so the module also replayed its fake. The voice service must not send that header. |
| Vercel page shows the "not set" screen | Vercel env vars missing for that environment, or added without a redeploy. |
| Publish changed more than intended | Other declared variables were exported in the shell. Re-run with `env -i`, and restore any value that changed. |
