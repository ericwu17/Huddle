#!/usr/bin/env bash
# Run the API (api/) and the voice service (voice/) on this
# laptop, expose them with Cloudflare quick tunnels, and point the SpacetimeDB
# module at them (FASTAPI_BASE_URL, VOICE_BASE_URL, and STUB_MODE=false so the
# module swipes over the same real catalog). Background: docs/LOCAL_TUNNELS.md.
#
# Usage: scripts/tunnels.sh [options]   (from anywhere; Ctrl-C stops everything)
#   --server URL         SpacetimeDB host URL   (default https://maincloud.spacetimedb.com)
#   --database NAME      database to configure  (default huddle-calhacks)
#   --scenario S         voice STUB_SCENARIO override: confirm | full (default: voice/.env)
#   --no-publish         start services and tunnels only; leave the module env alone
#   --yes, -y            don't ask before publishing the new URLs (skips both this script's
#                        prompt and spacetime's, and never stops for a login; use under systemd)
#   --smoke              run api/eval/check_live.py after publishing (writes a disposable group;
#                        its two council checks were written for the old stubs and can fail)
#   --unset-on-exit      on exit, unset both URLs so the module falls back to its fakes
#   --pull-every SECS    git pull (fast-forward only) this often, and restart the api and voice
#                        when it brings new commits; the tunnels and their URLs stay up
#                        (default 10; 0 turns it off). Changes to this script need a rerun.
#
# Secrets stay in api/.env and voice/.env (gitignored) and are never printed.
# Runs on macOS and Linux. Requires bash 3.2+ (macOS default), git, cloudflared,
# spacetime, curl, and the api/.venv and voice/.venv virtualenvs (dig is optional).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SERVER=https://maincloud.spacetimedb.com
DATABASE=huddle-calhacks
SCENARIO=
PUBLISH=1
ASSUME_YES=0
SMOKE=0
UNSET_ON_EXIT=0
PULL_EVERY=10
API_PORT=8000
VOICE_PORT=8001

while [ $# -gt 0 ]; do
  case "$1" in
    --server) SERVER="$2"; shift 2 ;;
    --database) DATABASE="$2"; shift 2 ;;
    --scenario) SCENARIO="$2"; shift 2 ;;
    --no-publish) PUBLISH=0; shift ;;
    --yes|-y) ASSUME_YES=1; shift ;;
    --smoke) SMOKE=1; shift ;;
    --unset-on-exit) UNSET_ON_EXIT=1; shift ;;
    --pull-every) PULL_EVERY="$2"; shift 2 ;;
    -h|--help) sed -n '2,23p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1 (try --help)" >&2; exit 2 ;;
  esac
done

case "$SCENARIO" in ""|confirm|full) ;; *) echo "--scenario must be confirm or full" >&2; exit 2 ;; esac
[ "$SMOKE" = 1 ] && [ "$PUBLISH" = 0 ] && { echo "--smoke needs the URLs published; drop --no-publish" >&2; exit 2; }
case "$PULL_EVERY" in ""|*[!0-9]*) echo "--pull-every must be a whole number of seconds" >&2; exit 2 ;; esac

LOG_DIR="$ROOT/logs/tunnels"
mkdir -p "$LOG_DIR"

