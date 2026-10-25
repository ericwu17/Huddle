# Connectors: Messages invitations and Google Calendar

**Personal Calendar update (branch preview):** every participant, including a
non-host, uses **Add to my calendar** on Done. Each request can write only the
authenticated owner's connected primary calendar. The host cannot add events to
another participant's account. Free/busy scheduling still checks the group's
connected calendars; choosing the shared time remains host-owned. Shared release
is pending. The original rollout narrative below is retained as history.

October 24, 2026. The additive invitation, scheduling and connector backend is
published only to isolated `huddle-account-max-check`. The branch is uncommitted/
unpushed; shared `huddle-calhacks` and Vercel are unchanged. Google client settings
are saved privately, a stable local encryption key is present, and the restarted
API reports `googleConfigured=true`, `messagesConfigured=true`. Configuration
readiness does not prove Google consent, free/busy or event creation works.
Max reports that Calendar works; this is separate from automated confirmation
of successful consent/free-busy/event flows. A separate
14-check Maincloud smoke now verifies OAuth start, PKCE, denied-consent callback,
replay rejection and disconnect without granting Google access. External-write tests use
mocked providers only; no real Messages delivery or Google event is claimed.
The new Mac Contacts linking addition is implemented locally for the
coordinator's isolated rollout; its tests use synthetic Contacts/provider data.

## Public intent and private preferences

The home prompt describes the proposed shared outing and selected friends. It
is public invitation intent, not a private preference submission. Each accepted
participant supplies their own private outing limits afterward. Notification
text contains only the initiator's display name and an addressed opening link:

`[Name] wants to hang out with Huddle! https://[configured-ui]/invite/[id]`

The durable in-app invitation remains authoritative. Its link requires the
addressed account to sign in and accept; it cannot grant another account access.
Raw private prompts, dietary details and budget caps never enter this message.

The owner can ask for dinner with named friends. Claude resolves names only
against that account's actual contacts, then shows a recipient/outing preview.
Ambiguous/unknown names require correction or explicit resolution. The friend
picker is the fallback. Only the explicit Start & invite action creates the
huddle and addressed invitations; typing or reviewing does not send anything.
The atomic create procedure is idempotent for the owner's client request ID.

## Owner settings and browser contracts

All destination, OAuth-state, encrypted-token and dispatch tables are private.
Authentication resolves the verified account session; clients cannot choose an
account ID to read/write someone else's connector.

| Action/view | Contract |
| --- | --- |
| `save_message_connector` | enabled, destination; destination is self-entered international phone number or Apple ID email. Disabled permits an empty destination. Default is off. |
| `set_calendar_event_consent` | enabled; connecting alone does not authorize event creation. Enabling requires a connected calendar. |
| `start_google_calendar` | Owner-only procedure; returns ok, safe message and optional authorizationUrl. |
| `disconnect_google_calendar` | Clears the private stored credential, email/scopes and event consent, rotates its generation and invalidates pending callbacks. |
| `connector_status` | Owner-only procedure; returns googleConfigured, messagesConfigured and externalInvitesConfigured booleans, never keys. |
| `my_connectors` | Own accountId, messageEnabled, messageDestination, messageStatus, calendarStatus, optional calendarEmail/calendarError and calendarEventConsent. |
| `my_invitation_deliveries` | Sender/recipient only: invitationId, status and optional safe error; no recipient destination, credential or calendar contents. |
| `my_group_connectors` | Current group only: memberId, connected and eventConsent booleans. No busy intervals, titles, email or event IDs. |
| `schedule_huddle` | Host-only searchStart/searchEnd, dayStart/dayEnd, durationMinutes and timeZone; require all current members' calendar connections before checking a common slot. |
| `set_huddle_window` | Host-only date, windowStart/windowEnd and `America/Los_Angeles`; explicit manual fallback that makes no calendar-availability claim. |
| `confirm_meetup` | Any signed-in participant: runId, planId only. Require the current complete timed winner and the caller’s connected, opted-in calendar. Derive accountId from authentication; enqueue one owner-scoped request. |
| `my_meetup` | Caller’s own current-huddle request only: runId, planId, status, message. Other participants’ requests and event details are hidden. |
| `search_mac_contacts` | Designated Mac owner only; query of 2–80 characters returns bounded matching Contacts records, not the address book. |
| `save_friend_contact` | Designated owner only; friendAccountId, contactId, contactName, destination; require an accepted Huddle friend and explicit address selection. |
| `clear_friend_contact` | Designated owner only; friendAccountId; remove that mapping and suppress its queued dispatch. |
| `my_friend_contact_destinations` | Only the mapping owner's friendAccountId, contactId, contactName and selected destination; never visible to friends or other accounts. |
| `send_invitation_message` | Original sender only; invitationId; explicitly queue a still-pending invitation only from in_app_only or preflight-unavailable status. |

