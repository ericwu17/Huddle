# Proposal: prompt-first Huddle with profiles, contacts and invitations

October 24, 2026. Max approved the account/contact/invitation and structured
preference implementation on the preview branch. Account ownership, friends,
durable in-app invitations with opening links, private editable saved defaults,
and optional preference sliders are implemented on isolated Maincloud and local
Vite. Passwords now require eight characters, with Show/Hide while typing; QR UI
has been removed. Verification shows 94 Python passes, 124 server passes/one
opt-in skip and 41 connected passes with real Claude and simulated booking.
The final desktop/mobile browser journey passed 30 assertions after the map fix,
with no page/console errors. Max is reviewing with a separate test-bot browser.
The branch has not been pushed. Shared Maincloud/Vercel remain unchanged until
Max's review and release instruction.
See [contract](ACCOUNTS_CONTRACT.md) and [review runbook](ACCOUNTS_RUNBOOK.md).
Eric Wu continues Bright Data → SpacetimeDB ingestion; his files are untouched.

Natural-language recipient resolution and optional Messages/Google Calendar
connectors are now implemented on the isolated branch. Real Google consent and
provider writes still need a participant test; Messages now reports ready on Max’s Mac, but no real send has been verified. See [CONNECTORS_CONTRACT.md](CONNECTORS_CONTRACT.md). Inferred memory,
general SMS/email/push, voice input and the Claude proposal/revision rewrite
remain follow-ups.

## Product direction

The signed-in home centers on invitation intent: “Dinner with Sam and Riley.”
Claude resolves real contacts for a reviewed recipient list; the owner chooses
between ambiguous names and confirms before sending. A friend-picker fallback
works without Claude. Use the illustrated theme in [Design.md](../Design.md),
with accessible controls. Private budget/time sliders and restrictions belong
inside the accepted Huddle, separately from the invitation prompt.

For known contacts, use an Invite friends dropdown. The recipient sees a durable
in-app message with a clickable /invite/:id opening link. The link is addressed
to that account, not a bearer credential granting anyone membership. People can
also visit the website, sign in and open their Inbox. The legacy join route is
retained for anonymous huddles; it cannot bypass invitations for account-hosted
huddles. New users can register and
connect by a unique username. Private phone contacts are not automatically
imported. Find friends by exact username, then explicitly accept the request. Accepted
huddle membership also creates reciprocal contacts among account participants.

## Implemented flow and remaining extensions

1. The initiator signs in, writes an invitation prompt or selects contacts.
   This text never becomes private preferences. The saved-huddle list recovers
   memberships/status; inferred personal history is not implemented.
2. Review actual friend matches from Claude or select exact recipients in the
   picker. Unknown or ambiguous names require an explicit choice; nobody is
   invited by typing or parsing alone.
3. Preview the exact recipients and shared invitation details. Explicit
   **Start & invite** creates the huddle and pending invitations. Typing, parsing
   or autocomplete never sends invitations by itself.
4. Recipients get a durable in-app item such as “Max wants to hang out with Huddle!” with
   shared details and invitation status. Notification text contains no raw private
   prompt, cap or restriction.
5. On visiting the website, recipients see their own inbox and choose whether to
   join. Inviting does not mark them joined/ready, expose their profile, submit
   their preferences or cast a vote.
6. After joining, their own defaults may prefill editable private outing inputs.
   They can change today's vibe, adjust sliders or leave optional dimensions
   flexible. Use the implemented one Save & ready action; clarify only consequential
   ambiguity.
7. Planning uses current members' authorized outing inputs. The current path
   still uses the bundled venue catalog; the reviewed, versioned SpacetimeDB
   venue snapshot and Claude proposal/revision loop remain follow-ups. Context
   stays huddle-scoped. Voting/simulated booking retain ownership/stale-result guards.
8. An explicit Remember choice can save the owner's editable defaults. Inferred
   memories, post-outing feedback and actual-visit history remain follow-ups.
   A suggestion, vote or simulated booking is not proof of a visit or preference.

## Notifications: start small

Start with an account-scoped invitation inbox persisted in SpacetimeDB and updated
in realtime while connected. Invitations survive logout, a closed tab and a later
visit. The implemented badge counts pending invitations/requests; messages show
pending, accepted, declined and expired/canceled states. A distinct read/unread
receipt is not implemented.

Literal SMS is a later delivery adapter requiring a messaging service, verified
destination ownership, notification preferences and visible delivery status.
Email/browser push are other later channels, not implemented capabilities. An
in-app inbox alone does not alert someone away from the website; disclose that
distinction in the demo. The invitation remains authoritative whether external
delivery succeeds or fails. Reconnects/retries must not create duplicate huddles
or invitations. The optional recipient-opted-in Messages adapter submits the
public addressed link from Max’s Mac. Its outbox distinguishes queued, submitted,
unavailable and unknown; unknown never triggers an automatic resend. Actual
provider delivery remains unverified, and no general SMS/email/push service is
configured.

