import { describe, expect, it } from "vitest";
import { distanceKm, displayDistance } from "../../web/src/routeDistance";
describe("keyless map distance fallback", () => {
  const berkeley = { lat: 37.8715, lng: -122.273 };
  it("shows zero for the same stop and a symmetric real Bay distance", () => {
    const sf = { lat: 37.7749, lng: -122.4194 };
    expect(distanceKm(berkeley, berkeley)).toBe(0);
    expect(distanceKm(berkeley, sf)).toBeGreaterThan(15);
    expect(distanceKm(berkeley, sf)).toBeLessThan(20);
    expect(distanceKm(berkeley, sf)).toBeCloseTo(distanceKm(sf, berkeley), 8);
  });
  it("handles the date line and formats US distances without claiming a travel duration", () => {
    expect(distanceKm({lat: 0, lng: 179.9}, {lat: 0, lng: -179.9})).toBeCloseTo(22.239, 2);
    expect(displayDistance(0)).toBe("0 ft");
    expect(displayDistance(.05)).toBe("160 ft");
    expect(displayDistance(1.609344)).toBe("1.0 mi");
  });
});
