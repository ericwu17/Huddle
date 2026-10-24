// Private saved defaults, reciprocal contacts and addressed in-app invitations.
// In-app delivery is durable; optional external dispatch is gated in connectors.ts.
import { SenderError, t } from "spacetimedb/server";
import spacetimedb, { invitation_expiry_job } from "./schema";
import { membershipKey, requireAccount } from "./lib/account-state";
import { invalidateAgent } from "./lib/agent-state";
import { at, membersOf, newId, nowMs } from "./lib/util";
import type { ReadDb, Tx } from "./lib/types";
import { queueInvitationDelivery } from "./connectors";

const DAY = 24 * 60 * 60 * 1000;
const pairKey = (a: string, b: string) => [a, b].sort().join(":");
const friendKey = (a: string, b: string) => `${a}:${b}`;
const diets = new Set(["vegetarian", "vegan", "gluten_free", "halal", "kosher"]);

function accountFor(db: ReadDb, sender: Tx["sender"]) {
  const session = db.account_session.identity.find(sender);
  return session?.accountId ? db.account.id.find(session.accountId) : null;
}

function stringList(value: unknown, name: string, max: number) {
  if (!Array.isArray(value) || value.length > max || value.some(v => typeof v !== "string" || !v.trim() || v.length > 60))
    throw new SenderError(`Invalid ${name}.`);
  return [...new Set(value.map(v => v.trim().toLowerCase()))];
}

function contextJson(text: string) {
  if (text.length > 8000) throw new SenderError("Saved context is too long.");
  let value: any;
  try { value = JSON.parse(text); } catch { throw new SenderError("Saved context must be valid JSON."); }
  const fields = new Set(["version", "preferences", "dietary", "allergies", "budgetMaxPerPerson", "maxOutingMinutes", "maxTravelMinutes"]);
  if (!value || Array.isArray(value) || typeof value !== "object" || value.version !== 1 ||
      Object.keys(value).some(k => !fields.has(k)) || typeof value.preferences !== "string" || value.preferences.length > 4000)
    throw new SenderError("Invalid saved context.");
  const dietary = stringList(value.dietary, "dietary defaults", 5);
  const allergies = stringList(value.allergies, "allergy defaults", 12);
  if (dietary.some(v => !diets.has(v))) throw new SenderError("Unsupported dietary default.");
  for (const field of ["budgetMaxPerPerson", "maxOutingMinutes", "maxTravelMinutes"]) {
    const n = value[field];
    if (field === "maxTravelMinutes" && n === undefined) continue;
    if (n !== null && (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > (field === "budgetMaxPerPerson" ? 10000 : 1440)))
      throw new SenderError(`Invalid ${field}.`);
  }
  return JSON.stringify({ version: 1, preferences: value.preferences.trim(), dietary, allergies,
    budgetMaxPerPerson: value.budgetMaxPerPerson, maxOutingMinutes: value.maxOutingMinutes,
    ...(value.maxTravelMinutes !== undefined ? { maxTravelMinutes: value.maxTravelMinutes } : {}) });
}

export const saveAccountContext = spacetimedb.reducer({ contextJson: t.string() }, (tx, args) => {
  const { account } = requireAccount(tx);
  const old = tx.db.account_context.accountId.find(account.id);
  const row = { accountId: account.id, contextJson: contextJson(args.contextJson), revision: (old?.revision ?? 0) + 1, updatedAt: nowMs(tx) };
  if (old) tx.db.account_context.accountId.update(row); else tx.db.account_context.insert(row);
});

export const clearAccountContext = spacetimedb.reducer({}, tx => {
  const { account } = requireAccount(tx);
  tx.db.account_context.accountId.delete(account.id);
});

export const my_account_context = spacetimedb.view({ name: "my_account_context", public: true }, t.option(t.row("MyAccountContextRow", {
  accountId: t.string().primaryKey(), contextJson: t.string(), revision: t.u32(), updatedAt: t.f64(),
})), ctx => {
  const account = accountFor(ctx.db, ctx.sender);
  return account ? ctx.db.account_context.accountId.find(account.id) ?? undefined : undefined;
});

