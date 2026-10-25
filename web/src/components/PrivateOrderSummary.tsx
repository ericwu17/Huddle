import type { AgentOrder } from "../agentData";
import type { CatalogListing } from "../catalogData";
import type { PlanStop } from "../types";
import { displayMenuItem, dollars } from "../venueFormatting";

export default function PrivateOrderSummary({ order, listings, stops = [], alternative = false, compact = false }: {
  order?: AgentOrder; listings: Map<string, CatalogListing>; stops?: PlanStop[]; alternative?: boolean; compact?: boolean;
}) {
  if (!order) return null;
  const choices = order.items.map(choice => {
    const place = listings.get(choice.placeId);
    const stop = stops.find(item => item.placeId === choice.placeId);
    const item = choice.itemId ? place?.menu?.items.find(option => option.id === choice.itemId) : undefined;
    return { choice, place, stop, item };
  });
  const allPricesKnown = choices.length > 0 && (!stops.length || choices.length === stops.length) && choices.every(({ item }) => item?.price != null);
  const total = allPricesKnown ? choices.reduce((sum, { item }) => sum + item!.price!, 0) : null;
  if (choices.some(({ place, stop }) => !place && !stop)) return <section className="card-note rounded-xl p-4" role="status">Loading your menu suggestions…</section>;
  const foodChoices = choices.filter(({ place, stop }) => (place?.category ?? stop?.category) !== "activity");
  if (!foodChoices.length) return null;
  return <section className="order-summary card-note" aria-label="Your order suggestions">
    <div className="order-heading"><h3 className="font-bold">Your order</h3>{compact && total != null ? <strong>{dollars(total)}</strong> : null}</div>
    <ul>{foodChoices.map(({ choice, place, stop, item }, index) => <li key={`${choice.placeId}:${index}`} aria-label={place?.name ?? stop?.name}>
        <p className="order-venue">{place?.name ?? stop?.name}</p>
        <p>{item?.name && !/^(?:check at venue|choose at the venue)$/i.test(item.name.trim()) ? displayMenuItem(item.name) : "Up to you"}
          {item?.price != null ? ` · ${dollars(item.price)}` : ""}</p>
      </li>)}</ul>
    {total != null && !compact ? <p className="order-total">{alternative ? "Menu total" : "Your total"}: {dollars(total)}</p> : null}
  </section>;
}
