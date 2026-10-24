// Swipe cards need place details, but the module only sends place ids. Read
// the same list it uses (server/src/lib/places.ts).
// TODO(H8): switch to ../../data/places.json with the module (fake data until then).
import placesData from "../../data/places.fake.json";
import type { Place } from "./types";

export const PLACES = placesData as unknown as Place[];
export const PLACE_BY_ID = new Map(PLACES.map((p) => [p.id, p]));
