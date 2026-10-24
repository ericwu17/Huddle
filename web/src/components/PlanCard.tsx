import type { Plan, ScoutCheck } from "../types";
import { KIND_LABEL, pct } from "../plans";
import ScoutBadge from "./ScoutBadge";

type Props = {
  plan: Plan;
  scout: Map<string, ScoutCheck>;
  selected?: boolean;
  recommended?: boolean;
  onSelect?: () => void;
};

export default function PlanCard({ plan, scout, selected, recommended, onSelect }: Props) {
  const meal = plan.stops.find((s) => s.category === "meal");
  return (
    <div
      className={`card space-y-2 ${selected ? "border-2 border-black" : ""}`}
      onClick={onSelect}
      role={onSelect ? "button" : undefined}
    >
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold">{KIND_LABEL[plan.kind]}</h3>
        <span>${plan.costPerPerson}/person</span>
      </div>
      {recommended && <p className="text-sm font-semibold">★ Recommended by the council</p>}
      <p className="text-sm">{pct(plan.robustness)} sure nobody's unhappy</p>
      <ol className="space-y-1 text-sm">
        {plan.stops.map((s) => (
          <li key={s.placeId}>
            {s.start}–{s.end} · {s.name} <span className="muted">({s.category}, ${s.costPerPerson})</span>
          </li>
        ))}
      </ol>
      {meal && <ScoutBadge check={scout.get(meal.placeId)} />}
      {plan.whyLine && <p className="muted">{plan.whyLine}</p>}
      {plan.perMember && (
        <ul className="muted">
          {plan.perMember.map((m) => (
            <li key={m.memberId}>
              {m.memberId}: {pct(m.ratioMean)} of ideal (p10 {pct(m.ratioP10)})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
