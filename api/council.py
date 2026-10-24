"""The council (S5.3 rules, build-brief C10): four advocates, two rounds, one chair.

Each advocate sees only its own member's derived numbers. No user free text and no
member names enter any prompt: only tool outputs, plan facts and enums. Our code,
not the model, enforces the rules: every number must come from the speaker's tools
or the public facts, the pick must be one of the plans, names never appear.
"""

import asyncio
import json
import logging
import random
import re
import time

from .catalog import haversine_km, travel_minutes
from .delivery import CouncilDelivery
from .llm import LLM, LLMError, fast, smart
from .models import CouncilMessage, CouncilRequest, CouncilResponse, Member, Plan
from .solver import seed_for

log = logging.getLogger("huddle.council")

BUDGET_S = 17.0       # whole council, under the module's 20 s HTTP timeout
CALL_TIMEOUT_S = 8.0  # S5.3 rule 8: hard timeout per call
CHAIR_RESERVE_S = 5.0
ADVOCATE_WORDS, CHAIR_WORDS = 40, 60
TAU = 0.6             # belowFloor threshold, same default as /plan
KIND_LABEL = {"safe": "Safe", "bold": "Bold", "budget": "Budget"}
NUMBER = re.compile(r"(?<![\w.])\d+(?:\.\d+)?")
CLOCK = re.compile(r"\b\d{1,2}:\d{2}\b")

RULES = """Rules:
- Use only numbers that appear in the JSON you were given. Cite every number you use in "cited", \
with the tool and field it came from.
- Never state a budget cap, travel limit, veto, dietary need or any other private fact. You may \
say a plan is tight or comfortable for you.
- Never use anyone's name. Refer to plans only as Safe, Bold or Budget.
- No clock times, no other digits.
- Output JSON only, in the given schema."""

ADVOCATE_SYSTEM = f"""You are one advocate on a group's planning council. You represent exactly \
one person and see only that person's numbers, computed by the planner:
- my_score: ratioMean and ratioP10 (share of this person's ideal outing they get on average / \
in a bad case, 0 to 1), belowFloor (true if the plan falls under their comfort floor).
- my_dealbreakers: budgetSlackUsd and travelSlackMin, room left before a hard limit (null = no limit).
- my_slack: the most room this person has on any plan.
- plan_facts: public facts about each plan, the same for everyone.
Give a stance on every plan (support, accept or oppose) and one argument of at most \
{ADVOCATE_WORDS - 5} words for your person. In round 2 you can read the other advocates and \
respond to them; you may change your stance.
{RULES}"""

CHAIR_SYSTEM = f"""You chair a group's planning council. The advocates have argued over the \
plans; the solver ranked them by robustness (share of plausible tastes where nobody falls far \
below their own ideal). Recommend exactly one plan. Weigh the solver's ranking and the \
advocates' objections; prefer a plan nobody opposes strongly. Rationale: at most \
{CHAIR_WORDS - 10} words.
{RULES}"""


def leg_minutes(a, b) -> int:
    return round(float(travel_minutes(haversine_km(a.lat, a.lng, b.lat, b.lng))))


def plan_facts(plan: Plan, scout: dict) -> dict:
    meal = next((s for s in plan.stops if s.category == "meal"), None)
    fact = scout.get(meal.placeId) if meal else None
    return {
        "costPerPerson": plan.costPerPerson,
        "stops": [{"category": s.category, "name": s.name} for s in plan.stops],
        "legMinutes": [leg_minutes(a, b) for a, b in zip(plan.stops, plan.stops[1:])],
        "scout": None if fact is None else {
            "openNow": fact.openNow, "vegetarianOptions": fact.vegetarianOptions, "checkedEarlier": fact.cached},
    }


