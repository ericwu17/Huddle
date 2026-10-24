"""Council message delivery. Response ingestion is the contract; streaming is optional.

The module stores the transcript from the /council response (deduplicated by run,
round, speaker and member), so a lost or skipped callback never loses a message.
"""

import logging
from typing import Protocol

import httpx

from .models import CouncilMessage

log = logging.getLogger("huddle.delivery")


class CouncilDelivery(Protocol):
    async def deliver(self, message: CouncilMessage) -> None: ...


class LocalCouncilDelivery:
    """Request-local collector. No networking, logs, persistence, or cross-run state."""

    def __init__(self):
        self.messages: list[CouncilMessage] = []

    async def deliver(self, message: CouncilMessage) -> None:
        self.messages.append(message.model_copy(deep=True))


class HttpCouncilDelivery:
    """S5.3 rule 7: POST each validated message to the module as it is produced.

    Failures are logged and ignored; the response transcript is the source of truth.
    """

    def __init__(self, uri: str, database: str, secret: str, timeout: float = 3.0, transport=None):
        self.url = f"{uri.rstrip('/')}/v1/database/{database}/route/council-message"
        self.secret, self.timeout, self.transport = secret, timeout, transport

    async def deliver(self, message: CouncilMessage) -> None:
        try:
            async with httpx.AsyncClient(timeout=self.timeout, transport=self.transport) as client:
                response = await client.post(self.url, json=message.model_dump(),
                                             headers={"X-Huddle-Secret": self.secret})
            if response.status_code != 200:
                log.info("council-message callback: HTTP %s", response.status_code)
        except httpx.HTTPError as e:
            log.info("council-message callback failed: %s", type(e).__name__)
