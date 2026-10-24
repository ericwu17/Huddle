"""Voice service, stub phase (S5.4). Run from repo root: uvicorn voice.main:app --port 8001."""

from contextlib import asynccontextmanager
from dataclasses import dataclass
import hmac
import logging
import os
from pathlib import Path
from typing import Annotated, Awaitable, Callable

from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Request
import httpx
from pydantic import BaseModel, Field

from .stub import SCENARIOS, StopCall, play, stub_events

log = logging.getLogger("uvicorn.error")
Poster = Callable[[dict], Awaitable[None]]


@dataclass(frozen=True)
class Settings:
    secret: str
    stub_mode: bool = True
    scenario: str = "confirm"
    spacetimedb_uri: str = "https://maincloud.spacetimedb.com"
    spacetimedb_db: str = "huddle-calhacks"
    step_ms: int = 1200

    @classmethod
    def from_env(cls, env_file: Path | None = None):
        # Exported values take precedence over the private local file.
        # Avoid interpolation so secrets containing ${...} remain literal.
        load_dotenv(env_file or Path(__file__).parent / ".env", override=False, interpolate=False)
        return cls(
            secret=os.getenv("HUDDLE_SHARED_SECRET", ""),
            stub_mode=os.getenv("STUB_MODE", "true").lower() == "true",
            scenario=os.getenv("STUB_SCENARIO", "confirm").lower(),
            spacetimedb_uri=os.getenv("SPACETIMEDB_URI", cls.spacetimedb_uri),
            spacetimedb_db=os.getenv("SPACETIMEDB_DB", cls.spacetimedb_db),
            step_ms=int(os.getenv("STUB_STEP_MS", "1200")),
        )

    @property
    def call_event_url(self) -> str:
        return f"{self.spacetimedb_uri.rstrip('/')}/v1/database/{self.spacetimedb_db}/route/call-event"


class AlternativeWindow(BaseModel):
    earliest: str
    latest: str


class BookRequest(BaseModel):
    bookingId: str = Field(min_length=1)
    placeId: str
    restaurantName: str
    restaurantPhone: str
    partySize: int = Field(gt=0)
    time: str
    nameOnReservation: str
    alternativeWindow: AlternativeWindow
    language: str = "zh"


class BookResponse(BaseModel):
    accepted: bool
    bookingId: str


def http_poster(settings: Settings, client: httpx.AsyncClient) -> Poster:
    async def post(event: dict) -> None:
        try:
            res = await client.post(settings.call_event_url, json=event,
                                    headers={"X-Huddle-Secret": settings.secret}, timeout=10)
        except httpx.HTTPError as err:
            log.warning("call-event %s %s: %s", event["bookingId"], event["type"], err)
            return
        log.info("call-event %s %s -> %s", event["bookingId"], event["type"], res.status_code)
        if 400 <= res.status_code < 500:
            log.warning("call-event rejected, stopping this call: %s", res.text[:200])
            raise StopCall
    return post


def create_app(settings: Settings | None = None, poster: Poster | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app):
        config = settings if settings is not None else Settings.from_env()
        if not config.secret or not config.secret.strip():
            raise RuntimeError("HUDDLE_SHARED_SECRET must be set and nonblank")
        if not config.stub_mode:
            raise RuntimeError("STUB_MODE=false is unavailable: real calls are not implemented yet")
        if config.scenario not in SCENARIOS:
            raise RuntimeError(f"STUB_SCENARIO must be one of {SCENARIOS}")
        app.state.settings = config
        async with httpx.AsyncClient() as client:
            app.state.post = poster or http_poster(config, client)
            log.info("voice stub: scenario=%s, posting to %s", config.scenario, config.call_event_url)
            yield

    async def authorize(request: Request,
                        secret: Annotated[str | None, Header(alias="X-Huddle-Secret")] = None):
        # Compare UTF-8 bytes so malformed non-ASCII credentials fail as 401, not 500.
        if secret is None or not hmac.compare_digest(secret.encode(), request.app.state.settings.secret.encode()):
            raise HTTPException(status_code=401, detail="Missing or invalid X-Huddle-Secret")

    app = FastAPI(title="Huddle voice stub", version="0.1.0", lifespan=lifespan,
                  dependencies=[Depends(authorize)], docs_url=None, redoc_url=None,
                  openapi_url=None)

    @app.middleware("http")
    async def disclose(request, call_next):
        # Never X-Huddle-Stub here: the module would then replay its own fake call on top of ours.
        response = await call_next(request)
        response.headers["X-Huddle-Notice"] = "Voice stub: scripted call events, no phone call placed"
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/health")
    async def health(request: Request):
        return {"ok": True, "stub": True, "scenario": request.app.state.settings.scenario}

    @app.post("/book", response_model=BookResponse)
    async def book(body: BookRequest, request: Request, tasks: BackgroundTasks):
        # Reply now and post events afterwards: the module's /book call times out at 20 s.
        config = request.app.state.settings
        tasks.add_task(play, body.bookingId, stub_events(config.scenario), request.app.state.post,
                       config.step_ms / 1000)
        return BookResponse(accepted=True, bookingId=body.bookingId)

    return app


app = create_app()
