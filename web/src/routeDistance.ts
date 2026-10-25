type Point = { lat: number; lng: number };
// Venue-to-venue straight-line distance. Never label this as a road route.
export function distanceKm(a: Point, b: Point): number {
  const rad = (value: number) => value * Math.PI / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}
export function displayDistance(km: number): string {
  const miles = km / 1.609344;
  return miles < .1 ? `${Math.round(km * 3280.84 / 10) * 10} ft` : `${miles.toFixed(1)} mi`;
}
