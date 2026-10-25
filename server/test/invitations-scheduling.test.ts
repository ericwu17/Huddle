import { readFileSync } from "node:fs";
import { ingestCatalog } from "../src/lib/catalog";
import { describe, expect, it } from "vitest";
import { ConnectionId, Timestamp } from "spacetimedb";
import { createModuleTestHarness, TestAuth } from "spacetimedb/server/test-utils";
import schema, * as api from "../src/index";
import { LIVE_PLACES } from "../src/lib/places";

const internal = TestAuth.internal();
const scheduleArgs = { searchStart: "2026-10-25T00:00:00Z", searchEnd: "2026-10-27T00:00:00Z",
  dayStart: "17:00", dayEnd: "23:00", durationMinutes: 120, timeZone: "America/Los_Angeles" };
const chosen = { start: "2026-10-25T17:00:00-07:00", end: "2026-10-25T19:00:00-07:00", date: "2026-10-25",
  windowStart: "17:00", windowEnd: "19:00", timeZone: "America/Los_Angeles" };
const hard = (budget: number | null = 30) => ({ budgetMaxPerPerson: budget, maxOutingMinutes: 240,
  dietary: [], allergies: [] });

function setup() {
  const test = createModuleTestHarness(schema, api, { rngSeed: 804n });
  test.clock.set(Timestamp.fromDate(new Date("2026-10-24T18:00:00Z")));
  const users = [1, 2, 3].map(index => TestAuth.fromJwtPayload(JSON.stringify({ iss: "invite-calendar-tests", sub: `device-${index}` }), new ConnectionId(BigInt(index))));
  const env = { FASTAPI_BASE_URL: "https://unit-api.invalid", HUDDLE_SHARED_SECRET: "unit-only", STUB_MODE: "false" };
  const wrap = (ctx: any): any => new Proxy(Object.create(null), { get(_target, key) {
    if (key === "env") return env;
    if (key === "withTx") return (fn: any) => ctx.withTx((tx: any) => fn(wrap(tx)));
    const value = Reflect.get(ctx, key, ctx);
    return typeof value === "function" && key !== "random" ? value.bind(ctx) : value;
  } });
  const calls: Array<{ path: string; body: any }> = [];
  let principal = 1;
  let intent: any = { friendAccountIds: [], ambiguousNames: [], unknownNames: [], outingKind: "meal", summary: "UNTRUSTED_MODEL_PROSE" };
  let schedule: any = { ok: true, chosen, updatedConnections: [] };
  let eventResponse: ((body: any) => any) | null = null;
  let intercept: ((path: string, body: any) => void) | null = null;
  const proc = (auth: any = internal) => wrap(test.procedureContextBuilder(auth).http((_target: any, request: any, bytes: Uint8Array) => {
    const path = new URL(request.uri).pathname;
    const body = JSON.parse(new TextDecoder().decode(bytes));
    let data: any;
    if (path === "/accounts/credentials") data = { authenticated: true, passwordHash: `$argon2id$unit-${body.username}`,
      principalHex: body.action === "register" ? (principal++).toString(16).padStart(64, "0") : null };
    else {
      calls.push({ path, body }); intercept?.(path, body);
      if (path === "/agent/invite-intent") data = intent;
      else if (path === "/connectors/calendar/schedule") data = schedule;
      else if (path === "/connectors/calendar/meetup") data = eventResponse?.(body) ?? {
        created: body.connections.map((connection: any) => ({ accountId: connection.accountId, eventId: "abcdef012345", alreadyExisted: false })),
        failed: [], updatedConnections: [],
      };
      else throw new Error(`Unexpected test API path ${path}`);
    }
    return { code: 200, headers: { entries: [] }, version: { tag: "Http11" as const }, body: JSON.stringify(data) };
  }).build());
  const reduce = (auth: any, fn: (tx: any) => any) => test.withReducerTx(auth, tx => fn(wrap(tx)));
  for (const [index, username] of ["alice", "bob", "carol"].entries())
    expect(api.registerAccount(proc(users[index]), { username, password: "synthetic-password", displayName: username.toUpperCase() }).ok).toBe(true);
  const account = (index: number) => api.my_account(test.viewContext(users[index]))!;
  function friend(a = 0, b = 1) {
    const username = account(b).username;
    reduce(users[a], tx => api.requestFriend(tx, { username }));
    const request = api.my_friend_requests(test.viewContext(users[b])).find(row => row.status === "pending")!;
    reduce(users[b], tx => api.respondFriendRequest(tx, { requestId: request.id, accept: true }));
  }
  function create(overrides: any = {}) {
    return api.createInvitationHuddle(proc(users[0]), { requestId: "request-0001", summary: "PRIVATE_RAW_PROMPT_MUST_NOT_BE_PUBLIC",
      outingKind: "meal", friendAccountIds: [account(1).accountId], ...overrides });
  }
  function joined() {
    friend(); const group = create();
    const invitation = api.my_huddle_invitations(test.viewContext(users[1])).find(row => row.groupId === group.groupId)!;
    reduce(users[1], tx => api.respondHuddleInvitation(tx, { invitationId: invitation.id, accept: true }));
    return group;
  }
  function calendars(indices = [0, 1], consent = false) {
    const ids = indices.map(index => ({ index, id: account(index).accountId }));
    reduce(internal, tx => {
      for (const { index, id } of ids) {
        const row = { accountId: id, provider: "google", status: "connected", generation: `generation-${id}`,
          tokenCiphertext: `encrypted-synthetic-token-${id}`, email: `synthetic-${index}@example.test`, scopesJson: "[]",
          expiresAt: undefined, eventConsent: consent, error: undefined, updatedAt: 0 };
        if (tx.db.calendar_connection.accountId.find(id)) tx.db.calendar_connection.accountId.update(row);
        else tx.db.calendar_connection.insert(row);
      }
    });
  }
  function prefs(index: number, budget: number | null = 30, duration = 240) {
    reduce(users[index], tx => api.saveAgentPreferences(tx, { text: "", structuredJson: JSON.stringify({ ...hard(budget), maxOutingMinutes: duration }) }));
  }
  function ballot(groupId: string, complete = true, runId = "synthetic-agreed-run") {
    prefs(0); prefs(1);
    if (!test.db.group.id.find(groupId)?.date) reduce(users[0], tx => api.setHuddleWindow(tx, {
      date: "2026-10-24", windowStart: "17:00", windowEnd: "23:00", timeZone: "America/Los_Angeles",
    }));
    const planId = "synthetic-agreed-plan";
    const venues = [LIVE_PLACES.find(place => place.id === "p_002")!, LIVE_PLACES.find(place => place.category === "dessert")!];
    const stops = venues.map((place, index) => ({ placeId: place.id, name: place.name, category: place.category,
      lat: place.lat, lng: place.lng, costPerPerson: place.costPerPerson, start: index ? "18:30" : "17:00", end: index ? "19:00" : "18:15" }));
    reduce(internal, tx => {
      const state = tx.db.agent_session.groupId.find(groupId)!;
      tx.db.agent_session.groupId.update({ ...state, revision: state.revision + 1, status: "ready", activeRunId: runId });
      const group = tx.db.group.id.find(groupId)!;
      tx.db.group.id.update({ ...group, status: "voting", latestRunId: runId });
      tx.db.plan_run.insert({ runId, groupId, status: "done", resultJson: JSON.stringify({ mode: "agent", runId,
        inputRevision: state.revision + 1, plans: [{ id: planId, stops, costPerPerson: venues.reduce((sum, place) => sum + place.costPerPerson, 0) }],
        recommendedPlanId: planId, conflicts: [], warnings: [] }), error: undefined, councilJson: undefined, rouletteJson: undefined, stub: false, createdAt: 0 });
    });
    reduce(users[0], tx => api.castVote(tx, { runId, planId }));
    if (complete) reduce(users[1], tx => api.castVote(tx, { runId, planId }));
    return { runId, planId };
  }
  return { test, users, proc, reduce, calls, account, friend, create, joined, calendars, prefs, ballot,
    intent: (value: any) => { intent = value; }, schedule: (value: any) => { schedule = value; },
    events: (fn: (body: any) => any) => { eventResponse = fn; },
    intercept: (fn: (path: string, body: any) => void) => { intercept = fn; } };
}

