import type { Plan, PlanKind, PlanRun } from "./types";

export const KIND_LABEL: Record<PlanKind, string> = {
  safe: "Safe",
  bold: "Bold",
  budget: "Budget",
};

// The plan the group is steered toward: the council's pick unless it fell
// back, otherwise the solver's Safe plan.
export function pickedPlan(planRun: PlanRun): Plan | undefined {
  const plans = planRun.result?.plans ?? [];
  const council = planRun.council;
  if (council && !council.fallbackUsed) {
    const chosen = plans.find((p) => p.id === council.chosenPlanId);
    if (chosen) return chosen;
  }
  return plans.find((p) => p.kind === "safe") ?? plans[0];
}

export function minutesBetween(a: string, b: string) {
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  return bh * 60 + bm - (ah * 60 + am);
}

export function timeAgo(ts: number) {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return `${Math.round(mins / 60)} h ago`;
}

export function pct(x: number) {
  return `${Math.round(x * 100)}%`;
}
