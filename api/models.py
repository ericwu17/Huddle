"""S5 wire names are intentional. No database types cross this boundary."""

from datetime import date
from math import isclose
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, PrivateAttr, model_validator, field_validator

FEATURES = (
    "noise", "crowd", "wait", "value", "romance", "service", "outdoor", "novelty",
    "cuisine_asian", "cuisine_latin", "cuisine_mediterranean", "cuisine_american",
    "cuisine_cafe_dessert",
)
Feature = Literal[
    "noise", "crowd", "wait", "value", "romance", "service", "outdoor", "novelty",
    "cuisine_asian", "cuisine_latin", "cuisine_mediterranean", "cuisine_american",
    "cuisine_cafe_dessert",
]
Category = Literal["meal", "activity", "dessert"]
Cuisine = Literal["asian", "latin", "mediterranean", "american", "cafe_dessert", "none"]
Diet = Literal["vegetarian", "vegan", "gluten_free", "halal", "kosher"]
Identifier = Annotated[str, Field(min_length=1, max_length=200)]
Number = Annotated[float, Field(allow_inf_nan=False)]
Money = Annotated[Number, Field(ge=0)]
Ratio = Annotated[Number, Field(ge=0, le=1)]
Clock = Annotated[str, Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")]
Vector = Annotated[list[Number], Field(min_length=13, max_length=13)]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)


class Posterior(Model):
    mean: Vector
    cov: Annotated[list[Vector], Field(min_length=13, max_length=13)]

    @model_validator(mode="after")
    def covariance_is_valid(self):
        # Validate positive semidefiniteness with an LDL factorization; no numpy needed.
        lower = [[0.0] * 13 for _ in range(13)]
        diagonal = [0.0] * 13
        for i in range(13):
            for j in range(i):
                if not isclose(self.cov[i][j], self.cov[j][i], abs_tol=1e-9):
                    raise ValueError("cov must be symmetric")
                residual = self.cov[i][j] - sum(
                    lower[i][k] * diagonal[k] * lower[j][k] for k in range(j)
                )
                if abs(diagonal[j]) < 1e-12:
                    if abs(residual) > 1e-9:
                        raise ValueError("cov must be positive semidefinite")
                else:
                    lower[i][j] = residual / diagonal[j]
            diagonal[i] = self.cov[i][i] - sum(
                lower[i][k] ** 2 * diagonal[k] for k in range(i)
            )
            if diagonal[i] < -1e-9:
                raise ValueError("cov must be positive semidefinite")
            lower[i][i] = 1.0
        return self


class Hard(Model):
    vetoCuisines: list[Cuisine] | None = None
    vetoCategories: list[Category] | None = None
    budgetMaxPerPerson: Money | None = None
    dietary: list[Diet] | None = None
    maxTravelMinutes: Money | None = None
    _dropped: int = PrivateAttr(default=0)

    @model_validator(mode="after")
    def cap_vetoes(self):
        cuisines, categories = self.vetoCuisines or [], self.vetoCategories or []
        self._dropped = max(0, len(cuisines) + len(categories) - 2)
        if self._dropped:
            self.vetoCuisines = cuisines[:2]
            self.vetoCategories = categories[:max(0, 2 - len(cuisines))]
        return self


class Origin(Model):
    lat: Annotated[Number, Field(ge=-90, le=90)]
    lng: Annotated[Number, Field(ge=-180, le=180)]


class Member(Model):
    memberId: Identifier
    name: Annotated[str, Field(min_length=1, max_length=200)]
    posterior: Posterior
    hard: Hard
    origin: Origin | None = None


class Window(Model):
    start: Clock
    end: Clock

    @model_validator(mode="after")
    def ordered(self):
        if self.end <= self.start:
            raise ValueError("window end must follow start on the same day")
        return self


class Aspect(Model):
    mean: Ratio
    sd: Money


