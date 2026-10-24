# Bright Data: how we collect Berkeley places

Code: [`data/reviews/`](../data/reviews/). Source note for the Google Maps route: [`brightdata_googlemaps.md`](../brightdata_googlemaps.md) (measured 2026-10-24 for another project).

**Status (2026-10-24):** Google Maps discovery has run once for real: 1 point × `restaurants` returned 20 places (0 errors) in 137 s, 0.01–1.20 mi from downtown, and 5 of them were already in the catalog. Yelp discovery returned nothing on two input types (see the Yelp row below), so the full run is Google Maps only. Nothing has been published to SpacetimeDB.

## What it collects

Restaurants, boba shops and places to hang out in Berkeley, from **Google Maps and Yelp**, joined into one row per place:

| Group | Keywords (one search each) | Huddle category |
|---|---|---|
| restaurant | restaurants, thai, chinese, japanese, korean, indian, vietnamese, mexican, pizza, italian, mediterranean, burgers, sandwiches, brunch, vegetarian | meal |
| boba | boba, bubble tea, tea house | dessert (`cafe_dessert`) |
| hangout | bars, cafes, arcade, bowling, karaoke, board game cafe, escape room, museum, live music, comedy club, movie theater, parks | activity (cafes: dessert) |

A place's group comes from its own categories, not from the keyword that found it. Searching "restaurants" also returns cafes. Areas outside Berkeley are kept in the output but never merged into the catalog. The Berkeley area is the `BERKELEY` rectangle in `data/fetch_places.py`.

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
python3 data/reviews/collect.py discover --yes                              # full: both sources, all groups
python3 data/reviews/collect.py refresh                                     # fresh numbers, one batch per source
python3 data/reviews/collect.py build                                       # rebuild outputs from data/raw/, no API calls
python3 data/reviews/collect.py publish --add meal=10,dessert=5,activity=5 --dry-run  # writes catalog.json only
python3 data/reviews/collect.py publish --add meal=10,dessert=5,activity=5            # live in SpacetimeDB
python3 data/reviews/collect.py merge --add meal=10,dessert=5,activity=5 --dry-run    # bundled fallback file
python3 -m unittest data/reviews/test_collect.py                            # offline tests
```

- `discover` stops without `--yes` when it could return more than 2,000 records. The full run is about 360 Google inputs × 20 plus 30 Yelp inputs × 100, so up to about 10K records before dedup. Narrow it with `--groups`, `--keywords` or `--one-point`.
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

Sample run (2026-10-24, `--fetch direct --no-places`, 5 venues):
- 4 menus extracted: The Butcher's Son, Nation's, Super Duper, Wood Tavern (lunch PDF; its dinner and dessert PDFs are image-only).
- Little Gem's menu is only on DoorDash.
- Takeout and dine-in are unknown until a Places key is set.

```bash
api/.venv/bin/python -m pip install -r data/reviews/requirements.txt   # anthropic, pypdf
api/.venv/bin/python data/reviews/collect.py details --limit 20          # Places + menus via Web Unlocker
api/.venv/bin/python data/reviews/collect.py details --only p_006 --fetch direct --no-places
```

## Outputs

- `data/raw/brightdata_<source>_<kind>_<time>.json` (gitignored): every raw response, along with what was asked.
- `data/brightdata/places.json`: one row per place:
  - top level: `bdId`, `group`, `category`, `name`, `lat`, `lng`, `address`, `phone`, `distance_mi` (from downtown), `huddleId` (the matching `p_###` in the catalog, or null), `first_seen_at`, `found_by`;
  - `google`: rating, reviews_count, review_distribution, categories, open_hours, services, 5 top reviews (reviewer identity removed), …;
  - `yelp`: rating, reviews_count, price (`$`–`$$$$`), categories, hours, ….
  - Google and Yelp records are joined when the names match and they're within 75 m, or when the phone numbers match.
- `data/brightdata/snapshots.json`: append-only `{source, key, fetched_at, source_url, rating, reviews_count, review_distribution, closed flags, is_claimed, hours}`. Momentum (reviews gained per week) and closures come from comparing rows.
- `data/brightdata/catalog.json`: the last snapshot `publish` built (the exact body sent to `POST /catalog`).
- `data/places.json`: changed **only by `merge`**, which first backs up the original to `data/places.v1.json`.
  - Existing places keep their ids, aspects, cost, rating and review count. They gain an empty `priceLevel` from Yelp, `dietary` tags that Google services or Yelp categories state, and `"brightdata"` in `sources`.
  - `--add` appends the most-reviewed new places inside Berkeley that have readable hours and a rating, with stable ids `bd_` + 10 hex characters derived from their Google Maps or Yelp key.
  - Every row stays within the `Place` contract (`extra="forbid"`).

## Traps handled

- **Price:** Google Maps has no price level. Yelp's `$$` fills `priceLevel` and meal cost. With no price, a meal costs the catalog default, 25.
- **Locale links:** links carry random foreign locales (`hl=en-LK`). Every URL is cut at `?`, and rows are keyed on `place_id` / Yelp biz id, never on a URL.
- **Categories:** Google's `category` is often just "Restaurant", so grouping uses `all_categories`.
- **Hours:** taken from `open_hours`, never from `business_details`, which is relative to scrape time. Past-midnight closes end at 23:59, as in `fetch_places.py`. Split shifts arrive as two lines in one day (`"11 AM–2:30 PM\n5–9 PM"`) and become two ranges.
- **Closures:** `permanently_closed` places are dropped, and `temporarily_closed` places are never added.
- **Errors:** error records (`include_errors=true`) are counted and skipped, never stored as zeros.

## Not measured yet

The cost of our run (check the account's billing page). Whether Google Maps accepts `place_id` input. Whether Yelp's `url` discovery works, and the value formats inside its fields: `probe` confirmed the field names (`yelp_biz_id`, `full_address`, `latitude`, `longitude`, `price_range`, `opening_hours`, `overall_rating`, `reviews_count`, `categories`, `is_closed`, …) but not their shapes. How many places the full grid returns. Pricing at pay-as-you-go is $1.5 / 1K records for Yelp per brightdata.com, with a 5K/month free tier. Check the account plan.

## Disclosure

Public, logged-out listing data only, used for a hackathon prototype. Reviewer names, profile links and photos are removed before anything leaves `data/raw/`. Every stored number keeps its `source_url` and `fetched_at`. The API key stays server-side and out of the repo.
