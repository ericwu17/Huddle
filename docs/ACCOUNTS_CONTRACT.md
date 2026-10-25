# Accounts, context, friends and invitations contract

October 24, 2026. Branch implementation: username/password registration/login,
logout, stable account ownership across devices, own memberships and explicit
active-huddle selection, private editable defaults, reciprocal friends and
addressed in-app invitations. Bright Data ingestion is untouched. These changes
require isolated review before a coordinated shared publication.

## Identity and ownership

SpacetimeDB still authenticates each connection with its server-issued bearer
token. A private `account_session` row binds that device identity to an account
only after a successful service-verified password check. It is revocable, expires
after 24 hours, and has a nonce so late login responses cannot undo logout or a
newer attempt. A retained logged-out row prevents fallback into anonymous access.

Each account has a unique internal principal used in existing member/host rows.
It is an opaque ownership identifier, not a client-supplied identity or JWT. New
devices resolve to the same account principal through verified sessions. A
browser-provided account ID, username or localStorage membership never grants
ownership. Legacy anonymous clients remain compatible; anonymous huddles are
not automatically imported into a newly created account.

Private tables: `account` (normalized unique username, display name, password
hash, principal, timestamps), `account_session` (device identity, account binding,
nonce, active group, deadline), `account_membership` (account/group/member/role),
`account_auth_attempt` (bounded login attempt windows), and a scheduled session
expiry table. Existing group/member and planner contracts are retained.

Views resolve the active account's selected membership. Mutations additionally
check the session deadline; scheduled expiry clears the binding and reevaluates
subscriptions. No account principal, password/hash or other account's membership
is returned by public views. Raw tables stay private.

## Client actions and views

| Action | Input / behavior |
| --- | --- |
| `register_account` | username, password, displayName; create account and sign this device in after service verification |
| `login_account` | username, password; generic invalid-credentials response, bind only the verified account |
| `logout_account` | Revoke this device's binding, clear selected group and invalidate in-flight login replies |
| `select_huddle` | groupId; require this account's existing membership before changing its selected huddle |
| `my_account` | Own accountId, username, displayName, activeGroupId and expiresAt; no row while signed out |
| `my_account_memberships` | Only own membership IDs, group IDs/codes/status, member/name and host role |

Usernames are case-insensitive ASCII handles, 3–24 characters, letters/digits/
underscore. Display names are 1–40 characters. Passwords are 8–128 characters
and never trimmed or stored in browser storage. Registration/login return an
`ok` boolean and safe `message`; identity comes from the scoped account view.
Sign out before switching accounts. Same-account login on another device creates
another revocable device session, not another account or membership.

Account group creation/join uses the account principal and persisted display name.
The compatibility backend still accepts a huddle's four-letter code while it is
gathering people (the behavior merged from `c24c556`). Signed-in code joiners get
a durable membership; guests join by first name. The account UI uses the friend
dropdown and addressed Inbox invitations, with QR/code sharing removed.
`removeHuddle` removes a huddle from the caller's own list only. Accepting an
addressed invitation creates/reuses a durable membership and selects that group
for this device. Selecting an old huddle changes no readiness, needs, votes or
booking. Joining never implies readiness or acceptance of anyone else's limits.

## Explicit Huddle names

Home's **Start a huddle** opens a themed naming dialog before the invitation/lobby
screen. Suggestions fill the name input; Cancel/Escape creates nothing. **Skip
for now** keeps the existing default. A name is an explicit shared label, never
auto-derived from private preference text.

The additive `create_named_invitation_huddle` procedure takes the original
`requestId, summary, outingKind, friendAccountIds` arguments followed by `name`.
It atomically creates the named group, host membership and any addressed invites.
Names normalize whitespace and must contain 1–80 characters. The normalized name
is part of the idempotency fingerprint; a repeated request returns the same group,
while changed inputs cannot silently rename or duplicate it. The original
four-argument `create_invitation_huddle` contract remains unchanged and still
ignores untrusted summary text for the public label. Guest creation uses the
existing optional `name` field with the same validation.

