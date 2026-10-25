"""context.dev scrape client: a browser-rendered fallback for pages Bright Data cannot read.

Used only by source_menus.py, and only when asked (`collect.py details --fallback` or
`--fetch contextdev`). Bright Data stays the primary source; context.dev covers its blind
spots: pages the Web Unlocker could not fetch, JavaScript app shells with no readable text,
and menus that live in ordering apps. One POST /v1/web/scrape per page, HTML only.

The key is CONTEXT_DEV_API_KEY (shell or repo-root .env). It is never printed or logged.
Standard library only.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request

from brightdata import ROOT, env_value

API = "https://api.context.dev/v1/web/scrape"
WAIT_MS = 2000      # let client-side menus render before the HTML is captured
TIMEOUT_MS = 60000  # context.dev's own deadline; our socket timeout sits just above it


class ContextDevError(RuntimeError):
    pass


def load_key() -> str | None:
    return env_value("CONTEXT_DEV_API_KEY", files=(ROOT / ".env",))


class ContextDev:
    def __init__(self, key: str):
        self.key = key

    def scrape_html(self, url: str) -> tuple[str | None, str | None]:
        """(rendered HTML, None) or (None, reason). HTTP and per-output failures come back as a
        reason, never an exception, so one bad site cannot stop a batch."""
        body = {"url": url, "formats": {"html": True}, "sharedParams": {"waitFor": WAIT_MS},
                "timeoutOpts": {"milliseconds": TIMEOUT_MS, "behavior": "fail"}}
        req = urllib.request.Request(API, data=json.dumps(body).encode(), method="POST",
                                     headers={"Authorization": f"Bearer {self.key}",
                                              "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT_MS / 1000 + 15) as res:
                status, text = res.status, res.read().decode(errors="replace")
        except urllib.error.HTTPError as e:
            with e:
                status, text = e.code, e.read().decode(errors="replace")
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            return None, f"context.dev: {str(getattr(e, 'reason', e))[:160]}"
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            return None, f"context.dev HTTP {status}: unreadable response"
        if status != 200:
            code = data.get("error_code") if isinstance(data, dict) else None
            return None, f"context.dev HTTP {status}" + (f" ({code})" if code else "")
        out = data.get("html") if isinstance(data, dict) else None
        if not isinstance(out, dict) or not out.get("success") or not isinstance(out.get("data"), str):
            code = out.get("error_code") if isinstance(out, dict) else None
            return None, "context.dev returned no HTML" + (f" ({code})" if code else "")
        return out["data"], None
