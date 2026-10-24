import { useMemo, useState } from "react";
import { usePlanRun, useScout } from "../data";
import { useGroup } from "../groupContext";
import type { Plan } from "../types";
import { pickedPlan } from "../plans";
import PlanCard from "../components/PlanCard";
import PlanMap from "../components/PlanMap";
import ConsensusMap from "../components/ConsensusMap";
import CouncilPanel from "../components/council/CouncilPanel";
import { Buddy } from "../doodle/Doodle";
import { AgentPlans } from "../components/AgentFlow";

export default function Plans() {
  const { agent } = useGroup();
  return agent ? <AgentPlans /> : <LegacyPlans />;
}

function LegacyPlans() {
  const { group } = useGroup();
  const runId = group.latestRunId;
  const planRun = usePlanRun(runId);
  const scout = useScout(runId);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!runId) return <p className="on-sky">No plan yet. Keep swiping until the group is confident.</p>;
  if (planRun === undefined) return <p className="on-sky">Loading plans…</p>;
  if (planRun === null) return <p className="error">Run {runId} not found.</p>;
  if (planRun.status === "running") return <Thinking />;
  if (planRun.status === "error") return <p className="error">Planning failed: {planRun.error}</p>;

  const result = planRun.result!;
  const plans = result.plans;
  if (plans.length === 0) {
    return (
      <section className="card space-y-2">
        <h2 className="card-title">No plan fits everyone</h2>
        <pre className="scrap">{JSON.stringify(result.relaxationHints, null, 2)}</pre>
      </section>
    );
  }

  const picked = pickedPlan(planRun);
  const selected = plans.find((p) => p.id === selectedId) ?? picked ?? plans[0];
  const scoutByPlace = new Map((scout ?? []).map((c) => [c.placeId, c]));

  return (
    <div className="space-y-5">
      <h1 className="shout text-[52px]">The plans</h1>
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
      <CouncilPanel runId={runId} plans={plans} council={planRun.council} />
      {group.status === "voting" && <p className="sticker sticker-sun">Voting is open: tap Next when you've read the debate</p>}
      <section className="card space-y-2">
        <h2 className="card-title">Consensus map</h2>
        <ConsensusMap pareto={result.pareto} plans={plans} onSelect={setSelectedId} />
      </section>
    </div>
  );
}

// While the solver runs: the friends argue in the background.
function Thinking() {
  return (
    <section className="card flex items-center gap-4">
      <span className="flex">
        {["Advocate A", "Advocate B", "Advocate C"].map((who, i) => (
          <Buddy key={who} who={who} pose="argue" size={70} boil={i === 1} />
        ))}
      </span>
      <p className="hand text-2xl leading-tight">
        Planning <span className="dots"><i /><i /><i /></span>
      </p>
    </section>
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
