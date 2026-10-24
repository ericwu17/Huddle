# Huddle interface and account proposal

Proposed enhancements, October 24, 2026. Extend the
[current product direction](CURRENT_CONTEXT.md) with a consistent shadcn UI,
username/password accounts, personal context, contacts and a prompt-driven
start screen. These are proposed changes, not currently implemented features.

The core flow is now all members' prompts -> confirmed needs -> agent proposals
-> code validation -> discussion/choice. Retire mandatory swipes and numerical
confidence from the replacement UI after the shared contract migration. The
coordinator uses current huddle prompt context privately; the conversation screen
shows explanations and trade-offs without exposing participants' raw prompts or
caps. Keep separate Vite/FastAPI processes locally; shared access uses Vercel,
Maincloud and local FastAPI behind a public tunnel for now. Hosted API migration
is deferred and the earlier all-local database plan is superseded. See
[the agent flow for review](AGENT_FLOW_PLAN.md) before changing runtime contracts.

The demo remains the priority: correct plans, clear interactions and a reliable
group flow. Introduce the new interface in stages so unfinished account, voice
or integration work does not block the existing demonstration.

## Proposed signed in experience

After login, the primary screen is **Start a huddle**. The user can select
existing Huddle contacts, describe an outing, or join someone else's huddle with
a code. A microphone button provides an alternative to typing when supported.
Show the current huddle and recent personal history as secondary entry points.

Use a persistent navigation menu, with a sidebar on larger screens and a menu
sheet on phones:

| Destination | Contents | Rationale |
| --- | --- | --- |
| Start a huddle | Prompt, selected contacts, start action and join-by-code action | Make the main task immediately available |
| Current huddle | Participants/status, agent conversation, plans, voting and booking | Keep group decisions and next actions together |
| Contacts | People the user has previously joined a huddle with | Reduce repeated code sharing for familiar groups |
| History | The user's prior huddles, participants, plans and recorded outcomes | Provide useful personal context across outings |
| Preferences | The user's saved tastes/defaults and explanations of their use | Let the user inspect and correct remembered context |
| Settings | Account/logout and AI provider keys; integrations in a later stage | Separate personal configuration from the group workflow |

An authenticated user can inspect their own context and the shared information
in huddles they belong to. Other participants' private preferences, caps,
offers, provider credentials and unrelated history remain private.

## Shadcn design system

