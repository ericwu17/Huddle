# Google Maps restaurants: route and how to build it in

Card 08 finds competitors on Yelp. This note adds Google Maps as a second source: the Bright Data Google Maps scraper, measured once on 2026-10-24 for restaurants around downtown Berkeley. It is a new route, not yet run as often as the card's Yelp route. Treat the timings as one run, not a range.

[`google_maps_sample.json`](google_maps_sample.json) has 3 trimmed real records from that run (reviewer data removed), the request, and the full list of raw field names.

## The route (measured 2026-10-24)

| Step | Call | Measured |
|---|---|---|
| 1. Find places around a point | Web Scraper API, Google Maps full information scraper `gd_m8ebnr0q2qlklc02fz`. `POST /datasets/v3/trigger?dataset_id=gd_m8ebnr0q2qlklc02fz&type=discover_new&discover_by=location&limit_per_input=20&format=json&include_errors=true` with `{"input": [{"country": "US", "lat": 37.8716, "long": -122.2727, "zoom_level": 15, "keyword": "restaurants"}]}`. Poll `/datasets/v3/progress/<id>`, download `/datasets/v3/snapshot/<id>`. | 20 records, 0 errors, 258.9 s from trigger to download. All 20 were restaurants 0.18 to 1.20 mi from the point. |
| 2. Refresh known places | Same scraper, `collect_by_url`, sync: `POST /datasets/v3/scrape?dataset_id=gd_m8ebnr0q2qlklc02fz&format=json&include_errors=true` with `{"input": [{"url": "<record.url>"}, ...]}`. Use the `url` saved from step 1. | 3 URLs: HTTP 200 in 44.3 s, same `place_id`s, 0 fields changed (24 min after step 1). |

The Web Scraper API needs no zone. It worked on an account without KYC verification, which Bright Data's Web Unlocker needs for some sites (it refuses reddit.com without it, see `radar/REFERENCE.md`). Google Maps through Web Unlocker was not tried.

The other input methods are `discover_by_place_id` and `discover_by_cid`. Sister scrapers: `gd_luzfs1dn2oa0teb81` (Google Maps reviews, by URL) and `gd_min8y25y1z5op1eska` (images). None of these were run.

## Fields you get

Filled on 20 of 20 records:
- **Who and where:** `place_id`, `cid`, `url`, `name`, `category`, `all_categories`, `category_index.gcid`, `address`, `lat`, `lon`, `phone_number`.
- **The numbers:** `rating` (one decimal), `reviews_count` (exact), `review_distribution` (count per star; it summed to `reviews_count` on 20 of 20).
- **State:** `open_hours` (one string per weekday, e.g. `"11 AM–12 AM"`), `is_claimed`, `permanently_closed`, `temporarily_closed`.
- **Other:** `services_provided`, `top_reviews` (5) and `reviews_snippets`.

Sometimes filled: `open_website` 18 of 20, `reservation_link` 14, `description` 12, `photos_and_videos` 5.

Never filled in this run: `popular_times`, `people_also_search`, `web_results`, `questions_answers`, `directory_categories`, `directory_locations`.

## Traps

- **No price level.** None of the 20 records had a `$` field or a `$` anywhere in `business_details`. Yelp has `priceRange.display` (card 08). If price matters, merge the two sources.
- **Drop the reviewer fields.** `top_reviews[]` and `reviews_snippets[]` carry `reviewer_name` (a Google contributor profile URL) and `reviewer_image_url`. The app needs neither. Strip them before storing, as the radar does with Reddit authors.
- **`business_details` text is relative to scrape time.** Its hours entry reads `"Opens soon · 11 AM"`. Use `open_hours` for hours, and `temporarily_closed` / `permanently_closed` for closures.
- **Links carry a random foreign locale.** `reservation_link` came back with `hl=en-LK`, `en-BR`, `en-ZA`, `en-RO` and others (10 locales across 14 links). The scraper runs from proxies in many countries. Cut links at `?` before showing them, and key on `place_id`, never on a URL.
- **`category` is often just "Restaurant".** 6 of 20 had that generic value. Filter and group on `all_categories` or `category_index.gcid` (`gcid:american_restaurant`).
- **Trim `services_provided`.** Some entries start with a space (`" Does not have assistive hearing loop"`).
- **The keyword is a Google relevance search.** `restaurants` also returned a cafe and a sandwich shop (both list "Restaurant" in `all_categories`). For one cuisine, check `all_categories` before you count a place as a competitor. Yelp's `find_desc` has the same problem (card 08).
- **Discovery is slow; never run it on a click.** 4.3 min for 20 places. Run it as a background job and serve stored results.

Not measured yet:
- how many places one point returns above 20 (`limit_per_input` was 20);
- how far `zoom_level` 15 reaches beyond the 1.2 mi seen;
- whether the same input returns the same 20 places on another day;
- the cost per record (check your Bright Data plan).

## How to build it into a larger project

### The shape: discover rarely, refresh often, store every snapshot

```
          weekly or on demand                       daily or weekly
   ┌──────────────────────────────┐        ┌───────────────────────────────┐
   │ discover job                 │        │ refresh job                   │
   │ discover_by_location         │        │ collect_by_url, one batch      │
   │ (lat, long, keyword) × tiles │        │ with every known place url     │
   └──────────────┬───────────────┘        └──────────────┬────────────────┘
                  │ new place_ids                          │ fresh numbers
                  ▼                                        ▼
        places.json  (one row per place_id)    snapshots.json  (append, with fetched_at)
                  └────────────────┬───────────────────────┘
                                   ▼
                    diff the last two snapshots per place_id
                    → UI / digest / alerts read from storage only
```

