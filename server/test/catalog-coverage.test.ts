import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { catalogArea, planningSnapshot, MAX_PLANNING, type CatalogSnapshot } from "../src/lib/catalog";

const pool = JSON.parse(readFileSync(new URL("../../data/catalog/cities.json", import.meta.url), "utf8"));
const snapshot: CatalogSnapshot = { version: pool.version, places: pool.venues.map((v: any) => v.place),
  evidence: Object.fromEntries(pool.venues.map((v: any) => [v.place.id, v.evidence])) };

describe("bounded multi-city retrieval", () => {
  it("keeps the whole published pool but sends no more than 160 to the coordinator", () => {
    const original = JSON.stringify(snapshot);
    const selected = planningSnapshot(snapshot)!;
    expect(selected.places.length).toBeLessThanOrEqual(160);
    expect(selected.places.length).toBeLessThan(snapshot.places.length);
    for (const [category, limit] of Object.entries(MAX_PLANNING)) {
      expect(selected.places.filter(p => p.category === category).length).toBeLessThanOrEqual(limit);
      for (const region of ["sf", "oakland", "berkeley"])
        expect(selected.places.some(p => p.category === category && catalogArea(p) === region)).toBe(true);
    }
    expect(new Set(selected.places.map(p => p.id)).size).toBe(selected.places.length);
    expect(Object.keys(selected.evidence).sort()).toEqual(selected.places.map(p => p.id).sort());
    for (const p of selected.places) expect(selected.evidence[p.id]).toEqual(snapshot.evidence[p.id]);
    expect(JSON.stringify(snapshot)).toBe(original);
  });

  it("retains menu-rich venues and is deterministic when database order changes", () => {
    const selected = planningSnapshot(snapshot)!;
    expect(selected).toEqual(planningSnapshot({ ...snapshot, places: [...snapshot.places].reverse() }));
    for (const region of ["sf", "oakland", "berkeley"]) {
      expect(selected.places.filter(p => catalogArea(p) === region).length).toBeGreaterThan(20);
    }
    const before = snapshot.places.filter(p => snapshot.evidence[p.id]?.menu?.items.length);
    const after = new Set(selected.places.map(p => p.id));
    expect(before.filter(p => after.has(p.id)).length).toBeGreaterThan(40);
    expect(planningSnapshot(null)).toBeNull();
  });
});
