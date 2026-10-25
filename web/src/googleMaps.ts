export const DIRECTIONS_MODES = ["driving", "walking", "transit", "bicycling"] as const;
export type DirectionsMode = typeof DIRECTIONS_MODES[number];
export const directionsLabels: Record<DirectionsMode, string> = {
  driving: "Driving", walking: "Walking", transit: "Public transport", bicycling: "Biking",
};

// Google Maps URLs need no key. Only public venue coordinates/addresses are
// included; private orders, budgets, prompts and participant origins stay out.
export type MapsStop = { placeId: string; name: string; lat?: number; lng?: number };
export type MapsPlace = { address?: string; googlePlaceId?: string; lat?: number; lng?: number };

function point(stop: MapsStop, place?: MapsPlace): string | null {
  const lat = stop.lat ?? place?.lat, lng = stop.lng ?? place?.lng;
  if (typeof lat === "number" && Number.isFinite(lat) && Math.abs(lat) <= 90 &&
      typeof lng === "number" && Number.isFinite(lng) && Math.abs(lng) <= 180) return `${lat},${lng}`;
  return place?.address?.trim() ? `${stop.name}, ${place.address.trim()}` : null;
}

export function googleMapsUrl(stops: readonly MapsStop[], places: ReadonlyMap<string, MapsPlace>, mode: DirectionsMode = "driving"): string | null {
  // Huddle supports 1–5 stops: at most three intermediate waypoints, also
  // within Google's mobile-browser limit. Never silently drop an extra stop.
  if (!stops.length || stops.length > 5 || mode === "transit" && stops.length > 2) return null;
  const points = stops.map(stop => point(stop, places.get(stop.placeId)));
  if (points.some(value => value === null)) return null;
  const url = new URL(stops.length === 1 ? "https://www.google.com/maps/search/" : "https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  if (stops.length === 1) {
    const place = places.get(stops[0].placeId);
    const query = place?.address?.trim() ? `${stops[0].name}, ${place.address.trim()}` : points[0]!;
    url.searchParams.set("query", query);
    if (place?.googlePlaceId) url.searchParams.set("query_place_id", place.googlePlaceId);
  } else {
    url.searchParams.set("origin", points[0]!);
    url.searchParams.set("destination", points.at(-1)!);
    url.searchParams.set("travelmode", mode);
    if (stops.length > 2) url.searchParams.set("waypoints", points.slice(1, -1).join("|"));
  }
  return url.href.length <= 2048 ? url.href : null;
}

// Transit cannot accept intermediate waypoints. Keep every leg visible rather
// than silently omitting a stop or switching transport.
export function mapsSegments(stops: readonly MapsStop[], mode: DirectionsMode): readonly (readonly MapsStop[])[] {
  return mode === "transit" && stops.length > 2 ? stops.slice(1).map((stop, i) => [stops[i], stop]) : [stops];
}

export function googleMapsEmbedUrl(stops: readonly MapsStop[], places: ReadonlyMap<string, MapsPlace>, mode: DirectionsMode, key: string): string | null {
  if (!key || !stops.length || stops.length > 5 || mode === "transit" && stops.length > 2) return null;
  const points = stops.map(stop => point(stop, places.get(stop.placeId)));
  if (points.some(value => value === null)) return null;
  const url = new URL(`https://www.google.com/maps/embed/v1/${stops.length === 1 ? "place" : "directions"}`);
  url.searchParams.set("key", key);
  if (stops.length === 1) url.searchParams.set("q", points[0]!);
  else {
    url.searchParams.set("origin", points[0]!);
    url.searchParams.set("destination", points.at(-1)!);
    url.searchParams.set("mode", mode);
    url.searchParams.set("units", "imperial");
    if (stops.length > 2) url.searchParams.set("waypoints", points.slice(1, -1).join("|"));
  }
  return url.href.length <= 2048 ? url.href : null;
}