Calendar status is disconnected, pending, connected or error. The message setting's
enabled/disabled status records consent, while `connector_status` reports actual
adapter configuration/readiness. Neither is a delivery receipt.

## Opt-in Mac Messages delivery

The selected demo adapter uses the designated host Mac's Messages application,
with its existing connected iMessage account and macOS Automation permission.
It does not send from each Huddle user's personal messaging account. A self-
entered destination is not an independently verified phone/Apple ID ownership
claim. Use the explicit demo opt-in and known participants.

Automatic dispatch requires all of: a permitted address under the rules below, module `MESSAGES_ENABLED`
set to true, a configured API, API `HUDDLE_MESSAGES_ENABLED` set to true, adapter
readiness, and a usable public HTTPS `PUBLIC_FRONTEND_BASE_URL` for the **same
database's frontend**. An old Vercel deployment pointed at another database is
not a valid invite destination for this preview. Localhost/LAN HTTP links do
not enable external dispatch. With missing settings, the invitation stays in-app.

One private outbox row is keyed by invitation ID. The scheduled procedure
rechecks the pending invitation/deadline and the current permitted address, marks sending before
HTTP, then calls service-protected `POST /connectors/messages/send` with
`{dispatchId,recipient,message}`. The API reports submitted or unavailable;
submitted means Messages accepted the operation, not that a recipient received
or read it. Ambiguous transport failure becomes unknown and is never retried
automatically. A delayed watchdog also marks an interrupted sending state unknown
without resending. A pending opt-out/cancellation prevents dispatch; it cannot
recall a message already submitted.

Visible statuses: in_app_only, queued, sending, submitted, unavailable, unknown
or cancelled. In-app delivery remains usable regardless of external status.
Check Messages manually before arranging another invitation after unknown.

## Max's Mac Contacts: search, select and link

`MAC_CONTACTS_OWNER_USERNAME` configures the canonical Huddle account allowed
to use this host Mac's Contacts; the intended demo owner is `maxli`. It has no
implicit default. The API additionally requires `HUDDLE_MAC_CONTACTS_ENABLED`
and the authorized Mac's Contacts/Automation permission. Other Huddle accounts
cannot search the host address book, even if they are the owner's friends.

The protected `POST /connectors/contacts/search {query}` returns at most ten
matching contacts, each with contactId (up to 512 characters), displayName
(up to 200), and up to twelve destinations. A destination contains value
(up to 254), label (up to 80), and kind phone/email. The module checks every
bound, validates address/kind agreement, strips extra provider fields and
rechecks the initiating account/session nonce after HTTP. A stale response
after logout/account switching does not return the previous owner's matches.

Search results remain transient. Only an explicitly selected contact/address
is linked privately to an accepted Huddle friend. No whole-book sync, automatic
choice between several Erics/numbers, or export to Claude is performed. US
ten-digit phone numbers normalize to +1 in the adapter; other unsupported
ambiguous formats remain unusable. The recipient does not need to pretype an
address for this designated-owner path.

Message destination priority is strict:

1. If the recipient has saved an enabled self-connector, use their own address.
2. A saved disabled self-connector is an explicit opt-out and blocks external
   delivery. No sender mapping can override it.
3. Only if the recipient has no saved self-connector row may the designated
   sender use their explicitly linked address for that current accepted friend.

An untouched default view is not a saved opt-out. Opening Connectors alone does
not create a setting; explicitly saving disabled does. Mapping addresses remain
visible only to their owner, never in friends, invitation status or group views.
Removing the friendship also removes its private mapping.

New invitations can use the permitted linked address when the host Messages
adapter and public URL are ready. Queuing captures that exact destination;
dispatch re-resolves permission/mapping and requires a match. Unlinking,
changing an address or opting out before dispatch suppresses the queued attempt.
Linking a contact after an old in-app invitation does not send it automatically:
the original sender must explicitly choose **Send invitation message**.

