# Huddle visual direction: "Warm table"

One direction, not options. It's for the Sat 1-6 PM polish pass by Haydn and Eric Wu. Research behind it: [RESEARCH.md](RESEARCH.md). Visual reference: [mock.html](mock.html) (open in a browser and set the window width to 390px or use device mode).

**The idea in one line:** Huddle should feel like friends around a dinner table, not like a fintech dashboard. Warm cream background, one ember accent, plan colors that stay the same on every screen, and honest grey chips for anything cached or AI-made. It fits Meta's "Bringing People Closer Together" track: the people (avatars, the lobby filling in) are the hero, and the AI is the helper.

Fixed rules (from the brief, A6): light mode only, 390px mobile-first, one accent, one font pairing, **16px radius**, **8px grid**, **44px minimum tap targets** (WCAG 2.5.5 AAA is 44×44 CSS px), high contrast.

---

## 1. Tokens

All text colors pass WCAG AA (≥4.5:1) on `--bg`. I computed them, and the ratios are in the comments. Tailwind v4 is already in `web/`, so the tokens go in an `@theme` block. This is a **drop-in replacement for the top of `web/src/index.css`**. I didn't apply it: `web/` is out of scope for this session.

```css
@import "tailwindcss";

@theme {
  /* surfaces */
  --color-bg: #FFF8F1;        /* warm cream page */
  --color-surface: #FFFFFF;   /* cards */
  --color-sunken: #F6EEE6;    /* chips, inputs, track of the ring */
  --color-line: #E8DED4;      /* 1px borders */

  /* text */
  --color-ink: #1F1A17;       /* 16.4:1 */
  --color-ink-2: #5C534C;     /* 7.1:1  secondary text */
  --color-ink-3: #857A71;     /* 4.0:1  placeholders, icons, >=18px only */

  /* the one accent: ember */
  --color-accent: #C2412A;    /* 4.9:1 on bg, white text on it 5.1:1 */
  --color-accent-soft: #FDE7E1;

  /* plan kinds: same color on card, map route, wheel slice, vote button */
  --color-safe: #0F766E;      /* teal, 5.2:1 */
  --color-safe-soft: #DDF3EF;
  --color-bold: #6D28D9;      /* violet, 6.8:1 */
  --color-bold-soft: #EEE5FD;
  --color-budget: #15803D;    /* green, 4.8:1 */
  --color-budget-soft: #DFF5E6;

  /* advocates A-D (council bubbles) */
  --color-adv-a: #2563EB;
  --color-adv-b: #BE185D;
  --color-adv-c: #A16207;
  --color-adv-d: #0E7490;

  /* status */
  --color-ok: #15803D;   --color-ok-soft: #DFF5E6;
  --color-warn: #B45309; --color-warn-soft: #FEF3C7;
  --color-bad: #B91C1C;  --color-bad-soft: #FDE2E2;

  /* type */
  --font-display: "Bricolage Grotesque", "Inter", system-ui, sans-serif;
  --font-sans: "Inter", "PingFang SC", "Noto Sans SC", system-ui, sans-serif;

  /* shape */
  --radius-card: 16px;
  --radius-pill: 999px;
  --shadow-card: 0 1px 2px rgb(31 26 23 / 0.06), 0 4px 16px rgb(31 26 23 / 0.06);
}

body { font-family: var(--font-sans); background: var(--color-bg); color: var(--color-ink); }
.page { max-width: 480px; margin: 0 auto; padding: 16px; }

.btn {
  min-height: 48px; padding: 12px 20px; border-radius: var(--radius-pill);
  border: 1px solid var(--color-line); background: var(--color-surface);
  font-weight: 600; transition: transform .08s;
}
.btn:active { transform: scale(.98); }
.btn:disabled { opacity: .45; }
.btn-primary { background: var(--color-accent); border-color: var(--color-accent); color: #fff; }

.input {
  width: 100%; min-height: 48px; padding: 12px 16px; border-radius: 12px;
  border: 1px solid var(--color-line); background: var(--color-surface);
}
.input:focus { outline: 2px solid var(--color-accent); outline-offset: 1px; }

.card {
  background: var(--color-surface); border: 1px solid var(--color-line);
  border-radius: var(--radius-card); padding: 16px; box-shadow: var(--shadow-card);
}
.chip {
  display: inline-flex; align-items: center; gap: 4px; min-height: 28px; padding: 4px 10px;
  border-radius: var(--radius-pill); background: var(--color-sunken);
  font-size: 13px; font-weight: 500; color: var(--color-ink-2);
}
.muted { color: var(--color-ink-2); font-size: 14px; }
.error { color: var(--color-bad); font-size: 14px; }
```

