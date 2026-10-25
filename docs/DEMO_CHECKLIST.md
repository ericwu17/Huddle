# Huddle demo checklist and rehearsed script

Use a controlled live rehearsal with familiar food. This is a prepared demo,
not a promise of identical Claude output on every run. Keep a completed rehearsal
Huddle as a disclosed backup. Current hosting remains Vercel + Maincloud + Eric
Wu’s local FastAPI/tunnel; no cloud migration is needed for this demo.

## Before the audience arrives

- [ ] Eric Wu keeps his API host awake, plugged in and the tunnel running. Verify
  the deployed API health and that Maincloud still points to that tunnel.
- [ ] Open [huddle.compare](https://huddle.compare) on two phones or separate
  browser profiles. Tabs in the same profile share identity.
- [ ] Sign into the two Huddle accounts and add each other in Friends beforehand.
  Keep the accounts’ Google Calendars connected if demonstrating availability.
- [ ] Confirm the current tunnel callback is allowlisted on the Google OAuth Web
  client, and both demo Google accounts are permitted testers.
- [ ] Check a common three-hour opening against both calendars and the venues’
  published hours. Avoid a midnight, closing-time or very early morning demo.
- [ ] Rehearse once on the exact deployed build with the inputs below. Check two
  stops, menu orders, photos, both private totals, Maps, votes and Done.
- [ ] Save that completed Huddle under **Your huddles**, and record a short backup
  clip. Keep the invite inbox ready for a fresh live Huddle.

## Predictable inputs

| Person | Private controls | Optional prompt |
| --- | --- | --- |
| Max | Berkeley; $40 total; 180 minutes; 2 stops; Vegetarian; no allergy field unless there is an actual allergy | “A proper vegetarian burger or pizza, then coffee or ice cream. Familiar casual places please.” |
| Eric | Berkeley; $50 total; 180 minutes; 2 stops; no dietary restriction | “A familiar casual burger or pizza, then coffee or ice cream.” |

Use a name such as **Burger night**. The Start prompt is invitation intent:
“Dinner with Eric”; it is not a private food-preference submission. Review the
friend picker before sending in-app invitations.

The prepared budgets are each person’s own meal plus their own later stops;
they are not pooled. Two hour-long visits need travel time as well: use a
three-hour allowance. If Calendar cannot find that shared opening, explicitly
select the rehearsed date and window (for example, 5–8 PM when both venues are
open). Describe this as manual selection, not a successful Calendar check.

These prompts favor familiar food without inventing dishes or forbidding useful
alternatives. Claude may select different supported venues. Never alter a real
allergy, budget or dietary requirement just to make the demo succeed.

## Five-minute live script

1. **Accounts and contacts (30 seconds).** Show two signed-in people. Start a named
   Huddle, select Eric under Invite friends and send the invitation. Eric opens
   it from his Huddle inbox. Show both people arriving without a QR code.
   Say: “We keep reusable context, but each person controls their own needs.”
2. **Private needs (45 seconds).** Each person enters the inputs above and selects
   **Save & ready**. Briefly set 90 minutes with 2 stops to show the red triangle:
   “Time may be tight: stopping 2 times usually needs about 2 hours, plus travel.”
   Return to 180 minutes before saving. Show **Remember for next time** if useful.
   Say: “The budget covers my own order at every stop. My private prompt and cap
   are not shown to my friend.”
3. **Calendar context (30 seconds).** With both calendars connected, choose an
   optional shared daypart and **Find plans**. Show the selected common opening.
   This checks free/busy and venue hours; it does not create an event. An automatic
   suggested time alone is not a successful Calendar check. Use the
   explicit manual-window fallback above if no suitable opening exists.
4. **Claude + real venue data (60 seconds).** Open the options. Show two visits of
   about an hour each, familiar route names, photos, ratings, comparison labels
   and each person’s suggested menu item/private total. Switch briefly between
   the phones to show different orders at the same venue. Say: “Claude compares
   everyone’s needs with our Bright Data catalog and menus. Python and the
   database check the proposal’s facts, prices, times and each private cap.”
5. **Google Maps (30 seconds).** Open **Map & details** and the embedded route.
   Show the driving estimate; optionally toggle walking to demonstrate the
   difference. **Click here to see the map!** opens the route in Google Maps.
   Explain that display-mode changes do not recalculate the saved itinerary.
6. **Realtime voting (30 seconds).** Open Vote on both phones. Vote for the same
   option and show the tally syncing through SpacetimeDB. A tie can demonstrate
   equal-chance Spin if rehearsed, but matching votes keep the main path short.
7. **Done, personal Calendar and sharing (45 seconds).** Open Done. Show the route,
   date/time and private order, plus the Finished status on Your huddles. Each
   participant can add to **their own** connected Google Calendar; one person
   cannot add to someone else’s. An owner may click this during the live demo if
   they want an actual event, or show the action without creating one. Share the
   final result link and open it in a logged-out browser: venue facts are public,
   private prompts and personal orders are not.
8. **Reusable context (15 seconds).** Return to Start/Friends and show the retained
   contact and saved preferences ready for the next outing.

## Rehearsal evidence

The isolated two-account browser rehearsal with real Claude returned three
2-stop routes: Artichoke Basille’s Pizza → Caravaggio Gelato Lab,
Jupiter → U :Dessert Story, and Artichoke Basille’s Pizza → Belmo Café.
Each proposed visit was 60 minutes, with travel between visits. Both owners’
private totals stayed within $40/$50. The same flow with 90 minutes returned
one-stop alternatives and explained the reduction on Options and Vote.
All 32 connected browser checks passed, including desktop/mobile red-warning
updates, independent private inputs, directions iframe, completed votes and Done.
No Google event or invitation message was sent during these automated checks.
The exact restaurants can change on a new Claude call.

## What is real, and what to say accurately

| Integration | What this demo shows |
| --- | --- |
| Claude API | One coordinator comparing confirmed private inputs with supplied catalog/menu choices; responses can vary |
| SpacetimeDB Maincloud | Accounts, owner-scoped context, contacts, invitations, shared Huddle state and live votes |
| Bright Data | A previously scraped, published catalog with menus/photos; not a fresh scrape or live restaurant availability check |
| Google Calendar | Connected owners’ free/busy context; a separate owner-triggered action adds only that person’s event |
| Google Maps Embed | Real directions and displayed travel estimate; changing display mode does not reschedule the plan |
| Messages / restaurant reservations | Do not claim working automatic SMS, iMessage delivery or a real reservation; these are outside the main demo |

Do not call the planning animation independent agents negotiating live. There is
one coordinator. Do not claim numerical fairness results, guaranteed allergen
safety, exact live bills or live seating. Venue data is cached; an unknown menu
price must not be described as an observed item price.

## If something goes wrong

- **One stop instead of two:** read the displayed compromise. Check both people
  saved 2 stops, at least 180 minutes, and a shared window covering both visits
  plus travel while venues are open. Without a Calendar/manual time, the current flow chooses
  an automatic outing time; this is not proof of calendar availability.
  With a feasible one-hour meal, the 90-minute example stays within that limit.
  If no itinerary fits at all, the merged timed fallback can show explicitly
  provisional options outside requested limits; it does not change saved caps
  or permit booking. Rehearse the fully fitting path above.
- **Different venues:** use another suitable option. Claude is not deterministic;
  this is normal when the menu, budget and opening-hour checks still pass.
- **No Calendar opening:** choose the rehearsed manual window and say so.
- **API/tunnel outage:** open the saved completed rehearsal Huddle or play the
  recorded clip. Say it is the rehearsal result; do not present it as a live call.
- **Missing map:** use the blue underlined external Maps action. Do not claim the
  iframe passed if the key/referrer configuration has failed.

## Final submission checks

- [ ] Both Erics can open the deployed build, log in and join an invitation.
- [ ] Current main commit and Vercel deployment are green; no last-minute schema
  reset, catalog rebuild or tunnel replacement during the pitch.
- [ ] Public result sharing exposes no private needs, orders, caps or credentials.
- [ ] Team members, repository, public demo URL and video are on the submission.
- [ ] Confirm the official deadline and pitch format with organizers. Update
  [DISCLOSURE.md](DISCLOSURE.md) / [HONESTY.md](HONESTY.md) if the demo setup changes.
