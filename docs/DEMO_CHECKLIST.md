# Demo and submission checklist

Owners: Haydn leads narration; Max explains the solver and evaluation; Eric Wu
owns voice; Eric Chen is submission captain, with Max covering backend work.
Confirm coverage if anyone is away. This checklist records readiness, not a claim
that future features already work. Current integration details: [HANDOFF.md](HANDOFF.md).

## Ready now

- [x] SpacetimeDB is live and Max/Eric Wu have Admin access.
- [x] Separate FastAPI and voice stubs passed live synthetic confirm/full tests.
- [x] Full failure excluded the restaurant, reopened voting and did not auto-call.
- [x] Shared-secret, privacy, deterministic fixture and cumulative-budget checks passed.
- [x] Eric Wu reports the deployed Vercel frontend works; this is a teammate report,
  not a new browser test performed by Max.
- [x] Experiment cumulative-budget bug fixed; old chart/numbers withdrawn.
- [x] Corrected baseline CSVs/chart regenerated; no implemented-solver result claimed.

## Before the rehearsal

- [ ] Agree on the exact build to demo and record the deployed Vercel URL.
- [ ] Eric Wu confirms which API features are real and which remain stubs.
- [ ] Record that status in [HONESTY.md](HONESTY.md) and keep visible demo labels accurate.
- [ ] Verify API/voice health, current tunnel URLs and shared-secret matching.
- [ ] Keep both service laptops awake; name who will restart each service/tunnel.
- [ ] Use four phones or four isolated browser profiles, so identities are distinct.
  Separate tabs in one profile share the same token and are not four people.
- [ ] Agree on test preferences supported by the current parser, including a
  vegetarian and different private whole-outing budgets.
- [ ] Prepare a teammate restaurant phone and verify consent/demo-only dialing
  before any real voice test. The existing stub needs no phone call.
- [ ] Decide live voice versus a labeled recording; check the chosen path end to end.

## Full-flow acceptance test (four users)

- [ ] Host creates a new group; three other phones join by code/QR.
- [ ] All four see the same member list and ready-state updates without reloading.
- [ ] Each user submits preferences; each phone sees only its own private inputs.
- [ ] Swipes advance and the confidence display agrees with the current implementation
  (label canned confidence if still synthetic).
- [ ] Plans appear with readable stops, times, map and the sum of all stop costs.
- [ ] Every plan respects every user's non-null cumulative budget, vetoes and dietary needs.
  Include a case where each stop is individually affordable but their sum is not.
- [ ] Council text stays readable and Plans can be reopened after voting begins.
- [ ] Voting updates all phones; changing a vote replaces the previous vote.
- [ ] Booking displays a single ordered event sequence and a clear final result.
- [ ] Run the synthetic full scenario: replacement plans exclude the restaurant,
  voting reopens, and booking another place requires an explicit action.
- [ ] Restore voice to `STUB_SCENARIO=confirm`; rerun the normal synthetic check.
- [ ] Reload one phone and verify it retains its identity/group membership.
- [ ] Check a phone-sized viewport for clipped controls and unreadable text.

Use the repeatable backend smoke command in [api/README.md](../api/README.md#check-the-live-connected-stubs).
It creates disposable synthetic groups; it does not replace the browser rehearsal.

## Three-minute script (draft; rehearse with a clock)

| Time | Owner | Show and say |
| --- | --- | --- |
| 0:00–0:20 | Haydn | “A group can agree on a plan while one person quietly hates it. Huddle makes each person's limits count.” Show the join code. |
| 0:20–1:10 | Haydn + phone driver | Four people join, enter private preferences and swipe. Show the current plan result. If this build uses stubs, say so before presenting the result. |
| 1:10–1:40 | Max | Show the plan cost as the sum of its stops. Explain that every person's outing budget is a hard cap and only its owner can accept a private offer to raise it. Show actual trade offers only if implemented. |
| 1:40–2:15 | Eric Wu | Show the council and vote, then booking. Use the tested synthetic full/re-plan path or the agreed real/recorded path, accurately labeled. Keep a short clip ready if the live path fails. |
| 2:15–2:45 | Max | Explain the implemented decision rule. If showing the experiment chart: “This compares choice rules on simulated tastes with cumulative budgets enforced; it is not a real-user study or a measurement of our solver.” Do not reuse the withdrawn numbers. |
| 2:45–3:00 | Eric Wu | State what works in the demo build and one next step. Finish on the group result. |

Thirty-second backup: join code → private limits → one valid group plan →
confirmed or clearly labeled synthetic booking. Skip the chart if there is no
time to explain its limitations. Never describe a planned feature as working.

## Evaluation release checks (Max)

- [x] Budget, feasibility, malformed-output and stub-rejection regression checks pass.
- [x] Baseline run has zero recorded selected-plan budget violations.
- [x] Simulation README describes redraws, placeholder features and metric limitations.
- [ ] When Eric confirms the real API is ready, run the opt-in comparison described
  in [experiments/README.md](experiments/README.md#reproduce), using separate outputs.
- [ ] Report API failures/empty or invalid plans alongside success-only utility;
  use matched-group paired comparisons.
- [ ] Rerun after place features change; review the method and exact headline claim
  before putting a number on a slide. Do not assume richer data makes the gap larger.

## Submission (Eric Chen captain; confirm a backup)

The team's internal target in the brief is Sunday 7:30 AM Pacific. Confirm the
official deadline, check-in and pitch format with organizers before relying on
the schedule. Sponsor requirements remain subject to booth confirmation.

- [ ] All four teammates are added to the submission.
- [ ] Project title, description, image and working public demo URL are included.
- [ ] GitHub link works in a logged-out browser; final README matches the demo build.
- [ ] Demo video is attached, readable and backed up locally.
- [ ] Tracks are selected only after confirming eligibility and extra submission steps.
- [ ] Actual libraries/services and AI coding tools are disclosed in [DISCLOSURE.md](DISCLOSURE.md).
- [ ] Cached, seeded, simulated, scripted and recorded parts are disclosed in [HONESTY.md](HONESTY.md).
- [ ] Scan the files/history being published for secrets; verify private env files remain ignored.
- [ ] Agree on a code freeze, sync main before pushing, and rerun the final acceptance test.
- [ ] Submission saved, preview checked and confirmation recorded before the deadline.
