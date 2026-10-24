# Huddle UI/UX research

Written Fri Oct 23, 2026 (H0 night) for the Sat 1-6 PM polish window. Scope: how comparable products handle the moments in the Huddle demo path, and what Huddle should copy. The visual direction and per-screen specs are in [DIRECTION.md](DIRECTION.md). The mock is [mock.html](mock.html).

How to read this: every section ends with **Takeaways for Huddle**, and the ranked list at the bottom says what to build first. "Read" in the source list means the page was opened and read for this doc. "Search summary only" means the page refused the fetch (HTTP 403) and the point comes from search results, so treat it as weaker.

---

## Ranked recommendations (impact per hour, for Sat 1-6 PM)

| # | Recommendation | Screen | Est. hours | Why it wins |
| --- | --- | --- | --- | --- |
| 1 | **One token pass in `index.css`** (palette, font, 16px radius, 44px buttons) applied to `.btn` / `.card` / `.input`. Every screen improves at once. | all | 0.75 | Highest coverage per minute. The draft already routes everything through three classes. |
| 2 | **Plan card = timeline + plain-language robustness + scout badge**, with the council's pick marked. This is the screen judges look at longest. | Plans, Vote | 1.5 | It's the "AI found a fair plan" moment. PAIR says to say what the number means, not just show it. |
| 3 | **Call screen as a live, chat-style transcript with a 4-step stepper and an "AI calling" disclosure chip**, ending in a big confirmation card. | Call | 1.25 | This is the Cartesia moment and the climax of the pitch. Google Call Screen shows the pattern people already know. |
| 4 | **Lobby that fills in live** (big code + QR, member avatars popping in, host-only start). | Join/Lobby | 0.75 | First 20 seconds of the pitch. Kahoot and the group swipe apps all lead with this. |
| 5 | **Honest labels as one consistent "chip" component** (Demo mode: cached data / Checked earlier / Recorded earlier / Synthetic / AI-generated). | all | 0.5 | Cheap, and it makes the honesty list visible instead of something we only say out loud. |
| 6 | Council panel: colored advocate avatars, round dividers, chair bubble visually distinct, stance chips. | Plans/Vote | 1.0 | Mostly styling on the existing B4 component (`STYLE` object). |
| 7 | Swipe: one pair, two big tappable cards, confidence ring at the top that visibly fills after each choice. | Swipe | 1.0 | The ring rising is the "it's learning" moment, but taps work fine without the drag gesture. |
| 8 | Roulette wheel with only 3 weighted slices, a short spin (≈2.5 s), then the winner card. | Vote | 1.0 | Fun, but optional: the vote works without it. |
| 9 | Re-plan banner: amber, top of screen, one primary "Call again". | Call/Plans | 0.5 | Short build; it only has to be obvious. |

If the afternoon slips, cut from the bottom. Items 1-5 are the floor.

---

## 1. Group decision apps

