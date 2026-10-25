# Accounts, invitations, preferences and connectors: operations

## Maps, city coverage and personal Calendar release — October 24, 2026

Main/Vercel and shared `huddle-calhacks` now include all three approved changes.
Eric Wu's existing API pulled/restarted with `destinationCities` support; its
API/voice URLs and Google redirect/encryption configuration were not replaced.
The module publish used `--delete-data=never`, adding private city/personal-event
state while preserving every pre-release group/member/plan/account identifier
(97/170/65/57). The active catalog is
`cities-4584c3a3ce4c-menu-4584c3a3ce4c`: 200 venues (120 Berkeley, 39 Oakland,
30 SF, 9 Albany, 2 Emeryville), 950 menu items and 499 photos, exactly checked
against the published menu/photo payload.

The restricted browser Embed key is configured in Vercel Production and local
`web/.env.local` under `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY`. It is absent from
tracked source. Maps Embed displays route/time; backend Routes API is not used.
Calendar event creation is owner-only and supports non-host members; users must
connect and explicitly add only their own event. A live consent/event-write test
remains an owner action; this release created no Google events or messages.

Verification: 126 API tests, 234 module/UI tests (one optional integration skip),
build/lint, 72 isolated connected browser checks and 9 production read-only map
checks passed. Response-only calls against the deployed coordinator returned
three timed SF plans and three timed Oakland plans with preserved city and
budget rules. Automatic approval review blocked synthetic production-account/
Huddle writes; production verification stayed read-only. Historical checkpoints
below retain the earlier counts and hosts for context.

## Current menu release — October 24, 2026

Later voting/card correction: provisional and untimed suggestions support group
votes and tie Spin; only ready timed winners support booking/calendar actions.
Direct Vote links stay open through realtime changes, showing an empty state when
choices become stale. Preview passed 60 connected and 24 desktop/mobile browser
checks; local verification passed 110 API and 169 module tests (one HTTP skip),
build and lint. Cards use AM/PM and known menu prices without source/date or
confirmation clutter. The same API/tunnel URLs and private configuration remain.

The shared module and API now support the [menu extension](MENU_RECOMMENDATIONS.md).
Maincloud `huddle-calhacks` holds snapshot
`2026-10-24T22:29:05Z-d5490f3f-menu-20bc1232fca7`: **130 venues, 950 menu items,
386 photo records**, with Eric Wu's specific category labels. The existing shared
API URL and port 8000 are unchanged. Messages/Contacts remain disabled there.
The new API process is kept awake with a PID-bound `caffeinate` process; recreate
that guard when restarting it, and keep the existing tunnel running.

Before/after identifier checks preserved all **31 groups, 66 members and 24 plan
runs** present immediately before this update. No data reset or credential change
occurred. Synthetic shared checks passed **49 account/menu/privacy/voting/booking
simulation assertions** and **15 OAuth wiring assertions**. Local verification
passed **110 API tests**, **160 native module tests** (one opt-in skip), build/lint,
**30 desktop/mobile browser assertions** after the latest UI merge, and additional
provisional/untimed UI checks. No external messages, Google grants/events or real
restaurant bookings were made by these checks.

The merged frontend keeps the updated sidebar, vote display, walking map and
single SPA entry. QR/code-sharing UI remains removed; account Huddles use
addressed friend invitations. Push main to update Vercel, then verify its deployment.
The restart commands below still apply. For every new scrape use:

```sh
.venv/bin/python scripts/publish-menu-catalog.py --database huddle-calhacks --publish
```

An ordinary basic `collect.py publish` can replace menu evidence; publish the
joined menu snapshot after updating both committed data files.

## Initial account foundation release — October 24, 2026

