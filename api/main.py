"""Huddle FastAPI service. Run from repo root: uvicorn api.main:app.

STUB_MODE=true (default) serves the phase-zero synthetic fixtures in stubs.py.
STUB_MODE=false serves the real solver, learning, parser and council over data/places.json.
"""

import asyncio
from contextlib import asynccontextmanager
from dataclasses import dataclass
import hmac
import os
from pathlib import Path
from typing import Annotated, Callable

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import TypeAdapter
from dotenv import load_dotenv

from . import council, elicit, parse, solver, stubs
from .catalog import Catalog
from .delivery import CouncilDelivery, HttpCouncilDelivery, LocalCouncilDelivery
from .llm import LLM
from .models import (
    CouncilRequest, CouncilResponse, HealthResponse, NextRequest, NextResponse,
    OffersRequest, OffersResponse, ParseRequest, ParseResponse, Place, PlanRequest,
    PlanResponse, RouletteRequest, RouletteResponse, UpdateRequest, UpdateResponse,
)


REAL_PLACES = Path(__file__).resolve().parents[1] / "data" / "places.json"
REAL_NOTICE = "Place aspects are default values until review data lands"


@dataclass(frozen=True)
class Settings:
    secret: str
    stub_mode: bool = True
    places_path: Path | None = None
    spacetimedb_uri: str | None = None  # optional live council-message callbacks
    spacetimedb_db: str | None = None

    @classmethod
    def from_env(cls, env_file: Path | None = None):
        # Exported deployment values take precedence over the private local file.
        # Avoid interpolation so secrets containing ${...} remain literal.
        load_dotenv(env_file or Path(__file__).parent / ".env", override=False, interpolate=False)
        mode = os.getenv("STUB_MODE", "true").lower()
        if mode not in ("true", "false"):
            raise RuntimeError("STUB_MODE must be true or false")
        path = os.getenv("PLACES_PATH")
        return cls(os.getenv("HUDDLE_SHARED_SECRET", ""), mode == "true", Path(path) if path else None,
                   os.getenv("SPACETIMEDB_URI") or None, os.getenv("SPACETIMEDB_DB") or None)


