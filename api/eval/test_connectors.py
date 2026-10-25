"""Connector verification with synthetic credentials, mocked HTTP and no Mac reads.

Never sends Messages, reads personal calendars, or writes a provider event.
"""
import base64
from dataclasses import replace
from datetime import datetime, timedelta, timezone
import hashlib
import json
import time
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from cryptography.fernet import Fernet
from fastapi import HTTPException
from google.auth.exceptions import RefreshError
from google.oauth2.credentials import Credentials
import httpx
from pydantic import ValidationError
import requests

from api.connectors import (CALENDAR_URI, CONTACTS_SEARCH, MESSAGES_READY, MESSAGES_SEND, SCOPES,
                            ConnectorService, ConnectorSettings)
from api.connectors_models import (CalendarAvailabilityRequest, CalendarConnection,
    CalendarEventsRequest, GoogleRevokeRequest, GoogleStartRequest, MessageSendRequest,
    MacContactsSearchRequest)

START, END = "2026-10-25T17:00:00-07:00", "2026-10-25T18:00:00-07:00"


def configuration(**changes):
    return replace(ConnectorSettings(google_client_id="synthetic-client", google_client_secret="synthetic-client-secret",
        google_redirect_uri="http://localhost:8002/connectors/google/callback", encryption_key=Fernet.generate_key().decode(),
        frontend_base_url="http://localhost:5174", spacetimedb_uri="https://module.invalid", spacetimedb_db="connector-tests",
        shared_secret="synthetic-shared-secret"), **changes)


def credentials(*, expired=False):
    return Credentials("synthetic-access-token", refresh_token="synthetic-refresh-token", token_uri="https://oauth2.googleapis.com/token",
        client_id="synthetic-client", client_secret="synthetic-client-secret", scopes=SCOPES,
        expiry=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=-1 if expired else 1))


def connection(service, account="account-one", *, expired=False):
    return CalendarConnection(accountId=account, tokenCiphertext=service._pack_credentials(account, credentials(expired=expired)))


def availability(connections):
    return CalendarAvailabilityRequest(connections=connections, timeMin=START, timeMax=END, timeZone="America/Los_Angeles")


def meetup(connections):
    return CalendarEventsRequest(meetingId="synthetic-meetup", connections=connections, summary="Huddle meetup",
        location="A catalog venue", start=START, end=END, timeZone="America/Los_Angeles")


