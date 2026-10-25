import { useState } from "react";
import type { CatalogListing } from "../catalogData";
import type { VenuePhoto } from "../types";

function EvidencePhoto({ photo, name, compact }: { photo: VenuePhoto; name: string; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  const unnamed = /unknown|does not name|author (?:not|unavailable)/i.test(photo.attribution);
  const credit = unnamed ? /google maps/i.test(photo.attribution) ? "Photo: Google Maps" : /yelp/i.test(photo.attribution) ? "Photo: Yelp" : "Photo source" : photo.attribution;
  return <figure className="min-w-0 space-y-1">
    <img src={photo.url} alt={name} loading="lazy" className={compact ? "option-cover" : "aspect-[4/3] w-full rounded-xl object-cover"} onError={() => setFailed(true)} />
    <figcaption className="photo-credit"><a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer" title={credit}>{credit}</a></figcaption>
  </figure>;
}

export default function AgentVenueDetails({ place, name, compact = false }: { place?: CatalogListing; name: string; lat?: number; lng?: number; compact?: boolean }) {
  const foodStyle = place?.label || place?.foodStyle || place?.cuisine?.replaceAll("_", " ");
  const specificStyle = foodStyle && !/^(restaurants?|food|meal|establishment|point of interest)$/i.test(foodStyle.trim()) ? foodStyle : null;
  return <div className="space-y-2">
    {place?.photos?.length ? <div className={compact ? "option-photo" : "grid grid-cols-1 gap-3 sm:grid-cols-3"}>{(compact ? place.photos.slice(0, 1) : place.photos).map(photo => <EvidencePhoto key={photo.url} photo={photo} name={name} compact={compact} />)}</div> : null}
    {specificStyle && !compact ? <p className="text-sm font-bold">{specificStyle}</p> : null}
    {place?.address && !compact ? <p className="text-sm">{place.address}</p> : null}
    {place && Number.isFinite(place.rating) && place.rating > 0 ? <p className="text-sm"><strong>★ {place.rating.toFixed(1)}/5</strong>{place.reviewCount > 0 ? ` · ${place.reviewCount.toLocaleString()} reviews` : ""}</p> : null}
    {place?.dietary?.length && place.category !== "activity" && !compact ? <p className="text-sm">Dietary options: {place.dietary.map(d => d.replaceAll("_", " ")).join(", ")}</p> : null}
  </div>;
}
