# Bright Data: how we collect Berkeley places

Code: [`data/reviews/`](../data/reviews/). Source note for the Google Maps route: [`brightdata_googlemaps.md`](../brightdata_googlemaps.md) (measured 2026-10-24 for another project).

**Status (2026-10-24):**
- **Full Google Maps discovery has run:** 360 inputs (12 grid points × 30 keywords) returned 1,023 records, 3 of them errors, covering 1,009 distinct places. 936 of those classify as a stop: 524 restaurants, 380 hangouts and 32 boba shops. Stores, markets and other non-stops are dropped. 41 of the 45 bundled places were found again.
- **Oakland and San Francisco discovery has run (2026-10-25 UTC):** two 1,890-input jobs (63 points × 30 keywords each) ran in parallel in about 17 minutes. Oakland returned 2,517 records (11 errors) and SF 3,730 (18 errors). Together with an earlier 60-input trial run at each city's center (953 records), that's about 7,200 records, roughly $11 at $1.5 per 1,000. `data/brightdata/places.json` now has 5,932 places:

  | Area | Places | Restaurants | Boba | Hangouts |
  |---|---|---|---|---|
  | Berkeley | 645 | 389 | 25 | 231 |
  | Oakland | 1,494 | 915 | 27 | 552 |
  | SF | 3,197 | 1,885 | 103 | 1,209 |
  | Outside all three | 596 | 341 | 25 | 230 |

  The file is 33 MB, mostly Google top reviews (15 MB). Oakland and SF places don't reach the app. Berkeley gained 4 places found from the Oakland grid. A future `publish --add` could therefore pick slightly different new venues than the live snapshot.
