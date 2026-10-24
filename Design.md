# Huddle design direction

Updated October 24, 2026.

## Purpose and scope

Use Huddle's illustrated, animated identity throughout the website. This document replaces the proposed default shadcn visual treatment with a custom Huddle theme. It describes the target experience, not a claim that the pages, account features, animations, or agent behavior already exist.

Keep the navigation and staged account features from the interface proposal. Follow `docs/CURRENT_CONTEXT.md` and `docs/AGENT_FLOW_PLAN.md` for product behavior and coordinated contract migration. This design does not authorize changes to runtime contracts, authentication, provider integrations, or external actions.

The replacement core flow is:

**Prompts → confirmed needs → Huddling → proposals → discussion → vote → booking.**

Mandatory swipes and numerical confidence are not part of the new design. Preserve the working legacy flow until the replacement has passed connected verification.

## Visual language

- Expressive stick figures are the focal point: round white heads, navy line bodies, small colored accessories, and clear gestures.
- Use periwinkle skies, warm cream surfaces, yellow primary actions, pink accents, green hills, and navy outlines.
- Reserve handwritten typography for headings. Use readable sans-serif text for controls, forms, conversations, and itinerary details.
- Keep background texture and decoration restrained around content. Use generous whitespace and strong contrast.
- Apply one consistent custom treatment to buttons, fields, menus, dialogs, badges, navigation, and loading, empty, and error states. Avoid stock shadcn styling. Accessible component primitives may still be used beneath the custom theme.
- Keep focus indicators visible, actions clearly labeled, and interactive targets comfortably sized.

## Shared desktop layout

Use a slim illustrated sidebar for **Start a huddle, Current huddle, Contacts, History, Preferences, and Settings**. Keep an explicit current-huddle selector when multiple memberships are supported.

The main area stays spacious, with a large character scene where it supports the task. Forms and longer conversations sit on calm cream surfaces. Use the desktop width for a scene or map beside the relevant controls rather than enlarging a narrow phone card.

On smaller screens, collapse navigation to a menu and stack the same content in task order. Keep text and controls steady while characters animate. The website should remain usable without animation.

## Page-by-page map

| Page | Layout and content | Character scene and motion |
| --- | --- | --- |
| Public landing | Wide split hero: “Your people. One great plan.” Sign in and start actions on the left; illustration on the right. | Friends enter from different sides and gather around a picnic table. Clouds drift slowly. |
| Login | Compact username/password form beside a welcoming illustration. Clearly identify available demo accounts where applicable. | One figure opens a garden gate. After successful login, they wave the user through. |
| Start a huddle | Main signed-in screen. Large invitation prompt such as “Dinner with Alex and Mark,” reviewed contact matches, microphone when supported, and a yellow **Review invitation** action. Invite friends through an explicit picker; pending invitations appear in Inbox. | The user's figure sits at an empty picnic table. Selecting contacts adds figures nearby, marked **Not invited yet**. |
| Review your invitation | Editable outing summary: people, date, time, and the initiator's interpreted needs. **Create & invite** is the explicit action. Resolve ambiguous contacts before sending invitations. | The user's figure holds invitation envelopes. They fly out only after confirmation. |
| Join / invitation | Show host, outing summary, and **Join huddle**. Use the addressed invitation link. Explain contact creation briefly. | The user's figure approaches the group and joins the circle only after accepting. |
| Lobby | Large gathering scene, Invite friends picker, participant list, and distinct joined/pending statuses. | Joined friends wave from the table. Pending invitees appear as outlined placeholders, not ready participants. |
| Your needs — private | Prompt and editable interpretation side by side. Include optional budget/duration sliders, dietary requirements, allergies, an optional prompt, and **Save & ready**. Ask only consequential private clarifications. | The user's figure writes a folded note. Confirmation seals it; the group sees readiness only. |
| Waiting for friends | Shared readiness list: “Three people ready. Waiting for one.” The host's **Find plans** activates once current requirements are confirmed and blocking questions are resolved. | Ready figures gather; the remaining place stays open. Never display another person's private needs. |
| Huddling… | Large scene on the left, factual progress on the right: **Gathering confirmed needs → Checking options → Preparing recommendations**. | Figures lean together over a map, point, nod, and peek up. These are character animations, not a claim that multiple agents are running. |
| Conversation & proposals | Persistent discussion beside a wide map and up to three distinct valid proposals. Show grounded reasons, trade-offs, estimated whole-outing costs, and limitations. | A coordinator figure presents plans. Optional advocates appear only if implemented; speech bubbles contain actual public messages. |
| Plan detail | Map, timeline, itemized estimated costs, total per person, relevant limitations, and **Vote for this plan**. Keep conversation reachable. | Friends walk along the selected route. Choosing another proposal redraws the path. |
| Vote | Keep plans visible with live counts and the user's selection. Show clear waiting and tie states. Include explicit **Spin** only if supported by the agreed contract. | Each vote adds a small marker beside a plan. Figures celebrate only when the choice is resolved. |
| Booking | Show the chosen itinerary, explicit host action, readable status, and accurate outcome. Label the current scripted experience **Booking simulation**. | A figure picks up a telephone. A confirmed simulation triggers a small group high-five. |
| Re-huddle | “That place is full. Let's find another.” Explain the exclusion, prepare replacements, and require a fresh choice and explicit booking action. | Friends unfold the map again and draw a different route. |
| Outcome | Show the final plan and accurately labeled result: proposed, simulated booking, real booking, or completed outing. | The group heads down the path together. Reserve the biggest celebration for a successful outcome. |

