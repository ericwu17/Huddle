import { postalCity } from "../../../shared/geography";
// Validate a service proposal before persisting any public/private rows. The
// public projection deliberately has no per-member orders, caps or raw prompts.
import { LIVE_PLACES } from "./places";
import { clockMinutes, estimatedTravelMinutes, planFitsAgentRequirements } from "./agent-constraints";
import { cents, validateOrders, type PrivateOrder } from "./agent-orders";

const bounded = (value: any, max: number) => typeof value === "string" && value.length > 0 && value.length <= max;
const texts = (value: any, max: number) => Array.isArray(value) && value.length <= max && value.every(text => bounded(text, 2000));

export function validateAgentResult(data: any, body: any) {
  try {
    return checkedResult(data, body);
  } catch { return null; }
}

function checkedResult(data: any, body: any) {
  const catalog: any[] = body.catalog?.places ?? LIVE_PLACES;
  const evidence = body.catalog?.evidence ?? {};
  if (data?.mode !== "agent" || data.runId !== body.runId || data.inputRevision !== body.inputRevision ||
      !Array.isArray(data.plans) || data.plans.length > 3 || !texts(data.conflicts, 12) || !texts(data.warnings, 12) ||
      !bounded(data.rationale, 8000)) return null;
  const suggestions: any[] = data.suggestions ?? [];
  const orders: PrivateOrder[] = data.privateOrders ?? [];
  if (!Array.isArray(suggestions) || suggestions.length > 6 || !Array.isArray(orders) || orders.length > 108 ||
      orders.some(row => !row || !bounded(row.memberId, 200) || !bounded(row.planId, 200) ||
        !body.members.some((member: any) => member.memberId === row.memberId))) return null;
  const ids = new Set<string>(), validOrders: PrivateOrder[] = [], selectablePlanIds: string[] = [];
  const weekday = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date(`${body.date}T12:00:00Z`).getUTCDay()];
  const allowedPlace = (place: any) => place &&
    (!body.destinationCities?.length || body.destinationCities.includes(postalCity(place.address))) && !body.excludePlaceIds.includes(place.id) && body.members.every((member: any) => {
    const hard = member.needs.hard;
    const label = `${place.name} ${place.cuisine} ${place.category}`.toLocaleLowerCase();
    return !hard.vetoCategories.includes(place.category) && !hard.vetoCuisines.includes(place.cuisine) &&
      !hard.rejectedTerms.some((term: string) => label.includes(term.toLocaleLowerCase()));
  });
  const plans: any[] = [];
  if (data.plans.length && (!body.date || !body.window)) return null;
  for (const plan of data.plans) {
    if (!plan || !bounded(plan.id, 200) || ids.has(plan.id) || !bounded(plan.title, 2000) ||
        !bounded(plan.whyLine, 2000) || !texts(plan.limitations, 20) ||
        typeof plan.travelMinutes !== "number" || !Number.isFinite(plan.travelMinutes) || plan.travelMinutes < 0 ||
        plan.summary !== undefined && !bounded(plan.summary, 4000) ||
        plan.costModel != null && plan.costModel !== "own_orders") return null;
    ids.add(plan.id);
    const own = plan.costModel === "own_orders";
    if (own && !bounded(plan.summary, 4000)) return null;
    const rows = orders.filter(row => row.planId === plan.id);
    const verified = own ? validateOrders(plan, rows, body.members, catalog, evidence, true) : null;
    if (own && (!verified || verified.requiresProvisional && plan.status !== "provisional") || !own && rows.length) return null;
    const checkMembers = body.members.map((member: any) => ({ memberId: member.memberId, hard: member.needs.hard }));
    if (!planFitsAgentRequirements(plan, checkMembers, { mode: "proposal", personalTotals: verified?.totals })) return null;
    if (plan.costRange != null) {
      const { min, max } = plan.costRange ?? {};
      if (!own || cents(min) === null || cents(max) === null || min > max ||
          min !== Math.min(...verified!.orders.map(row => row.total)) || max !== Math.max(...verified!.orders.map(row => row.total))) return null;
    }
    if (clockMinutes(plan.stops[0].start) < clockMinutes(body.window.start) ||
        clockMinutes(plan.stops.at(-1).end) > clockMinutes(body.window.end)) return null;
    if (body.members.some((member: any) => member.needs.hard.maxTravelMinutes != null &&
        (!member.origin || estimatedTravelMinutes(member.origin, plan.stops[0]) > member.needs.hard.maxTravelMinutes))) return null;
    if (plan.stops.some((stop: any, index: number) => index > 0 &&
        clockMinutes(stop.start) - clockMinutes(plan.stops[index - 1].end) + 1e-9 < estimatedTravelMinutes(plan.stops[index - 1], stop))) return null;
    if (body.destinationCities?.length && new Set(plan.stops.map((stop: any) => postalCity(catalog.find(place => place.id === stop.placeId)?.address))).size !== 1) return null;
    const stops: any[] = [];
    for (const stop of plan.stops) {
      const place = catalog.find(place => place.id === stop.placeId);
      const start = clockMinutes(stop.start), end = clockMinutes(stop.end);
      const hours: [string, string][] = place?.hours?.[weekday] ?? [];
      if (!allowedPlace(place) || place.name !== stop.name || place.category !== stop.category || place.lat !== stop.lat || place.lng !== stop.lng ||
          place.costPerPerson !== stop.costPerPerson || end - start !== place.dwellMinutes || !hours.some(([lo, hi]) =>
            clockMinutes(lo) <= start && end <= (hi === "23:59" ? 1440 : clockMinutes(hi))) ||
          !own && plan.status !== "provisional" && place.category !== "activity" && body.members.some((member: any) =>
            !member.needs.hard.dietary.every((diet: string) => place.dietary.includes(diet)))) return null;
      stops.push({ placeId: place.id, name: place.name, category: place.category, lat: place.lat, lng: place.lng,
        start: stop.start, end: stop.end, costPerPerson: place.costPerPerson });
    }
    if (verified) validOrders.push(...verified.orders);
    if (planFitsAgentRequirements(plan, checkMembers, { personalTotals: verified?.totals })) selectablePlanIds.push(plan.id);
    plans.push({ id: plan.id, title: plan.title, stops, costPerPerson: plan.costPerPerson, whyLine: plan.whyLine,
      limitations: [...plan.limitations], travelMinutes: plan.travelMinutes,
      ...(plan.status !== undefined ? { status: plan.status } : {}), ...(plan.summary !== undefined ? { summary: plan.summary } : {}),
      ...(own ? { costModel: "own_orders" } : {}), ...(plan.costRange != null ? { costRange: { ...plan.costRange } } : {}) });
  }
  const cleanSuggestions: any[] = [];
  for (const suggestion of suggestions) {
    if (!suggestion || !bounded(suggestion.id, 200) || ids.has(suggestion.id) || !bounded(suggestion.summary, 4000) || !texts(suggestion.limitations, 20)) return null;
    const place = catalog.find(place => place.id === suggestion.placeId);
    if (!allowedPlace(place)) return null;
    ids.add(suggestion.id);
    const rows = orders.filter(row => row.planId === suggestion.id);
    // A provider-outage venue idea may have no selected meal or private price.
    // If any selections exist, require a complete, independently priced set.
    if (rows.length) {
      const verified = validateOrders({ id: suggestion.id, stops: [{ placeId: place.id, category: place.category }] }, rows, body.members, catalog, evidence, false);
      if (!verified) return null;
      validOrders.push(...verified.orders);
    }
    cleanSuggestions.push({ id: suggestion.id, placeId: place.id, summary: suggestion.summary, limitations: [...suggestion.limitations] });
  }
  if (orders.length !== validOrders.length || orders.some(row => !ids.has(row.planId)) ||
      (plans.length ? !plans.some(plan => plan.id === data.recommendedPlanId) : data.recommendedPlanId !== null)) return null;
  return { data: { mode: "agent", runId: body.runId, inputRevision: body.inputRevision, plans,
    recommendedPlanId: data.recommendedPlanId, rationale: data.rationale, conflicts: [...data.conflicts], warnings: [...data.warnings],
    ...(data.suggestions !== undefined ? { suggestions: cleanSuggestions } : {}) }, privateOrders: validOrders, selectablePlanIds };
}
