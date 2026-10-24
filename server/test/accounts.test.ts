import { describe, expect, it } from "vitest";
import { ConnectionId, Timestamp } from "spacetimedb";
import { createModuleTestHarness, TestAuth } from "spacetimedb/server/test-utils";
import schema, * as api from "../src/index";

function setup() {
  const test = createModuleTestHarness(schema, api, { rngSeed: 112n });
  test.clock.set(Timestamp.fromDate(new Date("2026-10-24T18:00:00Z")));
  const users = [1, 2, 3].map(i => TestAuth.fromJwtPayload(JSON.stringify({ iss: "accounts-test", sub: `device-${i}` }), new ConnectionId(BigInt(i))));
  const env = { FASTAPI_BASE_URL: "https://accounts-test.invalid", HUDDLE_SHARED_SECRET: "unit-only", STUB_MODE: "false" };
  const wrap = (ctx: any): any => new Proxy(Object.create(null), { get(_target, key) {
    if (key === "env") return env;
    if (key === "withTx") return (fn: any) => ctx.withTx((tx: any) => fn(wrap(tx)));
    const value = Reflect.get(ctx, key, ctx);
    return typeof value === "function" && key !== "random" ? value.bind(ctx) : value;
  } });
  let intercept: (() => void) | null = null;
  let principal = 1;
  const proc = (user: any) => wrap(test.procedureContextBuilder(user).http((_target: any, _req: any, bytes: Uint8Array) => {
    const body = JSON.parse(new TextDecoder().decode(bytes));
    intercept?.();
    const ok = ["synthetic-password", "eight-ok"].includes(body.password) && (body.action === "register" || !!body.account);
    return { code: 200, headers: { entries: [] }, version: { tag: "Http11" as const }, body: JSON.stringify({
      authenticated: ok, passwordHash: ok ? `$argon2id$native-${body.username}` : null,
      principalHex: body.action === "register" ? (principal++).toString(16).padStart(64, "0") : null,
    }) };
  }).build());
  const reduce = (user: any, fn: (tx: any) => any) => test.withReducerTx(user, tx => fn(wrap(tx)));
  const register = (i: number, username: string) => api.registerAccount(proc(users[i]), { username,
    displayName: username.toUpperCase(), password: "synthetic-password" });
  const login = (i: number, username: string, password = "synthetic-password") => api.loginAccount(proc(users[i]), { username, password });
  const account = (i: number) => api.my_account(test.viewContext(users[i]));
  const memberships = (i: number) => api.my_account_memberships(test.viewContext(users[i]));
  const group = (i: number) => {
    const g = api.createAgentGroup(proc(users[i]), { name: "Account fixture" });
    api.joinGroup(proc(users[i]), { code: g.code, name: "untrusted browser name" });
    return g;
  };
  return { test, users, env, proc, reduce, register, login, account, memberships, group, intercept: (fn: () => void) => { intercept = fn; } };
}

