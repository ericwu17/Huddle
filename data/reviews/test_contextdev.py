"""Offline tests for the context.dev fallback: no network, no model calls.

    python3 -m unittest data/reviews/test_contextdev.py
"""

from __future__ import annotations

import io
import json
import sys
import unittest
import urllib.error
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))

import contextdev  # noqa: E402
import source_menus as sm  # noqa: E402
from brightdata import BrightDataError  # noqa: E402

MENU_PAGE = """<html><body><h2>Mains</h2>
<p>Kitsune Udon $16</p><p>Curry Udon (V) $18</p><p>V = vegetarian</p></body></html>"""
JS_SHELL = """<html><head><script src="/app.js"></script></head><body><div id="root"></div></body></html>"""
APP_ONLY = """<html><body><h1>Udon House</h1><p>Fresh noodles, made daily in Berkeley since 2009.</p>
<a href="https://www.toasttab.com/udon-house/v3">Order online</a></body></html>"""
ITEMS = {"isMenu": True, "legend": "V = vegetarian", "items": [
    {"name": "Kitsune Udon", "section": "Mains", "priceText": "$16", "description": None, "labels": [],
     "quote": "Kitsune Udon $16"},
    {"name": "Curry Udon", "section": "Mains", "priceText": "$18", "description": None, "labels": ["V"],
     "quote": "Curry Udon (V) $18"}]}


class FakeContextDev:
    """Stands in for contextdev.ContextDev: url -> html, or a failure reason."""

    def __init__(self, pages: dict[str, str | None]):
        self.pages, self.calls = pages, []

    def scrape_html(self, url):
        self.calls.append(url)
        html = self.pages.get(url)
        return (html, None) if html is not None else (None, "context.dev HTTP 500")


class FakeUnlocker:
    def __init__(self, status=200, body=None, raise_error=False):
        self.status, self.body, self.raise_error = status, body, raise_error

    def api(self, path, body, timeout):
        if self.raise_error:
            raise BrightDataError("/request: timed out")
        return self.status, self.body


def fake_extract(text, venue, url):
    return ITEMS if "Kitsune Udon" in text else {"isMenu": False, "legend": None, "items": []}


class Response(io.BytesIO):
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class Client(unittest.TestCase):
    def call(self, side_effect):
        with mock.patch("urllib.request.urlopen", side_effect=side_effect) as urlopen:
            result = contextdev.ContextDev("ctx-secret-key").scrape_html("https://venue.example/")
        return result, urlopen.call_args[0][0]

    def test_rendered_html_is_returned_and_key_sent_as_bearer(self):
        body = {"url": "https://venue.example/", "html": {"requested": True, "success": True, "data": MENU_PAGE}}
        (html, reason), req = self.call(lambda *a, **k: Response(json.dumps(body).encode()))
        self.assertEqual((html, reason), (MENU_PAGE, None))
        self.assertEqual(req.get_header("Authorization"), "Bearer ctx-secret-key")
        sent = json.loads(req.data)
        self.assertEqual(sent["formats"], {"html": True})
        self.assertEqual(sent["url"], "https://venue.example/")

    def test_failed_html_output_is_a_reason(self):
        body = {"html": {"requested": True, "success": False, "data": None, "error_code": "REQUEST_TIMEOUT"}}
        (html, reason), _ = self.call(lambda *a, **k: Response(json.dumps(body).encode()))
        self.assertIsNone(html)
        self.assertIn("REQUEST_TIMEOUT", reason)

    def test_http_errors_are_reasons_and_never_leak_the_key(self):
        def credits_exhausted(*a, **k):
            raise urllib.error.HTTPError("u", 402, "Payment Required", {},
                                         io.BytesIO(b'{"message": "no credits", "error_code": "USAGE_EXCEEDED"}'))
        (html, reason), _ = self.call(credits_exhausted)
        self.assertIsNone(html)
        self.assertEqual(reason, "context.dev HTTP 402 (USAGE_EXCEEDED)")
        self.assertNotIn("ctx-secret-key", reason)

    def test_network_errors_are_reasons(self):
        def offline(*a, **k):
            raise urllib.error.URLError("no route to host")
        (html, reason), _ = self.call(offline)
        self.assertIsNone(html)
        self.assertIn("no route to host", reason)


