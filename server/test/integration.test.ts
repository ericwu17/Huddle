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
