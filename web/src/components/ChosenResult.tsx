import type { AgentChoice } from "../agentBallot";
import type { AgentOrder } from "../agentData";
import { useCatalogListings } from "../catalogData";
import { displayTime } from "../venueFormatting";
import { AgentPlanCard, AgentSuggestionCard, OptionMap } from "./AgentFlow";
import PlanMap from "./PlanMap";
import GoogleMapsAction from "./GoogleMapsAction";

export default function ChosenResult({ date, choice, order, optionNumber }: {
  date: string | null; choice: AgentChoice; order?: AgentOrder; optionNumber?: number;
}) {
  const listings = useCatalogListings();
  const place = "stops" in choice ? undefined : listings.get(choice.placeId);
  const heading = optionNumber ? `Option ${optionNumber}` : "The chosen plan";
  return <div className="space-y-4">
    <p className="on-sky">{"stops" in choice && choice.stops.length
      ? `${date} · ${displayTime(choice.stops[0].start)}–${displayTime(choice.stops.at(-1)!.end)}` : "Date and time to be decided"}</p>
    <GoogleMapsAction standalone stops={"stops" in choice ? choice.stops : [{ placeId: choice.placeId, name: place?.name ?? choice.summary, lat: place?.lat, lng: place?.lng }]} />
    {"stops" in choice ? <><OptionMap plan={choice} /><AgentPlanCard plan={choice} order={order} heading={heading} showMapsLink={false} /></>
      : <>{place && Number.isFinite(place.lat) && Number.isFinite(place.lng)
        ? <PlanMap plan={{ stops: [{ placeId: choice.placeId, name: place.name, lat: place.lat!, lng: place.lng! }] }} lines={[]} /> : null}
        <AgentSuggestionCard suggestion={choice} order={order} heading={heading} showMapsLink={false} /></>}
  </div>;
}
