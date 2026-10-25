import type { CatalogListing } from "./catalogData";
import type { VenuePhoto } from "./types";

type CoverChoice = { id: string } & ({ stops: { placeId: string }[] } | { placeId: string });
export type OptionCover = { place: CatalogListing; photo: VenuePhoto };

// Keep a comparison's covers distinct using real catalog photos: another
// photo of the first stop, then a later stop, before repeating an image.
export function selectOptionCovers(choices: CoverChoice[], listings: ReadonlyMap<string, CatalogListing>) {
  const used = new Set<string>();
  const covers = new Map<string, OptionCover>();
  for (const choice of choices) {
    const ids = "stops" in choice ? choice.stops.map(stop => stop.placeId) : [choice.placeId];
    const candidates = ids.flatMap(id => {
      const place = listings.get(id);
      return place?.photos?.map(photo => ({ place, photo })) ?? [];
    });
    const cover = candidates.find(candidate => !used.has(candidate.photo.url)) ?? candidates[0];
    if (cover) {
      covers.set(choice.id, cover);
      used.add(cover.photo.url);
    }
  }
  return covers;
}
