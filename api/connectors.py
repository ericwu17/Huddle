"""Opt-in adapters for the host Mac's Messages and each user's Google Calendar.

Maincloud authorizes account ownership, invitation dispatches and event opt-ins.
This service owns provider credentials and never interprets a busy interval as a
free calendar after a provider error. No connector is enabled by fixture data.
"""
import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
import os
import platform
import re
import secrets
import time
from typing import Callable
from urllib.parse import quote, urlsplit

from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException
from google.auth.exceptions import GoogleAuthError
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
import httpx

from .connectors_models import (
    AccountAvailability, BusyInterval, CalendarAvailabilityRequest, CalendarAvailabilityResponse,
    CalendarConnection, CalendarEventFailure, CalendarEventResult, CalendarEventsRequest,
    CalendarEventsResponse, ConnectorStatus, GoogleRevokeRequest, GoogleRevokeResponse,
    GoogleStartRequest, GoogleStartResponse, MessageSendRequest, MessageSendResponse,
    MacContact, MacContactDestination, MacContactsSearchRequest, MacContactsSearchResponse,
    UpdatedConnection, instant,
)

AUTH_URI = "https://accounts.google.com/o/oauth2/auth"
TOKEN_URI = "https://oauth2.googleapis.com/token"
CALENDAR_URI = "https://www.googleapis.com/calendar/v3"
USERINFO_URI = "https://openidconnect.googleapis.com/v1/userinfo"
SCOPES = ["openid", "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/calendar.freebusy",
          "https://www.googleapis.com/auth/calendar.events.owned"]
STATE_TTL = 600

# Values are argv, never interpolated into AppleScript source. Readiness checks
# return only a boolean, not account handles, contacts, chats or message content.
MESSAGES_READY = '''if application "Messages" is not running then return "unavailable"
tell application "Messages"
    set usableAccounts to every account whose service type is iMessage and enabled is true and connection status is connected
    if (count of usableAccounts) > 0 then return "ready"
end tell
return "unavailable"'''
MESSAGES_SEND = '''on run argv
    set recipientHandle to item 1 of argv
    set invitationText to item 2 of argv
    tell application "Messages"
        set senderAccount to first account whose service type is iMessage and enabled is true and connection status is connected
        set invitationRecipient to participant recipientHandle of senderAccount
        send invitationText to invitationRecipient
    end tell
    return "submitted"
end run'''

# Contacts.sdef exposes person.id/name and phones/emails with value/label.
# Filtering happens inside Contacts. Only the first ten matching people and
# twelve destinations per person have properties read; no notes/vCards/photos.
CONTACTS_SEARCH = '''function run(argv) {
    const query = argv[0];
    const people = Application('Contacts').people.whose({name: {_contains: query}})();
    const contacts = [];
    let truncated = people.length > 10;
    function text(value, max) {
        return typeof value === 'string' && value.length > 0 && value.length <= max ? value : null;
    }
    for (let index = 0; index < Math.min(people.length, 10); index++) {
        const person = people[index];
        const contactId = text(person.id(), 512);
        const name = person.name();
        if (!contactId || typeof name !== 'string' || !name.length) continue;
        const destinations = [];
        const phones = person.phones();
        const emails = person.emails();
        if (phones.length + emails.length > 12) truncated = true;
        const groups = [{kind: 'phone', entries: phones}, {kind: 'email', entries: emails}];
        let inspected = 0;
        for (const group of groups) {
            for (let item = 0; item < group.entries.length && inspected < 12; item++, inspected++) {
                const entry = group.entries[item];
                const value = text(entry.value(), 254);
                const label = entry.label();
                if (value) destinations.push({value: value, kind: group.kind,
                    label: typeof label === 'string' ? label.slice(0, 80) : ''});
            }
        }
        contacts.push({contactId: contactId, displayName: name.slice(0, 200), destinations: destinations});
    }
    return JSON.stringify({contacts: contacts, truncated: truncated});
}'''


def _web_url(value: str, *, allow_path: bool = True) -> bool:
    try:
        parsed = urlsplit(value)
        return bool(parsed.hostname and not parsed.username and not parsed.password and not parsed.fragment and
                    parsed.scheme in ("http", "https") and
                    (parsed.scheme == "https" or parsed.hostname in ("localhost", "127.0.0.1", "::1")) and
                    (allow_path or parsed.path in ("", "/")) and not parsed.query)
    except ValueError:
        return False


