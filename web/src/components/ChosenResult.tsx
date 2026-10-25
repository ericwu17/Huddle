import type { AgentChoice } from "../agentBallot";
import type { AgentOrder } from "../agentData";
import { useCatalogListings } from "../catalogData";
import { displayDateParts, displayTime } from "../venueFormatting";
import { AgentPlanCard, AgentSuggestionCard, OptionMap } from "./AgentFlow";
import PlanMap from "./PlanMap";
import GoogleMapsAction from "./GoogleMapsAction";

export default function ChosenResult({ date, choice, order, optionNumber }: {
  date: string | null; choice: AgentChoice; order?: AgentOrder; optionNumber?: number;
}) {
  const listings = useCatalogListings();
  const place = "stops" in choice ? undefined : listings.get(choice.placeId);
  const heading = optionNumber ? `Option ${optionNumber}` : "The chosen plan";
  const stops = "stops" in choice ? choice.stops : [];
  const when = displayDateParts(date);
  const time = stops.length ? `${displayTime(stops[0].start)} – ${displayTime(stops.at(-1)!.end)}` : null;
  return <div className="space-y-4">
    <section className="card card-note when-card" aria-label="When">
      {when ? <div className="when-tile" aria-hidden="true"><span>{when.month}</span><strong>{when.day}</strong></div> : null}
      <div className="min-w-0">
        <p className="when-date">{when ? `${when.weekday}, ${when.full}` : "Date to be decided"}</p>
        <p className="when-time">{time ?? "Time to be decided"}</p>
      </div>
    </section>
    <GoogleMapsAction standalone stops={"stops" in choice ? choice.stops : [{ placeId: choice.placeId, name: place?.name ?? choice.summary, lat: place?.lat, lng: place?.lng }]} />
    {"stops" in choice ? <><OptionMap plan={choice} /><AgentPlanCard plan={choice} order={order} heading={heading} showMapsLink={false} /></>
      : <>{place && Number.isFinite(place.lat) && Number.isFinite(place.lng)
        ? <PlanMap plan={{ stops: [{ placeId: choice.placeId, name: place.name, lat: place.lat!, lng: place.lng! }] }} lines={[]} /> : null}
        <AgentSuggestionCard suggestion={choice} order={order} heading={heading} showMapsLink={false} /></>}
  </div>;
}
