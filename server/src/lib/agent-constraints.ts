// Hard validation only. These checks do not rank people or score preferences.
import { planFitsBudgets } from "./budgets";

export function clockMinutes(value: unknown): number {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return NaN;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function estimatedTravelMinutes(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const radians = (value: number) => value * Math.PI / 180;
  const distance = Math.sin(radians(b.lat - a.lat) / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(radians(b.lng - a.lng) / 2) ** 2;
  const km = 2 * 6371 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, distance)))) * 1.3;
  return km / (km <= 1.2 ? 4.5 : 18) * 60;
}

type MemberRequirement = { memberId?: string; hard: any };
export function planFitsAgentRequirements(plan: any, members: MemberRequirement[], options: {
  mode?: "proposal" | "selectable"; personalTotals?: Map<string, number>;
} = {}): boolean {
  if (options.mode !== "proposal" && plan?.status === "provisional") return false;
  if (plan?.status !== undefined && !["ready", "provisional"].includes(plan.status)) return false;
  // The public cost remains the sum of catalog estimates. Own-order plans use
  // independently validated private totals for the current members' caps.
  const own = plan?.costModel === "own_orders";
  if (!planFitsBudgets(plan, own ? members.map(m => ({ hard: m.hard ? { budgetMaxPerPerson: null } : null })) : members) ||
      plan.stops.length < 1 || plan.stops.length > 5) return false;
  if (own && members.some(m => !m.memberId || !options.personalTotals?.has(m.memberId) ||
      !planFitsBudgets({ costPerPerson: options.personalTotals.get(m.memberId)!,
        stops: [{ costPerPerson: options.personalTotals.get(m.memberId)! }] }, [m]))) return false;
  // A short dinner can be complete at one meal venue. A tagless activity alone
  // must not sidestep dietary/allergy checks for a requested food outing.
  if (plan.stops.length === 1 && plan.stops[0].category !== "meal") return false;
  if (new Set(plan.stops.map((stop: any) => stop.placeId)).size !== plan.stops.length) return false;
  let previousEnd = -1;
  for (const stop of plan.stops) {
    const start = clockMinutes(stop.start), end = clockMinutes(stop.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < previousEnd || end <= start) return false;
    previousEnd = end;
  }
  const duration = previousEnd - clockMinutes(plan.stops[0].start);
  return members.every(({ hard }) => {
    // No catalog allergen evidence exists yet. A saved allergy is allowed to be
    // Ready, but never turns an unverified food result into a votable plan.
    if (hard?.allergies?.length && plan.stops.some((stop: any) => stop.category !== "activity") &&
        !(options.mode === "proposal" && plan.status === "provisional")) return false;
    const limit = hard?.maxOutingMinutes;
    return limit == null || typeof limit === "number" && Number.isFinite(limit) && limit >= duration;
  });
}
