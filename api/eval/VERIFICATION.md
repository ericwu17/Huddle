# Phase-zero verification

Verified locally after Max explicitly confirmed the hacking period had started.

- Python 3.12.5; FastAPI 0.116.1; Pydantic 2.11.7; uvicorn 0.35.0; httpx 0.28.1.
- `api/.venv/bin/python -m unittest discover -s api/eval -v`: **15 tests passed**.
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
- No real solver, inference, external model/data calls, live council, or
  SpacetimeDB integration was tested or implemented. Their behavior is not
  implied by these fixture checks. During PR preparation, installed the pinned
  requirements into the isolated `api/.venv` using cached package wheels and
  reran all 15 tests successfully. A new-machine download was not exercised.

Source-level integration review against Eric's `2a98c18` found no overlapping
API edits. Known runtime handoff blockers are recorded in `api/README.md`;
SpacetimeDB was not launched or tested as part of this API-only verification.

Reproduce with the exact setup/run/check commands in `api/README.md`. The tests
generate fresh credentials at runtime and do not store or print them.
