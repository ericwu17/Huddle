import { describe, expect, it } from "vitest";
import { googleMapsUrl, googleMapsEmbedUrl, mapsSegments, DIRECTIONS_MODES, type MapsPlace, type MapsStop } from "../../web/src/googleMaps";

const stops: MapsStop[] = Array.from({ length: 5 }, (_, i) => ({ placeId: `p${i}`, name: `Place ${i}`, lat: 37.87 + i / 1000, lng: -122.26 - i / 1000 }));
const places = new Map<string, MapsPlace>();

describe("Google Maps URLs", () => {
  it("opens a two-stop driving route in its existing order with no API key", () => {
    const url = new URL(googleMapsUrl(stops.slice(0, 2), places)!);
    expect(url.origin).toBe("https://www.google.com"); expect(url.pathname).toBe("/maps/dir/");
    expect(url.searchParams.get("api")).toBe("1"); expect(url.searchParams.get("travelmode")).toBe("driving");
    expect(url.searchParams.get("origin")).toBe("37.87,-122.26");
    expect(url.searchParams.get("destination")).toBe(`${stops[1].lat},${stops[1].lng}`);
    expect(url.searchParams.has("key")).toBe(false); expect(url.searchParams.has("waypoints")).toBe(false);
  });
  it("preserves all five stops with three encoded mobile-compatible waypoints", () => {
    const url = new URL(googleMapsUrl(stops, places)!);
    expect(url.searchParams.get("waypoints")).toBe(stops.slice(1, -1).map(stop => `${stop.lat},${stop.lng}`).join("|"));
    expect(url.searchParams.get("destination")).toBe(`${stops[4].lat},${stops[4].lng}`);
    expect(url.href).toContain("%7C");
  });
  it("opens one venue as a search and encodes its exact name/address and optional Google Place ID", () => {
    const venue = new Map([["p0", { address: "123 University Ave, Berkeley, CA", googlePlaceId: "ChIJ_example" }]]);
    const url = new URL(googleMapsUrl([{ ...stops[0], name: "Café & 茶" }], venue)!);
    expect(url.pathname).toBe("/maps/search/");
    expect(url.searchParams.get("query")).toBe("Café & 茶, 123 University Ave, Berkeley, CA");
    expect(url.searchParams.get("query_place_id")).toBe("ChIJ_example");
  });
  it("falls back to a catalog address when coordinates are absent", () => {
    const url = new URL(googleMapsUrl([{ placeId: "a", name: "Café" }, stops[1]], new Map([["a", { address: "123 Berkeley Ave" }]]))!);
    expect(url.searchParams.get("origin")).toBe("Café, 123 Berkeley Ave");
  });
  it("never silently drops an invalid or unsupported extra stop", () => {
    expect(googleMapsUrl([], places)).toBeNull();
    expect(googleMapsUrl([...stops, { ...stops[0], placeId: "extra" }], places)).toBeNull();
    for (const lat of [NaN, Infinity, 91]) expect(googleMapsUrl([{ ...stops[0], lat }, stops[1]], places)).toBeNull();
    expect(googleMapsUrl([{ ...stops[0], lng: -181 }], places)).toBeNull();
  });
  it("does not include private orders, budgets, prompts, account IDs or participant origins", () => {
    const stop = { ...stops[0], budgetMaxPerPerson: 10, allergies: "PRIVATE_ALLERGY", memberId: "PRIVATE_MEMBER", originLat: 5, prompt: "PRIVATE_PROMPT" };
    const url = googleMapsUrl([stop, stops[1]], places)!;
    expect(url).not.toMatch(/PRIVATE|budget|allerg|member|prompt|originLat/);
  });
  it("refuses overlong address URLs instead of truncating the itinerary", () => {
    expect(googleMapsUrl([{ placeId: "a", name: "a" }], new Map([["a", { address: "x".repeat(2100) }]]))).toBeNull();
  });
});


describe("embedded directions preview", () => {
  it.each(DIRECTIONS_MODES)("requests %s directions and matching external links", mode => {
    const route = stops.slice(0, 2);
    const embedded = new URL(googleMapsEmbedUrl(route, places, mode, "synthetic-browser-key")!);
    const external = new URL(googleMapsUrl(route, places, mode)!);
    expect(embedded.pathname).toBe("/maps/embed/v1/directions");
    expect(embedded.searchParams.get("mode")).toBe(mode);
    expect(embedded.searchParams.get("units")).toBe("imperial");
    expect(embedded.searchParams.get("origin")).toBe(external.searchParams.get("origin"));
    expect(embedded.searchParams.get("destination")).toBe(external.searchParams.get("destination"));
    expect(external.searchParams.get("travelmode")).toBe(mode);
    expect(external.searchParams.has("key")).toBe(false);
  });
  it("keeps every five-stop waypoint and uses place mode for one venue", () => {
    const url = new URL(googleMapsEmbedUrl(stops, places, "driving", "synthetic-browser-key")!);
    expect(url.searchParams.get("waypoints")).toBe(stops.slice(1, -1).map(stop => `${stop.lat},${stop.lng}`).join("|"));
    const single = new URL(googleMapsEmbedUrl(stops.slice(0, 1), places, "driving", "synthetic-browser-key")!);
    expect(single.pathname).toBe("/maps/embed/v1/place");
    expect(single.searchParams.has("origin")).toBe(false);
  });
  it("splits transit into ordered legs without dropping stops or submitting unsupported waypoints", () => {
    expect(googleMapsUrl(stops, places, "transit")).toBeNull();
    expect(googleMapsEmbedUrl(stops, places, "transit", "synthetic-browser-key")).toBeNull();
    const legs = mapsSegments(stops, "transit");
    expect(legs).toHaveLength(4);
    legs.forEach((leg, i) => {
      expect(leg).toEqual([stops[i], stops[i + 1]]);
      const url = new URL(googleMapsEmbedUrl(leg, places, "transit", "synthetic-browser-key")!);
      expect(url.searchParams.has("waypoints")).toBe(false);
      expect(url.searchParams.get("mode")).toBe("transit");
    });
  });
  it("refuses missing keys, invalid points and extra stops; excludes all private data", () => {
    expect(googleMapsEmbedUrl(stops, places, "driving", "")).toBeNull();
    expect(googleMapsEmbedUrl([], places, "driving", "synthetic-browser-key")).toBeNull();
    expect(googleMapsEmbedUrl([{ ...stops[0], lat: Infinity }], places, "driving", "synthetic-browser-key")).toBeNull();
    expect(googleMapsEmbedUrl([...stops, stops[0]], places, "driving", "synthetic-browser-key")).toBeNull();
    const privateStop = { ...stops[0], allergies: "PRIVATE_ALLERGY", memberId: "PRIVATE_MEMBER", prompt: "PRIVATE_PROMPT", originLat: 8 };
    expect(googleMapsEmbedUrl([privateStop, stops[1]], places, "walking", "synthetic-browser-key")).not.toMatch(/PRIVATE|allerg|member|prompt|originLat/);
  });
});
