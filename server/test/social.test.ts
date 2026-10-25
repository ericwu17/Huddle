import { describe, expect, it } from "vitest";
import { ConnectionId, Identity, Timestamp } from "spacetimedb";
import { createModuleTestHarness, TestAuth } from "spacetimedb/server/test-utils";
import schema, * as api from "../src/index";

function setup() {
  const test = createModuleTestHarness(schema, api, { rngSeed: 911n });
  test.clock.set(Timestamp.fromDate(new Date("2026-10-24T18:00:00Z")));
  const users = [1, 2, 3, 4].map(i => TestAuth.fromJwtPayload(JSON.stringify({ iss: "social-test", sub: `device-${i}` }), new ConnectionId(BigInt(i))));
  const env = { STUB_MODE: "false" };
  const wrap = (ctx: any): any => new Proxy(Object.create(null), { get(_target, key) {
    if (key === "env") return env;
    if (key === "withTx") return (fn: any) => ctx.withTx((tx: any) => fn(wrap(tx)));
    const value = Reflect.get(ctx, key, ctx);
    return typeof value === "function" && key !== "random" ? value.bind(ctx) : value;
  } });
  const reduce = (i: number, fn: (tx: any) => void) => test.withReducerTx(users[i], tx => fn(wrap(tx)));
  ["alice", "bob", "cara"].forEach((username, i) => reduce(i, tx => {
    const id = `account-${username}`;
    tx.db.account.insert({ id, username, displayName: username.toUpperCase(), principal: Identity.fromString((i + 1).toString(16).padStart(64, "0")),
      passwordHash: "$argon2id$synthetic-test-only", createdAt: Number(tx.timestamp.toMillis()) });
    tx.db.account_session.insert({ identity: tx.sender, accountId: id, nonce: `session-${i}`, activeGroupId: undefined,
      expiresAt: Number(tx.timestamp.toMillis()) + 7 * 86400000 });
  }));
  const view = (i: number) => test.viewContext(users[i]);
  const proc = (i: number) => wrap(test.procedureContextBuilder(users[i]).build());
  const group = (i: number) => {
    const g = api.createAgentGroup(proc(i), { name: "Synthetic friends outing" });
    api.joinGroup(proc(i), { code: g.code, name: "ignored" });
    return g;
  };
  const friends = (a = 0, b = 1) => {
    const to = ["alice", "bob", "cara"][b];
    reduce(a, tx => api.requestFriend(tx, { username: to }));
    const request = api.my_friend_requests(view(b)).find(r => r.status === "pending")!;
    reduce(b, tx => api.respondFriendRequest(tx, { requestId: request.id, accept: true }));
  };
  const invite = (g: string, from = 0, to = 1) => {
    reduce(from, tx => api.inviteFriends(tx, { groupId: g, friendAccountIds: [`account-${["alice", "bob", "cara"][to]}`] }));
    return api.my_huddle_invitations(view(to)).find(i => i.groupId === g && i.status === "pending")!;
  };
  return { test, users, reduce, view, proc, group, friends, invite };
}