## Personal pages

| Page | Treatment |
| --- | --- |
| Contacts | A friendly gathering of avatar portraits with a searchable list. Distinguish pending invitations from existing contacts. Support contact removal. |
| History | An outing scrapbook with dates, participants, itinerary, and accurate outcome labels. Selecting one opens its permitted saved details. |
| Preferences | “Your usual vibe.” Editable defaults on a quiet cream surface. Explain what gets reused and provide an explicit clear-context action. Defaults do not change existing outing limits. |
| Settings | Simple account and credential sections. A figure holds a key beside masked provider details. Integrations show their actual status; unfinished connections are not presented as connected. |

Account pages are implemented on the isolated branch preview and require verification before shared release. A login form, history list, or settings mockup does not establish account ownership or working persistence. Use only authorized personal context and group records.

## Animation and live behavior

Animation tells the story of the real state: **gathering, waiting, considering, choosing, retrying, and celebrating**.

- Friends enter and wave as participants actually join.
- Confirming private needs folds the user's note; it never reveals the contents to the group.
- During planning, figures gather and gesture while factual progress messages describe supported work. Do not fabricate a debate or display hidden prompts or private model reasoning.
- Coordinator and optional advocate speech bubbles use actual permitted public messages, not decorative claims presented as live output.
- Progress updates must follow backend state. Do not invent percentages or success indicators.
- Preserve conversation after plans and voting become available. Do not force navigation when a job finishes.
- If requirements change, mark superseded plans and choices unavailable immediately. Show why a fresh confirmation or planning run is needed.
- Errors pause the scene with a clear explanation and explicit retry. Reconnection must not repeat planning or booking actions automatically.
- Keep motion subtle during reading and form entry. Avoid moving controls, layout shifts, and flashing effects. Respect reduced-motion preferences with static poses or gentle transitions.

## Budget, privacy, and honest status

- Each user sets a private cumulative budget for the entire outing. Sum every stop's per-person cost and compare the total with every member's current non-null cap. Zero is a real cap; null is uncapped.
- Only the cap's owner explicitly accepting a current private trade offer may raise an established limit. Parsing, saved defaults, agent suggestions, or a group vote cannot raise it.
- Keep raw prompts, caps, private corrections, offers, credentials, and unrelated history out of shared views and messages.
- Make private clarification and shared discussion visibly distinct, including their composers and submit actions.
- Label estimated costs, unknown facts, cached data, synthetic fallbacks, and booking simulations accurately. Unknown costs do not count as zero.
- Only show reservations or completed outings as such when those outcomes have actually been recorded.

## Delivery priority

Prioritize a complete, rehearsed core journey:

1. Sign in, select friends, send addressed in-app invitations, and explicitly accept.
2. Private optional limits/prompts, Save & ready, and targeted clarification.
3. Huddling progress tied to real planning state.
4. Validated proposals, map, and persistent discussion.
5. Voting and explicit booking simulation.
6. Re-huddle and recoverable failure states.

Add accounts, contacts, personal history, remembered preferences, voice input, and personal provider keys in the staged order from the interface proposal after their ownership and service contracts are established. They must not block the existing working demonstration.

The first visual pass should establish the shared shell, accessible custom controls, consistent character assets, and a few reusable motion states. Extend those across pages rather than creating unrelated illustrations and interaction patterns for each screen.
