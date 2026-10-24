"""Real HTTP smoke check for a running instance (local or through a tunnel).

Reads the mode from /health. Stub mode: the synthetic fixtures, byte-identical
on repeat. Real mode: the seeded demo group on data/places.json, including one
Claude parse and one live council when the server has ANTHROPIC_API_KEY.
"""

import json
import os
from pathlib import Path

import httpx

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"
DEMO = Path(__file__).resolve().parents[2] / "data" / "demo_group.json"


def fixture(name):
    return json.loads((FIXTURES / name).read_text())


def stub_checks(client):
    def post(path, body):
        response = client.post(path, json=body)
        response.raise_for_status()
        assert response.headers["X-Huddle-Stub"] == "true"
        assert client.post(path, json=body).json() == response.json(), path
        print(f"PASS {path}: authenticated, synthetic, deterministic")
        return response.json()

    post("/parse-prefs", fixture("parse-prefs.request.json"))
    post("/elicit/next", fixture("elicit-next.request.json"))
    post("/elicit/update", fixture("elicit-update.request.json"))
    request = fixture("plan.request.json")
    result = post("/plan", request)
    assert len(result["plans"]) == 3
    for plan in result["plans"]:
        assert plan["costPerPerson"] == sum(s["costPerPerson"] for s in plan["stops"])
        assert all(m["hard"]["budgetMaxPerPerson"] is None or plan["costPerPerson"] <= m["hard"]["budgetMaxPerPerson"] for m in request["members"])
    post("/offers", dict(**request, baselinePlanId=result["plans"][0]["id"]))
    post("/roulette", dict(plans=[dict(id=p["id"], robustness=p["robustness"]) for p in result["plans"]], seed=7))
    post("/council", dict(runId=request["runId"], plans=result["plans"], pareto=result["pareto"],
                         members=request["members"], scoutFacts=[], options=dict(rounds=2, showWho=False, seed=7)))
    request["members"][0]["hard"]["budgetMaxPerPerson"] = 13
    assert post("/plan", request)["plans"] == []
    print("PASS cumulative budgets: every sample total fits all caps; $13 rejects all fixtures")


def real_checks(client):
    def post(path, body):
        response = client.post(path, json=body)
        response.raise_for_status()
        assert "X-Huddle-Stub" not in response.headers, path
        return response.json()

    demo = json.loads(DEMO.read_text())
    members = []
    for i, m in enumerate(demo["members"]):
        parsed = post("/parse-prefs", dict(text=m["text"], memberId=f"m{i + 1}"))
        assert parsed["hard"]["budgetMaxPerPerson"] == m["hard"]["budgetMaxPerPerson"], (m["name"], parsed["hard"])
        members.append(dict(memberId=f"m{i + 1}", name=m["name"], posterior=parsed["posterior"],
                            hard=parsed["hard"], origin=m["origin"]))
        print(f"PASS /parse-prefs {m['name']}: budget {parsed['hard']['budgetMaxPerPerson']}, "
              f"soft {[s['feature'] for s in parsed['soft']]} {parsed['warnings'] or ''}")
    ids = [p["id"] for p in json.loads((DEMO.parent / "places.json").read_text())]
    pair = post("/elicit/next", dict(memberId="m1", posterior=members[0]["posterior"], alreadySeen=[],
                                     candidatePlaceIds=ids, focusPlaceIds=[]))
    updated = post("/elicit/update", dict(posterior=members[0]["posterior"], winnerPlaceId=pair["a"],
                                          loserPlaceId=pair["b"]))
    assert updated["posterior"] != members[0]["posterior"]
    print(f"PASS /elicit: pair {pair['a']} vs {pair['b']}, posterior updated")
    request = dict(runId="smoke_real_1", date=demo["date"], window=demo["window"], members=members,
                   excludePlaceIds=[], options=dict(samples=300, tau=0.6, topK=60, preview=False))
    result = post("/plan", request)
    again = post("/plan", request)
    assert [p["id"] for p in result["plans"]] == [p["id"] for p in again["plans"]]
    assert result["plans"], result["warnings"]
    for plan in result["plans"]:
        assert all(m["hard"]["budgetMaxPerPerson"] is None or plan["costPerPerson"] <= m["hard"]["budgetMaxPerPerson"]
                   for m in members)
        print(f"PASS /plan {plan['kind']}: ${plan['costPerPerson']:g}, robustness {plan['robustness']}, "
              + " > ".join(s["name"] for s in plan["stops"]))
    print(f"     {result['stats']}")
    offers = post("/offers", dict(**request, baselinePlanId=result["plans"][0]["id"]))["offers"]
    print(f"PASS /offers: {[(o['toMemberId'], o['type'], o['amount']) for o in offers]}")
    post("/roulette", dict(plans=[dict(id=p["id"], robustness=p["robustness"]) for p in result["plans"]], seed=7))
    print("PASS /roulette")
    council = post("/council", dict(runId=request["runId"], plans=result["plans"], pareto=result["pareto"],
                                    members=members, scoutFacts=[], options=dict(rounds=2, showWho=False, seed=7)))
    assert council["chosenPlanId"] in {p["id"] for p in result["plans"]}
    print(f"PASS /council: {len(council['messages'])} messages in {council['elapsedMs']} ms, "
          f"fallbackUsed={council['fallbackUsed']} (true without ANTHROPIC_API_KEY on the server)")


def main():
    secret = os.environ["HUDDLE_SHARED_SECRET"]
    base = os.getenv("FASTAPI_BASE_URL", "http://127.0.0.1:8000")
    with httpx.Client(base_url=base, timeout=30, headers={"X-Huddle-Secret": secret}) as client:
        assert httpx.get(base + "/health", timeout=10).status_code == 401
        health = client.get("/health")
        health.raise_for_status()
        mode = health.json()
        print(f"PASS /health and unauthenticated rejection: {mode}")
        if mode["stub"]:
            assert mode == dict(ok=True, stub=True, placesLoaded=9)
            stub_checks(client)
        else:
            real_checks(client)


if __name__ == "__main__":
    main()