describe("account list completion status", () => {
  it("shows finished for both members after the current vote has a winner, without changing the group lifecycle", () => {
    const s = setup(); const group = s.joined(); const plan = s.ballot(group.groupId, false);
    const status = (index: number) => api.my_account_memberships(s.test.viewContext(s.users[index]))[0].status;
    expect(status(0)).toBe("voting"); expect(status(1)).toBe("voting");
    s.reduce(s.users[1], tx => api.castVote(tx, { runId: plan.runId, planId: plan.planId }));
    expect(status(0)).toBe("finished"); expect(status(1)).toBe("finished");
    expect(s.test.db.group.id.find(group.groupId)?.status).toBe("voting");
    expect(api.my_votes(s.test.viewContext(s.users[0]))).toHaveLength(2);
    s.prefs(1, 12);
    expect(status(0)).toBe("eliciting"); expect(status(1)).toBe("eliciting");
  });

  it("keeps an unresolved tie as voting and marks it finished after Spin chooses a current winner", () => {
    const s = setup(); const group = s.joined(); const plan = s.ballot(group.groupId);
    s.reduce(internal, tx => {
      const row = tx.db.plan_run.runId.find(plan.runId)!;
      const result = JSON.parse(row.resultJson!);
      result.plans.push({ ...result.plans[0], id: "another-current-plan" });
      tx.db.plan_run.runId.update({ ...row, resultJson: JSON.stringify(result) });
    });
    s.reduce(s.users[1], tx => api.castVote(tx, { runId: plan.runId, planId: "another-current-plan" }));
    expect(api.my_account_memberships(s.test.viewContext(s.users[0]))[0].status).toBe("voting");
    api.doRoulette(s.proc(s.users[0]), { runId: plan.runId });
    expect(api.my_account_memberships(s.test.viewContext(s.users[0]))[0].status).toBe("finished");
  });

  it("also displays finished for a booked Huddle without changing its stored status", () => {
    const s = setup(); const group = s.joined(); s.ballot(group.groupId);
    s.reduce(internal, tx => tx.db.group.id.update({ ...tx.db.group.id.find(group.groupId)!, status: "booked" }));
    expect(api.my_account_memberships(s.test.viewContext(s.users[1]))[0].status).toBe("finished");
    expect(s.test.db.group.id.find(group.groupId)?.status).toBe("booked");
  });
});

