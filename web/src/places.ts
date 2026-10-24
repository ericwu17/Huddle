// Resolve the same stub and real IDs as the module, including earlier runs.
// Active candidate selection stays server-side; this is only a display lookup.
import stubPlaces from "../../api/fixtures/places.fake.json";
import livePlaces from "../../data/places.json";
import legacyPlaces from "../../data/places.fake.json";
import type { Place } from "./types";

export const PLACES = [...stubPlaces, ...livePlaces, ...legacyPlaces] as unknown as Place[];
export const PLACE_BY_ID = new Map(PLACES.map((p) => [p.id, p]));
