import { describe, expect, it } from "vitest";
import { ConnectionId, Identity, Timestamp } from "spacetimedb";
import { createModuleTestHarness, TestAuth } from "spacetimedb/server/test-utils";
import schema, * as api from "../src/index";

function setup() {
  const test = createModuleTestHarness(schema, api, { rngSeed: 922n });
  test.clock.set(Timestamp.fromDate(new Date("2026-10-24T18:00:00Z")));
  const users = [1, 2, 3, 4].map(i => TestAuth.fromJwtPayload(JSON.stringify({ iss: "contacts-fixtures", sub: `device-${i}` }), new ConnectionId(BigInt(i))));
  const env: Record<string, string | undefined> = { STUB_MODE: "false", FASTAPI_BASE_URL: "https://fixture-api.invalid", HUDDLE_SHARED_SECRET: "unit-only",
    MAC_CONTACTS_OWNER_USERNAME: "maxli", MESSAGES_ENABLED: "true", PUBLIC_FRONTEND_BASE_URL: "https://huddle.example.com" };
  const wrap = (ctx: any): any => new Proxy(Object.create(null), { get(_target, key) {
    if (key === "env") return env;
    if (key === "withTx") return (fn: any) => ctx.withTx((tx: any) => fn(wrap(tx)));
    const value = Reflect.get(ctx, key, ctx);
    return typeof value === "function" && key !== "random" ? value.bind(ctx) : value;
  } });
  const reduce = <T>(i: number, fn: (tx: any) => T) => test.withReducerTx(users[i], tx => fn(wrap(tx)));
  ["maxli", "eric", "other"].forEach((username, i) => reduce(i, tx => {
    const id = `account-${username}`;
    tx.db.account.insert({ id, username, displayName: username.toUpperCase(), principal: Identity.fromString((i + 1).toString(16).padStart(64, "0")), passwordHash: "$argon2id$fixture-only", createdAt: Number(tx.timestamp.toMillis()) });
    tx.db.account_session.insert({ identity: tx.sender, accountId: id, nonce: `device-session-${i}`, activeGroupId: undefined, expiresAt: Number(tx.timestamp.toMillis()) + 86400000 });
  }));
  const calls: Array<{ path: string; body: any }> = [];
  let intercept: (() => void) | undefined;
  let contactsResult: any = { contacts: [{ contactId: "synthetic-contact-eric", displayName: "Eric Fixture", privateExtra: "should be discarded", destinations: [
    { value: "+14155550111", label: "mobile", kind: "phone", privateExtra: "discarded" },
    { value: "eric@example.com", label: "home", kind: "email" },
  ] }], truncated: false };
  let messageResult = "submitted";
  const proc = (i = 0) => wrap(test.procedureContextBuilder(users[i]).http((_test, req, bytes) => {
    const body = JSON.parse(new TextDecoder().decode(bytes));
    const path = req.uri.replace(env.FASTAPI_BASE_URL!, "");
    calls.push({ path, body });
    const action = intercept; intercept = undefined; action?.();
    const result = path === "/connectors/contacts/search" ? contactsResult : { dispatchId: body.dispatchId, status: messageResult };
    return { code: 200, headers: { entries: [] }, version: { tag: "Http11" as const }, body: JSON.stringify(result) };
  }).build());
  const view = (i: number) => test.viewContext(users[i]);
  const friends = () => {
    reduce(0, tx => api.requestFriend(tx, { username: "eric" }));
    const request = api.my_friend_requests(view(1)).find(r => r.status === "pending");
    if (request) reduce(1, tx => api.respondFriendRequest(tx, { requestId: request.id, accept: true }));
  };
  const invite = () => {
    friends();
    const group = api.createAgentGroup(proc(0), { name: "Public invitation fixture" });
    api.joinGroup(proc(0), { code: group.code, name: "ignored" });
    reduce(0, tx => api.inviteFriends(tx, { groupId: group.groupId, friendAccountIds: ["account-eric"] }));
    return api.my_huddle_invitations(view(0)).find(i => i.groupId === group.groupId)!;
  };
  const link = (destination = "+14155550111") => reduce(0, tx => api.saveFriendContact(tx, {
    friendAccountId: "account-eric", contactId: "synthetic-contact-eric", contactName: "Eric Fixture", destination,
  }));
  const job = (invitationId: string) => [...test.db.invitation_delivery_job.iter()].filter(j => j.invitationId === invitationId).at(-1)!;
  return { test, users, env, calls, reduce, proc, view, friends, invite, link, job,
    intercept: (fn: () => void) => { intercept = fn; }, contactsResult: (value: any) => { contactsResult = value; },
    messageResult: (value: string) => { messageResult = value; } };
}

