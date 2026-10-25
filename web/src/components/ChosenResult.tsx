import type { AgentChoice } from "../agentBallot";
import type { AgentOrder } from "../agentData";
import { useCatalogListings } from "../catalogData";
import { displayTime } from "../venueFormatting";
import { AgentPlanCard, AgentSuggestionCard, OptionMap } from "./AgentFlow";
import PlanMap from "./PlanMap";

export default function ChosenResult({ date, choice, order, optionNumber }: {
  date: string; choice: AgentChoice; order?: AgentOrder; optionNumber?: number;
}) {
  const listings = useCatalogListings();
  const place = "stops" in choice ? undefined : listings.get(choice.placeId);
  const heading = optionNumber ? `Option ${optionNumber}` : "The chosen plan";
  return <div className="space-y-4">
    <p className="on-sky">{date}{"stops" in choice && choice.stops.length
      ? ` · ${displayTime(choice.stops[0].start)}–${displayTime(choice.stops.at(-1)!.end)} · Berkeley time` : " · Time not set"}</p>
    {"stops" in choice ? <><OptionMap plan={choice} /><AgentPlanCard plan={choice} order={order} heading={heading} /></>
      : <>{place && Number.isFinite(place.lat) && Number.isFinite(place.lng)
        ? <PlanMap plan={{ stops: [{ placeId: choice.placeId, name: place.name, lat: place.lat!, lng: place.lng! }] }} lines={[]} /> : null}
        <AgentSuggestionCard suggestion={choice} order={order} heading={heading} /></>}
  </div>;
}
