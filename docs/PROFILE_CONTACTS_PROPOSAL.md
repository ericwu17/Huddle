# Proposal: prompt-first Huddle with profiles, contacts and invitations

October 24, 2026. Product proposal for review, **not implemented or approved for
immediate implementation**. Preference changes, the Claude planner rewrite and
this account/invitation work remain follow-ups. Eric Wu continues Bright Data →
SpacetimeDB ingestion. Keep the working demo available during migration.

## Product direction

The signed-in home screen centers on one prompt: “Dinner with Sam and Riley
tonight, something relaxed.” Resolve names against actual Huddle contacts and
show selected contact chips plus an editable outing preview. Use the illustrated
theme in [Design.md](../Design.md), with accessible controls. Optional budget/time
sliders and restrictions stay available without making the home a long form.

For known contacts, the target journey requires no QR, invitation link or shared
group code. People visit the normal website, sign in and see invitations/active
outings. Keep the current join route during migration; retire it only after
account discovery, invitations and re-entry work. New users can register and
connect by a unique username. Private phone contacts are not automatically
imported. Exact contact discovery/add behavior needs agreement.

## Proposed flow

1. The initiator signs in, writes a prompt or selects contacts/options. Load only
   their own authorized defaults/history for this draft.
2. Claude proposes an outing intent and resolves names to existing contact
   candidates. Duplicate names need a picker. Unknown names must not resolve to
   guessed people or trigger messages.
3. Preview the exact recipients and shared invitation details. Explicit
   **Start & invite** creates the huddle and pending invitations. Typing, parsing
   or autocomplete never sends invitations by itself.
4. Recipients get a durable in-app item such as “Huddle started by Max,” with
   shared details and invitation status. Notification text contains no raw private
   prompt, cap or restriction.
5. On visiting the website, recipients see their own inbox and choose whether to
   join. Inviting does not mark them joined/ready, expose their profile, submit
   their preferences or cast a vote.
6. After joining, their own defaults may prefill editable private outing inputs.
   They can change today's vibe, adjust sliders or leave optional dimensions
   flexible. Use the proposed one Save & ready action; clarify only consequential
   ambiguity.
7. Planning uses current members' authorized outing inputs and the database venue
   snapshot. Context remains huddle-scoped. Voting/simulated booking retain their
   ownership and stale-result rules.
8. Record actual outcomes accurately. An explicit post-outing choice can save
   useful feedback/defaults. A suggestion, vote or simulated booking is not proof
   someone visited or liked a venue.

## Notifications: start small

Start with an account-scoped invitation inbox persisted in SpacetimeDB and updated
in realtime while connected. Invitations survive logout, a closed tab and a later
visit. Show unread/pending, accepted, declined and expired/canceled states.

Literal SMS is a later delivery adapter requiring a messaging service, verified
destination ownership, notification preferences and visible delivery status.
Email/browser push are other later channels, not implemented capabilities. An
in-app inbox alone does not alert someone away from the website; disclose that
distinction in the demo. The invitation remains authoritative whether external
delivery succeeds or fails. Reconnects/retries must not create duplicate huddles
or invitations. No messages are sent by this proposal.

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

The current SpacetimeDB device token is not cross-device profile login. Existing
views choose the most recently joined group; an inbox and multiple active/saved
huddles need explicit account memberships and selected huddle context. Agree
identity binding, ownership and new contracts before presenting login/persistence
as working. This document defines product expectations, not a replacement schema.

| Stage | Deliverable | Acceptance |
| --- | --- | --- |
| 1 | Stable accounts and account-scoped memberships, using two demo users | Each can return on another device, switch outings and access only permitted records. |
| 2 | Contacts, contact picker and durable in-app invitations | A recipient signs in and accepts without scanning or copying an invitation link; ambiguous names need resolution. |
| 3 | Prompt-first intent parsing and invitation preview | Recipients/details are editable before explicit Start & invite; retries create no duplicates. |
| 4 | Explicit defaults, today's overrides and editable autofill | Overrides do not rewrite saved defaults/current caps; forgetting context stops reuse; simulated outcomes never become invented visits. |
| 5 | Optional external delivery | Delivery status/failure is visible; invitation remains in-app. Test with approved recipients and configured preferences. |

Prove the small account → invite → accept journey before broad memory inference,
address-book sync, background agents or external delivery. Keep data/Claude
correctness and preference work as parallel priorities; this does not approve a
hosting migration or replace Eric Wu's ingestion task.

Suggested coordination: Eric Chen designs prompt/inbox/profile UI; Max owns
context rules and verification. Assign a specific owner for authentication,
membership and invitation persistence before implementation; avoid diverting
Eric Wu from active ingestion without coordination.

See [interface proposal](INTERFACE_PROPOSAL.md),
[preference scenarios](PREFERENCE_ACCEPTANCE_PLAN.md),
[planner follow-up](CLAUDE_PLANNER_FOLLOWUP.md) and [open tasks](NEXT_TASKS.md).
