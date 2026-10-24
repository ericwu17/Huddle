import { useMemo } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "./module_bindings";
import { PLACE_BY_ID } from "./places";
import type { Place } from "./types";

type Observation = { source: string; fetchedAt: string; url?: string; rating: number; reviewCount: number };
type Listing = Pick<Place, "id" | "name" | "address" | "rating" | "reviewCount"> &
  Partial<Pick<Place, "dietary" | "googlePlaceId">> & { observation?: Observation };

const SOURCE_NAMES: Record<string, string> = { gmaps: "Google Maps", yelp: "Yelp", google_places: "Google" };

function observation(json: string): Observation | undefined {
  try {
    const evidence = JSON.parse(json);
    if (!Array.isArray(evidence.sources)) return;
    const source = evidence.sources.find((s: Record<string, unknown>) =>
      typeof s.source === "string" && SOURCE_NAMES[s.source] &&
      typeof s.fetchedAt === "string" && Number.isFinite(Date.parse(s.fetchedAt)) &&
      typeof s.rating === "number" && Number.isFinite(s.rating) && s.rating >= 0 && s.rating <= 5 &&
      typeof s.reviewCount === "number" && Number.isInteger(s.reviewCount) && s.reviewCount > 0);
    if (!source) return;
    return { source: SOURCE_NAMES[source.source], fetchedAt: source.fetchedAt,
      url: typeof source.url === "string" && source.url.startsWith("https://") ? source.url : undefined,
      rating: source.rating, reviewCount: source.reviewCount };
  } catch { return; }
}

// Display data follows the public Maincloud catalog. Never import the large raw
// scrape into the frontend; legacy and pre-publish plans keep their lookup.
export function useCatalogListings() {
  const [rows] = useTable(tables.catalogVenues);
  return useMemo(() => {
    const listings = new Map<string, Listing>(PLACE_BY_ID);
    for (const row of rows) {
      const observed = observation(row.evidenceJson);
      listings.set(row.id, {
        ...listings.get(row.id), ...row, observation: observed,
        rating: observed?.rating ?? row.rating, reviewCount: observed?.reviewCount ?? row.reviewCount,
      });
    }
    return listings;
  }, [rows]);
}
