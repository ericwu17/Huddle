"""Versioned coordinator contracts, independent of the legacy score/posterior API."""

from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import Field, field_validator, model_validator

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
    # Full outing elapsed time, including travel/waiting between stops. This is
    # deliberately separate from the journey to the first venue.
    maxOutingMinutes: Money | None = None
    # Soft: the group's plans use the stop count nearest the members' average.
    preferredStops: Annotated[int, Field(ge=1, le=5)] | None = None

    @field_validator("allergies", mode="before")
    @classmethod
    def explicit_no_allergy(cls, value):
        if isinstance(value, list) and len(value) == 1 and isinstance(value[0], str) and value[0].strip().casefold() in {
            "none", "no allergies", "no known allergies", "n/a",
        }:
            return []
        return value


class AgentNeeds(Model):
    hard: AgentHard
    preferences: list[Text] = Field(default_factory=list, max_length=15)
    questions: list[Text] = Field(default_factory=list, max_length=8)
    warnings: list[Text] = Field(default_factory=list, max_length=12)


class AgentNeedsRequest(Model):
    memberId: Identifier
    text: Annotated[str, Field(max_length=4000)] = ""
    currentHard: AgentHard | None = None
    structured: AgentHard | None = None


class AgentMember(Model):
    memberId: Identifier
    prompt: Annotated[str, Field(max_length=4000)] = ""
    needs: AgentNeeds
    origin: Origin | None = None


class EvidenceSource(Model):
    source: Literal["gmaps", "yelp", "google_places"]
    url: Annotated[str, Field(max_length=500, pattern=r"^https://")] | None = None
    fetchedAt: Annotated[str, Field(max_length=40)] | None = None
    rating: Annotated[Number, Field(ge=0, le=5)] | None = None
    reviewCount: Annotated[int, Field(ge=0)] | None = None


class MenuItem(Model):
    id: Identifier
    name: Annotated[str, Field(min_length=1, max_length=300)]
    section: Annotated[str, Field(max_length=200)] = ""
    description: Annotated[str, Field(max_length=2000)] = ""
    labels: list[Annotated[str, Field(max_length=80)]] = Field(default_factory=list, max_length=15)
    price: Money | None = None
    sourceUrl: Annotated[str, Field(max_length=1000, pattern=r"^https?://[^\s]+$")]
    fetchedAt: Annotated[str, Field(max_length=40)]

    @field_validator("price")
    @classmethod
    def cents(cls, value):
        if value is not None and Decimal(str(value)) * 100 != (Decimal(str(value)) * 100).to_integral_value():
            raise ValueError("menu prices use whole cents")
        return value

    @field_validator("sourceUrl")
    @classmethod
    def source_url(cls, value):
        url = urlsplit(value)
        if not url.hostname or url.username or url.password:
            raise ValueError("menu source requires a public HTTP(S) URL")
        return value

    @field_validator("fetchedAt")
    @classmethod
    def observed_at(cls, value):
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        return value


class MenuEvidence(Model):
    status: Annotated[str, Field(max_length=80)]
    items: list[MenuItem] = Field(default_factory=list, max_length=85)

    @model_validator(mode="after")
    def unique_ids(self):
        if len({item.id for item in self.items}) != len(self.items):
            raise ValueError("duplicate menu item IDs")
        return self


class VenuePhoto(Model):
    url: Annotated[str, Field(max_length=2000, pattern=r"^https?://[^\s]+$")]
    sourceUrl: Annotated[str, Field(max_length=2000, pattern=r"^https?://[^\s]+$")]
    attribution: Annotated[str, Field(max_length=500)] = ""

    @field_validator("url", "sourceUrl")
    @classmethod
    def public_url(cls, value):
        return MenuItem.source_url(value)


class Evidence(Model):
    sources: list[EvidenceSource] = Field(default_factory=list, max_length=5)
    foodStyle: Annotated[str, Field(max_length=120)] | None = None
    menu: MenuEvidence | None = None
    photos: list[VenuePhoto] = Field(default_factory=list, max_length=3)


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


class PublishedCatalog(AgentCatalog):
    """Stored venue pool; coordinator requests still use AgentCatalog's 160 limit."""
    places: Annotated[list[Place], Field(min_length=3, max_length=320)]

    @model_validator(mode="after")
    def pool_limits(self):
        limits = {"meal": 160, "activity": 100, "dessert": 60}
        for category, limit in limits.items():
            if sum(place.category == category for place in self.places) > limit:
                raise ValueError(f"too many {category} venues in published pool")
        return self


class AgentPlanRequest(Model):
    runId: Identifier
    inputRevision: Annotated[int, Field(ge=0)]
    date: str | None = None
    window: Window | None = None
    members: Annotated[list[AgentMember], Field(min_length=2, max_length=12)]
    excludePlaceIds: list[Identifier] = Field(default_factory=list, max_length=100)
    destinationCities: list[Literal["Berkeley", "Oakland", "San Francisco", "Albany", "Emeryville"]] = Field(default_factory=list, max_length=5)
    discussion: list[Text] = Field(default_factory=list, max_length=20)
    catalog: AgentCatalog | None = None  # absent: the catalog this service loaded at startup

    @model_validator(mode="after")
    def unique_members_and_date(self):
        from datetime import date
        if (self.date is None) != (self.window is None):
            raise ValueError("supply both date and window, or leave both unset")
        if self.date is not None:
            date.fromisoformat(self.date)
        if len({m.memberId for m in self.members}) != len(self.members):
            raise ValueError("duplicate member IDs")
        return self


class AgentPlan(Model):
    id: Identifier
    title: Text
    stops: Annotated[list[Stop], Field(min_length=1, max_length=5)]
    costPerPerson: Money
    whyLine: Text
    limitations: list[Text]
    travelMinutes: Money
    status: Literal["ready", "provisional"] = "ready"
    summary: Text = "Catalog outing suggestion."
    costModel: Literal["own_orders"] | None = None
    costRange: dict[Literal["min", "max"], Money] | None = None

    @model_validator(mode="after")
    def single_stop_is_meal(self):
        if len(self.stops) == 1 and self.stops[0].category != "meal":
            raise ValueError("a single-stop coordinator outing must be a meal")
        return self


class AgentSuggestion(Model):
    id: Identifier
    placeId: Identifier
    summary: Text
    limitations: list[Text] = Field(default_factory=list, max_length=8)


class OrderItem(Model):
    placeId: Identifier
    itemId: Identifier | None = None


class PrivateOrder(Model):
    memberId: Identifier
    planId: Identifier
    items: list[OrderItem] = Field(default_factory=list, max_length=3)
    total: Money


class AgentPlanResponse(Model):
    mode: Literal["agent"] = "agent"
    runId: Identifier
    inputRevision: int
    plans: Annotated[list[AgentPlan], Field(max_length=3)]
    recommendedPlanId: Identifier | None
    rationale: str
    conflicts: list[Text]
    warnings: list[Text]
    suggestions: list[AgentSuggestion] = Field(default_factory=list, max_length=3)
    # Service-to-module only. Removed before the group-readable result is saved.
    privateOrders: list[PrivateOrder] = Field(default_factory=list, max_length=72)
