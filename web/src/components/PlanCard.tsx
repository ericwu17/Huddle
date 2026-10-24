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
      className={`card plan-card plan-${plan.kind} space-y-3 ${selected ? "is-selected" : ""} ${onSelect ? "cursor-pointer" : ""}`}
      onClick={onSelect}
      role={onSelect ? "button" : undefined}
    >
      {recommended && <span className="plan-pick sticker sticker-sun">★ Council's pick</span>}
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="display text-[34px]">{KIND_LABEL[plan.kind]}</h3>
        <span className="sticker sticker-lime text-sm">${plan.costPerPerson}/person</span>
      </div>
      <p className="hand text-xl leading-tight">{pct(plan.robustness)} sure nobody's unhappy</p>
      <ol className="plan-stops text-sm">
        {plan.stops.map((s, i) => (
          <li key={s.placeId}>
            <span className="plan-dot">{i + 1}</span>
            <span>
              <b>{s.name}</b>
              <span className="muted block">
                {s.start}–{s.end} · {s.category} · ${s.costPerPerson}
              </span>
            </span>
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
