import { useCatalogListings } from "../catalogData";
import { googleMapsUrl, type MapsStop } from "../googleMaps";

export default function GoogleMapsAction({ stops, standalone = false }: { stops: readonly MapsStop[]; standalone?: boolean }) {
  const listings = useCatalogListings();
  const url = googleMapsUrl(stops, listings);
  return url ? <a className={`google-maps-link${standalone ? " is-standalone" : ""}`} href={url} target="_blank" rel="noopener noreferrer">
    Click here to see the map!
    <span className="sr-only"> Opens Google Maps in a new tab.</span>
  </a> : null;
}
