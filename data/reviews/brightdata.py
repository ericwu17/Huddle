"""Bright Data Web Scraper API client shared by the source_*.py adapters. See docs/BRIGHTDATA.md.

Only the Web Scraper API (/datasets/v3) is used: it needs an API key but no zone and no KYC.
Every job sends all of its inputs in one request (never one job per place), and every raw
response is saved to data/raw/ (gitignored) so `collect.py build` can rebuild without paying.
Standard library only.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
API = "https://api.brightdata.com"
SYNC_MAX_INPUTS = 20  # /scrape takes up to 20 inputs; more goes through /trigger


class BrightDataError(RuntimeError):
    pass


def env_value(name: str, files=(ROOT / ".env", ROOT / "api" / ".env")) -> str | None:
    """The shell first, then the first .env file that sets it (api/.env holds the SpacetimeDB values)."""
    if os.environ.get(name):
        return os.environ[name]
    for env in files:
        if env.exists():
            for line in env.read_text(encoding="utf-8").splitlines():
                m = re.match(rf"\s*{re.escape(name)}\s*=\s*(.*)\s*$", line)
                if m and m.group(1).strip().strip('"').strip("'"):
                    return m.group(1).strip().strip('"').strip("'")
    return None


def load_key() -> str:
    key = env_value("BRIGHTDATA_API_KEY", files=(ROOT / ".env",))
    if not key:
        sys.exit("BRIGHTDATA_API_KEY is not set (environment or repo-root .env)")
    return key


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class Client:
    def __init__(self, key: str, log=print):
        self.key = key
        self.log = log

    def api(self, path: str, body=None, method: str | None = None, timeout: int = 120):
        """Returns (status, parsed JSON or text). HTTP errors come back as a status, not an exception."""
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(API + path, data=data, method=method or ("POST" if data else "GET"),
                                     headers={"Authorization": f"Bearer {self.key}",
                                              "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as res:
                status, text = res.status, res.read().decode()
        except urllib.error.HTTPError as e:
            status, text = e.code, e.read().decode(errors="replace")
        except urllib.error.URLError as e:
            raise BrightDataError(f"{path}: {e.reason}") from e
        except (TimeoutError, ConnectionError) as e:  # a read can time out after the connection opened
            raise BrightDataError(f"{path}: {type(e).__name__}: {e}") from e
        try:
            return status, json.loads(text)
        except json.JSONDecodeError:
            return status, text

    @staticmethod
    def query(dataset_id: str, **params) -> str:
        params = {"dataset_id": dataset_id, "format": "json", "include_errors": "true", **params}
        return urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})

    def trigger(self, dataset_id: str, inputs: list[dict], **params) -> str:
        status, data = self.api(f"/datasets/v3/trigger?{self.query(dataset_id, **params)}", {"input": inputs})
        if status != 200 or not isinstance(data, dict) or "snapshot_id" not in data:
            raise BrightDataError(f"trigger {dataset_id} failed: HTTP {status} {str(data)[:500]}")
        self.log(f"  triggered {dataset_id} with {len(inputs)} inputs: snapshot {data['snapshot_id']}")
        return data["snapshot_id"]

    def wait(self, snapshot_id: str, timeout_s: int = 1200, every: int = 10) -> list[dict]:
        """Poll /progress until ready, then download the snapshot (it can still answer 202)."""
        start = time.time()
        while True:
            status, data = self.api(f"/datasets/v3/progress/{snapshot_id}")
            state = data.get("status") if isinstance(data, dict) else None
            if state == "ready":
                break
            if state == "failed":
                raise BrightDataError(f"snapshot {snapshot_id} failed: {data}")
            if time.time() - start > timeout_s:
                raise BrightDataError(f"snapshot {snapshot_id} not ready after {timeout_s}s (last: {state})")
            self.log(f"  {snapshot_id}: {state or status} ({time.time() - start:.0f}s)")
            time.sleep(every)
        while True:
            status, data = self.api(f"/datasets/v3/snapshot/{snapshot_id}?format=json", timeout=300)
            if status == 200 and isinstance(data, list):
                self.log(f"  {snapshot_id}: {len(data)} records in {time.time() - start:.0f}s")
                return data
            if status != 202 or time.time() - start > timeout_s:
                raise BrightDataError(f"download {snapshot_id} failed: HTTP {status} {str(data)[:500]}")
            time.sleep(every)

    def collect(self, dataset_id: str, inputs: list[dict], **params) -> list[dict]:
        """Small batches go through the sync /scrape call; a 202 or a big batch falls back to polling."""
        if len(inputs) > SYNC_MAX_INPUTS:
            return self.wait(self.trigger(dataset_id, inputs, **params))
        status, data = self.api(f"/datasets/v3/scrape?{self.query(dataset_id, **params)}",
                                {"input": inputs}, timeout=300)
        if status == 200 and isinstance(data, list):
            return data
        if status == 202 and isinstance(data, dict) and "snapshot_id" in data:
            return self.wait(data["snapshot_id"])
        raise BrightDataError(f"scrape {dataset_id} failed: HTTP {status} {str(data)[:500]}")

    def datasets(self) -> list[dict]:
        status, data = self.api("/datasets/list")
        if status != 200 or not isinstance(data, list):
            raise BrightDataError(f"/datasets/list failed: HTTP {status} {str(data)[:500]}")
        return data

    def metadata(self, dataset_id: str):
        return self.api(f"/datasets/{dataset_id}/metadata")


# Raw cache: one file per job, with what was asked and what came back.

def save_raw(source: str, kind: str, params: dict, inputs: list[dict], records: list[dict]) -> Path:
    RAW.mkdir(parents=True, exist_ok=True)
    fetched_at = now_iso()
    path = RAW / f"brightdata_{source}_{kind}_{fetched_at.replace(':', '').replace('-', '')}.json"
    path.write_text(json.dumps({"source": source, "kind": kind, "fetched_at": fetched_at, "params": params,
                                "inputs": inputs, "records": records}, indent=1, ensure_ascii=False),
                    encoding="utf-8")
    return path


def raw_jobs() -> list[dict]:
    jobs = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(RAW.glob("brightdata_*_*_*.json"))]
    return sorted(jobs, key=lambda j: j["fetched_at"])


# Record helpers shared by the adapters.

def is_error(rec: dict) -> bool:
    return bool(rec.get("error") or rec.get("error_code"))


def pick(rec: dict, *paths: str):
    """First non-empty value among dotted paths, e.g. pick(r, "lat", "coordinates.latitude")."""
    for path in paths:
        val = rec
        for part in path.split("."):
            val = val.get(part) if isinstance(val, dict) else None
        if val not in (None, "", [], {}):
            return val
    return None


def cut_url(url):
    """The scrapers run from proxies in many countries, so links carry random locales: drop the query."""
    return url.split("?")[0] if isinstance(url, str) and url else None


# Reviewer identity (names, profile links, photos) never leaves data/raw/.
PERSON_KEY = re.compile(r"reviewer|author|auther|user|profile|avatar|image|photo|friend", re.I)


def strip_people(items):
    if not isinstance(items, list):
        return []
    return [{k: v for k, v in it.items() if not PERSON_KEY.search(k)} if isinstance(it, dict) else it
            for it in items]


def e164(phone) -> str:
    if not isinstance(phone, str) or not phone:
        return ""
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 10:
        return "+1" + digits
    if len(digits) == 11 and digits.startswith("1"):
        return "+" + digits
    return re.sub(r"[^\d+]", "", phone)


def as_list(val) -> list[str]:
    """Categories arrive as a list of strings, a list of {title}/{name} objects, or a comma string."""
    if isinstance(val, str):
        return [s.strip() for s in val.split(",") if s.strip()]
    if isinstance(val, list):
        out = []
        for v in val:
            if isinstance(v, dict):
                v = v.get("title") or v.get("name") or v.get("alias")
            if isinstance(v, str) and v.strip():
                out.append(v.strip())
        return out
    return []
