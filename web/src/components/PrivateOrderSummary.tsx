import type { AgentOrder } from "../agentData";
import type { CatalogListing } from "../catalogData";
import type { PlanStop } from "../types";
import { dollars } from "../venueFormatting";

export default function PrivateOrderSummary({ order, listings, stops = [], alternative = false }: {
  order?: AgentOrder; listings: Map<string, CatalogListing>; stops?: PlanStop[]; alternative?: boolean;
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
  return <section className="card-note rounded-xl p-4 space-y-3" aria-label="Your private order suggestion">
    <h3 className="font-bold">What you could order <span className="muted font-normal">· private to you</span></h3>
    <ul className="space-y-3">{choices.map(({ choice, place, stop, item }, index) => <li key={`${choice.placeId}:${index}`} className="space-y-1">
        <p className="text-sm font-bold">{place?.name ?? stop?.name ?? "Venue"}</p>
        <p>{item?.name ?? (place?.category === "activity" || stop?.category === "activity" ? "Activity" : "Choose at the venue")}
          {item?.price != null ? ` · ${dollars(item.price)}` : ""}</p>
      </li>)}</ul>
    {total != null ? <p className="font-bold">{alternative ? "Listed-item total" : "Your listed-item total"}: {dollars(total)}</p> : null}
  </section>;
}