function makeFriends(tx: Tx, a: string, b: string) {
  if (a === b) return;
  for (const [accountId, friendAccountId] of [[a, b], [b, a]]) {
    const id = friendKey(accountId, friendAccountId);
    if (!tx.db.account_friend.id.find(id)) tx.db.account_friend.insert({ id, accountId, friendAccountId, createdAt: nowMs(tx) });
  }
  const request = tx.db.friend_request.id.find(pairKey(a, b));
  if (request && request.status !== "accepted") tx.db.friend_request.id.update({ ...request, status: "accepted" });
}

// Called only after a participant explicitly accepts membership. Everyone in
// that huddle becomes a contact; nothing imports their private saved context.
export function connectHuddleContacts(tx: Tx, accountId: string, groupId: string) {
  for (const membership of tx.db.account_membership.iter()) {
    if (membership.groupId !== groupId || membership.accountId === accountId) continue;
    const peer = tx.db.account.id.find(membership.accountId);
    const member = tx.db.member.id.find(membership.memberId);
    if (peer && member?.groupId === groupId && member.identity.isEqual(peer.principal)) makeFriends(tx, accountId, peer.id);
  }
}

export const requestFriend = spacetimedb.reducer({ username: t.string() }, (tx, { username }) => {
  const { account } = requireAccount(tx);
  const handle = username.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(handle)) throw new SenderError("Enter your friend's exact username.");
  const recipient = tx.db.account.username.find(handle);
  if (!recipient) throw new SenderError("No account has that username. Check with your friend.");
  if (recipient.id === account.id) throw new SenderError("That is your own username.");
  if (tx.db.account_friend.id.find(friendKey(account.id, recipient.id))) return;
  const id = pairKey(account.id, recipient.id);
  const old = tx.db.friend_request.id.find(id);
  if (old?.status === "pending") {
    if (old.toAccountId === account.id) makeFriends(tx, account.id, recipient.id);
    return;
  }
  const row = { id, fromAccountId: account.id, toAccountId: recipient.id, status: "pending", createdAt: nowMs(tx) };
  if (old) tx.db.friend_request.id.update(row); else tx.db.friend_request.insert(row);
});

export const respondFriendRequest = spacetimedb.reducer({ requestId: t.string(), accept: t.bool() }, (tx, { requestId, accept }) => {
  const { account } = requireAccount(tx);
  const request = tx.db.friend_request.id.find(requestId);
  if (!request || request.toAccountId !== account.id) throw new SenderError("This friend request is not addressed to you.");
  if (request.status === "accepted" && accept) return;
  if (request.status !== "pending") throw new SenderError("This friend request is no longer pending.");
  if (accept) makeFriends(tx, request.fromAccountId, request.toAccountId);
  else tx.db.friend_request.id.update({ ...request, status: "declined" });
});

export const removeFriend = spacetimedb.reducer({ friendAccountId: t.string() }, (tx, { friendAccountId }) => {
  const { account } = requireAccount(tx);
  tx.db.account_friend.id.delete(friendKey(account.id, friendAccountId));
  tx.db.account_friend.id.delete(friendKey(friendAccountId, account.id));
  tx.db.friend_contact_destination.id.delete(friendKey(account.id, friendAccountId));
  tx.db.friend_contact_destination.id.delete(friendKey(friendAccountId, account.id));
  const request = tx.db.friend_request.id.find(pairKey(account.id, friendAccountId));
  if (request) tx.db.friend_request.id.update({ ...request, status: "cancelled" });
  for (const invitation of tx.db.huddle_invitation.iter()) {
    if (invitation.status === "pending" && ((invitation.fromAccountId === account.id && invitation.toAccountId === friendAccountId) ||
        (invitation.fromAccountId === friendAccountId && invitation.toAccountId === account.id)))
      tx.db.huddle_invitation.id.update({ ...invitation, status: "cancelled" });
  }
});

export const my_friends = spacetimedb.view({ name: "my_friends", public: true }, t.array(t.row("MyFriendRow", {
  accountId: t.string().primaryKey(), username: t.string(), displayName: t.string(),
})), ctx => {
  const account = accountFor(ctx.db, ctx.sender);
  if (!account) return [];
  return Array.from(ctx.db.account_friend.accountId.filter(account.id)).flatMap(contact => {
    const friend = ctx.db.account.id.find(contact.friendAccountId);
    return friend ? [{ accountId: friend.id, username: friend.username, displayName: friend.displayName }] : [];
  });
});

