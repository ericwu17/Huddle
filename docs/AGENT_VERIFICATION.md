# Coordinator verification, October 24, 2026

Implemented against main `e6412cc` (Demo NPCs), fetched again before shared
publication with no newer main commits. Max subsequently requested direct release
to main for teammate testing. Git/Vercel release status is reported separately;
these runtime checks do not by themselves establish a frontend deployment.

## Runtime and publication

- API: Python 3.13.16, root `.venv`, port 8000 on Max's Mac, real Claude credentials
  loaded privately from ignored `api/.env`. No new secret values are documented.
- Public API tunnel: `https://roughly-metabolism-representing-harmony.trycloudflare.com`.
  A restart normally changes it. Public health rejects absent/wrong secrets.
- First deployed and tested in isolated Maincloud module `huddle-agent-max-check`.
  Then published the same additive backend to `huddle-calhacks`, with
  `--delete-data=never --no-config`. Four private agent tables and two views were
  added; no legacy table reset/reshape was required. Existing shared secret and
  unrelated environment values were preserved. Only `FASTAPI_BASE_URL` and
  `STUB_MODE=false` were supplied for the shared publication.
- Vite: port 5173, public connection variables explicitly target `huddle-calhacks`.
  LAN entry: `http://10.0.20.127:5173/start`. Devices must reach Max's laptop on
  that network. Vercel still needs the updated frontend release.

## Checks and results

| Check | Result |
| --- | --- |
| Python unit/HTTP suite | 38 passed, including 11 coordinator tests |
| Backend typecheck | Passed |
| Backend native tests | 41 passed, one opt-in HTTP test skipped |
| Frontend production build and lint | Passed |
| Isolated Maincloud coordinator smoke, real Claude | 38 checks passed; synthetic group `75C6` |
| Shared `huddle-calhacks` coordinator smoke, real Claude | 38 checks passed; synthetic group `E56H` |
| Two independent browser identities, desktop and mobile viewport | Joined, interpreted/confirmed private needs, host requested plans, voted, simulated booking and refresh persistence passed; group `8BLR` on isolated module |
| Browser diagnostics | No JavaScript page errors; no mobile horizontal overflow at 390px |
| Shared-module local UI after cutover | Created a new agent group; direct legacy `/swipe` navigation redirected to private needs |

The connected smoke exercises authentication, owner-only private needs, all-member
confirmation, host-only generation, real choices without numerical confidence,
exact cumulative costs under every cap, public fact explanations without private
markers, explicit public discussion, separate-group isolation, complete votes,
host-only simulated booking, duplicate rejection, budget-edit invalidation,
stale votes/Spin rejection, a lower-cap replan, and an injected full callback
followed by replacement plans excluding that venue without automatic booking.
Native tests additionally cover stale interpretation/planning replies, protected
caps established only on owner confirmation, missing allergy evidence, invalid
totals, equal-weight tied Spin with inclusive random-index bounds, revotes and
late booking callbacks. Python tests use a fake model; connected checks use real
Claude calls and synthetic people, not invented model results.

Browser testing found and fixed Join being usable before the database connection
was ready. A live interpretation also asked an unnecessary blocking question
about a soft short-trip preference; the interpretation instruction was corrected
before the passing connected and browser runs. New agent groups keep readable
plans available instead of jumping immediately to Vote.

## Limits of this evidence

This is functional verification, not load testing or a physical-phone rehearsal.
Calls/reservations are simulated. Catalog prices and availability are cached;
travel is estimated. There is no verified allergen/cross-contact evidence, so
allergy requirements block planning. Review-aspect matching, ingredients, actual
costs and global optimality are not established. Claude choices can vary across
runs; deterministic code validates their facts and constraints. No mathematical
satisfaction or fairness improvement is claimed. Legacy planner evaluation does
not measure this replacement. Old endpoints/groups remain compatible.

The existing large frontend bundle warning and Python test stream ResourceWarnings
remain non-fatal; build/lint/tests completed successfully. The API and tunnel
still depend on Max's awake, connected laptop. See [runbook](AGENT_RUNBOOK.md)
for restart and verification commands, and [contract](AGENT_CONTRACT.md) for
integration details.
