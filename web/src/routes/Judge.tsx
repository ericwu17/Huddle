import { usePlanRun } from "../data";
import { useGroup } from "../groupContext";
import ConsensusMap from "../components/ConsensusMap";

// A6.7 judge panel. Shows only this member's own posterior (from my_private),
// never anyone else's.
export default function Judge() {
  const { group, mine } = useGroup();
  const runId = group.latestRunId;
  const planRun = usePlanRun(runId);
  const result = planRun?.result;

  const range = 3; // bars span theta in [-3, 3]
  const x = (v: number) => `${((Math.max(-range, Math.min(range, v)) + range) / (2 * range)) * 100}%`;

  return (
    <div className="space-y-4">
      <section className="card space-y-2">
        <h2 className="font-semibold">Your taste (posterior mean ± sd)</h2>
        {!mine?.posteriorSummary && <p className="muted">No posterior yet.</p>}
        {mine?.posteriorSummary?.features.map((f) => (
          <div key={f.name} className="text-xs">
            <div className="flex justify-between">
              <span>{f.name}</span>
              <span>
                {f.mean.toFixed(2)} ± {f.sd.toFixed(2)}
              </span>
            </div>
            <div className="relative h-3 bg-gray-100">
              <div className="absolute top-0 h-3 w-px bg-gray-400" style={{ left: "50%" }} />
              <div
                className="absolute top-0 h-3 bg-gray-400"
                style={{ left: x(f.mean - f.sd), width: `calc(${x(f.mean + f.sd)} - ${x(f.mean - f.sd)})` }}
              />
              <div className="absolute top-0 h-3 w-1 bg-black" style={{ left: x(f.mean) }} />
            </div>
          </div>
        ))}
      </section>

      <section className="card space-y-1 text-sm">
        <h2 className="font-semibold">Solver stats</h2>
        <p>Group confidence: {group.confidence ?? "–"}</p>
        {result ? (
          <>
            <p>Robustness: {result.plans.map((p) => `${p.kind} ${p.robustness}`).join(", ")}</p>
            <pre className="overflow-x-auto bg-gray-50 p-2 text-xs">{JSON.stringify(result.stats, null, 2)}</pre>
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
