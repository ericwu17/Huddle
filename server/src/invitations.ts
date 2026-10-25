// Recipient preview and an atomic, idempotent invitation start. Never private preferences.
import { SenderError, t } from "spacetimedb/server";
import spacetimedb from "./schema";
import { createGroupInTx, cleanHuddleName } from "./groups";
import type { Tx } from "./lib/types";
import { requireAccount, membershipKey } from "./lib/account-state";
import { callApi } from "./lib/api";
import { newId, nowMs } from "./lib/util";
import { inviteFriends } from "./social";
import { saveHuddleTiming } from "./lib/huddle-timing";

const summaries: Record<string, string> = { meal: "A meal together", dessert: "Dessert together", activity: "An activity together", hangout: "A Huddle with friends" };
const intent = t.object("HuddleInviteIntentResult", { friendAccountIds: t.array(t.string()), ambiguousNames: t.array(t.string()), unknownNames: t.array(t.string()), outingKind: t.string(), summary: t.string() });
export const parseHuddleIntent = spacetimedb.procedure({ text: t.string() }, intent, (ctx, { text }) => {
  if (text.length > 2000) throw new SenderError("Keep the invitation request within 2000 characters.");
  const snapshot = ctx.withTx(tx => {
    const { account, session } = requireAccount(tx);
    const contacts = Array.from(tx.db.account_friend.accountId.filter(account.id)).flatMap(row => {
      const friend = tx.db.account.id.find(row.friendAccountId);
      return friend ? [{ accountId: friend.id, username: friend.username, displayName: friend.displayName }] : [];
    });
    if (contacts.length > 200) throw new SenderError("Use the friend picker for this larger contacts list.");
    return { accountId: account.id, nonce: session.nonce, contacts };
  });
  if (!text.trim()) return { friendAccountIds: [], ambiguousNames: [], unknownNames: [], outingKind: "hangout", summary: summaries.hangout };
  const response = callApi(ctx, "/agent/invite-intent", { text, contacts: snapshot.contacts });
  return ctx.withTx(tx => {
    const { account, session } = requireAccount(tx);
    if (account.id !== snapshot.accountId || session.nonce !== snapshot.nonce) throw new SenderError("Your account changed. Review this invitation again.");
    const data = response.ok && !response.stub ? response.data : null;
    if (!data || !Object.hasOwn(summaries, data.outingKind) || !Array.isArray(data.friendAccountIds) || data.friendAccountIds.length > 11 ||
        new Set(data.friendAccountIds).size !== data.friendAccountIds.length || !data.friendAccountIds.every((id: string) => snapshot.contacts.some(c => c.accountId === id)) ||
        ![data.ambiguousNames, data.unknownNames].every(a => Array.isArray(a) && a.length <= 16 && a.every((s: unknown) => typeof s === "string" && s.length <= 80)))
      throw new SenderError("Could not resolve the invitation. Use the friend picker; nobody has been invited.");
    return { ...data, summary: summaries[data.outingKind] };
  });
});

const startArgs = { requestId: t.string(), summary: t.string(), outingKind: t.string(), friendAccountIds: t.array(t.string()) };
const startResult = t.object("CreateInvitationHuddleResult", { groupId: t.string(), memberId: t.string(), code: t.string() });
type StartArgs = { requestId: string; summary: string; outingKind: string; friendAccountIds: string[] };

function startInvitationHuddle(tx: Tx, args: StartArgs, explicitName?: string) {
  const { account, session } = requireAccount(tx);
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(args.requestId) || !Object.hasOwn(summaries, args.outingKind)) throw new SenderError("Review the invitation before starting.");
  const selected = [...new Set(args.friendAccountIds)].sort();
  if (selected.length > 11 || selected.some(id => !tx.db.account_friend.id.find(`${account.id}:${id}`)))
    throw new SenderError("Choose up to 11 people from your current friends.");
  const fingerprint = JSON.stringify(explicitName === undefined ? [args.outingKind, selected] : [args.outingKind, selected, explicitName]);
  const key = `${account.id}:${args.requestId}`;
  const previous = tx.db.invitation_start.requestId.find(key);
  if (previous) {
    if (previous.fingerprint !== fingerprint) throw new SenderError("This request already started a different invitation. Start a new draft.");
    tx.db.account_session.identity.update({ ...session, activeGroupId: previous.groupId });
    return { groupId: previous.groupId, memberId: previous.memberId, code: previous.code };
  }
  // Only the separate, explicit name is shared; summary may contain private prompt text.
  const group = createGroupInTx(tx, explicitName ?? summaries[args.outingKind]);
  tx.db.agent_session.insert({ groupId: group.groupId, revision: 0, status: "needs", activeRunId: undefined, error: undefined });
  const created = tx.db.group.id.find(group.groupId)!;
  tx.db.group.id.update({ ...created, date: "", windowStart: "", windowEnd: "" });
  saveHuddleTiming(tx, group.groupId, "pending");
  const memberId = newId(tx, "m", id => !!tx.db.member.id.find(id));
  tx.db.member.insert({ id: memberId, groupId: group.groupId, identity: account.principal, name: account.displayName,
    originLat: undefined, originLng: undefined, ready: false, swipeCount: 0, joinedAt: nowMs(tx) });
  tx.db.account_membership.insert({ id: membershipKey(account.id, group.groupId), accountId: account.id, groupId: group.groupId, memberId, role: "host" });
  tx.db.account_session.identity.update({ ...session, activeGroupId: group.groupId });
  if (selected.length) inviteFriends(tx, { groupId: group.groupId, friendAccountIds: selected });
  tx.db.invitation_start.insert({ requestId: key, accountId: account.id, groupId: group.groupId, memberId, code: group.code, fingerprint });
  return { ...group, memberId };
}

// Keep the original four-argument contract for older clients and invitation prompts.
export const createInvitationHuddle = spacetimedb.procedure(startArgs, startResult,
  (ctx, args) => ctx.withTx(tx => startInvitationHuddle(tx, args)));

export const createNamedInvitationHuddle = spacetimedb.procedure({ ...startArgs, name: t.string() }, startResult,
  (ctx, args) => ctx.withTx(tx => startInvitationHuddle(tx, args, cleanHuddleName(args.name))));