That action accepts only a pending, unexpired invitation in in_app_only or
unavailable state. Here unavailable means the adapter failed its preflight
before any submission attempt. queued/sending/submitted/unknown/cancelled states
cannot be resent. Repeated clicks and scheduled jobs do not create duplicate
dispatches, and ambiguous attempts are never automatically retried. In-app
invitation acceptance remains the authority regardless of external delivery.

## Google OAuth and encrypted storage

The owner's start procedure calls service-protected
`POST /connectors/google/start {accountId}`. Its response contains a Google
authorization URL, opaque stateId and expiresAt in epoch milliseconds. The
module binds that pending state to the owner account, initiating device/session
nonce, connection generation and deadline. A reconnect cancels older states.

The API's public Google callback verifies encrypted/signed OAuth state and its
deadline. Before exchanging the code it calls these service-secret-protected
Maincloud routes:

1. `POST /route/connectors/google/claim {stateId,accountId}` atomically consumes
   the pending state and returns a one-use claimNonce.
2. `POST /route/connectors/google/complete` supplies stateId, accountId,
   claimNonce and either an error or encrypted tokenCiphertext, email, scopes
   and optional expiresAt. The module rechecks generation, session and deadline
   before storing the result. A wrong/replayed nonce, logout, disconnect,
   superseded attempt or expiry cannot attach a credential.

The complete callback stores only an API-encrypted credential blob in Maincloud.
The encryption key and Google OAuth client secret remain in the API environment.
Tokens never appear in browser views, public group context or model inputs.
Event consent defaults off after every connection. Disconnect immediately removes
Huddle's stored credential and stops its use, then queues a one-use protected
`POST /connectors/google/revoke {accountId,tokenCiphertext}` call. An old queued
revoke is skipped after reconnecting, and a late reply cannot restore credentials
or overwrite a newer generation. If Google grant removal cannot be confirmed,
the owner sees that Huddle is disconnected and can manage this app in their
Google account. Provider errors never restore the local token or automatically
retry revocation.

## Scheduling and event boundary

Only authorized current-member calendar snapshots may leave Maincloud for the
service. Google free/busy retrieval is distinct from event-write consent. Busy
intervals stay inside the protected scheduling path; the shared result contains
the selected outing slot rather than personal event details. Provider failure
must not be interpreted as an empty/free calendar.

The internal `authorizedCalendarSnapshots` helper returns connected canonical
members with their account/member IDs, encrypted token, connection generation
and event consent. A caller must ensure every required member is represented.
`persistCalendarRefresh` commits refreshed encrypted credentials only if the
entire captured connection/consent snapshot is still current. A disconnect or
reconnect invalidates an in-flight refresh.

The coordinated scheduling/meetup actions must retain host ownership, current
input/run revision, confirmed hard constraints and completed current voting.
`schedule_huddle` calls the protected `/connectors/calendar/schedule` path with
the authorized snapshot and private current outing context. It searches at most
14 days, uses a 15–720-minute requested duration and respects members' private
outing-length limits. A successful result sets the shared date/window after
revision/connection checks. Both this path and manual `set_huddle_window` use
Berkeley's `America/Los_Angeles` timezone. Manual selection clears calendar-check
metadata and does not assert anyone is free. Both invalidate old planning results;
neither creates calendar events.

Event creation uses a stable meeting ID plus account ID for provider deduplication.
Every participant explicitly clicks **Add to my calendar** after the current ballot
has a timed winner. That click enables only their own event consent if necessary,
then calls `confirm_meetup`. Connecting alone never creates events. Both API write
paths (`/connectors/calendar/events`, `/connectors/calendar/meetup`) now require
exactly one connection; group availability still accepts multiple connections.
Encrypted credentials remain bound to that account. No external guests are invited.

Private `personal_meetup` rows are keyed by run/account, and
`personal_meetup_job` dispatches exactly that owner's connection. Before sending,
it rechecks membership, current winner/revision, connection generation and event
consent. A pending/sending/created/unknown prior personal submission blocks
another for that owner/Huddle; it never prevents a friend adding their own copy.
`my_meetup` exposes only the caller's status. Duplicate requests/jobs do not send
twice, and ambiguous provider outcomes remain unknown rather than reporting success.

Legacy `meetup`/`meetup_job` tables remain for history. Pending group-wide jobs are
retired without sending; earlier provider events are not changed or deleted.
Plan edits never silently update existing calendar entries. Provider writes are
mocked in automated verification; the browser checks do not create real events.

