"""Service-only connector contracts. Tokens and busy intervals are never public views."""
from datetime import datetime, timedelta
import re
from typing import Annotated, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, SecretStr, field_validator, model_validator

from .models import Identifier, Model


Time = Annotated[str, Field(min_length=20, max_length=40)]


def instant(value: str) -> datetime:
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})", value):
        raise ValueError("Use an RFC3339 timestamp with a timezone offset")
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def zone(value: str) -> str:
    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError):
        raise ValueError("Use a valid IANA timezone") from None
    return value


class ConnectorStatus(Model):
    googleConfigured: bool
    messagesConfigured: bool
    googleStatus: str
    messagesStatus: str
    googleCallbackUrl: str | None = None


class GoogleStartRequest(Model):
    accountId: Identifier


class GoogleStartResponse(Model):
    authorizationUrl: str
    stateId: Identifier
    expiresAt: float  # epoch milliseconds, matching Maincloud's private state row


class CalendarConnection(Model):
    accountId: Identifier
    tokenCiphertext: SecretStr = Field(min_length=1, max_length=24000)


class UpdatedConnection(Model):
    accountId: Identifier
    tokenCiphertext: str


class GoogleRevokeRequest(CalendarConnection):
    pass


class GoogleRevokeResponse(Model):
    revoked: bool


class BusyInterval(Model):
    start: Time
    end: Time

    @model_validator(mode="after")
    def ordered(self):
        if instant(self.start) >= instant(self.end):
            raise ValueError("Interval end must follow start")
        return self


class CalendarAvailabilityRequest(Model):
    connections: Annotated[list[CalendarConnection], Field(min_length=1, max_length=12)]
    timeMin: Time
    timeMax: Time
    timeZone: Annotated[str, Field(min_length=1, max_length=100)]

    @field_validator("timeZone")
    @classmethod
    def timezone(cls, value):
        return zone(value)

    @model_validator(mode="after")
    def ordered_unique(self):
        if not timedelta(0) < instant(self.timeMax) - instant(self.timeMin) <= timedelta(days=31):
            raise ValueError("Availability window must be positive and at most 31 days")
        if len({connection.accountId for connection in self.connections}) != len(self.connections):
            raise ValueError("Duplicate calendar accounts")
        return self


class AccountAvailability(Model):
    accountId: Identifier
    busy: list[BusyInterval]


class CalendarAvailabilityResponse(Model):
    availability: list[AccountAvailability]
    updatedConnections: list[UpdatedConnection]


class CalendarEventsRequest(Model):
    meetingId: Identifier
    connections: Annotated[list[CalendarConnection], Field(min_length=1, max_length=12)]
    summary: Annotated[str, Field(min_length=1, max_length=200)]
    location: Annotated[str, Field(max_length=500)] = ""
    start: Time
    end: Time
    timeZone: Annotated[str, Field(min_length=1, max_length=100)]

    @field_validator("timeZone")
    @classmethod
    def timezone(cls, value):
        return zone(value)

    @model_validator(mode="after")
    def ordered_unique(self):
        if not timedelta(0) < instant(self.end) - instant(self.start) <= timedelta(days=1):
            raise ValueError("Meetup must have a positive duration of at most one day")
        if len({connection.accountId for connection in self.connections}) != len(self.connections):
            raise ValueError("Duplicate calendar accounts")
        return self


class CalendarEventResult(Model):
    accountId: Identifier
    eventId: str
    htmlLink: str | None = None
    alreadyExisted: bool


class CalendarEventsResponse(Model):
    created: list[CalendarEventResult]
    failed: list["CalendarEventFailure"]
    updatedConnections: list[UpdatedConnection]


class CalendarEventFailure(Model):
    accountId: Identifier
    message: str


class MessageSendRequest(Model):
    dispatchId: Identifier
    recipient: Annotated[str, Field(min_length=3, max_length=254)]
    message: Annotated[str, Field(min_length=1, max_length=1600)]

    @field_validator("recipient")
    @classmethod
    def recipient_handle(cls, value):
        value = value.strip()
        if not (re.fullmatch(r"\+[1-9]\d{7,14}", value) or
                re.fullmatch(r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}", value)):
            raise ValueError("Use an international phone number or Apple ID email")
        return value


class MessageSendResponse(Model):
    dispatchId: Identifier
    status: Literal["submitted", "unavailable"]
    detail: str


class MacContactsSearchRequest(Model):
    query: Annotated[str, Field(min_length=2, max_length=80)]

    @field_validator("query")
    @classmethod
    def useful_query(cls, value):
        value = value.strip()
        if len(value) < 2 or any(ord(character) < 32 for character in value):
            raise ValueError("Search by at least two characters of a contact's name")
        return value


class MacContactDestination(Model):
    value: Annotated[str, Field(min_length=1, max_length=254)]
    label: Annotated[str, Field(max_length=80)]
    kind: Literal["phone", "email"]


class MacContact(Model):
    contactId: Annotated[str, Field(min_length=1, max_length=512)]
    displayName: Annotated[str, Field(min_length=1, max_length=200)]
    destinations: Annotated[list[MacContactDestination], Field(max_length=12)]


class MacContactsSearchResponse(Model):
    contacts: Annotated[list[MacContact], Field(max_length=10)]
    truncated: bool

    @model_validator(mode="after")
    def unique_contacts(self):
        if len({contact.contactId for contact in self.contacts}) != len(self.contacts):
            raise ValueError("Duplicate Contacts identifiers")
        return self
