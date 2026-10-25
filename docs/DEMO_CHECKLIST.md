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
  One-phone alternative: start a huddle on your phone, then run
  `node scripts/demo-friends.mjs <CODE>` on a laptop. Sam, Jordan and Riley join,
  write their own private preferences, swipe, answer offers and vote; you play Alex.
  Say on stage that the other three are simulated (see HONESTY.md).
- [ ] Agree on test preferences supported by the current parser, including a
  vegetarian and different private whole-outing budgets.
- [ ] Prepare a teammate restaurant phone and verify consent/demo-only dialing
  before any real voice test. The existing stub needs no phone call.
- [ ] Decide live voice versus a labeled recording; check the chosen path end to end.
- [ ] Coordinate deployment of Eric Chen's demo-mode safety net (`059292a`), then
  verify a dead-service fallback and its visible label in an isolated test setup.
  This code was merged; Max has not published the new module to Maincloud.

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

Use the repeatable backend smoke command in [api/README.md](../api/README.md#check-the-live-deployment).
It creates disposable synthetic groups; it does not replace the browser rehearsal.

## Three-minute script (coordinator flow; rehearse with a clock)

This script follows the current account → invite → private needs → coordinator
plans → vote → booking simulation flow on [Vercel](https://huddle-two-neon.vercel.app/start)
and shared Maincloud `huddle-calhacks`. Owners are carried over from the earlier
draft; confirm them at rehearsal. Screen names in quotes are the UI's own labels.

### Stage setup

Pick one path and rehearse it on the demo build:

- **Two phones (preferred).** Register a host account and one friend account
  beforehand and make them friends in **Friends**. Clear both inboxes. The host
  phone is the one on the projector.
- **One phone.** The host starts the huddle and reads its code from "Your huddles"
  on the Start screen. A laptop runs `node scripts/demo-friends.mjs <CODE>`. Sam
  ("no sushi"), Jordan ("nothing over $20, outdoors") and Riley ("romantic, price
  no object") join by code, save seeded private needs and vote for the
  coordinator's recommendation. They are simulated people: say so on stage. A
  seeded friend whose needs come back with a clarifying question will not
  confirm, so check that all three reach "ready ✓" during rehearsal.

Host's private needs for the demo: **Vegetarian**, **$30** whole-outing budget,
**2 stops**, prompt "somewhere quiet". Do not choose 4 or 5 stops: plans currently
top out at 3.

Before going on: API health and tunnel are up, the 130-venue catalog is active,
and one complete huddle from rehearsal is saved under "Your huddles" as a backup.

### Script

| Time | Owner | Show | Say |
| --- | --- | --- | --- |
| 0:00–0:20 | Haydn | Signed-in Start screen, "Ready to huddle?" | “Every group chat picks a plan while someone quietly can't afford it or can't eat there. Huddle lets each person say what they need privately, and a Claude coordinator finds an outing that works for all of them.” |
| 0:20–0:50 | Haydn + phone driver | **Start a huddle** → "Get everyone in". Pick the friend under "Invite Huddle friends" → **Send invitations**. Second phone: inbox → **Open Huddle →** → **Open Huddle**. (One phone: the simulated friends appear under "Who's here".) | “Friends get an invitation in their Huddle inbox. Everyone joins from their own phone.” |
| 0:50–1:25 | Max | **Start huddle** → "Your kind of outing": budget and time sliders, stops, dietary chips, optional prompt → **Save & ready**. Show "Your private summary". | “This screen is private. The sliders are hard limits; the prompt is for Claude. Nobody else sees my $30 or what I wrote.” |
| 1:25–2:05 | Max (Eric Wu on the data line) | Host taps **Find plans** → "Your coordinator is planning" → "Your group’s plans": option cards with route names, times, walking map, ratings, photos, menu items and my private total. Point to the "Coordinator's recommendation" sticker. | “Claude reads everyone's needs, but it only picks from itineraries our code has already checked: every person's budget across all stops, dietary needs and opening hours. The venues are 130 Berkeley places we scraped with Bright Data, with menus read from their own websites. My total is just my meal plus the later stops, and only I see it.” |
| 2:05–2:35 | Eric Wu | **Go to vote** → each phone votes; the tally updates live. (Tie: **Resolve tie: equal-chance Spin**.) Host taps **Simulate booking**. | “Votes sync in real time through SpacetimeDB. Booking here is a simulation; no restaurant is called.” |
| 2:35–3:00 | Eric Wu | Booking simulation screen, then back to the chosen plan. | State what is real and what is simulated (below), give one next step (real restaurant calls, or takeout and seating data in the planner) and end on the group's plan. |

### Say out loud

- If the one-phone path is used, the other members are scripted, not real people.
- Booking is a simulation. No phone call or reservation is made.
- Venue data is a one-time snapshot from October 24, not live availability.
- An option the code cannot fully verify (for example, an allergy with no venue
  evidence) can still be voted on but cannot be booked.

### Do not show or claim

- A live restaurant phone call, or a "we're full" re-plan: coordinator bookings
  always confirm unless an operator changes the module's scenario setting.
- Google Calendar events or texted invitations: neither has passed a real-provider test.
- The experiment chart, solver numbers, swipes or confidence scores: they belong
  to the legacy flow, not this one.
- Multiple agents negotiating: there is one coordinator.

### If something fails

New huddles have no cached fallback: if the API or tunnel is down, planning
shows a retryable error. Open the saved rehearsal huddle from "Your huddles" and
continue from its plans, or play the recorded clip. Check in rehearsal that the
saved huddle still opens with its plans.

Thirty-second backup: Start a huddle → invite (or simulated friends) → private
needs, **Save & ready** → **Find plans** → one option on the map with my private
total → vote → labeled booking simulation. Never describe a planned feature as working.

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
