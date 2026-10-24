import { describe, expect, it } from "vitest";
import { ConnectionId, Timestamp } from "spacetimedb";
import { createModuleTestHarness, TestAuth } from "spacetimedb/server/test-utils";
import schema, * as api from "../src/index";
import { LIVE_PLACES } from "../src/lib/places";
import { recordCallEvent } from "../src/booking";

const internal = TestAuth.internal();
const needs = (cap = 30, hard: any = {}) => ({ hard: { budgetMaxPerPerson: cap, dietary: [], allergies: [],
  vetoCuisines: [], vetoCategories: [], rejectedTerms: [], maxTravelMinutes: null, ...hard },
  preferences: ["a fun outing"], questions: [], warnings: [] });
const response = (data: any) => ({ code: 200, headers: { entries: [] }, version: { tag: "Http11" as const }, body: JSON.stringify(data) });

function result(body: any) {
  const meal = LIVE_PLACES.find(p => p.id === "p_002")!;
  const activity = LIVE_PLACES.find(p => p.id === "p_022")!;
  const stops = [activity, meal].map((p, i) => ({ placeId: p.id, name: p.name, category: p.category,
    lat: p.lat, lng: p.lng, costPerPerson: p.costPerPerson,
    start: i ? "19:00" : "17:00", end: i ? "20:15" : "18:15" }));
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
  return { test, users, group, reduce, proc, submit, review, confirm, ready, start, plan, vote, book,
    intercept: (fn: typeof intercept) => { intercept = fn; }, bad: () => { bad = true; }, captured: () => captured };
}

describe("single coordinator flow", () => {
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

  it("blocks unknown allergy evidence and invented service totals", () => {
    const s = setup(); s.review(0, 30, { allergies: ["peanuts"] });
    expect(() => s.confirm(0)).toThrow();
    const b = setup(); b.ready(); b.bad(); const run = b.plan();
    expect(b.test.db.plan_run.runId.find(run)?.status).toBe("error");
    expect(api.my_votes(b.test.viewContext(b.users[0].auth))).toEqual([]);
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
