"""Real HTTP smoke check for a running local instance; no external service use."""

import json
import os
from pathlib import Path

import httpx

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"


def fixture(name):
    return json.loads((FIXTURES / name).read_text())


def main():
    secret = os.environ["HUDDLE_SHARED_SECRET"]
    base = os.getenv("FASTAPI_BASE_URL", "http://127.0.0.1:8000")
    with httpx.Client(base_url=base, timeout=10, headers={"X-Huddle-Secret": secret}) as client:
        assert httpx.get(base + "/health", timeout=10).status_code == 401
        health = client.get("/health")
        health.raise_for_status()
        assert health.json() == dict(ok=True, stub=True, placesLoaded=9)

        def post(path, body):
            response = client.post(path, json=body)
            response.raise_for_status()
            assert response.headers["X-Huddle-Stub"] == "true"
            assert client.post(path, json=body).json() == response.json(), path
            print(f"PASS {path}: authenticated, synthetic, deterministic")
            return response.json()

        print("PASS /health and unauthenticated rejection")
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


if __name__ == "__main__":
    main()
