import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ConnectionId, Timestamp } from "spacetimedb";
import { createModuleTestHarness, TestAuth } from "spacetimedb/server/test-utils";
import schema, * as exports from "../src/index";
import { callApi } from "../src/lib/api";
import { planFitsBudgets, preserveBudget } from "../src/lib/budgets";
import { fakeApi } from "../src/lib/fakes";
import { PLACES, LIVE_PLACES, placeById, placesForMode } from "../src/lib/places";
import { PLACE_BY_ID } from "../../web/src/places";
import { insertCouncilMessage } from "../src/council";
import { recordCallEvent } from "../src/booking";
import { planMembers, startRun } from "../src/plans";
import requestFixture from "../../api/fixtures/plan.request.json";
import demo from "../../data/demo_group.json";

const internal = TestAuth.internal();
const json = (body: unknown, stub = true) => ({
  code: 200, headers: { entries: stub ? [{ name: "x-huddle-stub", value: new TextEncoder().encode("true") }] : [] },
  version: { tag: "Http11" as const }, body: JSON.stringify(body),
});

function session(env: Record<string, string | undefined> = {}, responder?: any) {
  const test = createModuleTestHarness(schema, exports, { rngSeed: 42n });
  test.clock.set(Timestamp.fromDate(new Date("2026-10-24T00:00:00Z")));
  const principal = (subject: string, id: number) => TestAuth.fromJwtPayload(
    JSON.stringify({ iss: "huddle-local-test", sub: subject }), new ConnectionId(BigInt(id)));
  const users = demo.members.map((member, i) => ({ ...member, auth: principal(member.name, i + 1), id: "" }));
  // SDK contexts are frozen. Wrap them only for test environment values and
  // bind their methods to the real context so private SDK state stays intact.
  const withEnv = (ctx: any): any => new Proxy(Object.create(null), {
    get(_target, key) {
      if (key === "env") return env;
      if (key === "withTx") return (action: any) => ctx.withTx((tx: any) => action(withEnv(tx)));
      const value = Reflect.get(ctx, key, ctx);
      return typeof value === "function" && key !== "random" ? value.bind(ctx) : value;
    },
  });
  const reduce = <T>(auth: any, action: (ctx: any) => T) => test.withReducerTx(auth, (ctx) => action(withEnv(ctx)));
  const proc = (auth = internal) => {
    const builder = test.procedureContextBuilder(auth);
    if (responder) builder.http(responder);
    return withEnv(builder.build());
  };
  const group = exports.createGroup(proc(users[0].auth), { name: "Stub integration" });
  for (const user of users) {
    user.id = exports.joinGroup(proc(user.auth), { code: group.code, name: user.name }).memberId;
    const member = test.db.member.id.find(user.id)!;
    test.db.member.id.update({ ...member, originLat: user.origin.lat, originLng: user.origin.lng });
    test.db.private_prefs.insert({
      memberId: user.id, text: user.text, hardJson: JSON.stringify(user.hard),
      priorJson: JSON.stringify(requestFixture.members[0].posterior),
      posteriorJson: JSON.stringify(requestFixture.members[0].posterior),
      nextPairA: undefined, nextPairB: undefined, nextPairCategory: undefined,
      warningsJson: "[]", updatedAt: 0,
    });
  }
  const g = test.db.group.id.find(group.groupId)!;
  test.db.group.id.update({ ...g, status: "planned" });
  const start = () => reduce(internal, (tx) => startRun(tx, group.groupId));
  const runPlan = () => {
    const runId = start();
    const job = [...test.db.plan_job.iter()].find((row) => row.runId === runId)!;
    exports.runPlanJob(proc(), { job });
    return runId;
  };
  const replay = () => {
    for (const job of [...test.db.fake_event_job.iter()].sort((a, b) => Number(a.scheduledId - b.scheduledId)))
      reduce(internal, (tx) => exports.runFakeEventJob(tx, { job }));
  };
  return { test, users, group, proc, reduce, start, runPlan, replay };
}

function setCap(s: ReturnType<typeof session>, cap: number, member = 0) {
  // Simulate a preference update committed while a procedure/queued job waits.
  // No parser or API process is used by these race checks.
  const prefs = s.test.db.private_prefs.memberId.find(s.users[member].id)!;
  s.test.db.private_prefs.memberId.update({ ...prefs,
    hardJson: JSON.stringify({ ...JSON.parse(prefs.hardJson!), budgetMaxPerPerson: cap }) });
}

