import { useMemo, useState } from "react";
import { Link } from "react-router";
import { usePlanRun, useScout } from "../data";
import { useGroup } from "../groupContext";
import type { Plan } from "../types";
import { pickedPlan } from "../plans";
import PlanCard from "../components/PlanCard";
import PlanMap from "../components/PlanMap";
import ConsensusMap from "../components/ConsensusMap";
import CouncilPanel from "../components/council/CouncilPanel";

export default function Plans() {
  const { group, session } = useGroup();
  const runId = group.latestRunId;
  const planRun = usePlanRun(runId);
  const scout = useScout(runId);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!runId) return <p className="muted">No plan yet. Keep swiping until the group is confident.</p>;
  if (planRun === undefined) return <p className="muted">Loading plans…</p>;
  if (planRun === null) return <p className="error">Run {runId} not found.</p>;
  if (planRun.status === "running") return <p className="muted">Planning…</p>;
  if (planRun.status === "error") return <p className="error">Planning failed: {planRun.error}</p>;

  const result = planRun.result!;
  const plans = result.plans;
  if (plans.length === 0) {
    return (
      <div className="space-y-2">
        <p>No feasible plans.</p>
        <pre className="overflow-x-auto bg-gray-50 p-2 text-xs">
          {JSON.stringify(result.relaxationHints, null, 2)}
        </pre>
      </div>
    );
  }

  const picked = pickedPlan(planRun);
  const selected = plans.find((p) => p.id === selectedId) ?? picked ?? plans[0];
  const scoutByPlace = new Map((scout ?? []).map((c) => [c.placeId, c]));

  return (
    <div className="space-y-4">
      {result.warnings.map((w) => (
        <p key={w} className="error">
          {w}
        </p>
      ))}
      <RouteView key={selected.id} plan={selected} />
      {plans.map((p) => (
        <PlanCard
          key={p.id}
          plan={p}
          scout={scoutByPlace}
          selected={p.id === selected.id}
          recommended={planRun.council?.fallbackUsed === false && planRun.council.chosenPlanId === p.id}
          onSelect={() => setSelectedId(p.id)}
        />
      ))}
      <Link className="btn btn-primary block text-center" to={`/g/${session.groupId}/vote`}>
        Go vote
      </Link>
      <CouncilPanel runId={runId} plans={plans} council={planRun.council} />
      <section className="card space-y-2">
        <h2 className="font-semibold">Consensus Map</h2>
        <ConsensusMap pareto={result.pareto} plans={plans} onSelect={setSelectedId} />
      </section>
    </div>
  );
}

// Map for one plan. Straight lines between stops for now.
// TODO(A5): Mapbox walking routes and the 10-min leg warning, once
// server/src/geo.ts exposes routeGeometry / legTimes procedures.
function RouteView({ plan }: { plan: Plan }) {
  const lines = useMemo(
    () =>
      plan.stops
        .slice(1)
        .map((s, i) => [
          [plan.stops[i].lng, plan.stops[i].lat],
          [s.lng, s.lat],
        ] as [number, number][]),
    [plan],
  );
  return <PlanMap plan={plan} lines={lines} />;
}