describe("private invitation intent and atomic start", () => {
  it("supplies only the owner's contacts and replaces model prose with a fixed public summary", () => {
    const s = setup(); s.friend(); s.friend(1, 2);
    s.intent({ friendAccountIds: [s.account(1).accountId], ambiguousNames: [], unknownNames: [], outingKind: "meal", summary: "PRIVATE_MODEL_PROSE" });
    const result = api.parseHuddleIntent(s.proc(s.users[0]), { text: "Invite Bob for dinner" });
    expect(s.calls[0].body.contacts.map((contact: any) => contact.accountId)).toEqual([s.account(1).accountId]);
    expect(result.summary).toBe("A meal together");
    expect(JSON.stringify(result)).not.toContain("PRIVATE_MODEL_PROSE");
    expect(s.test.db.group.count()).toBe(0n);
  });

  it("rejects invented, duplicate or foreign-account contact IDs and prototype outing kinds", () => {
    const s = setup(); s.friend();
    for (const change of [{ friendAccountIds: [s.account(2).accountId] }, { friendAccountIds: [s.account(1).accountId, s.account(1).accountId] }, { outingKind: "constructor" }]) {
      s.intent({ friendAccountIds: [], ambiguousNames: [], unknownNames: [], outingKind: "meal", ...change });
      expect(() => api.parseHuddleIntent(s.proc(s.users[0]), { text: "Invite a friend" })).toThrow();
    }
    expect(s.test.db.huddle_invitation.count()).toBe(0n);
  });

  it("does not use a model for an empty invitation draft", () => {
    const s = setup();
    expect(api.parseHuddleIntent(s.proc(s.users[0]), { text: "  " }).friendAccountIds).toEqual([]);
    expect(s.calls).toEqual([]);
  });

  it("creates one invitation on retries while changed requests require a new draft", () => {
    const s = setup(); s.friend();
    const first = s.create(), again = s.create({ summary: "A different untrusted summary" });
    expect(again).toEqual(first);
    expect(s.test.db.group.count()).toBe(1n);
    expect(s.test.db.huddle_invitation.count()).toBe(1n);
    expect(() => s.create({ friendAccountIds: [] })).toThrow(/different invitation/);
    expect(s.test.db.group.count()).toBe(1n);
  });

  it("shares only the explicit name, persists it for members and keeps retry creation atomic", () => {
    const s = setup(); s.friend();
    const args = { requestId: "named-request-01", summary: "PRIVATE_PREFERENCES_DO_NOT_SHARE", outingKind: "hangout",
      friendAccountIds: [s.account(1).accountId], name: "  Friday   night bites 🍔  " };
    const first = api.createNamedInvitationHuddle(s.proc(s.users[0]), args);
    expect(api.createNamedInvitationHuddle(s.proc(s.users[0]), { ...args, name: "Friday night bites 🍔" })).toEqual(first);
    expect(s.test.db.group.count()).toBe(1n);
    expect(s.test.db.huddle_invitation.count()).toBe(1n);
    expect(s.test.db.group.id.find(first.groupId)?.name).toBe("Friday night bites 🍔");
    expect(api.my_huddle_names(s.test.viewContext(s.users[0]))).toEqual([{ groupId: first.groupId, name: "Friday night bites 🍔" }]);
    expect(api.my_huddle_names(s.test.viewContext(s.users[1]))).toEqual([]);
    expect(api.my_huddle_names(s.test.viewContext(s.users[2]))).toEqual([]);
    const invitation = api.my_huddle_invitations(s.test.viewContext(s.users[1]))[0];
    expect(invitation.groupName).toBe("Friday night bites 🍔");
    expect(JSON.stringify(invitation)).not.toContain("PRIVATE_PREFERENCES");
    s.reduce(s.users[1], tx => api.respondHuddleInvitation(tx, { invitationId: invitation.id, accept: true }));
    expect(api.my_huddle_names(s.test.viewContext(s.users[1]))).toEqual([{ groupId: first.groupId, name: "Friday night bites 🍔" }]);
    expect(api.my_account_memberships(s.test.viewContext(s.users[0]))[0].name).toBe("ALICE");
    expect(() => api.createNamedInvitationHuddle(s.proc(s.users[0]), { ...args, name: "Different draft" })).toThrow(/different invitation/);
    expect(s.test.db.group.count()).toBe(1n);
  });

  it("rejects blank, overlong and control-character names before creating anything", () => {
    const s = setup();
    for (const name of ["   ", "x".repeat(81), "Dinner\u0000crew"]) {
      expect(() => api.createNamedInvitationHuddle(s.proc(s.users[0]), { requestId: "invalid-name-01", summary: "",
        outingKind: "hangout", friendAccountIds: [], name })).toThrow(/name between 1 and 80/);
    }
    expect(s.test.db.group.count()).toBe(0n);
    expect(s.test.db.invitation_start.count()).toBe(0n);
  });

  it("recovers the name on a new login and hides it again on logout or list removal", () => {
    const s = setup();
    const first = api.createNamedInvitationHuddle(s.proc(s.users[0]), { requestId: "name-recovery-01", summary: "",
      outingKind: "hangout", friendAccountIds: [], name: "Coffee catch-up" });
    s.reduce(s.users[2], tx => api.logoutAccount(tx, {}));
    expect(api.loginAccount(s.proc(s.users[2]), { username: "alice", password: "synthetic-password" }).ok).toBe(true);
    expect(api.my_huddle_names(s.test.viewContext(s.users[2]))).toEqual([{ groupId: first.groupId, name: "Coffee catch-up" }]);
    s.reduce(s.users[0], tx => api.logoutAccount(tx, {}));
    expect(api.my_huddle_names(s.test.viewContext(s.users[0]))).toEqual([]);
    s.reduce(s.users[2], tx => api.removeHuddle(tx, { groupId: first.groupId }));
    expect(api.my_huddle_names(s.test.viewContext(s.users[2]))).toEqual([]);
  });

  it("shows a named guest Huddle only to its joined guest", () => {
    const s = setup();
    const guest = TestAuth.fromJwtPayload(JSON.stringify({ iss: "invite-calendar-tests", sub: "guest" }), new ConnectionId(4n));
    const group = api.createAgentGroup(s.proc(guest), { name: "  Guest   adventure  " });
    api.joinGroup(s.proc(guest), { code: group.code, name: "Riley" });
    expect(api.my_huddle_names(s.test.viewContext(guest))).toEqual([{ groupId: group.groupId, name: "Guest adventure" }]);
    expect(api.my_huddle_names(s.test.viewContext(s.users[0]))).toEqual([]);
  });

  it("atomically rejects a foreign friend without creating a huddle or membership", () => {
    const s = setup(); s.friend(1, 2);
    expect(() => s.create({ friendAccountIds: [s.account(2).accountId] })).toThrow();
    expect(s.test.db.group.count()).toBe(0n);
    expect(s.test.db.account_membership.count()).toBe(0n);
    expect(s.test.db.invitation_start.count()).toBe(0n);
  });

  it("rolls back the entire new huddle when recipient validation fails after its initial inserts", () => {
    const s = setup(); const accountId = s.account(0).accountId;
    s.reduce(internal, tx => tx.db.account_friend.insert({ id: `${accountId}:removed-account`, accountId,
      friendAccountId: "removed-account", createdAt: 0 }));
    expect(() => s.create({ friendAccountIds: ["removed-account"] })).toThrow();
    expect(s.test.db.group.count()).toBe(0n);
    expect(s.test.db.member.count()).toBe(0n);
    expect(s.test.db.agent_session.count()).toBe(0n);
    expect(s.test.db.account_membership.count()).toBe(0n);
    expect(s.account(0).activeGroupId).toBeUndefined();
  });

  it("invitation text never seeds anyone's private needs or saved defaults", () => {
    const s = setup(); s.friend(); const group = s.create();
    expect(s.test.db.private_prefs.count()).toBe(0n);
    expect(s.test.db.agent_need.count()).toBe(0n);
    expect(s.test.db.account_context.count()).toBe(0n);
    expect(s.test.db.group.id.find(group.groupId)?.name).toBe("A meal together");
  });
});

