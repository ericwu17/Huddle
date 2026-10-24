"""Voice stub boundary checks. Run: python -m unittest discover -s voice/eval -v."""

import secrets
import unittest

from fastapi.testclient import TestClient

from voice.main import Settings, create_app

BOOK = {"bookingId": "b1", "placeId": "p_001", "restaurantName": "Example Ramen House",
        "restaurantPhone": "+15105550123", "partySize": 4, "time": "2026-10-24T18:00:00-07:00",
        "nameOnReservation": "Alex", "alternativeWindow": {"earliest": "17:30", "latest": "19:30"},
        "language": "zh"}


class VoiceStubTests(unittest.TestCase):
    def client(self, scenario="confirm"):
        self.secret = secrets.token_urlsafe(16)
        self.posted = []

        async def record(event):
            self.posted.append(event)

        app = create_app(Settings(self.secret, scenario=scenario, step_ms=0), poster=record)
        return TestClient(app)

    def book(self, c, body=BOOK, secret=None):
        return c.post("/book", json=body, headers={"X-Huddle-Secret": secret or self.secret})

    def test_rejects_missing_or_wrong_secret(self):
        with self.client() as c:
            self.assertEqual(c.post("/book", json=BOOK).status_code, 401)
            self.assertEqual(self.book(c, secret="wrong").status_code, 401)
            self.assertEqual(self.posted, [])

    def test_rejects_bad_body(self):
        with self.client() as c:
            self.assertEqual(self.book(c, {**BOOK, "partySize": 0}).status_code, 422)
            self.assertEqual(self.posted, [])

    def test_confirm_scenario(self):
        with self.client() as c:
            res = self.book(c)
        self.assertEqual(res.json(), {"accepted": True, "bookingId": "b1"})
        self.assertNotIn("x-huddle-stub", res.headers)  # would make the module replay its own fake too
        types = [e["type"] for e in self.posted]
        self.assertEqual(types, ["dialing", "connected", "transcript", "transcript", "slot_offered",
                                 "transcript", "confirmed", "ended"])
        self.assertEqual(self.posted[-2]["slot"], "19:45")

    def test_full_scenario(self):
        with self.client("full") as c:
            self.book(c)
        self.assertEqual([e["type"] for e in self.posted][-2:], ["failed", "ended"])
        self.assertEqual(self.posted[-2]["reason"], "full")

    def test_events_match_contract_shape(self):
        with self.client() as c:
            self.book(c)
        for e in self.posted:
            self.assertEqual(e["bookingId"], "b1")
            self.assertIsInstance(e["ts"], int)
            self.assertIn("text", e)
            self.assertIn("slot", e)
        self.assertTrue(all(e["speaker"] in ("agent", "restaurant") for e in self.posted if e["type"] == "transcript"))

    def test_refuses_to_start_without_secret(self):
        with self.assertRaises(RuntimeError):
            with TestClient(create_app(Settings(" "))):
                pass


if __name__ == "__main__":
    unittest.main()
