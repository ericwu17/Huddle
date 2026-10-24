import { planFitsBudgets } from "./budgets";
import type { Evidence, MenuItem } from "./catalog";

export type PrivateOrder = { memberId: string; planId: string; items: { placeId: string; itemId: string | null }[]; total: number };
export type OrderMember = { memberId: string; needs: { hard: any } };

// Decimal JSON money is authoritative. Reject fractional cents rather than
// rounding an over-budget result down; 19.99 itself remains exactly usable.
export function cents(value: unknown): bigint | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const [mantissa, power = "0"] = value.toString().toLowerCase().split("e");
  const [whole, fraction = ""] = mantissa.split(".");
  const digits = BigInt(whole + fraction), exponent = Number(power) - fraction.length + 2;
  if (exponent >= 0) return digits * 10n ** BigInt(exponent);
  const divisor = 10n ** BigInt(-exponent);
  return digits % divisor === 0n ? digits / divisor : null;
}

const cleanFoodText = (item: MenuItem) => `${item.name} ${item.description}`.toLowerCase()
  .replace(/\b(?:vegan|plant[- ]based|imitation|mock|non[- ]dairy|dairy[- ]free|without|no)\s+[a-z-]+/g, " ")
  .replace(/\b(?:almond|soy|oat|coconut|cashew|rice|hemp)\s+milk\b/g, " ");

export function itemContradictsDiet(item: MenuItem, diet: string): boolean {
  let value = cleanFoodText(item);
  if (diet === "halal") value = value.replace(/\b(?:beef|turkey|lamb)\s+bacon\b/g, " ");
  const meat = /\b(?:beef|pork|chicken|turkey|lamb|duck|steak|bacon|ham|prosciutto|sausage|salami|pepperoni|lard|gelatin|fish|salmon|tuna|shrimp|prawn|crab|lobster|oyster|anchov(?:y|ies))\b/;
  if (diet === "vegetarian") return meat.test(value);
  if (diet === "vegan") return meat.test(value) || /\b(?:milk|cheese|butter|cream|egg|eggs|honey|yogurt|whey|ghee)\b/.test(value);
  if (diet === "gluten_free") return /\b(?:wheat|barley|rye|seitan|couscous|semolina|bulgur)\b/.test(value);
  if (diet === "halal") return /\b(?:pork|bacon|ham|prosciutto|lard)\b/.test(value);
  if (diet === "kosher") return /\b(?:pork|bacon|ham|prosciutto|lard|shrimp|prawn|crab|lobster|oyster)\b/.test(value);
  return false;
}

export function orderRequiresProvisional(place: any, item: MenuItem | null, hard: any): boolean {
  if (place.category === "activity") return false;
  if (!item || item.price == null || hard?.allergies?.length) return true;
  const labels = [...place.dietary, ...item.labels.map(label => label.trim().toLowerCase().replace(/[ -]/g, "_"))];
  if (labels.includes("vegan")) labels.push("vegetarian");
  return (hard?.dietary ?? []).some((diet: string) => itemContradictsDiet(item, diet) ||
    !labels.includes(diet));
}

// Verify immutable item IDs and full own-meal + subsequent-stop costs. Activities
// are shared itinerary costs; another person's alternate meal is not charged.
export function validateOrders(target: { id: string; stops: { placeId: string; category: string }[] }, rows: PrivateOrder[], members: OrderMember[],
  places: any[], evidence: Record<string, Evidence>, enforceCaps: boolean) {
  if (rows.length !== members.length || new Set(rows.map(row => row.memberId)).size !== members.length) return null;
  const valid: PrivateOrder[] = [];
  let requiresProvisional = false;
  for (const member of members) {
    const row = rows.find(order => order.memberId === member.memberId);
    if (!row || row.planId !== target.id || !Array.isArray(row.items) || row.items.length > 3 ||
        new Set(row.items.map(item => item?.placeId)).size !== row.items.length || cents(row.total) === null) return null;
    const food = target.stops.filter(stop => stop.category !== "activity");
    const meals = food.filter(stop => stop.category === "meal"), desserts = food.filter(stop => stop.category === "dessert");
    if (row.items.length !== (meals.length ? 1 : 0) + desserts.length ||
        meals.length && row.items.filter(item => meals.some(stop => stop.placeId === item?.placeId)).length !== 1 ||
        desserts.some(stop => !row.items.some(item => item?.placeId === stop.placeId))) return null;
    let sum = 0n;
    for (const selected of row.items) {
      if (!selected || typeof selected.placeId !== "string" || selected.itemId !== null &&
          (typeof selected.itemId !== "string" || !selected.itemId || selected.itemId.length > 200)) return null;
      const stop = food.find(stop => stop.placeId === selected.placeId), place = stop && places.find(p => p.id === stop.placeId);
      if (!place) return null;
      const item = selected.itemId === null ? null : evidence[place.id]?.menu?.items.find(item => item.id === selected.itemId);
      if (selected.itemId !== null && !item) return null;
      const amount = cents(item?.price ?? place.costPerPerson);
      if (amount === null) return null;
      sum += amount;
      requiresProvisional ||= orderRequiresProvisional(place, item ?? null, member.needs.hard);
    }
    for (const stop of target.stops.filter(stop => stop.category === "activity")) {
      const amount = cents(places.find(p => p.id === stop.placeId)?.costPerPerson);
      if (amount === null) return null;
      sum += amount;
    }
    if (sum !== cents(row.total) || enforceCaps && !planFitsBudgets({ costPerPerson: row.total, stops: [{ costPerPerson: row.total }] }, [{ hard: member.needs.hard }])) return null;
    valid.push({ memberId: member.memberId, planId: target.id, items: row.items.map(item => ({ placeId: item.placeId, itemId: item.itemId })), total: row.total });
  }
  return { orders: valid, requiresProvisional, totals: new Map(valid.map(row => [row.memberId, row.total])) };
}