@dataclass(frozen=True)
class ConnectorSettings:
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = ""
    encryption_key: str = ""
    frontend_base_url: str = ""
    spacetimedb_uri: str = ""
    spacetimedb_db: str = ""
    shared_secret: str = ""
    messages_enabled: bool = False
    mac_contacts_enabled: bool = False

    @classmethod
    def from_env(cls):
        return cls(os.getenv("GOOGLE_CLIENT_ID", ""), os.getenv("GOOGLE_CLIENT_SECRET", ""),
                   os.getenv("GOOGLE_REDIRECT_URI", ""), os.getenv("HUDDLE_CONNECTOR_ENCRYPTION_KEY", ""),
                   os.getenv("HUDDLE_FRONTEND_BASE_URL", ""), os.getenv("SPACETIMEDB_URI", ""),
                   os.getenv("SPACETIMEDB_DB", ""), os.getenv("HUDDLE_SHARED_SECRET", ""),
                   os.getenv("HUDDLE_MESSAGES_ENABLED", "false").lower() == "true",
                   os.getenv("HUDDLE_MAC_CONTACTS_ENABLED", "false").lower() == "true")


class ConnectorService:
    def __init__(self, settings: ConnectorSettings, *, client: httpx.AsyncClient | None = None,
                 flow_factory: Callable = Flow.from_client_config,
                 process_factory: Callable = asyncio.create_subprocess_exec,
                 host_platform: Callable = platform.system, clock: Callable = time.time):
        self.settings, self.flow_factory = settings, flow_factory
        self.client = client or httpx.AsyncClient(timeout=5, follow_redirects=False)
        self._owns_client = client is None
        self.process_factory, self.host_platform, self.clock = process_factory, host_platform, clock
        self._message_lock = asyncio.Lock()
        self._dispatches: dict[str, tuple[str, str, float]] = {}

    async def aclose(self):
        if self._owns_client:
            await self.client.aclose()

    def _cipher(self) -> Fernet:
        try:
            return Fernet(self.settings.encryption_key.encode())
        except (ValueError, TypeError):
            raise HTTPException(503, "Google Calendar is not configured on this API host.") from None

    def _google_ready(self) -> bool:
        s = self.settings
        if not all((s.google_client_id, s.google_client_secret, s.google_redirect_uri,
                    s.encryption_key, s.frontend_base_url, s.spacetimedb_uri, s.spacetimedb_db, s.shared_secret)):
            return False
        if not (_web_url(s.google_redirect_uri) and _web_url(s.frontend_base_url, allow_path=False) and
                _web_url(s.spacetimedb_uri, allow_path=False)):
            return False
        try:
            self._cipher()
        except HTTPException:
            return False
        return True

    def _require_google(self):
        if not self._google_ready():
            raise HTTPException(503, "Google Calendar setup is incomplete. Configure the OAuth client, callback and encryption key first.")

    def _flow(self, *, verifier: str, state: str | None = None):
        s = self.settings
        return self.flow_factory({"web": {"client_id": s.google_client_id, "client_secret": s.google_client_secret,
            "auth_uri": AUTH_URI, "token_uri": TOKEN_URI, "redirect_uris": [s.google_redirect_uri]}},
            scopes=SCOPES, redirect_uri=s.google_redirect_uri, code_verifier=verifier,
            autogenerate_code_verifier=False, **({"state": state} if state else {}))

    async def _module(self, route: str, body: dict) -> dict:
        s = self.settings
        try:
            response = await self.client.post(f"{s.spacetimedb_uri.rstrip('/')}/v1/database/{quote(s.spacetimedb_db, safe='')}/route/connectors/google/{route}",
                json=body, headers={"X-Huddle-Secret": s.shared_secret}, timeout=5)
            result = response.json() if response.is_success else None
            if not isinstance(result, dict) or result.get("ok") is not True:
                raise ValueError()
            return result
        except (httpx.HTTPError, ValueError, AttributeError):
            raise HTTPException(502, "The private connector callback could not be confirmed. Start the connection again.") from None

    async def google_start(self, body: GoogleStartRequest) -> GoogleStartResponse:
        self._require_google()
        state_id, verifier = secrets.token_urlsafe(32), secrets.token_urlsafe(64)
        expires = self.clock() + STATE_TTL
        state = self._cipher().encrypt_at_time(json.dumps({"kind": "google-state", "version": 1,
            "stateId": state_id, "accountId": body.accountId, "expiresAt": expires,
            "verifier": verifier}, separators=(",", ":")).encode(), current_time=int(self.clock())).decode()
        flow = self._flow(verifier=verifier)
        authorization_url, _ = flow.authorization_url(state=state, access_type="offline", prompt="consent")
        return GoogleStartResponse(authorizationUrl=authorization_url, stateId=state_id, expiresAt=expires * 1000)

    def _open_state(self, state: str | None) -> dict:
        try:
            if not state or len(state) > 8000:
                raise ValueError()
            data = json.loads(self._cipher().decrypt_at_time(state.encode(), ttl=STATE_TTL, current_time=int(self.clock())))
            if not isinstance(data, dict) or data.get("kind") != "google-state" or data.get("version") != 1 or data["expiresAt"] < self.clock():
                raise ValueError()
            GoogleStartRequest(accountId=data["accountId"])
            if not all(isinstance(data.get(key), str) and data[key] for key in ("stateId", "verifier")):
                raise ValueError()
            return data
        except (InvalidToken, ValueError, KeyError, TypeError):
            raise HTTPException(400, "This Google connection link is invalid or expired. Start again from Huddle.") from None

    def _pack_credentials(self, account_id: str, credentials: Credentials) -> str:
        scopes = list(credentials.granted_scopes or credentials.scopes or [])
        return self._cipher().encrypt(json.dumps({"kind": "google-token", "version": 1, "accountId": account_id,
            "token": credentials.token, "refreshToken": credentials.refresh_token, "scopes": scopes,
            "expiry": credentials.expiry.isoformat() if credentials.expiry else None}, separators=(",", ":")).encode()).decode()

    def _unpack_credentials(self, connection: CalendarConnection) -> Credentials:
        self._require_google()
        try:
            data = json.loads(self._cipher().decrypt(connection.tokenCiphertext.get_secret_value().encode()))
            if not isinstance(data, dict) or data.get("kind") != "google-token" or data.get("version") != 1 or data.get("accountId") != connection.accountId:
                raise ValueError()
            if not set(SCOPES[2:]).issubset(data["scopes"]) or not data.get("refreshToken"):
                raise ValueError()
            expiry = datetime.fromisoformat(data["expiry"]) if data.get("expiry") else None
            if expiry and expiry.tzinfo:
                expiry = expiry.astimezone(timezone.utc).replace(tzinfo=None)
            return Credentials(token=data.get("token"), refresh_token=data["refreshToken"], scopes=data["scopes"],
                expiry=expiry, token_uri=TOKEN_URI, client_id=self.settings.google_client_id,
                client_secret=self.settings.google_client_secret)
        except (InvalidToken, ValueError, KeyError, TypeError):
            raise HTTPException(409, "Google Calendar credentials are unavailable or changed. Reconnect this account.") from None

    async def _credentials(self, connection: CalendarConnection) -> tuple[Credentials, UpdatedConnection | None]:
        credentials = self._unpack_credentials(connection)
        if credentials.valid:
            return credentials, None
        def refresh():
            request = GoogleRequest()
            def bounded(url, method="GET", body=None, headers=None, **_kwargs):
                return request(url=url, method=method, body=body, headers=headers, timeout=5)
            credentials.refresh(bounded)
        try:
            await asyncio.wait_for(asyncio.to_thread(refresh), timeout=7)
        except (GoogleAuthError, TimeoutError, ValueError):
            raise HTTPException(409, "Google Calendar authorization expired. Reconnect before checking availability.") from None
        return credentials, UpdatedConnection(accountId=connection.accountId,
                                                tokenCiphertext=self._pack_credentials(connection.accountId, credentials))

    async def google_callback(self, *, code: str | None, state: str | None, error: str | None = None) -> str:
        self._require_google()
        data = self._open_state(state)
        claim = await self._module("claim", {"stateId": data["stateId"], "accountId": data["accountId"]})
        claim_nonce = claim.get("claimNonce")
        if not isinstance(claim_nonce, str) or not claim_nonce:
            raise HTTPException(409, "The Google connection was cancelled or already completed. Start again.")
        complete = {"stateId": data["stateId"], "accountId": data["accountId"], "claimNonce": claim_nonce}
        try:
            if error or not code or len(code) > 8000:
                raise ValueError()
            flow = self._flow(verifier=data["verifier"], state=state)
            await asyncio.wait_for(asyncio.to_thread(flow.fetch_token, code=code, timeout=5), timeout=7)
            credentials = flow.credentials
            scopes = list(credentials.granted_scopes or credentials.scopes or [])
            if not credentials.token or not credentials.refresh_token or not set(SCOPES[2:]).issubset(scopes):
                raise ValueError()
            response = await self.client.get(USERINFO_URI, headers={"Authorization": f"Bearer {credentials.token}"}, timeout=5)
            response.raise_for_status()
            user = response.json()
            if user.get("email_verified") is not True or not isinstance(user.get("email"), str) or len(user["email"]) > 254:
                raise ValueError()
            expiry = credentials.expiry
            if expiry and expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=timezone.utc)
            completion = {**complete, "tokenCiphertext": self._pack_credentials(data["accountId"], credentials),
                "email": user["email"], "scopes": scopes,
                "expiresAt": expiry.timestamp() * 1000 if expiry else 0}
        except Exception:
            # Provider errors can contain tokens/codes. Only a fixed message is
            # persisted, and an old claim cannot overwrite a newer connection.
            await self._module("complete", {**complete, "error": "Google connection was not completed. Please reconnect."})
            return f"{self.settings.frontend_base_url.rstrip('/')}/connectors?google=failed"
        # A callback network error is not evidence that completion failed. Do
        # not overwrite a possibly completed connection with a second callback.
        await self._module("complete", completion)
        return f"{self.settings.frontend_base_url.rstrip('/')}/connectors?google=connected"

    async def revoke(self, body: GoogleRevokeRequest) -> GoogleRevokeResponse:
        credentials = self._unpack_credentials(body)
        try:
            response = await self.client.post("https://oauth2.googleapis.com/revoke",
                data={"token": credentials.refresh_token or credentials.token}, timeout=5)
            if response.status_code != 200 and not (response.status_code == 400 and response.json().get("error") == "invalid_token"):
                raise ValueError()
        except (httpx.HTTPError, ValueError, AttributeError):
            raise HTTPException(502, "Google revocation could not be confirmed. Local access must remain disconnected; retry revocation later.") from None
        return GoogleRevokeResponse(revoked=True)

    async def _busy(self, credentials: Credentials, *, start: str, end: str, time_zone: str) -> list[BusyInterval]:
        try:
            response = await self.client.post(f"{CALENDAR_URI}/freeBusy", headers={"Authorization": f"Bearer {credentials.token}"},
                json={"timeMin": start, "timeMax": end, "timeZone": time_zone, "items": [{"id": "primary"}]}, timeout=5)
            response.raise_for_status()
            data = response.json()
            calendars = data.get("calendars")
            if data.get("errors") or not isinstance(calendars, dict) or len(calendars) != 1:
                raise ValueError()
            calendar = next(iter(calendars.values()))
            if calendar.get("errors") or not isinstance(calendar.get("busy"), list):
                raise ValueError()
            intervals = [BusyInterval.model_validate(item) for item in calendar["busy"]]
            return [interval for interval in intervals if instant(interval.start) < instant(end) and instant(start) < instant(interval.end)]
        except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError):
            raise HTTPException(502, "Calendar availability is unavailable. No missing response is being treated as free time.") from None

    async def availability(self, body: CalendarAvailabilityRequest) -> CalendarAvailabilityResponse:
        self._require_google()
        semaphore = asyncio.Semaphore(4)
        async def one(connection):
            async with semaphore:
                credentials, updated = await self._credentials(connection)
                busy = await self._busy(credentials, start=body.timeMin, end=body.timeMax, time_zone=body.timeZone)
                return AccountAvailability(accountId=connection.accountId, busy=busy), updated
        try:
            results = await asyncio.wait_for(asyncio.gather(*(one(connection) for connection in body.connections)), timeout=16)
        except TimeoutError:
            raise HTTPException(504, "Calendar availability timed out. No missing response is being treated as free time.") from None
        return CalendarAvailabilityResponse(availability=[result[0] for result in results],
            updatedConnections=[result[1] for result in results if result[1] is not None])

    @staticmethod
    def event_id(meeting_id: str, account_id: str) -> str:
        return "huddle" + hashlib.sha256(f"{meeting_id}:{account_id}".encode()).hexdigest()

    async def create_events(self, body: CalendarEventsRequest) -> CalendarEventsResponse:
        self._require_google()
        semaphore = asyncio.Semaphore(4)
        async def one(connection):
            updated = None
            try:
                async with semaphore:
                    credentials, updated = await self._credentials(connection)
                    event_id = self.event_id(body.meetingId, connection.accountId)
                    url = f"{CALENDAR_URI}/calendars/primary/events"
                    headers = {"Authorization": f"Bearer {credentials.token}"}
                    expected = {"huddleMeetingId": body.meetingId, "huddleAccountId": connection.accountId}
                    async def existing():
                        response = await self.client.get(f"{url}/{event_id}", headers=headers, timeout=5)
                        if response.status_code == 404:
                            return None
                        response.raise_for_status()
                        event = response.json()
                        if event.get("status") == "cancelled" or event.get("extendedProperties", {}).get("private") != expected or \
                           event.get("summary") != body.summary or event.get("location", "") != body.location or \
                           instant(event.get("start", {}).get("dateTime", "")) != instant(body.start) or \
                           instant(event.get("end", {}).get("dateTime", "")) != instant(body.end):
                            raise HTTPException(409, "The existing event has changed. Review it before creating another meetup.")
                        return event
                    event = await existing()
                    was_existing = event is not None
                    if event is None:
                        if await self._busy(credentials, start=body.start, end=body.end, time_zone=body.timeZone):
                            raise HTTPException(409, "The calendar is busy at this time. Choose a fresh shared time.")
                        response = await self.client.post(url, headers=headers, params={"sendUpdates": "none"}, timeout=5,
                            json={"id": event_id, "summary": body.summary, "location": body.location,
                                  "start": {"dateTime": body.start, "timeZone": body.timeZone},
                                  "end": {"dateTime": body.end, "timeZone": body.timeZone},
                                  "extendedProperties": {"private": expected}})
                        if response.status_code == 409:
                            event, was_existing = await existing(), True
                            if event is None:
                                raise ValueError()
                        else:
                            response.raise_for_status()
                            event = response.json()
                    if event.get("id") != event_id:
                        raise ValueError()
                    link = event.get("htmlLink")
                    if link and not (urlsplit(link).scheme == "https" and urlsplit(link).hostname in ("calendar.google.com", "www.google.com")):
                        link = None
                    return CalendarEventResult(accountId=connection.accountId, eventId=event_id, htmlLink=link,
                                               alreadyExisted=was_existing), None, updated
            except (HTTPException, httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError) as error:
                message = error.detail if isinstance(error, HTTPException) else "Calendar write was not confirmed. Retry the same meetup to recover its existing event safely."
                return None, CalendarEventFailure(accountId=connection.accountId, message=message), updated
        tasks = [asyncio.create_task(one(connection)) for connection in body.connections]
        _done, pending = await asyncio.wait(tasks, timeout=16)
        for task in pending:
            task.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)
        results = [(None, CalendarEventFailure(accountId=connection.accountId,
                    message="Calendar write outcome is not confirmed. Retry the same meetup to recover its existing event safely."), None)
                   if task in pending else task.result() for connection, task in zip(body.connections, tasks)]
        return CalendarEventsResponse(created=[result[0] for result in results if result[0]],
            failed=[result[1] for result in results if result[1]], updatedConnections=[result[2] for result in results if result[2]])

    async def _osascript(self, script: str, *args: str, timeout=5) -> str:
        process = await self.process_factory("/usr/bin/osascript", "-e", script, "--", *args,
                                            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        try:
            stdout, _stderr = await asyncio.wait_for(process.communicate(), timeout=timeout)
        except (TimeoutError, asyncio.CancelledError):
            if process.returncode is None:
                process.kill()
            await process.communicate()
            raise
        if process.returncode:
            raise RuntimeError("Messages automation did not complete")
        return stdout.decode().strip()

    async def _messages_ready(self) -> bool:
        if not self.settings.messages_enabled or self.host_platform() != "Darwin":
            return False
        try:
            return await self._osascript(MESSAGES_READY, timeout=3) == "ready"
        except (OSError, RuntimeError, TimeoutError):
            return False

    async def status(self) -> ConnectorStatus:
        google = self._google_ready()
        messages = await self._messages_ready()
        return ConnectorStatus(googleConfigured=google, messagesConfigured=messages,
            googleStatus="configured; each account must connect" if google else "setup required",
            messagesStatus="host Mac ready; recipient opt-in required" if messages else "unavailable or disabled on API host")

    async def send_message(self, body: MessageSendRequest) -> MessageSendResponse:
        if not await self._messages_ready():
            return MessageSendResponse(dispatchId=body.dispatchId, status="unavailable", detail="Host Messages is disabled, signed out or unavailable. The in-app invitation remains available.")
        digest = hashlib.sha256((body.recipient + "\0" + body.message).encode()).hexdigest()
        async with self._message_lock:
            self._dispatches = {key: value for key, value in self._dispatches.items() if value[2] > self.clock() - 86400}
            previous = self._dispatches.get(body.dispatchId)
            if previous:
                if previous[0] != digest or previous[1] != "submitted":
                    raise HTTPException(409, "This invitation dispatch was already attempted. Its outcome must be reviewed; it will not be retried automatically.")
                return MessageSendResponse(dispatchId=body.dispatchId, status="submitted", detail="Already submitted to Messages; delivery is not confirmed.")
            self._dispatches[body.dispatchId] = (digest, "attempted", self.clock())
        try:
            if await self._osascript(MESSAGES_SEND, body.recipient, body.message, timeout=6) != "submitted":
                raise RuntimeError()
        except (OSError, RuntimeError, TimeoutError):
            raise HTTPException(502, "Messages submission outcome is unknown. Do not automatically retry this dispatch; use the existing in-app invitation.") from None
        async with self._message_lock:
            self._dispatches[body.dispatchId] = (digest, "submitted", self.clock())
        return MessageSendResponse(dispatchId=body.dispatchId, status="submitted", detail="Submitted to the host Mac's Messages app. Delivery is not confirmed.")

    @staticmethod
    def _contact_destination(destination: MacContactDestination) -> MacContactDestination | None:
        value = destination.value.strip()
        if destination.kind == "phone":
            if not re.fullmatch(r"[+0-9()\s.\-]+", value):
                return None
            digits = re.sub(r"[^0-9]", "", value)
            if value.startswith("+") and value.count("+") == 1:
                value = "+" + digits
            elif "+" not in value and len(digits) == 10:
                value = "+1" + digits
            elif "+" not in value and len(digits) == 11 and digits.startswith("1"):
                value = "+" + digits
            else:
                return None
            if not re.fullmatch(r"\+[1-9][0-9]{7,14}", value):
                return None
        else:
            try:
                MessageSendRequest.recipient_handle(value)
            except ValueError:
                return None
            if "@" not in value:
                return None
        label = re.sub(r"^_\$!<(.*?)>!\$_$", r"\1", destination.label).strip()
        return MacContactDestination(value=value, label=label or destination.kind, kind=destination.kind)

    async def search_contacts(self, body: MacContactsSearchRequest) -> MacContactsSearchResponse:
        if not self.settings.mac_contacts_enabled:
            raise HTTPException(503, "Mac Contacts lookup is disabled. Enable HUDDLE_MAC_CONTACTS_ENABLED on the authorized Mac API host first.")
        if self.host_platform() != "Darwin":
            raise HTTPException(503, "Mac Contacts lookup requires the authorized Mac API host.")
        process = None
        try:
            process = await self.process_factory("/usr/bin/osascript", "-l", "JavaScript", "-e", CONTACTS_SEARCH,
                "--", body.query, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
            try:
                stdout, _stderr = await asyncio.wait_for(process.communicate(), timeout=6)
            except (TimeoutError, asyncio.CancelledError):
                if process.returncode is None:
                    process.kill()
                await process.communicate()
                raise
            if process.returncode or len(stdout) > 65536:
                raise ValueError()
            raw = MacContactsSearchResponse.model_validate_json(stdout)
            contacts = []
            for contact in raw.contacts:
                if body.query.casefold() not in contact.displayName.casefold():
                    continue
                destinations, seen = [], set()
                for candidate in contact.destinations:
                    destination = self._contact_destination(candidate)
                    if destination and (destination.kind, destination.value.casefold()) not in seen:
                        destinations.append(destination)
                        seen.add((destination.kind, destination.value.casefold()))
                if destinations:
                    contacts.append(MacContact(contactId=contact.contactId, displayName=contact.displayName.strip(), destinations=destinations))
            return MacContactsSearchResponse(contacts=contacts, truncated=raw.truncated)
        except (OSError, RuntimeError, TimeoutError, ValueError, UnicodeError):
            # Provider stderr may include personal data. Never return or log it.
            raise HTTPException(503, "Mac Contacts search is unavailable. On the API host Mac, open Contacts and allow Contacts/Automation access for the API's terminal in System Settings, then retry.") from None
