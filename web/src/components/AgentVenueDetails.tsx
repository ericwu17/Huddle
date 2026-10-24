import { useState } from "react";
import type { CatalogListing } from "../catalogData";
import type { VenuePhoto } from "../types";
import { observedDate } from "../venueFormatting";

function EvidencePhoto({ photo, name }: { photo: VenuePhoto; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <figure className="min-w-0 space-y-1">
    <img src={photo.url} alt={name} loading="lazy" className="aspect-[4/3] w-full rounded-xl object-cover" onError={() => setFailed(true)} />
    <figcaption className="muted text-xs"><a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">{photo.attribution}</a></figcaption>
  </figure>;
}

export default function AgentVenueDetails({ place, name, lat, lng }: { place?: CatalogListing; name: string; lat?: number; lng?: number }) {
  const foodStyle = place?.label || place?.foodStyle;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${place?.address ?? `${lat ?? ""},${lng ?? ""}`}`)}${place?.googlePlaceId ? `&query_place_id=${encodeURIComponent(place.googlePlaceId)}` : ""}`;
  return <div className="space-y-2">
    {place?.photos?.length ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{place.photos.map(photo => <EvidencePhoto key={photo.url} photo={photo} name={name} />)}</div> : null}
    {foodStyle ? <p className="text-sm font-bold">{foodStyle}</p> : place?.cuisine ? <p className="text-sm">{place.cuisine.replaceAll("_", " ")}</p> : null}
    {place?.address ? <p className="text-sm">{place.address}</p> : null}
    {place && Number.isFinite(place.rating) && place.rating > 0 ? <p className="text-sm"><strong>★ {place.rating.toFixed(1)}/5</strong>{place.reviewCount > 0 ? ` · ${place.reviewCount.toLocaleString()} reviews` : ""} <span className="muted">· {place.observation ? `${place.observation.source}, observed ${observedDate(place.observation.fetchedAt)}` : "cached catalog rating"}</span></p> : null}
    {place?.dietary?.length && place.category !== "activity" ? <p className="text-sm">Listed dietary options: {place.dietary.map(d => d.replaceAll("_", " ")).join(", ")}</p> : null}
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {place?.observation?.url ? <a className="font-bold underline text-sm" href={place.observation.url} target="_blank" rel="noopener noreferrer">Rating source ↗</a> : null}
      <a className="font-bold underline text-sm" href={mapsUrl} target="_blank" rel="noopener noreferrer">View venue details on Google Maps ↗</a>
    </div>
  </div>;
}
