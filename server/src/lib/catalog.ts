// Live venue catalog. data/reviews/collect.py pushes a whole validated snapshot to
// POST /catalog; ingestCatalog replaces the active set in one transaction, so a bad push
// changes nothing and the last good snapshot stays live. Each coordinator request carries
// the active snapshot to FastAPI and its answer is checked against that same snapshot, so
// the module and the API always agree on venue ids, names and costs.
import type { ReadDb, Tx } from "./types";
import { LIVE_PLACES, placeById, type Place } from "./places";
import { nowMs, parse } from "./util";

// FastAPI enumerates meal x activity x dessert itineraries; at these caps that takes
// about 0.4 s (measured 2026-10-24 on 13k candidates).
export const MAX_ACTIVE: Record<string, number> = { meal: 80, activity: 50, dessert: 30 };

const CUISINES = ["asian", "latin", "mediterranean", "american", "cafe_dessert", "none"];
const DIETS = ["vegetarian", "vegan", "gluten_free", "halal", "kosher"];
const ASPECTS = ["noise", "crowd", "wait", "value", "romance", "service", "outdoor", "novelty"];
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const SOURCES = ["gmaps", "yelp", "google_places"];
// Exactly the api Place model's fields (extra="forbid"); googlePlaceId is the only optional one.
const REQUIRED = ["id", "name", "category", "cuisine", "address", "lat", "lng", "priceLevel", "costPerPerson",
  "dwellMinutes", "phone", "dietary", "hours", "aspects", "reviewCount", "rating", "sources"];
const CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export type EvidenceSource = { source: string; url: string | null; fetchedAt: string | null;
  rating: number | null; reviewCount: number | null };
export type MenuItem = { id: string; name: string; section: string; description: string; labels: string[];
  price: number | null; sourceUrl: string; fetchedAt: string };
export type Evidence = { sources: EvidenceSource[]; foodStyle?: string;
  menu?: { status: string; items: MenuItem[] }; photos?: { url: string; sourceUrl: string; attribution: string }[] };
export type CatalogSnapshot = { version: string; places: Place[]; evidence: Record<string, Evidence> };

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const sameKeys = (o: Record<string, any>, keys: string[]) =>
  Object.keys(o).length === keys.length && keys.every((k) => k in o);