Fonts, one `<link>` in `web/index.html`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
```

Demo-day risk: on bad Wi-Fi the fonts fall back to system-ui, which is fine. The Chinese transcript lines use PingFang SC on Apple and Noto Sans SC on Android, so there's no extra download.

### Type scale (all multiples of 4, line-height on the 8px grid)

| Role | Font | Size / line | Weight | Use |
| --- | --- | --- | --- | --- |
| Display | Bricolage | 48/56 | 800 | Group code "K7QX", big % on the ring |
| H1 | Bricolage | 28/32 | 800 | Screen titles |
| H2 | Bricolage | 20/24 | 600 | Plan name, card titles |
| Body | Inter | 16/24 | 400 | Everything else |
| Small | Inter | 14/20 | 500 | Secondary lines, timeline |
| Chip | Inter | 13/16 | 500 | Chips, labels |

Numbers (%, $, times) use `font-variant-numeric: tabular-nums` so they don't jitter while they update live.

### Spacing and layout
- 8px grid: 8 / 16 / 24 / 32 / 48. The page gutter is 16. The gap between cards is 16. The gap inside a card is 8 or 12 (12 is allowed for type rhythm only).
- One primary action per screen, in a sticky bottom bar (`position: sticky; bottom: 0`, 16px padding, `--color-bg` with a top border). The thumb zone is where the button lives.
- Tap targets ≥ 44px: buttons are 48px tall. Chips that are tappable get a 44px hit area through padding.
- Motion: 150-250ms ease-out for state changes, one 2.5s spin for roulette, and nothing else. Respect `prefers-reduced-motion` (skip the spin, show the result).

### Shared components to build once
1. **Avatar**: 40px circle, initial letter, background picked from 6 soft tints by member index. In the council it's the advocate letter in the advocate color.
2. **KindBadge**: a pill in the plan color, "Safe" / "Bold" / "Budget". Used on cards, the map legend, vote buttons and wheel slices.
3. **HonestChip**: a `.chip` with a small icon. It's the one style for every honesty label (strings in §3).
4. **Sticky CTA bar.**
5. **Toast**: bottom, dark ink background, white text, 3s.
6. **Skeleton**: `--color-sunken` blocks with a 1.2s pulse, for plan cards and the council while they load.

---

## 2. Per-screen guidance (demo path order)

Each screen lists **Must** (do Sat 1-6 PM) and **Nice** (only if ahead). The hour estimates are in RESEARCH.md's ranked table.

### 2.1 Home / Join / QR lobby
- **Must**
  - Home: the wordmark "huddle" in Bricolage 800, a one-line promise ("Decide together. Book in one tap."), a primary "Start a huddle", and a secondary "Join with code".
  - Join: a single field, first name, then you're in. If the code came from the QR, pre-fill it and don't show the code field at all.
  - Lobby (host): the code at 48px with letter-spacing 0.1em, and a **QR ≥ 200px** on a white card (it's the projector moment). Under it, member avatars + names appear in a wrap grid as they join, each with a 200ms scale-in. A counter "3 of 4 here".
  - Host-only sticky CTA "Everyone's in →". Guests see "Waiting for {host} to start…" with a looped dot animation.
- **Nice:** a "Copy link" button, and a gentle pop sound when someone joins (muted by default).
- **Copy:** "Scan to join", "Only first names. No account."

### 2.2 Private preferences
- **Must**
  - Title "What do you want tonight?"
  - A lock chip directly above the textarea: "🔒 Only you see this". The textarea is 3 rows and 16px (anything below 16px makes iOS zoom).
  - Three example chips under it that append text on tap: "vegetarian", "under $30", "somewhere quiet".
  - After submit, show "Here's what we heard" with parsed constraints as chips (Vegetarian · ≤ $30 · Quiet), plus "Edit". Parser warnings (veto cap) show as an amber line.
- **Nice:** a voice-input mic button (Cartesia STT would be a nice tie-in, but it's out of scope).

### 2.3 Swipe ("this or that")
- **Must**
  - Top: a 72px confidence ring + one line of state text by band: <60% "Still learning your taste", 60-85% "Getting there", ≥85% "Ready, plans are solid". The ring stroke uses the accent, and the track is `--color-sunken`.
  - Two stacked cards (each about 160px tall at 390px), full-width tap targets. Each shows a color/photo block, name, category, 2-3 chips (price "$$", "quiet", "outdoor"), and "8 min walk".
  - A small "or" disc between the cards. Under them, a text button "Either is fine".
  - On tap: the chosen card gets an accent border and a check for 200ms, then the next pair slides in. Send optimistically, with no spinner between pairs.
  - The repeat privacy reminder goes in the footer: "🔒 Your swipes are private".
- **Nice:** drag-to-choose (left card / right card), haptic `navigator.vibrate(10)`.

### 2.4 Plans (Safe / Bold / Budget)
- **Must**
  - Map on top, 220px tall, rounded 16px. Pins are numbered 1-2-3 in the selected plan's color, the route line is in the same color, and the other plans' routes are hidden.
  - Below it, a horizontal segmented control or three stacked cards. Stacked is the easiest to build: tap a card to select it, and the map updates.
  - **Plan card anatomy** (top to bottom):
    1. KindBadge + plan name ("Safe · Quiet night in Northside") and, at the right, cost "$34 / person".
    2. **Robustness line**, big: "**93%** sure nobody's unhappy" (the % in Bricolage 28, in the plan color). Tapping "What does this mean?" expands: "In 93% of plausible tastes, nobody is below 60% of their ideal."
    3. **Timeline**: a vertical line with dots: `18:00 Dinner · Name`, then a grey connector `🚶 7 min`, `19:30 Activity · Name`, `🚶 4 min`, `20:50 Dessert · Name`.
    4. **Scout badge** on the dinner row: green chip "✓ Open now · vegetarian options · checked 2 min ago". If it's cached, a grey HonestChip "Checked earlier". If it's unknown, leave it out (never guess).
    5. A collapsed "Why this plan?" that holds the whyLine and gaveUp, with names only if `showWhoCompromised` (see the follow-up below).
    6. If it's the council pick: an accent pill at the top right, "★ Council pick".
  - The robustness % always uses the plan color, never red/green. The number is information, not a grade.
- **Nice:** Consensus Map behind a "See all options" link, and a fairness dial.
- **Watch out (from the B4 hand-over):** with names off, whyLine text like "Ana gave up novelty" leaks names. The UI should never print a name in whyLine when `showWhoCompromised` is false. Show "Someone gave up novelty" or hide the line.

### 2.5 Council panel
- **Must**
  - A header row: "The council" + HonestChip "AI-generated · numbers checked".
  - **Stance grid** above the transcript: 4 rows (A-D) × 3 columns (Safe/Bold/Budget), with dots filled = for, half = ok, empty ring = against. It reads at a glance for judges.
  - Round dividers: a thin line with a centered label, "Round 1 · Openings", "Round 2 · Responses", "Chair".
  - Advocate bubble: a 32px letter avatar in the advocate color, the name "Advocate B" (+ " · Sam" only if names are on), and a white bubble with a 3px left border in the advocate color, max 40 words. Cited numbers are bolded with `tabular-nums`.
  - Chair bubble: full width, `--color-accent-soft` background, a ⚖️ or gavel icon, and it ends with a KindBadge pill "Recommended: Safe" that scrolls to or selects that plan.
  - While streaming: a typing row "Advocate C is thinking…" with three dots.
  - Fallback: a grey card "Safe plan used (the council check failed)", with no recommended pill anywhere.
- **Nice:** auto-scroll to the newest bubble (with a "Jump to latest" pill if the user has scrolled up), and one Cartesia voice per advocate (stretch).
- **Placement (from the B4 hand-over):** the group auto-routes to /vote about 400ms after the chair message, so the panel is barely seen. Show the panel at the top of Vote as well, collapsed to the chair bubble + stance grid with "Show full debate".

### 2.6 Vote + roulette
- **Must**
  - Three vote rows, 64px tall: KindBadge, name, robustness %, then live voter avatars (small 24px dots) on the right. Tapping fills the row in the plan's soft color with a check, and "You voted" shows.
  - The council pick has "★ Council pick" on its row, but it's not preselected. Copy under the list: "The council recommends. You decide."
  - Results: once everyone has voted, the winner row expands, and the sticky CTA becomes "Book {restaurant} →".
  - Roulette: a secondary text button "Can't decide? Spin". It's shown prominently only on a tie.
  - Wheel: 3 slices sized by weight, in plan colors, the % printed in each slice, a 2.5s ease-out spin, and a pointer at the top. Under it: "Weighted by how sure we are. Vetoed plans can't win."
- **Nice:** confetti on the result (keep it to ≤1s).

### 2.7 Call screen
- **Must**
  - Header: the restaurant name, "Calling for 4 · 19:00 · under Alex", an elapsed timer `0:42`, and a red outline "Hang up" button (44px).
  - A **disclosure chip** that's always visible: "🤖 AI caller · says so first · call transcribed".
  - **Stepper**: Dialing → Connected → Time offered → Confirmed. Each has an icon + label, done = filled check, current = accent ring with a pulse, future = grey. At 390px the labels go to 12px or one word each. It never relies on color alone.
  - **Transcript** as chat: agent bubbles on the right (accent-soft background, label "Huddle AI"), restaurant on the left (sunken background, label "Restaurant"). Each bubble shows the original line at 16px and, if `textEn`, the English under it at 14px in ink-2. The first bubble is always the Mandarin disclosure with its English line.
  - System lines (state changes) are centered grey 13px text: "Connected · 0:03".
  - **Confirmation card** (state `confirmed`): a big green check, "Booked!", restaurant, time, party size, name on reservation, and "Booked by phone at 18:02". Sticky CTA "Done" plus a secondary "Add to calendar" (only if the .ics stretch exists).
  - **Failure (`full`)**: the stepper's last step turns amber, and the card says "That place is full", which hands off to the re-plan banner.
  - **Recorded fallback:** the HonestChip "▶ Recorded earlier" in the header, plus an audio scrubber.
- **Nice:** a per-turn latency chip "1.2 s" (stretch), and live waveform bars while someone is speaking.

### 2.8 Re-plan banner
- **Must:** a full-width card at the top of Call/Plans: `--color-warn-soft` background, a 4px left border in `--color-warn`, a ↻ icon.
  - Title: **"That place is full. New plan ready."**
  - Line 2: "{KindBadge} {new restaurant} → {activity} → {dessert}".
  - Primary button **"Call again"** (accent, full width, 48px). Never auto-call, and say it: a small line "We won't call until you tap."
  - While re-planning: a skeleton line + "Finding a new plan…".
- **Nice:** a 200ms slide-down entrance.

### 2.9 "Demo mode: cached data" banner
- **Must:** a slim 32px bar pinned at the very top of every screen while `demoMode` is on: `--color-sunken` background, ink-2 text, 13px, "⚑ Demo mode: cached data". It isn't dismissible, and it isn't yellow (yellow reads as an error on a projector). Tapping it opens a sheet listing exactly what's cached right now.
- **Nice:** the demo-mode toggle lives in the hidden judge panel (long-press the logo), not in the main UI.

---

## 3. Honest labels the demo must show

One HonestChip style everywhere. Exact strings:

| Where | Label | Trigger |
| --- | --- | --- |
| Top bar, all screens | **Demo mode: cached data** | `groups.demoMode` |
| Plan card, scout row | **Checked earlier** | `scout.cached === true` |
| Plan card, scout row | **Checked {n} min ago** (green, live) | live scout |
| Council header | **AI-generated · numbers checked** | always |
| Council fallback | **Safe plan used (the council check failed)** | `fallbackUsed` |
| Call header | **AI caller · says so first · call transcribed** | always |
| Call header, fallback | **Recorded earlier** | voice fallback playing |
| Call, demo restaurant | **Restaurant played by a teammate** | demo (small line under the header; it's on the honesty list) |
| Re-plan banner | **Scripted "we're full" reply** | demo re-plan run (small line, or say it out loud) |
| Judge panel / experiments | **Simulated groups (synthetic data)** | any eval number |
| Lobby / footer | **Seeded demo group** | demo group loaded |
| About / footer | **Places: cached Berkeley snapshot** | always in v1 |

The rule: if a judge could ask "is that live?", a chip has already answered.

---

## 4. Build order for Sat 1-6 PM (impact per hour)

1. **13:00-13:45** Token pass: paste §1 into `index.css`, add the font link, and check every screen still renders. Everything looks 2× better.
2. **13:45-15:15** Plan card anatomy + map route color + scout badge + council pick pill.
3. **15:15-16:30** Call screen: chat transcript, stepper, disclosure chip, confirmation card, re-plan banner.
4. **16:30-17:15** Lobby: big code, QR, live avatars, host CTA.
5. **17:15-17:45** HonestChip everywhere (§3) + demo bar.
6. **17:45-18:00** Freeze. Run the full demo at 390px on a real phone. Fix only what breaks.

Parallel owner (Eric Chen, B4): restyle `CouncilPanel`'s `STYLE` object with the tokens (≈1h), and add the stance grid.

Cut first if behind: roulette animation (keep the static result), drag on swipe, Consensus Map polish, entrance animations.