## Personal context: useful defaults with user control

| Context layer | Examples | Rule |
| --- | --- | --- |
| Explicit saved defaults | Favorite foods, user-saved dietary restrictions, usual preferences | Owner can inspect, edit and forget them; show when they are reused. |
| Today's private override | Mood, craving, available time and this outing's cap | Applies only here unless the user explicitly chooses to save it. |
| Recorded history | Membership, selected plans and accurately recorded outcomes | Membership-scoped; distinguish proposed, simulated-booked and actually completed. |
| Suggested memory | “You often choose outdoor activities” | A sourced suggestion, not a confirmed restriction; user chooses whether to remember it. |

Autofill should be an editable suggestion: “Using your saved vegetarian
preference; anything different today?” Prefer a compact summary over fabricated
first-person text that looks newly written by the user. Provide edit, forget and
use-once controls. Do not infer allergies, hard caps, availability or attendance
from clicks/history. Do not ask users to repeat already explicit profile facts.

Untouched options without a consciously applied saved default stay flexible, per
[PREFERENCE_ACCEPTANCE_PLAN.md](PREFERENCE_ACCEPTANCE_PLAN.md). Blank text is not
consent to erase a known current restriction. Saved context cannot raise/remove
an established outing cap; that still requires owner acceptance of a current
private trade offer. The owner sets each new outing's initial cap independently
of the previous outing's cap.

Each person's context is theirs. A name mention does not authorize the initiator
to retrieve an invitee's private profile. Invitees bring their own context after
joining. Only an authorized current-huddle snapshot reaches the coordinator;
other participants see shared plans/reasons, not private profiles/prompts. Do not
store hidden model reasoning as personal memory.

## Dependencies and rollout

The implemented branch binds each authenticated device to a stable application
account through a private revocable session. Durable memberships and explicit
per-device huddle selection replace latest-join selection for account users.
Private saved context, friendships and invitations are held in SpacetimeDB;
FastAPI checks password hashes and receives authorized outing snapshots only.
Legacy anonymous memberships are not silently imported.

| Stage | Deliverable | Acceptance |
| --- | --- | --- |
| 1 | Stable accounts and account-scoped memberships, using two demo users | Each can return on another device, switch outings and access only permitted records. |
| 2 | Contacts, contact picker and durable in-app invitations | A recipient signs in and accepts through Inbox or the addressed opening link; outsiders cannot claim it. |
| 3 | Prompt-first intent parsing and invitation preview | Recipients/details are editable before explicit Start & invite; retries create no duplicates. |
| 4 | Explicit defaults, today's overrides and editable autofill | Overrides do not rewrite saved defaults/current caps; forgetting context stops reuse; simulated outcomes never become invented visits. |
| 5 | Optional external delivery | Delivery status/failure is visible; invitation remains in-app. Test with approved recipients and configured preferences. |

Stages 1, 2 and explicit defaults in 4 are implemented on the isolated branch.
Stage 3 currently provides a prompt and explicit friend selection, while natural-
language recipient/outing intent resolution remains deferred. The future history
and suggested-memory rows above describe intended extensions, not automatic
learning that the preview already performs.

The next data/planner handoff prioritizes evidenced menu items/prices, takeout
support, suitable shared seating and attributed photos. Eric's reported export
still requires source/sample review; inferred dietary tags and default meal
prices do not verify vegan/allergen claims or actual hard-cap compliance. Max
has approved each person paying for their own meal plus subsequent stops, such
as dessert; nobody pays for another person's meal. Participant assignments and
item-price representation require a coordinated contract follow-up, so the
current shared-stop cost implementation remains unchanged.

Prove the small account → invite → accept journey before broad memory inference,
address-book sync or background agents. The optional host-Mac delivery and
Google Calendar paths require real participant verification before demo claims. Keep data/Claude
correctness and preference work as parallel priorities; this does not approve a
hosting migration or replace Eric Wu's ingestion task.

Suggested coordination: Eric Chen designs prompt/inbox/profile UI; Max owns
context rules and verification. Max implements account/membership/invitation persistence in this preview; avoid
diverting Eric Wu from active ingestion without coordination.

See [interface proposal](INTERFACE_PROPOSAL.md),
[preference scenarios](PREFERENCE_ACCEPTANCE_PLAN.md) and [open tasks](NEXT_TASKS.md).