- **`places`** is the slow-changing identity of each place: `place_id` (the key), `name`, `address`, `lat`, `lon`, `all_categories`, `url`, `first_seen_at`, and which tile and keyword found it.
- **`snapshots`** holds the numbers that move: `place_id`, `fetched_at`, `rating`, `reviews_count`, `review_distribution`, `temporarily_closed`, `permanently_closed`, `is_claimed`, `open_hours`. Append a row on every run; never overwrite one. The trends come from comparing rows.
- Use both scraper methods. Discovery finds places and is slow. `collect_by_url` refreshes places you already know: 44 s for 3, sync. Send every known URL in one job, not one job per place (AGENTS.md, call 3). Sync calls that run past about a minute return 202 and a `snapshot_id`; poll it as in async.

### Code: the two calls

The same helpers as `radar/radar.mjs` (`api`, `sleep`), Node 20+, no dependencies:

```js
const GMAPS = 'gd_m8ebnr0q2qlklc02fz';

// Step 1: places around one point. ~4–5 min: run it as a job.
export async function discoverPlaces({ lat, long, keyword, zoom = 15, limit = 20 }) {
  const q = `dataset_id=${GMAPS}&type=discover_new&discover_by=location&limit_per_input=${limit}&format=json&include_errors=true`;
  const trig = await api(`/datasets/v3/trigger?${q}`, { method: 'POST', body: { input: [{ country: 'US', lat, long, zoom_level: zoom, keyword }] } });
  const sid = JSON.parse(trig.text).snapshot_id;
  return waitForSnapshot(sid); // poll /progress every 10 s, then download /snapshot (retry on 202)
}

// Step 2: fresh numbers for places you already have.
export async function refreshPlaces(urls) {
  const r = await api(`/datasets/v3/scrape?dataset_id=${GMAPS}&format=json&include_errors=true`,
    { method: 'POST', body: { input: urls.map((url) => ({ url })) }, timeoutMs: 300000 });
  if (r.status === 202) return waitForSnapshot(JSON.parse(r.text).snapshot_id);
  return JSON.parse(r.text);
}

// Keep what the app uses; drop reviewer data; record errors instead of zeros.
export function toSnapshot(rec, fetched_at) {
  if (rec.error || rec.error_code) return { url: rec.input?.url, error: rec.error_code || rec.error, fetched_at };
  return {
    place_id: rec.place_id, fetched_at, source_url: rec.url.split('?')[0],
    rating: rec.rating, reviews_count: rec.reviews_count, review_distribution: rec.review_distribution,
    temporarily_closed: rec.temporarily_closed, permanently_closed: rec.permanently_closed,
    is_claimed: rec.is_claimed, open_hours: rec.open_hours,
  };
}
```

### Covering an area larger than one point

One input returned places within about 1.2 mi. For a whole city, lay a grid of points about 1 mi apart. Send them all as inputs in one trigger, one per point and keyword. Merge the results by `place_id`, and keep the haversine distance from the user's address (card 08's `yelp_competitors.mjs` exports `haversineMi(lat1, lng1, lat2, lng2)`). For cuisines, run one keyword per cuisine (`ramen`, `thai`) in the same trigger and check `all_categories` on every result. This grid is not measured: test one tile per new area first.

### What to compute from the snapshots

- **Momentum:** reviews gained since the last snapshot, and per week. This is the best "who is hot" signal. Ratings barely move at one decimal.
- **Rating drift that the one-decimal rating hides:** compute the mean from `review_distribution` (Σ stars × count / total), and watch the 1-star share week to week.
- **New and gone:** a `place_id` in this discovery run but not the last one is new (confirm with a low `reviews_count`). `temporarily_closed` or `permanently_closed` turning true is a closure.
- **Hours gaps:** parse `open_hours` per weekday and show when nobody nearby is open.
- **Unclaimed listings:** `is_claimed: false` marks owners who have not set up their Google profile. That makes them a sales lead for a service that helps restaurants online.

### Where it plugs into this repo

- **Card 08 (block watch):** add Google as a second competitor source. Match a Yelp and a Google record when the names match and the coordinates are within about 50 m. Show Yelp's price and Google's star distribution, hours and claimed flag side by side. Google is also the faster refresh: one batch job, where Yelp needs one Web Unlocker page per business. Run the scan job as card 08 step 3 describes, and append Google rows to `data/scans.json` with their own `source: "google_maps"`.
- **Card 09 (small business lender):** review momentum and closures over time are signals of a restaurant's health. `snapshots` is that time series.
- **The radar (`radar/`):** a "local" source would follow REFERENCE.md, Make it yours: a `fetchGoogleMaps()` that calls `refreshPlaces`, an entry in `SOURCES`, and a column on the page.

### Rules that still apply

- The key stays on the server (AGENTS.md, Secrets). Bind the app to `127.0.0.1`.
- Keep `source_url` and `fetched_at` next to every number you show.
- While you develop, cache raw responses in `cache/` and reuse them: discovery is 4 minutes and billed per record.
- Public, logged-out data only.
