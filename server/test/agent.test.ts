import { describe, expect, it } from "vitest";
import { ConnectionId, Timestamp } from "spacetimedb";
import { createModuleTestHarness, TestAuth } from "spacetimedb/server/test-utils";
import schema, * as api from "../src/index";
import { LIVE_PLACES } from "../src/lib/places";
import { recordCallEvent } from "../src/booking";
import { catalogSnapshot, findPlace, ingestCatalog, MAX_ACTIVE } from "../src/lib/catalog";
import { cents, itemContradictsDiet, orderRequiresProvisional } from "../src/lib/agent-orders";

const internal = TestAuth.internal();
const needs = (cap = 30, hard: any = {}) => ({ hard: { budgetMaxPerPerson: cap, dietary: [], allergies: [],
  vetoCuisines: [], vetoCategories: [], rejectedTerms: [], maxTravelMinutes: null, maxOutingMinutes: null, ...hard },
  preferences: ["a fun outing"], questions: [], warnings: [] });
const response = (data: any) => ({ code: 200, headers: { entries: [] }, version: { tag: "Http11" as const }, body: JSON.stringify(data) });

function result(body: any) {
  const meal = LIVE_PLACES.find(p => p.id === "p_002")!;
  const activity = LIVE_PLACES.find(p => p.id === "p_022")!;
  const stops = [activity, meal].map((p, i) => ({ placeId: p.id, name: p.name, category: p.category,
    lat: p.lat, lng: p.lng, costPerPerson: p.costPerPerson,
    start: i ? "20:00" : "18:00", end: i ? "21:15" : "19:15" }));
  return { mode: "agent", runId: body.runId, inputRevision: body.inputRevision,
    plans: [1, 2].map(i => ({ id: `choice-${i}`, title: `Option ${i}`, stops, costPerPerson: 22,
      whyLine: "A validated catalog itinerary.", limitations: ["Cached estimates."], travelMinutes: 10 })),
    recommendedPlanId: "choice-1", rationale: "A validated catalog itinerary.", conflicts: [], warnings: [] };
}

function setup() {
  const test = createModuleTestHarness(schema, api, { rngSeed: 61n });
  test.clock.set(Timestamp.fromDate(new Date("2026-10-24T00:00:00Z")));
  const users = [0, 1].map(i => ({ auth: TestAuth.fromJwtPayload(JSON.stringify({ iss: "agent-test", sub: `user-${i}` }), new ConnectionId(BigInt(i + 1))), id: "" }));
  const env = { FASTAPI_BASE_URL: "https://coordinator-test.invalid", HUDDLE_SHARED_SECRET: "test-only", STUB_MODE: "false" };
  let intercept: ((body: any) => void) | null = null;
  let extracted = needs();
  let bad = false;
  let transform: ((data: any) => void) | null = null;
  let captured: any;
  const withEnv = (ctx: any): any => new Proxy(Object.create(null), { get(_target, key) {
    if (key === "env") return env;
    if (key === "withTx") return (fn: any) => ctx.withTx((tx: any) => fn(withEnv(tx)));
    const value = Reflect.get(ctx, key, ctx);
    return typeof value === "function" && key !== "random" ? value.bind(ctx) : value;
  } });
  const reduce = (auth: any, fn: (tx: any) => any) => test.withReducerTx(auth, tx => fn(withEnv(tx)));
  const proc = (auth = internal) => withEnv(test.procedureContextBuilder(auth).http((_t: any, req: any, bytes: Uint8Array) => {
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (new URL(req.uri).pathname === "/agent/needs") return response(extracted);
    captured = body;
    intercept?.(body);
    const data = result(body);
    if (bad) data.plans[0].costPerPerson = 1;
    transform?.(data);
    return response(data);
  }).build());
  const group = api.createAgentGroup(proc(users[0].auth), { name: "Agent test" });
  for (const user of users) {
    user.id = api.joinGroup(proc(user.auth), { code: group.code, name: `Name-${users.indexOf(user)}` }).memberId;
    reduce(user.auth, tx => api.setReady(tx, {}));
  }
  function submit(index: number, text = `private-${index}`) {
    reduce(users[index].auth, tx => api.submitAgentPrefs(tx, { text }));
    return [...test.db.agent_needs_job.iter()].at(-1)!;
  }
  function review(index: number, cap = 30, hard: any = {}) {
    extracted = needs(cap, hard);
    const job = submit(index);
    api.runAgentNeedsJob(proc(), { job });
    return test.db.agent_need.memberId.find(users[index].id)!;
  }
  function confirm(index: number) {
    const n = test.db.agent_need.memberId.find(users[index].id)!;
    reduce(users[index].auth, tx => api.confirmAgentNeeds(tx, { revision: n.revision }));
  }
  function save(index: number, hard: any = {}, text = "") {
    reduce(users[index].auth, tx => api.saveAgentPreferences(tx, { text, structuredJson: JSON.stringify({
      budgetMaxPerPerson: null, maxOutingMinutes: null, dietary: [], allergies: [], ...hard,
    }) }));
    return test.db.agent_need.memberId.find(users[index].id)!;
  }
  function ready() { for (let i = 0; i < users.length; i++) { review(i); confirm(i); } }
  function start() {
    reduce(users[0].auth, tx => api.findAgentPlans(tx, {}));
    return [...test.db.agent_plan_job.iter()].at(-1)!;
  }
  function plan() { const job = start(); api.runAgentPlanJob(proc(), { job }); return job.runId; }
  function vote(index: number, runId: string, planId = "choice-1") {
    reduce(users[index].auth, tx => api.castVote(tx, { runId, planId }));
  }
  function book(index: number, runId: string) {
    return reduce(users[index].auth, tx => api.startBooking(tx, { runId, planId: "choice-1", stopIndex: 1 }));
  }
  return { test, users, group, reduce, proc, submit, review, save, confirm, ready, start, plan, vote, book,
    extraction: (value: typeof extracted) => { extracted = value; },
    intercept: (fn: typeof intercept) => { intercept = fn; }, bad: () => { bad = true; }, captured: () => captured,
    transform: (fn: (data: any) => void) => { transform = fn; } };
}

