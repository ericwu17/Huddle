// One active stub catalog shared with FastAPI. No copied IDs, prices, or names.
// The real-data switch remains a later phase coordinated with the API.
import placesData from "../../../api/fixtures/places.fake.json";

export type Place = {
  id: string;
  name: string;
  category: "meal" | "activity" | "dessert";
  cuisine: string;
  lat: number;
  lng: number;
  costPerPerson: number;
  dwellMinutes: number;
  phone: string | null;
  dietary: string[];
};

export const PLACES = placesData as unknown as Place[];
export const placeById = (id: string) => PLACES.find((p) => p.id === id);
