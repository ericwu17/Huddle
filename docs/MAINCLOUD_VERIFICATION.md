# Maincloud deployment and connected verification

Verified Oct 23, 2026 Pacific (Oct 24 UTC), after syncing main through
`7612d0b2ace075ad16bdd6a39a2ed670c886f97d`.

## Deployment

Published that module source to `huddle-calhacks` on
`https://maincloud.spacetimedb.com` using SpacetimeDB CLI 2.13.0 and
`--delete-data=never --no-config --yes=remote`. The CLI built successfully,
checked for breaking changes and updated the existing database. No data reset.

Only these three environment values were supplied. Other declared module keys
were removed from the publishing subprocess's environment so their stored
values, including `HUDDLE_SHARED_SECRET`, were preserved.

| Setting | Verified deployed value |
| --- | --- |
| `FASTAPI_BASE_URL` | `https://thru-test-meets-radios.trycloudflare.com` |
| `VOICE_BASE_URL` | `https://albert-petition-spouse-itself.trycloudflare.com` |
| `STUB_MODE` | `false` |

These URLs are a record of this run. Both tunnels stopped at 11:56 PM Oct 23
(Pacific); see [HANDOFF.md](HANDOFF.md) for the current state.

Eric Wu supplied the new public URLs; the previously configured tunnels failed
DNS resolution. Management reads confirmed all three settings after publishing.
Authenticated API and module health both report `ok=true`, `stub=false`,
`placesLoaded=45`. Voice reports `ok=true`, `stub=true`, `scenario=confirm`.
Both Python services reject unauthenticated health requests with 401. No secret
values were printed or committed, and no `api/` file was edited or service restarted.

## Results

- Server typecheck passed. Native module tests: **30 passed, one opt-in HTTP
  test skipped**. These cover budget changes during HTTP, stale choices, queued
  dispatch, duplicate dispatch, terminal callbacks, host settings and fallback
  privacy. They use the in-memory datastore, not Maincloud.
- `node --check scripts/smoke.mjs` passed.
- Real API HTTP smoke passed all eight routes through Eric's tunnel. All seven
  POST routes returned 401 for both missing and wrong secrets. Preference
  parsing, changed posteriors, repeatable plan IDs, cumulative caps, offers,
  roulette and council passed. The direct council returned nine messages with
  `fallbackUsed=false` (about 14.9 seconds for that request; not a latency study).
- Connected Maincloud smoke passed twice: groups `7CYW` and `RMBU`. The final
  script passed **44 checks** in `RMBU`, including the two added checks for no
  automatic replacement booking and hidden stale roulette output.
- Four separate generated identities joined, submitted preferences and completed
  12 swipe rounds. Both runs returned Safe/Bold/Budget plans costing **$12 per
  person for the whole outing**, equal to their stop sums and within every
  member's cumulative cap. No module fallback warning; demo mode stayed off.
- Council chose a supplied plan without chair fallback. The first connected run
  had eight messages, the second nine; invalid advocates may be dropped by the
  real API's validator. Public member identifiers and private plan summaries
  stayed hidden. One private offer reached Jordan only.
- Votes, re-voting and roulette passed. Synthetic voice produced one exact
  confirmation event sequence, without duplicate module replay.
- A late injected full/failure callback left the confirmed booking and current
  run intact. A **different active test booking** received an injected full
  callback, causing replacement plans that excluded its restaurant and reopened
  voting. No automatic replacement call occurred.
- Old-run votes, roulette and booking requests were rejected after re-plan;
  old votes and roulette choices were hidden. An explicit new booking cleared
  the re-plan banner. Council callback insertion and deduplication passed.

The final connected log is saved locally at
`/private/tmp/huddle-maincloud-smoke-confirm.log` (temporary, not tracked).

## Repeat the connected smoke

From the repository root, with the matching shared secret already saved privately
in ignored `api/.env`:

```sh
# API_URL / VOICE_URL: the tunnel URLs that scripts/tunnels.sh prints
npm run typecheck --prefix server
npm test --prefix server
node --check scripts/smoke.mjs
api/.venv/bin/python api/eval/check_live.py \
  --server https://maincloud.spacetimedb.com --database huddle-calhacks \
  --voice-base-url "$VOICE_URL" \
  --voice-scenario confirm
```

The helper loads the secret without displaying it. It creates disposable groups
and synthetic booking/event rows in Maincloud. Real API parsing/council can call
Claude; voice is verified synthetic before booking. Update the URL after a
tunnel restart; the test flag does not change the remote voice scenario.

For the direct API smoke, use Eric's existing helper without editing `api/`:

```sh
api/.venv/bin/python - <<'PY'
import os, runpy
from dotenv import dotenv_values
os.environ['HUDDLE_SHARED_SECRET'] = dotenv_values('api/.env')['HUDDLE_SHARED_SECRET']
os.environ['FASTAPI_BASE_URL'] = os.environ['API_URL']
runpy.run_path('api/eval/smoke_http.py', run_name='__main__')
PY
```

## Limits and next check

Use a **new huddle** after the switch; old stub-mode groups hold different place
IDs. This verification covers HTTP/module actions and views, not a browser,
QR joining on four physical phones or visual council navigation. Those UI checks
remain with Eric Chen/the team.

The new deployment's full test **injected** its failure callback. A
voice-originated full sequence was tested earlier against the old stubs; rerun
with Eric's voice service restarted under `STUB_SCENARIO=full`, then restore
`confirm`, to verify that scenario against the real API too. No real phone calls
were made. Review aspects are still placeholder values, travel times estimated,
and scout checks cached. Native tests cover budget-change races; the connected
test checked supplied caps and superseded runs rather than an in-flight cap edit.

Keep both service processes and tunnels awake. Maincloud is hosted; these two
Python services still depend on the laptop hosting them. See
[LOCAL_TUNNELS.md](LOCAL_TUNNELS.md) and [HANDOFF.md](HANDOFF.md).
