// Place list the module uses for candidate ids, phone numbers and stub plans.
// TODO(H8): switch to ../../../data/places.json once v1 exists (fake data until then).
import placesData from "../../../data/places.fake.json";

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