describe("single coordinator flow", () => {
  it("accepts a current one-meal outing within identical 40-dollar/90-minute limits through voting and booking", () => {
    const s = setup();
    for (let i = 0; i < 2; i++) s.save(i, { budgetMaxPerPerson: 40, maxOutingMinutes: 90 });
    s.transform(data => {
      data.plans = data.plans.slice(0, 1);
      const plan = data.plans[0];
      plan.stops = plan.stops.filter((stop: any) => stop.category === "meal");
      plan.costPerPerson = plan.stops[0].costPerPerson;
      plan.travelMinutes = 0;
    });
    const runId = s.plan();
    expect(s.test.db.agent_session.groupId.find(s.group.groupId)?.status).toBe("ready");
    expect(s.test.db.plan_run.runId.find(runId)?.status).toBe("done");
    s.vote(0, runId); s.vote(1, runId);
    s.reduce(s.users[0].auth, tx => api.startBooking(tx, { runId, planId: "choice-1", stopIndex: 0 }));
    expect(s.test.db.booking.count()).toBe(1n);
  });

  it.each(["too short", "over budget", "allergy", "activity alone"])("does not use a single stop to bypass %s", reason => {
    const s = setup();
    const meal = LIVE_PLACES.find(p => p.id === "p_002")!;
    for (let i = 0; i < 2; i++) s.save(i, { budgetMaxPerPerson: reason === "over budget" ? meal.costPerPerson - 1 : 40,
      maxOutingMinutes: reason === "too short" ? 60 : 90, allergies: reason === "allergy" ? ["peanut"] : [] });
    s.transform(data => {
      data.plans = data.plans.slice(0, 1);
      const plan = data.plans[0];
      plan.stops = plan.stops.filter((stop: any) => stop.category === (reason === "activity alone" ? "activity" : "meal"));
      plan.costPerPerson = plan.stops[0].costPerPerson; plan.travelMinutes = 0;
    });
    const runId = s.plan();
    expect(s.test.db.agent_session.groupId.find(s.group.groupId)?.status).toBe("error");
    expect(() => s.vote(0, runId)).toThrow();
    expect(s.test.db.booking.count()).toBe(0n);
  });

  it("requires every confirmation and host-triggered planning; sends every private prompt", () => {
    const s = setup();
    s.review(0); s.confirm(0);
    expect(() => s.start()).toThrow();
    s.review(1); s.confirm(1);
    expect(() => s.reduce(s.users[1].auth, tx => api.findAgentPlans(tx, {}))).toThrow();
    const runId = s.plan();
    expect(s.captured().members.map((m: any) => m.prompt)).toEqual(["private-0", "private-1"]);
    expect(s.test.db.plan_run.runId.find(runId)?.status).toBe("done");
    expect(s.test.db.group.id.find(s.group.groupId)?.confidence).toBeUndefined();
    expect(s.test.db.swipe.count()).toBe(0n);
  });

  it("exposes only the owner's needs, public readiness and public factual explanation", () => {
    const s = setup(); s.ready(); s.plan();
    for (let i = 0; i < 2; i++) {
      const own = api.my_agent_needs(s.test.viewContext(s.users[i].auth));
      expect(own?.text).toBe(`private-${i}`);
      expect(JSON.stringify(api.my_agent_session(s.test.viewContext(s.users[i].auth)))).not.toContain("private-");
      expect(api.my_council_messages(s.test.viewContext(s.users[i].auth)).map(m => m.text).join(" ")).not.toContain("private-");
    }
  });

  it("keeps established caps even if a later model extraction raises/removes them", () => {
    const s = setup(); s.review(0, 20); s.confirm(0); s.review(0, 50);
    const saved = JSON.parse(s.test.db.agent_need.memberId.find(s.users[0].id)!.resultJson!);
    expect(saved.hard.budgetMaxPerPerson).toBe(20);
  });

  it("does not establish a cap until its owner confirms the interpretation", () => {
    const s = setup(); s.review(0, 0);
    expect(s.test.db.private_prefs.memberId.find(s.users[0].id)?.hardJson).toBeUndefined();
    s.review(0, 30); s.confirm(0);
    expect(JSON.parse(s.test.db.private_prefs.memberId.find(s.users[0].id)!.hardJson!).budgetMaxPerPerson).toBe(30);
  });

  it("saves known allergies but blocks unverified food results and invented service totals", () => {
    const s = setup(); s.review(0, 30, { allergies: ["peanuts"] });
    expect(() => s.confirm(0)).not.toThrow();
    s.review(1); s.confirm(1);
    const allergyRun = s.plan();
    expect(s.test.db.plan_run.runId.find(allergyRun)?.status).toBe("error");
    const b = setup(); b.ready(); b.bad(); const run = b.plan();
    expect(b.test.db.plan_run.runId.find(run)?.status).toBe("error");
    expect(api.my_votes(b.test.viewContext(b.users[0].auth))).toEqual([]);
  });

  it("saves empty flexible preferences ready without any interpretation job", () => {
    const s = setup(); const jobs = s.test.db.agent_needs_job.count();
    const saved = s.save(0);
    expect(saved.confirmed).toBe(true);
    expect(JSON.parse(saved.resultJson!).hard.budgetMaxPerPerson).toBeNull();
    expect(JSON.parse(saved.resultJson!).hard.maxOutingMinutes).toBeNull();
    expect(s.test.db.agent_needs_job.count()).toBe(jobs);
    expect(api.my_agent_preferences(s.test.viewContext(s.users[0].auth))?.memberId).toBe(s.users[0].id);
    expect(api.my_agent_preferences(s.test.viewContext(s.users[1].auth))).toBeUndefined();
  });

  it("does not store an exact no-allergies field value as a positive allergy", () => {
    const s = setup(); const saved = s.save(0, { allergies: [" No known allergies "] });
    expect(saved.confirmed).toBe(true);
    expect(JSON.parse(saved.resultJson!).hard.allergies).toEqual([]);
    expect(JSON.parse(saved.resultJson!).warnings).toEqual([]);
  });

  it("treats zero as a real saved cap and preserves it against Flexible or higher edits", () => {
    const s = setup(); s.save(0, { budgetMaxPerPerson: 0 });
    expect(JSON.parse(s.test.db.private_prefs.memberId.find(s.users[0].id)!.hardJson!).budgetMaxPerPerson).toBe(0);
    for (const cap of [null, 30]) {
      const saved = s.save(0, { budgetMaxPerPerson: cap });
      expect(JSON.parse(saved.resultJson!).hard.budgetMaxPerPerson).toBe(0);
      expect(JSON.parse(saved.resultJson!).warnings.join(" ")).toContain("private trade");
    }
  });

  it("rejects malformed controls before changing or invalidating saved preferences", () => {
    const s = setup(); const saved = s.save(0, { budgetMaxPerPerson: 20 });
    for (const structuredJson of ["{broken", "true", "[]", '{"budgetMaxPerPerson":-1}',
      JSON.stringify({ budgetMaxPerPerson: null, maxOutingMinutes: null, dietary: ["invented"], allergies: [] })]) {
      expect(() => s.reduce(s.users[0].auth, tx => api.saveAgentPreferences(tx, { text: "", structuredJson }))).toThrow();
      expect(s.test.db.agent_need.memberId.find(s.users[0].id)?.revision).toBe(saved.revision);
    }
  });

  it("automatically becomes ready after text interpretation while preserving controls the service drops", () => {
    const s = setup();
    s.save(0, { budgetMaxPerPerson: 20, maxOutingMinutes: 180, dietary: ["vegetarian"], allergies: ["peanuts"] }, "quiet please");
    expect(s.test.db.agent_need.memberId.find(s.users[0].id)?.confirmed).toBe(false);
    const job = [...s.test.db.agent_needs_job.iter()].at(-1)!;
    s.extraction(needs(50));
    api.runAgentNeedsJob(s.proc(), { job });
    const saved = s.test.db.agent_need.memberId.find(s.users[0].id)!;
    expect(saved.confirmed).toBe(true);
    expect(JSON.parse(saved.resultJson!).hard).toMatchObject({ budgetMaxPerPerson: 20, maxOutingMinutes: 180,
      dietary: ["vegetarian"], allergies: ["peanuts"] });
    expect(s.test.db.member.id.find(s.users[0].id)?.ready).toBe(true);
  });

  it("keeps targeted questions private and not ready, then ignores the stale response after a blank edit", () => {
    const s = setup(); s.save(0, {}, "avoid peanuts maybe");
    const job = [...s.test.db.agent_needs_job.iter()].at(-1)!;
    s.extraction({ ...needs(), questions: ["Is peanuts an allergy or a preference?"] });
    api.runAgentNeedsJob(s.proc(), { job });
    expect(s.test.db.agent_need.memberId.find(s.users[0].id)?.confirmed).toBe(false);
    expect(JSON.stringify(api.my_agent_session(s.test.viewContext(s.users[1].auth)))).not.toContain("peanuts");
    s.save(0);
    api.runAgentNeedsJob(s.proc(), { job });
    expect(s.test.db.agent_need.memberId.find(s.users[0].id)?.confirmed).toBe(true);
    expect(JSON.parse(s.test.db.agent_need.memberId.find(s.users[0].id)!.resultJson!).questions).toEqual([]);
  });

  it("rejects plans longer than the outing slider including time between stops", () => {
    const s = setup(); s.save(0, { budgetMaxPerPerson: 30, maxOutingMinutes: 120 }); s.save(1);
    const runId = s.plan(); // mocked result spans 195 minutes, despite only 150 minutes at venues
    expect(s.test.db.plan_run.runId.find(runId)?.status).toBe("error");
  });

  it("rejects an in-flight result after a private prompt update", () => {
    const s = setup(); s.ready(); const job = s.start();
    s.intercept(() => { s.submit(1, "under $10 now"); });
    api.runAgentPlanJob(s.proc(), { job });
    expect(s.test.db.group.id.find(s.group.groupId)?.latestRunId).toBeUndefined();
    expect(s.test.db.plan_run.runId.find(job.runId)?.resultJson).toBeUndefined();
    expect(s.test.db.agent_need.memberId.find(s.users[1].id)?.confirmed).toBe(false);
  });

  it("rejects stale interpretation replies and confirmation revisions", () => {
    const s = setup(); const old = s.submit(0, "old private prompt");
    s.submit(0, "new private prompt");
    api.runAgentNeedsJob(s.proc(), { job: old });
    expect(s.test.db.agent_need.memberId.find(s.users[0].id)?.resultJson).toBeUndefined();
    expect(() => s.reduce(s.users[0].auth, tx => api.confirmAgentNeeds(tx, { revision: old.revision }))).toThrow();
  });

  it("invalidates votes, spin and queued bookings immediately when a member edits", () => {
    const s = setup(); s.ready(); const run = s.plan(); s.vote(0, run); s.vote(1, run); s.book(0, run);
    const job = [...s.test.db.call_job.iter()].at(-1)!;
    s.submit(1, "under $5 for the whole outing");
    expect(api.my_votes(s.test.viewContext(s.users[0].auth))).toEqual([]);
    expect(() => s.vote(0, run)).toThrow();
    expect(() => api.doRoulette(s.proc(s.users[0].auth), { runId: run })).toThrow();
    api.runCallJob(s.proc(), { job });
    expect(s.test.db.booking.id.find(job.bookingId)?.status).toBe("failed");
  });

  it("keeps each vote secret until everyone has voted, then reveals the whole ballot", () => {
    const s = setup(); s.ready(); const runId = s.plan();
    const view = (i: number) => api.my_votes(s.test.viewContext(s.users[i].auth));
    s.vote(0, runId, "choice-1");
    // The voter sees their own choice; the other phone only learns THAT someone voted.
    expect(view(0).map(v => [v.memberId, v.planId])).toEqual([[s.users[0].id, "choice-1"]]);
    expect(view(1).map(v => [v.memberId, v.planId])).toEqual([[s.users[0].id, "hidden"]]);
    expect(JSON.stringify(view(1))).not.toContain("choice-");
    s.vote(1, runId, "choice-2");
    expect(view(1).map(v => v.planId).sort()).toEqual(["choice-1", "choice-2"]);
    expect(view(0).map(v => v.planId).sort()).toEqual(["choice-1", "choice-2"]);
    // Changing a vote before the ballot completes is also kept private; stored rows are unchanged.
    expect(s.test.db.vote.count()).toBe(2n);
  });

  it("requires a full vote, a winning current plan, and host-only explicit booking", () => {
    const s = setup(); s.ready(); const run = s.plan(); s.vote(0, run);
    expect(() => s.book(0, run)).toThrow();
    s.vote(1, run);
    expect(() => s.book(1, run)).toThrow();
    s.book(0, run);
    expect(() => s.book(0, run)).toThrow();
    expect(s.test.db.booking.count()).toBe(1n);
  });

  it("resolves only complete ties with equal weights and invalidates Spin on a new vote", () => {
    const s = setup(); s.ready(); const run = s.plan(); s.vote(0, run, "choice-1"); s.vote(1, run, "choice-2");
    const choice = api.doRoulette(s.proc(s.users[0].auth), { runId: run });
    const stored = JSON.parse(s.test.db.plan_run.runId.find(run)!.rouletteJson!);
    expect(stored.weights.map((p: any) => p.weight)).toEqual([0.5, 0.5]);
    expect(api.doRoulette(s.proc(s.users[1].auth), { runId: run })).toEqual(choice);
    s.vote(1, run, "choice-1");
    expect(s.test.db.plan_run.runId.find(run)?.rouletteJson).toBeUndefined();
  });

  it("keeps late confirmation history without advancing a newer input revision", () => {
    const s = setup(); s.ready(); const run = s.plan(); s.vote(0, run); s.vote(1, run); s.book(0, run);
    const booking = [...s.test.db.booking.iter()][0];
    s.submit(0, "new requirements");
    s.reduce(internal, tx => recordCallEvent(tx, { bookingId: booking.id, type: "confirmed", slot: "19:00" }));
    expect(s.test.db.group.id.find(s.group.groupId)?.status).toBe("eliciting");
  });
});