describe("accounts and explicit memberships", () => {
  it("accepts eight-character demo passwords and rejects seven-character passwords", () => {
    const s = setup();
    expect(api.registerAccount(s.proc(s.users[0]), { username: "short", displayName: "Short", password: "seven!!" }).ok).toBe(false);
    expect(api.registerAccount(s.proc(s.users[0]), { username: "eight", displayName: "Eight", password: "eight-ok" }).ok).toBe(true);
    expect(s.account(0)?.username).toBe("eight");
  });
  it("creates two accounts, normalizes handles, rejects duplicates and stores no password", () => {
    const s = setup();
    expect(s.register(0, "Alice").ok).toBe(true);
    expect(s.register(1, "bob").ok).toBe(true);
    expect(s.register(2, "ALICE").ok).toBe(false);
    expect(s.account(0)?.username).toBe("alice");
    expect(s.account(1)?.username).toBe("bob");
    expect(s.account(0)?.accountId).not.toBe(s.account(1)?.accountId);
    expect(JSON.stringify(s.account(0))).not.toMatch(/password|principal|hash/i);
    expect([...s.test.db.account.iter()].some(a => a.passwordHash === "synthetic-password")).toBe(false);
  });

  it("recovers the same account and memberships on a new device without duplicate members", () => {
    const s = setup(); s.register(0, "alice"); const group = s.group(0);
    expect(s.login(2, "ALICE").ok).toBe(true);
    expect(s.account(2)?.accountId).toBe(s.account(0)?.accountId);
    expect(s.memberships(2).map(m => m.groupId)).toEqual([group.groupId]);
    s.reduce(s.users[2], tx => api.selectHuddle(tx, { groupId: group.groupId }));
    expect(api.my_group(s.test.viewContext(s.users[2]))?.isHost).toBe(true);
    api.joinGroup(s.proc(s.users[2]), { code: group.code, name: "forged display" });
    expect(s.test.db.member.count()).toBe(1n);
    expect(s.memberships(2)[0].name).toBe("ALICE");
  });

  it("keeps memberships and private inputs isolated and rejects foreign group selection", () => {
    const s = setup(); s.register(0, "alice"); s.register(1, "bob");
    const a = s.group(0), b = s.group(1);
    s.reduce(s.users[0], tx => api.submitAgentPrefs(tx, { text: "ALICE_PRIVATE under $20" }));
    s.reduce(s.users[1], tx => api.submitAgentPrefs(tx, { text: "BOB_PRIVATE vegetarian" }));
    expect(s.memberships(0).map(m => m.groupId)).toEqual([a.groupId]);
    expect(s.memberships(1).map(m => m.groupId)).toEqual([b.groupId]);
    expect(api.my_agent_needs(s.test.viewContext(s.users[0]))?.text).toContain("ALICE_PRIVATE");
    expect(api.my_agent_needs(s.test.viewContext(s.users[1]))?.text).toContain("BOB_PRIVATE");
    expect(() => s.reduce(s.users[1], tx => api.selectHuddle(tx, { groupId: a.groupId }))).toThrow();
    expect(() => s.reduce(s.users[1], tx => api.setShowWhoCompromised(tx, { on: true }))).not.toThrow();
    s.reduce(s.users[0], tx => api.requestFriend(tx, { username: "bob" }));
    const request = api.my_friend_requests(s.test.viewContext(s.users[1]))[0];
    s.reduce(s.users[1], tx => api.respondFriendRequest(tx, { requestId: request.id, accept: true }));
    const bobAccountId = s.account(1)!.accountId;
    s.reduce(s.users[0], tx => api.inviteFriends(tx, { groupId: a.groupId, friendAccountIds: [bobAccountId] }));
    const invitation = api.my_huddle_invitations(s.test.viewContext(s.users[1]))[0];
    s.reduce(s.users[1], tx => api.respondHuddleInvitation(tx, { invitationId: invitation.id, accept: true }));
    expect(api.my_group(s.test.viewContext(s.users[1]))?.isHost).toBe(false);
    expect(api.my_agent_needs(s.test.viewContext(s.users[1]))).toBeUndefined();
    expect(() => s.reduce(s.users[1], tx => api.setShowWhoCompromised(tx, { on: true }))).toThrow();
  });

  it("joins an account-hosted huddle with its code, as a guest or a signed-in account", () => {
    const s = setup(); s.register(0, "alice"); s.register(1, "bob");
    const a = s.group(0);
    const bob = api.joinGroup(s.proc(s.users[1]), { code: a.code.toLowerCase(), name: "ignored" });
    expect(bob.groupId).toBe(a.groupId);
    expect(s.memberships(1).map(m => [m.groupId, m.role, m.name])).toEqual([[a.groupId, "member", "BOB"]]);
    const guest = api.joinGroup(s.proc(s.users[2]), { code: a.code, name: " Riley " });
    expect(guest.groupId).toBe(a.groupId);
    expect(api.my_members(s.test.viewContext(s.users[2])).map(m => m.name).sort()).toEqual(["ALICE", "BOB", "Riley"]);
  });

  it("removes a huddle from only this account's list and leaves the huddle intact", () => {
    const s = setup(); s.register(0, "alice"); s.register(1, "bob");
    const a = s.group(0);
    api.joinGroup(s.proc(s.users[1]), { code: a.code, name: "ignored" });
    s.reduce(s.users[1], tx => api.removeHuddle(tx, { groupId: a.groupId }));
    expect(s.memberships(1)).toEqual([]);
    expect(s.memberships(0).map(m => m.groupId)).toEqual([a.groupId]);
    expect(s.test.db.member.count()).toBe(2n);
    expect(() => s.reduce(s.users[1], tx => api.removeHuddle(tx, { groupId: a.groupId }))).toThrow(/not in your list/);
    expect(() => s.reduce(s.users[2], tx => api.removeHuddle(tx, { groupId: a.groupId }))).toThrow();
  });

  it("selects old memberships explicitly without changing readiness or another device selection", () => {
    const s = setup(); s.register(0, "alice"); const first = s.group(0), second = s.group(0);
    expect(api.my_group(s.test.viewContext(s.users[0]))?.id).toBe(second.groupId);
    s.login(2, "alice"); s.reduce(s.users[2], tx => api.selectHuddle(tx, { groupId: first.groupId }));
    expect(api.my_group(s.test.viewContext(s.users[2]))?.id).toBe(first.groupId);
    expect(api.my_group(s.test.viewContext(s.users[0]))?.id).toBe(second.groupId);
    expect([...s.test.db.member.iter()].every(m => !m.ready)).toBe(true);
  });

  it("logout revokes the old device identity and switching accounts exposes only new ownership", () => {
    const s = setup(); s.register(0, "alice"); s.group(0); s.register(1, "bob"); const b = s.group(1);
    s.reduce(s.users[0], tx => api.logoutAccount(tx, {}));
    expect(s.account(0)).toBeUndefined(); expect(s.memberships(0)).toEqual([]);
    expect(api.my_group(s.test.viewContext(s.users[0]))).toBeUndefined();
    expect(() => s.group(0)).toThrow();
    expect(s.login(0, "bob").ok).toBe(true);
    expect(s.memberships(0).map(m => m.groupId)).toEqual([b.groupId]);
    expect(s.login(0, "alice").ok).toBe(false);
  });

  it("rejects wrong/unknown credentials with the same message and throttles repeated attempts", () => {
    const s = setup(); s.register(0, "alice");
    const wrong = s.login(1, "alice", "wrong-password");
    const missing = s.login(2, "nobody", "wrong-password");
    expect(wrong).toEqual(missing); expect(s.account(1)).toBeUndefined();
    for (let i = 0; i < 12; i++) s.login(1, "alice", "wrong-password");
    expect(s.login(1, "alice").message).toMatch(/Too many attempts/);
  });

  it("a late login reply cannot undo logout", () => {
    const s = setup(); s.register(0, "alice");
    s.intercept(() => s.reduce(s.users[1], tx => api.logoutAccount(tx, {})));
    expect(s.login(1, "alice").ok).toBe(false);
    expect(s.account(1)).toBeUndefined();
  });

  it("does not fabricate a login or registration when the service is unavailable", () => {
    const s = setup(); s.register(0, "alice");
    s.env.FASTAPI_BASE_URL = "";
    expect(s.login(1, "alice").ok).toBe(false);
    expect(s.register(2, "bob").ok).toBe(false);
    expect(s.account(1)).toBeUndefined(); expect(s.account(2)).toBeUndefined();
    expect(s.test.db.account.count()).toBe(1n);
  });

  it("rejects an authentication reply verified against a superseded credential snapshot", () => {
    const s = setup(); s.register(0, "alice");
    s.intercept(() => {
      const row = s.test.db.account.username.find("alice")!;
      s.test.db.account.id.update({ ...row, passwordHash: "$argon2id$changed-while-authenticating" });
    });
    expect(s.login(1, "alice").ok).toBe(false);
    expect(s.account(1)).toBeUndefined();
  });

  it("expires sessions and old expiry jobs cannot revoke a newer login", () => {
    const s = setup(); s.register(0, "alice"); s.group(0);
    const oldJob = [...s.test.db.account_expiry_job.iter()][0];
    s.reduce(s.users[0], tx => api.logoutAccount(tx, {})); s.login(0, "alice");
    s.test.clock.set(Timestamp.fromDate(new Date("2026-10-25T18:00:00Z")));
    expect(() => s.reduce(s.users[0], tx => api.setReady(tx, {}))).toThrow();
    api.runAccountExpiryJob(s.proc(s.users[0]), { job: oldJob });
    expect(s.account(0)).toBeDefined();
    const latest = [...s.test.db.account_expiry_job.iter()].at(-1)!;
    api.runAccountExpiryJob(s.proc(s.users[0]), { job: latest });
    expect(s.account(0)).toBeUndefined(); expect(s.memberships(0)).toEqual([]);
  });

  it("does not silently adopt legacy anonymous memberships into a new account", () => {
    const s = setup(); const guest = s.group(0); s.register(0, "alice");
    expect(s.memberships(0)).toEqual([]);
    expect(api.my_group(s.test.viewContext(s.users[0]))).toBeUndefined();
    expect(() => s.reduce(s.users[0], tx => api.selectHuddle(tx, { groupId: guest.groupId }))).toThrow();
  });
});
