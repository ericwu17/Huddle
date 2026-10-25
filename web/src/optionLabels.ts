import type { AgentChoice } from "./agentBallot";
import type { AgentOrder } from "./agentData";
import type { CatalogListing } from "./catalogData";

export type OptionLabel = { kind: "rating" | "price" | "travel" | "variety"; text: string; detail: string };
const validNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

// Comparisons describe the current choices; they never rank/rewrite Claude's
// proposals or use another member's private order, cap or location.
export function labelOptions(choices: readonly AgentChoice[], listings: ReadonlyMap<string, CatalogListing>, orders: readonly AgentOrder[]) {
  const labels = new Map<string, OptionLabel[]>(choices.map(choice => [choice.id, []]));
  if (choices.length < 2) return labels;
  const ownOrders = new Map(orders.map(order => [order.planId, order]));
  const metrics = choices.map(choice => {
    const ids = [...new Set("stops" in choice ? choice.stops.map(stop => stop.placeId) : [choice.placeId])];
    const places = ids.map(id => listings.get(id));
    const ratings = places.map(place => place && validNumber(place.rating) && place.rating > 0 && place.rating <= 5 && place.reviewCount > 0 ? place.rating : undefined);
    const rating = ids.length && ratings.every(value => value !== undefined)
      ? Math.round((ratings as number[]).reduce((sum, value) => sum + value, 0) / ids.length * 10) / 10 : undefined;
    const ownTotal = ownOrders.get(choice.id)?.total;
    const price = validNumber(ownTotal) ? Math.round(ownTotal * 100) / 100
      : "stops" in choice && choice.costModel !== "own_orders" && validNumber(choice.costPerPerson) ? Math.round(choice.costPerPerson * 100) / 100 : undefined;
    const travel = "stops" in choice && validNumber(choice.travelMinutes) ? Math.round(choice.travelMinutes) : undefined;
    const categories = "stops" in choice ? choice.stops.map(stop => stop.category) : places.map(place => place?.category);
    const variety = ids.length && categories.every(Boolean) ? new Set(categories).size : undefined;
    return { id: choice.id, rating, price, travel, variety };
  });

  function award(kind: OptionLabel["kind"], direction: "min" | "max", text: string, detail: (value: number) => string) {
    const values = metrics.map(row => row[kind]);
    // A missing price/rating is unknown, never a free or inferior option.
    if (values.some(value => value === undefined)) return;
    const numbers = values as number[];
    const min = Math.min(...numbers), max = Math.max(...numbers);
    if (min === max) return; // No arbitrary winner when everyone ties.
    const best = direction === "min" ? min : max;
    const tied = numbers.filter(value => value === best).length > 1;
    for (const row of metrics) if (row[kind] === best) labels.get(row.id)!.push({ kind, text,
      detail: `${tied ? "Tied for this label. " : ""}${detail(best)}` });
  }
  award("rating", "max", "Highest rated", value => `${value.toFixed(1)}/5 average across all rated stops in this option, compared with the other current options.`);
  award("price", "min", "Cheapest for you", () => "Lowest suggested whole-outing total for your own choices, using current menu prices and venue estimates. Other people's meal costs and private budgets are not compared.");
  award("travel", "min", "Most convenient", value => `About ${value} minutes of estimated travel between stops, the least among these options. Travel from your starting location is not included.`);
  award("variety", "max", "Most variety", () => "The widest mix of meal, dessert and activity stops among these options. This does not claim a place is new to you.");
  return labels;
}