The initial account/catalog release `a029fb6` activated shared Maincloud
**`huddle-calhacks`**, with [Huddle login](https://huddle.compare/login).
The public frontend was already deployed from that commit. The shared API was
restarted from it on Max's Mac, port **8000**, behind the existing tunnel
`https://roughly-metabolism-representing-harmony.trycloudflare.com`.

The module was published with `--delete-data=never`, preserving the existing
secret, voice settings and all unspecified environment settings. Before/after
identifier checks retained every original **26 groups, 57 members and 17 plan
runs**. No preview accounts, passwords, private context or Google credentials
were copied into the shared database. Create a shared account on Vercel; preview
accounts belong to a separate database.

The exact committed snapshot `2026-10-24T20:17:52Z-a182c74b` is active: **130 real
venues**, comprising 60 meals, 45 activities and 25 desserts. A protected atomic
`POST /catalog` activated it; unauthorized requests returned 401. Module health's
`catalog.venues` is the active count; `placesLoaded` still describes the legacy
bundled list of 45. FastAPI receives the live snapshot per coordinator request.

Verification on the shared deployment:

- **41** account/friend/invitation/private-input/real-Claude/voting/simulated-booking checks passed.
- **14** Google OAuth start, PKCE, denied callback, replay and disconnect checks passed.
- **30** actual Vercel desktop/mobile browser assertions passed: 1280×900 and
  390×844, no page/console errors, warnings or mobile overflow.
- The browser's three plans included two new scraped IDs, Aangan Restaurant &
  Bar and Jot Mahal Palace of Indian Cuisine, absent from the bundled 45 places.
- Provider-write tests did not send messages, authorize Google or create events.
  Booking remains explicitly simulated. Menus/photos/takeout/seating in the
  separate `details.json` still await runtime integration.

Google settings/encryption remain private in ignored `api/.env`. Max confirmed
adding the shared callback below to the existing OAuth web client, retaining
the preview callback. Each person must connect their own Google account; real
shared availability/event creation remains a participant check. Mac texting and
Mac Contacts lookup are disabled on the shared API while Mac message delivery
is unresolved; in-app invitations work. The isolated preview remains available.

Restart **only the shared API** from the repo root, preserving the current
secret and stable connector encryption key in `api/.env`:

```sh
HUDDLE_FRONTEND_BASE_URL=https://huddle.compare \
HUDDLE_MESSAGES_ENABLED=false \
HUDDLE_MAC_CONTACTS_ENABLED=false \
GOOGLE_REDIRECT_URI=https://roughly-metabolism-representing-harmony.trycloudflare.com/connectors/google/callback \
SPACETIMEDB_URI=https://maincloud.spacetimedb.com \
SPACETIMEDB_DB=huddle-calhacks \
.venv/bin/python -m uvicorn api.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

Keep the existing API tunnel and Mac awake. Restarting the tunnel creates a new
URL: update only shared `FASTAPI_BASE_URL`, the API's `GOOGLE_REDIRECT_URI` and
the OAuth client's registered URI together. Keep invitation frontend origin
`https://huddle.compare`. Never point this shared API at the preview
database or copy preview credential/session state into production.

Shared checks (synthetic accounts, no external writes):

```sh
.venv/bin/python api/eval/check_live.py --accounts-flow \
  --server https://maincloud.spacetimedb.com --database huddle-calhacks
SPACETIMEDB_URI=https://maincloud.spacetimedb.com \
SPACETIMEDB_DB=huddle-calhacks \
FASTAPI_BASE_URL=https://roughly-metabolism-representing-harmony.trycloudflare.com \
PUBLIC_FRONTEND_BASE_URL=https://huddle.compare \
node scripts/connectors-smoke.mjs
```

The sections below retain the independent preview setup and earlier verification
history. Its API is port 8002 and its database is `huddle-account-max-check`.
Eric Wu's data/scraping/ingestion and voice files were not edited during rollout.

## Try the isolated preview

- Public review frontend: [open Huddle](https://assessed-healthcare-equipment-sox.trycloudflare.com).
  This frontend connects to the isolated review module.
- On Max's Mac: `http://localhost:5174/login`.
- Branch API: loopback port **8002**, tunnel
  `https://eat-days-means-magnetic.trycloudflare.com`.
- Branch state: `https://maincloud.spacetimedb.com`, module
  **`huddle-account-max-check`**.

Create two accounts with unique usernames (3–24 letters/numbers/underscore) and
passwords of **8–128 characters**. Show/Hide password works while typing. Use
unique demo credentials: password recovery is not implemented. Separate browser
profiles/private windows/devices represent separate signed-in device sessions;
ordinary tabs in one profile share storage.

1. Account A opens **Friends**, enters B's exact username and sends a request.
   B accepts in Friends/Inbox. Both now see the friendship.
2. A opens **Start a huddle** and writes an invitation intent such as dinner with
   B's actual display name/username. This is shared outing intent, not private
   needs. **Review invitation** uses Claude to resolve actual friends and shows
   the proposed recipients/outing. Correct ambiguous/unknown names. **Choose
   friends instead** opens the picker-only fallback. Only **Start & invite** sends.
3. B receives an in-app message, **A wants to hang out with Huddle!**, with an
   addressed opening link.
   The invitation survives logout; signing in returns to that invitation. Accept
   joins the addressed account only and does not mark anyone ready. A copied link
   does not grant another account membership. Invitations expire after 24 hours.
4. Each chooses **Set my needs & get ready**. Budget means the entire outing per
   person; duration includes stops, gaps and travel. Untouched controls mean
   Flexible; $0 is a real cap. Prompt and restrictions are optional. Click
   **Save & ready** once; text needs Claude only when nonempty. A consequential
   ambiguity stays private and asks for a correction beside the saved summary.
5. **Your usual vibe** saves/edits/clears private account defaults in SpacetimeDB.
   New outing inputs prefill them and remain editable. Today's changes do not
   update defaults unless **Remember these choices** is selected. A saved default
   never raises an established outing cap. Known allergies can finish input,
   but missing venue evidence cannot become a validated food recommendation.
6. The host chooses the date/time manually in Berkeley/Pacific time, or each
   participant connects Google Calendar before the host checks a common opening.
   Manual selection is a usable fallback; it makes no calendar-availability
   claim. See the calendar steps below.
7. Once two or more members are ready, the host clicks **Find plans**. Inspect
   options, estimated cumulative costs, cached ratings, venue details and the
   shared conversation. Each member votes; the host explicitly starts **Simulate
   booking**. This is scripted, not a restaurant call or real reservation.
8. Lower a budget. Old votes, Spin and booking requests immediately become
   unusable. Flexible or a higher number cannot raise that established cap;
   only the owner's acceptance of a current private trade offer can do that.
9. Return through **My huddles**, reopen an owned membership, refresh or sign in
   on another device. Private context and membership remain account-scoped.

The host Mac now reports Messages ready. Invitations remain in-app, with
optional external submission only for recipients who explicitly opt in.
The optional Mac Messages adapter requires host setup plus the recipient's own
explicit opt-in and private address; it sends from the host Mac's Messages
account. Submitted is not a delivery receipt. No SMS/email/push integration is
claimed. No QR joining remains in the UI or dependencies. Legacy anonymous
groups retain backend code joining; account-owned groups require invitations.

## Google connection, scheduling and meetup status

The user's Google client settings are saved privately in ignored `api/.env`.
The operator generated a stable encryption key and restarted the API. Its real
protected configuration check now reports **Google configured: true; Messages
configured: true**. This validates settings/readiness, not a successful Google
authorization. Max now reports that Google Calendar connects after adding his
Google account to the OAuth test-user list. Group free/busy retrieval and real
meetup-event creation have not been observed by the automated checks; event
write tests still use mocked providers only.

Use the public preview for phone links and Google return navigation. If you
previously signed in only at localhost, sign in once on the public origin using
the same Huddle account. Membership and private settings remain in the same
isolated database; browser device sessions are specific to each origin.

The isolated preview API callback is exactly:

```text
https://eat-days-means-magnetic.trycloudflare.com/connectors/google/callback
```

Register that exact URI for the Google **Web application** OAuth client, enable
Google Calendar API, configure consent/scopes and add the participating Google
accounts as External/Testing test users. The source-linked steps are in
[CONNECTORS_CONTRACT.md](CONNECTORS_CONTRACT.md#current-preview-and-google-setup).
Keep the encryption key stable; regenerating it prevents old credentials from
decrypting. Keep client secrets and all token values out of browser config.

1. In a regular browser, each participant opens **Connectors** and chooses
   **Connect Google Calendar**. Review Google's consent screen and return to
   the public preview's `/connectors` page. Only an observed successful callback
   should show that owner's calendar connected.
2. `schedule_huddle` is host-only. It requires every current participant's
   connected primary calendar, checks a range up to 14 days and a 15–720-minute
   duration against private outing-length limits, then validates the selected
   common opening before setting the huddle's date/window. Busy/event details
   stay private. Provider failure does not mean everyone is free.
3. Without full calendar connection, use host-only `set_huddle_window` through
   the manual date/start/end controls. The current demo fixes timezone to
   `America/Los_Angeles`. This clears old calendar-check metadata and invalidates
   old plans, without claiming calendars were checked.
4. Connecting alone does not create events. After a complete current ballot
   selects a timed winner, each participant uses **Add to my calendar** on Done.
   It enables that owner's event consent if needed and queues only their account;
   non-hosts have the same action. Nobody can add to another person's calendar.
   The `.ics` download remains available for other calendar apps.
5. Each person sees only their own request status. Pending/sending/created/unknown
   submissions block duplicates only for that owner and Huddle; friends can add
   their own copies independently. Turning off consent or reconnecting before
   dispatch makes that queued request stale. Plan edits do not update/delete
   existing entries, and unknown writes are never automatically retried.

Disconnect immediately removes Huddle's credential and event consent, then
attempts provider revocation once. If that cannot be confirmed, Huddle stays
disconnected and the user can manage permissions in Google. A stale callback or
refresh cannot revive a disconnected account.

## Short outings and Mac Contacts follow-up

The reported matching $40/90-minute sushi-or-Asian request exposed a two-stop
minimum bug: the shortest old candidate needed 120 minutes, while catalog meal
visits take 75. Coordinator plans now allow **one meal stop** through the API,
module, voting and simulated booking. Legacy templates are unchanged. A real
Claude API replay returned three Asian-food venues at estimated $12–$25 and 75
minutes each. Matching input does not bypass genuine opening-hour, dietary,
allergy, cost or time restrictions. A 60-minute limit still cannot fit the
catalog's 75-minute meal visits.

Max's `/connectors` now has **Link friends from Mac Contacts**. Search by name,
choose the correct Huddle friend and exact contact destination, inspect the
review, then Link contact. A real protected lookup found two matching Eric
records; addresses were not printed in verification output. Only selected links
are stored privately. Later address-book edits require searching/relinking; this
is a selected-address snapshot, not continuous address-book synchronization.

A new explicit invitation can use Max's selected mapping when the recipient has
not saved their own delivery setting. A recipient's saved address or explicit
opt-out takes priority. Existing pending in-app-only/unavailable invitations have
**Send invitation message**; linking alone does not send. Submitted/unknown sends
cannot be replayed automatically. The new 30-check desktop/mobile browser scenario used matching sushi/Asian
prompts and $40/90-minute controls, completed one-meal planning, voting and
simulated booking, then refreshed without errors/warnings or overflow. It also
confirmed that other accounts cannot see the Mac Contacts picker. The 41-check
connected account smoke passed again. No actual Eric message has been confirmed
yet; Max must select the correct contact and explicitly send the invitation.

Configuration: API `HUDDLE_MAC_CONTACTS_ENABLED=true` and module
`MAC_CONTACTS_OWNER_USERNAME=maxli`. The API host needs macOS Contacts/Automation
access. Other accounts cannot search this Mac's address book or read Max's
selected mappings. See [connector contract](CONNECTORS_CONTRACT.md).

## Current data and planner limit

The preview now validates against the committed **130-venue database catalog**
(60 meals, 45 activities, 25 desserts). Eric Wu's existing `POST /catalog`
snapshot is passed through Maincloud to FastAPI; both validate the same places.
Claude receives source/fetch evidence, and cards resolve new scraped IDs through
`catalog_venues`, displaying address, rating/count and observation date. No raw
scrape is bundled into the frontend. Default/estimated prices do not prove an
actual item purchase fits.

`data/brightdata/details.json` separately contains menu items, attributed photos,
takeout/seating attributes and explicit/inferred dietary evidence for 130 venues.
Those richer records still need a reviewed bounded integration; this release
does not claim the coordinator or UI consumes them. Allergy/cross-contact safety
is still unverified. Claude selects validated candidates; participant-specific
meal costs remain a follow-up.

This catalog cannot verify Max's vegan/$30 + Eric's steak/fries/$50 + Eric
Chen's dessert/three-hour example, so a dietary-evidence state is the expected result, not a
fabricated match. The approved future split-meal rule is **each person's own meal
plus subsequent stops**. Current shared-stop plans still sum the same stop costs
for each member; participant-specific meals/item prices need a coordinated
contract before split-meal itineraries can be implemented honestly.

Claude currently selects up to three distinct, independently useful validated
itineraries using every member's context and cached venue ratings. Public prose
is rendered from selected factual sentences. A full Claude constructs → validates
→ revises planner, natural menu-quality trade-offs, conversational explanations,
photo-rich cards and conditional compromises remain follow-ups against an agreed
versioned catalog. Do not describe them as already shipped.

## Verification

| Check | Result |
| --- | --- |
| Python unit/HTTP checks, including Argon2, inputs, constraints, scraped snapshot and mocked connectors | 99 passed |
| Server typecheck and native account/social/agent/connector/scheduling/legacy tests | Passed; 129 tests passed, 1 opt-in HTTP test skipped |
| Frontend build and lint | Passed; existing bundle-size warning remains |
| Isolated Maincloud account full flow | 41 checks passed again after the main/catalog merge, with 130 active venues, real Claude and simulated booking |
| Isolated OAuth wiring | 14 checks passed: real Maincloud/API start, PKCE, denied-consent completion, replay rejection and disconnect; no Google authorization or events |
| Browser desktop/mobile full flow | 30 assertions passed again after the catalog merge, including source-dated ratings on both accounts: real invitation matching, picker fallback, Connectors, manual date/time, defaults, private inputs, real Claude, votes, simulated booking and refresh; no page/console errors or mobile overflow |
| Saved-default hydration regression | Separate 24-check two-account/second-device browser run passed; untouched drafts receive updated defaults, dirty edits remain intact, other accounts stay isolated |
| Current live API connector configuration | googleConfigured=true, messagesConfigured=true; Max reports Calendar connection works; automated free/busy/event checks remain pending |

The connected checks created synthetic accounts, friendships, invitations and groups
on the explicit test module; generated credentials/tokens are never printed.
They verify profile privacy, recipient-only/idempotent accept, readiness, real
Claude plans, cumulative budgets/duration, full-group votes, scripted booking,
stale choices and missing allergy evidence. All smoke sessions sign out at end.

The current browser checks use regular Playwright because the Browser plugin is unavailable:
1280×900 desktop and 390×844 mobile, including a temporary resize to 430 pixels. Registration with an eight-character demo
password, password visibility, saved defaults, friend requests, link re-login,
private sliders, live Claude, cached ratings, voting, simulation and refresh are
exercised. Those results do not certify the newer natural-language invitation or
Google provider flow. Mobile emulation does not replace testing a physical phone.

That earlier connected run caught a genuine regression: valid Claude responses cited five
or six supported facts, but a hidden four-reason validator limit rejected them.
Fixed with a supported-reason enum and matching validation; typical request
context also shrank from 110,652 to 20,081 characters by deduplicating venues.
A real Claude diagnostic returned three validated plans in 1.68 seconds; this is
one observation, not a latency guarantee. The final browser rerun also exercised
three rapid Plans/Vote round trips and mobile map resizing. That checkpoint caught and fixed
a Leaflet animation-after-unmount error and white navigation text disappearing
against illustrated clouds; navigation now has an opaque background.

At the prior checkpoint, four real Claude interpretation scenarios passed: vegan/$30, steak/fries/$50,
dessert/180 minutes, and the negative declaration “No allergies or dietary
restrictions.” The combined three-person planning request returned an explicit
dietary-evidence gap, not a fabricated vegan recommendation. These are five live
API checks, separate from the connected social/booking smoke.

The expansion checks caught two additional bugs and verified their repairs:
Google OAuth expiry returned fractional milliseconds that could panic the module’s
integer timestamp conversion; the scheduling delay now rounds up, with a regression
test and the 14-check real callback wiring run. A fresh private form could capture
a transient missing saved-context view; a persistent owner-scoped subscription,
account/group/member form identity and hydration of untouched drafts preserve
saved defaults without overwriting edits. The earlier 28-check full browser rerun and
separate 24-check second-device regression passed afterward.

The OAuth wiring check can be repeated without Google authorization or writes:

```sh
SPACETIMEDB_URI=https://maincloud.spacetimedb.com \
SPACETIMEDB_DB=huddle-account-max-check \
FASTAPI_BASE_URL=https://eat-days-means-magnetic.trycloudflare.com \
PUBLIC_FRONTEND_BASE_URL=https://assessed-healthcare-equipment-sox.trycloudflare.com \
node scripts/connectors-smoke.mjs
```

## Guided single-person review

The automated browser run uses independent desktop/mobile accounts; it does not
log in as Max. For a guided test, Max creates his own preview account and huddle,
adds the separately controlled **Huddle test bot** by its displayed username,
and selects it in Invite friends. The operator accepts/enters preferences/votes
through the bot's browser while Max controls host actions. This is a browser test
participant, not a separate autonomous personal agent. Do not expose passwords.

## Run/restart commands

From `/Users/maxli/Huddle`, preserve ignored `api/.env` containing
`HUDDLE_SHARED_SECRET`, `ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, the stable
`HUDDLE_CONNECTOR_ENCRYPTION_KEY`, `HUDDLE_FRONTEND_BASE_URL` and optional
`HUDDLE_MESSAGES_ENABLED`. No secret belongs in frontend env. Existing account
login uses the password service; Google authorization is a separate connector,
not a replacement Huddle account login. No additional SQL database is needed.

```sh
uv pip install --python .venv/bin/python -r api/requirements-dev.txt
HUDDLE_FRONTEND_BASE_URL=https://assessed-healthcare-equipment-sox.trycloudflare.com \
HUDDLE_MESSAGES_ENABLED=true \
HUDDLE_MAC_CONTACTS_ENABLED=true \
SPACETIMEDB_URI=https://maincloud.spacetimedb.com \
SPACETIMEDB_DB=huddle-account-max-check \
.venv/bin/python -m uvicorn api.main:app --host 127.0.0.1 --port 8002 --no-access-log
```

Another terminal:

```sh
api/.venv/bin/cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8002
```

For public invitation links and Google browser return, also expose port 5174
with a separate tunnel and set `HUDDLE_PREVIEW_HOST` to its exact hostname when
starting Vite. Configure API `HUDDLE_FRONTEND_BASE_URL` and module
`PUBLIC_FRONTEND_BASE_URL` to that same public frontend. API
`HUDDLE_MESSAGES_ENABLED=true` and module `MESSAGES_ENABLED=true` enable the
optional sender, still requiring recipient opt-in.

A tunnel restart changes the URL. Deliberately publish/update **only the preview
module's** `FASTAPI_BASE_URL`, preserving its private shared secret and existing
data. Do not run a host helper that repoints shared `huddle-calhacks`.

```sh
HUDDLE_PREVIEW_HOST=assessed-healthcare-equipment-sox.trycloudflare.com \
NEXT_PUBLIC_SPACETIMEDB_URI=https://maincloud.spacetimedb.com \
NEXT_PUBLIC_SPACETIMEDB_DB=huddle-account-max-check \
npm run dev --prefix web -- --host 0.0.0.0 --port 5174 --strictPort
```

For phone/public preview access, keep a separate frontend tunnel running:

```sh
api/.venv/bin/cloudflared tunnel --no-autoupdate --url http://127.0.0.1:5174
```

The current frontend tunnel is `https://assessed-healthcare-equipment-sox.trycloudflare.com`.
If it changes, update API `HUDDLE_FRONTEND_BASE_URL` and the isolated module's
`PUBLIC_FRONTEND_BASE_URL` to that same reviewed UI origin. If the API tunnel
changes, also update `GOOGLE_REDIRECT_URI` and the OAuth client's registered
callback, then restart the API and deliberately update only the isolated
module's service URL. External Messages delivery requires the module's
`MESSAGES_ENABLED`, API's `HUDDLE_MESSAGES_ENABLED`, adapter readiness and each
recipient's explicit opt-in; public links alone do not enable it.

Checks from the repository root:

```sh
.venv/bin/python -m unittest discover -s api/eval
npm run typecheck --prefix server
npm test --prefix server
npm run build --prefix web
npm run lint --prefix web
.venv/bin/python api/eval/check_live.py --accounts-flow \
  --server https://maincloud.spacetimedb.com \
  --database huddle-account-max-check
```

The earlier shared-release gate is now satisfied by the activation recorded at
the top of this runbook: matching module/API, no reset, catalog activation and
actual Vercel verification. A Vercel build alone does not update Maincloud or the
local API. Both the shared app and the independent review frontend are available.

For catalog-only activation in an already updated review module, send the exact
committed snapshot to its authenticated `POST /catalog`; the API needs no Bright
Data key. The completed preview push used version
`2026-10-24T20:17:52Z-a182c74b`. Unauthorized pushes returned 401. A new offline
API regression excludes every bundled venue and verifies new scraped IDs reach
the model and fit $40/90-minute cumulative limits, with source observations.

Messages participant check: Max explicitly sent an invitation that appears in
Eric's Mac conversation, but Messages shows **Not Delivered**. Max also reports
ordinary sending and phone-history sync fail. This is an observed OS handoff,
not a delivery receipt; automated tests did not send external messages. Keep
using the durable in-app Inbox while Mac delivery is unresolved.

Catalog browser rerun used regular Playwright (Browser plugin not available),
1280×900 desktop and 390×844 mobile. Login → friends → reviewed invitation →
private needs → real Claude → source-dated venue cards → votes → simulation →
refresh passed all 30 assertions, with no page/console errors, warning messages
or mobile overflow. The initial check caught bundled review counts paired with
new source dates; displayed rating/count/date now come from one observation,
and Claude receives that same sourced rating/count. Screenshots are local QA
artifacts outside the repository. Physical-phone/provider-write checks remain
separate.
