"""Internal adapter seam; this is NOT an agreed SpacetimeDB wire contract."""

from typing import Protocol

from .models import CouncilMessage


class CouncilDelivery(Protocol):
    async def deliver(self, message: CouncilMessage) -> None: ...


class LocalCouncilDelivery:
    """Request-local collector. No networking, logs, persistence, or cross-run state."""

    def __init__(self):
        self.messages: list[CouncilMessage] = []

    async def deliver(self, message: CouncilMessage) -> None:
        self.messages.append(message.model_copy(deep=True))