describe("live venue catalog", () => {
  const evidence = { sources: [{ source: "gmaps", url: "https://www.google.com/maps/place/x", fetchedAt: "2026-10-24T18:00:00Z",
    rating: 4.4, reviewCount: 1625, extra: "dropped" }] };
  const push = (s: ReturnType<typeof setup>, places: any[], version = "v1") =>
    s.reduce(internal, tx => ingestCatalog(tx, { version, generatedAt: "2026-10-24T18:00:00Z",
      venues: places.map(place => ({ place, evidence })) }));

  it("accepts the bundled catalog as a snapshot and sends it with each coordinator request", () => {
    const s = setup();
    const labeled = LIVE_PLACES.map(p => p.id === "p_004" ? { ...p, label: "Pizza restaurant" } : p);
    expect(push(s, labeled)).toMatchObject({ active: LIVE_PLACES.length, deactivated: 0 });
    expect(s.test.db.catalog_state.id.find(0)?.version).toBe("v1");
    s.ready(); const runId = s.plan();
    expect(s.captured().catalog.version).toBe("v1");
    expect(s.captured().catalog.places).toHaveLength(LIVE_PLACES.length);
    expect(s.captured().catalog.places.find((p: any) => p.id === "p_004").label).toBe("Pizza restaurant");
    expect(s.captured().catalog.evidence.p_002.sources[0]).not.toHaveProperty("extra");
    expect(s.test.db.plan_run.runId.find(runId)?.status).toBe("done");
  });

  it("checks coordinator answers against the pushed snapshot, not the bundled file", () => {
    const s = setup();
    push(s, LIVE_PLACES.map(p => p.id === "p_002" ? { ...p, costPerPerson: p.costPerPerson + 5 } : p));
    s.ready(); const runId = s.plan(); // the fake API answers with bundled costs
    expect(s.test.db.plan_run.runId.find(runId)?.status).toBe("error");
  });

  it("rejects a bad push whole and keeps the last good snapshot", () => {
    const s = setup(); push(s, LIVE_PLACES);
    const p = LIVE_PLACES[0];
    const first = (x: any) => [x, ...LIVE_PLACES.slice(1)];
    const bad: [any[], RegExp][] = [
      [first({ ...p, notInContract: 1 }), /unknown fields: notInContract/], [first({ ...p, category: "bar" }), /category/],
      [first({ ...p, dwellMinutes: 7.5 }), /dwellMinutes/],
      [first({ ...p, label: "x".repeat(101) }), /label/],
      [first({ ...p, hours: { ...(p as any).hours, mon: [["21:00", "11:00"]] } }), /hours/],
      [[...LIVE_PLACES, p], /duplicate id p_001/], [LIVE_PLACES.filter(x => x.category !== "dessert"), /no dessert/],
      [Array.from({ length: MAX_ACTIVE.meal + 1 }, (_, i) => ({ ...p, id: `m_${i}` })).concat(LIVE_PLACES.slice(20)),
        /too many meal/],
    ];
    for (const [places, why] of bad) expect(() => push(s, places, "bad")).toThrow(why);
    expect(() => s.reduce(internal, tx => ingestCatalog(tx, { version: "bad", generatedAt: "soon", venues: [] }))).toThrow();
    expect(s.test.db.catalog_state.id.find(0)?.version).toBe("v1");
    expect(catalogSnapshot(s.test.db as any)?.places).toHaveLength(LIVE_PLACES.length);
  });

  it("deactivates dropped venues but still resolves them for earlier runs", () => {
    const s = setup(); push(s, LIVE_PLACES);
    const fresh = { ...LIVE_PLACES[0], id: "bd_fresh1234", name: "Fresh Spot" };
    expect(push(s, [...LIVE_PLACES.filter(p => p.id !== "p_022"), fresh], "v2")).toMatchObject({ deactivated: 1 });
    const view = api.catalog_venues(s.test.viewContext(s.users[0].auth));
    expect(view.map(v => v.id)).toContain("bd_fresh1234");
    expect(view.map(v => v.id)).not.toContain("p_022");
    expect(api.catalog_status(s.test.viewContext(s.users[1].auth))?.version).toBe("v2");
    expect(findPlace(s.test.db as any, "p_022")?.name).toBe(LIVE_PLACES.find(p => p.id === "p_022")!.name);
  });

  it("falls back to the bundled catalog until anything is pushed", () => {
    const s = setup(); s.ready(); s.plan();
    expect(s.captured()).not.toHaveProperty("catalog");
    expect(api.catalog_status(s.test.viewContext(s.users[0].auth))).toBeUndefined();
  });
});

