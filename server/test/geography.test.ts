import { describe, expect, it } from "vitest";
import { cityForPoint, commonCities, postalCity } from "../../shared/geography";
import { chosenCity } from "../../shared/cities";

describe("participant city selection", () => {
  const berkeley = { lat: 37.8716, lng: -122.2727 }, oakland = { lat: 37.8044, lng: -122.2712 }, sf = { lat: 37.7749, lng: -122.4194 };
  it("uses municipal polygons and never defaults a missing/outside point to Berkeley", () => {
    for (const [point, city] of [[berkeley, "Berkeley"], [oakland, "Oakland"], [sf, "San Francisco"],
      [{ lat: 37.8869, lng: -122.2977 }, "Albany"], [{ lat: 37.8313, lng: -122.2852 }, "Emeryville"]] as const)
      expect(cityForPoint(point.lat, point.lng)).toBe(city);
    expect(cityForPoint(34.05, -118.25)).toBeUndefined();
    expect(cityForPoint(NaN, 0)).toBeUndefined();
    expect(commonCities([{}, {}]).destinationCities).toEqual([]);
  });
  it("selects the most frequent city, keeps ties, and counts each participant once", () => {
    expect(commonCities([oakland, oakland, sf, {}])).toMatchObject({ destinationCities: ["Oakland"],
      cityCounts: [{ city: "Oakland", count: 2 }, { city: "San Francisco", count: 1 }] });
    expect(commonCities([oakland, sf, {}]).destinationCities).toEqual(["Oakland", "San Francisco"]);
    // A manual city preference never becomes a fabricated GPS origin.
    expect(commonCities([{ ...berkeley, city: "San Francisco" }, sf, oakland]).destinationCities).toEqual(["San Francisco"]);
    expect(chosenCity("sf")).toBe("San Francisco");
    expect(chosenCity("Any city")).toBeNull();
    expect(chosenCity("Berke")).toBeUndefined();
    expect(postalCity("123 San Francisco Ave, Berkeley, CA")).toBe("Berkeley");
  });
});