say() { printf '\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

# ---------- preflight ----------

for cmd in git cloudflared spacetime curl; do
  command -v "$cmd" >/dev/null || die "$cmd not found on PATH"
done
[ -x api/.venv/bin/python ] || die "api/.venv missing; see api/README.md"
[ -x voice/.venv/bin/python ] || die "voice/.venv missing; see voice/README.md"
[ -f api/.env ] || die "api/.env missing; copy api/.env.example and fill it in"
[ -f voice/.env ] || die "voice/.env missing; copy voice/.env.example and fill it in"

env_value() { grep -E "^$2=" "$1" | tail -n1 | cut -d= -f2- || true; }
SECRET="$(env_value api/.env HUDDLE_SHARED_SECRET)"
[ -n "$SECRET" ] || die "HUDDLE_SHARED_SECRET is empty in api/.env"
[ "$SECRET" = "$(env_value voice/.env HUDDLE_SHARED_SECRET)" ] \
  || die "HUDDLE_SHARED_SECRET differs between api/.env and voice/.env"

[ -f data/places.json ] || die "data/places.json missing; the real API serves it"
api/.venv/bin/python -c "import numpy, anthropic" 2>/dev/null \
  || die "api/.venv lacks the real-API deps; run: api/.venv/bin/python -m pip install -r api/requirements.txt"
if [ -z "$(env_value api/.env ANTHROPIC_API_KEY)" ] && [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "warning: no ANTHROPIC_API_KEY; parsing falls back to keyword rules and the council to Safe" >&2
fi

voice_db="$(env_value voice/.env SPACETIMEDB_DB)"
if [ -n "$voice_db" ] && [ "$voice_db" != "$DATABASE" ]; then
  die "voice/.env posts call events to '$voice_db' but you're configuring '$DATABASE'"
fi

for port in "$API_PORT" "$VOICE_PORT"; do
  # bash's /dev/tcp works on macOS and Linux without lsof or ss
  if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
    die "port $port is already in use (another uvicorn or a previous run?)"
  fi
done

if [ "$PUBLISH" = 1 ]; then
  spacetime login show >/dev/null 2>&1 || die "not logged in to spacetime; run 'spacetime login'"
fi

# ---------- process management ----------

PIDS=""
PUBLISHED=0

cleanup() {
  trap - EXIT INT TERM
  echo
  if [ "$UNSET_ON_EXIT" = 1 ] && [ "$PUBLISHED" = 1 ]; then
    say "Unsetting FASTAPI_BASE_URL and VOICE_BASE_URL on $DATABASE"
    clean_env spacetime publish "$DATABASE" -s "$SERVER" --env-only --no-config --yes=remote \
      --unset-env FASTAPI_BASE_URL --unset-env VOICE_BASE_URL \
      || echo "unset failed; do it by hand (docs/LOCAL_TUNNELS.md, 'Turning it off')" >&2
  elif [ "$PUBLISHED" = 1 ]; then
    echo "Note: $DATABASE still points at these tunnels, which are now gone."
    echo "      Bookings and plans will fail over to fakes/errors until you repoint it"
    echo "      (docs/LOCAL_TUNNELS.md, 'Turning it off')."
  fi
  say "Stopping services and tunnels"
  for pid in $PIDS; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# start NAME CMD... : run in the background, append to logs/tunnels/NAME.log
start() {
  local name="$1"; shift
  "$@" >>"$LOG_DIR/$name.log" 2>&1 &
  PIDS="$PIDS $!"
  eval "PID_$name=$!"
}

# Run spacetime with only the given variables, so declared module env keys that
# happen to be exported in this shell aren't published too.
clean_env() {
  env -i HOME="$HOME" PATH="$PATH" TERM="${TERM:-xterm}" USER="${USER:-}" "$@"
}

# curl_out URL ARGS... : curl that resolves trycloudflare hosts via 1.1.1.1. macOS
# caches the NXDOMAIN from any lookup made before a fresh quick-tunnel record exists.
curl_out() {
  local url="$1" host ip; shift
  host="${url#https://}"; host="${host%%/*}"
  case "$host" in
    *.trycloudflare.com)
      ip="$(dig +short +time=3 "$host" @1.1.1.1 2>/dev/null | grep -E '^[0-9.]+$' | head -n1 || true)"
      [ -n "$ip" ] && set -- --resolve "$host:443:$ip" "$@" ;;
  esac
  curl "$@" "$url"
}

# wait_health NAME URL : poll an authenticated /health until it answers 200
wait_health() {
  local name="$1" url="$2" i
  for i in $(seq 1 60); do
    if curl_out "$url/health" -fsS -m 5 -o /dev/null -H "X-Huddle-Secret: $SECRET" 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  echo "$name did not become healthy at $url (see $LOG_DIR/$name.log)" >&2
  return 1
}

# local_health : both local services answer, and the api is the real one
local_health() {
  wait_health api "http://127.0.0.1:$API_PORT" || return 1
  wait_health voice "http://127.0.0.1:$VOICE_PORT" || return 1
  curl -fsS -m 5 -H "X-Huddle-Secret: $SECRET" "http://127.0.0.1:$API_PORT/health" | grep -q '"stub":false' \
    || { echo "api reports stub mode; an old api version is running (see $LOG_DIR/api.log)" >&2; return 1; }
}

start_services() {
  # Exported values beat api/.env. SPACETIMEDB_* lets the council stream messages live.
  start api env SPACETIMEDB_URI="$SERVER" SPACETIMEDB_DB="$DATABASE" \
    api/.venv/bin/python -m uvicorn api.main:app --host 127.0.0.1 --port "$API_PORT" --no-access-log
  if [ -n "$SCENARIO" ]; then
    start voice env STUB_SCENARIO="$SCENARIO" \
      voice/.venv/bin/python -m uvicorn voice.main:app --host 127.0.0.1 --port "$VOICE_PORT"
  else
    start voice voice/.venv/bin/python -m uvicorn voice.main:app --host 127.0.0.1 --port "$VOICE_PORT"
  fi
}

# stop_services : stop the api and voice and wait for their ports to free up; tunnels keep running
stop_services() {
  local pid rest="" i
  for pid in $PIDS; do
    [ "$pid" = "$PID_api" ] || [ "$pid" = "$PID_voice" ] || rest="$rest $pid"
  done
  kill "$PID_api" "$PID_voice" 2>/dev/null || true
  # uvicorn's graceful shutdown waits on open requests; give it 10s, then force it
  for i in $(seq 1 10); do
    kill -0 "$PID_api" 2>/dev/null || kill -0 "$PID_voice" 2>/dev/null || break
    sleep 1
  done
  kill -9 "$PID_api" "$PID_voice" 2>/dev/null || true
  wait "$PID_api" 2>/dev/null || true
  wait "$PID_voice" 2>/dev/null || true
  PIDS="$rest"
}

# pull_updates : fast-forward to upstream; succeeds only when HEAD moved
PULL_FAILING=0
pull_updates() {
  local before after changed
  before="$(git rev-parse HEAD)"
  if ! GIT_TERMINAL_PROMPT=0 GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh} -o BatchMode=yes" \
      git pull --ff-only --quiet >>"$LOG_DIR/git.log" 2>&1; then
    [ "$PULL_FAILING" = 1 ] || echo "warning: git pull failed (see $LOG_DIR/git.log); keeping the running code" >&2
    PULL_FAILING=1
    return 1
  fi
  PULL_FAILING=0
  after="$(git rev-parse HEAD)"
  [ "$before" != "$after" ] || return 1
  say "Pulled $(git rev-list --count "$before..$after") new commit(s), now at $(git log -1 --format='%h %s')"
  changed="$(git diff --name-only "$before" "$after")"
  if grep -Eq '(^|/)requirements[^/]*\.txt$' <<<"$changed"; then
    echo "warning: requirements changed; reinstall into api/.venv or voice/.venv if the restart fails" >&2
  fi
  if grep -qx 'scripts/tunnels.sh' <<<"$changed"; then
    echo "note: scripts/tunnels.sh changed; this run keeps the old version until you rerun it" >&2
  fi
}

# tunnel_url NAME : read the quick-tunnel URL from cloudflared's log once it has registered
tunnel_url() {
  local name="$1" i url
  for i in $(seq 1 60); do
    url="$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG_DIR/$name.log" 2>/dev/null \
      | grep -v '//api\.' | head -n1 || true)"
    if [ -n "$url" ] && grep -q "Registered tunnel connection" "$LOG_DIR/$name.log"; then
      echo "$url"; return 0
    fi
    sleep 1
  done
  die "no tunnel URL from cloudflared (see $LOG_DIR/$name.log)"
}

