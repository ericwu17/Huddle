import { useState } from "react";
import type { CatalogListing } from "../catalogData";
import type { VenuePhoto } from "../types";

function EvidencePhoto({ photo, name }: { photo: VenuePhoto; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  const unnamed = /unknown|does not name|author (?:not|unavailable)/i.test(photo.attribution);
  const credit = unnamed ? /google maps/i.test(photo.attribution) ? "Photo: Google Maps" : /yelp/i.test(photo.attribution) ? "Photo: Yelp" : "Photo source" : photo.attribution;
  return <figure className="min-w-0 space-y-1">
    <img src={photo.url} alt={name} loading="lazy" className="aspect-[4/3] w-full rounded-xl object-cover" onError={() => setFailed(true)} />
    <figcaption className="muted text-xs"><a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">{credit}</a></figcaption>
  </figure>;
}

export default function AgentVenueDetails({ place, name }: { place?: CatalogListing; name: string; lat?: number; lng?: number }) {
  const foodStyle = place?.label || place?.foodStyle || place?.cuisine?.replaceAll("_", " ");
  const specificStyle = foodStyle && !/^(restaurants?|food|meal|establishment|point of interest)$/i.test(foodStyle.trim()) ? foodStyle : null;
  return <div className="space-y-2">
    {place?.photos?.length ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{place.photos.map(photo => <EvidencePhoto key={photo.url} photo={photo} name={name} />)}</div> : null}
    {specificStyle ? <p className="text-sm font-bold">{specificStyle}</p> : null}
    {place?.address ? <p className="text-sm">{place.address}</p> : null}
    {place && Number.isFinite(place.rating) && place.rating > 0 ? <p className="text-sm"><strong>★ {place.rating.toFixed(1)}/5</strong>{place.reviewCount > 0 ? ` · ${place.reviewCount.toLocaleString()} reviews` : ""}</p> : null}
    {place?.dietary?.length && place.category !== "activity" ? <p className="text-sm">Listed dietary options: {place.dietary.map(d => d.replaceAll("_", " ")).join(", ")}</p> : null}
  </div>;
}
