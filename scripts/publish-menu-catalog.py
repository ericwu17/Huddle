#!/usr/bin/env python3
"""Validate/join catalog + details. Dry-run unless --publish is supplied."""
import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from api.menu_catalog import enrich_catalog


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, default=ROOT / "data/catalog/cities.json")
    parser.add_argument("--details", type=Path, default=ROOT / "data/brightdata/details.json")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--server", default="https://maincloud.spacetimedb.com")
    parser.add_argument("--database")
    args = parser.parse_args()
    body = enrich_catalog(json.loads(args.catalog.read_text()), json.loads(args.details.read_text()))
    if args.output:
        args.output.write_text(json.dumps(body, separators=(",", ":")))
    count = sum(len(v["evidence"]["menu"]["items"]) for v in body["venues"])
    print(json.dumps({"version": body["version"], "venues": len(body["venues"]), "menuItems": count,
                      "photos": sum(len(v["evidence"]["photos"]) for v in body["venues"]), "published": False}))
    if args.publish:
        if not args.database:
            parser.error("--database is required for publication")
        import os
        import httpx
        from dotenv import dotenv_values
        secret = os.getenv("HUDDLE_SHARED_SECRET") or dotenv_values(ROOT / "api/.env", interpolate=False).get("HUDDLE_SHARED_SECRET")
        if not secret:
            parser.error("HUDDLE_SHARED_SECRET is required; keep it in ignored api/.env")
        response = httpx.post(f"{args.server.rstrip('/')}/v1/database/{args.database}/route/catalog", json=body,
                              headers={"X-Huddle-Secret": secret}, timeout=45)
        response.raise_for_status()
        print(json.dumps({"published": True, "database": args.database, "result": response.json()}))


if __name__ == "__main__":
    main()