`my_huddle_names` returns `{groupId, name?}` only for the caller's verified account
memberships (or the current anonymous group). It leaves member display names and
existing wire shapes unchanged. Home, the group header and addressed invitations
show the saved label; it survives refresh and same-account login on another device.
Run `SPACETIMEDB_URI=... SPACETIMEDB_DB=... node scripts/huddle-names-smoke.mjs`
against an explicit test database for synthetic connected contract checks.

## Private, explicitly saved context

`account_context` is private and keyed by account ID. `my_account_context` returns
only the signed-in owner's optional row: accountId, contextJson, revision and
updatedAt. `save_account_context({contextJson})` validates and replaces that
owner's defaults; `clear_account_context` removes them. Neither action changes
an existing outing's hard requirements, confirmed needs or budget cap.

The JSON contract is `{version:1, preferences:string, dietary:string[],
allergies:string[], budgetMaxPerPerson:number|null, maxOutingMinutes:number|null,
maxTravelMinutes?:number|null}`. Dietary
values use the existing five-value API enum; at most 12 explicit allergy labels
are allowed. Notes support the same 4,000-character limit as an outing prompt.
Null means flexible, and zero remains a real cap. Unsupported
fields, malformed values and non-finite/out-of-range limits are rejected.
Saved defaults require an explicit owner action. Prompt interpretation does not
silently create persistent memories or infer actual visits from demo bookings.

## Friends and in-app invitation messages

All underlying contact, request and invitation tables are private. Browsers can
subscribe only to their own `my_friends`, `my_friend_requests` and
`my_huddle_invitations` views. There is no all-account directory or search dump.

| Action | Input / behavior |
| --- | --- |
| `request_friend` | Exact username; request consent from that account. Repeating a pending request is idempotent. Explicit crossing requests accept the friendship. |
| `respond_friend_request` | requestId, accept; only the addressed recipient can accept/decline. Acceptance creates reciprocal contacts. |
| `remove_friend` | friendAccountId; removes both contact directions and cancels outstanding invitations between those accounts. |
| `invite_friends` | groupId, friendAccountIds; caller must belong to the huddle, and every recipient must be a current friend. Duplicate pending invitations are reused. |
| `respond_huddle_invitation` | invitationId, accept; only the addressed account can accept/decline. Acceptance atomically joins/selects without marking ready. |
| `cancel_huddle_invitation` | invitationId; only the sender may cancel a pending invitation. |

Friend requests expose sender/recipient IDs, handles and display names, direction,
status and createdAt only to those two accounts. Friend rows expose the friend's
accountId, username and displayName, never their saved context or private needs.

Invitation rows expose id, groupId/groupName, sender ID/displayName, recipient
ID/username/displayName, direction, status, message, path and timestamps only to
sender/recipient. The message reads “[display name] wants to hang out with Huddle!”
and contains an addressed link path `/invite/:id`. The destination requires
the addressed account to sign in: copying a link cannot grant membership.
Notifications are durable in-app messages. An optional recipient-opted-in
host-Mac Messages adapter submits the same invitation link through a private
outbox; submitted is not a delivery receipt. Max can privately link a selected
Mac Contacts destination to an accepted friend and explicitly invite them. A
recipient's saved address or explicit opt-out is authoritative. Contacts search
is restricted to the configured Mac owner; other users cannot read that book. General SMS/email/push providers
are not integrated. See [CONNECTORS_CONTRACT.md](CONNECTORS_CONTRACT.md).

Invitations expire after 24 hours through a scheduled job; acceptance also checks
the actual deadline. New members may join only lobby/eliciting huddles, with a
maximum of 12 participants. Repeating an accepted invitation safely reopens the
same membership. Declined/cancelled/expired invitations cannot grant access.
An accepted shared huddle connects its account participants as contacts without
copying anyone's private defaults. These actions do not confirm preferences or
raise a cumulative outing budget.

