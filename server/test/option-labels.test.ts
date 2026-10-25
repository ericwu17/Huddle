import { describe, expect, it } from "vitest";
import { labelOptions } from "../../web/src/optionLabels";
import type { AgentOrder, AgentPlan, AgentSuggestion } from "../../web/src/agentData";
import type { CatalogListing } from "../../web/src/catalogData";

const place = (id: string, rating = 4.5, category = "meal", cuisine = "american"): CatalogListing => ({ id, name: id, address: "Berkeley", rating, reviewCount: 100, category, cuisine });
const listings = new Map([place("a", 4.2), place("b", 4.8), place("c", 4.4), place("d", 4.5, "dessert"), place("x", 4.9, "activity")].map(p => [p.id, p]));
const plan = (id: string, ids: string[], travelMinutes = 10, costPerPerson = 20): AgentPlan => ({ id, title: id, whyLine: "", limitations: [], travelMinutes, costPerPerson, costModel: "own_orders",
  stops: ids.map(placeId => ({ placeId, name: placeId, category: listings.get(placeId)!.category as "meal", start: "17:00", end: "18:00", lat: 37.87, lng: -122.26, costPerPerson: 10 })) });
const order = (planId: string, total: number): AgentOrder => ({ id: planId, runId: "run", memberId: "owner-only", planId, items: [], total });
const choices = [plan("p1", ["a", "d"], 12), plan("p2", ["b", "x", "d"], 20), plan("p3", ["c", "d"], 5)];
const has = (rows: ReturnType<typeof labelOptions>, id: string, kind: string) => rows.get(id)!.some(label => label.kind === kind);

describe("current-option comparison labels", () => {
  it("compares whole routes using ratings, personal outing totals, travel and variety", () => {
    const labels = labelOptions(choices, listings, [order("p1", 45), order("p2", 25), order("p3", 10)]);
    expect(has(labels, "p2", "rating")).toBe(true);
    expect(has(labels, "p2", "variety")).toBe(true);
    expect(has(labels, "p3", "price")).toBe(true);
    expect(has(labels, "p3", "travel")).toBe(true);
    expect(labels.get("p1")).toEqual([]);
  });
  it("uses the owner's full outing cost, independently of public cost or other people's meals", () => {
    const a = plan("a", ["a", "d"], 10, 1), b = plan("b", ["b", "d"], 10, 99);
    const labels = labelOptions([a, b], listings, [order("a", 40), order("b", 20)]);
    expect(has(labels, "b", "price")).toBe(true);
    expect(has(labels, "a", "price")).toBe(false);
    const switched = labelOptions([a, b], listings, [order("a", 10), order("b", 30)]);
    expect(has(switched, "a", "price")).toBe(true);
  });
  it("does not invent a cheapest option when one personalized total is missing", () => {
    const labels = labelOptions(choices, listings, [order("p1", 1), order("p2", 2)]);
    expect([...labels.values()].flat().some(label => label.kind === "price")).toBe(false);
  });
  it("does not treat missing ratings as zero or compare incomplete itineraries", () => {
    const partial = new Map(listings); partial.delete("d");
    const labels = labelOptions(choices, partial, []);
    expect([...labels.values()].flat().some(label => label.kind === "rating")).toBe(false);
  });
  it("has no arbitrary winners when all metrics tie or only one option exists", () => {
    const same = [plan("a", ["a", "d"]), plan("b", ["a", "d"])];
    expect([...labelOptions(same, listings, [order("a", 20), order("b", 20)]).values()].flat()).toEqual([]);
    expect(labelOptions([same[0]], listings, []).get("a")).toEqual([]);
  });
  it("awards shared best values to both options instead of using option index", () => {
    const labels = labelOptions([plan("a", ["b"]), plan("b", ["b"]), plan("c", ["a"])], listings, []);
    expect(has(labels, "a", "rating")).toBe(true); expect(has(labels, "b", "rating")).toBe(true);
    expect(labels.get("a")![0].detail).toContain("Tied");
    expect(has(labels, "c", "rating")).toBe(false);
  });
  it("labels untimed venue suggestions without claiming travel convenience", () => {
    const suggestions: AgentSuggestion[] = [{ id: "a", placeId: "a", summary: "", limitations: [] }, { id: "b", placeId: "b", summary: "", limitations: [] }];
    const labels = labelOptions(suggestions, listings, [order("a", 5), order("b", 10)]);
    expect(has(labels, "b", "rating")).toBe(true); expect(has(labels, "a", "price")).toBe(true);
    expect([...labels.values()].flat().some(label => label.kind === "travel")).toBe(false);
  });
  it("handles real zero costs/travel but rejects non-finite and negative totals", () => {
    const labels = labelOptions([plan("a", ["a"], 0), plan("b", ["b"], 5)], listings, [order("a", 0), order("b", 10)]);
    expect(has(labels, "a", "price")).toBe(true); expect(has(labels, "a", "travel")).toBe(true);
    for (const total of [NaN, Infinity, -1]) {
      const bad = labelOptions(choices.slice(0, 2), listings, [order("p1", total), order("p2", 10)]);
      expect([...bad.values()].flat().some(label => label.kind === "price")).toBe(false);
    }
  });
  it("retains legacy uniform-cost comparisons when no personalized cost model exists", () => {
    const a = { ...plan("a", ["a"], 10, 20), costModel: undefined }, b = { ...plan("b", ["b"], 10, 30), costModel: undefined };
    expect(has(labelOptions([a, b], listings, []), "a", "price")).toBe(true);
  });
  it("does not change proposal order, stop order or personal totals", () => {
    const orders = [order("p1", 5), order("p2", 15), order("p3", 20)];
    const before = JSON.stringify({ choices, orders });
    labelOptions(choices, listings, orders);
    expect(JSON.stringify({ choices, orders })).toBe(before);
  });
});