def build_tools(member: Member, plans: list[Plan], scout: dict) -> dict:
    """C10 tools, evaluated up front (they are pure). Derived numbers only, never raw caps."""
    cap, travel = member.hard.budgetMaxPerPerson, member.hard.maxTravelMinutes
    score, dealbreakers = {}, {}
    for p in plans:
        mine = next(r for r in p.perMember if r.memberId == member.memberId)
        score[KIND_LABEL[p.kind]] = {"ratioMean": round(mine.ratioMean, 2), "ratioP10": round(mine.ratioP10, 2),
                                     "belowFloor": mine.ratioMean < TAU}
        first = None
        if travel is not None and member.origin is not None:
            first = leg_minutes(member.origin, p.stops[0])
        dealbreakers[KIND_LABEL[p.kind]] = {
            "budgetSlackUsd": None if cap is None else round(cap - p.costPerPerson, 2),
            "travelSlackMin": None if first is None else round(travel - first)}
    budget_room = [d["budgetSlackUsd"] for d in dealbreakers.values() if d["budgetSlackUsd"] is not None]
    travel_room = [d["travelSlackMin"] for d in dealbreakers.values() if d["travelSlackMin"] is not None]
    return {
        "my_score": score, "my_dealbreakers": dealbreakers,
        "my_slack": {"maxBudgetStretchUsd": max(budget_room, default=None),
                     "maxTravelStretchMin": max(travel_room, default=None)},
        "plan_facts": {KIND_LABEL[p.kind]: plan_facts(p, scout) for p in plans},
    }


def numbers_in(value) -> list[float]:
    """Every number in a JSON-like value; booleans count as 0/1 (models cite them so)."""
    if value is None:
        return []
    if isinstance(value, (bool, int, float)):
        return [float(value)]
    if isinstance(value, dict):
        return [n for v in value.values() for n in numbers_in(v)]
    if isinstance(value, list):
        return [n for v in value for n in numbers_in(v)]
    return []


def close(x: float, allowed: list[float]) -> bool:
    """Small tolerance (rule 4), and 0.82 may be written as 82%."""
    return any(abs(x - v) <= max(0.006, 0.006 * abs(v)) or (abs(v) <= 1 and abs(x - 100 * v) <= 0.6)
               for v in allowed)


def validate(text: str, cited: list[dict], allowed: dict[str, list[float]], names: list[str],
             show_who: bool, max_words: int) -> str | None:
    """S5.3 rule 4. Returns why a message is invalid, or None."""
    if not text.strip():
        return "empty"
    if len(text.split()) > max_words:
        return "too long"
    if not show_who and any(re.search(rf"\b{re.escape(n)}\b", text, re.I) for n in names):
        return "names a member"
    if CLOCK.search(text):
        return "clock time"
    everything = [v for vs in allowed.values() for v in vs]
    for raw in NUMBER.findall(text):
        if not close(float(raw), everything):
            return f"number {raw} not in tool outputs"
    for c in cited:
        if not close(c["value"], allowed.get(c["tool"], [])):
            return f"cited {c['tool']}.{c['field']}={c['value']} not in that tool's output"
    return None


def citation_schema(tools: list[str]) -> dict:
    return {"type": "array", "items": {
        "type": "object",
        "properties": {"tool": {"type": "string", "enum": tools}, "field": {"type": "string"},
                       "value": {"type": "number"}},
        "required": ["tool", "field", "value"], "additionalProperties": False}}


def advocate_schema(kinds: list[str]) -> dict:
    stances = {"type": "string", "enum": ["support", "accept", "oppose"]}
    return {"type": "object", "properties": {
        "stance": {"type": "object", "properties": {k: stances for k in kinds},
                   "required": kinds, "additionalProperties": False},
        "argument": {"type": "string"},
        "cited": citation_schema(["my_score", "my_dealbreakers", "my_slack", "plan_facts"]),
    }, "required": ["stance", "argument", "cited"], "additionalProperties": False}


def chair_schema(kinds: list[str]) -> dict:
    return {"type": "object", "properties": {
        "chosenPlan": {"type": "string", "enum": kinds},
        "rationale": {"type": "string"},
        "cited": citation_schema(["solver_ranking", "plan_facts", "transcript"]),
    }, "required": ["chosenPlan", "rationale", "cited"], "additionalProperties": False}


def now_ms() -> int:
    return int(time.time() * 1000)


