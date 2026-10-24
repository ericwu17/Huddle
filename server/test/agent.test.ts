import { describe, expect, it } from "vitest";
import { ConnectionId, Timestamp } from "spacetimedb";
import { createModuleTestHarness, TestAuth } from "spacetimedb/server/test-utils";
import schema, * as api from "../src/index";
import { LIVE_PLACES } from "../src/lib/places";
import { recordCallEvent } from "../src/booking";
import { catalogSnapshot, findPlace, ingestCatalog, MAX_ACTIVE } from "../src/lib/catalog";

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
    expect(push(s, LIVE_PLACES)).toMatchObject({ active: LIVE_PLACES.length, deactivated: 0 });
    expect(s.test.db.catalog_state.id.find(0)?.version).toBe("v1");
    s.ready(); const runId = s.plan();
    expect(s.captured().catalog.version).toBe("v1");
    expect(s.captured().catalog.places).toHaveLength(LIVE_PLACES.length);
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