- **Yelp discovery returned nothing** on two input types (see the Yelp row below), so all of the data is from Google Maps.
- **The 140-venue catalog snapshot is live on shared `huddle-calhacks` and the isolated preview.** `data/brightdata/catalog.json` has 60 meals, 50 activities and 30 desserts. The October 24 refresh retains all 130 previously active venue IDs and adds ten Berkeley venues from the expanded scrape. The first activation used the committed version `2026-10-24T20:17:52Z-a182c74b`, after an additive module publish and API restart from `a029fb6`, without resetting data. The actual Vercel flow selected two new scraped IDs and passed 30 desktop/mobile checks. The live snapshot is now the menu-enriched `2026-10-25T02:08:31Z-b14f5646-menu-a3a23aaa805e`, built from the committed `catalog.json` plus `details.json` (route `/health` reports it with 140 venues). All 950 existing menu items and 386 photos, including their stable IDs and attribution, are retained unchanged. The final snapshot incorporates Eric’s complete 5,932-place batch, refreshes 54 source evidence records and one venue review count relative to the initial refresh, and preserves every existing menu/photo. Oakland/SF discoveries remain outside the active Berkeley catalog. [Operations](ACCOUNTS_RUNBOOK.md) records the shared targets and verification. To refresh the data, see [Go live](#go-live).
- **Venue details remain available for the original 130 venues** (`details.json`; the ten added venues have no menu/photo sidecar yet; see [Venue details](#venue-details-menus-takeout-seating-photos-dietary-evidence)). `scripts/publish-menu-catalog.py` adds their menu items and photos to the published catalog ([MENU_RECOMMENDATIONS.md](MENU_RECOMMENDATIONS.md)). Takeout and seating aren't used yet.

## What it collects

Restaurants, boba shops and places to hang out in Berkeley, from **Google Maps and Yelp**, joined into one row per place:

| Group | Keywords (one search each) | Huddle category |
|---|---|---|
| restaurant | restaurants, thai, chinese, japanese, korean, indian, vietnamese, mexican, pizza, italian, mediterranean, burgers, sandwiches, brunch, vegetarian | meal |
| boba | boba, bubble tea, tea house | dessert (`cafe_dessert`) |
| hangout | bars, cafes, arcade, bowling, karaoke, board game cafe, escape room, museum, live music, comedy club, movie theater, parks | activity (cafes: dessert) |

A place's group comes from its own categories, not from the keyword that found it. Searching "restaurants" also returns cafes.

**Areas.** `discover --areas` takes a comma list of `berkeley` (the default), `oakland` and `sf`. Each area is a rectangle in `AREAS` in `collect.py`, covered by its own grid of points about 1 mi apart, and runs as its own job.
- `berkeley` is the `BERKELEY` rectangle in `data/fetch_places.py`, with 12 points.
- `oakland` runs from North Oakland/Rockridge to the airport edge, with 63 points. It also includes Emeryville, Piedmont and Alameda.
- `sf` is the city proper, with 63 points.

Every row records its `area`, or `null` for a place outside all three; searches spill past their area's edge. Only Berkeley places are merged into the app's catalog. Oakland and SF rows are collected into `data/brightdata/` and don't reach the app. `--areas` applies to Google Maps only; Yelp searches stay "Berkeley, CA".

## Products and calls

Everything uses the **Web Scraper API** (`https://api.brightdata.com/datasets/v3`, header `Authorization: Bearer $BRIGHTDATA_API_KEY`). It needs no zone. According to the source note it works without KYC.

| Source | Dataset id | Call |
|---|---|---|
| Google Maps, discover | `gd_m8ebnr0q2qlklc02fz` | `POST /trigger?dataset_id=…&type=discover_new&discover_by=location&limit_per_input=20&format=json&include_errors=true`, body `{"input":[{"country":"US","lat":…,"long":…,"zoom_level":15,"keyword":"boba"}, …]}`. One input per grid point (12 points about 1 mi apart) per keyword. |
| Google Maps, refresh | `gd_m8ebnr0q2qlklc02fz` | `POST /scrape?dataset_id=…` with `{"input":[{"url": …}]}`. Up to 20 urls go sync, more through `/trigger`. Catalog places not yet seen use `https://www.google.com/maps/place/?q=place_id:<googlePlaceId>`, or `--catalog-by place_id` (`discover_by=place_id`). Neither form has been confirmed. |
| Yelp, businesses | `gd_lgugwl0519h1p14rwk` | Refresh by `{"url":"https://www.yelp.com/biz/…"}`. |
| Yelp, discover | `gd_lgugwl0519h1p14rwk` | **Not working yet.** `probe` found no separate Yelp discovery scraper. This one accepts `discover_by` = `url`, `bounding_box` (input `{location, category}`) or `search_filters` (`{country, category, location}`); the field names come from its validation errors. Both tries returned **0 records, 0 errors** with "No records found... adjust your search criteria": `url` with a Yelp search URL (`find_desc=restaurants&find_loc=Berkeley, CA`, 250 s) and `bounding_box` with `{"location":"Berkeley, CA","category":"restaurants"}` (1,198 s). `search_filters` is untried. `discover` now defaults to `--source gmaps`; use `--source yelp --yelp-discover-by …` to retry. |
| Yelp, reviews | `gd_lgzhlu9323u3k24jkv` | Not pulled yet (for the aspect pipeline). |

Async jobs poll `/progress/<snapshot_id>` every 10 s, then download `/snapshot/<id>?format=json`, retrying on 202. Every job sends all of its inputs in one request.

## Run it

```bash
export BRIGHTDATA_API_KEY=…          # or put it in the repo-root .env
python3 data/reviews/collect.py probe                                       # free: list scrapers + metadata
python3 data/reviews/collect.py discover --one-point --keywords restaurants   # spike: ≤120 records
python3 data/reviews/collect.py discover --yes                              # full: Berkeley grid, all groups
python3 data/reviews/collect.py discover --areas oakland,sf --one-point     # spike: each city's center, ≤1,200 records
python3 data/reviews/collect.py discover --areas oakland,sf --yes           # full Oakland and SF grids
python3 data/reviews/collect.py refresh                                     # fresh numbers, one batch per source
python3 data/reviews/collect.py build                                       # rebuild outputs from data/raw/, no API calls
python3 data/reviews/collect.py publish --add meal=40,dessert=20,activity=35 --dry-run  # writes catalog.json only
# Keep menu/photo evidence when activating the rebuilt snapshot:
.venv/bin/python scripts/publish-menu-catalog.py --database huddle-calhacks --publish
python3 data/reviews/collect.py merge --add meal=40,dessert=20,activity=35 --dry-run    # bundled fallback file
python3 -m unittest data/reviews/test_collect.py data/reviews/test_details.py         # offline tests
```

- `discover` stops without `--yes` when it could return more than 2,000 records. It searches Google Maps only unless you pass `--source yelp` or `--source all`. The full Google run is 360 inputs × up to 20 results, so up to 7,200 records before dedup; the real run returned 1,023. Narrow it with `--groups`, `--keywords` or `--one-point`.
- `publish` and `merge` look up new restaurants on Google Places for their price, and skip a restaurant that has none. The results are cached in `google_places.json`, so the committed `--add meal=40,dessert=20,activity=35` makes no new lookups and needs no `GOOGLE_PLACES_API_KEY`. Larger `--add` values need the key.
- Discovery takes minutes (about 4.3 min for 20 places in the measured run), so it runs as a job and never on a click.

## How it reaches the app

`publish` sends the catalog straight into SpacetimeDB, with no republish or API restart:

```
collect.py publish ──POST /catalog──▶ SpacetimeDB venue + catalog_state tables
   (X-Huddle-Secret)                    │  validated whole; a bad push changes nothing
                                        ├─▶ catalog_venues / catalog_status views (web)
                                        └─▶ every coordinator run sends the snapshot to
                                            FastAPI /agent/plan and checks the reply against it
```

- **What gets sent:** the published catalog is the same merge as `merge`. It's `data/places.json` (existing ids, enriched) plus the top `--add` new places per category, within the module's caps of 80 meals, 50 activities and 30 desserts. Each venue carries its Google Maps / Yelp URL, fetch time, rating and review count as evidence.
- **Where it goes:** the publish target comes from `SPACETIMEDB_URI`, `SPACETIMEDB_DB` and `HUDDLE_SHARED_SECRET` (shell, repo-root `.env` or `api/.env`). A local check uses `SPACETIMEDB_URI=http://127.0.0.1:3000`.
- **Snapshot file:** `data/brightdata/catalog.json` keeps the snapshot as sent.
- **IDs and failures:** existing places keep their `p_###` ids. New ones get stable `bd_…` ids, so re-publishing never reassigns one. Dropped venues are deactivated, not deleted, so earlier plans still resolve. If the push fails, the previous snapshot stays live.
- **What shows up for users:** the coordinator can cite a meal venue's rating, with source and date, as a public fact. That's the source and freshness label. Everything else Claude says about venues is still limited to catalog facts.
- **The bundled file:** `data/places.json` remains the fallback until the first push, and it's what the legacy swipe/solver flow uses. Update it with `merge` when a commit should carry the data.

Contract details: `docs/CONTRACT.md` S5.5 "Live venue catalog", and the `catalog` field in `docs/AGENT_CONTRACT.md`.

The coordinator flow shows each stop from the plan result, so new `bd_…` venues display correctly. The legacy swipe screen looks venues up in the bundled `data/places.json`, which still has only the 45 places. The legacy flow never offers `bd_…` venues, so this doesn't break anything.

### Go live

**Done on 2026-10-24.** The shared module has the `venue` and `catalog_state` tables, the shared API accepts the `catalog` field the module sends with each plan request (`api/agent_models.py`), and the catalog is published. You don't need to repeat the module publish or API restart unless a later change needs them.

**Refreshing the catalog** changes the shared `huddle-calhacks` database, so only the designated operator should do it:

1. Rebuild the basic snapshot without publishing it:

   ```sh
   python3 data/reviews/collect.py publish --add meal=40,dessert=20,activity=35 --dry-run
   ```

   This rewrites `data/brightdata/catalog.json` with a new version id. Update `details.json` too if venues changed (`collect.py details`).
2. Publish the snapshot with menus joined in:

   ```sh
   .venv/bin/python scripts/publish-menu-catalog.py --database huddle-calhacks --publish
   ```

   This needs the shared `HUDDLE_SHARED_SECRET`, from the shell or `api/.env`. It needs no Bright Data or Google key. Don't publish the live catalog with a plain `collect.py publish`: that sends the basic snapshot and drops the menu evidence ([MENU_RECOMMENDATIONS.md](MENU_RECOMMENDATIONS.md)).
3. Commit `catalog.json` and `details.json` so the repo matches what is live.

**Check:** `GET https://maincloud.spacetimedb.com/v1/database/huddle-calhacks/route/health` reports the catalog version and venue count, and a new coordinator huddle can plan with `bd_…` venues.

**Rollback:** publishing a smaller snapshot (for example `--add meal=0,dessert=0,activity=0`) deactivates the new venues. Rows are never deleted, so earlier plans still resolve.

## Venue details: menus, takeout, seating, photos, dietary evidence

`collect.py details` builds `data/brightdata/details.json`, one record per catalog venue, from three sources:

| Fact | Source | Notes |
|---|---|---|
| Ratings, review counts, star distribution | Google Maps (Bright Data) | With the scrape's `fetchedAt` and listing URL. |
| Takeout, delivery, dine-in, outdoor seating, `servesVegetarianFood`, price level | Google Places API (New), by place ID | Needs `GOOGLE_PLACES_API_KEY`. One call per venue (about $0.02–0.03), cached in `google_places.json`. A field Google omits stays `null`. |
| Photos with author attribution | Google Places | `photoUri` plus `authorAttributions`. Google Maps listing photos are also kept, with `attribution: null` because the scrape doesn't name their authors. |
| Online ordering | Google Maps "Place an order" action | Says ordering exists. It doesn't say whether that's pickup or delivery, so it's kept separate from takeout. |
| Seating notes | Google Maps | "…accessible seating" notes and "Located in" (e.g. inside a park or market). Public parks/plazas within 250 m are listed as **inferred**, with seating marked unverified. |
| Menus with item prices | The venue's website, HTML or text PDF | Fetched via Web Unlocker (`BRIGHTDATA_UNLOCKER_ZONE`) or `--fetch direct`. Claude (`CLAUDE_MODEL_SMART`) lists items as JSON. Code keeps an item only if its quote is verbatim on the page and contains the name, price and labels. Cached in `menus.json`. |

**Rules:**
- **Unknown values stay unknown.** Every fact is `{value, source, url, fetchedAt}`. An unknown fact is `value: null` plus a `reason`, never `false`.
- **Dietary tags carry `evidence`.**
  - `explicit_menu`: a label printed next to the item, the item's own text, or its menu section heading, with the quote and page URL.
  - `inferred`: a Google listing attribute or category, which is not menu evidence.
  - A label the page doesn't define (e.g. "V" with no legend) keeps `tag: null`. Phrases that mention a diet without claiming it ("vegetarian-fed beef", "not vegan") are ignored.
- **`safetyNote` on every record:** no tag establishes allergen or cross-contact safety.
- **Menu `status`** is one of:
  - `ok`;
  - `no_menu_found`;
  - `menu_in_ordering_app` (DoorDash, Clover, Toast… are JavaScript apps we can't read);
  - `fetch_failed`, `extraction_failed`;
  - `unknown` (not fetched).
  Image-only PDFs are listed per page as "not read".
- **Highlights:** `menu.highlights` picks out vegan items, steak, fries and desserts from the verified items.

Full run (2026-10-24, all 130 catalog venues, Places lookups and Web Unlocker):
- **Menus** are fetched for the 85 meal and dessert venues; activities are skipped.
  - 51 menus extracted: 950 items, 554 of them with a price.
  - 8 menus are only in ordering apps, 20 venues had no menu we could find, and 6 have no website on their listing.
  - Highlights: vegan items at 14 venues, steak at 8, fries at 9, desserts at 19.
- **Takeout:** 94 yes, 5 no, 31 unknown.
- **Dine-in:** 89 yes, 1 no, 40 unknown.
- **Outdoor seating:** 62 yes, 26 no, 42 unknown.
- **Photos:** every venue has at least one photo with author attribution.
- **Dietary coverage:** 19 venues have explicit menu evidence, 48 have only inferred tags, and 63 are unknown.

```bash
api/.venv/bin/python -m pip install -r data/reviews/requirements.txt   # anthropic, pypdf
api/.venv/bin/python data/reviews/collect.py details --limit 20          # Places + menus via Web Unlocker
api/.venv/bin/python data/reviews/collect.py details --only p_006 --fetch direct --no-places
```

## Outputs

- `data/raw/brightdata_<source>_<kind>_<time>.json` (gitignored): every raw response, along with what was asked.
- `data/brightdata/places.json`: one row per place:
  - top level: `bdId`, `group`, `category`, `name`, `lat`, `lng`, `address`, `phone`, `distance_mi` (from downtown Berkeley, for every area), `area` (`berkeley`, `oakland`, `sf` or null), `huddleId` (the matching `p_###` in the catalog, or null), `first_seen_at`, `found_by`;
  - `google`: rating, reviews_count, review_distribution, categories, open_hours, services, 5 top reviews (reviewer identity removed), …;
  - `yelp`: rating, reviews_count, price (`$`–`$$$$`), categories, hours, ….
  - Google and Yelp records are joined when the names match and they're within 75 m, or when the phone numbers match.
- `data/brightdata/snapshots.json`: append-only `{source, key, fetched_at, source_url, rating, reviews_count, review_distribution, closed flags, is_claimed, hours}`. Momentum (reviews gained per week) and closures come from comparing rows.
- `data/brightdata/catalog.json`: the last snapshot `publish` built (the exact body sent to `POST /catalog`).
- `data/places.json`: changed **only by `merge`**, which first backs up the original to `data/places.v1.json`.
  - Existing places keep their ids, aspects, cost, rating and review count. They gain an empty `priceLevel` from Yelp when Yelp has one, `dietary` tags that Google services or Yelp categories state, and `"brightdata"` in `sources`.
  - `--add` appends the most-reviewed new places inside Berkeley that have readable hours and a rating, with stable ids `bd_` + 10 hex characters derived from their Google Maps or Yelp key. A new restaurant also needs a Google Places price level, which sets its cost; one without a price is skipped. New places get the default aspects, like the bundled ones.
  - Neither `merge` nor `publish` has been run without `--dry-run`, so `data/places.json` still has the original 45 places.
- `data/brightdata/google_places.json`: the Google Places lookups (price level, takeout, dine-in, delivery, outdoor seating, `servesVegetarianFood`, `servesDessert`, photos), keyed by place id, with `fetchedAt`.
- `data/brightdata/menus.json`: fetched menu pages and verified items per venue.
- `data/brightdata/details.json`: one venue-details record per catalog venue (see above).
  - Every row stays within the `Place` contract (`extra="forbid"`).

## Traps handled

- **Price:** Google Maps has no price level (0 of 1,009 records), and Yelp returned nothing. New restaurants take their price level and meal cost from Google Places, and a new restaurant without one isn't added. In the full run, 94 candidates had a price and 38 didn't. A Yelp `$$` would fill an existing place's empty `priceLevel`.
- **Locale links:** links carry random foreign locales (`hl=en-LK`). Every URL is cut at `?`, and rows are keyed on `place_id` / Yelp biz id, never on a URL.
- **Categories:** Google's `category` is often just "Restaurant", so grouping uses `all_categories`.
- **Hours:** taken from `open_hours`, never from `business_details`, which is relative to scrape time. Past-midnight closes end at 23:59, as in `fetch_places.py`. Split shifts arrive as two lines in one day (`"11 AM–2:30 PM\n5–9 PM"`) and become two ranges.
- **Closures:** `permanently_closed` places are dropped, and `temporarily_closed` places are never added.
- **Errors:** error records (`include_errors=true`) are counted and skipped, never stored as zeros.

## Not measured yet

The cost of our run (check the account's billing page). Whether Google Maps accepts `place_id` input. Whether Yelp's `url` discovery works, and the value formats inside its fields: `probe` confirmed the field names (`yelp_biz_id`, `full_address`, `latitude`, `longitude`, `price_range`, `opening_hours`, `overall_rating`, `reviews_count`, `categories`, `is_closed`, …) but not their shapes. Pricing at pay-as-you-go is $1.5 / 1K records for Yelp per brightdata.com, with a 5K/month free tier. Check the account plan.

## Disclosure

Public, logged-out listing data only, used for a hackathon prototype. Reviewer names, profile links and photos are removed before anything leaves `data/raw/`. Every stored number keeps its `source_url` and `fetched_at`. The API key stays server-side and out of the repo.

Venue details add two more sources:
- **Google Places API (New):** listing attributes and photos. Google's terms limit how long Places content other than place ids may be cached, and require showing each photo's author attribution with the photo. The committed `google_places.json` and `details.json` keep `fetchedAt` so stale entries can be refreshed (`details --refresh`). Photo URLs from Google may stop working after a while.
- **Claude:** reads the text of venue websites to list menu items. Code keeps an item only if its quote appears verbatim on the page.
