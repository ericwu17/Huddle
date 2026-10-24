// Walking geometry between stops from the free OSRM foot router run by FOSSGIS
// on OpenStreetMap data (no key). Used by the street map so the route follows
// streets instead of cutting through buildings. Any failure returns null and
// the map falls back to labeled straight lines.

export type WalkRoute = {
  line: [number, number][]; // [lng, lat] along streets
  legMinutes: number[]; // one per leg between consecutive stops
};

type Point = { lat: number; lng: number };

const ROUTER = "https://routing.openstreetmap.de/routed-foot/route/v1/foot";
const cache = new Map<string, Promise<WalkRoute | null>>();

export function walkRoute(stops: Point[]): Promise<WalkRoute | null> {
  if (stops.length < 2) return Promise.resolve(null);
  const coords = stops.map((s) => `${s.lng.toFixed(6)},${s.lat.toFixed(6)}`).join(";");
  let pending = cache.get(coords);
  if (!pending) {
    pending = fetchRoute(coords);
    cache.set(coords, pending);
    // Let a later render retry after a failure instead of caching it forever.
    void pending.then((r) => { if (!r) cache.delete(coords); });
  }
  return pending;
}

async function fetchRoute(coords: string): Promise<WalkRoute | null> {
  try {
    const res = await fetch(`${ROUTER}/${coords}?overview=full&geometries=geojson`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const body = await res.json();
    const route = body?.routes?.[0];
    const line = route?.geometry?.coordinates;
    if (body?.code !== "Ok" || !Array.isArray(line) || line.length < 2) return null;
    const legMinutes = (route.legs ?? []).map((l: { duration?: number }) => Math.max(1, Math.round((l.duration ?? 0) / 60)));
    return { line, legMinutes };
  } catch {
    return null;
  }
}