function plansOf(s: ReturnType<typeof session>, runId: string): any[] {
  return JSON.parse(s.test.db.plan_run.runId.find(runId)!.resultJson!).plans;
}

function queueBooking(s: ReturnType<typeof session>, runId: string, plan: any) {
  s.reduce(s.users[0].auth, (tx) => exports.startBooking(tx, { runId, planId: plan.id, stopIndex: 0 }));
  return [...s.test.db.call_job.iter()].at(-1)!;
}

describe("stale choices and budget changes", () => {
  it("rejects new unaffordable votes/bookings and stops counting old votes", () => {
    for (const cap of [17, 13, 0]) {
      const s = session();
      const runId = s.runPlan();
      const safe = plansOf(s, runId).find((p) => p.costPerPerson === 18);
      s.reduce(s.users[0].auth, (tx) => exports.castVote(tx, { runId, planId: safe.id }));
      setCap(s, cap, 2); // Another person's limit constrains the whole outing.
      expect(() => s.reduce(s.users[0].auth, (tx) => exports.castVote(tx, { runId, planId: safe.id }))).toThrow();
      expect(() => queueBooking(s, runId, safe)).toThrow();
      expect(s.test.db.booking.count()).toBe(0n);
      expect(s.test.db.call_job.count()).toBe(0n);
      expect(exports.my_votes(s.test.viewContext(s.users[0].auth))).toEqual([]);
      expect(s.test.db.vote.count()).toBe(1n); // History survives; it is not an active vote.
    }
  });

  it("keeps an affordable vote and permits re-voting on the current run", () => {
    const s = session();
    const runId = s.runPlan();
    const plans = plansOf(s, runId);
    s.reduce(s.users[0].auth, (tx) => exports.castVote(tx, { runId, planId: plans[0].id }));
    setCap(s, 17);
    const affordable = plans.find((p) => p.costPerPerson === 14);
    s.reduce(s.users[0].auth, (tx) => exports.castVote(tx, { runId, planId: affordable.id }));
    expect(exports.my_votes(s.test.viewContext(s.users[0].auth)).map((v) => v.planId)).toEqual([affordable.id]);
    expect(s.test.db.vote.count()).toBe(1n);
    expect(queueBooking(s, runId, affordable)).toBeTruthy();
  });

  it("rejects votes, roulette and bookings from a superseded run", () => {
    const s = session();
    const oldRunId = s.runPlan();
    const plan = plansOf(s, oldRunId)[0];
    s.reduce(s.users[0].auth, (tx) => exports.castVote(tx, { runId: oldRunId, planId: plan.id }));
    s.runPlan();
    expect(() => s.reduce(s.users[0].auth, (tx) => exports.castVote(tx, { runId: oldRunId, planId: plan.id }))).toThrow();
    expect(() => exports.doRoulette(s.proc(s.users[0].auth), { runId: oldRunId })).toThrow();
    expect(() => queueBooking(s, oldRunId, plan)).toThrow();
    expect(exports.my_votes(s.test.viewContext(s.users[0].auth))).toEqual([]);
    expect(s.test.db.booking.count()).toBe(0n);
  });

  it("sends roulette only currently affordable plans", () => {
    let sent: any[] = [];
    const s = session({ FASTAPI_BASE_URL: "https://local-test.invalid" }, (_test: any, req: any, bytes: Uint8Array) => {
      const body = JSON.parse(new TextDecoder().decode(bytes));
      if (new URL(req.uri).pathname === "/roulette") sent = body.plans;
      return json(fakeApi(new URL(req.uri).pathname, body));
    });
    const runId = s.runPlan();
    const affordable = plansOf(s, runId).find((p) => p.costPerPerson === 14);
    setCap(s, 17);
    expect(exports.doRoulette(s.proc(s.users[0].auth), { runId }).planId).toBe(affordable.id);
    expect(sent.map((p) => p.id)).toEqual([affordable.id]);
  });

  it("rejects an unknown roulette plan without storing it", () => {
    const s = session({ FASTAPI_BASE_URL: "https://local-test.invalid" }, (_test: any, req: any, bytes: Uint8Array) => {
      const body = JSON.parse(new TextDecoder().decode(bytes));
      return json(new URL(req.uri).pathname === "/roulette" ? { planId: "not-a-candidate", weights: {} }
        : fakeApi(new URL(req.uri).pathname, body));
    });
    const runId = s.runPlan();
    expect(() => exports.doRoulette(s.proc(s.users[0].auth), { runId })).toThrow();
    expect(s.test.db.plan_run.runId.find(runId)!.rouletteJson).toBeUndefined();
  });

  it("rechecks roulette after a budget drops or the run is replaced in flight", () => {
    for (const change of ["budget", "run"]) {
      const s = session({ FASTAPI_BASE_URL: "https://local-test.invalid" }, (_test: any, req: any, bytes: Uint8Array) => {
        const body = JSON.parse(new TextDecoder().decode(bytes));
        if (new URL(req.uri).pathname === "/roulette") {
          if (change === "budget") setCap(s, 17);
          else s.start();
          return json({ planId: body.plans[0].id, weights: {} });
        }
        return json(fakeApi(new URL(req.uri).pathname, body));
      });
      const runId = s.runPlan();
      expect(() => exports.doRoulette(s.proc(s.users[0].auth), { runId })).toThrow();
      expect(s.test.db.plan_run.runId.find(runId)!.rouletteJson).toBeUndefined();
    }
  });

  it("keeps a roulette result if it still fits the budget after the request", () => {
    const s = session({ FASTAPI_BASE_URL: "https://local-test.invalid" }, (_test: any, req: any, bytes: Uint8Array) => {
      const body = JSON.parse(new TextDecoder().decode(bytes));
      if (new URL(req.uri).pathname === "/roulette") {
        setCap(s, 17);
        return json({ planId: body.plans[2].id, weights: {} }); // Budget fixture is $14.
      }
      return json(fakeApi(new URL(req.uri).pathname, body));
    });
    const runId = s.runPlan();
    const affordable = plansOf(s, runId).find((p) => p.costPerPerson === 14);
    expect(exports.doRoulette(s.proc(s.users[0].auth), { runId }).planId).toBe(affordable.id);
    expect(JSON.parse(s.test.db.plan_run.runId.find(runId)!.rouletteJson!).planId).toBe(affordable.id);
  });

  it("hides a stored roulette choice once it exceeds a current cap", () => {
    const s = session();
    const runId = s.runPlan();
    const row = s.test.db.plan_run.runId.find(runId)!;
    const safe = plansOf(s, runId).find((p) => p.costPerPerson === 18);
    s.test.db.plan_run.runId.update({ ...row, rouletteJson: JSON.stringify({ planId: safe.id, weights: {} }) });
    setCap(s, 17);
    const visible = exports.my_plan_runs(s.test.viewContext(s.users[0].auth)).find((r) => r.runId === runId)!;
    expect(visible.rouletteJson).toBeUndefined();
    expect(s.test.db.plan_run.runId.find(runId)!.rouletteJson).toBeTruthy();
  });

  it("fails an invalid queued booking without contacting voice or auto-calling another place", () => {
    for (const change of ["budget", "run"]) {
      let calls = 0;
      const s = session({ VOICE_BASE_URL: "https://local-test.invalid" }, () => { calls++; return json({ accepted: true }, false); });
      const runId = s.runPlan();
      const job = queueBooking(s, runId, plansOf(s, runId)[0]);
      if (change === "budget") setCap(s, 17);
      else s.runPlan();
      exports.runCallJob(s.proc(), { job });
      expect(calls).toBe(0);
      expect(s.test.db.booking.id.find(job.bookingId)!.status).toBe("failed");
      expect(s.test.db.booking.id.find(job.bookingId)!.failReason).toBe("error");
      expect(s.test.db.booking.count()).toBe(1n);
      expect(s.test.db.fake_event_job.count()).toBe(0n);
      expect([...s.test.db.call_event.iter()].map((e) => e.type)).toEqual(["failed"]);
    }
  });

  it("dispatches a still-affordable queued booking once", () => {
    let calls = 0;
    const s = session({ VOICE_BASE_URL: "https://local-test.invalid" }, () => { calls++; return json({ accepted: true }, false); });
    const runId = s.runPlan();
    const job = queueBooking(s, runId, plansOf(s, runId).find((p) => p.costPerPerson === 14));
    setCap(s, 17);
    exports.runCallJob(s.proc(), { job });
    exports.runCallJob(s.proc(), { job });
    expect(calls).toBe(1);
    expect(s.test.db.booking.id.find(job.bookingId)!.status).toBe("calling");
  });

  it("does not let late callbacks for an old booking overwrite the current group run", () => {
    for (const type of ["confirmed", "failed"]) {
      const s = session({ VOICE_BASE_URL: "https://local-test.invalid" }, () => json({ accepted: true }, false));
      const oldRun = s.runPlan();
      const job = queueBooking(s, oldRun, plansOf(s, oldRun)[0]);
      exports.runCallJob(s.proc(), { job });
      const currentRun = s.runPlan();
      s.reduce(internal, (tx) => recordCallEvent(tx, { bookingId: job.bookingId, type, reason: type === "failed" ? "full" : undefined }));
      const group = s.test.db.group.id.find(s.group.groupId)!;
      expect(group.latestRunId).toBe(currentRun);
      expect(group.status).toBe("planned");
      expect(group.replanFor).toBeUndefined();
      expect(s.test.db.call_event.count()).toBe(1n); // Keep the event history.
    }
  });

  it("does not mark the group booked if its budget changed during an already dispatched call", () => {
    const s = session({ VOICE_BASE_URL: "https://local-test.invalid" }, () => json({ accepted: true }, false));
    const runId = s.runPlan();
    const job = queueBooking(s, runId, plansOf(s, runId)[0]);
    exports.runCallJob(s.proc(), { job });
    setCap(s, 17);
    s.reduce(internal, (tx) => recordCallEvent(tx, { bookingId: job.bookingId, type: "confirmed" }));
    expect(s.test.db.booking.id.find(job.bookingId)!.status).toBe("confirmed"); // External fact, not undone.
    expect(s.test.db.group.id.find(s.group.groupId)!.status).toBe("planned");
  });

  it("does not revive a rejected queued booking when a late confirmation arrives", () => {
    const s = session();
    const runId = s.runPlan();
    const job = queueBooking(s, runId, plansOf(s, runId)[0]);
    setCap(s, 17);
    exports.runCallJob(s.proc(), { job });
    s.reduce(internal, (tx) => recordCallEvent(tx, { bookingId: job.bookingId, type: "confirmed" }));
    expect(s.test.db.booking.id.find(job.bookingId)!.status).toBe("failed");
    expect(s.test.db.group.id.find(s.group.groupId)!.status).toBe("planned");
    expect(s.test.db.call_event.count()).toBe(2n);
  });

  it("preserves normal synthetic confirmation and full-to-replan without duplicate dispatch", () => {
    for (const scenario of ["confirm", "full"]) {
      const s = session({ STUB_SCENARIO: scenario });
      const runId = s.runPlan();
      const job = queueBooking(s, runId, plansOf(s, runId)[0]);
      exports.runCallJob(s.proc(), { job });
      exports.runCallJob(s.proc(), { job });
      expect(s.test.db.fake_event_job.count()).toBe(scenario === "confirm" ? 8n : 6n);
      s.replay();
      const group = s.test.db.group.id.find(s.group.groupId)!;
      expect(s.test.db.booking.count()).toBe(1n);
      if (scenario === "confirm") {
        expect(group.status).toBe("booked");
        expect(s.test.db.booking.id.find(job.bookingId)!.status).toBe("confirmed");
      } else {
        expect(group.status).toBe("planned");
        expect(group.latestRunId).not.toBe(runId);
        expect(group.replanFor).toBe(job.bookingId);
        const next = [...s.test.db.plan_job.iter()].find((j) => j.runId === group.latestRunId)!;
        exports.runPlanJob(s.proc(), { job: next });
        expect(plansOf(s, group.latestRunId!).length).toBeGreaterThan(0);
        expect(plansOf(s, group.latestRunId!).flatMap((p) => p.stops.map((stop: any) => stop.placeId)))
          .not.toContain(s.test.db.booking.id.find(job.bookingId)!.placeId);
        expect(s.test.db.booking.count()).toBe(1n); // A replacement still needs a new tap.
      }
    }
  });
});

