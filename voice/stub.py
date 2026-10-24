"""Fake call sequences for STUB_MODE (S5.4). Port of fakeCallEvents in server/src/lib/fakes.ts."""

import asyncio
import time
from typing import Awaitable, Callable

SCENARIOS = ("confirm", "full")

# D4 disclosure. Says 客人 ("the guest"), not nameOnReservation, to match the module's
# fake: transcripts are visible to the whole group.
DISCLOSURE = "您好，我是AI助理，代表客人预订座位。通话可能会被转录。"


def _say(text: str, speaker: str) -> dict:
    return {"type": "transcript", "text": text, "speaker": speaker, "lang": "zh"}


def stub_events(scenario: str) -> list[dict]:
    base = [{"type": "dialing"}, {"type": "connected"}, _say(DISCLOSURE, "agent")]
    if scenario == "full":
        return base + [
            _say("不好意思，今晚已经订满了。", "restaurant"),
            {"type": "failed", "reason": "full", "text": "Restaurant said it is fully booked."},
            {"type": "ended"},
        ]
    return base + [
        _say("七点已经满了，七点四十五可以吗？", "restaurant"),
        {"type": "slot_offered", "slot": "19:45"},
        _say("可以，七点四十五，谢谢。", "agent"),
        {"type": "confirmed", "slot": "19:45"},
        {"type": "ended"},
    ]


class StopCall(Exception):
    """The module rejected an event (4xx); later events would fail the same way."""


async def play(booking_id: str, events: list[dict], post: Callable[[dict], Awaitable[None]],
               step_s: float = 1.2) -> None:
    for i, e in enumerate(events):
        if i:
            await asyncio.sleep(step_s)
        try:
            await post({"bookingId": booking_id, "text": None, "slot": None, **e,
                        "ts": int(time.time() * 1000)})
        except StopCall:
            return
