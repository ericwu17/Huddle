// City membership is resolved locally using Census polygons, never a nearest
// restaurant or a loose rectangle. See data/geography/README.md for the source.
import { SUPPORTED_CITIES } from "./cities";
import boundaries from "../data/geography/cities.json";
type Ring = number[][];
type Geometry = { type: string; coordinates: Ring[] | Ring[][] };
const features = boundaries.features as { properties: { BASENAME: string }; geometry: Geometry }[];

export function postalCity(address: string | undefined): string {
  return /,\s*([^,]+),\s*(?:CA|California)\b/i.exec(address ?? "")?.[1].trim() ?? "";
}
function inRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inPolygon(lng: number, lat: number, polygon: Ring[]): boolean {
  return inRing(lng, lat, polygon[0]) && !polygon.slice(1).some(hole => inRing(lng, lat, hole));
}
export function cityForPoint(lat: number, lng: number): string | undefined {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  return features.find(({ geometry }) => {
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates as Ring[]] : geometry.coordinates as Ring[][];
    return polygons.some(polygon => inPolygon(lng, lat, polygon));
  })?.properties.BASENAME;
}
export function commonCities(points: { city?: string; lat?: number; lng?: number }[]) {
  const counts = new Map<string, number>();
  for (const point of points) {
    const city = point.city && (SUPPORTED_CITIES as readonly string[]).includes(point.city) ? point.city
      : point.lat !== undefined && point.lng !== undefined ? cityForPoint(point.lat, point.lng) : undefined;
    if (city) counts.set(city, (counts.get(city) ?? 0) + 1);
  }
  const cityCounts = [...counts].map(([city, count]) => ({ city, count })).sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
  const max = cityCounts[0]?.count;
  return { cityCounts, destinationCities: cityCounts.filter(row => row.count === max).map(row => row.city) };
}
