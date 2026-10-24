"""Versioned coordinator contracts, independent of the legacy score/posterior API."""

from typing import Annotated, Literal

from pydantic import Field, model_validator

from .models import Model, Identifier, Money, Number, Category, Cuisine, Diet, Origin, Place, Stop, Window

Text = Annotated[str, Field(min_length=1, max_length=2000)]


class AgentHard(Model):
    budgetMaxPerPerson: Money | None = None
    dietary: list[Diet] = Field(default_factory=list, max_length=5)
    allergies: list[Text] = Field(default_factory=list, max_length=12)
    vetoCuisines: list[Cuisine] = Field(default_factory=list, max_length=6)
    vetoCategories: list[Category] = Field(default_factory=list, max_length=3)
    rejectedTerms: list[Text] = Field(default_factory=list, max_length=20)
    maxTravelMinutes: Money | None = None


class AgentNeeds(Model):
    hard: AgentHard
    preferences: list[Text] = Field(default_factory=list, max_length=15)
    questions: list[Text] = Field(default_factory=list, max_length=8)
    warnings: list[Text] = Field(default_factory=list, max_length=12)


class AgentNeedsRequest(Model):
    memberId: Identifier
    text: Annotated[str, Field(min_length=1, max_length=4000)]
    currentHard: AgentHard | None = None


class AgentMember(Model):
    memberId: Identifier
    prompt: Annotated[str, Field(min_length=1, max_length=4000)]
    needs: AgentNeeds
    origin: Origin | None = None


class EvidenceSource(Model):
    source: Literal["gmaps", "yelp", "google_places"]
    url: Annotated[str, Field(max_length=500, pattern=r"^https://")] | None = None
    fetchedAt: Annotated[str, Field(max_length=40)] | None = None
    rating: Annotated[Number, Field(ge=0, le=5)] | None = None
    reviewCount: Annotated[int, Field(ge=0)] | None = None


class Evidence(Model):
    sources: list[EvidenceSource] = Field(default_factory=list, max_length=5)


class AgentCatalog(Model):
    """The module's live venue snapshot (server/src/lib/catalog.ts). Plans may use only these."""
    version: Identifier
    places: Annotated[list[Place], Field(min_length=3, max_length=160)]
    evidence: dict[Identifier, Evidence] = Field(default_factory=dict)

    @model_validator(mode="after")
    def complete(self):
        if len({p.id for p in self.places}) != len(self.places):
            raise ValueError("duplicate place IDs")
        if {p.category for p in self.places} != {"meal", "activity", "dessert"}:
            raise ValueError("every stop category needs at least one place")
        return self


class AgentPlanRequest(Model):
    runId: Identifier
    inputRevision: Annotated[int, Field(ge=0)]
    date: str
    window: Window
    members: Annotated[list[AgentMember], Field(min_length=2, max_length=12)]
    excludePlaceIds: list[Identifier] = Field(default_factory=list, max_length=100)
    discussion: list[Text] = Field(default_factory=list, max_length=20)
    catalog: AgentCatalog | None = None  # absent: the catalog this service loaded at startup

    @model_validator(mode="after")
    def unique_members_and_date(self):
        from datetime import date
        date.fromisoformat(self.date)
        if len({m.memberId for m in self.members}) != len(self.members):
            raise ValueError("duplicate member IDs")
        return self


class AgentPlan(Model):
    id: Identifier
    title: Text
    stops: Annotated[list[Stop], Field(min_length=2, max_length=3)]
    costPerPerson: Money
    whyLine: Text
    limitations: list[Text]
    travelMinutes: Money


class AgentPlanResponse(Model):
    mode: Literal["agent"] = "agent"
    runId: Identifier
    inputRevision: int
    plans: Annotated[list[AgentPlan], Field(max_length=3)]
    recommendedPlanId: Identifier | None
    rationale: str
    conflicts: list[Text]
    warnings: list[Text]
