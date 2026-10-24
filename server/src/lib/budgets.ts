// Outing budgets are private cumulative limits. These guards run on both HTTP
// results and synthetic fallbacks; they never authorize an increase themselves.
export type BudgetMember = { hard?: { budgetMaxPerPerson?: unknown } | null };
type CostPlan = { costPerPerson: number; stops: { costPerPerson: number }[] };

function money(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new Error("invalid nonnegative money value");
  return value;
}

// Compare the decimal representations sent over JSON exactly, including values
// such as 0.1 + 0.2. No rounding down, epsilon allowance, or new dependency.
function aligned(values: number[]): bigint[] {
  const parts = values.map((value) => {
    const [mantissa, exponent = "0"] = money(value).toString().toLowerCase().split("e");
    const [whole, fraction = ""] = mantissa.split(".");
    return { digits: BigInt(whole + fraction), exponent: Number(exponent) - fraction.length };
  });
  const exponent = Math.min(...parts.map((part) => part.exponent));
  return parts.map((part) => part.digits * 10n ** BigInt(part.exponent - exponent));
}

export function planFitsBudgets(plan: CostPlan | null | undefined, members: BudgetMember[]): boolean {
  try {
    if (!plan?.stops?.length || !members.length || members.some((m) => !m.hard)) return false;
    const costs = plan.stops.map((stop) => money(stop.costPerPerson));
    const caps = members.flatMap((member) => {
      const cap = member.hard?.budgetMaxPerPerson;
      return cap == null ? [] : [money(cap)];
    });
    const values = aligned([...costs, money(plan.costPerPerson), ...caps]);
    const total = values.slice(0, costs.length).reduce((sum, value) => sum + value, 0n);
    return total === values[costs.length] && values.slice(costs.length + 1).every((cap) => total <= cap);
  } catch {
    return false;
  }
}

export function preserveBudget(previous: Record<string, any> | null, parsed: Record<string, any>) {
  const hard = { ...parsed };
  const priorCap = previous?.budgetMaxPerPerson;
  const parsedCap = hard.budgetMaxPerPerson;
  if (parsedCap != null) money(parsedCap);
  let preserved = false;
  if (priorCap != null) {
    money(priorCap);
    if (parsedCap == null || parsedCap > priorCap) {
      hard.budgetMaxPerPerson = priorCap;
      preserved = true;
    }
  }
  return { hard, preserved };
}

export function guardPlanResult(result: any, members: BudgetMember[]) {
  const original: any[] = result.plans ?? [];
  const plans = original.filter((plan) => planFitsBudgets(plan, members)).map((plan) => ({ ...plan }));
  if (plans.length && !plans.some((plan) => plan.kind === "safe")) {
    plans.reduce((best, plan) => plan.robustness > best.robustness ? plan : best).kind = "safe";
  }
  const ids = new Set(plans.map((plan) => plan.id));
  return {
    ...result, plans,
    pareto: (result.pareto ?? []).filter((point: any) => ids.has(point.planId)),
    stats: { ...result.stats, feasiblePlans: plans.length },
    warnings: [...(result.warnings ?? []), ...(plans.length !== original.length
      ? ["Plans outside current cumulative outing budgets were removed; no cap was raised."] : [])],
  };
}
