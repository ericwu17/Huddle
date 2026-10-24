import { useState } from "react";
import type { ParetoPoint, Plan } from "../types";
import { KIND_LABEL, pct } from "../plans";

type Props = {
  pareto: ParetoPoint[];
  plans: Plan[];
  onSelect?: (planId: string) => void;
  size?: number;
};

// A6.4: scatter of candidate plans, x = meanRatio, y = minRatio. The dial w
// highlights the point maximizing w * minRatio + (1 - w) * meanRatio.
export default function ConsensusMap({ pareto, plans, onSelect, size = 320 }: Props) {
  const [w, setW] = useState(0.5);
  if (pareto.length === 0) return <p className="muted">No candidate plans to map.</p>;

  const pad = 28;
  const sx = (v: number) => pad + v * (size - 2 * pad);
  const sy = (v: number) => size - pad - v * (size - 2 * pad);
  const score = (p: ParetoPoint) => w * p.minRatio + (1 - w) * p.meanRatio;
  const best = pareto.reduce((a, b) => (score(b) > score(a) ? b : a));
  const named = new Map(plans.map((p) => [p.id, p]));

  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-md border">
        <line x1={pad} y1={size - pad} x2={size - pad} y2={size - pad} stroke="#999" />
        <line x1={pad} y1={pad} x2={pad} y2={size - pad} stroke="#999" />
        <text x={size / 2} y={size - 6} textAnchor="middle" fontSize={11}>
          mean ratio (total happiness)
        </text>
        <text x={10} y={size / 2} textAnchor="middle" fontSize={11} transform={`rotate(-90 10 ${size / 2})`}>
          min ratio (unhappiest)
        </text>
        {pareto.map((p) => {
          const plan = named.get(p.planId);
          const isBest = p.planId === best.planId;
          return (
            <g
              key={p.planId}
              onClick={() => plan && onSelect?.(p.planId)}
              style={{ cursor: plan ? "pointer" : "default" }}
            >
              <circle
                cx={sx(p.meanRatio)}
                cy={sy(p.minRatio)}
                r={isBest ? 8 : plan ? 6 : 3}
                fill={isBest ? "#111" : plan ? "#fff" : "#999"}
                stroke="#111"
              />
              {plan && (
                <text x={sx(p.meanRatio) + 9} y={sy(p.minRatio) - 9} fontSize={11}>
                  {KIND_LABEL[plan.kind]}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <label className="block text-sm">
        Fairness dial: total happiness ← → protect the unhappiest ({w.toFixed(2)})
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={w}
          onChange={(e) => setW(Number(e.target.value))}
          className="w-full"
        />
      </label>
      <p className="muted">
        Dial pick: {named.get(best.planId) ? KIND_LABEL[named.get(best.planId)!.kind] : best.planId} · mean{" "}
        {pct(best.meanRatio)} · min {pct(best.minRatio)} · robustness {pct(best.robustness)}
      </p>
    </div>
  );
}