class Place(Origin):
    id: Identifier
    name: str
    category: Category
    cuisine: Cuisine
    address: str
    priceLevel: Annotated[int, Field(ge=0, le=4)] | None  # Google gives none for most activities
    costPerPerson: Money
    dwellMinutes: Annotated[int, Field(gt=0)]
    phone: str | None
    dietary: list[Diet]
    hours: dict[Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"], list[list[Clock]]]
    aspects: dict[str, Aspect]
    reviewCount: Annotated[int, Field(ge=0)]
    rating: Annotated[Number, Field(ge=0, le=5)]
    sources: list[str]
    googlePlaceId: str | None = None  # data/places.json carries it; not used by the solver

    @model_validator(mode="after")
    def complete(self):
        if set(self.aspects) != set(FEATURES[:8]):
            raise ValueError("all eight aspect names are required")
        if set(self.hours) != {"mon", "tue", "wed", "thu", "fri", "sat", "sun"}:
            raise ValueError("all seven weekdays are required")
        for intervals in self.hours.values():
            if any(len(pair) != 2 or pair[0] >= pair[1] for pair in intervals):
                raise ValueError("hours must contain ordered start/end pairs")
        return self


class Stop(Origin):
    placeId: Identifier
    name: str
    category: Category
    start: Clock
    end: Clock
    costPerPerson: Money

    @model_validator(mode="after")
    def ordered(self):
        if self.end <= self.start:
            raise ValueError("stop end must follow start")
        return self


class MemberRatio(Model):
    memberId: Identifier
    ratioMean: Ratio
    ratioP10: Ratio


class Compromise(Model):
    memberId: Identifier
    feature: Feature
    text: str


class Plan(Model):
    id: Identifier
    kind: Literal["safe", "bold", "budget"]
    stops: Annotated[list[Stop], Field(min_length=1)]
    costPerPerson: Money
    robustness: Ratio
    perMember: list[MemberRatio]
    whyLine: str
    gaveUp: list[Compromise]

    @model_validator(mode="after")
    def consistent(self):
        if not isclose(self.costPerPerson, sum(s.costPerPerson for s in self.stops), abs_tol=1e-9):
            raise ValueError("plan costPerPerson must equal the sum of all stop costs")
        if any(a.end > b.start for a, b in zip(self.stops, self.stops[1:])):
            raise ValueError("stops must not overlap")
        if len({r.memberId for r in self.perMember}) != len(self.perMember):
            raise ValueError("duplicate perMember IDs")
        return self


class HealthResponse(Model):
    ok: bool
    stub: bool
    placesLoaded: int


class ParseRequest(Model):
    text: Annotated[str, Field(min_length=1, max_length=10000)]
    memberId: Identifier


class Soft(Model):
    feature: Feature
    direction: Literal[-1, 1]
    confidence: Literal["low", "med", "high"]


class ParseResponse(Model):
    hard: Hard
    soft: list[Soft]
    posterior: Posterior
    warnings: list[str]


class NextRequest(Model):
    memberId: Identifier
    posterior: Posterior
    alreadySeen: list[Annotated[list[Identifier], Field(min_length=2, max_length=2)]] = Field(default_factory=list)
    candidatePlaceIds: list[Identifier]
    focusPlaceIds: list[Identifier] = Field(default_factory=list)


class NextResponse(Model):
    a: Identifier
    b: Identifier
    category: Category


class UpdateRequest(Model):
    posterior: Posterior
    winnerPlaceId: Identifier
    loserPlaceId: Identifier

    @model_validator(mode="after")
    def distinct(self):
        if self.winnerPlaceId == self.loserPlaceId:
            raise ValueError("winner and loser must differ")
        return self


class UpdateResponse(Model):
    posterior: Posterior


class PlanOptions(Model):
    samples: Annotated[int, Field(gt=0, le=10000)] = 300
    tau: Ratio = 0.6
    topK: Annotated[int, Field(gt=0, le=1000)] = 60
    preview: bool = False


class PlanRequest(Model):
    runId: Identifier
    date: str
    window: Window
    members: Annotated[list[Member], Field(min_length=1, max_length=20)]
    excludePlaceIds: list[Identifier] = Field(default_factory=list)
    options: PlanOptions = Field(default_factory=PlanOptions)

    @field_validator("date")
    @classmethod
    def iso_date(cls, value):
        try:
            parsed = date.fromisoformat(value)
        except ValueError:
            raise ValueError("date must be YYYY-MM-DD") from None
        if parsed.isoformat() != value:
            raise ValueError("date must be YYYY-MM-DD")
        return value

    @field_validator("members")
    @classmethod
    def unique_members(cls, members):
        if len({m.memberId for m in members}) != len(members):
            raise ValueError("memberId must be unique")
        return members


class Pareto(Model):
    planId: Identifier
    meanRatio: Ratio
    minRatio: Ratio
    robustness: Ratio


class FeatureSummary(Model):
    name: Feature
    mean: Number
    sd: Money


class PosteriorSummary(Model):
    memberId: Identifier
    features: list[FeatureSummary]


class Stats(Model):
    candidatePlans: int
    feasiblePlans: int
    samples: int
    elapsedMs: int


class PlanResponse(Model):
    runId: Identifier
    plans: list[Plan]
    pareto: list[Pareto]
    posteriorSummary: list[PosteriorSummary]
    stats: Stats
    # Only [] is supported until the team defines the entries' wire schema.
    relaxationHints: Annotated[list[dict], Field(max_length=0)]
    warnings: list[str]


class OffersRequest(PlanRequest):
    baselinePlanId: Identifier


class Offer(Model):
    offerId: Identifier
    toMemberId: Identifier
    type: Literal["budget", "travel"]
    amount: Money
    unit: Literal["usd", "min"]
    plan: Plan
    robustnessGain: Number
    minRatioGain: Number

    @model_validator(mode="after")
    def correct_unit(self):
        if (self.type, self.unit) not in (("budget", "usd"), ("travel", "min")):
            raise ValueError("offer type and unit disagree")
        return self


class OffersResponse(Model):
    offers: list[Offer]


class RoulettePlan(Model):
    id: Identifier
    robustness: Ratio


class RouletteRequest(Model):
    plans: Annotated[list[RoulettePlan], Field(min_length=1)]
    seed: int

    @model_validator(mode="after")
    def valid_pool(self):
        if len({p.id for p in self.plans}) != len(self.plans):
            raise ValueError("duplicate plan IDs")
        if not any(p.robustness > 0 for p in self.plans):
            raise ValueError("at least one positive robustness is required")
        return self


class RouletteResponse(Model):
    planId: Identifier
    weights: dict[str, Ratio]


class ScoutFact(Model):
    placeId: Identifier
    openNow: bool | None
    vegetarianOptions: bool | None
    checkedAt: Annotated[int, Field(ge=0)]
    source: str
    cached: bool


class CouncilOptions(Model):
    rounds: Literal[2] = 2
    showWho: bool = False
    seed: int = 7


class CouncilRequest(Model):
    runId: Identifier
    plans: Annotated[list[Plan], Field(min_length=1, max_length=3)]
    pareto: list[Pareto] = Field(default_factory=list)
    members: Annotated[list[Member], Field(min_length=1, max_length=20)]
    scoutFacts: list[ScoutFact] = Field(default_factory=list)
    options: CouncilOptions = Field(default_factory=CouncilOptions)

    @model_validator(mode="after")
    def approved_pool(self):
        if len({m.memberId for m in self.members}) != len(self.members):
            raise ValueError("duplicate members")
        if len({p.id for p in self.plans}) != len(self.plans):
            raise ValueError("duplicate plans")
        if sum(p.kind == "safe" for p in self.plans) != 1:
            raise ValueError("exactly one Safe plan is required")
        for plan in self.plans:
            if {r.memberId for r in plan.perMember} != {m.memberId for m in self.members}:
                raise ValueError("perMember must cover exactly the supplied members")
            for member in self.members:
                cap = member.hard.budgetMaxPerPerson
                if cap is not None and plan.costPerPerson > cap:
                    raise ValueError("council plan exceeds a cumulative budget")
        if any(m.hard._dropped for m in self.members):
            raise ValueError("veto cap exceeded; send at most two vetoes")
        return self


class Citation(Model):
    tool: str
    field: str
    value: Number


class CouncilMessage(Model):
    runId: Identifier
    round: Literal[1, 2, 3]
    speaker: Literal["advocate", "chair"]
    label: str
    memberId: Identifier | None
    planId: Identifier | None
    stance: dict[str, Literal["support", "accept", "oppose"]]
    text: str
    cited: list[Citation]
    ts: Annotated[int, Field(ge=0)]


class CouncilResponse(Model):
    runId: Identifier
    chosenPlanId: Identifier
    rationale: str
    fallbackUsed: bool
    agreesWithSolver: bool
    messages: list[CouncilMessage]
    elapsedMs: int