describe("cumulative budget rules", () => {
  it("uses one active stub catalog while retaining real and frontend lookups", () => {
    expect(placesForMode()).toBe(PLACES);
    expect(placesForMode("true")).toBe(PLACES);
    expect(placesForMode("false")).toBe(LIVE_PLACES);
    expect(LIVE_PLACES).toHaveLength(45);
    for (const place of [...PLACES, ...LIVE_PLACES]) {
      expect(PLACE_BY_ID.get(place.id)?.name).toBe(place.name);
      expect(placeById(place.id)?.costPerPerson).toBe(place.costPerPerson);
    }
  });
  it("compares sums against every cap, including zero, null, decimal costs and inconsistent totals", () => {
    const plan = (costs: number[], total = costs.reduce((a, b) => a + b, 0)) => ({ costPerPerson: total, stops: costs.map((costPerPerson) => ({ costPerPerson })) });
    expect(planFitsBudgets(plan([20, 15]), [{ hard: { budgetMaxPerPerson: 30 } }])).toBe(false);
    expect(planFitsBudgets(plan([12, 2, 4]), [{ hard: { budgetMaxPerPerson: 30 } }, { hard: { budgetMaxPerPerson: 17 } }])).toBe(false);
    expect(planFitsBudgets(plan([0]), [{ hard: { budgetMaxPerPerson: 0 } }])).toBe(true);
    expect(planFitsBudgets(plan([1]), [{ hard: { budgetMaxPerPerson: 0 } }])).toBe(false);
    expect(planFitsBudgets(plan([100]), [{ hard: { budgetMaxPerPerson: null } }])).toBe(true);
    expect(planFitsBudgets(plan([.1, .2], .3), [{ hard: { budgetMaxPerPerson: .3 } }])).toBe(true);
    expect(planFitsBudgets(plan([.1, .2], .3), [{ hard: { budgetMaxPerPerson: .299 } }])).toBe(false);
    expect(planFitsBudgets(plan([12, 2, 4], 12), [{ hard: { budgetMaxPerPerson: 15 } }])).toBe(false);
    expect(planFitsBudgets(plan([1]), [{}])).toBe(false);
  });

  it("preserves existing caps against increases/removal and permits tightening", () => {
    for (const next of [null, undefined, 30])
      expect(preserveBudget({ budgetMaxPerPerson: 20 }, { budgetMaxPerPerson: next }).hard.budgetMaxPerPerson).toBe(20);
    expect(preserveBudget({ budgetMaxPerPerson: 0 }, {}).hard.budgetMaxPerPerson).toBe(0);
    expect(preserveBudget({ budgetMaxPerPerson: 20 }, { budgetMaxPerPerson: 10 }).hard.budgetMaxPerPerson).toBe(10);
    expect(preserveBudget(null, { budgetMaxPerPerson: 20 }).hard.budgetMaxPerPerson).toBe(20);
    expect(preserveBudget({ budgetMaxPerPerson: null }, { budgetMaxPerPerson: 20 }).hard.budgetMaxPerPerson).toBe(20);
  });

  it("keeps tagless activities for vegetarians while requiring suitable meals and desserts", () => {
    const saved = PLACES.map((place) => ({ place, dietary: place.dietary }));
    try {
      for (const place of PLACES) if (place.category === "activity") place.dietary = [];
      expect((fakeApi("/plan", requestFixture) as any).plans).toHaveLength(3);
      for (const place of PLACES) if (place.category === "meal") place.dietary = [];
      expect((fakeApi("/plan", requestFixture) as any).plans).toEqual([]);
      for (const place of PLACES) {
        if (place.category === "meal") place.dietary = ["vegetarian"];
        if (place.category === "dessert") place.dietary = [];
      }
      expect((fakeApi("/plan", requestFixture) as any).plans).toEqual([]);
    } finally {
      for (const { place, dietary } of saved) place.dietary = dietary;
    }
  });

  it("filters standalone fallback plans and never fabricates offers", () => {
    for (const cap of [0, 13, 17, 20, 30, null]) {
      const request = structuredClone(requestFixture);
      request.members[0].hard.budgetMaxPerPerson = cap as any;
      const result: any = fakeApi("/plan", request);
      for (const plan of result.plans) expect(planFitsBudgets(plan, request.members)).toBe(true);
      if (cap === 13 || cap === 0) expect(result.plans).toEqual([]);
      if (cap === 17) expect(result.plans.map((p: any) => p.costPerPerson)).toEqual([14]);
    }
    expect(fakeApi("/offers", requestFixture)).toEqual({ offers: [] });
    const request = { ...requestFixture, excludePlaceIds: PLACES.filter((p) => p.category === "meal").map((p) => p.id) };
    expect((fakeApi("/plan", request) as any).plans).toEqual([]);
  });
});

