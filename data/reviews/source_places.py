"""Venue facts from the Google Places API (New), by place ID: price level, takeout, dine-in,
outdoor seating, listed dietary attributes and photos with their authors' attribution.

Google Maps records from Bright Data carry no price (0 of 1,009 on 2026-10-24), no takeout or
seating flags (services_provided is accessibility only) and no photo authors, and Yelp
discovery returned nothing. One Place Details call per venue fills these, cached in
data/brightdata/google_places.json so a venue is paid for once. A field Google leaves out is
stored as null (unknown), never false. Standard library only.

Google's terms limit caching Places content (other than place IDs) and require showing photo
author attributions with the photo; fetchedAt is kept so stale entries can be refreshed.
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.parse
import urllib.request

from brightdata import env_value, now_iso

ENDPOINT = "https://places.googleapis.com/v1/"
FIELDS = ["priceLevel", "takeout", "dineIn", "delivery", "outdoorSeating", "servesVegetarianFood",
          "servesDessert", "googleMapsUri", "photos"]


def load_key() -> str:
    key = env_value("GOOGLE_PLACES_API_KEY")
    if not key:
        sys.exit("GOOGLE_PLACES_API_KEY is not set (shell, repo-root .env or api/.env)")
    return key


def _get(key: str, path: str, mask: str | None = None):
    headers = {"X-Goog-Api-Key": key}
    if mask:
        headers["X-Goog-FieldMask"] = mask
    req = urllib.request.Request(ENDPOINT + path, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            return 200, json.load(res)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="replace")[:300]
    except urllib.error.URLError as e:
        return 0, str(e.reason)
    except (TimeoutError, ConnectionError) as e:
        return 0, f"{type(e).__name__}: {e}"


def photo(key: str, p: dict, maps_uri: str | None, fetched_at: str) -> dict | None:
    """A displayable URL for one photo (skipHttpRedirect returns it without exposing the key)."""
    status, data = _get(key, f"{p['name']}/media?maxWidthPx=1200&skipHttpRedirect=true")
    if status != 200 or not isinstance(data, dict) or not data.get("photoUri"):
        return None
    return {"url": data["photoUri"], "width": p.get("widthPx"), "height": p.get("heightPx"),
            "source": "google_places", "sourceUrl": maps_uri, "fetchedAt": fetched_at,
            "attribution": [{"name": a.get("displayName"), "uri": a.get("uri")}
                            for a in p.get("authorAttributions") or []] or None}


def lookup(key: str, place_id: str, photos: int = 2) -> dict:
    """Everything FIELDS covers for one place; {"error": ...} when the call itself fails."""
    status, data = _get(key, "places/" + urllib.parse.quote(place_id), ",".join(FIELDS))
    if status in (400, 401, 403):  # bad key or API not enabled: stop instead of caching errors
        sys.exit(f"Places API error {status}: {data}")
    if status != 200 or not isinstance(data, dict):
        return {"error": f"HTTP {status}", "fetchedAt": now_iso()}
    fetched_at = now_iso()
    level = data.get("priceLevel")
    maps_uri = data.get("googleMapsUri")
    return {
        "fetchedAt": fetched_at, "googleMapsUri": maps_uri,
        "priceLevel": level if level and level != "PRICE_LEVEL_UNSPECIFIED" else None,
        **{f: data.get(f) for f in ["takeout", "dineIn", "delivery", "outdoorSeating",
                                    "servesVegetarianFood", "servesDessert"]},  # absent -> None (unknown)
        "photos": [x for x in (photo(key, p, maps_uri, fetched_at) for p in (data.get("photos") or [])[:photos]) if x],
    }
