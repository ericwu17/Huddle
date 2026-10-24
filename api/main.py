"""Local phase-zero FastAPI app. Run from repo root: uvicorn api.main:app."""

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

from . import stubs
from .delivery import CouncilDelivery, LocalCouncilDelivery
from .models import (
    CouncilRequest, CouncilResponse, HealthResponse, NextRequest, NextResponse,
    OffersRequest, OffersResponse, ParseRequest, ParseResponse, Place, PlanRequest,
    PlanResponse, RouletteRequest, RouletteResponse, UpdateRequest, UpdateResponse,
)


@dataclass(frozen=True)
class Settings:
    secret: str
    stub_mode: bool = True
    places_path: Path | None = None

    @classmethod
    def from_env(cls):
        mode = os.getenv("STUB_MODE", "true").lower()
        if mode not in ("true", "false"):
            raise RuntimeError("STUB_MODE must be true or false")
        path = os.getenv("PLACES_PATH")
        return cls(os.getenv("HUDDLE_SHARED_SECRET", ""), mode == "true", Path(path) if path else None)


def create_app(settings: Settings | None = None,
               delivery_factory: Callable[[], CouncilDelivery] = LocalCouncilDelivery) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app):
        config = settings if settings is not None else Settings.from_env()
        if not config.secret or not config.secret.strip():
            raise RuntimeError("HUDDLE_SHARED_SECRET must be set and nonblank")
        if not config.stub_mode:
            raise RuntimeError("STUB_MODE=false is unavailable: phase zero contains no real solver")
        # Stub mode always loads only explicitly synthetic places. No teammate data needed.
        path = config.places_path or Path(__file__).parent / "fixtures" / "places.fake.json"
        places = TypeAdapter(list[Place]).validate_json(path.read_text())
        if not places or len({p.id for p in places}) != len(places):
            raise RuntimeError("Places must be nonempty with unique IDs")
        if any("synthetic_stub" not in p.sources for p in places):
            raise RuntimeError("Phase-zero STUB_MODE accepts synthetic_stub places only")
        app.state.settings = config
        app.state.places = places
        yield

    async def authorize(request: Request,
                        secret: Annotated[str | None, Header(alias="X-Huddle-Secret")] = None):
        # Compare UTF-8 bytes so malformed non-ASCII credentials fail as 401, not 500.
        if secret is None or not hmac.compare_digest(secret.encode(), request.app.state.settings.secret.encode()):
            raise HTTPException(status_code=401, detail="Missing or invalid X-Huddle-Secret")

    app = FastAPI(title="Huddle synthetic stub API", version="0.1.0", lifespan=lifespan,
                  dependencies=[Depends(authorize)], docs_url=None, redoc_url=None,
                  openapi_url=None)

    @app.middleware("http")
    async def disclose(request, call_next):
        response = await call_next(request)
        response.headers["X-Huddle-Stub"] = "true"
        response.headers["X-Huddle-Notice"] = "Synthetic fixtures only; no learning, offers, or live council"
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
    async def unsupported(request, exc):
        return JSONResponse(status_code=exc.status, content={"detail": str(exc)})

    @app.get("/health", response_model=HealthResponse)
    async def health(request: Request):
        return HealthResponse(ok=True, stub=True, placesLoaded=len(request.app.state.places))

    @app.get("/openapi.json", include_in_schema=False)
    async def openapi():
        return JSONResponse(app.openapi())

    @app.post("/parse-prefs", response_model=ParseResponse)
    async def parse_prefs(body: ParseRequest):
        return stubs.parse_prefs(body)

    @app.post("/elicit/next", response_model=NextResponse)
    async def next_pair(body: NextRequest, request: Request):
        return stubs.next_pair(body, request.app.state.places)

    @app.post("/elicit/update", response_model=UpdateResponse)
    async def update(body: UpdateRequest, request: Request):
        return stubs.update(body, request.app.state.places)

    @app.post("/plan", response_model=PlanResponse)
    async def plan(body: PlanRequest, request: Request):
        return stubs.plan(body, request.app.state.places)

    @app.post("/offers", response_model=OffersResponse)
    async def offers(body: OffersRequest):
        # Baseline is accepted as an opaque caller-owned ID; this stub makes no trades.
        return stubs.offers()

    @app.post("/roulette", response_model=RouletteResponse)
    async def roulette(body: RouletteRequest):
        return stubs.roulette(body)

    @app.post("/council", response_model=CouncilResponse)
    async def council(body: CouncilRequest):
        result = stubs.council(body)
        delivery = delivery_factory()  # Fresh for each call, no global transcript.
        for message in result.messages:
            await delivery.deliver(message)
        return result

    return app


app = create_app()
