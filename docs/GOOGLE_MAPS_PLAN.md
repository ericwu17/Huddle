# Option labels and Google Maps plan

October 24, 2026. Keep the local FastAPI/tunnel, shared Maincloud state and Vercel
frontend. This work adds comparison UI and map opening; it does not replace
Claude's planning or change budget, allergy, voting or booking contracts.

## Shipped first step

On each option and on Done/shared results, **Click here to see the map!** is blue
and underlined. It opens Google Maps in a separate tab, preserving the current
Huddle page and votes. One venue opens its place search; 2–5 stops open walking
directions in the itinerary's order, including intermediate stops. The URL
contains only public venue coordinates/addresses, with no private orders,
budgets, preferences, account IDs or participant starting locations.

Google's universal [Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)
open the installed Maps app or its website and require no API key. Five Huddle
stops use three intermediate waypoints, within the documented mobile-browser
limit. Empty, invalid, overlong or unsupported routes do not produce a link;
stops are never silently dropped. Some Google Maps products ignore waypoints,
so the existing Huddle stop list remains the itinerary reference.

The existing embedded OpenStreetMap/Mapbox map and walking-geometry adapter stay
available under Map & details. Opening Google Maps does not fetch its route data
back into Huddle, prove live availability, change the outing time or reserve
anything. Calendar OAuth needs no change for this first step.

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

## Follow-up: real Google route estimates

1. **Max + Eric Wu: choose the next demo need.** If opening Google Maps is enough,
   stop at the shipped first step. Add paid API work only to improve Huddle's own
   travel estimates, transport choices or map geometry.
2. **Project owner: configure Google Cloud.** Enable billing and Routes API,
   create an API-restricted server key, and set quotas/budget alerts before the
   first paid request. Save `GOOGLE_MAPS_API_KEY` privately in `api/.env` on the
   designated API host. No key belongs in Git, Maincloud public tables or URLs.
   Google documents the [Routes API setup](https://developers.google.com/maps/documentation/routes/get-api-key).
3. **Max: add a provider adapter in FastAPI.** Use `computeRoutes` for each
   candidate itinerary and `computeRouteMatrix` only when comparing multiple
   consenting starting points. Use bounded request/response models, a narrow
   field mask for duration/distance/geometry, timeouts and explicit provider
   failure handling. Keep Claude responsible for suggestions; Python validates
   the chosen travel mode/time against the participant's actual limits.
   See [Compute Routes](https://developers.google.com/maps/documentation/routes/compute-route-over)
   and [Route Matrix](https://developers.google.com/maps/documentation/routes/compute_route_matrix).
4. **Max + Eric Chen: agree the additive response contract first.** Proposed
   per-leg fields: `fromPlaceId`, `toPlaceId`, `travelMode`, `durationSeconds`,
   `distanceMeters`, `provider`, `fetchedAt`, `status`; geometry stays separate.
   Keep existing `travelMinutes` compatible until callers migrate. Old or
   failed responses must not look like newly verified Google routes.
5. **Eric Chen: decide whether an embedded Google map is needed.** Load it only
   when expanded. A browser Maps JavaScript key would be separate and restricted
   to the deployed domains/APIs. Confirm Google's display/attribution and storage
   requirements before drawing or retaining provider results; do not assume
   Google route data can replace the current OpenStreetMap layer unchanged.
   See [Routes policies](https://developers.google.com/maps/documentation/routes/policies).
6. **Team: run an acceptance pass.** Exercise one/two/five-stop routes, exact
   venue pins, return to an unchanged vote, Done/shared results, phone Maps-app
   handoff, denied location, provider timeout/quota failures, timezone/opening
   hours and stale-plan rejection. No new calendar event or invitation message
   should be sent by a map action.

## Follow-up: Most daring / Best fit

These labels need the coordinator's interpretation of the participants' current
soft wishes and, if explicitly saved, past-outing context. Add a bounded optional
agent label plus a grounded reason through an agreed API/module contract. Do not
recover it from placeholder novelty features or equate an unfamiliar cuisine
with adventurousness. Known hard restrictions and each person's cap still apply.

Acceptance: a user asking for a familiar burger and another asking to try
something new receive useful alternatives and a clear explanation; the label
must follow context changes rather than stick to Option 1/2/3.
