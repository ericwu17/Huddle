# Google Maps and multi-city planning plan

**Implementation update:** [CITY_COVERAGE.md](CITY_COVERAGE.md) records the new
isolated preview: 200 stored venues, bounded area-aware retrieval, optional typed
city selection/GPS, participant-city plurality/ties, and hard destination checks.
The original audit and proposal below are retained for context. The branch now
adds a frontend-only Google Maps Embed directions preview with driving by default
and walking/transit/biking controls. Google displays the route, distance and travel
time; changing this local preview does not alter the saved outing schedule.
Routes API integration into planning remains a follow-up. Shared release
is pending; Eric Wu's scraper and shared API/tunnels remain untouched.

October 24, 2026. Keep the local FastAPI/tunnel, shared Maincloud state and Vercel
frontend. This work adds comparison UI and map opening; it does not replace
Claude's planning or change budget, allergy, voting or booking contracts.

## October 24 audit: why Berkeley dominates

This is a plan update, not an implementation or catalog activation. Keep Eric
Wu's local API/voice launcher, tunnels, Maincloud and the separate frontend.

A read-only query of shared `huddle-calhacks` (`SELECT * FROM catalog_venues`,
October 24 at 8:52 PM America/Los_Angeles) returned 140 active venues at version
`2026-10-25T02:08:31Z-b14f5646-menu-a3a23aaa805e`:

| Listed address city | Active venues | Meals | Activities | Desserts |
| --- | ---: | ---: | ---: | ---: |
| Berkeley | 120 | 49 | 43 | 28 |
| Oakland | 9 | 5 | 3 | 1 |
| Albany | 9 | 5 | 3 | 1 |
| Emeryville | 2 | 1 | 1 | 0 |
| San Francisco | 0 | 0 | 0 | 0 |

The committed discovery file has 5,932 normalized rows: 3,197 assigned to the SF
search area, 1,494 Oakland, 645 Berkeley and 596 outside the three area boxes.
Discovery areas are rectangles, not postal city boundaries; these are not
city-by-city publication conversion rates. Both the committed basic snapshot
and the active menu-enriched snapshot contain the same 140 venue IDs/cities.
The live snapshot retains 950 menu items and 386 photos, with no duplicate IDs or
invalid latitude/longitude values in this check. Only 51 active venues have
nonempty menu items; SF has none, and Oakland has three such venues/24 items.

**Confirmed cause:** [collect.py](../data/reviews/collect.py) discovers all three
areas, but `merge()` calls `in_box()` with the default `fp.BERKELEY` rectangle
before appending a new venue. That rectangle includes some adjacent-city
addresses, explaining the small Oakland/Albany/Emeryville presence. Restarting
FastAPI or adding a Google Maps key will not publish the missing SF venues.
[BRIGHTDATA.md](BRIGHTDATA.md) already documents the raw-only Oakland/SF batch.

**Additional gaps:** the plan request has no explicit destination-area or travel-
mode control, and the bounded Claude venue context has no explicit city/address
field. Claude currently selects from Python-enumerated candidate itineraries,
not from every scraped place. The effect of sampling on individual Oakland
choices has not been measured; the absence of SF from the active input is
conclusive. Do not describe this as Claude refusing to choose an available SF
venue.

The current shared catalog caps are 80 meals, 50 activities and 30 desserts;
`AgentCatalog` accepts at most 160 places per request. Uploading all 5,932 raw
rows or merely increasing caps is not a safe multi-city implementation.

## Shipped first step

On each option and on Done/shared results, **Click here to see the map!** is blue
and underlined. It opens Google Maps in a separate tab, preserving the current
Huddle page and votes. One venue opens its place search; 2–5 stops open driving
directions by default, in the itinerary's order, including intermediate stops.
When the embedded route is configured, its transport control also updates the
external link. Transit uses one consecutive leg at a time so no waypoint is lost.
The URL contains only public venue coordinates/addresses; private orders,
budgets, preferences, account IDs and participant starting locations stay out.

Google's [Maps Embed directions mode](https://developers.google.com/maps/documentation/embed/embedding-map#directions_mode)
displays route geometry, distance and travel time. Enable **Maps Embed API** and
create a browser key restricted to that API and exact local/production website
origins. Put `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY` in `web/.env.local` for local
preview and in the Vercel frontend environment for deployment; restart/rebuild the
frontend. No Maps secret, Routes API key, OAuth change, backend restart or module
republish is needed for this display-only feature.