export const my_friend_requests = spacetimedb.view({ name: "my_friend_requests", public: true }, t.array(t.row("MyFriendRequestRow", {
  id: t.string().primaryKey(), fromAccountId: t.string(), fromUsername: t.string(), fromDisplayName: t.string(),
  toAccountId: t.string(), toUsername: t.string(), toDisplayName: t.string(), direction: t.string(), status: t.string(), createdAt: t.f64(),
})), ctx => {
  const account = accountFor(ctx.db, ctx.sender);
  if (!account) return [];
  const rows = [...ctx.db.friend_request.fromAccountId.filter(account.id), ...ctx.db.friend_request.toAccountId.filter(account.id)];
  return rows.flatMap(request => {
    const from = ctx.db.account.id.find(request.fromAccountId), to = ctx.db.account.id.find(request.toAccountId);
    return from && to ? [{ ...request, fromUsername: from.username, fromDisplayName: from.displayName,
      toUsername: to.username, toDisplayName: to.displayName, direction: request.toAccountId === account.id ? "incoming" : "outgoing" }] : [];
  });
});

function ownedMembership(tx: Tx, account: ReturnType<typeof requireAccount>["account"], groupId: string) {
  const membership = tx.db.account_membership.id.find(membershipKey(account.id, groupId));
  const member = membership && tx.db.member.id.find(membership.memberId);
  if (!member || member.groupId !== groupId || !member.identity.isEqual(account.principal))
    throw new SenderError("You must be a member of this huddle to invite friends.");
}

export const inviteFriends = spacetimedb.reducer({ groupId: t.string(), friendAccountIds: t.array(t.string()) }, (tx, { groupId, friendAccountIds }) => {
  const { account } = requireAccount(tx);
  ownedMembership(tx, account, groupId);
  const group = tx.db.group.id.find(groupId);
  if (!group || !["lobby", "eliciting"].includes(group.status)) throw new SenderError("This huddle is no longer accepting invitations.");
  const ids = [...new Set(friendAccountIds)];
  if (!ids.length || ids.length > 11) throw new SenderError("Choose 1–11 friends to invite.");
  // Validate the entire batch before writing any invitation.
  for (const id of ids) if (!tx.db.account_friend.id.find(friendKey(account.id, id)) || !tx.db.account.id.find(id))
    throw new SenderError("Invite only people in your friends list.");
  for (const toAccountId of ids) {
    if (tx.db.account_membership.id.find(membershipKey(toAccountId, groupId))) continue;
    const old = Array.from(tx.db.huddle_invitation.groupId.filter(groupId)).find(i => i.toAccountId === toAccountId && i.status === "pending" && i.expiresAt > nowMs(tx));
    if (old) continue;
    const id = newId(tx, "invite", candidate => !!tx.db.huddle_invitation.id.find(candidate));
    tx.db.huddle_invitation.insert({ id, groupId, fromAccountId: account.id, toAccountId, status: "pending", createdAt: nowMs(tx), expiresAt: nowMs(tx) + DAY });
    tx.db.invitation_expiry_job.insert({ ...at(tx, DAY), invitationId: id });
    queueInvitationDelivery(tx, id);
  }
});

