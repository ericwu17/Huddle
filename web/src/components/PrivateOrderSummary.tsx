import type { AgentOrder } from "../agentData";
import type { CatalogListing } from "../catalogData";
import type { PlanStop } from "../types";
import { dollars, observedDate } from "../venueFormatting";

export default function PrivateOrderSummary({ order, listings, stops = [], alternative = false }: {
  order?: AgentOrder; listings: Map<string, CatalogListing>; stops?: PlanStop[]; alternative?: boolean;
}) {
  if (!order) return null;
  return <section className="card-note rounded-xl p-4 space-y-3" aria-label="Your private order suggestion">
    <h3 className="font-bold">What you could order <span className="muted font-normal">· private to you</span></h3>
    <ul className="space-y-3">{order.items.map((choice, index) => {
      const place = listings.get(choice.placeId);
      const stop = stops.find(item => item.placeId === choice.placeId);
      const item = choice.itemId ? place?.menu?.items.find(option => option.id === choice.itemId) : undefined;
      const estimate = stop?.costPerPerson ?? place?.costPerPerson;
      return <li key={`${choice.placeId}:${index}`} className="space-y-1">
        <p className="text-sm font-bold">{place?.name ?? stop?.name ?? "Venue"}</p>
        <p>{item?.name ?? (place?.category === "activity" || stop?.category === "activity" ? "Activity estimate" : "Venue estimate")}
          {item?.price != null ? ` · ${dollars(item.price)}` : estimate != null ? ` · estimated ${dollars(estimate)}` : " · price unavailable"}</p>
        {item?.price === null ? <p className="muted">Item price is not listed; the venue estimate is used.</p> : !item && choice.itemId ? <p className="muted">The selected menu item’s details are unavailable; this uses a venue estimate.</p> : null}
        {item ? <p className="muted text-sm"><a className="underline font-bold" href={item.sourceUrl} target="_blank" rel="noopener noreferrer">Menu source ↗</a> · observed {observedDate(item.fetchedAt)}</p> : null}
      </li>;
    })}</ul>
    <p className="font-bold">{alternative ? "Your estimate at this venue" : "Your estimated outing total"}: {dollars(order.total)}</p>
    <p className="muted">{alternative ? "An option to explore, with details still to confirm." : "Your own choices across all stops. Confirm current prices, dietary options and allergy handling with the venue."}</p>
  </section>;
}
