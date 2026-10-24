"""Real Argon2/framework checks on synthetic passwords; no DB or model calls."""
import unittest
from fastapi.testclient import TestClient

from api.main import Settings, create_app


class AccountBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(create_app(Settings(secret="account-unit-secret")))
        self.client.__enter__()
        self.addCleanup(self.client.__exit__, None, None, None)
        self.headers = {"X-Huddle-Secret": "account-unit-secret"}
        self.password = " synthetic password with spaces "

    def post(self, body, status=200):
        response = self.client.post("/accounts/credentials", headers=self.headers, json=body)
        self.assertEqual(response.status_code, status, response.text)
        self.assertNotIn(self.password, response.text)
        return response

    def test_auth_and_validation_never_echo_credentials(self):
        for headers in [{}, {"X-Huddle-Secret": "wrong"}]:
            self.assertEqual(self.client.post("/accounts/credentials", headers=headers, json={}).status_code, 401)
        result = self.post(dict(action="register", username="bad username", password=self.password), 422)
        self.assertNotIn("input", result.json()["detail"][0])
        self.post(dict(action="register", username="valid_user", password="short"), 422)
        self.post(dict(action="register", username="valid_user", password="1234567"), 422)

    def test_eight_character_password_is_accepted(self):
        registered = self.post(dict(action="register", username="eight_user", password="Demo1234")).json()
        self.assertTrue(registered["authenticated"])
        snapshot = dict(id="eight-user", username="eight_user", passwordHash=registered["passwordHash"])
        self.assertTrue(self.post(dict(action="login", username="eight_user", password="Demo1234", account=snapshot)).json()["authenticated"])

    def test_real_password_hash_authentication_and_missing_user(self):
        registered = self.post(dict(action="register", username="test_user", password=self.password)).json()
        self.assertTrue(registered["authenticated"])
        self.assertTrue(registered["passwordHash"].startswith("$argon2id$"))
        self.assertEqual(len(registered["principalHex"]), 64)
        snapshot = dict(id="unit-user", username="test_user", passwordHash=registered["passwordHash"])
        correct = self.post(dict(action="login", username="test_user", password=self.password, account=snapshot)).json()
        self.assertTrue(correct["authenticated"])
        wrong = self.post(dict(action="login", username="test_user", password=self.password.strip(), account=snapshot)).json()
        unknown = self.post(dict(action="login", username="unknown_user", password=self.password)).json()
        self.assertFalse(wrong["authenticated"])
        self.assertFalse(unknown["authenticated"])
        self.assertIsNone(wrong["passwordHash"])
        duplicate = self.post(dict(action="register", username="test_user", password=self.password, account=snapshot)).json()
        self.assertFalse(duplicate["authenticated"])

    def test_hashes_are_salted_and_principals_are_fresh(self):
        values = [self.post(dict(action="register", username="test_user", password=self.password)).json() for _ in range(2)]
        self.assertNotEqual(values[0]["passwordHash"], values[1]["passwordHash"])
        self.assertNotEqual(values[0]["principalHex"], values[1]["principalHex"])