describe("designated-owner Contacts search", () => {
  it("denies non-owners/guests and unconfigured ownership before reading any Contacts", () => {
    const s = setup();
    expect(() => api.searchMacContacts(s.proc(1), { query: "Eric" })).toThrow(/designated/);
    expect(() => api.searchMacContacts(s.proc(3), { query: "Eric" })).toThrow();
    s.env.MAC_CONTACTS_OWNER_USERNAME = undefined;
    expect(() => api.searchMacContacts(s.proc(0), { query: "Eric" })).toThrow(/designated/);
    expect(s.calls).toEqual([]);
  });

  it("returns only bounded matching contract fields and does not persist the search results", () => {
    const s = setup();
    const result = api.searchMacContacts(s.proc(), { query: " Eric " });
    expect(result.ok).toBe(true); expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].destinations).toHaveLength(2);
    expect(s.calls[0]).toEqual({ path: "/connectors/contacts/search", body: { query: "Eric" } });
    expect(JSON.stringify(result)).not.toContain("privateExtra");
    expect(s.test.db.friend_contact_destination.count()).toBe(0n);
    expect(api.my_friend_contact_destinations(s.view(1))).toEqual([]);
    for (const query of ["E", "x".repeat(81), "Eric\nSmith"])
      expect(() => api.searchMacContacts(s.proc(), { query })).toThrow(/2–80/);
  });

  it("rejects malformed, oversized and mismatched-kind service responses safely", () => {
    const s = setup();
    for (const value of [
      { contacts: [], truncated: "no" },
      { contacts: Array.from({ length: 11 }, (_, i) => ({ contactId: String(i), displayName: "Eric", destinations: [] })), truncated: true },
      { contacts: [{ contactId: "x".repeat(513), displayName: "Eric", destinations: [] }], truncated: false },
      { contacts: [{ contactId: "eric", displayName: "x".repeat(201), destinations: [] }], truncated: false },
      { contacts: [{ contactId: "eric", displayName: "Eric", destinations: Array.from({ length: 13 }, () => ({ value: "+14155550111", label: "mobile", kind: "phone" })) }], truncated: false },
      { contacts: [{ contactId: "eric", displayName: "Eric", destinations: [{ value: "eric@example.com", label: "x".repeat(81), kind: "email" }] }], truncated: false },
      { contacts: [{ contactId: "eric", displayName: "Eric", destinations: [{ value: "eric@example.com", label: "home", kind: "phone" }] }], truncated: false },
      { contacts: [{ contactId: "eric", displayName: "Eric", destinations: [{ value: "+14155550111", label: "mobile", kind: "sms" }] }], truncated: false },
      { contacts: [{ contactId: "eric", displayName: "Eric", destinations: [{ value: "4155550111", label: "mobile", kind: "phone" }] }], truncated: false },
    ]) {
      s.contactsResult(value);
      const result = api.searchMacContacts(s.proc(), { query: "Eric" });
      expect(result.ok).toBe(false); expect(result.contacts).toEqual([]);
    }
  });

  it("does not return old owner's matches after logout/account-switch or a superseded session", () => {
    const s = setup();
    s.intercept(() => s.reduce(0, tx => {
      const session = tx.db.account_session.identity.find(tx.sender)!;
      tx.db.account_session.identity.update({ ...session, nonce: "new-verified-owner-login" });
    }));
    expect(() => api.searchMacContacts(s.proc(), { query: "Eric" })).toThrow(/account changed/);
    const switched = setup();
    switched.intercept(() => switched.reduce(0, tx => {
      // The private binding simulates a verified login as another account.
      const session = tx.db.account_session.identity.find(tx.sender)!;
      tx.db.account_session.identity.update({ ...session, accountId: "account-eric", nonce: "verified-other-login" });
    }));
    expect(() => api.searchMacContacts(switched.proc(), { query: "Eric" })).toThrow(/designated/);
  });
});