## Configuration names, without values

API: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`,
`HUDDLE_CONNECTOR_ENCRYPTION_KEY`, `HUDDLE_FRONTEND_BASE_URL`,
`HUDDLE_MESSAGES_ENABLED`, `HUDDLE_MAC_CONTACTS_ENABLED`, plus existing `HUDDLE_SHARED_SECRET`,
`SPACETIMEDB_URI` and `SPACETIMEDB_DB`.

Module: existing `FASTAPI_BASE_URL`/`HUDDLE_SHARED_SECRET`, plus
`MESSAGES_ENABLED`, `PUBLIC_FRONTEND_BASE_URL` and `MAC_CONTACTS_OWNER_USERNAME`. Both frontend base settings
must refer to the reviewed frontend connected to this module. Google requires
its callback URI to match the OAuth client configuration exactly. Missing
provider credentials should show setup-needed, never synthetic connected status.

## Current preview and Google setup

Frontend: [isolated preview](https://assessed-healthcare-equipment-sox.trycloudflare.com).
The API remains at `https://eat-days-means-magnetic.trycloudflare.com`, forwarding
to port 8002. The fixed callback for this run is
`https://eat-days-means-magnetic.trycloudflare.com/connectors/google/callback`.
It is an API callback, separate from the frontend `/connectors` return page and
the Maincloud claim/complete routes.

1. In the Google Cloud project, enable **Google Calendar API**. See Google's
   [Calendar setup](https://developers.google.com/workspace/calendar/api/quickstart/python).
2. In **Google Auth platform**, configure Branding. For a demo involving Google
   accounts outside one Workspace organization, use External/Testing and add
   each participating Google account under Audience → Test users. Add the app's
   scopes under Data Access. See [Google's consent setup](https://developers.google.com/workspace/guides/configure-oauth-consent).
3. Create/use an OAuth client of type **Web application** and register the exact
   callback above under Authorized redirect URIs. Its scheme, host, path and
   trailing slash must match `GOOGLE_REDIRECT_URI`; changing an API tunnel URL
   requires updating both places. See [Google's web-server OAuth flow](https://developers.google.com/identity/protocols/oauth2/web-server).
4. Keep the existing client ID, client secret and encryption key privately in
   ignored `api/.env`. Use the public preview origin for
   `HUDDLE_FRONTEND_BASE_URL`; the callback returns to its `/connectors` page.
   Keep the encryption key stable across restarts so saved credentials decrypt.
   No credential value belongs in browser configuration or these docs.
5. The code requests `openid`, `email`,
   `https://www.googleapis.com/auth/calendar.freebusy` and
   `https://www.googleapis.com/auth/calendar.events.owned`. Calendar permissions
   cover availability and events on calendars the user owns; app behavior limits
   this demo to the primary calendar. See [Google's scope definitions](https://developers.google.com/workspace/calendar/api/auth).
6. In a regular Chrome/Safari browser, sign into the intended Huddle account,
   open Connectors and choose Connect Google Calendar. The user reviews Google
   consent and returns to the fixed preview. Only then should the owner see
   connected. Event creation remains a separate opt-in and explicit host action.

External/Testing calendar refresh tokens can expire after seven days, so a demo
account may need to reconnect later. See [Google's token-expiration guidance](https://developers.google.com/identity/protocols/oauth2).
The current Google configuration flag is true and Max reports Calendar working;
automated live availability/event-write confirmation remains a separate step.

## Owner-only Calendar verification

On `codex/multi-city-coverage`, 225 module tests passed (one opt-in external test
skipped), 126 API tests passed, and module typecheck/web build/lint passed. The
provider tests verify two independent owners, non-host additions, owner-private
status, swapped-credential rejection, one-account API limits, consent/reconnect
changes, stale plans, duplicate dispatch and retirement of legacy group-wide jobs.

The isolated preview passed 39 connected browser checks, including both host and
non-host Done actions, each account's connection requirement and `.ics` export,
phone layout and reopening a finished Huddle. Two running API checks returned
422 for multi-account `/events` and `/meetup` requests before provider dispatch.
Google event creation remains mocked in tests; no real event was created.

Release the updated module, API and UI together. The new private tables are
additive; keep `--delete-data=never`. No OAuth scopes, keys, callback URLs, Eric's
scraper or shared tunnel settings changed. Shared/main/Vercel release is pending.