describe("SpacetimeDB procedure integration", () => {
  it("does not copy private service errors into group-visible fallback warnings", () => {
    const privateDetail = "PRIVATE_TEST_ONLY budget=17 preference=quiet service-secret=test-value";
    for (const failure of ["http", "exception"]) {
      const s = session({ FASTAPI_BASE_URL: "https://local-test.invalid" }, () => {
        if (failure === "exception") throw new Error(privateDetail);
        return { ...json({ detail: privateDetail }, false), code: 500 };
      });
      const run = s.test.db.plan_run.runId.find(s.runPlan())!;
      const result = JSON.parse(run.resultJson!);
      expect(result.warnings.some((warning: string) => warning.startsWith("fallback:"))).toBe(true);
      expect(JSON.stringify(result.warnings)).not.toContain(privateDetail);
      expect(JSON.stringify(result.warnings)).not.toContain("service-secret");
      expect(s.test.db.group.id.find(s.group.groupId)!.demoMode).toBe(true);
    }
  });

  it("keeps a tight cumulative cap during failure and avoids repeated external calls", () => {
    let requests = 0;
    const s = session({ FASTAPI_BASE_URL: "https://local-test.invalid" }, () => {
      requests++;
      throw new Error("offline");
    });
    const prefs = s.test.db.private_prefs.memberId.find(s.users[0].id)!;
    s.test.db.private_prefs.memberId.update({ ...prefs, hardJson: JSON.stringify({ ...s.users[0].hard, budgetMaxPerPerson: 17 }) });
    for (let i = 0; i < 2; i++) {
      const run = s.test.db.plan_run.runId.find(s.runPlan())!;
      expect(run.status).toBe("done");
      expect(run.stub).toBe(true);
      expect(JSON.parse(run.resultJson!).plans.map((p: any) => p.costPerPerson)).toEqual([14]);
      expect(JSON.parse(s.test.db.private_prefs.memberId.find(s.users[0].id)!.hardJson!).budgetMaxPerPerson).toBe(17);
    }
    expect(requests).toBe(2); // One idempotent retry, then the group stays in fallback mode.
    expect(s.test.db.group.id.find(s.group.groupId)!.demoMode).toBe(true);
  });

  it("rechecks a cap lowered while the request fails before storing fallback plans", () => {
    const s = session({ FASTAPI_BASE_URL: "https://local-test.invalid" }, (test: any) => {
      const prefs = test.db.private_prefs.memberId.find(s.users[0].id)!;
      test.db.private_prefs.memberId.update({ ...prefs, hardJson: JSON.stringify({ ...s.users[0].hard, budgetMaxPerPerson: 13 }) });
      throw new Error("offline after cap change");
    });
    const run = s.test.db.plan_run.runId.find(s.runPlan())!;
    expect(run.status).toBe("done");
    expect(JSON.parse(run.resultJson!).plans).toEqual([]);
    expect(JSON.parse(s.test.db.private_prefs.memberId.find(s.users[0].id)!.hardJson!).budgetMaxPerPerson).toBe(13);
    expect(s.test.db.group.id.find(s.group.groupId)!.demoMode).toBe(true);
  });

  it("stores only affordable fallback plans when HTTP fails", () => {
    const s = session({ FASTAPI_BASE_URL: "https://local-test.invalid" }, () => { throw new Error("offline"); });
    const runId = s.runPlan();
    const run = s.test.db.plan_run.runId.find(runId)!;
    const result = JSON.parse(run.resultJson!);
    expect(run.stub).toBe(true);
    expect(result.plans.map((p: any) => p.costPerPerson)).toEqual([18, 20, 14]);
    const members = s.reduce(internal, (tx) => planMembers(tx, s.group.groupId));
    for (const plan of result.plans) expect(planFitsBudgets(plan, members)).toBe(true);
  });

  it("rechecks current caps when an HTTP response arrives after a cap was lowered", () => {
    const s = session({ FASTAPI_BASE_URL: "https://local-test.invalid" }, (test: any, req: any, bytes: Uint8Array) => {
      const input = JSON.parse(new TextDecoder().decode(bytes));
      const result = fakeApi("/plan", input);
      const prefs = test.db.private_prefs.memberId.find(s.users[0].id)!;
      test.db.private_prefs.memberId.update({ ...prefs, hardJson: JSON.stringify({ ...s.users[0].hard, budgetMaxPerPerson: 13 }) });
      return json(result);
    });
    const run = s.test.db.plan_run.runId.find(s.runPlan())!;
    expect(JSON.parse(run.resultJson!).plans).toEqual([]);
    expect(run.stub).toBe(true);
  });

  it("keeps the existing cap when the parser returns a larger or absent cap", () => {
    for (const cap of [30, null]) {
      const s = session();
      const user = s.users[0];
      const prefs = s.test.db.private_prefs.memberId.find(user.id)!;
      s.test.db.private_prefs.memberId.update({ ...prefs, hardJson: JSON.stringify({ ...user.hard, budgetMaxPerPerson: 20 }),
        text: cap === null ? "romantic vibe, I don't care about price" : user.text });
      s.reduce(user.auth, (tx) => exports.submitPrefs(tx, { text: cap === null ? "romantic vibe, I don't care about price" : user.text }));
      const job = [...s.test.db.parse_job.iter()][0];
      exports.runParseJob(s.proc(), { job });
      const saved = s.test.db.private_prefs.memberId.find(user.id)!;
      expect(JSON.parse(saved.hardJson!).budgetMaxPerPerson).toBe(20);
      expect(JSON.parse(saved.warningsJson)).toContain("Existing outing budget preserved; increases require accepting a private offer.");
    }
  });

  it("stores each council message once when a stub HTTP response is replayed twice", () => {
    const env = { FASTAPI_BASE_URL: "https://local-test.invalid" };
    const s = session(env, (_test: any, req: any, bytes: Uint8Array) => json(fakeApi(new URL(req.uri).pathname, JSON.parse(new TextDecoder().decode(bytes)))));
    const runId = s.runPlan();
    exports.runScoutJob(s.proc(), { job: [...s.test.db.scout_job.iter()][0] });
    exports.runCouncilJob(s.proc(), { job: [...s.test.db.council_job.iter()][0] });
    expect(s.test.db.council_message.count()).toBe(0n);
    expect([...s.test.db.fake_event_job.iter()].map((job) => job.kind)).toEqual([
      ...Array(9).fill("council_message"), "council_done",
    ]);
    s.replay();
    s.replay();
    expect(s.test.db.council_message.count()).toBe(9n);
    const result = JSON.parse(s.test.db.plan_run.runId.find(runId)!.councilJson!);
    expect(result.chosenPlanId).toBeTruthy();
    expect(s.test.db.group.id.find(s.group.groupId)!.status).toBe("voting");
  });

  it("ingests response messages for non-stub calls without requiring a callback", () => {
    const s = session({ FASTAPI_BASE_URL: "https://local-test.invalid" }, (_test: any, req: any, bytes: Uint8Array) =>
      json(fakeApi(new URL(req.uri).pathname, JSON.parse(new TextDecoder().decode(bytes))), false));
    s.runPlan();
    exports.runScoutJob(s.proc(), { job: [...s.test.db.scout_job.iter()][0] });
    exports.runCouncilJob(s.proc(), { job: [...s.test.db.council_job.iter()][0] });
    expect(s.test.db.council_message.count()).toBe(9n);
    const message = [...s.test.db.council_message.iter()][0];
    s.reduce(internal, (tx) => insertCouncilMessage(tx, {
      ...message, memberId: message.memberId ?? null,
      stance: JSON.parse(message.stanceJson!), cited: JSON.parse(message.citedJson!),
    }));
    expect(s.test.db.council_message.count()).toBe(9n);
  });

  it("raises a cap only for a current offer explicitly accepted by its recipient", () => {
    const s = session();
    const runId = s.runPlan();
    const user = s.users[2];
    const plan: any = structuredClone((fakeApi("/plan", requestFixture) as any).plans[0]);
    plan.stops[0].costPerPerson = 16;
    plan.costPerPerson = 22;
    s.test.db.offer.insert({ id: "test_offer", runId, toMemberId: user.id, type: "budget", amount: 2, unit: "usd",
      planId: plan.id, planJson: JSON.stringify(plan), robustnessGain: .06, minRatioGain: .06, text: "SYNTHETIC TEST ONLY", status: "open" });
    expect(() => s.reduce(s.users[0].auth, (tx) => exports.acceptOffer(tx, { offerId: "test_offer" }))).toThrow();
    expect(JSON.parse(s.test.db.private_prefs.memberId.find(user.id)!.hardJson!).budgetMaxPerPerson).toBe(20);
    s.reduce(user.auth, (tx) => exports.acceptOffer(tx, { offerId: "test_offer" }));
    expect(JSON.parse(s.test.db.private_prefs.memberId.find(user.id)!.hardJson!).budgetMaxPerPerson).toBe(22);
    expect(() => s.reduce(user.auth, (tx) => exports.acceptOffer(tx, { offerId: "test_offer" }))).toThrow();
  });
});