## Password service boundary

Add authenticated `POST /accounts/credentials` to the existing FastAPI service.
The module sends action (`register`/`login`), normalized username, password and
an optional private credential snapshot. FastAPI Users' UserManager and Argon2
password helper perform registration/authentication on a request-local snapshot.
Maincloud commits the returned hash/account binding atomically after rechecking
the pending nonce and credential snapshot. No account data is kept globally in
Python, and no additional database/provider is required.

This endpoint is service-only, protected by the existing `X-Huddle-Secret`.
The browser calls Maincloud procedures over HTTPS/WSS; it never receives the
service secret or the private snapshot. Passwords are not stored in module rows,
logs, URLs, returned views or localStorage. Invalid input responses must not echo
the password/hash. HTTP retry is disabled for the credential route. Module
attempt windows throttle both username and device attempts.

## Browser lifecycle and compatibility

The login page supports registration and sign-in, with an eight-character minimum
and an accessible Show/Hide password control. The account view gates saved
membership controls. After successful login, clear old local group sessions and
remount the connection/UI so no previous account's subscribed state survives.
Logout first revokes server-side state, then clears local sessions/token and
reloads the signed-out page. The old bearer cannot read account data after revoke.
No cached localStorage group session can authorize a foreign membership.

The signed-in home uses an invitation-only prompt. Claude resolves only actual
friends, the initiator reviews named matches and resolves unknown/ambiguous names,
then explicitly starts invitations. Typing or reviewing never sends anything.
A picker-only fallback works without Claude. Home text does not seed anyone's
private needs or saved defaults. The atomic start is scoped to the owner's
idempotency key and recipient fingerprint, so retries recover one Huddle. The inbox and navigation badge show pending
friend requests and invitation messages. Opening an addressed link while signed
out preserves that invitation destination through sign-in. The invitation screen
waits for both the account's active-group selection and the scoped group view
before navigating into the accepted huddle. No QR component is used in this flow.

Saved defaults prefill editable outing inputs. The owner's explicit Save & ready
submits those inputs, and an optional Remember choice saves their own defaults.
The saved-huddle list reflects memberships/status, rather than inferred visits,
automatically learned tastes or a complete personal activity history.

Keep legacy anonymous-huddle joining during migration. Existing member/host checks must
resolve the account principal consistently, including agent generation, booking
and private views. No global issuer restriction is added that breaks old clients.

## Acceptance gate

Two accounts on separate browser profiles can register/log in, create separate
huddles and see only their own membership/private data. The same account on a
fresh device recovers memberships and can select old huddles. Wrong passwords,
case-insensitive duplicate names, foreign selection, expired/revoked sessions,
forged local group data and late login replies are rejected. Legacy tests pass.
Verify isolated Maincloud, then coordinate shared additive publication without
data reset. No shared rollout or Git push is implied by writing this contract.

Password reset/change, account deletion, username/display-name editing after
registration, email verification, account linking/import, inferred personal
memory, general SMS/email/push providers and further production abuse protection
remain follow-ups. The optional Mac Messages demo path is documented separately. Use a unique demo password; these flows do not send email or
SMS. Sign-up and sign-in require the configured FastAPI password service/tunnel
to be available; account/context/contact state persists in SpacetimeDB. The
preview's accounts are in the isolated review database until a shared release
is explicitly coordinated. See [next tasks](NEXT_TASKS.md).

References: [FastAPI Users UserManager](https://fastapi-users.github.io/fastapi-users/latest/configuration/user-manager/)
and [SpacetimeDB server-issued identity tokens](https://spacetimedb.com/docs/core-concepts/authentication/).
The application binding described here adds account ownership/revocation above
the verified device token; it does not introduce a custom OIDC issuer.