Adopt shadcn/ui within the existing Vite/React application and Tailwind setup.
Use shared semantic colors, typography, spacing, focus states and component
variants. Choose one consistent treatment for forms, buttons, cards, dialogs,
badges, loading/empty/error states and navigation. shadcn provides the component
foundation; the application still needs consistent layout and content decisions.
The [official Vite setup](https://ui.shadcn.com/docs/installation/vite) supports
adopting it in the existing frontend.

**Rationale:** Shared components make the app easier to understand and maintain
while reducing inconsistent controls across the current screens. Vite remains
the frontend server; this proposal does not require a framework migration.

Use the shadcn CLI and current component documentation during implementation,
inspect existing aliases/styles before initialization, and migrate one complete
flow first. Reuse accessible components instead of recreating dialogs or menus.
Treat the separate landing page as its own surface; preserve it unless a visual
change is specifically included in the implementation scope.

**Acceptance:** The start/join flow and current-huddle screens use consistent
controls, keyboard focus and clear labels on desktop and phone layouts. Existing
actions, realtime updates and simulated-result disclosures continue to work.

## Username and password accounts

Provide a simple username/password login and logout experience. Pre-created
demo accounts can keep initial onboarding small; self-service registration and
password recovery are separate follow-up choices.

**Rationale:** A persistent account lets a person return on another device and
recover their contacts, preferences and huddle history. The current saved
SpacetimeDB device token is an identity/reconnect mechanism, not the requested
username/password account system.

The backend must verify credentials and bind the authenticated session to a
stable account and a verified SpacetimeDB identity. Use maintained authentication
and password-hashing components. Restrict accepted token issuers/claims and
derive ownership from verified identity, never a username/account ID supplied
by the browser. A login form alone does not establish access control.

Select and prove a SpacetimeDB-compatible authentication approach before changing
shared contracts. SpacetimeDB documents OIDC tokens; the choice of provider or
local authentication adapter remains an implementation decision. Prefer fitting
the adapter into the existing host setup if that can be done correctly; record
any extra service dependency before adding it. Keep authentication separate
from the stateless solver functions and service-to-service shared secret.
See [SpacetimeDB authentication](https://spacetimedb.com/docs/core-concepts/authentication/)
for the supported identity model.

**Acceptance:** Two accounts logging in from separate devices recover their own
data. Switching accounts/logout clears prior client subscriptions and cached
personal state. The new account cannot read or mutate the previous account's
data through the UI, direct API calls or database subscriptions. Anonymous
device identities do not silently become ownership of an existing account.

## Personal context and history

Persist each account's saved preferences, prior huddle memberships, recorded
plans/outcomes and contact relationships. A user's history can show where an
outing was planned and who participated. Distinguish a suggested plan from a
booking and an outing actually marked completed; simulated bookings stay labeled.

**Rationale:** Context can reduce repeated input, while explicit history lets
people understand and correct what the app remembers.

Each huddle has an account membership; one account can belong to many huddles.
Provide an explicit current-huddle selection and membership checks for history
and live views. The existing backend infers the current group from the most
recent join, so multiple saved huddles require more than a frontend history list.
Keep account IDs separate from the existing per-huddle member IDs.

Allow users to inspect, edit and clear their saved context. Use only the acting
user's authorized history/preferences when forming their initial prompt context.
Other participants supply their own private inputs. Defaults may prefill a new
outing for review; history or model inference must never raise an active outing
budget. Existing increases still require that user's explicit private-offer
acceptance.

**Acceptance:** Account A sees only its own personal history and permitted group
records. Editing A's defaults changes neither B's preferences nor the recorded
limits of an existing outing. Switching current huddles never mixes votes,
offers, council messages or booking actions across groups.

## Contacts and huddle creation

The start screen supports selecting existing Huddle contacts and inviting them
to a new huddle. Keep the code/QR join route for people who are not yet contacts.
Selected contacts receive a pending invitation; they join explicitly rather than
being silently added as ready participants.

After users successfully join the same huddle, automatically add the other
joined users to each person's Huddle contacts. Deduplicate by stable account ID,
including after reconnects or repeat outings. Pending invitations and matching
display names are not sufficient to create a contact relationship. Explain this
behavior at join and allow contact removal.

**Rationale:** The first outing establishes the relationship; later outings can
start with fewer steps. Joining a group does not share a person's private
profile, spending limits or unrelated contacts.

**Acceptance:** Joining once creates reciprocal contacts for joined accounts;
rejoining creates no duplicates. Invited users retain control of joining,
readiness, private limits and votes. The code route still works for a new user
through the chosen login/onboarding flow.

## Text and voice prompts with personal context

Support a typed request such as "Dinner with Sam and Riley tomorrow, under $20
for me." Retrieve the acting user's authorized context, use Claude to propose
structured huddle details, resolve people against that user's contacts, and show
an editable confirmation before creating the huddle or sending invitations.
Ask for clarification when a contact or requested detail is ambiguous.

For voice, provide microphone start/stop, recording/transcribing/error states,
an editable transcript and the same confirmation flow. The existing Claude
preference parser accepts text, so a separate speech-to-text step must produce
that text first. Select a supported browser or backend transcription approach
before implementation; do not assume the current parser accepts audio.

**Rationale:** Voice makes starting an outing convenient, while a visible
transcript and confirmation keep inferred contacts and constraints correct.
Always retain typed input as the working fallback.

Only authorized context should reach the parser. Invitees' private profiles are
not part of the initiator's prompt. Agent output cannot change another person's
budget, mark them ready or authorize a booking.

After members join and submit their own prompts, the huddle coordinator can use
all of those submissions internally, as described in [CURRENT_CONTEXT.md](CURRENT_CONTEXT.md).
Keep that group-planning context distinct from the initiator's start prompt and
from the public conversation. Ask each participant to confirm their own inferred
requirements; their input updates the current huddle context and invalidates
superseded recommendations.

**Acceptance:** Permission denial, unavailable transcription or Claude failure
leave a usable typed form. Wrong/ambiguous contacts can be corrected before any
invitation. No raw audio is retained by default. Confirm microphone behavior
on the actual demo phones and supported browser.

## Agent conversation and group navigation

Make the current huddle's agent conversation a persistent, readable screen.
Show the coordinator's visible progress and a clear explanation of the
recommendation; show participant advocates only if that agent design is used.
Keep navigation between conversation, plans and voting
available after the vote opens. Separate recording/cached/fallback labels from
live messages.

**Rationale:** Users should be able to understand how their group reached the
decision, rather than losing the debate when the next stage begins.

The existing validated council transcript can remain visible during migration.
For the new flow, agree how coordinator messages, clarifications, input updates
and plan revisions are stored and displayed before changing shared contracts.
Additional tools or autonomous actions require their own behavior contract. Show
user-facing messages and supported facts, not hidden prompts or private model
reasoning. Preserve privacy when an advocate uses its member's context.

**Acceptance:** Only members can view a huddle's discussion. Private caps,
credentials and other accounts' context never appear in the shared transcript.
The conversation remains accessible after voting starts and across refreshes.

## Personal AI keys and future integrations

Add an AI keys settings screen for adding, testing, replacing and removing a
personal Claude key. The initial personal-key scope is parsing that user's
start-huddle prompt. Define the host-provided demo key separately; using another
member's key or extending personal-key use to group council calls requires an
explicit product decision.

**Rationale:** Personal credentials can support later provider choices while
making ownership and usage clear.

Keep full keys in protected server-side credential storage, encrypted at rest
with the encryption secret kept outside the database/repository. The browser
may submit a key over an authenticated secure connection, but never persists it
in localStorage or receives the full value on later reads. Return only presence,
masked hints and validation status. Use the verified acting account to select
credentials per request; do not replace the global Claude client/key while
multiple users are using the app.

Add an **Integrations** area later for providers such as Yelp and calendar
services, using MCP where the vendor supports it and a documented API otherwise.
Verify the vendor's actual interface and authentication before showing a working
connection. Present connection status, permissions, disconnect and errors;
keep advanced agent/harness configuration behind this simple interface. Start
with read-only tools; calendar writes and other external actions need an
explicit user-reviewed action. Never present a placeholder as connected.

**Acceptance:** Another account cannot retrieve or use the stored key. Concurrent
prompt requests use the correct account's credentials, and removal stops future
use. Provider/tool errors preserve the core huddle flow and do not expose secrets.

## Dependencies and shared contract decisions

| Decision | Why it must be resolved before implementation |
| --- | --- |
| Account authentication and SpacetimeDB identity binding | Existing views use device identity; username/password must establish a trustworthy account identity |
| Account/membership/history/contact contracts | Multiple saved huddles and contacts need new data ownership and explicit current-group selection |
| Start-huddle intent contract | Existing `/parse-prefs` describes one person's preferences, not contact invitations or group creation details |
| User-facing auth/key API access | The current loopback FastAPI endpoints are called only by SpacetimeDB. New browser-facing account/settings requests need a user-authenticated route, for example through Vite's proxy to the existing Python process; never expose the shared service secret |
| Secure browser transport on phones | The initial HTTP LAN setup is not sufficient for real passwords/provider keys. Microphone capture through `getUserMedia` requires a secure context; plan trusted HTTPS and database WSS before enabling these features on phones |
| Speech-to-text and key usage policy | Choose how audio becomes text, what is retained, and which account pays for each provider request |
| Provider integration contracts | MCP/API support, scopes, credentials and action permissions vary by vendor |

Treat these as new proposed contracts. Update `docs/CONTRACT.md` and generated
bindings only when the account and service boundaries have been agreed. Preserve
the existing solver JSON shapes and budget/privacy rules; do not silently extend
them to carry credentials or unrelated account history.

The hosting plan's HTTP addresses describe the initial typed, device-identity
demo. The enhanced login/key/voice experience adds an HTTPS/WSS configuration
step; it does not require a cloud migration. The concrete local certificate or
gateway arrangement must be tested on participants' phones. Until that step is
ready, keep the existing core flow usable and label unfinished enhancements.
The [browser microphone requirements](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
explain the secure-context requirement and permission behavior.

## Suggested delivery order

| Stage | Deliverable | Dependency and demo priority |
| --- | --- | --- |
| U1 | shadcn shell, primary Start a huddle screen, readable current-huddle conversation | Can improve the current demo without changing identity contracts |
| U2 | Authentication/identity proof, secure phone access, login/logout and user-scoped membership | Foundation for all claimed account-specific behavior; test two real accounts first |
| U3 | Personal preferences/history, contacts, invitations and auto-contact creation | Requires U2; start with a few genuine demo accounts and recorded history |
| U4 | Context-aware typed start prompt and preview/confirmation | Requires authorized context and an agreed start-intent contract; use the host key for the first demo if personal keys are not ready |
| U5 | Personal Claude-key settings and voice input | Requires secure credential storage/transport; voice also requires transcription and browser verification |
| U6 | Vendor connections and advanced MCP/harness management | Later enhancement; not required for the core demo |

These stages are additional to the five hosting phases in the parent plan.
Keep correctness and a rehearsed core flow ahead of unfinished additions. Eric
Chen can lead the shadcn/navigation work, Max can coordinate context/contract
design and verification, and Eric Wu can review Python/Claude integration.
Assign the authentication implementation explicitly before U2 rather than
treating it as a visual-only UI task.

## References

- [Single laptop change plan](SINGLE_LAPTOP_PLAN.md), [existing contracts](CONTRACT.md)
  and [honesty list](HONESTY.md).