// Optional real HTTP check: module procedures use the official in-memory
// datastore; only their outbound HTTP responder bridges to the local FastAPI.
// This does not publish or require a running SpacetimeDB host.
it.runIf(process.env.HUDDLE_TEST_API_URL)("runs parse/swipe/preview/plan/council against local FastAPI", () => {
  const env = { FASTAPI_BASE_URL: process.env.HUDDLE_TEST_API_URL, HUDDLE_SHARED_SECRET: process.env.HUDDLE_SHARED_SECRET };
  const responder = (_test: any, req: any, bytes: Uint8Array) => {
    const bridge = spawnSync(resolve("../api/.venv/bin/python"), ["-c", `
import json, sys, urllib.request, urllib.error
data=json.load(sys.stdin)
request=urllib.request.Request(data['uri'], data=data['body'].encode() if data['body'] else None,
    headers={h['name']: h['value'] for h in data['headers']}, method=data['method'])
try:
    response=urllib.request.urlopen(request, timeout=10)
except urllib.error.HTTPError as error:
    response=error
print(json.dumps({'code': response.status, 'headers': {'entries': [{'name': k, 'value': v} for k,v in response.headers.items()]},
    'version': {'tag': 'Http11'}, 'body': response.read().decode()}))
`], { input: JSON.stringify({ uri: req.uri, body: new TextDecoder().decode(bytes),
      headers: req.headers.entries.map((header: any) => ({ name: header.name, value: new TextDecoder().decode(header.value) })),
      method: req.method.tag.toUpperCase() }), encoding: "utf8" });
    if (bridge.status !== 0) throw new Error("Local HTTP bridge failed: " + bridge.stderr);
    const response = JSON.parse(bridge.stdout);
    response.headers.entries = response.headers.entries.map((header: any) => ({ ...header, value: new TextEncoder().encode(header.value) }));
    return response;
  };
  const s = session(env, responder);
  expect(callApi(s.proc(), "/health", {}).ok).toBe(true);
  for (const user of s.users) s.reduce(user.auth, (tx) => exports.submitPrefs(tx, { text: user.text }));
  for (const job of s.test.db.parse_job.iter()) exports.runParseJob(s.proc(), { job });
  const g = s.test.db.group.id.find(s.group.groupId)!;
  s.test.db.group.id.update({ ...g, status: "eliciting" });
  const processed = new Set<bigint>();
  for (let round = 0; round < 4; round++) {
    for (const user of s.users) {
      const prefs = s.test.db.private_prefs.memberId.find(user.id)!;
      expect(placeById(prefs.nextPairA!)).toBeTruthy();
      s.reduce(user.auth, (tx) => exports.submitSwipe(tx, { winnerPlaceId: prefs.nextPairA!, loserPlaceId: prefs.nextPairB! }));
    }
    for (const job of s.test.db.swipe_job.iter()) {
      if (processed.has(job.scheduledId)) continue;
      exports.runSwipeJob(s.proc(), { job });
      processed.add(job.scheduledId);
    }
    for (const job of s.test.db.preview_job.iter()) exports.runPreviewJob(s.proc(), { job });
  }
  expect(s.test.db.group.id.find(s.group.groupId)!.confidence).toBe(.93);
  expect(s.test.db.group.id.find(s.group.groupId)!.status).toBe("planned");
  const runId = s.test.db.group.id.find(s.group.groupId)!.latestRunId!;
  exports.runPlanJob(s.proc(), { job: [...s.test.db.plan_job.iter()][0] });
  expect(s.test.db.plan_run.runId.find(runId)!.stub).toBe(true);
  exports.runOffersJob(s.proc(), { job: [...s.test.db.offers_job.iter()][0] });
  expect(s.test.db.offer.count()).toBe(0n);
  const choice = exports.doRoulette(s.proc(s.users[0].auth), { runId });
  expect(choice.planId).toBeTruthy();
  exports.runScoutJob(s.proc(), { job: [...s.test.db.scout_job.iter()][0] });
  exports.runCouncilJob(s.proc(), { job: [...s.test.db.council_job.iter()][0] });
  s.replay();
  expect(s.test.db.council_message.count()).toBe(9n);
  expect(s.test.db.group.id.find(s.group.groupId)!.status).toBe("voting");
  const result = JSON.parse(s.test.db.plan_run.runId.find(runId)!.resultJson!);
  for (const plan of result.plans) {
    expect(plan.stops.every((stop: any) => placeById(stop.placeId))).toBe(true);
    expect(plan.costPerPerson).toBeLessThanOrEqual(20);
  }
});