const webUrl = (value: unknown): value is string => text(value, 2000) &&
  /^https?:\/\/[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::\d{1,5})?(?:[/?#][^\s]*)?$/.test(value);

// The reason a place breaks the contract (docs/CONTRACT.md S5.2), or null.
export function placeProblem(p: any): string | null {
  if (!isObject(p)) return "not an object";
  const unknown = Object.keys(p).filter((k) => k !== "googlePlaceId" && !REQUIRED.includes(k));
  if (unknown.length) return `unknown fields: ${unknown.join(", ")}`;
  const missing = REQUIRED.filter((k) => !(k in p));
  if (missing.length) return `missing fields: ${missing.join(", ")}`;
  if (!text(p.id, 200) || !p.id) return "id";
  if (!text(p.name, 300) || !p.name.trim()) return "name";
  if (!(p.category in MAX_ACTIVE)) return "category";
  if (!CUISINES.includes(p.cuisine)) return "cuisine";
  if (!text(p.address, 500)) return "address";
  if (!num(p.lat) || Math.abs(p.lat) > 90 || !num(p.lng) || Math.abs(p.lng) > 180) return "lat/lng";
  if (p.priceLevel !== null && !(Number.isInteger(p.priceLevel) && p.priceLevel >= 0 && p.priceLevel <= 4))
    return "priceLevel";
  if (!num(p.costPerPerson) || p.costPerPerson < 0) return "costPerPerson";
  if (!Number.isInteger(p.dwellMinutes) || p.dwellMinutes <= 0) return "dwellMinutes";
  if (p.phone !== null && !text(p.phone, 40)) return "phone";
  if (!Array.isArray(p.dietary) || !p.dietary.every((d: unknown) => DIETS.includes(d as string))) return "dietary";
  if (!isObject(p.hours) || !sameKeys(p.hours, DAYS) || !DAYS.every((d) => Array.isArray(p.hours[d]) &&
      p.hours[d].every((pair: any) => Array.isArray(pair) && pair.length === 2 && pair.every((c: any) =>
        typeof c === "string" && CLOCK.test(c)) && pair[0] < pair[1]))) return "hours";
  if (!isObject(p.aspects) || !sameKeys(p.aspects, ASPECTS) || !ASPECTS.every((a) => {
    const v = p.aspects[a];
    return isObject(v) && sameKeys(v, ["mean", "sd"]) && num(v.mean) && v.mean >= 0 && v.mean <= 1 && num(v.sd) && v.sd >= 0;
  })) return "aspects";
  if (!Number.isInteger(p.reviewCount) || p.reviewCount < 0) return "reviewCount";
  if (!num(p.rating) || p.rating < 0 || p.rating > 5) return "rating";
  if (!Array.isArray(p.sources) || p.sources.length > 10 || !p.sources.every((s: unknown) => text(s, 50)))
    return "sources";
  if (p.googlePlaceId !== undefined && p.googlePlaceId !== null && !text(p.googlePlaceId, 300)) return "googlePlaceId";
  return null;
}

// Only known evidence fields survive; anything else in the push is dropped.
export function cleanEvidence(e: any): Evidence | string {
  if (e === undefined || e === null) return { sources: [] };
  if (!isObject(e) || !Array.isArray(e.sources) || e.sources.length > 5) return "evidence.sources";
  const sources: EvidenceSource[] = [];
  for (const s of e.sources) {
    if (!isObject(s) || !SOURCES.includes(s.source)) return "evidence source";
    const url = s.url ?? null, fetchedAt = s.fetchedAt ?? null, rating = s.rating ?? null, reviewCount = s.reviewCount ?? null;
    if (url !== null && !(text(url, 500) && url.startsWith("https://"))) return "evidence url";
    if (fetchedAt !== null && !(text(fetchedAt, 40) && Number.isFinite(Date.parse(fetchedAt)))) return "evidence fetchedAt";
    if (rating !== null && !(num(rating) && rating >= 0 && rating <= 5)) return "evidence rating";
    if (reviewCount !== null && !(Number.isInteger(reviewCount) && reviewCount >= 0)) return "evidence reviewCount";
    sources.push({ source: s.source, url, fetchedAt, rating, reviewCount });
  }
  const result: Evidence = { sources };
  if (e.foodStyle != null) {
    if (!text(e.foodStyle, 120)) return "evidence.foodStyle";
    result.foodStyle = e.foodStyle;
  }
  if (e.menu != null) {
    if (!isObject(e.menu) || !text(e.menu.status, 80) || !Array.isArray(e.menu.items) || e.menu.items.length > 85)
      return "evidence.menu";
    const seen = new Set<string>();
    const items: MenuItem[] = [];
    for (const item of e.menu.items) {
      if (!isObject(item) || !text(item.id, 200) || !item.id || seen.has(item.id) ||
          !text(item.name, 300) || !item.name.trim() || !text(item.section, 200) || !text(item.description, 2000) ||
          !Array.isArray(item.labels) || item.labels.length > 20 || !item.labels.every((label: unknown) => text(label, 80)) ||
          item.price !== null && !(num(item.price) && item.price >= 0 && Number(item.price.toFixed(2)) === item.price) ||
          !webUrl(item.sourceUrl) || !text(item.fetchedAt, 40) || !Number.isFinite(Date.parse(item.fetchedAt)))
        return "evidence.menu.items";
      seen.add(item.id);
      items.push({ id: item.id, name: item.name, section: item.section, description: item.description,
        labels: [...item.labels], price: item.price, sourceUrl: item.sourceUrl, fetchedAt: item.fetchedAt });
    }
    result.menu = { status: e.menu.status, items };
  }
  if (e.photos != null) {
    if (!Array.isArray(e.photos) || e.photos.length > 3 || e.photos.some((photo: any) =>
      !isObject(photo) || !webUrl(photo.url) || !webUrl(photo.sourceUrl) || !text(photo.attribution, 500))) return "evidence.photos";
    result.photos = e.photos.map((photo: any) => ({ url: photo.url, sourceUrl: photo.sourceUrl, attribution: photo.attribution }));
  }
  return result;
}

// Validates the whole push before writing anything. Throws on the first problem.
export function ingestCatalog(tx: Tx, body: any) {
  if (!isObject(body) || !text(body.version, 100) || !body.version) throw new Error("version is required");
  if (!text(body.generatedAt, 40) || !Number.isFinite(Date.parse(body.generatedAt)))
    throw new Error("generatedAt must be an ISO time");
  const limit = Object.values(MAX_ACTIVE).reduce((a, b) => a + b, 0);
  if (!Array.isArray(body.venues) || !body.venues.length || body.venues.length > limit)
    throw new Error(`venues must hold 1-${limit} entries`);
  const counts: Record<string, number> = { meal: 0, activity: 0, dessert: 0 };
  const seen = new Set<string>();
  const clean = body.venues.map((v: any, i: number) => {
    const problem = placeProblem(v?.place);
    if (problem) throw new Error(`venues[${i}]: ${problem}`);
    if (seen.has(v.place.id)) throw new Error(`venues[${i}]: duplicate id ${v.place.id}`);
    seen.add(v.place.id);
    counts[v.place.category] += 1;
    const evidence = cleanEvidence(v.evidence);
    if (typeof evidence === "string") throw new Error(`venues[${i}]: ${evidence}`);
    return { place: v.place as Place, evidence };
  });
  for (const [category, n] of Object.entries(counts)) {
    if (n > MAX_ACTIVE[category]) throw new Error(`too many ${category} venues: ${n} > ${MAX_ACTIVE[category]}`);
    if (!n) throw new Error(`no ${category} venues: the coordinator needs every category`);
  }
  const now = nowMs(tx);
  for (const { place, evidence } of clean) {
    const row = { id: place.id, placeJson: JSON.stringify(place), evidenceJson: JSON.stringify(evidence),
      active: true, version: body.version, updatedAt: now };
    if (tx.db.venue.id.find(place.id)) tx.db.venue.id.update(row); else tx.db.venue.insert(row);
  }
  let deactivated = 0;
  for (const row of Array.from(tx.db.venue.iter())) {
    if (row.active && !seen.has(row.id)) {
      tx.db.venue.id.update({ ...row, active: false, updatedAt: now });
      deactivated += 1;
    }
  }
  const state = { id: 0, version: body.version, generatedAt: body.generatedAt, venueCount: clean.length, updatedAt: now };
  if (tx.db.catalog_state.id.find(0)) tx.db.catalog_state.id.update(state); else tx.db.catalog_state.insert(state);
  return { version: body.version, active: clean.length, deactivated, counts };
}

// The active snapshot, or null while nothing has been pushed (the bundled catalog applies).
export function catalogSnapshot(db: ReadDb): CatalogSnapshot | null {
  const rows = Array.from(db.venue.iter()).filter((r) => r.active).sort((a, b) => a.id.localeCompare(b.id));
  if (!rows.length) return null;
  return { version: db.catalog_state.id.find(0)?.version ?? "unknown",
    places: rows.map((r) => JSON.parse(r.placeJson)),
    evidence: Object.fromEntries(rows.map((r) => [r.id, parse(r.evidenceJson) ?? { sources: [] }])) };
}

export const activePlaces = (db: ReadDb): Place[] => catalogSnapshot(db)?.places ?? LIVE_PLACES;

// Any venue ever pushed (active or not), then the bundled catalogs, so old runs still resolve.
export function findPlace(db: ReadDb, id: string): Place | undefined {
  const row = db.venue.id.find(id);
  return row ? JSON.parse(row.placeJson) : placeById(id);
}