class ConnectorTests(unittest.IsolatedAsyncioTestCase):
    async def service(self, handler, **kwargs):
        client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        self.addAsyncCleanup(client.aclose)
        return ConnectorService(configuration(), client=client, **kwargs)

    async def test_unconfigured_is_honest_and_does_not_probe_messages(self):
        async def never(*_args, **_kwargs):
            self.fail("Disabled connector probed the host")
        service = ConnectorService(ConnectorSettings(), process_factory=never)
        self.addAsyncCleanup(service.aclose)
        status = await service.status()
        self.assertFalse(status.googleConfigured)
        self.assertFalse(status.messagesConfigured)
        with self.assertRaises(HTTPException) as error:
            await service.google_start(GoogleStartRequest(accountId="account-one"))
        self.assertEqual(error.exception.status_code, 503)

    async def test_oauth_uses_library_pkce_encrypted_account_state_and_expiry(self):
        clock = [time.time()]
        service = await self.service(lambda _request: self.fail("OAuth start must not make network calls"), clock=lambda: clock[0])
        started = await service.google_start(GoogleStartRequest(accountId="private-account"))
        query = parse_qs(urlsplit(started.authorizationUrl).query)
        self.assertEqual(urlsplit(started.authorizationUrl).hostname, "accounts.google.com")
        self.assertEqual(query["code_challenge_method"], ["S256"])
        state = service._open_state(query["state"][0])
        self.assertEqual(state["accountId"], "private-account")
        self.assertEqual(state["stateId"], started.stateId)
        self.assertNotIn("private-account", query["state"][0])
        challenge = base64.urlsafe_b64encode(hashlib.sha256(state["verifier"].encode()).digest()).decode().rstrip("=")
        self.assertEqual(query["code_challenge"], [challenge])
        self.assertNotIn(state["verifier"], started.authorizationUrl)
        self.assertEqual(set(query["scope"][0].split()), set(SCOPES))
        clock[0] += 601
        with self.assertRaises(HTTPException):
            service._open_state(query["state"][0])

    async def test_invalid_or_cross_kind_state_never_reaches_module_or_google(self):
        service = await self.service(lambda _request: self.fail("Invalid state made a network call"))
        for state in ["tampered", service._pack_credentials("account-one", credentials())]:
            with self.assertRaises(HTTPException) as error:
                await service.google_callback(code="synthetic-code", state=state)
            self.assertEqual(error.exception.status_code, 400)

    async def test_callback_claims_before_exchange_and_completes_with_only_encrypted_tokens(self):
        order, completed = [], []
        def handler(request):
            if request.url.path.endswith("/claim"):
                order.append("claim")
                self.assertEqual(request.headers["X-Huddle-Secret"], "synthetic-shared-secret")
                return httpx.Response(200, json={"ok": True, "claimNonce": "private-claim-nonce"})
            if request.url.path.endswith("/userinfo"):
                order.append("userinfo")
                return httpx.Response(200, json={"email": "calendar@example.test", "email_verified": True})
            if request.url.path.endswith("/complete"):
                order.append("complete"); completed.append(json.loads(request.content))
                return httpx.Response(200, json={"ok": True})
            self.fail("Unexpected provider operation")
        service = await self.service(handler)
        started = await service.google_start(GoogleStartRequest(accountId="account-one"))
        state = parse_qs(urlsplit(started.authorizationUrl).query)["state"][0]
        class FakeFlow:
            credentials = credentials()
            def fetch_token(self, **kwargs):
                order.append("exchange")
                self_outer.assertEqual(kwargs["code"], "synthetic-code")
                self_outer.assertEqual(kwargs["timeout"], 5)
        self_outer = self
        service.flow_factory = lambda *_args, **_kwargs: FakeFlow()
        redirect = await service.google_callback(code="synthetic-code", state=state)
        self.assertEqual(order, ["claim", "exchange", "userinfo", "complete"])
        self.assertEqual(redirect, "http://localhost:5174/connectors?google=connected")
        self.assertEqual(completed[0]["claimNonce"], "private-claim-nonce")
        public = json.dumps(completed[0])
        self.assertNotIn("synthetic-access-token", public)
        self.assertNotIn("synthetic-refresh-token", public)
        self.assertNotIn("synthetic-client-secret", public)
        unpacked = service._unpack_credentials(CalendarConnection(accountId="account-one", tokenCiphertext=completed[0]["tokenCiphertext"]))
        self.assertEqual(unpacked.refresh_token, "synthetic-refresh-token")

    async def test_replayed_callback_cannot_exchange_tokens(self):
        calls = []
        def handler(request):
            calls.append(request.url.path)
            return httpx.Response(409, json={"ok": False})
        service = await self.service(handler)
        started = await service.google_start(GoogleStartRequest(accountId="account-one"))
        state = parse_qs(urlsplit(started.authorizationUrl).query)["state"][0]
        service.flow_factory = lambda *_args, **_kwargs: self.fail("Replayed callback tried token exchange")
        with self.assertRaises(HTTPException):
            await service.google_callback(code="synthetic-code", state=state)
        self.assertEqual(len(calls), 1)

    async def test_denied_oauth_consumes_state_and_records_fixed_failure(self):
        recorded = []
        def handler(request):
            recorded.append((request.url.path, json.loads(request.content)))
            return httpx.Response(200, json={"ok": True, "claimNonce": "claim"})
        service = await self.service(handler)
        started = await service.google_start(GoogleStartRequest(accountId="account-one"))
        state = parse_qs(urlsplit(started.authorizationUrl).query)["state"][0]
        redirect = await service.google_callback(code=None, state=state, error="access_denied")
        self.assertIn("google=failed", redirect)
        self.assertIn("/claim", recorded[0][0]); self.assertIn("/complete", recorded[1][0])
        self.assertIn("error", recorded[1][1]); self.assertNotIn("tokenCiphertext", recorded[1][1])

    async def test_real_oauth_library_accepts_google_scope_names_and_posts_the_original_verifier(self):
        complete = []
        def handler(request):
            if request.url.path.endswith("/userinfo"):
                return httpx.Response(200, json={"email": "calendar@example.test", "email_verified": True})
            if request.url.path.endswith("/complete"):
                complete.append(json.loads(request.content))
            return httpx.Response(200, json={"ok": True, "claimNonce": "claim"})
        service = await self.service(handler)
        started = await service.google_start(GoogleStartRequest(accountId="account-one"))
        state = parse_qs(urlsplit(started.authorizationUrl).query)["state"][0]
        verifier = service._open_state(state)["verifier"]
        token_reply = requests.Response()
        token_reply.status_code = 200
        token_reply._content = json.dumps({"access_token": "synthetic-access", "refresh_token": "synthetic-refresh",
            "token_type": "Bearer", "expires_in": 3600, "scope": " ".join(SCOPES)}).encode()
        token_reply.headers["Content-Type"] = "application/json"
        token_reply.request = requests.Request("POST", "https://oauth2.googleapis.com/token").prepare()
        def token_request(_session, method, url, **kwargs):
            self.assertEqual(method, "POST")
            self.assertEqual(url, "https://oauth2.googleapis.com/token")
            self.assertEqual(kwargs["data"]["code_verifier"], verifier)
            self.assertEqual(kwargs["timeout"], 5)
            return token_reply
        with patch("requests.sessions.Session.request", token_request):
            target = await service.google_callback(code="synthetic-code", state=state)
        self.assertIn("google=connected", target)
        self.assertEqual(len(complete), 1)

    async def test_unconfirmed_completion_does_not_overwrite_connection_with_an_error_callback(self):
        complete = []
        def handler(request):
            if request.url.path.endswith("/userinfo"):
                return httpx.Response(200, json={"email": "calendar@example.test", "email_verified": True})
            if request.url.path.endswith("/complete"):
                complete.append(json.loads(request.content))
                return httpx.Response(503)
            return httpx.Response(200, json={"ok": True, "claimNonce": "claim"})
        service = await self.service(handler)
        started = await service.google_start(GoogleStartRequest(accountId="account-one"))
        state = parse_qs(urlsplit(started.authorizationUrl).query)["state"][0]
        class FakeFlow:
            credentials = credentials()
            def fetch_token(self, **kwargs): pass
        service.flow_factory = lambda *_args, **_kwargs: FakeFlow()
        with self.assertRaises(HTTPException):
            await service.google_callback(code="synthetic-code", state=state)
        self.assertEqual(len(complete), 1)
        self.assertNotIn("error", complete[0])

    async def test_availability_requests_only_primary_and_returns_busy_without_event_details(self):
        calls = []
        def handler(request):
            calls.append(request)
            self.assertEqual(request.url.path, "/calendar/v3/freeBusy")
            self.assertEqual(json.loads(request.content)["items"], [{"id": "primary"}])
            return httpx.Response(200, json={"calendars": {"primary": {"busy": [{"start": START, "end": END}], "summary": "PRIVATE EVENT TITLE"}}})
        service = await self.service(handler)
        result = await service.availability(availability([connection(service)]))
        self.assertEqual(len(result.availability[0].busy), 1)
        self.assertNotIn("PRIVATE EVENT TITLE", result.model_dump_json())
        self.assertEqual(result.updatedConnections, [])

    async def test_one_calendar_error_never_becomes_partial_free_time(self):
        def handler(request):
            if "token-two" in request.headers["Authorization"]:
                return httpx.Response(200, json={"calendars": {"primary": {"errors": [{"reason": "notFound"}]}}})
            return httpx.Response(200, json={"calendars": {"primary": {"busy": []}}})
        service = await self.service(handler)
        second = credentials(); second.token = "token-two"
        with self.assertRaises(HTTPException) as error:
            await service.availability(availability([connection(service), CalendarConnection(accountId="account-two", tokenCiphertext=service._pack_credentials("account-two", second))]))
        self.assertEqual(error.exception.status_code, 502)

    async def test_credentials_are_bound_to_the_owning_account(self):
        service = await self.service(lambda _request: self.fail("Swapped credential reached Google"))
        own = connection(service)
        swapped = CalendarConnection(accountId="different-account", tokenCiphertext=own.tokenCiphertext)
        with self.assertRaises(HTTPException) as error:
            await service.availability(availability([swapped]))
        self.assertEqual(error.exception.status_code, 409)
        written = await service.create_events(meetup([swapped]))
        self.assertEqual(written.created, [])
        self.assertEqual(len(written.failed), 1)

    async def test_refresh_uses_google_credentials_and_returns_encrypted_updated_tokens(self):
        service = await self.service(lambda _request: httpx.Response(200, json={"calendars": {"primary": {"busy": []}}}))
        def refresh(value, request):
            value.token = "rotated-access-token"
            value.expiry = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=1)
        with patch("api.connectors.Credentials.refresh", refresh):
            result = await service.availability(availability([connection(service, expired=True)]))
        self.assertEqual(len(result.updatedConnections), 1)
        self.assertNotIn("rotated-access-token", result.model_dump_json())
        updated = result.updatedConnections[0]
        self.assertEqual(service._unpack_credentials(CalendarConnection(**updated.model_dump())).token, "rotated-access-token")

    async def test_failed_refresh_does_not_query_or_assume_calendar_free(self):
        service = await self.service(lambda _request: self.fail("Failed refresh queried calendar"))
        with patch("api.connectors.Credentials.refresh", side_effect=RefreshError("synthetic")):
            with self.assertRaises(HTTPException) as error:
                await service.availability(availability([connection(service, expired=True)]))
        self.assertEqual(error.exception.status_code, 409)

    async def test_create_event_is_idempotent_primary_only_and_sends_no_guest_invites(self):
        events, writes, busy_queries = {}, [], []
        def handler(request):
            if request.url.path.endswith("/freeBusy"):
                busy_queries.append(request)
                return httpx.Response(200, json={"calendars": {"primary": {"busy": []}}})
            if request.method == "GET":
                event = events.get(request.url.path.rsplit("/", 1)[-1])
                return httpx.Response(200, json=event) if event else httpx.Response(404)
            event = json.loads(request.content); writes.append(event)
            self.assertEqual(request.url.params["sendUpdates"], "none")
            self.assertNotIn("attendees", event)
            events[event["id"]] = event
            return httpx.Response(200, json=event)
        service = await self.service(handler)
        body = meetup([connection(service)])
        first, second = await service.create_events(body), await service.create_events(body)
        self.assertEqual(len(first.created), 1); self.assertFalse(first.created[0].alreadyExisted)
        self.assertEqual(len(second.created), 1); self.assertTrue(second.created[0].alreadyExisted)
        self.assertEqual(first.created[0].eventId, second.created[0].eventId)
        self.assertRegex(first.created[0].eventId, "^[0-9a-v]{5,1024}$")
        self.assertEqual(len(writes), 1); self.assertEqual(len(busy_queries), 1)

    async def test_changed_availability_prevents_new_calendar_write(self):
        def handler(request):
            if request.method == "GET": return httpx.Response(404)
            self.assertTrue(request.url.path.endswith("/freeBusy"))
            return httpx.Response(200, json={"calendars": {"primary": {"busy": [{"start": START, "end": END}]}}})
        service = await self.service(handler)
        result = await service.create_events(meetup([connection(service)]))
        self.assertEqual(result.created, [])
        self.assertIn("busy", result.failed[0].message)

    async def test_event_write_rejects_multiple_accounts_before_any_provider_request(self):
        calls = []
        def handler(request):
            calls.append(request)
            return httpx.Response(503)
        service = await self.service(handler)
        with self.assertRaises(ValueError):
            meetup([connection(service), connection(service, "account-two")])
        from api.scheduling import MeetupRequest
        with self.assertRaises(ValueError):
            MeetupRequest(meetingId="test", connections=[connection(service), connection(service, "account-two")],
                summary="Huddle", location="Park", date="2026-10-24", startTime="17:00", endTime="19:00")
        self.assertEqual(calls, [])

    async def test_concurrent_event_insert_conflict_recovers_the_same_event_without_a_second_write(self):
        stored, writes = {}, []
        def handler(request):
            if request.url.path.endswith("/freeBusy"):
                return httpx.Response(200, json={"calendars": {"primary": {"busy": []}}})
            if request.method == "GET":
                return httpx.Response(200, json=stored) if stored else httpx.Response(404)
            stored.update(json.loads(request.content)); writes.append(request)
            return httpx.Response(409)
        service = await self.service(handler)
        result = await service.create_events(meetup([connection(service)]))
        self.assertEqual(len(result.created), 1)
        self.assertTrue(result.created[0].alreadyExisted)
        self.assertEqual(len(writes), 1)

    async def test_revoke_requires_provider_confirmation_or_already_invalid_token(self):
        for status, payload, succeeds in [(200, {}, True), (400, {"error": "invalid_token"}, True),
                                          (400, {"error": "invalid_request"}, False), (503, {}, False)]:
            service = await self.service(lambda _request: httpx.Response(status, json=payload))
            body = GoogleRevokeRequest(**connection(service).model_dump())
            if succeeds:
                self.assertTrue((await service.revoke(body)).revoked)
            else:
                with self.assertRaises(HTTPException) as error:
                    await service.revoke(body)
                self.assertEqual(error.exception.status_code, 502)

    async def test_messages_requires_enabled_mac_and_connected_account(self):
        called = []
        async def runner(*args, **kwargs): called.append(args); return FakeProcess("unavailable")
        for enabled, host in [(False, "Darwin"), (True, "Linux")]:
            service = ConnectorService(configuration(messages_enabled=enabled), process_factory=runner, host_platform=lambda: host)
            self.addAsyncCleanup(service.aclose)
            result = await service.send_message(MessageSendRequest(dispatchId="dispatch", recipient="+14155550100", message="Synthetic invite"))
            self.assertEqual(result.status, "unavailable")
        self.assertEqual(called, [])

    async def test_messages_uses_constant_script_plus_safe_argv_and_submits_once(self):
        called = []
        async def runner(*args, **kwargs):
            called.append(args)
            return FakeProcess("ready" if args[2] == MESSAGES_READY else "submitted")
        service = ConnectorService(configuration(messages_enabled=True), process_factory=runner, host_platform=lambda: "Darwin")
        self.addAsyncCleanup(service.aclose)
        payload = 'Synthetic invitation "quoted"; do shell script "never" https://huddle.invalid/invite/test'
        body = MessageSendRequest(dispatchId="dispatch", recipient="synthetic@example.test", message=payload)
        first, second = await service.send_message(body), await service.send_message(body)
        sends = [args for args in called if args[2] == MESSAGES_SEND]
        self.assertEqual(len(sends), 1)
        self.assertEqual(sends[0], ("/usr/bin/osascript", "-e", MESSAGES_SEND, "--", body.recipient, payload))
        self.assertNotIn(payload, MESSAGES_SEND)
        self.assertEqual(first.status, "submitted"); self.assertEqual(second.status, "submitted")
        self.assertNotIn("delivered", first.detail.lower())

    async def test_unknown_message_attempt_is_not_retried(self):
        service = ConnectorService(configuration(messages_enabled=True), host_platform=lambda: "Darwin")
        self.addAsyncCleanup(service.aclose)
        calls = []
        async def run(script, *args, **kwargs):
            if script == MESSAGES_READY: return "ready"
            calls.append(script); raise TimeoutError()
        service._osascript = run
        body = MessageSendRequest(dispatchId="dispatch", recipient="+14155550100", message="Synthetic invite")
        for expected in (502, 409):
            with self.assertRaises(HTTPException) as error: await service.send_message(body)
            self.assertEqual(error.exception.status_code, expected)
        self.assertEqual(len(calls), 1)

    def test_request_models_reject_invalid_timezones_duplicate_accounts_and_handles(self):
        with self.assertRaises(ValidationError):
            MessageSendRequest(dispatchId="d", recipient='"; do shell script "x"', message="Synthetic")
        with self.assertRaises(ValidationError):
            CalendarAvailabilityRequest(connections=[CalendarConnection(accountId="a", tokenCiphertext="x")], timeMin=START,
                                        timeMax=END, timeZone="invented/timezone")
        with self.assertRaises(ValidationError):
            CalendarAvailabilityRequest(connections=[CalendarConnection(accountId="a", tokenCiphertext="x")],
                                        timeMin="2026-10-25T10:00:00", timeMax=END, timeZone="UTC")

    async def test_contacts_disabled_or_non_mac_never_launches_contacts(self):
        called = []
        async def runner(*args, **kwargs):
            called.append(args)
            self.fail("Disabled Mac Contacts adapter was launched")
        for enabled, host in [(False, "Darwin"), (True, "Linux")]:
            service = ConnectorService(configuration(mac_contacts_enabled=enabled), process_factory=runner, host_platform=lambda: host)
            self.addAsyncCleanup(service.aclose)
            with self.assertRaises(HTTPException) as error:
                await service.search_contacts(MacContactsSearchRequest(query="Eric"))
            self.assertEqual(error.exception.status_code, 503)
        self.assertEqual(called, [])

    async def test_contacts_query_is_only_argv_not_jxa_code(self):
        called = []
        async def runner(*args, **kwargs):
            called.append(args)
            return FakeProcess(json.dumps({"contacts": [], "truncated": False}))
        service = ConnectorService(configuration(mac_contacts_enabled=True), process_factory=runner, host_platform=lambda: "Darwin")
        self.addAsyncCleanup(service.aclose)
        query = 'Eric\"; throw new Error("never"); //'
        response = await service.search_contacts(MacContactsSearchRequest(query=query))
        self.assertEqual(called, [("/usr/bin/osascript", "-l", "JavaScript", "-e", CONTACTS_SEARCH, "--", query)])
        self.assertNotIn(query, CONTACTS_SEARCH)
        self.assertIn("people.whose", CONTACTS_SEARCH)
        self.assertNotIn(".vcard", CONTACTS_SEARCH.lower())
        self.assertEqual(response.contacts, [])

    async def test_contacts_returns_only_matching_people_with_normalized_usable_destinations(self):
        phone = lambda value, label="mobile": {"value": value, "label": label, "kind": "phone"}
        email = lambda value: {"value": value, "label": "work", "kind": "email"}
        payload = {"contacts": [
            {"contactId": "synthetic-eric", "displayName": "ERIC Synthetic", "destinations": [
                phone("(415) 555-0100", "_$!<Mobile>!$_"), phone("1-415-555-0101"), phone("+44 20 7946 0958"),
                phone("+14155550100"), phone("555-0100"), phone("4155550100 ext2"), phone("0014155550100"),
                email("synthetic.eric@example.test"), email("not an email") ]},
            {"contactId": "unrelated", "displayName": "Ada Lovelace", "destinations": [phone("+14155550103")]},
            {"contactId": "invalid-only", "displayName": "Eric Invalid", "destinations": [phone("not a number")]},
        ], "truncated": False}
        async def runner(*args, **kwargs): return FakeProcess(json.dumps(payload))
        service = ConnectorService(configuration(mac_contacts_enabled=True), process_factory=runner, host_platform=lambda: "Darwin")
        self.addAsyncCleanup(service.aclose)
        result = await service.search_contacts(MacContactsSearchRequest(query="er"))
        self.assertEqual([person.contactId for person in result.contacts], ["synthetic-eric"])
        self.assertEqual([destination.value for destination in result.contacts[0].destinations],
            ["+14155550100", "+14155550101", "+442079460958", "synthetic.eric@example.test"])
        self.assertEqual(result.contacts[0].destinations[0].label, "Mobile")
        self.assertFalse(result.truncated)

    async def test_contacts_bounds_allow_ten_people_and_twelve_destinations_and_preserve_truncation(self):
        payload = {"contacts": [{"contactId": f"synthetic-{index}", "displayName": f"Eric {index}",
            "destinations": [{"kind": "phone", "label": "mobile", "value": f"+1415555{index:02}{number:02}"}
                             for number in range(12)]} for index in range(10)], "truncated": True}
        async def runner(*args, **kwargs): return FakeProcess(json.dumps(payload))
        service = ConnectorService(configuration(mac_contacts_enabled=True), process_factory=runner, host_platform=lambda: "Darwin")
        self.addAsyncCleanup(service.aclose)
        result = await service.search_contacts(MacContactsSearchRequest(query="Eric"))
        self.assertEqual(len(result.contacts), 10)
        self.assertTrue(all(len(person.destinations) == 12 for person in result.contacts))
        self.assertTrue(result.truncated)

    async def test_contacts_rejects_invalid_json_oversize_and_out_of_contract_provider_results(self):
        contact = {"contactId": "synthetic-eric", "displayName": "Eric Synthetic",
                   "destinations": [{"kind": "phone", "label": "mobile", "value": "+14155550100"}]}
        replies = ["{not-json", " " * 65537,
            json.dumps({"contacts": [contact] * 11, "truncated": False}),
            json.dumps({"contacts": [{**contact, "destinations": contact["destinations"] * 13}], "truncated": False}),
            json.dumps({"contacts": [{**contact, "contactId": "x" * 513}], "truncated": False}),
            json.dumps({"contacts": [{**contact, "displayName": "x" * 201}], "truncated": False}),
            json.dumps({"contacts": [{**contact, "destinations": [{"kind": "social", "value": "x", "label": "x"}]}], "truncated": False}),
            json.dumps({"contacts": [{**contact, "note": "PRIVATE_NOTE"}], "truncated": False}),
            json.dumps({"contacts": [contact, contact], "truncated": False}),
        ]
        for reply in replies:
            async def runner(*args, **kwargs): return FakeProcess(reply)
            service = ConnectorService(configuration(mac_contacts_enabled=True), process_factory=runner, host_platform=lambda: "Darwin")
            self.addAsyncCleanup(service.aclose)
            with self.assertRaises(HTTPException) as error:
                await service.search_contacts(MacContactsSearchRequest(query="Eric"))
            self.assertEqual(error.exception.status_code, 503)
            self.assertNotIn("PRIVATE_NOTE", error.exception.detail)

    async def test_contacts_permission_error_is_fixed_and_never_returns_provider_stderr(self):
        class Denied(FakeProcess):
            returncode = 1
            async def communicate(self): return b"", b"PRIVATE_CONTACT -1743 permission denied"
        async def runner(*args, **kwargs): return Denied("")
        service = ConnectorService(configuration(mac_contacts_enabled=True), process_factory=runner, host_platform=lambda: "Darwin")
        self.addAsyncCleanup(service.aclose)
        with self.assertRaises(HTTPException) as error:
            await service.search_contacts(MacContactsSearchRequest(query="Eric"))
        self.assertEqual(error.exception.status_code, 503)
        self.assertIn("System Settings", error.exception.detail)
        self.assertNotIn("PRIVATE_CONTACT", error.exception.detail)

    async def test_contacts_timeout_kills_the_process_without_retry_or_partial_contacts(self):
        class Waiting(FakeProcess):
            returncode = None
            killed = False
            def kill(self): self.killed = True; self.returncode = -9
        process = Waiting("")
        called = []
        async def runner(*args, **kwargs): called.append(args); return process
        async def timeout(awaitable, *, timeout):
            self.assertEqual(timeout, 6)
            awaitable.close()
            raise TimeoutError()
        service = ConnectorService(configuration(mac_contacts_enabled=True), process_factory=runner, host_platform=lambda: "Darwin")
        self.addAsyncCleanup(service.aclose)
        with patch("api.connectors.asyncio.wait_for", timeout):
            with self.assertRaises(HTTPException) as error:
                await service.search_contacts(MacContactsSearchRequest(query="Eric"))
        self.assertEqual(error.exception.status_code, 503)
        self.assertTrue(process.killed)
        self.assertEqual(len(called), 1)

    def test_contacts_search_requires_a_specific_bounded_name(self):
        for query in ["", "a", "  ", "x" * 81, "Eric\nOther"]:
            with self.assertRaises(ValidationError): MacContactsSearchRequest(query=query)
        self.assertEqual(MacContactsSearchRequest(query=" Eric ").query, "Eric")


class FakeProcess:
    returncode = 0
    def __init__(self, output): self.output = output
    async def communicate(self): return self.output.encode(), b""
    def kill(self): pass


if __name__ == "__main__":
    unittest.main()