**Partiful** grew partly because guests can RSVP without an account or the app: you get a text, tap a link, and reply. Invite pages look like a "mini website", not a form, and the playful styling matched its audience ([NoGood](https://nogood.io/blog/partiful-marketing-strategy/)). A Pratt design critique notes the RSVP choices are emoji plus label ("👍 Going, 🤔 Maybe, 🥲 Can't Go"), the selected choice changes appearance to confirm it, and host actions sit in a bottom bar where they're easy to find. Its main criticism is ambiguous icons and one "more" icon used for two different menus ([Pratt IXD](https://ixd.prattsi.org/2026/09/design-critique-partiful-ios-app/)).

**When2meet** has zero friction (no account to create or respond) and a heatmap where darker green means more people are free. Its known failures are on mobile: drag-to-select is "regularly misread as a scroll", and anyone with the link can overwrite someone else's answers. **Doodle** votes yes / no / if-need-be on proposed slots instead of painting a grid, which gives more nuance, but it needs an account to create a poll ([Carly comparison](https://www.usecarly.com/blog/doodle-vs-when2meet). It's written by a competing vendor, so treat its verdicts with care).

**Group restaurant swipers** (the closest products to Huddle) all use the same skeleton: create a room, share a code / QR / link, everyone swipes the same list, and the match is "when everyone likes the same place." BiteSwipe uses a 6-digit code or QR, up to 10 people, real-time join/leave updates, and a confetti match screen. One of its fixes was a bug that showed different matches to different users ([BiteSwipe listing](https://apps.apple.com/de/app/biteswipe-app/id6751428045)). Tastebuddy narrows the options toward the strongest candidates as people swipe, and its cards show distance and live hours before you swipe ([Tastebuddy listing](https://apps.apple.com/app/id6737732908)). (I found nothing usable on Snackpass group order or Yelp Collections specifically, so they're not cited.)

**Kahoot** (search summary only, the support pages returned 403): the host screen shows the game PIN large near the top, plus a QR code that pre-fills the PIN. Players then pick a nickname and wait in the lobby until the host starts. Kahoot's help says to enlarge the QR if it's too small.

**Takeaways for Huddle**
- No account, no install: join by link/QR → name → in. That's already the design. Keep it to one input (first name) before the lobby.
- The lobby must visibly fill in live (avatars appearing). Social proof is what makes the projector moment work.
- Make the 4-letter code huge (≥48px) and the QR at least 200px for a projector. Kahoot's "enlarge it if too small" is the real-world failure mode.
- Huddle beats "match when everyone likes it" because a unanimous match often never comes. Say so in the pitch, and show the plan *before* unanimity, with a confidence number.
- Every phone must show the same plans and the same result (BiteSwipe's bug). SpacetimeDB subscriptions give us this. Don't add any client-side randomness to what plans show.
- Make the selected state on votes and choices unmistakable (filled + check), like Partiful's RSVP button.
- Avoid ambiguous icon-only buttons. Every action has a text label.

## 2. Private-preference input

GroupTable's listing describes "each person's choices stay private until a match is found" (search summary only). The Huddle brief goes further: preferences are never shown to others, and trade offers go only to the affected member.

**Takeaways for Huddle**
- Put a lock icon and "Only you see this" *right on the input*, not in a footer. Repeat it on the swipe screen.
- Show three tappable example chips under the text box ("vegetarian", "under $30", "somewhere quiet"). They teach the format, and they help the demo driver type fast.
- After submit, echo back what was understood as chips ("Vegetarian · ≤ $30 · Quiet") so the user can trust the parser (PAIR: show the inputs that ground the result, see section 4).
- The private trade offer should look private: a card with a lock badge, "Just for you", and never a name of who benefits.

## 3. "This or that" swiping

Swiping works because it is a simple binary choice, thumb-friendly, and feels like control. It also favors speed over reflection, and too many options become a "tyranny of choice" ([Built In](https://builtin.com/design-ux/tinder-swipe-design)). Engineering notes for a Tinder-style deck: prefetch so a swipe never shows a spinner, tap buttons must emit "the exact same swipe event as a drag", the card follows the finger with a slight rotation, it commits past about 100pt and springs back below that, and the client doesn't wait for the server ([techinterview.org](https://www.techinterview.org/post/3233474992/design-tinder-swipe-deck-mobile/)).

**Takeaways for Huddle**
- Huddle shows *pairs* ("this or that"), not single yes/no cards. So the right interaction is **two stacked cards, tap one**, not drag. Tapping is faster to build, works with a mouse on the demo laptop, and has no gesture misfire (the When2meet lesson). Add drag only if time is left.
- Send the tap optimistically and show the next pair at once. Never put a spinner between pairs. If `nextPair` isn't ready, keep the chosen card highlighted for 300ms as feedback.
- Each card: photo or color block, name, category, 2-3 attribute chips (price, "quiet", "outdoor"), and distance. No paragraphs: swipers don't read.
- Add a small "Skip / either is fine" text link. Real people hit pairs they don't care about.
- Show the ring filling after each choice, and auto-advance to "Plans ready" when the threshold is reached. The ring is the reward that replaces Tinder's match.

## 4. Showing confidence and uncertainty

Google's People + AI Guidebook: show confidence only if it changes what the user does. Percentages are risky because people don't read probabilities well, so give context ("is 80% good or bad here?"). High numbers read as certainty. Categorical levels need a clear action for each level, and N-best alternatives help when confidence is low. Partial explanations with progressive disclosure are usually best ([PAIR: Explainability + Trust](https://pair.withgoogle.com/chapter/explainability-trust/)). Goji Labs adds: say whether the output is a recommendation or a decision, avoid layouts that look more authoritative than the system is, put the "why" in an optional affordance, and show when results may still change ([Goji Labs](https://gojilabs.com/guides/designing-confidence-signals-for-ai-ux/)).

**Takeaways for Huddle**
- Never show a bare "93%". Always pair it with its sentence: "93% sure nobody's unhappy" on cards, and the full form on tap: "In 93% of plausible tastes, nobody is below 60% of their ideal."
- Show one ring with three bands and the action for each: <60% "Keep swiping, still learning", 60-85% "Getting there", ≥85% "Ready, plans are solid". This is PAIR's "action per category".
- We already show N-best: three plans (Safe / Bold / Budget). Lean into that framing: "Three good options. You choose."
- Label the council output as a recommendation, not a decision: "Recommended by the council", and the vote is still open.
- Put a "Why this plan?" disclosure on each card (whyLine, gaveUp), collapsed by default.
- While the solver is still running, show a "Updating…" state on the ring so people know the number can still move.

## 5. AI agents debating (multi-agent transcripts)

There's no established consumer pattern yet. The closest research is Perspectra, a forum-style interface where persona agents deliberate in threads that users can @-mention, with a real-time mind map of arguments. In an 18-person study it produced more and deeper critical thinking than a plain group chat ([arXiv 2509.20553](https://arxiv.org/abs/2509.20553), abstract only). Conch (IEEE VIS 2025) visualizes debate "clash points" for post-hoc analysis (search summary only). It's too heavy for us.

**Takeaways for Huddle**
- Use a group-chat layout, because the audience already reads it without explanation. Give each advocate a distinct color and a letter avatar (A-D), with names only if `showWhoCompromised`.
- Make the round structure visible: a thin "Round 1 · Opening", "Round 2 · Rebuttal", "Chair" divider. Without dividers, 9 bubbles read as noise.
- Let the chair bubble look different (full width, accent border, gavel/star icon), ending in a "Recommended: Safe" pill that links to the plan card.
- Stance chips per plan (for / ok / against) are our "mind map lite": a 4×3 grid of dots above the transcript summarizes the debate at a glance for judges who don't read bubbles.
- Stream bubbles in with a typing indicator ("Advocate B is thinking…") so it reads as live. NN/g: say what's loading.
- A small footer chip: "AI-generated · numbers checked by a validator".

## 6. Map-based itinerary cards

Wanderlog connects pins in visiting order with lines, shows estimated time and distance between places plus day totals, and is praised because "most itinerary apps give you a list, but Wanderlog gives you a full-fledged map" (from search summaries of its App Store and WhistleOut pages; I didn't open them directly).

**Takeaways for Huddle**
- Card layout, top to bottom: plan name + kind badge → robustness line → a **vertical timeline** (18:00 Dinner · Name → 7 min walk → 19:30 Activity → …) → cost per person → scout badge.
- Number the map pins 1-2-3 to match the timeline, and draw the route line in the plan's color. One map above the three cards, which switches route when you change card, beats three small maps (cheaper Mapbox, and readable at 390px).
- Put walk times *between* stops in the timeline. That's where "Jordan accepted a longer walk" becomes concrete.
- Map height ≈ 220px at 390px wide. Anything taller pushes the cards below the fold.

## 7. Live phone-call transcript

Google Call Screen shows a real-time transcript of the caller's responses, with suggested replies (four presets) and pick up / hang up controls, and it saves the transcript afterwards. Its help page says plainly that Call Screen "won't always fully understand and transcribe" what a caller said ([Google Phone help](https://support.google.com/phoneapp/answer/9118387)). Google Duplex's live calls opened with "I'm calling from Google, so the call may be recorded", but the disclosure was rushed and easy to miss, and the coverage criticized that. An earlier promo used the clearer "This automated call will be recorded" ([Voicebot.ai](https://voicebot.ai/2018/11/25/video-shows-google-duplex-making-a-real-restaurant-reservation-says-it-is-google-calling-and-the-call-will-be-recorded-full-analysis/)).

NN/g on waits: give feedback at once, use a looped indicator with text for about 2-9 s waits and a percent/step indicator for ≥10 s, and offer cancel on long processes ([NN/g](https://www.nngroup.com/articles/progress-indicators/)). Design systems add that step status should not rely on color alone, and that on mobile a horizontal stepper should collapse to a compact "step name + progress" header ([PatternFly](https://www.patternfly.org/components/progress-stepper/accessibility), search summary only).

**Takeaways for Huddle**
- Lay it out like Call Screen: the transcript as chat bubbles, agent (right, accent) vs restaurant (left, gray), each line with the original Mandarin and the English underneath in smaller text when `textEn` is present.
- Make our disclosure the *first* bubble, visible and translated: "您好，我是AI助理… / Hi, I'm an AI assistant booking for Alex. This call may be transcribed." We do what Duplex was criticized for not doing. Say it in the pitch: Meta and Cartesia judges care.
- Use a 4-step stepper (Dialing → Connected → Time offered → Confirmed), with icons + text, not only colored dots. At 390px use short labels or a compact "Step 2 of 4 · Connected" header.
- A call takes well over 10 s, so the stepper *is* the progress indicator. Add an elapsed timer (0:42) and a "Hang up" button (NN/g: let users cancel).
- Confirmation card: big check, restaurant, time, party size, name on reservation, "Booked by phone at 18:02". Failure state: amber, "That place is full", which hands off to the re-plan banner.
- Recorded fallback: a "Recorded earlier" chip on the header, always visible while it plays.

## 8. Voting and roulette

Wheel pickers sell fairness by being visible: equal or weighted slices and a visible spin that "makes the final result feel more transparent" (from search summaries of wheel-picker sites, which are secondary sources). Uplup documents weighted entries and logs every result ([Uplup docs](https://uplup.com/docs/random-name-picker-documentation), search summary only).

**Takeaways for Huddle**
- Show only three slices, sized by robustness weight, colored by plan kind, with the percentage in each slice, so the weighting is visible and honest. Vetoed plans aren't on the wheel (say "Vetoed plans can't win" under it).
- Use a short spin (2-3 s, ease-out), then the result card. A longer spin kills demo pacing.
- Votes: one big button per plan with live counts as avatar dots, and the council pick marked with a pill but not preselected.
- Show "Can't decide? Spin" only when there's a tie, or as a secondary text button. It should never compete with Vote.

## 9. Honest labeling (cross-cutting)

PAIR and Goji both say to state limitations instead of hiding them, and Google's own Call Screen help says the transcript may be wrong. For a hackathon, visible honesty is also a judging asset: it pre-empts "is this real?" questions.

**Takeaways for Huddle**
- Use one chip style (neutral background, small icon, 12-13px) for every honesty label, so judges learn to read it once. The exact strings are in DIRECTION.md.

---

## Sources

Read (opened and read for this doc):
- Built In, "What Makes 'Swipe Right' Such a Compelling UX Feature?": https://builtin.com/design-ux/tinder-swipe-design
- techinterview.org, "Design a Tinder-Style Swipe Deck": https://www.techinterview.org/post/3233474992/design-tinder-swipe-deck-mobile/
- Google People + AI Guidebook, Explainability + Trust: https://pair.withgoogle.com/chapter/explainability-trust/
- Goji Labs, "Designing Confidence Signals for AI UX": https://gojilabs.com/guides/designing-confidence-signals-for-ai-ux/
- Pratt IXD, "Design critique: Partiful iOS app": https://ixd.prattsi.org/2026/09/design-critique-partiful-ios-app/
- Carly, "Doodle vs When2Meet vs WhenIsGood": https://www.usecarly.com/blog/doodle-vs-when2meet
- BiteSwipe App Store listing: https://apps.apple.com/de/app/biteswipe-app/id6751428045
- Tastebuddy App Store listing: https://apps.apple.com/app/id6737732908
- arXiv 2509.20553, Perspectra (abstract): https://arxiv.org/abs/2509.20553
- Google Phone help, "Screen your calls before you answer them": https://support.google.com/phoneapp/answer/9118387
- Voicebot.ai, Google Duplex real reservation analysis: https://voicebot.ai/2018/11/25/video-shows-google-duplex-making-a-real-restaurant-reservation-says-it-is-google-calling-and-the-call-will-be-recorded-full-analysis/
- NN/g, "Progress Indicators Make a Slow System Less Insufferable": https://www.nngroup.com/articles/progress-indicators/
- W3C, Understanding SC 2.5.5 Target Size (Enhanced), 44×44 CSS px, AAA: https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html

Search summary only (page not opened, or it returned 403):
- NoGood, Partiful marketing strategy: https://nogood.io/blog/partiful-marketing-strategy/
- Kahoot support, joining a game and the game PIN: https://support.kahoot.com/hc/articles/360039890713
- Wanderlog App Store / WhistleOut review: https://www.whistleout.com/CellPhones/Apps/wanderlog-group-trip-planning-app
- PatternFly progress stepper accessibility: https://www.patternfly.org/components/progress-stepper/accessibility
- Uplup random name picker docs: https://uplup.com/docs/random-name-picker-documentation
- GroupTable (Contra): https://contra.com/p/RPsRmX77-group-table
- Conch, IEEE VIS 2025: https://arxiv.org/abs/2507.14482v2
