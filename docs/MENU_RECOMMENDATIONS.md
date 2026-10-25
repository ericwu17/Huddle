# Menu recommendations and provisional options

October 24, 2026. This supersedes the earlier blanket allergy/dietary planning
block and the deferred personal-meal-cost notes. The full Claude
propose/validate/revise planner is still a separate follow-up.

## Behavior

Claude receives the current Maincloud catalog, sourced menu items, each person's
private prompt/controls and the public discussion. It selects existing venue
and menu item IDs. Missing dietary or allergy evidence no longer hides all
recommendations. Context clues can support a **provisional suggestion**; they
do not establish verified allergen handling. Known ingredient conflicts are
excluded from that person's offered item IDs. Unknown ingredients stay unknown.

The UI shows venue names joined with arrows, ratings/review counts, available
photos and **your own** proposed menu order. It uses AM/PM times and shows item
prices only when the menu lists them. Unknown item prices and incomplete totals
are omitted from cards; internal cost validation still uses the venue allowance,
never zero/free. Source evidence remains in the catalog for the coordinator and
validation, without source/date links or confirmation boilerplate in plan cards.
Another person's orders or private requirements are never shown to you.

Each person's total is their own selected meal plus their selected later food
stops and shared activity costs. It is independently checked against their own
current outing cap. Another person's steak is not charged to them. Existing caps
cannot be raised/erased without the existing owner-only private offer acceptance.

All current suggestions can be voted on, including provisional timed plans.
Complete tied ballots can use equal-chance Spin. Voting is an expression of
group preference, independent of booking eligibility. Only a current ready
timed winner can enter booking simulation. Any current timed winner, including a
provisional venue choice, can become an explicitly opted-in Calendar meetup;
that event is not a reservation or venue verification. The module
enforces that distinction and still rejects falsely ready results, unknown item
IDs, incorrect totals, changed item prices and stale budgets. Missing allergy
evidence, unknown/unpriced selections and unsupported dietary evidence still
require provisional status internally.

If no timed itinerary fits the current budget, duration, hours or travel limits,
the coordinator can suggest up to three **untimed venues to explore**. These
have no fabricated visit times and are not claimed to fit those limits. They
can enter an exploratory group vote and Spin, but cannot be booked or added to
calendars. Voting does not raise budgets or claim these venues fit the outing.
If Claude fails, clearly labeled real-catalog
ideas keep the screen useful; they are not represented as Claude decisions or
synthetic venues. An empty/excluded catalog cannot produce invented places.

Specific source labels such as **Pizza restaurant** supersede the coarse cuisine
family in explanations and venue cards. Eric Wu's optional `Place.label` is
preserved; the old 13-feature order and legacy cuisine enum are unchanged.
Cheese Board's current scrape contains a salad with an unknown price and sesame
in the dressing; do not invent a pizza item/price from its name alone.

## Additive contract

`catalog.evidence[placeId]` retains rating `sources` and optionally adds:

```text
foodStyle: string
menu: {status, items: [{id, name, section, description, labels, price|null,
                      sourceUrl, fetchedAt}]}
photos: [{url, sourceUrl, attribution}]
```

At most 85 menu items and three photos per venue. Source URLs are HTTP(S),
credential-free and bounded; fetched times and whole-cent prices are validated.
Stable item IDs hash the venue ID and normalized source item. Atomic ingestion
rejects an invalid complete snapshot without damaging the last good one.

`/agent/plan` keeps legacy fields and adds:

- Plan `status: ready|provisional`, `summary`, optional `costModel: own_orders`
  and `costRange: {min,max}` across independently validated participant totals.
- `suggestions: [{id,placeId,summary,limitations}]`: untimed ideas that can receive
  votes using their existing IDs, with no fabricated schedule.
- `privateOrders: [{memberId,planId,items:[{placeId,itemId|null}],total}]`:
  **service-to-module only**. The module strips this before storing the public
  result and saves selections in private `agent_order`. Only the owner/current
  huddle can read `my_agent_orders`. Suggestions use their ID as `planId`.

For compatibility `costPerPerson` remains the sum of the stops' original catalog
estimates. It is a **venue baseline**, not the authoritative personal charge for
`own_orders`. Use the private total for each cap and the range/own total in the
validation. The UI shows an owner total only when all selected prices are known.
Legacy plans without this cost model retain their old budget checks.
The module re-resolves item IDs and recomputes costs at ingest and action time.

Python still enumerates schedule-compatible venue sequences; Claude chooses
options and personal menu orders. It does not yet construct/revise arbitrary
sequences, combine separate takeout meals at public seating or verify live
venue availability. Menu lookup is cached per member/venue within a request;
the coordinator model call has a 60-second limit inside the module's 90-second
HTTP timeout. No scoring/Bayesian/Monte Carlo decision layer was added.

## Publish and operate

Keep Eric Wu's scraper unchanged. The menu adapter reads its committed
`catalog.json` and `details.json`, validates their joined snapshot, and publishes
through the same protected `/catalog` route. Use the root Python environment:

```sh
.venv/bin/python scripts/publish-menu-catalog.py
.venv/bin/python scripts/publish-menu-catalog.py \
  --database huddle-calhacks --publish
```

The first command is a dry-run. The second uses the shared secret from ignored
`api/.env` (or its environment variable); it prints no credential. Specify
`--database huddle-account-max-check` for isolated preview publication.
No raw scrape is bundled into the frontend.

Release in this order: **publish the module without deleting data → restart
FastAPI → publish the enriched catalog → push the tested frontend to main**.
An ordinary `collect.py publish` still emits the basic catalog and can replace
the menu evidence. After fresh scraping, run the menu publisher above with both
updated files; do not assume menus remain active after a basic publish.

The current source contains 130 venues, 950 menu items and 386 photo records.
Menu coverage is incomplete: only 51 venues have `menu.status=ok`; many item
prices are unknown. This release cannot promise three fully compatible,
verified choices for every imaginable request. It provides honest provisional
or untimed alternatives instead of a blanket evidence block.

## Google Calendar

The API client ID matches the client Max supplied. Both exact callback URLs now
reach Google's sign-in page in fresh authorization requests with the actual
scopes; there is no returned provider error at that boundary:

```text
https://roughly-metabolism-representing-harmony.trycloudflare.com/connectors/google/callback
https://eat-days-means-magnetic.trycloudflare.com/connectors/google/callback
```

No trailing period or slash. These belong under the exact Web application's
**Authorized redirect URIs**, not only JavaScript origins. The Connectors screen
now shows/copies the API's actual public callback. Close failed Google tabs and
start a fresh connection from Huddle. A participant must finish their own
consent; the sign-in-page probe does not prove that step, free/busy or events.
Changing a tunnel hostname requires updating the allowlist again.

## Next work

1. Max: finish the bounded Claude propose → validate → revise follow-up and
   useful explanations of compromises, especially separate takeout meals plus
   evidenced public seating. Keep current cap/privacy/action validation.
2. Eric Wu: close menu coverage gaps (complete vegan meals, real steak/fries,
   desserts, item prices), explicit dietary evidence, takeout and sourced
   seating. Review side/condiment-only menus and mismatched shared websites.
3. Eric Chen: polish the account/invitation/plan UI with actual multi-person
   testing, short compromise labels and clear owner-only order editing.
4. Each participant: reconnect Google, then test shared availability and one
   explicit opted-in calendar meetup. Messages remains a separate Mac issue;
   in-app invitations already work without it.
5. If spending is acceptable, host FastAPI at an always-available HTTPS address
   to remove the laptop/tunnel dependency and stabilize OAuth callbacks.
   Claude already uses its API key; there is no local inference model to buy or
   start. Hosting is a separate deployment decision, not necessary for this
   menu release.

## Verification record

- 110 Python checks passed after merging Eric Wu's category-label update.
- 160 native module tests passed; one opt-in HTTP test skipped.
- Frontend build and lint passed; the existing bundle-size advisory remains.
- 49 connected preview checks and 49 shared checks passed with real Claude, private menu selections,
  per-person costs, current votes, a simulated booking and allergy suggestions.
- 15 preview and 15 shared OAuth wiring checks passed without granting Google access/events.
- 30 desktop/mobile account-to-menu-to-simulation browser checks passed with no
  page/console errors, warnings or mobile overflow.
- 13 additional desktop/mobile browser checks passed for provisional allergy
  options, guarded direct vote navigation and untimed fallback cards.
- Four real-Claude scenarios returned options: matching Asian requests, a
  kosher/peanut-allergy case, vegan/steak/dessert, and zero budget/15 minutes.
  After caching repeated menu lookups they completed in 5.7–9.0 seconds in the
  measured run. The impossible case returned untimed alternatives; menu gaps
  remained provisional rather than invented matches.
- Google registration control: the registered shared callback reached sign-in;
  an intentionally unregistered callback reached Google's OAuth error route.
  Participant consent completion remains a separate test.

All fixture people and booking actions in these checks are synthetic/simulated.
No texts, Google grants/events or restaurant calls were sent by these tests.

Shared backend activation preserved every pre-update group/member/run identifier
(31/66/24). The API remains at the existing shared tunnel on Max's Mac. The
latest UI reconciliation keeps the sidebar/vote/map/SPA changes while preserving
friend invitations and all menu/provisional guards; QR/code sharing was removed.

### Voting and card correction

The later voting update supersedes the historical display-only checks above.
Preview verification passed 60 connected assertions and 24 desktop/mobile browser
assertions, including conflicting requirements, provisional ballots, tie Spin,
direct Vote URLs, untimed ballots and invalidation after changed needs. The local
suite passed 110 API tests and 169 module tests (one opt-in HTTP skip), frontend
build/lint and 26 focused rendering/format checks. The shared module was published
without a data reset and both existing API tunnels returned healthy responses.
The shared API was restarted on the same URL; no Calendar or Messages settings
were changed. No texts, Calendar events or restaurant calls were sent by tests.