describe("private saved context", () => {
  const defaults = { version: 1, preferences: "Alice private defaults", dietary: ["vegetarian"], allergies: [],
    budgetMaxPerPerson: 20, maxOutingMinutes: 120, maxTravelMinutes: null, preferredStops: 2 };

  it("persists only the owner's explicitly edited defaults without applying them to an outing", () => {
    const s = setup(); const group = s.group(0);
    s.reduce(0, tx => api.saveAccountContext(tx, { contextJson: JSON.stringify(defaults) }));
    expect(JSON.parse(api.my_account_context(s.view(0))!.contextJson)).toEqual(defaults);
    expect(api.my_account_context(s.view(1))).toBeUndefined();
    expect(api.my_account_context(s.view(3))).toBeUndefined();
    expect(api.my_private(s.view(0))?.hardJson).toBeUndefined();
    expect(api.my_group(s.view(0))!.id).toBe(group.groupId);
    s.reduce(0, tx => api.saveAccountContext(tx, { contextJson: JSON.stringify({ ...defaults, budgetMaxPerPerson: 0 }) }));
    expect(api.my_account_context(s.view(0))!.revision).toBe(2);
    expect(JSON.parse(api.my_account_context(s.view(0))!.contextJson).budgetMaxPerPerson).toBe(0);
    s.reduce(0, tx => api.clearAccountContext(tx, {}));
    expect(api.my_account_context(s.view(0))).toBeUndefined();
  });

  it("rejects malformed, unsupported or unbounded context and revoked sessions", () => {
    const s = setup();
    for (const value of [{ ...defaults, budgetMaxPerPerson: -1 }, { ...defaults, dietary: ["made-up"] },
      { ...defaults, extraAccountId: "account-bob" }, { ...defaults, maxOutingMinutes: 1441 },
      { ...defaults, preferredStops: 4 }, { ...defaults, preferredStops: 1.5 },
      { ...defaults, allergies: Array.from({ length: 13 }, (_, i) => `allergy-${i}`) }])
      expect(() => s.reduce(0, tx => api.saveAccountContext(tx, { contextJson: JSON.stringify(value) }))).toThrow();
    s.reduce(0, tx => api.logoutAccount(tx, {}));
    expect(() => s.reduce(0, tx => api.saveAccountContext(tx, { contextJson: JSON.stringify(defaults) }))).toThrow();
  });

  it("supports the outing prompt's full length when the owner explicitly remembers it", () => {
    const s = setup();
    const long = { ...defaults, preferences: "x".repeat(4000) };
    s.reduce(0, tx => api.saveAccountContext(tx, { contextJson: JSON.stringify(long) }));
    expect(JSON.parse(api.my_account_context(s.view(0))!.contextJson).preferences).toHaveLength(4000);
    expect(() => s.reduce(0, tx => api.saveAccountContext(tx, { contextJson: JSON.stringify({ ...long, preferences: "x".repeat(4001) }) }))).toThrow();
  });
});

