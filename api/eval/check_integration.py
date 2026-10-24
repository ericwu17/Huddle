"""Run local FastAPI + real SpacetimeDB module procedures in the native harness.

No database is published. The harness supplies identity, transactions, and tables;
its HTTP responder forwards calls to a temporary localhost FastAPI process.
"""

import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import time

import httpx


def main():
    root = Path(__file__).resolve().parents[2]
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    env = dict(os.environ, HUDDLE_SHARED_SECRET=secrets.token_urlsafe(32),
               STUB_MODE="true", HUDDLE_TEST_API_URL=base)
    env.pop("PLACES_PATH", None)
    server = subprocess.Popen([
        sys.executable, "-m", "uvicorn", "api.main:app", "--host", "127.0.0.1",
        "--port", str(port), "--no-access-log",
    ], cwd=root, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    try:
        for _ in range(50):
            if server.poll() is not None:
                raise RuntimeError("Local API exited during startup")
            try:
                result = httpx.get(base + "/health", headers={"X-Huddle-Secret": env["HUDDLE_SHARED_SECRET"]}, timeout=.5)
                if result.status_code == 200:
                    break
            except httpx.TransportError:
                pass
            time.sleep(.1)
        else:
            raise RuntimeError("Local API startup timed out")
        subprocess.run(["npm", "test"], cwd=root / "server", env=env, check=True)
    finally:
        server.terminate()
        try:
            server.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
            server.communicate()
    print("PASS: local API/module procedure flow; ephemeral test server stopped")


if __name__ == "__main__":
    main()
