"""Run the shared smoke test against an explicit backend using private API config.

Creates a disposable synthetic group and booking events in the chosen database.
The voice scenario flag selects assertions; it does not reconfigure the service.
"""

import argparse
import os
from pathlib import Path
import subprocess

from dotenv import load_dotenv


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", required=True)
    parser.add_argument("--database", required=True)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--agent", action="store_true", help="Run the coordinator flow smoke instead of legacy swipes")
    mode.add_argument("--accounts", action="store_true", help="Run the isolated account/membership smoke")
    mode.add_argument("--accounts-flow", action="store_true", help="Run account/friends/invitations, preferences, Claude and simulated booking")
    parser.add_argument("--api-base-url", help="Optional authenticated health checks for the coordinator API")
    parser.add_argument("--voice-base-url")
    parser.add_argument("--voice-scenario", choices=("confirm", "full"), default="confirm")
    args = parser.parse_args()
    if args.voice_scenario == "full" and not args.voice_base_url:
        parser.error("--voice-base-url is required for the full scenario")

    root = Path(__file__).resolve().parents[2]
    load_dotenv(root / "api" / ".env", override=False, interpolate=False)
    if not os.environ.get("HUDDLE_SHARED_SECRET"):
        parser.error("Set HUDDLE_SHARED_SECRET privately in api/.env or the environment")
    env = os.environ.copy()
    env.update(SPACETIMEDB_URI=args.server, SPACETIMEDB_DB=args.database,
               SMOKE_VOICE_SCENARIO=args.voice_scenario)
    if args.api_base_url:
        env["FASTAPI_BASE_URL"] = args.api_base_url
    if args.voice_base_url:
        env["VOICE_BASE_URL"] = args.voice_base_url
    else:
        env.pop("VOICE_BASE_URL", None)
    try:
        runner = "accounts-flow-smoke.mjs" if args.accounts_flow else "accounts-smoke.mjs" if args.accounts else "agent-smoke.mjs" if args.agent else "smoke.mjs"
        result = subprocess.run(["node", str(root / "scripts" / runner)],
                                cwd=root, env=env, timeout=600 if args.accounts_flow else 240)
    except (OSError, subprocess.TimeoutExpired) as err:
        parser.exit(1, f"Smoke runner failed: {type(err).__name__}\n")
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