async def run_council(llm: LLM, request: CouncilRequest, delivery: CouncilDelivery) -> CouncilResponse:
    started = time.monotonic()
    deadline = started + BUDGET_S
    plans = request.plans
    by_label = {KIND_LABEL[p.kind]: p for p in plans}
    kinds = list(by_label)
    safe = next(p for p in plans if p.kind == "safe")
    solver_best = max(plans, key=lambda p: p.robustness)
    show_who = request.options.showWho
    names = [m.name for m in request.members]
    scout = {f.placeId: f for f in request.scoutFacts}
    labels = [f"Advocate {chr(65 + i)}" for i in range(len(request.members))]
    random.Random(seed_for(request.runId, request.options.seed)).shuffle(labels)
    tools = [build_tools(m, plans, scout) for m in request.members]
    # Public numbers, including digits inside place names ("1951 Coffee").
    public = numbers_in(tools[0]["plan_facts"]) + [
        float(n) for p in plans for s in p.stops for n in NUMBER.findall(s.name)]
    messages: list[CouncilMessage] = []
    pending: list[asyncio.Task] = []

    def publish(message: CouncilMessage):
        messages.append(message)
        pending.append(asyncio.create_task(delivery.deliver(message)))

    async def advocate(i: int, round_: int, transcript: list[dict]):
        remaining = deadline - CHAIR_RESERVE_S - time.monotonic()
        if remaining < 1.5:
            return None
        member, mine = request.members[i], tools[i]
        allowed = {name: numbers_in(out) for name, out in mine.items()}
        allowed["plan_facts"] = public

        def check(data):
            reason = validate(data["argument"], data["cited"], allowed, names, show_who, ADVOCATE_WORDS)
            if reason:
                raise LLMError(reason)

        user = json.dumps({"you": labels[i], "round": round_, "plans": kinds, "tools": mine,
                           "transcript": transcript}, ensure_ascii=False)
        try:
            data = await llm.call(f"advocate {labels[i]} r{round_}", ADVOCATE_SYSTEM, user,
                                  advocate_schema(kinds), fast(), min(CALL_TIMEOUT_S, remaining), check)
        except LLMError as e:
            log.info("advocate message dropped: %s", e)  # rule 4: invalid advocate output is dropped
            return None
        return CouncilMessage(
            runId=request.runId, round=round_, speaker="advocate", label=labels[i], memberId=member.memberId,
            planId=None, stance={by_label[k].id: v for k, v in data["stance"].items()},
            text=data["argument"].strip(), cited=data["cited"], ts=now_ms())

    transcript: list[dict] = []
    for round_ in (1, 2):
        results = await asyncio.gather(*(advocate(i, round_, transcript) for i in range(len(request.members))))
        for message in results:
            if message is not None:
                publish(message)
        transcript = [{"label": m.label, "round": m.round, "text": m.text,
                       "stance": {KIND_LABEL[p.kind]: m.stance[p.id] for p in plans if p.id in m.stance},
                       "cited": [c.model_dump() for c in m.cited]} for m in messages]

    ranking = [{"plan": KIND_LABEL[p.kind], "robustness": round(p.robustness, 2),
                "meanRatio": round(sum(r.ratioMean for r in p.perMember) / len(p.perMember), 2),
                "minRatio": round(min(r.ratioMean for r in p.perMember), 2)}
               for p in sorted(plans, key=lambda p: -p.robustness)]
    allowed = {"solver_ranking": numbers_in(ranking), "plan_facts": public,
               "transcript": [c["value"] for t in transcript for c in t["cited"]]}

    def check_chair(data):
        reason = validate(data["rationale"], data["cited"], allowed, names, show_who, CHAIR_WORDS)
        if reason:
            raise LLMError(reason)

    chosen, rationale, cited, fallback = safe, "", [], False
    remaining = deadline - time.monotonic()
    try:
        if remaining < 1.5:
            raise LLMError("chair: no time left")
        user = json.dumps({"plans": {k: tools[0]["plan_facts"][k] for k in kinds},
                           "solver_ranking": ranking, "transcript": transcript}, ensure_ascii=False)
        data = await llm.call("chair", CHAIR_SYSTEM, user, chair_schema(kinds), smart(),
                              min(CALL_TIMEOUT_S, remaining), check_chair)
        chosen, rationale, cited = by_label[data["chosenPlan"]], data["rationale"].strip(), data["cited"]
    except LLMError as e:
        # Rule 4: invalid chair, pick outside the set or timeout -> Safe, fallbackUsed.
        log.info("chair fallback: %s", e)
        fallback = True
        rationale = "The council did not reach a valid recommendation in time, so the Safe plan stands."
    publish(CouncilMessage(
        runId=request.runId, round=3, speaker="chair", label="Chair", memberId=None, planId=chosen.id,
        stance={}, text=rationale, cited=cited, ts=now_ms()))
    if pending:
        await asyncio.wait(pending, timeout=max(0.5, deadline + 2 - time.monotonic()))
    return CouncilResponse(
        runId=request.runId, chosenPlanId=chosen.id, rationale=rationale, fallbackUsed=fallback,
        agreesWithSolver=chosen.id == solver_best.id, messages=messages,
        elapsedMs=round((time.monotonic() - started) * 1000))
