// Preserve Eric's real catalog while sharing one active synthetic catalog with
// FastAPI in phase zero. STUB_MODE defaults to true on both services.
import stubPlaces from "../../../api/fixtures/places.fake.json";
import livePlaces from "../../../data/places.json";
import legacyPlaces from "../../../data/places.fake.json";

export type Place = {
  id: string;
  name: string;
  category: "meal" | "activity" | "dessert";
  cuisine: string;
  address?: string;
  rating?: number;
  reviewCount?: number;
  lat: number;
  lng: number;
  costPerPerson: number;
  dwellMinutes: number;
  phone: string | null;
  dietary: string[];
};

export const PLACES = stubPlaces as unknown as Place[];
export const LIVE_PLACES = livePlaces as unknown as Place[];
export const placesForMode = (mode?: string) => mode === "false" ? LIVE_PLACES : PLACES;
// Existing runs may still reference the earlier real or pf_* fixture IDs.
export const placeById = (id: string) =>
  [...PLACES, ...LIVE_PLACES, ...(legacyPlaces as unknown as Place[])].find((p) => p.id === id);
