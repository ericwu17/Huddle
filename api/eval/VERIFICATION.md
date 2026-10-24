# Phase-zero verification

Verified locally after Max explicitly confirmed the hacking period had started.

- Python 3.12.5; FastAPI 0.116.1; Pydantic 2.11.7; uvicorn 0.35.0; httpx 0.28.1.
- `api/.venv/bin/python -m unittest discover -s api/eval -v`: **21 tests passed**, including private env-file loading, dietary filtering, previews, and the safe authentication checker.
- Started uvicorn on `127.0.0.1:8000` with an ephemeral in-memory shared secret,
  ran `api/.venv/bin/python api/eval/smoke_http.py`: **all eight routes passed**.
  The HTTP runner checked successful auth, missing-auth rejection, synthetic
  labels, repeated JSON equality, and cumulative budgets. Server stopped cleanly.
- Sandbox initially denied the localhost bind. The same HTTP check succeeded
  with approved execution outside the sandbox. No public listener or deployment.
- Default demo: Safe $18 = $12 + $2 + $4; Bold $20 = $13 + $3 + $4;
  Budget $14 = $10 + $1 + $3. All fit every supplied non-null demo cap.
- Tight-cap checks include $17 (only the $14 fixture remains) and $13/zero
  (no fixtures). The $13 case verifies that individually affordable stops do not
  bypass the cumulative outing cap. Null caps are unbounded.
- Boundary checks cover malformed vectors/covariances, negative budgets,
  duplicate IDs, inconsistent totals, excluded places, veto warnings, dietary
  restrictions, windows, travel caps, request-local council delivery, and
  missing-secret/non-stub-mode startup failures.
- No real solver, inference, external model/data calls, or live council was
  implemented. Their behavior is not implied by these fixture checks. Installed the pinned
  requirements into the isolated `api/.venv` using cached package wheels and
  ran the API tests successfully. A new-machine download was not exercised.

The integration follow-up resolves the five caller/API gaps documented in
`api/README.md`. `npm run typecheck --prefix server` passes. Server tests use
the official SpacetimeDB 2.13.0 native in-memory datastore via Vitest (12 tests
with local HTTP enabled; 11 plus one skipped without it). The local
HTTP runner checks four members, four swipes each, preview confidence, automatic
planning, empty offers, roulette, and nine council messages through real module
procedures calling a temporary FastAPI server. It also verifies current caps
after delayed HTTP, private offer acceptance, duplicate transcript replay, and
frontend lookup of all synthetic/real IDs.

No SpacetimeDB host was published, no live backend was modified, and browser
subscriptions, network deployment configuration, and persistence across host
restarts are not covered by the in-memory procedure checks.

The live `huddle-calhacks` call-event route on Maincloud was reachable and
returned 401 to a no-secret request for an impossible booking ID. The user's
exported credential is in a separate terminal and was not available to the
agent's process, so its match against the deployed secret is not claimed here.
`check_shared_secret.py` can verify that match from the user's terminal without
printing credentials or creating an event.

Reproduce with the exact setup/run/check commands in `api/README.md`. The tests
generate fresh credentials at runtime and do not store or print them.