# ---------- run ----------

# Fresh logs for this run; restarts append to them.
for name in caffeinate api voice api_tunnel voice_tunnel git; do : >"$LOG_DIR/$name.log"; done

# Keep a Mac awake for as long as this script runs (lid-close on battery still sleeps).
if command -v caffeinate >/dev/null; then
  start caffeinate caffeinate -dis -w $$
fi

say "Starting the api on :$API_PORT and voice on :$VOICE_PORT (logs in logs/tunnels/)"
start_services
local_health || die "the local services did not come up"

say "Opening Cloudflare quick tunnels"
start api_tunnel cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$API_PORT"
start voice_tunnel cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$VOICE_PORT"
API_URL="$(tunnel_url api_tunnel)"
VOICE_URL="$(tunnel_url voice_tunnel)"

say "Checking tunnels from outside (DNS can take a few seconds)"
wait_health api "$API_URL" || die "the api tunnel is not reachable"
wait_health voice "$VOICE_URL" || die "the voice tunnel is not reachable"
code="$(curl_out "$API_URL/health" -sS -m 10 -o /dev/null -w '%{http_code}' || true)"
[ "$code" = 401 ] || die "api tunnel answered $code without a secret; expected 401"
echo "    api:   $API_URL  ($(curl_out "$API_URL/health" -fsS -m 10 -H "X-Huddle-Secret: $SECRET"))"
echo "    voice: $VOICE_URL  ($(curl_out "$VOICE_URL/health" -fsS -m 10 -H "X-Huddle-Secret: $SECRET"))"