export const respondHuddleInvitation = spacetimedb.reducer({ invitationId: t.string(), accept: t.bool() }, (tx, { invitationId, accept }) => {
  const { account, session } = requireAccount(tx);
  const invitation = tx.db.huddle_invitation.id.find(invitationId);
  if (!invitation || invitation.toAccountId !== account.id) throw new SenderError("This invitation is not addressed to your account.");
  const membership = tx.db.account_membership.id.find(membershipKey(account.id, invitation.groupId));
  if (invitation.status === "accepted" && accept && membership) {
    const member = tx.db.member.id.find(membership.memberId);
    if (!member || member.groupId !== invitation.groupId || !member.identity.isEqual(account.principal)) throw new SenderError("This membership is unavailable.");
    tx.db.account_session.identity.update({ ...session, activeGroupId: invitation.groupId });
    return;
  }
  if (invitation.status !== "pending" || invitation.expiresAt <= nowMs(tx)) throw new SenderError("This invitation is no longer available. Ask your friend to invite you again.");
  if (!accept) { tx.db.huddle_invitation.id.update({ ...invitation, status: "declined" }); return; }
  const group = tx.db.group.id.find(invitation.groupId);
  if (!group || !["lobby", "eliciting"].includes(group.status)) throw new SenderError("This huddle has already started planning. Ask for a new invitation.");
  if (!membership) {
    if (membersOf(tx.db, group.id).length >= 12) throw new SenderError("This huddle already has 12 people.");
    const memberId = newId(tx, "m", id => !!tx.db.member.id.find(id));
    tx.db.member.insert({ id: memberId, groupId: group.id, identity: account.principal, name: account.displayName,
      originLat: undefined, originLng: undefined, ready: false, swipeCount: 0, joinedAt: nowMs(tx) });
    tx.db.account_membership.insert({ id: membershipKey(account.id, group.id), accountId: account.id,
      groupId: group.id, memberId, role: "member" });
    invalidateAgent(tx, group.id);
  }
  tx.db.huddle_invitation.id.update({ ...invitation, status: "accepted" });
  tx.db.account_session.identity.update({ ...session, activeGroupId: group.id });
  connectHuddleContacts(tx, account.id, group.id);
});

export const cancelHuddleInvitation = spacetimedb.reducer({ invitationId: t.string() }, (tx, { invitationId }) => {
  const { account } = requireAccount(tx);
  const invitation = tx.db.huddle_invitation.id.find(invitationId);
  if (!invitation || invitation.fromAccountId !== account.id) throw new SenderError("Only the sender can cancel this invitation.");
  if (invitation.status === "cancelled") return;
  if (invitation.status !== "pending") throw new SenderError("This invitation is no longer pending.");
  tx.db.huddle_invitation.id.update({ ...invitation, status: "cancelled" });
});

export const runInvitationExpiryJob = spacetimedb.procedure(
  { onSchedule: invitation_expiry_job }, { job: invitation_expiry_job.rowType }, t.unit(),
  (ctx, { job }) => {
    ctx.withTx(tx => {
      const invitation = tx.db.huddle_invitation.id.find(job.invitationId);
      if (invitation?.status === "pending" && invitation.expiresAt <= nowMs(tx))
        tx.db.huddle_invitation.id.update({ ...invitation, status: "expired" });
    });
    return {};
  },
);

export const my_huddle_invitations = spacetimedb.view({ name: "my_huddle_invitations", public: true }, t.array(t.row("MyHuddleInvitationRow", {
  id: t.string().primaryKey(), groupId: t.string(), groupName: t.string(), fromAccountId: t.string(), fromDisplayName: t.string(),
  toAccountId: t.string(), toUsername: t.string(), toDisplayName: t.string(), direction: t.string(), status: t.string(),
  message: t.string(), path: t.string(), createdAt: t.f64(), expiresAt: t.f64(),
})), ctx => {
  const account = accountFor(ctx.db, ctx.sender);
  if (!account) return [];
  const rows = [...ctx.db.huddle_invitation.fromAccountId.filter(account.id), ...ctx.db.huddle_invitation.toAccountId.filter(account.id)];
  return rows.flatMap(invitation => {
    const from = ctx.db.account.id.find(invitation.fromAccountId), to = ctx.db.account.id.find(invitation.toAccountId);
    const group = ctx.db.group.id.find(invitation.groupId);
    const delivery = ctx.db.invitation_delivery.invitationId.find(invitation.id);
    return from && to && group ? [{ ...invitation, groupName: group.name || "A new Huddle", fromDisplayName: from.displayName,
      toUsername: to.username, toDisplayName: to.displayName, direction: invitation.toAccountId === account.id ? "incoming" : "outgoing",
      message: delivery?.message ?? `${from.displayName} wants to hang out with Huddle! Open Huddle to join.`, path: `/invite/${invitation.id}` }] : [];
  });
});
