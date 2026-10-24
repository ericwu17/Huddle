import { describe, expect, it } from "vitest";
import { ConnectionId, Identity, Timestamp } from "spacetimedb";
import { Request } from "spacetimedb/server";
import { createModuleTestHarness, TestAuth } from "spacetimedb/server/test-utils";
import schema, * as api from "../src/index";
import { authorizedCalendarSnapshots, claimGoogleOAuth, completeGoogleOAuth, persistCalendarRefresh, publicFrontendBase } from "../src/connectors";

function setup() {
  const test = createModuleTestHarness(schema, api, { rngSeed: 991n });
  test.clock.set(Timestamp.fromDate(new Date("2026-10-24T18:00:00Z")));
  const users = [1, 2, 3, 4].map(i => TestAuth.fromJwtPayload(JSON.stringify({ iss: "connector-fixtures", sub: `device-${i}` }), new ConnectionId(BigInt(i))));
  const env: Record<string, string | undefined> = { STUB_MODE: "false", FASTAPI_BASE_URL: "https://fixture-api.invalid", HUDDLE_SHARED_SECRET: "unit-only" };
  const wrap = (ctx: any): any => new Proxy(Object.create(null), { get(_target, key) {
    if (key === "env") return env;
    if (key === "withTx") return (fn: any) => ctx.withTx((tx: any) => fn(wrap(tx)));
    const value = Reflect.get(ctx, key, ctx);
    return typeof value === "function" && key !== "random" ? value.bind(ctx) : value;
  } });
  const reduce = <T>(i: number, fn: (tx: any) => T) => test.withReducerTx(users[i], tx => fn(wrap(tx)));
  ["alice", "bob", "cara"].forEach((username, i) => reduce(i, tx => {
    const id = `account-${username}`;
    tx.db.account.insert({ id, username, displayName: username.toUpperCase(), principal: Identity.fromString((i + 1).toString(16).padStart(64, "0")), passwordHash: "$argon2id$fixture-only", createdAt: Number(tx.timestamp.toMillis()) });
    tx.db.account_session.insert({ identity: tx.sender, accountId: id, nonce: `device-session-${i}`, activeGroupId: undefined, expiresAt: Number(tx.timestamp.toMillis()) + 86400000 });
  }));
  const calls: Array<{ path: string; body: any }> = [];
  let sequence = 0;
  let expiryFraction = 0;
  let intercept: (() => void) | undefined;
  let messageResult: "submitted" | "unavailable" | "throw" = "submitted";
  const proc = (i = 0) => wrap(test.procedureContextBuilder(users[i]).http((_test, req, bytes) => {
    const body = JSON.parse(new TextDecoder().decode(bytes));
    const path = req.uri.replace(env.FASTAPI_BASE_URL!, "");
    calls.push({ path, body });
    const action = intercept; intercept = undefined; action?.();
    let result: any;
    if (path === "/connectors/status") result = { googleConfigured: true, messagesConfigured: true };
    if (path === "/connectors/google/start") result = { stateId: `fixture-state-${++sequence}`, authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=fixture", expiresAt: Number(test.clock.now().toMillis()) + 600000 + expiryFraction };
    if (path === "/connectors/google/revoke") result = { revoked: true };
    if (path === "/connectors/messages/send") {
      if (messageResult === "throw") throw new Error("synthetic ambiguous transport failure");
      result = { dispatchId: body.dispatchId, status: messageResult };
    }
    return { code: 200, headers: { entries: [] }, version: { tag: "Http11" as const }, body: JSON.stringify(result) };
  }).build());
  const view = (i: number) => test.viewContext(users[i]);
  const group = () => {
    const g = api.createAgentGroup(proc(0), { name: "Public outing fixture" });
    api.joinGroup(proc(0), { code: g.code, name: "ignored" });
    reduce(0, tx => api.requestFriend(tx, { username: "bob" }));
    const request = api.my_friend_requests(view(1))[0];
    reduce(1, tx => api.respondFriendRequest(tx, { requestId: request.id, accept: true }));
    return g;
  };
  const invite = (groupId: string) => {
    reduce(0, tx => api.inviteFriends(tx, { groupId, friendAccountIds: ["account-bob"] }));
    return api.my_huddle_invitations(view(1)).find(i => i.groupId === groupId && i.status === "pending")!;
  };
  const start = (i = 0) => {
    expect(api.startGoogleCalendar(proc(i), {}).ok).toBe(true);
    return [...test.db.calendar_oauth_state.iter()].at(-1)!;
  };
  const complete = (i = 0) => {
    const state = start(i);
    const claim = reduce(i, tx => claimGoogleOAuth(tx, { stateId: state.stateId, accountId: state.accountId }));
    const payload = { stateId: state.stateId, accountId: state.accountId, claimNonce: claim.claimNonce,
      tokenCiphertext: `encrypted-synthetic-token-${i}`, email: `${["alice", "bob", "cara"][i]}@example.com`, scopes: ["calendar.freebusy", "calendar.events"], expiresAt: Number(test.clock.now().toMillis()) + 3600000 };
    reduce(i, tx => completeGoogleOAuth(tx, payload));
    return { state, payload };
  };
  const http = (handler: typeof api.googleOAuthClaim, body: any, secret = "unit-only") => handler(proc(0), new Request("https://module.invalid/route/connectors/google/claim", {
    method: "POST", headers: { "Content-Type": "application/json", "X-Huddle-Secret": secret }, body: JSON.stringify(body),
  }));
  return { test, users, env, calls, reduce, proc, view, group, invite, start, complete, http,
    intercept: (fn: () => void) => { intercept = fn; }, messageResult: (value: typeof messageResult) => { messageResult = value; },
    expiryFraction: (value: number) => { expiryFraction = value; } };
}

describe("owner-scoped connector settings", () => {
  it("accepts fractional API expiry milliseconds without a timestamp panic or early expiry", () => {
    const s = setup(); s.expiryFraction(0.25);
    const state = s.start();
    const job = [...s.test.db.calendar_oauth_expiry_job.iter()][0];
    expect(job.stateId).toBe(state.stateId);
    expect(job.scheduledAt.tag).toBe("Time");
    if (job.scheduledAt.tag !== "Time") throw new Error("Expected an absolute expiry job");
    expect(Number(job.scheduledAt.value.microsSinceUnixEpoch) / 1000).toBeGreaterThanOrEqual(state.expiresAt);
    expect(s.test.db.calendar_oauth_state.count()).toBe(1n);
    expect(api.my_connectors(s.view(0))!.calendarStatus).toBe("pending");
  });
  it("defaults to disconnected/no messages, validates destinations, and never shares them with friends", () => {
    const s = setup();
    expect(api.my_connectors(s.view(0))).toMatchObject({ messageEnabled: false, messageDestination: "", calendarStatus: "disconnected", calendarEventConsent: false });
    expect(api.my_connectors(s.view(3))).toBeUndefined();
    expect(() => s.reduce(3, tx => api.saveMessageConnector(tx, { enabled: true, destination: "+14155550111" }))).toThrow();
    expect(() => s.reduce(0, tx => api.saveMessageConnector(tx, { enabled: true, destination: "555" }))).toThrow();
    s.reduce(0, tx => api.saveMessageConnector(tx, { enabled: true, destination: "+14155550111" }));
    expect(api.my_connectors(s.view(0))!.messageDestination).toBe("+14155550111");
    expect(api.my_connectors(s.view(1))!.messageDestination).toBe("");
    s.reduce(0, tx => api.saveMessageConnector(tx, { enabled: false, destination: "" }));
    expect(api.my_connectors(s.view(0))!.messageEnabled).toBe(false);
    expect(() => s.reduce(0, tx => api.setCalendarEventConsent(tx, { enabled: true }))).toThrow();
    s.reduce(0, tx => api.logoutAccount(tx, {}));
    expect(api.my_connectors(s.view(0))).toBeUndefined();
  });

  it("requires public HTTPS and both module and provider configuration for external delivery", () => {
    const s = setup();
    for (const invalid of ["http://localhost:5174", "https://localhost", "https://127.0.0.1", "https://10.0.0.1", "https://foo.local", "https://u:p@example.com", "https://good.com?x=1", "https://bad..com", "https://bad.-com"])
      expect(publicFrontendBase(invalid)).toBeNull();
    expect(publicFrontendBase("https://huddle.example.com/")).toBe("https://huddle.example.com");
    expect(api.connectorStatus(s.proc(), {}).externalInvitesConfigured).toBe(false);
    s.env.MESSAGES_ENABLED = "true"; s.env.PUBLIC_FRONTEND_BASE_URL = "https://huddle.example.com";
    expect(api.connectorStatus(s.proc(), {})).toEqual({ googleConfigured: true, messagesConfigured: true, externalInvitesConfigured: true });
    s.env.FASTAPI_BASE_URL = undefined;
    expect(api.connectorStatus(s.proc(), {})).toEqual({ googleConfigured: false, messagesConfigured: false, externalInvitesConfigured: false });
  });
});

describe("one-use Google authorization and credential privacy", () => {
  it("requires service authentication, current account/state/claim nonce and consumes callbacks once", () => {
    const s = setup(); const state = s.start();
    const body = { stateId: state.stateId, accountId: state.accountId };
    expect(s.http(api.googleOAuthClaim, body, "wrong").status).toBe(401);
    expect(s.http(api.googleOAuthClaim, { ...body, accountId: "account-bob" }).status).toBe(400);
    const claimResponse = s.http(api.googleOAuthClaim, body);
    expect(claimResponse.status).toBe(200);
    const claim = claimResponse.json();
    expect(s.http(api.googleOAuthClaim, body).status).toBe(400);
    const payload = { ...body, claimNonce: claim.claimNonce, tokenCiphertext: "encrypted-token-synthetic-only", email: "alice@example.com", scopes: ["calendar.freebusy"] };
    expect(s.http(api.googleOAuthComplete, { ...payload, claimNonce: "wrong" }).status).toBe(400);
    expect(s.http(api.googleOAuthComplete, payload).status).toBe(200);
    expect(s.http(api.googleOAuthComplete, payload).status).toBe(400);
    const own = api.my_connectors(s.view(0));
    expect(own).toMatchObject({ calendarStatus: "connected", calendarEmail: "alice@example.com", calendarEventConsent: false });
    expect(JSON.stringify(own)).not.toMatch(/encrypted|cipher|scope|refresh|accessToken/i);
    expect(api.my_connectors(s.view(1))!.calendarEmail).toBeUndefined();
  });

  it("does not let late starts/completions undo logout, reconnect or disconnect", () => {
    const s = setup();
    s.intercept(() => s.reduce(0, tx => api.logoutAccount(tx, {})));
    expect(api.startGoogleCalendar(s.proc(), {}).ok).toBe(false);
    expect(s.test.db.calendar_oauth_state.count()).toBe(0n);
    const fresh = setup(); const state = fresh.start();
    const claim = fresh.reduce(0, tx => claimGoogleOAuth(tx, { stateId: state.stateId, accountId: state.accountId }));
    fresh.reduce(0, tx => api.disconnectGoogleCalendar(tx, {}));
    expect(() => fresh.reduce(0, tx => completeGoogleOAuth(tx, { stateId: state.stateId, accountId: state.accountId, claimNonce: claim.claimNonce,
      tokenCiphertext: "encrypted-token-after-disconnect", email: "alice@example.com", scopes: [] }))).toThrow();
    expect(api.my_connectors(fresh.view(0))!.calendarStatus).toBe("disconnected");
    const old = fresh.start(), latest = fresh.start();
    expect(old.generation).not.toBe(latest.generation);
    expect(() => fresh.reduce(0, tx => claimGoogleOAuth(tx, { stateId: old.stateId, accountId: old.accountId }))).toThrow();
  });

  it("expires pending authorization, handles failed exchange and defaults event consent off", () => {
    const s = setup(); const state = s.start();
    s.test.clock.set(Timestamp.fromDate(new Date("2026-10-24T18:11:00Z")));
    expect(() => s.reduce(0, tx => claimGoogleOAuth(tx, { stateId: state.stateId, accountId: state.accountId }))).toThrow();
    const job = [...s.test.db.calendar_oauth_expiry_job.iter()][0];
    api.runCalendarOAuthExpiryJob(s.proc(), { job });
    expect(api.my_connectors(s.view(0))!.calendarStatus).toBe("error");
    const second = s.start();
    const claim = s.reduce(0, tx => claimGoogleOAuth(tx, { stateId: second.stateId, accountId: second.accountId }));
    s.reduce(0, tx => completeGoogleOAuth(tx, { stateId: second.stateId, accountId: second.accountId, claimNonce: claim.claimNonce, error: "synthetic provider denial" }));
    expect(api.my_connectors(s.view(0))!.calendarStatus).toBe("error");
    s.complete(); s.reduce(0, tx => api.setCalendarEventConsent(tx, { enabled: true }));
    expect(api.my_connectors(s.view(0))!.calendarEventConsent).toBe(true);
    s.reduce(0, tx => api.disconnectGoogleCalendar(tx, {}));
    expect(api.my_connectors(s.view(0))!.calendarEventConsent).toBe(false);
    expect(s.test.db.calendar_connection.accountId.find("account-alice")!.tokenCiphertext).toBeUndefined();
  });

  it("shares only readiness and commits refreshed tokens only for the unchanged authorized snapshot", () => {
    const s = setup(); const group = s.group(); const invite = s.invite(group.groupId);
    s.reduce(1, tx => api.respondHuddleInvitation(tx, { invitationId: invite.id, accept: true }));
    s.complete(0); s.complete(1);
    const readiness = api.my_group_connectors(s.view(1));
    expect(readiness).toHaveLength(2); expect(readiness.every(r => r.connected && !r.eventConsent)).toBe(true);
    expect(JSON.stringify(readiness)).not.toMatch(/email|token|busy|eventId|cipher/i);
    expect(api.my_group_connectors(s.view(2))).toEqual([]);
    const snapshots = authorizedCalendarSnapshots(s.test.db, group.groupId);
    expect(snapshots).toHaveLength(2);
    expect(s.reduce(0, tx => persistCalendarRefresh(tx, [{ accountId: "account-alice", tokenCiphertext: "encrypted-refreshed-token-alice" }], snapshots))).toBe(true);
    const current = authorizedCalendarSnapshots(s.test.db, group.groupId);
    s.reduce(1, tx => api.disconnectGoogleCalendar(tx, {}));
    expect(s.reduce(0, tx => persistCalendarRefresh(tx, [{ accountId: "account-alice", tokenCiphertext: "encrypted-should-not-commit-token" }], current))).toBe(false);
    expect(s.test.db.calendar_connection.accountId.find("account-alice")!.tokenCiphertext).toBe("encrypted-refreshed-token-alice");
    expect(() => s.reduce(0, tx => persistCalendarRefresh(tx, [{ accountId: "account-cara", tokenCiphertext: "encrypted-foreign-token-only" }], current))).toThrow();
  });

  it("disconnects locally before a one-use provider revoke and never restores a token after failure", () => {
    const s = setup(); s.complete();
    s.reduce(0, tx => api.disconnectGoogleCalendar(tx, {}));
    const job = [...s.test.db.calendar_revoke_job.iter()][0];
    expect(s.test.db.calendar_connection.accountId.find("account-alice")!.tokenCiphertext).toBeUndefined();
    api.runCalendarRevokeJob(s.proc(), { job });
    api.runCalendarRevokeJob(s.proc(), { job });
    expect(s.calls.filter(c => c.path === "/connectors/google/revoke")).toHaveLength(1);
    expect(api.my_connectors(s.view(0))!.calendarStatus).toBe("disconnected");
    const failed = setup(); failed.complete();
    failed.reduce(0, tx => api.disconnectGoogleCalendar(tx, {}));
    const pending = [...failed.test.db.calendar_revoke_job.iter()][0];
    failed.env.FASTAPI_BASE_URL = undefined;
    api.runCalendarRevokeJob(failed.proc(), { job: pending });
    expect(api.my_connectors(failed.view(0))!.calendarError).toContain("Google permission removal could not be confirmed");
    expect(failed.test.db.calendar_connection.accountId.find("account-alice")!.tokenCiphertext).toBeUndefined();
    failed.env.FASTAPI_BASE_URL = "https://fixture-api.invalid";
    api.runCalendarRevokeJob(failed.proc(), { job: pending });
    expect(failed.calls.filter(c => c.path === "/connectors/google/revoke")).toHaveLength(0);
  });

  it("does not let an old queued revoke invalidate a new connection attempt", () => {
    const s = setup(); s.complete();
    s.reduce(0, tx => api.disconnectGoogleCalendar(tx, {}));
    const job = [...s.test.db.calendar_revoke_job.iter()][0];
    s.start();
    api.runCalendarRevokeJob(s.proc(), { job });
    expect(s.calls.filter(c => c.path === "/connectors/google/revoke")).toHaveLength(0);
    expect(api.my_connectors(s.view(0))!.calendarStatus).toBe("pending");
  });
});

describe("opt-in Messages invitation outbox", () => {
  it("keeps in-app delivery when settings are absent and never calls the external adapter", () => {
    const s = setup(); const group = s.group(); const invite = s.invite(group.groupId);
    expect(api.my_invitation_deliveries(s.view(0))[0].status).toBe("in_app_only");
    expect(api.my_invitation_deliveries(s.view(2))).toEqual([]);
    expect(s.test.db.invitation_delivery_job.count()).toBe(0n);
    expect(s.calls.filter(c => c.path === "/connectors/messages/send")).toEqual([]);
    expect(invite.message).toContain("ALICE wants to hang out with Huddle!");
  });

  it("claims one opt-in dispatch before HTTP, sends no private preferences and reports submitted rather than delivered", () => {
    const s = setup(); s.env.MESSAGES_ENABLED = "true"; s.env.PUBLIC_FRONTEND_BASE_URL = "https://huddle.example.com";
    s.reduce(1, tx => api.saveMessageConnector(tx, { enabled: true, destination: "bob@example.com" }));
    const group = s.group(); const invite = s.invite(group.groupId);
    const job = [...s.test.db.invitation_delivery_job.iter()][0];
    s.intercept(() => expect(s.test.db.invitation_delivery.invitationId.find(invite.id)!.status).toBe("sending"));
    api.runInvitationDeliveryJob(s.proc(), { job });
    api.runInvitationDeliveryJob(s.proc(), { job });
    const external = s.calls.filter(c => c.path === "/connectors/messages/send");
    expect(external).toHaveLength(1);
    expect(external[0].body).toEqual({ dispatchId: invite.id, recipient: "bob@example.com", message: `ALICE wants to hang out with Huddle! https://huddle.example.com/invite/${invite.id}` });
    expect(api.my_invitation_deliveries(s.view(0))[0].status).toBe("submitted");
    expect(JSON.stringify(api.my_invitation_deliveries(s.view(0)))).not.toContain("bob@example.com");
    expect(api.my_invitation_deliveries(s.view(2))).toEqual([]);
  });

  it("never automatically retries an ambiguous send and cancels queued opt-outs", () => {
    const s = setup(); s.env.MESSAGES_ENABLED = "true"; s.env.PUBLIC_FRONTEND_BASE_URL = "https://huddle.example.com";
    s.reduce(1, tx => api.saveMessageConnector(tx, { enabled: true, destination: "+14155550111" }));
    const group = s.group(); s.invite(group.groupId);
    const job = [...s.test.db.invitation_delivery_job.iter()][0];
    s.messageResult("throw");
    api.runInvitationDeliveryJob(s.proc(), { job });
    api.runInvitationDeliveryJob(s.proc(), { job });
    expect(api.my_invitation_deliveries(s.view(0))[0].status).toBe("unknown");
    expect(s.calls.filter(c => c.path === "/connectors/messages/send")).toHaveLength(1);
    const next = s.group(); s.invite(next.groupId);
    const pending = [...s.test.db.invitation_delivery_job.iter()].find(j => j.invitationId !== job.invitationId)!;
    s.reduce(1, tx => api.saveMessageConnector(tx, { enabled: false, destination: "" }));
    api.runInvitationDeliveryJob(s.proc(), { job: pending });
    expect(s.calls.filter(c => c.path === "/connectors/messages/send")).toHaveLength(1);
    expect(api.my_invitation_deliveries(s.view(1)).some(r => r.status === "in_app_only")).toBe(true);
  });

  it("does not send cancelled invitations and treats interrupted claims as unknown without replay", () => {
    const s = setup(); s.env.MESSAGES_ENABLED = "true"; s.env.PUBLIC_FRONTEND_BASE_URL = "https://huddle.example.com";
    s.reduce(1, tx => api.saveMessageConnector(tx, { enabled: true, destination: "bob@example.com" }));
    const group = s.group(); const invitation = s.invite(group.groupId);
    const cancelled = [...s.test.db.invitation_delivery_job.iter()][0];
    s.reduce(0, tx => api.cancelHuddleInvitation(tx, { invitationId: invitation.id }));
    api.runInvitationDeliveryJob(s.proc(), { job: cancelled });
    expect(api.my_invitation_deliveries(s.view(0))[0].status).toBe("cancelled");
    const another = s.group(); const pending = s.invite(another.groupId);
    const job = [...s.test.db.invitation_delivery_job.iter()].find(j => j.invitationId === pending.id)!;
    const row = s.test.db.invitation_delivery.invitationId.find(pending.id)!;
    s.test.db.invitation_delivery.invitationId.update({ ...row, status: "sending" });
    api.runInvitationDeliveryJob(s.proc(), { job });
    api.runInvitationDeliveryJob(s.proc(), { job });
    expect(s.test.db.invitation_delivery.invitationId.find(pending.id)!.status).toBe("unknown");
    expect(s.calls.filter(c => c.path === "/connectors/messages/send")).toHaveLength(0);
  });
});