describe("calendar scheduling snapshot and meetup authorization", () => {
  it("keeps calendar venue input bounded and honors the participant destination city", () => {
    const s = setup(); s.joined(); s.calendars();
    const pool = JSON.parse(readFileSync(new URL("../../data/catalog/cities.json", import.meta.url), "utf8"));
    s.reduce(internal, tx => ingestCatalog(tx, pool));
    api.scheduleHuddle(s.proc(s.users[0]), scheduleArgs);
    expect(s.calls.at(-1)!.body.venues.length).toBeLessThanOrEqual(160);
    s.reduce(s.users[0], tx => api.setLocationCity(tx, { city: "Oakland" }));
    api.scheduleHuddle(s.proc(s.users[0]), scheduleArgs);
    const venues = s.calls.at(-1)!.body.venues;
    expect(venues.length).toBeGreaterThan(0);
    expect(venues.every((venue: any) => pool.venues.find((v: any) => v.place.id === venue.placeId).place.address.includes(", Oakland,"))).toBe(true);
  });

  it("starts invitation Huddles unscheduled and keeps optional time preferences host-owned", () => {
    const s = setup(), group = s.joined();
    expect(s.test.db.group.id.find(group.groupId)).toMatchObject({ date: "", windowStart: "", windowEnd: "" });
    expect(api.my_huddle_timing(s.test.viewContext(s.users[0]))).toMatchObject({ timeOfDay: "flexible", source: "pending" });
    expect(() => s.reduce(s.users[1], tx => api.setHuddleTimePreference(tx, { timeOfDay: "morning" }))).toThrow(/host/);
    expect(() => s.reduce(s.users[0], tx => api.setHuddleTimePreference(tx, { timeOfDay: "invented" }))).toThrow();
    s.reduce(s.users[0], tx => api.setHuddleTimePreference(tx, { timeOfDay: "afternoon" }));
    expect(api.my_huddle_timing(s.test.viewContext(s.users[1]))).toMatchObject({ timeOfDay: "afternoon", source: "pending" });
    expect(s.calls).toEqual([]);
    expect(api.my_huddle_timing(s.test.viewContext(s.users[2]))).toBeUndefined();
  });

  it("chooses automatic calendar duration within every participant's limit and never creates an event", () => {
    const s = setup(), group = s.joined(); s.calendars(); s.prefs(0, 30, 90); s.prefs(1, 30, 180);
    s.schedule({ ok: true, chosen: { ...chosen, end: "2026-10-25T18:30:00-07:00", windowEnd: "18:30" }, updatedConnections: [] });
    expect(api.scheduleHuddle(s.proc(s.users[0]), { ...scheduleArgs, durationMinutes: 0 }).ok).toBe(true);
    expect(s.calls[0].body.durationMinutes).toBe(90);
    expect(api.my_huddle_timing(s.test.viewContext(s.users[0]))).toMatchObject({ source: "calendar" });
    expect(s.test.db.meetup.count()).toBe(0n);
    s.reduce(s.users[0], tx => api.setHuddleTimePreference(tx, { timeOfDay: "morning" }));
    expect(s.test.db.group.id.find(group.groupId)).toMatchObject({ date: "", windowStart: "", windowEnd: "" });
    expect(s.test.db.group_schedule.groupId.find(group.groupId)).toBeNull();
    expect(api.my_huddle_timing(s.test.viewContext(s.users[0]))).toMatchObject({ source: "pending", timeOfDay: "morning" });
  });

  it("rejects an in-flight calendar choice after the host changes the time-of-day preference", () => {
    const s = setup(), group = s.joined(); s.calendars();
    s.intercept(() => s.reduce(s.users[0], tx => api.setHuddleTimePreference(tx, { timeOfDay: "afternoon" })));
    expect(api.scheduleHuddle(s.proc(s.users[0]), scheduleArgs).ok).toBe(false);
    expect(s.test.db.group.id.find(group.groupId)?.date).toBe("");
  });

  it("enforces the saved day part against a service reply even when the caller supplies a full-day search", () => {
    const s = setup(), group = s.joined(); s.calendars();
    s.reduce(s.users[0], tx => api.setHuddleTimePreference(tx, { timeOfDay: "morning" }));
    expect(api.scheduleHuddle(s.proc(s.users[0]), { ...scheduleArgs, dayStart: "00:00", dayEnd: "23:59" }).ok).toBe(false);
    expect(s.calls[0].body).toMatchObject({ dayStart: "06:00", dayEnd: "12:00" });
    expect(s.test.db.group.id.find(group.groupId)?.date).toBe("");
  });
  it("requires the current host and every participant's own connected calendar", () => {
    const s = setup(); s.joined(); s.calendars([0]);
    expect(() => api.scheduleHuddle(s.proc(s.users[1]), scheduleArgs)).toThrow(/host/);
    expect(() => api.scheduleHuddle(s.proc(s.users[0]), scheduleArgs)).toThrow(/Every participant/);
    expect(s.calls).toEqual([]);
  });

  it("changes the group window only after a validated common opening and sends no calendar events", () => {
    const s = setup(); const group = s.joined(); s.calendars();
    const result = api.scheduleHuddle(s.proc(s.users[0]), scheduleArgs);
    expect(result.ok).toBe(true);
    expect(s.test.db.group.id.find(group.groupId)).toMatchObject({ date: chosen.date, windowStart: "17:00", windowEnd: "19:00" });
    expect(s.calls.map(call => call.path)).toEqual(["/connectors/calendar/schedule"]);
    expect(s.test.db.meetup.count()).toBe(0n);
  });

  it("sends active venue hours to Claude and rejects a meal visit that would overrun closing", () => {
    const s = setup(), group = s.joined(); s.calendars();
    const place = { ...LIVE_PLACES.find(p => p.category === "meal")!, dwellMinutes: 75,
      hours: Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map(day => [day, [["17:00", "18:14"]]])) };
    s.reduce(internal, tx => tx.db.venue.insert({ id: place.id, active: true, placeJson: JSON.stringify(place),
      evidenceJson: JSON.stringify({ sources: [] }), version: "synthetic-hours", updatedAt: 0 }));
    expect(api.scheduleHuddle(s.proc(s.users[0]), scheduleArgs).ok).toBe(false);
    expect(s.test.db.group.id.find(group.groupId)?.date).toBe("");
    expect(s.calls[0].body.venues).toEqual([{ placeId: place.id, name: place.name, category: "meal", dwellMinutes: 75, hours: place.hours }]);
    // Finishing exactly at closing is allowed; arriving one minute too late is not.
    place.hours.sun = [["17:00", "18:15"]];
    s.reduce(internal, tx => tx.db.venue.id.update({ ...tx.db.venue.id.find(place.id)!, placeJson: JSON.stringify(place) }));
    expect(api.scheduleHuddle(s.proc(s.users[0]), scheduleArgs).ok).toBe(true);
  });

  it("rechecks changed catalog hours before applying the chosen time", () => {
    const s = setup(), group = s.joined(); s.calendars();
    s.intercept(path => {
      if (path !== "/connectors/calendar/schedule") return;
      const place = { ...LIVE_PLACES.find(p => p.category === "meal")!, hours: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] } };
      s.reduce(internal, tx => tx.db.venue.insert({ id: place.id, active: true, placeJson: JSON.stringify(place),
        evidenceJson: JSON.stringify({ sources: [] }), version: "synthetic-now-closed", updatedAt: 0 }));
    });
    expect(api.scheduleHuddle(s.proc(s.users[0]), scheduleArgs).ok).toBe(false);
    expect(s.test.db.group.id.find(group.groupId)?.date).toBe("");
  });

  it("supports a host-only manual fallback, retaining verification on no-op and invalidating it on actual changes", () => {
    const s = setup(); const group = s.joined(); s.calendars();
    expect(api.scheduleHuddle(s.proc(s.users[0]), scheduleArgs).ok).toBe(true);
    s.ballot(group.groupId);
    const before = s.test.db.group.id.find(group.groupId)!;
    const verification = s.test.db.group_schedule.groupId.find(group.groupId)!;
    const unchanged = { date: before.date, windowStart: before.windowStart, windowEnd: before.windowEnd,
      timeZone: "America/Los_Angeles" };
    expect(() => s.reduce(s.users[1], tx => api.setHuddleWindow(tx, unchanged))).toThrow(/host/);
    for (const change of [{ date: "2026-02-30" }, { windowStart: "25:00" }, { windowEnd: "01:00" }, { timeZone: "UTC" }])
      expect(() => s.reduce(s.users[0], tx => api.setHuddleWindow(tx, { ...unchanged, ...change }))).toThrow();
    s.reduce(s.users[0], tx => api.setHuddleWindow(tx, unchanged));
    expect(s.test.db.group.id.find(group.groupId)).toEqual(before);
    expect(s.test.db.group_schedule.groupId.find(group.groupId)).toEqual(verification);
    expect(api.my_votes(s.test.viewContext(s.users[0]))).toHaveLength(2);
    // Calendar setup is optional for a manually chosen window.
    for (const user of s.users.slice(0, 2)) s.reduce(user, tx => api.disconnectGoogleCalendar(tx, {}));
    s.reduce(s.users[0], tx => api.setHuddleWindow(tx, { date: "2026-10-26", windowStart: "18:00", windowEnd: "20:00", timeZone: "America/Los_Angeles" }));
    expect(s.test.db.group.id.find(group.groupId)).toMatchObject({ date: "2026-10-26", windowStart: "18:00", windowEnd: "20:00", latestRunId: undefined });
    expect(s.test.db.group_schedule.groupId.find(group.groupId)).toBeNull();
    expect(api.my_votes(s.test.viewContext(s.users[0]))).toEqual([]);
    expect(s.calls.map(call => call.path)).toEqual(["/connectors/calendar/schedule"]);
  });

  it("rejects invalid search ranges, clock values and too-short explicit duration before HTTP", () => {
    const s = setup(); s.joined(); s.calendars();
    for (const change of [{ searchStart: "invalid" }, { searchEnd: scheduleArgs.searchStart }, { durationMinutes: 14 },
      { searchEnd: "2027-01-01T00:00:00Z" }, { dayStart: "25:00" }, { dayEnd: "15:00" }, { timeZone: "" }])
      expect(() => api.scheduleHuddle(s.proc(s.users[0]), { ...scheduleArgs, ...change })).toThrow();
    expect(s.calls).toEqual([]);
  });

  it("keeps the date unchanged for out-of-range, zero, mismatched-date or short service windows", () => {
    const s = setup(); const group = s.joined(); s.calendars();
    const before = s.test.db.group.id.find(group.groupId)!;
    for (const change of [{ start: 0 }, { start: "2026-10-20T17:00:00-07:00" }, { date: "2026-10-26" },
      { end: "2026-10-25T18:00:00-07:00", windowEnd: "18:00" }, { windowStart: "16:00" }]) {
      s.schedule({ ok: true, chosen: { ...chosen, ...change }, updatedConnections: [] });
      expect(api.scheduleHuddle(s.proc(s.users[0]), scheduleArgs).ok).toBe(false);
      expect(s.test.db.group.id.find(group.groupId)).toEqual(before);
    }
  });

  it("does not commit a time after an in-flight private preference revision", () => {
    const s = setup(); const group = s.joined(); s.calendars();
    const before = s.test.db.group.id.find(group.groupId)!;
    s.intercept(path => { if (path === "/connectors/calendar/schedule") s.prefs(1, 12); });
    expect(api.scheduleHuddle(s.proc(s.users[0]), scheduleArgs).ok).toBe(false);
    expect(s.test.db.group.id.find(group.groupId)?.date).toBe(before.date);
    expect(s.test.db.group_schedule.groupId.find(group.groupId)).toBeNull();
  });

  it("cannot commit a service-selected duration beyond a participant's private outing cap", () => {
    const s = setup(); const group = s.joined(); s.calendars(); s.prefs(1, 30, 90);
    const before = s.test.db.group.id.find(group.groupId)!;
    let accepted = false;
    try { accepted = api.scheduleHuddle(s.proc(s.users[0]), scheduleArgs).ok; }
    catch { /* An explicit preflight rejection is equally valid. */ }
    expect(accepted).toBe(false);
    expect(s.test.db.group.id.find(group.groupId)).toEqual(before);
    expect(s.test.db.group_schedule.groupId.find(group.groupId)).toBeNull();
  });

  it("does not commit a time or refreshed credentials after calendar generation changes", () => {
    const s = setup(); const group = s.joined(); s.calendars();
    const id = s.account(1).accountId;
    const before = s.test.db.group.id.find(group.groupId)!;
    s.schedule({ ok: true, chosen, updatedConnections: [{ accountId: id, tokenCiphertext: "stale-refreshed-credentials" }] });
    s.intercept(path => { if (path === "/connectors/calendar/schedule") s.reduce(s.users[1], tx => api.disconnectGoogleCalendar(tx, {})); });
    expect(api.scheduleHuddle(s.proc(s.users[0]), scheduleArgs).ok).toBe(false);
    expect(s.test.db.group.id.find(group.groupId)).toEqual(before);
    expect(s.test.db.calendar_connection.accountId.find(id)?.tokenCiphertext).toBeUndefined();
  });

  it("never changes a huddle date after its host signs out during the request", () => {
    const s = setup(); const group = s.joined(); s.calendars();
    const before = s.test.db.group.id.find(group.groupId)!;
    s.intercept(path => { if (path === "/connectors/calendar/schedule") s.reduce(s.users[0], tx => api.logoutAccount(tx, {})); });
    expect(() => api.scheduleHuddle(s.proc(s.users[0]), scheduleArgs)).toThrow();
    expect(s.test.db.group.id.find(group.groupId)).toEqual(before);
  });

  it("never commits the old host's time after switching to another account on the same device", () => {
    const s = setup(); const group = s.joined(); s.calendars();
    const before = s.test.db.group.id.find(group.groupId)!;
    s.intercept(path => {
      if (path !== "/connectors/calendar/schedule") return;
      s.reduce(s.users[0], tx => api.logoutAccount(tx, {}));
      expect(api.loginAccount(s.proc(s.users[0]), { username: "carol", password: "synthetic-password" }).ok).toBe(true);
    });
    expect(() => api.scheduleHuddle(s.proc(s.users[0]), scheduleArgs)).toThrow();
    expect(s.account(0).username).toBe("carol");
    expect(s.test.db.group.id.find(group.groupId)).toEqual(before);
  });

  it("requires a complete current ballot, host ownership and explicit calendar event consent", () => {
    const s = setup(); const group = s.joined(); s.calendars(); const plan = s.ballot(group.groupId, false);
    expect(() => s.reduce(s.users[0], tx => api.confirmMeetup(tx, plan))).toThrow(/Everyone must vote/);
    s.reduce(s.users[1], tx => api.castVote(tx, plan));
    expect(() => s.reduce(s.users[1], tx => api.confirmMeetup(tx, plan))).toThrow(/host/);
    expect(() => s.reduce(s.users[0], tx => api.confirmMeetup(tx, plan))).toThrow(/allow agreed meetup/);
    s.reduce(s.users[0], tx => api.setCalendarEventConsent(tx, { enabled: true }));
    s.reduce(s.users[0], tx => api.confirmMeetup(tx, plan));
    expect(s.test.db.meetup.runId.find(plan.runId)?.status).toBe("pending");
    expect(() => s.reduce(s.users[0], tx => api.confirmMeetup(tx, plan))).toThrow(/already/);
  });

  it("submits only opted-in calendars and claims duplicate jobs once", () => {
    const s = setup(); const group = s.joined(); s.calendars(); const plan = s.ballot(group.groupId);
    s.reduce(s.users[1], tx => api.setCalendarEventConsent(tx, { enabled: true }));
    s.reduce(s.users[0], tx => api.confirmMeetup(tx, plan));
    const job = [...s.test.db.meetup_job.iter()][0];
    api.runMeetupJob(s.proc(), { job }); api.runMeetupJob(s.proc(), { job });
    const calls = s.calls.filter(call => call.path === "/connectors/calendar/meetup");
    expect(calls).toHaveLength(1);
    expect(calls[0].body.connections.map((connection: any) => connection.accountId)).toEqual([s.account(1).accountId]);
    expect(s.test.db.meetup.runId.find(plan.runId)?.status).toBe("created");
  });

  it("adds an explicitly agreed provisional timed meetup only with consent, without allowing venue booking", () => {
    const s = setup(); const group = s.joined(); s.calendars(); const plan = s.ballot(group.groupId);
    s.reduce(internal, tx => {
      const run = tx.db.plan_run.runId.find(plan.runId)!, data = JSON.parse(run.resultJson!);
      data.plans[0].status = "provisional";
      tx.db.plan_run.runId.update({ ...run, resultJson: JSON.stringify(data) });
      for (const pref of tx.db.private_prefs.iter())
        tx.db.private_prefs.memberId.update({ ...pref, hardJson: JSON.stringify({ ...JSON.parse(pref.hardJson!), allergies: ["peanut"] }) });
    });
    expect(() => s.reduce(s.users[0], tx => api.confirmMeetup(tx, plan))).toThrow(/allow agreed meetup/);
    expect(() => s.reduce(s.users[0], tx => api.startBooking(tx, { ...plan, stopIndex: 0 }))).toThrow();
    s.reduce(s.users[1], tx => api.setCalendarEventConsent(tx, { enabled: true }));
    s.reduce(s.users[0], tx => api.confirmMeetup(tx, plan));
    expect(() => s.reduce(s.users[0], tx => api.confirmMeetup(tx, plan))).toThrow(/already/);
    const job = [...s.test.db.meetup_job.iter()][0];
    api.runMeetupJob(s.proc(), { job }); api.runMeetupJob(s.proc(), { job });
    const calls = s.calls.filter(call => call.path === "/connectors/calendar/meetup");
    expect(calls).toHaveLength(1);
    expect(calls[0].body.connections.map((connection: any) => connection.accountId)).toEqual([s.account(1).accountId]);
    expect(calls[0].body).toMatchObject({ summary: "Huddle meetup", startTime: "17:00", endTime: "19:00" });
    expect(s.test.db.meetup.runId.find(plan.runId)?.status).toBe("created");
  });

  it("never creates calendar events for a winning untimed suggestion even with consent", () => {
    const s = setup(); const group = s.joined(); s.calendars([0, 1], true); const plan = s.ballot(group.groupId);
    s.reduce(internal, tx => {
      const run = tx.db.plan_run.runId.find(plan.runId)!, data = JSON.parse(run.resultJson!);
      data.plans = []; data.suggestions = [{ id: plan.planId, placeId: "p_002", summary: "Explore this venue", limitations: [] }];
      tx.db.plan_run.runId.update({ ...run, resultJson: JSON.stringify(data) });
    });
    expect(api.my_votes(s.test.viewContext(s.users[0]))).toHaveLength(2);
    expect(() => s.reduce(s.users[0], tx => api.confirmMeetup(tx, plan))).toThrow(/timed plan/);
    expect(s.test.db.meetup.count()).toBe(0n);
    expect(s.calls.filter(call => call.path === "/connectors/calendar/meetup")).toEqual([]);
  });

  it("keeps an earlier calendar submission visible and does not create a duplicate after replanning", () => {
    const s = setup(); const group = s.joined(); s.calendars([0, 1], true);
    const original = s.ballot(group.groupId);
    s.reduce(s.users[0], tx => api.confirmMeetup(tx, original));
    api.runMeetupJob(s.proc(), { job: [...s.test.db.meetup_job.iter()][0] });
    expect(s.test.db.meetup.runId.find(original.runId)?.status).toBe("created");
    s.prefs(1, 25);
    const revised = s.ballot(group.groupId, true, "synthetic-revised-run");
    expect(api.my_meetup(s.test.viewContext(s.users[0]))?.runId).toBe(original.runId);
    expect(() => s.reduce(s.users[0], tx => api.confirmMeetup(tx, revised))).toThrow(/already has a calendar submission/);
    expect(s.test.db.meetup.runId.find(revised.runId)).toBeNull();
    expect(s.calls.filter(call => call.path === "/connectors/calendar/meetup")).toHaveLength(1);
  });

  it("sends no event when a budget changes after queueing but before dispatch", () => {
    const s = setup(); const group = s.joined(); s.calendars([0, 1], true); const plan = s.ballot(group.groupId);
    s.reduce(s.users[0], tx => api.confirmMeetup(tx, plan));
    const job = [...s.test.db.meetup_job.iter()][0]; s.prefs(1, 0);
    api.runMeetupJob(s.proc(), { job });
    expect(s.calls.filter(call => call.path === "/connectors/calendar/meetup")).toEqual([]);
    expect(s.test.db.meetup.runId.find(plan.runId)?.status).toBe("stale");
  });

  it("does not send after the last opted-in participant revokes event consent before dispatch", () => {
    const s = setup(); const group = s.joined(); s.calendars(); const plan = s.ballot(group.groupId);
    s.reduce(s.users[1], tx => api.setCalendarEventConsent(tx, { enabled: true }));
    s.reduce(s.users[0], tx => api.confirmMeetup(tx, plan));
    const job = [...s.test.db.meetup_job.iter()][0];
    s.reduce(s.users[1], tx => api.setCalendarEventConsent(tx, { enabled: false }));
    api.runMeetupJob(s.proc(), { job });
    expect(s.calls.filter(call => call.path === "/connectors/calendar/meetup")).toEqual([]);
    expect(s.test.db.meetup.runId.find(plan.runId)?.status).toBe("stale");
  });

  it("claims an overlapping duplicate dispatch once and leaves uncertain outcomes for review", () => {
    const s = setup(); const group = s.joined(); s.calendars([0, 1], true); const plan = s.ballot(group.groupId);
    s.reduce(s.users[0], tx => api.confirmMeetup(tx, plan));
    const job = [...s.test.db.meetup_job.iter()][0];
    s.intercept(path => { if (path === "/connectors/calendar/meetup") api.runMeetupJob(s.proc(), { job }); });
    api.runMeetupJob(s.proc(), { job });
    expect(s.calls.filter(call => call.path === "/connectors/calendar/meetup")).toHaveLength(1);
    expect(s.test.db.meetup.runId.find(plan.runId)?.status).toBe("unknown");
  });

  it("treats unknown provider account IDs as unknown rather than claiming calendars were written", () => {
    const s = setup(); const group = s.joined(); s.calendars([0, 1], true); const plan = s.ballot(group.groupId);
    s.reduce(s.users[0], tx => api.confirmMeetup(tx, plan));
    s.events(() => ({ created: [{ accountId: "foreign-account", eventId: "fake-provider-id" },
      { accountId: s.account(1).accountId, eventId: "fake-provider-id-2" }], failed: [], updatedConnections: [] }));
    api.runMeetupJob(s.proc(), { job: [...s.test.db.meetup_job.iter()][0] });
    expect(s.test.db.meetup.runId.find(plan.runId)?.status).toBe("unknown");
  });

  it("does not claim calendar creation from missing, empty, numeric or oversized provider event IDs", () => {
    for (const eventId of [undefined, "", 42, "a".repeat(2000)]) {
      const s = setup(); const group = s.joined(); s.calendars([0, 1], true); const plan = s.ballot(group.groupId);
      s.reduce(s.users[0], tx => api.confirmMeetup(tx, plan));
      s.events(body => ({ created: body.connections.map((connection: any) => ({ accountId: connection.accountId,
        ...(eventId === undefined ? {} : { eventId }), alreadyExisted: false })), failed: [], updatedConnections: [] }));
      api.runMeetupJob(s.proc(), { job: [...s.test.db.meetup_job.iter()][0] });
      expect(s.test.db.meetup.runId.find(plan.runId)?.status).toBe("unknown");
    }
  });
});
