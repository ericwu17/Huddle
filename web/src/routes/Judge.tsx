import PageHeading from "../components/PageHeading";
import { usePlanRun } from "../data";
import { useGroup } from "../groupContext";
import ConsensusMap from "../components/ConsensusMap";

// A6.7 judge panel. Shows only this member's own posterior (from my_private),
// never anyone else's.
export default function Judge() {
  const { group, mine, agent } = useGroup();
  const runId = group.latestRunId;
  const planRun = usePlanRun(runId);
  if (agent) return <section className="card space-y-3"><h1 className="card-title">One coordinator, validated choices</h1>
    <p>Claude considers this huddle's confirmed private prompts and selects catalog itineraries. Code checks whole-outing budgets, hard restrictions, hours and venue facts.</p>
    <p>Public explanations use verified catalog facts. No Bayesian taste vectors, Monte Carlo confidence or satisfaction percentages are computed for this flow.</p>
    <p>Context revision: {agent.revision}. State: {agent.status}. Booking is simulated; no restaurant is called.</p></section>;
  const result = planRun?.result;

  const range = 3; // bars span theta in [-3, 3]
  const x = (v: number) => `${((Math.max(-range, Math.min(range, v)) + range) / (2 * range)) * 100}%`;

  return (
    <div className="space-y-5">
      <PageHeading lead="Under the" accent="hood" />
      <section className="card space-y-2">
        <h2 className="card-title">Your taste</h2>
        <p className="muted">Posterior mean ± sd. Only you see yours.</p>
        {!mine?.posteriorSummary && <p className="muted">No posterior yet.</p>}
        {mine?.posteriorSummary?.features.map((f) => (
          <div key={f.name} className="text-xs">
            <div className="flex justify-between">
              <span>{f.name}</span>
              <span>
                {f.mean.toFixed(2)} ± {f.sd.toFixed(2)}
              </span>
            </div>
            <div className="relative h-4 overflow-hidden rounded-full border-2 border-[var(--ink)] bg-white">
              <div className="absolute top-0 h-4 w-px bg-[var(--ink)]" style={{ left: "50%" }} />
              <div
                className="absolute top-0 h-4 bg-[var(--sun)]"
                style={{ left: x(f.mean - f.sd), width: `calc(${x(f.mean + f.sd)} - ${x(f.mean - f.sd)})` }}
              />
              <div className="absolute top-0 h-4 w-1.5 bg-[var(--pink)]" style={{ left: x(f.mean) }} />
            </div>
          </div>
        ))}
      </section>

      <section className="card space-y-1 text-sm">
        <h2 className="card-title">Solver stats</h2>
        <p>Group confidence: {group.confidence ?? "–"}</p>
        {result ? (
          <>
            <p>Robustness: {result.plans.map((p) => `${p.kind} ${p.robustness}`).join(", ")}</p>
            <pre className="scrap">{JSON.stringify(result.stats, null, 2)}</pre>
          </>
        ) : (
          <p className="muted">No run yet.</p>
        )}
      </section>

      {result && (
        <section className="card">
          <ConsensusMap pareto={result.pareto} plans={result.plans} size={440} />
        </section>
      )}
    </div>
  );
}
