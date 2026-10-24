// Place list the module uses for candidate ids, phone numbers and stub plans.
// data/places.json: v1 from Google Places (fetch_places.py), later v2 from Haydn's review build.
import placesData from "../../../data/places.json";

export type Place = {
  id: string;
  name: string;
  category: "meal" | "activity" | "dessert";
  cuisine: string;
  lat: number;
  lng: number;
  costPerPerson: number;
  dwellMinutes: number;
  phone: string;
  dietary: string[];
};

export const PLACES = placesData as unknown as Place[];
export const placeById = (id: string) => PLACES.find((p) => p.id === id);
