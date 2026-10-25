# Current task: accounts, preferences and coordinator polish (in progress)

Option comparison and map update: Plans/Vote label evidence-backed differences
in ratings, owner-private total cost, inter-stop travel and variety. Options,
Done and shared results open Google Maps with the blue underlined **Click here
to see the map!** action. The key-free URL phase is implemented; paid routing,
embedded Google Maps and context-based adventurousness remain follow-ups in
[GOOGLE_MAPS_PLAN.md](GOOGLE_MAPS_PLAN.md).

New result flow: complete voting opens Done with the chosen route/date/time and
owner-private menu order. Calendar actions and an explicit public result link
live there; re-voting stays available. Shared links exclude all private orders
and preferences. Both API model roles now default to Claude Haiku 5.5.

Latest demo correction: current provisional and untimed suggestions remain
votable, with separate strict eligibility for booking actions. Current timed
winners can be explicitly added to opted-in calendars, including provisional
venue suggestions. Plan
cards use route names and AM/PM times, omit source/confirmation boilerplate, and
show only known menu prices. See MENU_RECOMMENDATIONS.md for the current contract.

Updated October 24, 2026 after the authorized shared rollout. Accounts,
invitations, private context, preference sliders and the 130-venue catalog are
active on [huddle.compare](https://huddle.compare/login) with shared Maincloud
`huddle-calhacks`; the initial account foundation was `a029fb6`, with the newer
menu extension and UI reconciliation now merged. The shared API remains on Max's Mac, port
8000, through the existing public tunnel. Original rows and secret/settings
were preserved; preview accounts were not migrated. Shared checks passed:
49 connected menu-flow checks and 15 OAuth wiring checks; the merged UI passed
30 desktop/mobile browser assertions. See MENU_RECOMMENDATIONS.md for the full
verification record.
The separate review database/ports remain available. Eric Wu's scraping/data and
voice code is unchanged. Operations: [ACCOUNTS_RUNBOOK.md](ACCOUNTS_RUNBOOK.md).

## Menu release update

[MENU_RECOMMENDATIONS.md](MENU_RECOMMENDATIONS.md) is the current menu, personal-cost,
provisional/alternative and Calendar setup contract. Menu items/prices and photos
are now wired through Maincloud to Claude and the UI; takeout/seating and the
full proposal/revision loop remain follow-ups. See its owner checklist.

## Implemented and released to the shared app

- [x] Username/password registration and sign-in, eight-character minimum,
  show/hide password, logout, stable account ownership and saved memberships.
- [x] Exact-username friend requests, reciprocal contacts, an Invite friends
  dropdown, durable in-app invitation messages and addressed opening links.
  Accepting joins/selects without marking ready; copied addressed links cannot
  bypass recipient ownership. The compatibility backend retains code joining
  while gathering people, as merged from `c24c556`; QR/code sharing UI is removed.
- [x] Private editable defaults in SpacetimeDB, editable outing autofill and an
  explicit Remember choice. Other accounts cannot see those defaults.
- [x] Optional cumulative-budget/whole-outing-time sliders, Flexible defaults,
  optional prompt, dietary/allergy controls and one Save & ready action.
  Known allergies can finish input without redundant confirmation; missing
  venue allergy evidence now permits provisional suggestions while preventing unsupported booking.
- [x] Cached rating/review-count/source context for Claude and cached ratings on
  place cards. These are evidence labels, not verified menu or allergy claims.
- [x] 99 Python checks passed; 129 server checks passed with one opt-in test
  skipped; 41 connected checks passed using real Claude and an explicitly
  simulated booking. The final desktop/mobile browser rerun passed 30 assertions
  after the map fix, with no page/console errors or mobile overflow. Five real
  API preference/example scenarios also passed.

See [ACCOUNTS_RUNBOOK.md](ACCOUNTS_RUNBOOK.md) for preview operation/evidence,
[ACCOUNTS_CONTRACT.md](ACCOUNTS_CONTRACT.md) for ownership and
[PREFERENCE_ACCEPTANCE_PLAN.md](PREFERENCE_ACCEPTANCE_PLAN.md) for scenarios.

## Invitation and calendar expansion

- [x] Home invitation prompt resolves actual friends through Claude, previews
  recipients and sends only after explicit Start & invite. A picker fallback
  works without Claude; invitation text never seeds private needs.
- [x] Connectors tab, encrypted per-account Google OAuth, private primary-calendar
  free/busy, common-time selection, manual Berkeley date/time fallback and
  separate agreed-meetup action after current votes and event opt-in.
- [x] Opt-in Max-Mac Messages adapter and durable invitation outbox with visible
  submitted/unavailable/unknown states and no automatic ambiguous resend.
- [x] Google client settings saved privately; preview API reports Google
  configured and Mac Messages ready. The 14-check OAuth start/denied-callback/
  replay/disconnect smoke passed without Google authorization or provider writes.
- [ ] Complete participant-owned real Google consent and availability/event test.
- [x] Make Max's Mac Messages sender available; only Boolean readiness was read.
- [ ] Verify one explicit invitation
  to a known consenting recipient. Mock tests do not prove actual delivery.

See [CONNECTORS_CONTRACT.md](CONNECTORS_CONTRACT.md). No provider events or
messages were created by the automated acceptance checks.

- [x] Fix matching 90-minute food requests: accept one-meal coordinator plans
  throughout API/module/voting/simulation, preserving real hard limits and legacy
  templates. Real Claude replay: three Asian-food options, 75 minutes, $12–$25.
- [x] Add designated-owner Mac Contacts lookup, private selected friend-address
  links, recipient-setting precedence and explicit eligible invitation sending.
  The real lookup returned two Eric records; no phone numbers were printed.
- [x] Max reports Google Calendar connects after approving the Google test user.
- [x] Merge Eric's catalog snapshot path with account/connector validation;
  activate 130 venues in the preview and rerun the 41-check connected flow.
  Newly scraped IDs pass API planning; public catalog views supply card metadata.
- [ ] Wire `data/brightdata/details.json` through an agreed bounded contract for
  menu evidence, photos/attribution, takeout and suitable seating. These are
  collected files, not already active planner features.
- [ ] Fix Max's Mac Messages sending/history setup. The real invitation is
  visible in Messages with Not Delivered; receipt is not confirmed.
- [ ] Confirm a real invitation reaches the intended Eric after Max links the
  correct contact and explicitly sends it; submitted alone is not a receipt.

## Next work, in parallel

| Workstream | Suggested lead | Concrete work | Done when |
| --- | --- | --- | --- |
| Branch review and UI finish | Max + Eric Chen | Review the verified account, friend-picker, inbox, private-input, plan and mobile flow with Max; the map-fix browser rerun passed. Keep accessible controls and the illustrated theme from Design.md. | Max can complete the two-account flow without guidance; refresh/re-entry and maps work without console errors. |
| Rich venue evidence | Max + Eric Wu | The basic catalog handoff is reviewed. Wire the separately collected menu items/prices, takeout, seating and attributed photos through a bounded contract; keep Eric's scraping pipeline separate. | Evidence distinguishes menu labels, inferred tags, estimates and unknowns; source URLs/fetch times survive the runtime path. |
| Shared release rehearsal | Max + Eric Wu | Shared account/catalog activation is complete. Test real participants on phones and rehearse API/tunnel recovery while preserving shared settings. | Participants can re-enter their own shared accounts and recover cleanly after an operator restart. |
| Personalized meal costs (implemented) | Max + Eric Chen | Owner-private menu selections/totals now count each person's own meal plus later stops; the public legacy cost remains a venue baseline. Review order editing next. | Each person's full outing total is correct and fits their own cap. Missing/default prices never prove actual affordability, and caps cannot be pooled. |
| Meal-quality and preference scenarios | Max + Eric Chen | Review vegan meal versus steak/fries, optional dessert, split takeout with evidenced seating, duration, categories and soft wishes. Distinguish input ambiguity from unavailable venue evidence. | Useful alternatives are independently supported; no fabricated vegan/allergen/menu facts or extra activity forced by a template. |
| Conditional compromise | Max + Eric Chen | Explain the actual blocking evidence or requirement and offer a specific next action. Obtain the affected owner's explicit approval for permitted changes; cap increases still require acceptance of a current private offer. | No unexplained dead end, silently relaxed limit or selectable unvalidated compromise. |
| Restart and release rehearsal | Max + Eric Chen | Rehearse API/tunnel recovery and provider failures, then test physical phones. After approval, sync main, resolve conflicts, coordinate additive module/UI release without a reset and verify Vercel. | Saved context survives recovery, stale votes/bookings stay blocked and the released UI matches the reviewed branch. |

Reviewed ingestion retains basic venue facts, hours, rating/review count
and inferred dietary tags; `/catalog` includes source/fetch evidence and ratings
but excludes review text/star distributions. Without Yelp data, `priceLevel`
may remain null and meal costs may default to $25. The basic snapshot/read path
is reviewed and tested; richer detail and item-assignment contracts remain open. A default
$25 estimate cannot prove a real hard cap, and inferred dietary tags do not
verify vegan options or allergen safety. More reviews are secondary to the
menu/takeout/seating evidence needed for the current example.

## Solo test on this branch

Use [the account runbook](ACCOUNTS_RUNBOOK.md) to start the isolated preview.
The old `demo-friends.mjs YOUR_CODE` guest/code flow does not join new account
huddles and is not the acceptance path for this branch.

1. Open [the preview](http://localhost:5174/start) in a normal browser profile and
   a separate private profile or another browser. Ordinary tabs share identity.
2. Register two distinct test accounts. Exercise Show/Hide password, sign-out
   and sign-in. Save one account's private defaults and confirm the other cannot
   see them.
3. Add the second account's exact username in **Friends**. Accept its friend
   request in the other profile. Start a huddle with the **Invite friends**
   dropdown, then open the recipient's inbox message/link and accept.
4. Set private budget/time/dietary choices or leave them Flexible. Leave the
   prompt blank if desired and use **Save & ready** once for each participant.
   Only the host starts **Find plans**.
5. Inspect plans, grounded reasons, cached rating labels and the map. Both users
   vote; the host explicitly starts **Simulate booking** after the group choice.
   This is a simulation, not a restaurant call.
6. Lower a budget, check that old choices/actions become unusable, then refresh,
   sign out/in and reopen the saved huddle. Check that private context remains
   owned by the correct account.

For the repeatable connected simulation, target only the isolated preview:

```sh
SPACETIMEDB_URI=https://maincloud.spacetimedb.com \
SPACETIMEDB_DB=huddle-account-max-check \
node scripts/accounts-flow-smoke.mjs
```

The script creates synthetic accounts, tests ownership/friends/invitations,
uses real Claude for planning and completes a simulated booking. Its test people
are not autonomous agents or real recipients; it sends no SMS/email. The
preview module must use its simulation configuration from the runbook. Browser
mobile emulation supplements, rather than replaces, a physical-phone check.

## Release gate and remaining scope

- [x] Finish the map-fix browser rerun: 30 assertions passed, no page/console errors.
- [ ] Complete Max's guided visual review with the separate test-bot browser.
- [ ] Verify two physical phones and restart/reconnect behavior.
- [x] Review the actual Bright Data catalog export and use its existing snapshot contract.
- [ ] Implement the deferred Claude proposal/repair and personalized-cost work.
- [x] Max authorized the Git release; main is synced and content conflicts resolved.
- [x] Activate matching shared module/API/catalog and verify the actual Vercel
  account flow. Original data and secrets/settings were preserved.

General SMS/email/push providers, voice prompt input,
inferred memory/actual-visit history, personal keys, vendor/MCP settings, real
restaurant calls and hosted-API migration remain later work. Account recovery
and profile/account management beyond this preview are listed in the account
contract. No mathematical satisfaction/fairness claim is made. The task remains
open for the reviewed follow-ups and demo polish.