if [ "$PUBLISH" = 1 ]; then
  say "Publishing both URLs and STUB_MODE=false to $DATABASE on $SERVER"
  echo "    Env only: the module code and data are untouched."
  if [ "$ASSUME_YES" = 0 ]; then
    echo "    This repoints the live backend for everyone using $DATABASE."
    echo "    Groups already mid-swipe on the stub catalog will drop into demo mode; start new ones."
    read -r -p "    Continue? [y/N] " answer
    case "$answer" in y|Y|yes) ;; *) echo "    Skipped. Services and tunnels keep running."; PUBLISH=0 ;; esac
  fi
fi
if [ "$PUBLISH" = 1 ]; then
  yes_flag=""
  [ "$ASSUME_YES" = 1 ] && yes_flag="--yes=remote,skip-login"
  clean_env FASTAPI_BASE_URL="$API_URL" VOICE_BASE_URL="$VOICE_URL" STUB_MODE=false \
    spacetime publish "$DATABASE" -s "$SERVER" --env-only --no-config $yes_flag \
    || die "spacetime publish failed; the module env is unchanged"
  PUBLISHED=1
fi

if [ "$SMOKE" = 1 ]; then
  say "Running the live smoke check"
  api/.venv/bin/python api/eval/check_live.py --server "$SERVER" --database "$DATABASE" \
    --voice-base-url "$VOICE_URL" --voice-scenario "${SCENARIO:-$(env_value voice/.env STUB_SCENARIO)}" \
    || echo "smoke check failed; services keep running so you can investigate" >&2
fi

say "Up. Ctrl-C to stop. Tail logs with: tail -f logs/tunnels/*.log"
[ "$PULL_EVERY" -gt 0 ] && echo "    Pulling every ${PULL_EVERY}s; new commits restart the api and voice."

# Exit (and clean up) as soon as a tunnel dies; bash 3.2 has no wait -n. With
# pulling on, a dead service leaves the tunnels up and waits for a fix to land.
SERVICES_DOWN=0
LAST_PULL=$SECONDS
while :; do
  for name in api_tunnel voice_tunnel; do
    eval "pid=\$PID_$name"
    if ! kill -0 "$pid" 2>/dev/null; then
      die "$name exited (see $LOG_DIR/$name.log). A restarted tunnel gets a new URL, so rerun this script."
    fi
  done
  if [ "$SERVICES_DOWN" = 0 ]; then
    for name in api voice; do
      eval "pid=\$PID_$name"
      kill -0 "$pid" 2>/dev/null && continue
      [ "$PULL_EVERY" -gt 0 ] || die "$name exited (see $LOG_DIR/$name.log)"
      echo "warning: $name exited (see $LOG_DIR/$name.log); tunnels stay up, restarting after the next pulled commit" >&2
      SERVICES_DOWN=1
      break
    done
  fi
  if [ "$PULL_EVERY" -gt 0 ] && [ $((SECONDS - LAST_PULL)) -ge "$PULL_EVERY" ]; then
    LAST_PULL=$SECONDS
    if pull_updates; then
      say "Restarting the api and voice (tunnels stay up)"
      stop_services
      for name in api voice; do printf '\n==> restart at %s\n' "$(date '+%F %T')" >>"$LOG_DIR/$name.log"; done
      start_services
      SERVICES_DOWN=0
      if local_health; then
        say "Restarted on $(git log -1 --format=%h)"
      else
        echo "warning: the restart is unhealthy; tunnels stay up until a fix is pulled" >&2
      fi
    fi
  fi
  sleep 5
done
