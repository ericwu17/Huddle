# Multi-city coverage and location selection

The branch preview adds SF/Oakland without editing Eric Wu's scraping code or
existing discovery/menu/photo files. The shared release still requires the
module publish, updated API and explicit catalog publication below.

## Behavior

- Start Huddle has a searchable **Your city** field. Blank means **Any city**;
  there is no automatic Berkeley/downtown assumption. `SF` resolves to San Francisco.
- The lobby supports the same picker, **Use my location**, and **Clear my location**.
  GPS asks for browser permission and uses actual coordinates. Manual selection
  stores a city preference and never creates fake downtown coordinates.
- Each joined participant contributes one current city preference. The most
  frequent city becomes the destination. Ties retain every tied city: for two
  tied cities Claude must provide options in both when feasible. Each itinerary
  stays within one postal city. Existing results still contain at most 3 choices;
  4+ tied cities may need another planning request to explore all of them.
- People with no location do not cast a city preference. If everyone leaves it
  unset, the catalog remains flexible. GPS outside supported municipal boundaries
  reports an error; it never guesses Berkeley. Select a supported city manually.
- City changes clear the active run and make the changer unready. Old votes,
  roulette and booking requests cannot be reused; save preferences and replan.
- Exact origins stay private. The group sees aggregate city counts and its
  destination cities. The private `member_location` table stores city/source;
  `my_huddle_location` projects only the caller's group plus their own city/source.
- Google Calendar scheduling checks only venue hours within the current
  destination cities and keeps its request below 160 venues. No event is created
  merely by choosing a city or finding a time.

City boundaries come from Census polygons bundled in
[data/geography](../data/geography/README.md); there are no live geocoder calls,
new provider keys or new dependencies.

## Catalog and contract

The reproducible pilot contains 200 venues: all original 140, plus 30 SF and 30
Oakland listings. Existing 950 menu items and 386 photos are retained unchanged;
the expanded pool has 499 photos. Newly added listings have source ratings,
hours and available photos, but no invented menus or menu prices. Their private
order uses the existing venue allowance until Eric adds sourced menu details.

Stored limits are 320 total (160 meal / 100 activity / 60 dessert). Planning
requests retain the 160 limit (80 / 50 / 30). Selection balances areas and keeps
menu-rich venues, with requested cities prioritized. Replies are checked against
that same bounded snapshot. `destinationCities` is an additive optional array
on `/agent/plan`; omitted/empty means flexible. It is derived by the module,
filters eligible venues in Python, and is checked again by the module. It does
not raise budgets or certify allergy compatibility.

The new builder is offline. It reads Eric's committed outputs, preserves existing
IDs/evidence, skips closed/invalid or clearly unusable listings, adds reviewed
physical venues in each city, and writes only `data/catalog/cities.json`.
Do not run the old Berkeley-only publish afterward: it replaces the active set.

```sh
# From repo root, using the API's installed Python environment:
.venv/bin/python scripts/build_city_catalog.py
.venv/bin/python scripts/publish-menu-catalog.py --output /tmp/huddle-cities.json
```

## Preview and release

Review environment: `http://127.0.0.1:5181`, database `huddle-account-max-check`,
Max's API port 8002. Port 5180 remains an unchanged frontend against the shared
`huddle-calhacks` database; Eric Wu's shared API/tunnels are untouched.

After verification, release in order without resetting data:

1. Sync main and release the tested API/module/UI changes together.
2. Publish the module (adds only the private location table/view and controls):
   `spacetime publish huddle-calhacks --module-path server --server https://maincloud.spacetimedb.com --no-config --delete-data=never --yes=remote`.
3. Ensure Eric's API has pulled/restarted with `destinationCities` support;
   keep the existing API/voice tunnel URLs and Google redirect configuration.
4. Build and publish the new enriched pool:
   `.venv/bin/python scripts/publish-menu-catalog.py --publish --database huddle-calhacks`.
   `HUDDLE_SHARED_SECRET` comes from ignored `api/.env` or the environment.
5. Verify the shared UI receives SF/Oakland choices, retains menus/photos, and
   passes manual city, GPS, majority/tie, stale-vote and budget scenarios.

No Routes API was added. Travel remains the existing estimate; walking map links
are unchanged. Real transport modes and routed timings remain a follow-up in
[GOOGLE_MAPS_PLAN.md](GOOGLE_MAPS_PLAN.md).

## Verification on this branch

- 126 Python tests passed.
- 223 module tests passed; 1 opt-in external test skipped.
- Module typecheck, web production build and lint passed.
- 29 connected two-account checks verified real Claude plans in SF/Oakland/Berkeley,
  private cumulative budgets, rendered options/maps and completed voting.
- 23 connected three-account checks verified typed Start city, actual simulated
  browser GPS, plurality/ties, within-city plans, stale-vote rejection, reload,
  clear/edit controls and phone layout. No browser runtime/console errors.
- Existing IDs, 950 menu items and 386 original photos are compared exactly by the
  regression suite. Eric's scrape files, shared API/tunnels and voice are unchanged.
- No real message, calendar write, booking or paid scrape was performed.

Commands (from repo root):

```sh
.venv/bin/python -m unittest discover -s api/eval -p 'test_*.py' -q
npm --prefix server run typecheck
npm --prefix server test
npm --prefix web run build
npm --prefix web run lint
```

The web build retains the existing large-bundle advisory. It completed successfully.
