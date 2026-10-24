import { useMemo } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "./module_bindings";
import { PLACE_BY_ID } from "./places";
import type { MenuItem, Place, VenuePhoto } from "./types";

type Observation = { source: string; fetchedAt: string; url?: string; rating: number; reviewCount: number };
export type CatalogListing = Pick<Place, "id" | "name" | "address" | "rating" | "reviewCount"> &
  Omit<Partial<Place>, "category"> & { category?: string; observation?: Observation };

const SOURCE_NAMES: Record<string, string> = { gmaps: "Google Maps", yelp: "Yelp", google_places: "Google" };

function publicUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  try { const url = new URL(value); return url.protocol === "https:" ? url.href : undefined; } catch { return; }
}

export function parseCatalogEvidence(json: string): Pick<CatalogListing, "observation" | "foodStyle" | "menu" | "photos"> {
  try {
    const evidence = JSON.parse(json);
    const source = Array.isArray(evidence.sources) ? evidence.sources.find((s: Record<string, unknown>) =>
      s && typeof s === "object" && typeof s.source === "string" && SOURCE_NAMES[s.source] &&
      typeof s.fetchedAt === "string" && Number.isFinite(Date.parse(s.fetchedAt)) &&
      typeof s.rating === "number" && Number.isFinite(s.rating) && s.rating >= 0 && s.rating <= 5 &&
      typeof s.reviewCount === "number" && Number.isInteger(s.reviewCount) && s.reviewCount > 0) : undefined;
    const items: MenuItem[] = Array.isArray(evidence.menu?.items) ? evidence.menu.items.flatMap((item: Record<string, unknown>) => {
      if (!item || typeof item !== "object") return [];
      const sourceUrl = publicUrl(item.sourceUrl);
      if (typeof item.id !== "string" || typeof item.name !== "string" || !item.name.trim() || !sourceUrl ||
        typeof item.fetchedAt !== "string" || !Number.isFinite(Date.parse(item.fetchedAt))) return [];
      return [{ id: item.id, name: item.name, section: typeof item.section === "string" ? item.section : "",
        description: typeof item.description === "string" ? item.description : "",
        labels: Array.isArray(item.labels) ? item.labels.filter((label): label is string => typeof label === "string") : [],
        price: typeof item.price === "number" && Number.isFinite(item.price) && item.price >= 0 ? item.price : null,
        sourceUrl, fetchedAt: item.fetchedAt }];
    }) : [];
    const photos: VenuePhoto[] = Array.isArray(evidence.photos) ? evidence.photos.flatMap((photo: Record<string, unknown>) => {
      if (!photo || typeof photo !== "object") return [];
      const url = publicUrl(photo.url), sourceUrl = publicUrl(photo.sourceUrl);
      return url && sourceUrl && typeof photo.attribution === "string" && photo.attribution.trim()
        ? [{ url, sourceUrl, attribution: photo.attribution }] : [];
    }).slice(0, 3) : [];
    return { observation: source ? { source: SOURCE_NAMES[source.source], fetchedAt: source.fetchedAt,
      url: publicUrl(source.url), rating: source.rating, reviewCount: source.reviewCount } : undefined,
      foodStyle: typeof evidence.foodStyle === "string" && evidence.foodStyle.trim() ? evidence.foodStyle.trim() : undefined,
      menu: typeof evidence.menu?.status === "string" ? { status: evidence.menu.status, items } : undefined,
      photos: photos.length ? photos : undefined };
  } catch { return {}; }
}

// Display data follows the public Maincloud catalog. Never import the large raw
// scrape into the frontend; legacy and pre-publish plans keep their lookup.
export function useCatalogListings() {
  const [rows] = useTable(tables.catalogVenues);
  return useMemo(() => {
    const listings = new Map<string, CatalogListing>(PLACE_BY_ID);
    for (const row of rows) {
      const evidence = parseCatalogEvidence(row.evidenceJson);
      listings.set(row.id, {
        ...listings.get(row.id), ...row, ...evidence,
        rating: evidence.observation?.rating ?? row.rating, reviewCount: evidence.observation?.reviewCount ?? row.reviewCount,
      });
    }
    return listings;
  }, [rows]);
}