describe("explicit friend mappings and invitation dispatch", () => {
  it("requires accepted friendship and the designated owner, and scopes saved mappings to that owner", () => {
    const s = setup();
    expect(() => s.link()).toThrow(/accepted friends/);
    s.friends(); s.link();
    expect(api.my_friend_contact_destinations(s.view(0))).toEqual([{ friendAccountId: "account-eric", contactId: "synthetic-contact-eric", contactName: "Eric Fixture", destination: "+14155550111" }]);
    expect(api.my_friend_contact_destinations(s.view(1))).toEqual([]);
    expect(api.my_friend_contact_destinations(s.view(2))).toEqual([]);
    expect(() => s.reduce(1, tx => api.saveFriendContact(tx, { friendAccountId: "account-maxli", contactId: "forged", contactName: "Forged", destination: "max@example.com" }))).toThrow(/designated/);
    expect(() => s.link("4155550111")).toThrow(/valid contact/);
    s.reduce(0, tx => api.removeFriend(tx, { friendAccountId: "account-eric" }));
    expect(api.my_friend_contact_destinations(s.view(0))).toEqual([]);
  });

  it("sends only to the selected friend's mapping without requiring that friend to type an address", () => {
    const s = setup(); s.friends(); s.link("eric@example.com"); const invitation = s.invite();
    expect(s.test.db.message_connector.accountId.find("account-eric")).toBeNull();
    api.runInvitationDeliveryJob(s.proc(), { job: s.job(invitation.id) });
    const send = s.calls.find(c => c.path === "/connectors/messages/send")!;
    expect(send.body.recipient).toBe("eric@example.com");
    expect(send.body.message).toBe(`MAXLI wants to hang out with Huddle! https://huddle.example.com/invite/${invitation.id}`);
    expect(JSON.stringify(api.my_invitation_deliveries(s.view(0)))).not.toContain("eric@example.com");
  });

  it("honors explicit recipient opt-out and gives an enabled recipient's own address priority", () => {
    const s = setup(); s.friends(); s.link();
    s.reduce(1, tx => api.saveMessageConnector(tx, { enabled: false, destination: "" }));
    const blocked = s.invite();
    expect(api.my_invitation_deliveries(s.view(0)).find(r => r.invitationId === blocked.id)!.status).toBe("in_app_only");
    expect(() => s.reduce(0, tx => api.sendInvitationMessage(tx, { invitationId: blocked.id }))).toThrow(/opt-out/);
    expect(s.calls.filter(c => c.path === "/connectors/messages/send")).toEqual([]);
    s.reduce(1, tx => api.saveMessageConnector(tx, { enabled: true, destination: "eric-private@example.com" }));
    const allowed = s.invite();
    api.runInvitationDeliveryJob(s.proc(), { job: s.job(allowed.id) });
    expect(s.calls.find(c => c.path === "/connectors/messages/send")!.body.recipient).toBe("eric-private@example.com");
  });

  it("suppresses queued unlink, address edits and recipient opt-out before any external attempt", () => {
    for (const action of ["unlink", "change", "optout"] as const) {
      const s = setup(); s.friends(); s.link(); const invitation = s.invite(); const job = s.job(invitation.id);
      if (action === "unlink") s.reduce(0, tx => api.clearFriendContact(tx, { friendAccountId: "account-eric" }));
      if (action === "change") s.link("eric-new@example.com");
      if (action === "optout") s.reduce(1, tx => api.saveMessageConnector(tx, { enabled: false, destination: "" }));
      api.runInvitationDeliveryJob(s.proc(), { job });
      expect(s.calls.filter(c => c.path === "/connectors/messages/send")).toHaveLength(0);
      expect(api.my_invitation_deliveries(s.view(0))[0].status).toBe("in_app_only");
    }
  });

  it("requires explicit sender action after linking an old invite and does not queue duplicate jobs", () => {
    const s = setup(); const invitation = s.invite();
    expect(s.test.db.invitation_delivery_job.count()).toBe(0n);
    s.link(); expect(s.test.db.invitation_delivery_job.count()).toBe(0n);
    expect(() => s.reduce(1, tx => api.sendInvitationMessage(tx, { invitationId: invitation.id }))).toThrow(/original sender/);
    s.reduce(0, tx => api.sendInvitationMessage(tx, { invitationId: invitation.id }));
    expect(s.test.db.invitation_delivery_job.count()).toBe(1n);
    expect(() => s.reduce(0, tx => api.sendInvitationMessage(tx, { invitationId: invitation.id }))).toThrow(/already queued/);
    const job = s.job(invitation.id);
    api.runInvitationDeliveryJob(s.proc(), { job }); api.runInvitationDeliveryJob(s.proc(), { job });
    expect(s.calls.filter(c => c.path === "/connectors/messages/send")).toHaveLength(1);
    expect(() => s.reduce(0, tx => api.sendInvitationMessage(tx, { invitationId: invitation.id }))).toThrow(/cannot be resent/);
  });

  it("permits explicit retry only after preflight-unavailable and never after an ambiguous submission", () => {
    const s = setup(); s.friends(); s.link(); const invitation = s.invite();
    s.messageResult("unavailable"); api.runInvitationDeliveryJob(s.proc(), { job: s.job(invitation.id) });
    s.reduce(0, tx => api.sendInvitationMessage(tx, { invitationId: invitation.id }));
    s.messageResult("submitted"); api.runInvitationDeliveryJob(s.proc(), { job: s.job(invitation.id) });
    expect(s.calls.filter(c => c.path === "/connectors/messages/send")).toHaveLength(2);
    const row = s.test.db.invitation_delivery.invitationId.find(invitation.id)!;
    for (const status of ["queued", "sending", "submitted", "unknown", "cancelled"]) {
      s.test.db.invitation_delivery.invitationId.update({ ...row, status });
      expect(() => s.reduce(0, tx => api.sendInvitationMessage(tx, { invitationId: invitation.id }))).toThrow(/cannot be resent/);
    }
    s.test.db.invitation_delivery.invitationId.update({ ...row, status: "in_app_only" });
    s.reduce(0, tx => api.cancelHuddleInvitation(tx, { invitationId: invitation.id }));
    expect(() => s.reduce(0, tx => api.sendInvitationMessage(tx, { invitationId: invitation.id }))).toThrow(/no longer pending/);
  });
});
