"""Join Eric Wu's committed details sidecar without modifying the scraper.

This produces a whole /catalog payload. Publication is an explicit operation in
scripts/publish-menu-catalog.py; planning itself stays database-independent.
"""
import hashlib
import json
from datetime import datetime
from urllib.parse import urlsplit

from .agent_models import AgentCatalog


def web_url(value):
    if not isinstance(value, str) or len(value) > 2000:
        return None
    parsed = urlsplit(value)
    return value if parsed.scheme in ("http", "https") and parsed.hostname and not parsed.username and not parsed.password else None


def timestamp(value):
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        return value
    except (AttributeError, ValueError):
        return None


def enrich_catalog(snapshot, details):
    body = json.loads(json.dumps(snapshot))
    records = {row["id"]: row for row in details}
    for venue in body["venues"]:
        place, evidence = venue["place"], venue.setdefault("evidence", {"sources": []})
        detail = records.get(place["id"], {})
        menu = detail.get("menu") or {}
        items = []
        for row in menu.get("items", [])[:85]:
            url = web_url(row.get("sourceUrl"))
            fetched = timestamp(row.get("fetchedAt"))
            if not url or len(url) > 1000 or not fetched or not row.get("name"):
                continue
            item = {"name": str(row["name"])[:300], "section": str(row.get("section") or "")[:200],
                    "description": str(row.get("description") or "")[:2000],
                    "labels": [str(label)[:80] for label in row.get("labels", [])[:15]],
                    "price": row.get("price"), "sourceUrl": url, "fetchedAt": fetched}
            digest = hashlib.sha256(json.dumps([place["id"], item], sort_keys=True).encode()).hexdigest()[:20]
            item["id"] = "menu_" + digest
            if not any(existing["id"] == item["id"] for existing in items):
                items.append(item)
        evidence["menu"] = {"status": str(menu.get("status") or "unknown")[:80], "items": items}
        # Preserve the broad legacy cuisine family/13-feature contract; display
        # the source listing's specific pizza identity instead of Mediterranean.
        if "pizza" in place["name"].casefold() or "pizzeria" in place["name"].casefold():
            evidence["foodStyle"] = "Pizza"
        photos = []
        for photo in detail.get("photos", []):
            url, source = web_url(photo.get("url")), web_url(photo.get("sourceUrl"))
            if not url or not source:
                continue
            attribution = ", ".join(str(author.get("name", "")) for author in (photo.get("attribution") or []) if isinstance(author, dict))
            photos.append({"url": url, "sourceUrl": source, "attribution": (attribution or str(photo.get("attributionNote") or photo.get("source") or ""))[:1000]})
            if len(photos) == 3:
                break
        evidence["photos"] = photos
    digest = hashlib.sha256(json.dumps(body["venues"], sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:12]
    body["version"] = snapshot["version"][:70] + "-menu-" + digest
    AgentCatalog.model_validate({"version": body["version"], "places": [v["place"] for v in body["venues"]],
                                 "evidence": {v["place"]["id"]: v["evidence"] for v in body["venues"]}})
    return body