[Maps Embed is free with unlimited requests](https://developers.google.com/maps/documentation/embed/usage-and-billing).
Do not enable premium routing merely to display directions. No iframe contents
are scraped or saved; Google renders its own directions, notices and attribution.
Maps URLs opened externally also require no API key.

Without an Embed key, the OpenStreetMap fallback retains public venue pins and
dashed straight-line guides. Its legend shows straight-line distance in feet or
miles, never walking minutes. The old OSRM foot-router calls are removed. This
fallback does not claim road distance or travel time. The Google iframe is only
mounted when Map & details is opened, or on the final result page.

Display-mode controls are local to the viewer and synchronized between map and
external links for that stop sequence. They do not change another participant's
view, replan, invalidate votes, change a budget, create a Calendar event or alter
booking. Feeding actual mode-specific travel times into feasibility checks is a
separate planner contract change, still deferred. Google directions use Google's
current routing context; the saved itinerary date/time remains Huddle's schedule.

### Branch verification

- Module/type checks and frontend build/lint pass; 234 automated tests pass,
  with one existing opt-in integration test skipped.
- 55 connected browser checks pass on the isolated Maincloud preview, including
  real Claude/catalog options, owner-only Calendar actions, voting/Done/sharing,
  private data exclusion and desktop/mobile distance fallback.
- All four embed modes, matching external links and unchanged votes were tested
  with an explicitly synthetic iframe response. No Google route was fetched.
- Live Google rendering remains pending a configured Embed key and allowed
  website origins. No shared API, module, scraper, tunnel or Vercel deployment
  was changed by this display update.

## Current option labels

Labels compare the current options on Plans and Vote, keeping option numbering
and proposal order stable. A label is awarded only when all compared options
have the required data and at least one is different. Equal best values share
the label; if everyone ties there is no arbitrary winner.

| Label | Basis | Limit |
| --- | --- | --- |
| Highest rated | Equal-weight average of the catalog ratings for every distinct venue in the option, rounded to one decimal | Every stop needs a nonzero rating and reviews; this is a route average, not just the first restaurant's rating. |
| Cheapest for you | Owner-private suggested total across their own meal and all later stops; legacy uniform-cost plans retain their documented baseline | Menu prices and venue estimates may be used; unknown totals suppress the comparison. Never pool budgets or include another person's meal. |
| Most convenient | Least estimated travel between itinerary stops, rounded to minutes | Does not include anyone's journey to the first stop, live traffic or verified Google walking times. Untimed venue-only options have no travel label. |
| Most variety | Widest mix of meal, dessert and activity stops | Does not infer personal novelty, popularity, dietary safety or adventurousness from a cuisine. |
| Claude's pick | Existing coordinator recommendation | Separate from the factual comparisons; it does not imply the cheapest or highest-rated option. |

The title/accessibility description explains each basis. Comparisons are local
presentation of the caller's authorized data, never a new solver or a new shared
preference leak. Public result links do not expose private comparative costs.

## Proposed next phases, in order

The work below is a follow-up. Agree additive shared contracts before editing
API/module/UI shapes, and keep Eric Wu's scrape/ingestion files under his
ownership. Google Maps routing and multi-city discovery solve different problems.

### 1. Publish useful city coverage before buying route calls

**Eric Wu: ingestion and venue evidence; Max: snapshot contract and verification.**

- Add an explicit supported-area selection to merge/publish; keep Berkeley as an
  intentional option rather than a hidden global filter. Reuse the existing SF
  and Oakland discovery rows, stable venue IDs and source evidence.
- Start with a curated three-area pilot in the isolated preview, within the
  current 160/category caps. Each area needs actual meal, dessert and activity
  options, opening hours and enough menu prices/photos for useful private orders.
  Collect details for the selected SF/Oakland pilot, not a new city-wide scrape.
- Preserve every existing menu/photo for retained venues. Keep older venue IDs
  and history lookups resolvable when changing the active set; do not delete old
  rows or silently lose older Huddle cards. Verify these paths before promoting.
- Publish through the menu-enriched publisher. Report counts by listed city,
  category, menu-price coverage and photos before and after publication.
- For the larger catalog, separate stored discovery coverage from a bounded
  area-aware shortlist sent with each planning request. This needs a coordinated
  ingest/snapshot/version contract; it is not implemented. Never send the entire
  raw review file to Claude or enumerate all cross-city stop combinations.

**Why first:** a router cannot suggest a restaurant that never reaches the
planner. Three complete, useful city samples beat thousands of raw-only rows.

### 2. Make location and transport explicit

**Eric Chen: controls; Max + Eric Wu: agreed contract and validation.**

- On Start/Preferences, offer **Where? Any supported area / Berkeley / Oakland /
  San Francisco**, plus **Getting around: Walking / Transit / Driving**. Final
  field names/defaults remain a contract decision, not new existing API fields.
- Blank location means open to supported areas, not an implicit Berkeley veto
  or automatic Berkeley-only search. With Any area, propose compact local
  clusters and show each option's city. Do not force one option per city when
  the group's actual limits make that unsuitable.
- Interpret an explicit "SF only" as a destination requirement. Supply grounded
  city/address/coordinates and travel mode to Claude; validate membership in the
  requested area in Python. Missing coverage must not quietly become Berkeley.
- A neighborhood or starting point is optional, private and explicitly supplied.
  Use browser location only with consent. Without an origin, describe travel
  between stops and make no claim about anyone's commute to the first stop.
- Build a coherent outing within one area by default. Cross-city stops are
  considered when requested and when actual routing supports the outing length.
  Do not infer a walk across the Bay from a short straight-line distance.

**Display update on this branch:** Maps links now default to driving and follow
the local embedded preview mode. Planner travel estimates are still the original
contract; synchronizing the saved schedule with a chosen group travel mode is a
separate follow-up.

### 3. Give Claude route facts and validate the resulting itinerary

**Max: route adapter and hard checks; Eric Wu: planner/data integration.**

Keep the approved direction: Claude proposes/revises grounded venue sequences;
Python validates venue IDs, each person's own outing cost, opening hours and
travel/time limits. The current complete-itinerary enumerator still needs the
separate approved proposal/revision migration.

Proposed flow:

1. Maincloud supplies confirmed needs, selected area/mode and a bounded catalog.
2. Claude proposes up to three useful sequences and each owner's menu choices.
3. FastAPI requests Google Routes estimates for those sequences, then recomputes
   arrival/departure times including venue dwell and waiting.
4. Python checks every stop's opening interval, end time and unchanged private
   caps. Invalid proposals return concrete reasons to Claude for bounded revision.
5. Publish current, coherent options with private orders and short grounded
   explanations. If a provider fails, retain useful catalog alternatives and
   the external Maps action; do not present missing travel as zero or verified.

Use **Routes API `computeRoutes`**, requesting only needed duration, distance and
leg fields. Fetch geometry only when displayed. Google discourages wildcard
[field masks](https://developers.google.com/maps/documentation/routes/choose_fields).
Walking/driving sequences may use intermediate stops. **Transit does not support
intermediate waypoints**, so request successive legs with appropriate departure
or arrival times; add walking/transfers/waiting from the returned route rather
than appending an invented BART duration. See
[transit routes](https://developers.google.com/maps/documentation/routes/transit-route).

The current [catalog travel model](../api/catalog.py) scales straight-line
kilometers and uses fixed walking/transport speeds. It is not road, bridge,
traffic or transit routing. Replace its use for these new options explicitly;
do not relabel those estimates as Google results.

Bound requests to the small proposal set. Defer `computeRouteMatrix` until
consenting participant origins or a larger bounded comparison actually require
it; matrix billing is origins multiplied by destinations, not one charge for
an arbitrarily large matrix. See
[usage and billing](https://developers.google.com/maps/documentation/routes/usage-and-billing).

**Proposed additive contract to review:** plan/run ID, input revision, catalog
version, mode, departure time, route status/provider, and per-leg place IDs,
duration seconds and distance meters. Keep legacy `travelMinutes` compatible
until all callers migrate. Any origin/area/mode/time/catalog change invalidates
matching route results and affected votes. Agree storage policy before retaining
Google response fields in shared tables; do not assume unlimited route caching.

Keep **Most convenient** based on comparable inter-stop routing. A future
"Closest for you" label can use an owner's private commute separately; public
shares and Maps URLs must not reveal participant origins.

### 4. Put a Google map inside Options and Done

**Eric Chen: UI; Max: route/map contract.**

Use a lazy **Maps Embed API** iframe first, with the existing blue underlined
external action retained. One stop uses a place map; a multi-stop option uses
directions in the chosen mode. Embed requests currently have no usage charge
but require an API key ([billing](https://developers.google.com/maps/documentation/embed/usage-and-billing),
[embed guide](https://developers.google.com/maps/documentation/embed/embedding-map)).
An iframe's displayed travel time is not structured route data for Python;
Routes API remains the source for Huddle's own time validation. Verify that any
embedded route preserves stop order; for multi-leg transit use per-leg views if
needed instead of silently dropping stops.

Only introduce Maps JavaScript API if we need custom interactive pins, route
selection or exact returned geometry that Embed cannot provide. Google route
content shown on a map must appear on a Google map, so do not draw Google's
polylines over the existing OpenStreetMap/Mapbox base. Preserve required
attribution/walking-route warnings and review provider storage restrictions;
see [Routes policies](https://developers.google.com/maps/documentation/routes/policies)
and [route options](https://developers.google.com/maps/documentation/routes/route-opt).

### 5. Configure the two distinct Maps capabilities

**Google Cloud owner: project/settings; Eric Wu: API host; Eric Chen: web env.**

| Capability | Proposed setting | Location | Restrictions |
| --- | --- | --- | --- |
| Server-side route estimates | `GOOGLE_MAPS_API_KEY` | API host's ignored `api/.env` | Routes API only; application/IP restriction when appropriate for the host; bounded quotas |
| Embedded browser map | `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY` | Web env/Vercel | Maps Embed API only; HTTP referrers for `huddle.compare` and explicitly approved local test origins |

These variables are proposals, not currently wired features. Server keys are
never sent to the browser; the restricted Embed key is intentionally a browser
key. Enable Routes API and billing before route calls, then set explicit request
quotas and billing alerts. An alert is not a spending cap. The existing Google
Calendar OAuth client/secret serves a different capability and needs no new
redirect URI for Maps. Reuse known coordinates/place IDs; do not add Places or
Geocoding calls merely to locate already identified catalog venues. Setup:
[Routes API](https://developers.google.com/maps/documentation/routes/get-api-key).

### Acceptance checks before promotion

- [ ] Preview has useful SF, Oakland and Berkeley meals/desserts/activities with
  preserved menu/photo evidence and stable IDs; old Huddles still resolve.
- [ ] "SF only" returns SF venues; "Oakland dinner" can choose Oakland meals;
  Flexible can suggest any supported area without a hidden Berkeley filter.
- [ ] Same vegan/$30, steak/$50 and dessert/under-three-hours scenario works in
  each area when catalog facts support it; costs are each person's own choices.
- [ ] Selected walking/transit/driving mode matches navigation and route facts.
- [ ] Cross-Bay transit uses real travel/waiting and fits stop opening/closing
  times; no straight-line shortcut or fabricated fare enters a verified plan.
- [ ] One/two/five-stop options, mobile map handoff and in-app map preserve stop
  order and the current vote; opening Maps sends no invitation or calendar event.
- [ ] Missing location, route unavailable, quota/timeout and stale replies retain
  usable venue ideas without inventing travel or silently relaxing limits.
- [ ] Public result links contain public venue routes, not private origins,
  orders, budgets or dietary/allergy text. Owner data remains private.
- [ ] Two-account testing reaches voting/Done/share and opt-in Calendar after
  city/mode edits; old choices cannot overwrite a newer revision.

## Budget/time decisions that stay explicit

The current cap covers a person's own meal plus their own later food/activity
stops. **Do not silently add fares, parking or tolls to that contract.** Agree
whether travel charges should be included before changing totals. Likewise,
whole-outing duration currently includes stops and inter-stop travel; the
private limit to reach the first stop is a separate field. An optional return
journey is follow-up scope. Maps work never raises a cap without that person's
explicit private trade acceptance.

## Follow-up: Most daring / Best fit

These labels need the coordinator's interpretation of the participants' current
soft wishes and, if explicitly saved, past-outing context. Add a bounded optional
agent label plus a grounded reason through an agreed API/module contract. Do not
recover it from placeholder novelty features or equate an unfamiliar cuisine
with adventurousness. Known hard restrictions and each person's cap still apply.

Acceptance: a user asking for a familiar burger and another asking to try
something new receive useful alternatives and a clear explanation; the label
must follow context changes rather than stick to Option 1/2/3.