def create_app(settings: Settings | None = None,
               delivery_factory: Callable[[], CouncilDelivery] | None = None,
               llm: LLM | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app):
        config = settings if settings is not None else Settings.from_env()
        if not config.secret or not config.secret.strip():
            raise RuntimeError("HUDDLE_SHARED_SECRET must be set and nonblank")
        # Stub mode loads only explicitly synthetic places; real mode only real ones.
        default = Path(__file__).parent / "fixtures" / "places.fake.json" if config.stub_mode else REAL_PLACES
        path = config.places_path or default
        places = TypeAdapter(list[Place]).validate_json(path.read_text())
        if not places or len({p.id for p in places}) != len(places):
            raise RuntimeError("Places must be nonempty with unique IDs")
        synthetic = ["synthetic_stub" in p.sources for p in places]
        if config.stub_mode and not all(synthetic):
            raise RuntimeError("Phase-zero STUB_MODE accepts synthetic_stub places only")
        if not config.stub_mode and any(synthetic):
            raise RuntimeError("STUB_MODE=false refuses synthetic_stub places; use data/places.json")
        app.state.settings = config
        app.state.places = places
        app.state.catalog = None if config.stub_mode else Catalog(places)
        app.state.llm = llm or LLM()
        if delivery_factory is not None:
            app.state.delivery = delivery_factory
        elif not config.stub_mode and config.spacetimedb_uri and config.spacetimedb_db:
            app.state.delivery = lambda: HttpCouncilDelivery(
                config.spacetimedb_uri, config.spacetimedb_db, config.secret)
        else:
            app.state.delivery = LocalCouncilDelivery
        yield

    async def authorize(request: Request,
                        secret: Annotated[str | None, Header(alias="X-Huddle-Secret")] = None):
        # Compare UTF-8 bytes so malformed non-ASCII credentials fail as 401, not 500.
        if secret is None or not hmac.compare_digest(secret.encode(), request.app.state.settings.secret.encode()):
            raise HTTPException(status_code=401, detail="Missing or invalid X-Huddle-Secret")

    app = FastAPI(title="Huddle API", version="0.2.0", lifespan=lifespan,
                  dependencies=[Depends(authorize)], docs_url=None, redoc_url=None,
                  openapi_url=None)

    @app.middleware("http")
    async def disclose(request, call_next):
        response = await call_next(request)
        state = request.app.state
        if getattr(state, "settings", None) is None or state.settings.stub_mode:
            # The module reads this header as the run's stub flag (S5.3 rule 7).
            response.headers["X-Huddle-Stub"] = "true"
            response.headers["X-Huddle-Notice"] = "Synthetic fixtures only; no learning, offers, or live council"
        elif state.catalog.default_aspects:
            response.headers["X-Huddle-Notice"] = REAL_NOTICE
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request, exc):
        # Pydantic normally echoes rejected input. Never echo private bodies/headers.
        return JSONResponse(status_code=422, content={"detail": [
            {"loc": list(error["loc"]), "type": error["type"], "msg": error["msg"]}
            for error in exc.errors()
        ]})

    @app.exception_handler(stubs.StubInputError)
    @app.exception_handler(elicit.ElicitError)
    async def unsupported(request, exc):
        return JSONResponse(status_code=exc.status, content={"detail": str(exc)})

    def real(request: Request) -> bool:
        return not request.app.state.settings.stub_mode

    @app.get("/health", response_model=HealthResponse)
    async def health(request: Request):
        return HealthResponse(ok=True, stub=not real(request), placesLoaded=len(request.app.state.places))

    @app.get("/openapi.json", include_in_schema=False)
    async def openapi():
        return JSONResponse(app.openapi())

    @app.post("/parse-prefs", response_model=ParseResponse)
    async def parse_prefs(body: ParseRequest, request: Request):
        if real(request):
            return await parse.parse_prefs(request.app.state.llm, body)
        return stubs.parse_prefs(body)

    @app.post("/elicit/next", response_model=NextResponse)
    async def next_pair(body: NextRequest, request: Request):
        if real(request):
            return elicit.next_pair(request.app.state.catalog, body)
        return stubs.next_pair(body, request.app.state.places)

    @app.post("/elicit/update", response_model=UpdateResponse)
    async def update(body: UpdateRequest, request: Request):
        if real(request):
            return elicit.update(request.app.state.catalog, body)
        return stubs.update(body, request.app.state.places)

    @app.post("/plan", response_model=PlanResponse)
    async def plan(body: PlanRequest, request: Request):
        if real(request):
            # CPU-bound Monte Carlo: keep the event loop free for other requests.
            return await asyncio.to_thread(solver.plan, request.app.state.catalog, body)
        return stubs.plan(body, request.app.state.places)

    @app.post("/offers", response_model=OffersResponse)
    async def offers(body: OffersRequest, request: Request):
        if real(request):
            return await asyncio.to_thread(solver.offers, request.app.state.catalog, body)
        # Baseline is accepted as an opaque caller-owned ID; this stub makes no trades.
        return stubs.offers()

    @app.post("/roulette", response_model=RouletteResponse)
    async def roulette(body: RouletteRequest):
        # Already the real C9 draw in both modes: weights proportional to robustness squared.
        return stubs.roulette(body)

    @app.post("/council", response_model=CouncilResponse)
    async def council_(body: CouncilRequest, request: Request):
        delivery = request.app.state.delivery()  # Fresh for each call, no global transcript.
        if real(request):
            return await council.run_council(request.app.state.llm, body, delivery)
        result = stubs.council(body)
        for message in result.messages:
            await delivery.deliver(message)
        return result

    return app


app = create_app()