describe("menu proposals and private own orders", () => {
  const item = (id = "beans", price: number | null = 10, extra: any = {}) => ({ id, name: "Bean plate", section: "Meals",
    description: "Rice and beans", labels: ["vegetarian", "vegan"], price,
    sourceUrl: "https://venue.example/menu", fetchedAt: "2026-10-24T18:00:00Z", ...extra });
  const evidence = (items = [item(), item("large", 20)]) => ({ sources: [], foodStyle: "Mexican",
    menu: { status: "source_menu", items }, photos: [{ url: "https://venue.example/photo.jpg",
      sourceUrl: "https://venue.example", attribution: "Venue website" }] });
  const push = (s: ReturnType<typeof setup>, menu = evidence(), version = "menu-v1") =>
    s.reduce(internal, tx => ingestCatalog(tx, { version, generatedAt: "2026-10-24T18:00:00Z",
      venues: LIVE_PLACES.map(place => ({ place, evidence: place.id === "p_002" ? menu : { sources: [] } })) }));
  const own = (s: ReturnType<typeof setup>, change: (data: any) => void = () => {}) => s.transform(data => {
    data.plans = data.plans.slice(0, 1);
    Object.assign(data.plans[0], { costModel: "own_orders", status: "ready", summary: "One outing with personal meal choices.",
      costRange: { min: 20, max: 30 } });
    data.privateOrders = s.users.map((user, i) => ({ memberId: user.id, planId: "choice-1",
      items: [{ placeId: "p_002", itemId: i ? "large" : "beans" }], total: i ? 30 : 20 }));
    change(data);
  });
  const deniesBooking = (s: ReturnType<typeof setup>, runId: string, planId = "choice-1") => {
    expect(() => s.reduce(s.users[0].auth, tx => api.startBooking(tx, { runId, planId, stopIndex: 1 }))).toThrow();
    expect(() => s.reduce(s.users[0].auth, tx => api.confirmMeetup(tx, { runId, planId }))).toThrow();
    expect(s.test.db.booking.count()).toBe(0n);
    expect(s.test.db.meetup.count()).toBe(0n);
  };
  const deniesActions = (s: ReturnType<typeof setup>, runId: string, planId = "choice-1") => {
    expect(() => s.vote(0, runId, planId)).toThrow();
    expect(() => api.doRoulette(s.proc(s.users[0].auth), { runId })).toThrow();
    deniesBooking(s, runId, planId);
  };

  it("charges each member only their own priced meal plus activity, and keeps order details private", () => {
    const s = setup(); push(s);
    s.save(0, { budgetMaxPerPerson: 20 }); s.save(1, { budgetMaxPerPerson: 30 }); own(s);
    const runId = s.plan();
    const run = s.test.db.plan_run.runId.find(runId)!;
    expect(run.status).toBe("done");
    expect(JSON.parse(run.resultJson!).plans[0]).toMatchObject({ costPerPerson: 22, costRange: { min: 20, max: 30 }, status: "ready" });
    expect(run.resultJson).not.toContain("privateOrders");
    expect(run.resultJson).not.toContain('"itemId"');
    for (let i = 0; i < 2; i++) {
      const orders = api.my_agent_orders(s.test.viewContext(s.users[i].auth));
      expect(orders).toHaveLength(1);
      expect(orders[0]).toMatchObject({ memberId: s.users[i].id, runId, planId: "choice-1", total: i ? 30 : 20 });
      expect(JSON.parse(orders[0].itemsJson)[0].itemId).toBe(i ? "large" : "beans");
    }
    expect(api.my_agent_orders(s.test.viewContext(TestAuth.fromJwtPayload('{"iss":"agent-test","sub":"outsider"}', new ConnectionId(99n))))).toEqual([]);
    s.vote(0, runId); s.vote(1, runId); s.book(0, runId);
    expect(s.test.db.booking.count()).toBe(1n);
  });

  it("adds a selected later dessert to each private total without charging anyone else's meal", () => {
    const s = setup();
    const dessert = LIVE_PLACES.find(place => place.category === "dessert")!;
    const dessertItem = item("sweet", 4, { name: "Sorbet", section: "Desserts", description: "Fruit and sugar" });
    s.reduce(internal, tx => ingestCatalog(tx, { version: "dessert", generatedAt: "2026-10-24T18:00:00Z",
      venues: LIVE_PLACES.map(place => ({ place: place.id === dessert.id ? { ...place, hours: Object.fromEntries(
        ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map(day => [day, [["10:00", "23:59"]]])) } : place,
      evidence: place.id === "p_002" ? evidence() : place.id === dessert.id ? evidence([dessertItem]) : { sources: [] } })) }));
    s.save(0, { budgetMaxPerPerson: 24 }); s.save(1, { budgetMaxPerPerson: 34 });
    own(s, data => {
      data.plans[0].stops.push({ placeId: dessert.id, name: dessert.name, category: "dessert", lat: dessert.lat, lng: dessert.lng,
        costPerPerson: dessert.costPerPerson, start: "22:00", end: `22:${String(dessert.dwellMinutes).padStart(2, "0")}` });
      data.plans[0].costPerPerson += dessert.costPerPerson;
      data.plans[0].costRange = { min: 24, max: 34 };
      for (const row of data.privateOrders) { row.items.push({ placeId: dessert.id, itemId: "sweet" }); row.total += 4; }
    });
    const runId = s.plan();
    expect(s.test.db.plan_run.runId.find(runId)?.status).toBe("done");
    expect(api.my_agent_orders(s.test.viewContext(s.users[0].auth))[0].total).toBe(24);
  });

  it.each(["allergy", "unknown item", "unpriced item", "unsupported diet", "contradictory ingredients"])(
    "allows voting on a provisional %s proposal while keeping booking and Calendar blocked", reason => {
      const s = setup();
      const menu = evidence(reason === "unpriced item" ? [item("beans", null), item("large", 20)] :
        reason === "contradictory ingredients" ? [item("beans", 10, { name: "Chicken plate" }), item("large", 20)] : undefined);
      push(s, menu);
      s.save(0, { budgetMaxPerPerson: 30, allergies: reason === "allergy" ? ["peanut"] : [],
        dietary: reason === "unsupported diet" ? ["kosher"] : reason === "contradictory ingredients" ? ["vegetarian"] : [] });
      s.save(1, { budgetMaxPerPerson: 30 });
      own(s, data => {
        data.plans[0].status = "provisional";
        if (reason === "unknown item") data.privateOrders[0].items[0].itemId = null;
        if (["unknown item", "unpriced item"].includes(reason)) {
          data.privateOrders[0].total = 22; data.plans[0].costRange.min = 22;
        }
      });
      const runId = s.plan();
      expect(s.test.db.plan_run.runId.find(runId)?.status).toBe("done");
      expect(s.test.db.group.id.find(s.group.groupId)?.status).toBe("voting");
      expect(api.my_agent_orders(s.test.viewContext(s.users[0].auth))).toHaveLength(1);
      s.vote(0, runId); s.vote(1, runId);
      expect(api.my_votes(s.test.viewContext(s.users[0].auth))).toHaveLength(2);
      deniesBooking(s, runId);
    });

  it.each(["allergy", "unknown item", "unpriced item", "unsupported diet", "contradictory ingredients"])(
    "rejects a forged ready %s proposal before writing orders", reason => {
      const s = setup();
      push(s, evidence(reason === "unpriced item" ? [item("beans", null), item("large", 20)] :
        reason === "contradictory ingredients" ? [item("beans", 10, { description: "Chicken and rice" }), item("large", 20)] : undefined));
      s.save(0, { budgetMaxPerPerson: 30, allergies: reason === "allergy" ? ["peanut"] : [],
        dietary: reason === "unsupported diet" ? ["kosher"] : reason === "contradictory ingredients" ? ["vegetarian"] : [] });
      s.save(1, { budgetMaxPerPerson: 30 });
      own(s, data => {
        if (reason === "unknown item") data.privateOrders[0].items[0].itemId = null;
        if (["unknown item", "unpriced item"].includes(reason)) {
          data.privateOrders[0].total = 22; data.plans[0].costRange.min = 22;
        }
      });
      const runId = s.plan();
      expect(s.test.db.plan_run.runId.find(runId)?.status).toBe("error");
      expect(s.test.db.agent_order.count()).toBe(0n); deniesActions(s, runId);
    });

  it("allows selected item labels to support a diet even when the venue tag is absent", () => {
    const s = setup(); push(s); s.save(0, { budgetMaxPerPerson: 30, dietary: ["vegan"] }); s.save(1);
    own(s); const runId = s.plan();
    expect(s.test.db.plan_run.runId.find(runId)?.status).toBe("done");
    expect(() => s.vote(0, runId)).not.toThrow();
  });

  it.each(["missing item", "missing member", "duplicate member", "duplicate item", "other venue", "wrong total", "fractional cent", "over cap", "wrong range", "extra target"])(
    "rejects %s own-order data atomically", reason => {
      const s = setup(); push(s); s.save(0, { budgetMaxPerPerson: 20 }); s.save(1, { budgetMaxPerPerson: 30 });
      own(s, data => {
        const row = data.privateOrders[0];
        if (reason === "missing item") row.items[0].itemId = "invented-id";
        if (reason === "missing member") data.privateOrders.pop();
        if (reason === "duplicate member") data.privateOrders[1].memberId = row.memberId;
        if (reason === "duplicate item") row.items.push({ ...row.items[0] });
        if (reason === "other venue") row.items[0].placeId = "p_003";
        if (reason === "wrong total") row.total = 19;
        if (reason === "fractional cent") row.total = 20.001;
        if (reason === "over cap") { row.items[0].itemId = "large"; row.total = 30; data.plans[0].costRange.min = 30; }
        if (reason === "wrong range") data.plans[0].costRange.max = 31;
        if (reason === "extra target") data.privateOrders.push({ ...row, planId: "invented-target" });
      });
      const runId = s.plan(); expect(s.test.db.plan_run.runId.find(runId)?.status).toBe("error");
      expect(s.test.db.agent_order.count()).toBe(0n);
    });

  it("revalidates current private caps and menu prices before voting and booking", () => {
    for (const changed of ["cap", "price"]) {
      const s = setup(); push(s); s.save(0, { budgetMaxPerPerson: 20 }); s.save(1, { budgetMaxPerPerson: 30 }); own(s);
      const runId = s.plan(); s.vote(0, runId); s.vote(1, runId);
      if (changed === "cap") s.reduce(internal, tx => {
        const pref = tx.db.private_prefs.memberId.find(s.users[0].id)!;
        tx.db.private_prefs.memberId.update({ ...pref, hardJson: JSON.stringify({ ...JSON.parse(pref.hardJson!), budgetMaxPerPerson: 19 }) });
      });
      else push(s, evidence([item("beans", 11), item("large", 20)]), "changed-price");
      deniesActions(s, runId);
    }
  });

  it("hides prior private orders immediately after a normal preference edit", () => {
    const s = setup(); push(s); s.ready(); own(s); const runId = s.plan();
    expect(api.my_agent_orders(s.test.viewContext(s.users[0].auth))).toHaveLength(1);
    s.save(0, { budgetMaxPerPerson: 19 });
    expect(api.my_agent_orders(s.test.viewContext(s.users[0].auth))).toEqual([]);
    expect(api.my_agent_orders(s.test.viewContext(s.users[1].auth))).toEqual([]); deniesActions(s, runId);
  });

  it("allows exploratory votes for untimed suggestions above a cap without booking permission", () => {
    const s = setup(); push(s); s.save(0, { budgetMaxPerPerson: 5 }); s.save(1, { budgetMaxPerPerson: 5 });
    s.transform(data => {
      data.plans = []; data.recommendedPlanId = null;
      data.suggestions = [{ id: "untimed", placeId: "p_002", summary: "A place to discuss after reviewing cost.", limitations: ["Over the current cap."] }];
      data.privateOrders = s.users.map(user => ({ memberId: user.id, planId: "untimed", items: [{ placeId: "p_002", itemId: "beans" }], total: 10 }));
    });
    const runId = s.plan(); expect(s.test.db.plan_run.runId.find(runId)?.status).toBe("done");
    expect(JSON.parse(s.test.db.plan_run.runId.find(runId)!.resultJson!).suggestions).toHaveLength(1);
    expect(api.my_agent_orders(s.test.viewContext(s.users[0].auth))[0].total).toBe(10);
    expect(s.test.db.agent_session.groupId.find(s.group.groupId)?.status).toBe("ready");
    expect(s.test.db.group.id.find(s.group.groupId)?.status).toBe("voting");
    s.vote(0, runId, "untimed"); s.vote(1, runId, "untimed");
    expect(api.my_votes(s.test.viewContext(s.users[0].auth))).toHaveLength(2);
    expect(() => s.reduce(s.users[0].auth, tx => api.postAgentDiscussion(tx, { text: "Let's discuss this venue." }))).not.toThrow();
    deniesBooking(s, runId, "untimed");
  });

  it("accepts explicitly provisional legacy allergy results without inventing private orders", () => {
    const s = setup(); s.save(0, { allergies: ["peanut"] }); s.save(1);
    s.transform(data => { for (const plan of data.plans) plan.status = "provisional"; });
    const runId = s.plan(); expect(s.test.db.plan_run.runId.find(runId)?.status).toBe("done");
    expect(s.test.db.agent_order.count()).toBe(0n);
    s.vote(0, runId, "choice-1"); s.vote(1, runId, "choice-2");
    const picked = api.doRoulette(s.proc(s.users[0].auth), { runId });
    expect(["choice-1", "choice-2"]).toContain(picked.planId);
    expect(api.doRoulette(s.proc(s.users[1].auth), { runId })).toEqual(picked);
    expect(JSON.parse(api.my_plan_runs(s.test.viewContext(s.users[0].auth)).find(run => run.runId === runId)!.rouletteJson!).planId).toBe(picked.planId);
    deniesBooking(s, runId, picked.planId);
  });

  it("accepts null optional cost fields from FastAPI's legacy response serialization", () => {
    const s = setup(); s.ready();
    s.transform(data => {
      for (const plan of data.plans) { plan.costModel = null; plan.costRange = null; plan.rawPrompt = "PRIVATE_EXTRA"; }
      data.privateOrders = []; data.suggestions = []; data.privateCaps = "PRIVATE_EXTRA";
    });
    const runId = s.plan(), run = s.test.db.plan_run.runId.find(runId)!;
    expect(run.status).toBe("done"); expect(run.resultJson).not.toContain("PRIVATE_EXTRA");
    expect(JSON.parse(run.resultJson!).plans[0]).not.toHaveProperty("costModel");
    expect(() => s.vote(0, runId)).not.toThrow();
  });

  it("accepts provider-outage catalog suggestions without inventing a private order or price", () => {
    const s = setup(); s.ready();
    s.transform(data => {
      data.plans = []; data.recommendedPlanId = null; data.privateOrders = [];
      data.suggestions = [{ id: "offline-idea", placeId: "p_002", summary: "A catalog venue to explore.", limitations: ["Coordinator unavailable."] }];
    });
    const runId = s.plan(); expect(s.test.db.plan_run.runId.find(runId)?.status).toBe("done");
    expect(api.my_agent_orders(s.test.viewContext(s.users[0].auth))).toEqual([]);
    s.vote(0, runId, "offline-idea"); s.vote(1, runId, "offline-idea");
    deniesBooking(s, runId, "offline-idea");
  });

  it("supports suggestion-only ties and conversation on an older blocked run without granting booking", () => {
    const s = setup(); s.ready();
    s.transform(data => {
      data.plans = []; data.recommendedPlanId = null;
      data.suggestions = ["p_002", "p_003"].map((placeId, i) => ({ id: `idea-${i}`, placeId,
        summary: "Explore this venue.", limitations: ["No timed plan is verified."] }));
    });
    const runId = s.plan();
    // Previously saved suggestion-only runs were marked blocked. Their current
    // revision and confirmations remain sufficient for an exploratory ballot.
    s.reduce(internal, tx => {
      const session = tx.db.agent_session.groupId.find(s.group.groupId)!;
      tx.db.agent_session.groupId.update({ ...session, status: "blocked" });
    });
    s.vote(0, runId, "idea-0"); s.vote(1, runId, "idea-1");
    expect(api.my_votes(s.test.viewContext(s.users[1].auth))).toHaveLength(2);
    const pick = api.doRoulette(s.proc(s.users[0].auth), { runId });
    expect(["idea-0", "idea-1"]).toContain(pick.planId);
    expect(api.doRoulette(s.proc(s.users[1].auth), { runId })).toEqual(pick);
    expect(api.my_plan_runs(s.test.viewContext(s.users[1].auth)).find(run => run.runId === runId)?.rouletteJson).toBeDefined();
    expect(() => s.reduce(s.users[0].auth, tx => api.postAgentDiscussion(tx, { text: "I prefer the second venue." }))).not.toThrow();
    deniesBooking(s, runId, pick.planId);
  });

  it.each(["revision", "confirmation", "new run", "budget"])("hides provisional votes and Spin after a stale %s", change => {
    const s = setup(); s.ready();
    s.transform(data => { for (const plan of data.plans) plan.status = "provisional"; });
    const runId = s.plan(); s.vote(0, runId, "choice-1"); s.vote(1, runId, "choice-2");
    api.doRoulette(s.proc(s.users[0].auth), { runId });
    s.reduce(internal, tx => {
      if (change === "revision") {
        const session = tx.db.agent_session.groupId.find(s.group.groupId)!;
        tx.db.agent_session.groupId.update({ ...session, revision: session.revision + 1 });
      } else if (change === "confirmation") {
        const need = tx.db.agent_need.memberId.find(s.users[0].id)!;
        tx.db.agent_need.memberId.update({ ...need, confirmed: false });
      } else if (change === "new run") {
        const group = tx.db.group.id.find(s.group.groupId)!;
        tx.db.group.id.update({ ...group, latestRunId: "newer-run" });
      } else {
        const prefs = tx.db.private_prefs.memberId.find(s.users[0].id)!;
        tx.db.private_prefs.memberId.update({ ...prefs,
          hardJson: JSON.stringify({ ...JSON.parse(prefs.hardJson!), budgetMaxPerPerson: 21 }) });
      }
    });
    expect(api.my_votes(s.test.viewContext(s.users[0].auth))).toEqual([]);
    expect(api.my_plan_runs(s.test.viewContext(s.users[0].auth)).find(run => run.runId === runId)?.rouletteJson).toBeUndefined();
    deniesActions(s, runId);
  });

  it("invalidates exploratory suggestion votes after a normal saved budget edit", () => {
    const s = setup(); s.ready();
    s.transform(data => {
      data.plans = []; data.recommendedPlanId = null;
      data.suggestions = ["p_002", "p_003"].map((placeId, i) => ({ id: `idea-${i}`, placeId,
        summary: "Explore this venue.", limitations: ["Affordability is unverified."] }));
    });
    const runId = s.plan(); s.vote(0, runId, "idea-0"); s.vote(1, runId, "idea-1");
    api.doRoulette(s.proc(s.users[0].auth), { runId });
    s.save(0, { budgetMaxPerPerson: 5 });
    expect(api.my_votes(s.test.viewContext(s.users[0].auth))).toEqual([]);
    expect(api.my_plan_runs(s.test.viewContext(s.users[0].auth)).find(run => run.runId === runId)?.rouletteJson).toBeUndefined();
    deniesActions(s, runId, "idea-0");
  });

  it("keeps an empty current result blocked instead of creating an empty ballot", () => {
    const s = setup(); s.ready();
    s.transform(data => { data.plans = []; data.recommendedPlanId = null; data.suggestions = []; });
    const runId = s.plan();
    expect(s.test.db.agent_session.groupId.find(s.group.groupId)?.status).toBe("blocked");
    expect(s.test.db.group.id.find(s.group.groupId)?.status).toBe("planned");
    expect(() => s.reduce(s.users[0].auth, tx => api.postAgentDiscussion(tx, { text: "No choices." }))).toThrow();
    deniesActions(s, runId);
  });

  it("rejects malformed menu evidence before replacing any catalog rows", () => {
    const s = setup(); push(s);
    const original = s.test.db.venue.id.find("p_002")!.evidenceJson;
    const bad = [
      { ...evidence(), foodStyle: "x".repeat(121) },
      evidence([item(), item()]), evidence(Array.from({ length: 86 }, (_, i) => item(`item-${i}`))),
      evidence([item("beans", 10.001)]), evidence([item("beans", 10, { sourceUrl: "javascript:alert(1)" })]),
      evidence([item("beans", 10, { fetchedAt: "soon" })]),
      { ...evidence(), photos: [{ url: "file:///private/photo.jpg", sourceUrl: "https://venue.example", attribution: "Venue" }] },
      { ...evidence(), photos: Array.from({ length: 4 }, () => evidence().photos[0]) },
    ];
    for (const menu of bad) expect(() => push(s, menu, "invalid")).toThrow(/evidence/);
    expect(s.test.db.catalog_state.id.find(0)?.version).toBe("menu-v1");
    expect(s.test.db.venue.id.find("p_002")!.evidenceJson).toBe(original);
  });

  it("handles decimal cents without rounding and recognizes explicit dietary contradictions", () => {
    expect(cents(19.99)).toBe(1999n); expect(cents(0.001)).toBeNull(); expect(cents(0.1 + 0.2)).toBeNull();
    expect(itemContradictsDiet(item("a", 10, { name: "Chicken salad" }), "vegetarian")).toBe(true);
    expect(itemContradictsDiet(item("a", 10, { name: "Vegan chicken salad" }), "vegan")).toBe(false);
    expect(itemContradictsDiet(item("a", 10, { name: "Oat milk tea" }), "vegan")).toBe(false);
    expect(orderRequiresProvisional({ category: "meal", dietary: [] }, item("a", 10, { labels: ["vegan"] }),
      { dietary: ["vegetarian"], allergies: [] })).toBe(false);
  });
});