describe("addressed friendships and invitations", () => {
  it("requires exact handles and recipient consent, exposes no directory or unrelated request", () => {
    const s = setup();
    expect(() => s.reduce(0, tx => api.requestFriend(tx, { username: "al" }))).toThrow();
    expect(() => s.reduce(0, tx => api.requestFriend(tx, { username: "alice" }))).toThrow();
    expect(() => s.reduce(0, tx => api.requestFriend(tx, { username: "missing" }))).toThrow();
    s.reduce(0, tx => api.requestFriend(tx, { username: " BOB " }));
    s.reduce(0, tx => api.requestFriend(tx, { username: "bob" }));
    const request = api.my_friend_requests(s.view(1))[0];
    expect(s.test.db.friend_request.count()).toBe(1n);
    expect(request.fromUsername).toBe("alice");
    expect(request.direction).toBe("incoming");
    expect(api.my_friends(s.view(0))).toEqual([]);
    expect(api.my_friend_requests(s.view(2))).toEqual([]);
    expect(api.my_friend_requests(s.view(3))).toEqual([]);
    expect(() => s.reduce(0, tx => api.respondFriendRequest(tx, { requestId: request.id, accept: true }))).toThrow();
    expect(() => s.reduce(2, tx => api.respondFriendRequest(tx, { requestId: request.id, accept: true }))).toThrow();
    s.reduce(1, tx => api.respondFriendRequest(tx, { requestId: request.id, accept: true }));
    s.reduce(1, tx => api.respondFriendRequest(tx, { requestId: request.id, accept: true }));
    expect(api.my_friends(s.view(0))).toEqual([{ accountId: "account-bob", username: "bob", displayName: "BOB" }]);
    expect(api.my_friends(s.view(1))[0].username).toBe("alice");
    expect(JSON.stringify(api.my_friends(s.view(0)))).not.toMatch(/principal|password|hash/);
  });

  it("handles crossing requests, declines and reciprocal removal", () => {
    const s = setup();
    s.reduce(0, tx => api.requestFriend(tx, { username: "bob" }));
    s.reduce(1, tx => api.requestFriend(tx, { username: "alice" }));
    expect(api.my_friends(s.view(0))).toHaveLength(1);
    s.reduce(0, tx => api.removeFriend(tx, { friendAccountId: "account-bob" }));
    expect(api.my_friends(s.view(0))).toEqual([]); expect(api.my_friends(s.view(1))).toEqual([]);
    s.reduce(0, tx => api.requestFriend(tx, { username: "bob" }));
    const request = api.my_friend_requests(s.view(1))[0];
    s.reduce(1, tx => api.respondFriendRequest(tx, { requestId: request.id, accept: false }));
    expect(api.my_friend_requests(s.view(0))[0].status).toBe("declined");
  });

  it("sends a link notification only to friends, blocks copied links and joins exactly once", () => {
    const s = setup(); const g = s.group(0);
    expect(() => s.invite(g.groupId)).toThrow(/friends list/);
    s.friends(); const invitation = s.invite(g.groupId);
    expect(invitation.message).toContain("ALICE wants to hang out with Huddle!");
    expect(invitation.path).toBe(`/invite/${invitation.id}`);
    expect(invitation.direction).toBe("incoming");
    expect(api.my_huddle_invitations(s.view(2))).toEqual([]);
    expect(api.my_huddle_invitations(s.view(3))).toEqual([]);
    expect(() => s.reduce(2, tx => api.respondHuddleInvitation(tx, { invitationId: invitation.id, accept: true }))).toThrow(/not addressed/);
    s.invite(g.groupId); expect(s.test.db.huddle_invitation.count()).toBe(1n);
    s.reduce(1, tx => api.respondHuddleInvitation(tx, { invitationId: invitation.id, accept: true }));
    const memberCount = s.test.db.member.count();
    const membership = api.my_account_memberships(s.view(1))[0];
    expect(membership.groupId).toBe(g.groupId); expect(membership.role).toBe("member");
    expect(api.my_group(s.view(1))!.id).toBe(g.groupId);
    expect(api.my_members(s.view(1)).every(m => !m.ready)).toBe(true);
    expect(api.my_agent_needs(s.view(1))).toBeUndefined();
    s.reduce(1, tx => api.respondHuddleInvitation(tx, { invitationId: invitation.id, accept: true }));
    expect(s.test.db.member.count()).toBe(memberCount);
    expect(api.my_huddle_invitations(s.view(1))[0].status).toBe("accepted");
  });

  it("does not let a foreign huddle member send invitations and validates whole friend batches", () => {
    const s = setup(); const g = s.group(0); s.friends();
    expect(() => s.reduce(1, tx => api.inviteFriends(tx, { groupId: g.groupId, friendAccountIds: ["account-alice"] }))).toThrow(/must be a member/);
    expect(() => s.reduce(0, tx => api.inviteFriends(tx, { groupId: g.groupId, friendAccountIds: ["account-bob", "account-cara"] }))).toThrow(/friends list/);
    expect(s.test.db.huddle_invitation.count()).toBe(0n);
  });

  it("connects participants only after acceptance without copying private defaults", () => {
    const s = setup(); const g = s.group(0); s.friends(0, 1); s.friends(0, 2);
    const bob = s.invite(g.groupId, 0, 1), cara = s.invite(g.groupId, 0, 2);
    expect(api.my_friends(s.view(1)).map(f => f.username)).toEqual(["alice"]);
    s.reduce(1, tx => api.respondHuddleInvitation(tx, { invitationId: bob.id, accept: true }));
    expect(api.my_friends(s.view(1)).map(f => f.username)).toEqual(["alice"]);
    s.reduce(2, tx => api.respondHuddleInvitation(tx, { invitationId: cara.id, accept: true }));
    expect(api.my_friends(s.view(1)).map(f => f.username).sort()).toEqual(["alice", "cara"]);
    expect(api.my_friends(s.view(2)).map(f => f.username).sort()).toEqual(["alice", "bob"]);
    expect(api.my_account_context(s.view(1))).toBeUndefined();
  });

  it("supports recipient decline, sender cancellation, expiry and refuses late membership changes", () => {
    const s = setup(); const g = s.group(0); s.friends();
    const declined = s.invite(g.groupId);
    expect(() => s.reduce(1, tx => api.cancelHuddleInvitation(tx, { invitationId: declined.id }))).toThrow();
    s.reduce(1, tx => api.respondHuddleInvitation(tx, { invitationId: declined.id, accept: false }));
    expect(api.my_huddle_invitations(s.view(1))[0].status).toBe("declined");
    const cancelled = s.invite(g.groupId);
    s.reduce(0, tx => api.cancelHuddleInvitation(tx, { invitationId: cancelled.id }));
    expect(() => s.reduce(1, tx => api.respondHuddleInvitation(tx, { invitationId: cancelled.id, accept: true }))).toThrow();
    const expired = s.invite(g.groupId);
    s.test.clock.set(Timestamp.fromDate(new Date("2026-10-25T18:00:01Z")));
    expect(() => s.reduce(1, tx => api.respondHuddleInvitation(tx, { invitationId: expired.id, accept: true }))).toThrow(/no longer available/);
    const job = [...s.test.db.invitation_expiry_job.iter()].find(j => j.invitationId === expired.id)!;
    api.runInvitationExpiryJob(s.proc(0), { job });
    expect(api.my_huddle_invitations(s.view(1)).find(i => i.id === expired.id)!.status).toBe("expired");
    const late = s.invite(g.groupId);
    const row = s.test.db.group.id.find(g.groupId)!;
    s.test.db.group.id.update({ ...row, status: "voting" });
    expect(() => s.reduce(1, tx => api.respondHuddleInvitation(tx, { invitationId: late.id, accept: true }))).toThrow(/already started planning/);
    expect(api.my_account_memberships(s.view(1))).toEqual([]);
  });

  it("friend removal cancels outstanding invitations and logout clears all scoped social views", () => {
    const s = setup(); const g = s.group(0); s.friends(); const invitation = s.invite(g.groupId);
    s.reduce(1, tx => api.removeFriend(tx, { friendAccountId: "account-alice" }));
    expect(api.my_huddle_invitations(s.view(1))[0].status).toBe("cancelled");
    expect(() => s.reduce(1, tx => api.respondHuddleInvitation(tx, { invitationId: invitation.id, accept: true }))).toThrow();
    s.reduce(1, tx => api.logoutAccount(tx, {}));
    expect(api.my_friends(s.view(1))).toEqual([]);
    expect(api.my_friend_requests(s.view(1))).toEqual([]);
    expect(api.my_huddle_invitations(s.view(1))).toEqual([]);
    expect(() => s.reduce(1, tx => api.requestFriend(tx, { username: "cara" }))).toThrow();
  });

  it("recomputes every social and context view for the current account after a device switches", () => {
    const s = setup(); s.friends(0, 1); s.friends(0, 2);
    const group = s.group(0); s.invite(group.groupId);
    const a = { version: 1, preferences: "ALICE_PRIVATE", dietary: [], allergies: [], budgetMaxPerPerson: 10, maxOutingMinutes: null };
    const b = { ...a, preferences: "BOB_PRIVATE", budgetMaxPerPerson: 25 };
    s.reduce(0, tx => api.saveAccountContext(tx, { contextJson: JSON.stringify(a) }));
    s.reduce(1, tx => api.saveAccountContext(tx, { contextJson: JSON.stringify(b) }));
    s.reduce(0, tx => api.logoutAccount(tx, {}));
    expect(api.my_account_context(s.view(0))).toBeUndefined();
    expect(api.my_huddle_invitations(s.view(0))).toEqual([]);
    // Simulate the private binding written by a verified Bob login. Browser
    // callers cannot write this table or supply the account ID themselves.
    s.reduce(0, tx => {
      const session = tx.db.account_session.identity.find(tx.sender)!;
      tx.db.account_session.identity.update({ ...session, accountId: "account-bob", nonce: "bob-switch",
        expiresAt: Number(tx.timestamp.toMillis()) + 86400000 });
    });
    expect(JSON.parse(api.my_account_context(s.view(0))!.contextJson).preferences).toBe("BOB_PRIVATE");
    expect(api.my_friends(s.view(0)).map(f => f.username)).toEqual(["alice"]);
    expect(api.my_huddle_invitations(s.view(0)).every(i => i.direction === "incoming")).toBe(true);
    expect(api.my_account_memberships(s.view(0))).toEqual([]);
    s.reduce(0, tx => api.clearAccountContext(tx, {}));
    expect(api.my_account_context(s.view(1))).toBeUndefined();
    expect(s.test.db.account_context.accountId.find("account-alice")!.contextJson).toContain("ALICE_PRIVATE");
  });
});
