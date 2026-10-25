import { useCatalogListings } from "../catalogData";
import { googleMapsUrl, mapsSegments, type MapsStop } from "../googleMaps";
import { useDirectionsMode } from "../directionsMode";

export default function GoogleMapsAction({ stops, standalone = false }: { stops: readonly MapsStop[]; standalone?: boolean }) {
  const listings = useCatalogListings();
  const [mode] = useDirectionsMode(stops);
  const segments = mapsSegments(stops, mode);
  return <div className="maps-actions">{segments.map((segment, index) => {
    const url = googleMapsUrl(segment, listings, mode);
    return url ? <a key={index} className={`google-maps-link${standalone ? " is-standalone" : ""}`} href={url} target="_blank" rel="noopener noreferrer">
      {segments.length === 1 ? "Click here to see the map!" : `See transit map: stop ${index + 1} → ${index + 2}`}
      <span className="sr-only"> Opens Google Maps in a new tab.</span>
    </a> : null;
  })}</div>;
}