class Fallback(unittest.TestCase):
    URL = "https://venue.example/"

    def test_without_context_dev_nothing_changes(self):
        page = sm.fetch(self.URL, "unlocker", FakeUnlocker(status=502), "zone")
        self.assertEqual(page, {"url": self.URL, "mode": "unlocker", "error": "HTTP 502"})

    def test_failed_unlocker_fetch_is_retried_through_context_dev(self):
        cd = FakeContextDev({self.URL: MENU_PAGE})
        page = sm.fetch(self.URL, "unlocker", FakeUnlocker(raise_error=True), "zone", cd)
        self.assertEqual(page["mode"], "contextdev")
        self.assertEqual(page["html"], MENU_PAGE)
        self.assertEqual(set(page), {"url", "mode", "fetchedAt", "html"})

    def test_javascript_shell_is_retried_through_context_dev(self):
        cd = FakeContextDev({self.URL: MENU_PAGE})
        page = sm.fetch(self.URL, "unlocker", FakeUnlocker(body=JS_SHELL), "zone", cd)
        self.assertEqual(page["mode"], "contextdev")

    def test_readable_page_never_calls_context_dev(self):
        cd = FakeContextDev({self.URL: MENU_PAGE})
        page = sm.fetch(self.URL, "unlocker", FakeUnlocker(body=MENU_PAGE), "zone", cd)
        self.assertEqual(page["mode"], "unlocker")
        self.assertEqual(cd.calls, [])

    def test_primary_result_is_kept_when_context_dev_also_fails(self):
        cd = FakeContextDev({})
        page = sm.fetch(self.URL, "unlocker", FakeUnlocker(status=502), "zone", cd)
        self.assertEqual(page, {"url": self.URL, "mode": "unlocker", "error": "HTTP 502"})
        self.assertEqual(cd.calls, [self.URL])

    def test_pdfs_never_go_through_context_dev(self):
        cd = FakeContextDev({})
        with mock.patch.object(sm, "fetch_pdf", return_value={"url": "x.pdf", "mode": "direct", "error": "PDF: 404"}):
            sm.fetch("https://venue.example/menu.pdf", "unlocker", FakeUnlocker(), "zone", cd)
        self.assertEqual(cd.calls, [])

    def test_contextdev_as_the_primary_mode(self):
        cd = FakeContextDev({self.URL: MENU_PAGE})
        page = sm.fetch(self.URL, "contextdev", cd=cd)
        self.assertEqual((page["mode"], cd.calls), ("contextdev", [self.URL]))


class MenuRecords(unittest.TestCase):
    URL = "https://udon.example/"
    APP = "https://www.toasttab.com/udon-house/v3"

    def menu(self, cd):
        with mock.patch.object(sm, "extract", side_effect=fake_extract):
            return sm.menu_for("Udon House", self.URL, "unlocker", FakeUnlocker(body=APP_ONLY), "zone", cd)

    def test_ordering_app_stays_a_blind_spot_without_context_dev(self):
        m = self.menu(None)
        self.assertEqual(m["status"], "menu_in_ordering_app")
        self.assertIn("toasttab", m["reason"])

    def test_context_dev_reads_the_ordering_app_menu(self):
        cd = FakeContextDev({self.APP: MENU_PAGE})
        m = self.menu(cd)
        self.assertEqual(m["status"], "ok")
        self.assertEqual([i["name"] for i in m["items"]], ["Kitsune Udon", "Curry Udon"])
        self.assertEqual(m["items"][1]["labels"], [{"text": "V", "tag": "vegetarian"}])
        self.assertEqual(m["pages"][-1]["mode"], "contextdev")
        self.assertEqual(m["items"][0]["sourceUrl"], self.APP)

    def test_records_keep_the_same_keys_either_way(self):
        plain = self.menu(None)
        filled = self.menu(FakeContextDev({self.APP: MENU_PAGE}))
        self.assertEqual(set(plain) - {"reason"}, set(filled))
        with mock.patch.object(sm, "extract", side_effect=fake_extract):
            direct = sm.menu_for("Udon House", self.URL, "unlocker", FakeUnlocker(body=MENU_PAGE), "zone")
        self.assertEqual(set(direct["items"][0]), set(filled["items"][0]))
        self.assertEqual(set(direct["pages"][0]), set(filled["pages"][-1]))

    def test_failed_app_fetch_keeps_the_ordering_app_status(self):
        m = self.menu(FakeContextDev({}))
        self.assertEqual(m["status"], "menu_in_ordering_app")
        self.assertEqual(m["pages"][-1], {"url": self.APP, "mode": "contextdev", "error": "context.dev HTTP 500"})


if __name__ == "__main__":
    unittest.main()
