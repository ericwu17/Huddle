"""The only place that talks to a model (build-brief C10 `llm_call`).

Structured output against a JSON schema, a hard per-call timeout, one retry when
the reply fails validation. Callers get a dict or an LLMError, never raw text.
"""

import asyncio
import json
import logging
import os
from typing import Callable

import anthropic

log = logging.getLogger("huddle.llm")


def fast() -> str:
    """CLAUDE_MODEL_FAST, read per call: api/.env is loaded after import."""
    return os.getenv("CLAUDE_MODEL_FAST", "claude-haiku-5-5")


def smart() -> str:
    return os.getenv("CLAUDE_MODEL_SMART", "claude-sonnet-5-5")


class LLMError(RuntimeError):
    pass


class LLM:
    """Async Claude client. `available` is False without credentials; callers fall back."""

    def __init__(self, client: anthropic.AsyncAnthropic | None = None):
        if client is None and os.getenv("ANTHROPIC_API_KEY"):
            client = anthropic.AsyncAnthropic(max_retries=0)  # retries are ours, inside the timeout
        self.client = client

    @property
    def available(self) -> bool:
        return self.client is not None

    async def call(self, role: str, system: str, user: str, schema: dict, model: str,
                   timeout: float, check: Callable[[dict], object] | None = None,
                   max_tokens: int = 1024) -> dict:
        """Return the parsed JSON reply. `check` raises to reject a reply (one retry)."""
        if not self.available:
            raise LLMError(f"{role}: no ANTHROPIC_API_KEY")
        loop = asyncio.get_running_loop()
        deadline = loop.time() + timeout
        last = "no attempt"
        for attempt in (1, 2):
            remaining = deadline - loop.time()
            if remaining <= 0.5:
                break
            try:
                response = await asyncio.wait_for(self.client.messages.create(
                    model=model, max_tokens=max_tokens, system=system,
                    messages=[{"role": "user", "content": user}],
                    output_config={"effort": "low", "format": {"type": "json_schema", "schema": schema}},
                    timeout=remaining,
                ), timeout=remaining)
                if response.stop_reason != "end_turn":
                    raise LLMError(f"stop_reason {response.stop_reason}")
                text = next(b.text for b in response.content if b.type == "text")
                data = json.loads(text)
                if check:
                    check(data)
                return data
            except (asyncio.TimeoutError, anthropic.APITimeoutError):
                last = "timeout"
                break  # the time is gone; a retry cannot finish either
            except anthropic.APIStatusError as e:
                last = f"HTTP {e.status_code}"
                if e.status_code < 500 and e.status_code != 429:
                    break
            except anthropic.APIConnectionError:
                last = "connection error"
            except (LLMError, ValueError, StopIteration) as e:
                last = f"invalid reply: {e}"[:200]
            log.info("%s attempt %d failed: %s", role, attempt, last)
        raise LLMError(f"{role}: {last}")
