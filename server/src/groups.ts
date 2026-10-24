// Groups and members (docs/CONTRACT.md S5.5).
// createGroup/joinGroup are procedures so they can return ids; the rest are reducers that
// act on the caller's own membership (identity replaces the old memberId + secret).
import { SenderError, t } from "spacetimedb/server";
import spacetimedb from "./schema";
import type { Tx } from "./lib/types";
import { currentGroup, currentMember, membersOf, newId, nowMs } from "./lib/util";
import { invalidateAgent, isAgent } from "./lib/agent-state";
import { membershipKey, requireActor } from "./lib/account-state";
import { connectHuddleContacts } from "./social";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0, 1

function randomCode(tx: Tx): string {
  let code = "";
  for (let i = 0; i < 4; i++) code += CODE_ALPHABET[tx.random.integerInRange(0, CODE_ALPHABET.length - 1)];
  return code;
}

// The coming Saturday in Berkeley (UTC-7 during the event), or today if it is Saturday.
function nextSaturday(now: number): string {
  const local = new Date(now - 7 * 3600_000);
  const daysAhead = (6 - local.getUTCDay() + 7) % 7;
  return new Date(local.getTime() + daysAhead * 86400_000).toISOString().slice(0, 10);
}

export function requireMember(tx: Tx) {
  requireActor(tx);
  const m = currentMember(tx.db, tx.sender);
  if (!m) throw new SenderError("join a huddle first");
  return m;
}

export function requireGroup(tx: Tx) {
  requireActor(tx);
  const g = currentGroup(tx.db, tx.sender);
  if (!g) throw new SenderError("no huddle");
  return g;
}

function requireHost(tx: Tx) {
  const group = requireGroup(tx);
  if (!group.hostIdentity.isEqual(requireActor(tx))) throw new SenderError("only the host can change this setting");
  return group;
}

export function createGroupInTx(tx: Tx, name: string | undefined) {
  let code = randomCode(tx);
  while (tx.db.group.code.find(code)) code = randomCode(tx);
  const now = nowMs(tx);
  const groupId = newId(tx, "g", id => !!tx.db.group.id.find(id));
  tx.db.group.insert({ id: groupId, code, hostIdentity: requireActor(tx), name,
    status: "lobby", date: nextSaturday(now), windowStart: "17:00", windowEnd: "23:00",
    demoMode: false, showWhoCompromised: false, confidence: undefined, latestRunId: undefined,
    runCounter: 0, excludedPlaceIds: [], replanFor: undefined, previewNonce: undefined, createdAt: now });
  return { groupId, code };
}

export const createGroup = spacetimedb.procedure(
  { name: t.option(t.string()) },
  t.object("CreateGroupResult", { groupId: t.string(), code: t.string() }),
  (ctx, { name }) => ctx.withTx(tx => createGroupInTx(tx, name)),
);

export const joinGroup = spacetimedb.procedure(
  { code: t.string(), name: t.string() },
  t.object("JoinGroupResult", { memberId: t.string(), groupId: t.string() }),
  (ctx, { code, name }) =>
    ctx.withTx((tx) => {
      const g = tx.db.group.code.find(code.trim().toUpperCase());
      if (!g) throw new SenderError("no group with that code");
      const principal = requireActor(tx);
      const accountSession = tx.db.account_session.identity.find(tx.sender);
      const account = accountSession?.accountId && tx.db.account.id.find(accountSession.accountId);
      const select = (memberId: string) => {
        if (!account || !accountSession) return;
        const id = membershipKey(account.id, g.id);
        if (!tx.db.account_membership.id.find(id)) tx.db.account_membership.insert({ id, accountId: account.id,
          groupId: g.id, memberId, role: g.hostIdentity.isEqual(principal) ? "host" : "member" });
        tx.db.account_session.identity.update({ ...accountSession, activeGroupId: g.id });
      };
      const existing = membersOf(tx.db, g.id).find(m => m.identity.isEqual(principal));
      if (existing) { select(existing.id); return { memberId: existing.id, groupId: g.id }; }
      // The code (typed, scanned or in a shared link) is the invitation: anyone the
      // host gave it to can join while the huddle is still gathering people.
      // Inbox invitations remain an alternative for Huddle friends.
      if (g.status !== "lobby" && g.status !== "eliciting") throw new SenderError("this huddle has already planned");
      const memberId = newId(tx, "m", (id) => !!tx.db.member.id.find(id));
      tx.db.member.insert({
        id: memberId,
        groupId: g.id,
        identity: principal,
        name: account ? account.displayName : name.trim().slice(0, 40),
        originLat: undefined,
        originLng: undefined,
        ready: false,
        swipeCount: 0,
        joinedAt: nowMs(tx),
      });
      invalidateAgent(tx, g.id);
      select(memberId);
      if (account) connectHuddleContacts(tx, account.id, g.id);
      return { memberId, groupId: g.id };
    }),
);

// Lobby -> eliciting once there are at least 2 members and all are ready.
export const setReady = spacetimedb.reducer({}, (tx) => {
  const me = requireMember(tx);
  tx.db.member.id.update({ ...me, ready: true });
  const g = tx.db.group.id.find(me.groupId);
  if (!g || g.status !== "lobby") return;
  const members = membersOf(tx.db, g.id);
  if (members.length >= 2 && members.every((m) => m.id === me.id || m.ready)) {
    tx.db.group.id.update({ ...g, status: "eliciting" });
  }
});

export const setOrigin = spacetimedb.reducer({ lat: t.f64(), lng: t.f64() }, (tx, { lat, lng }) => {
  const me = requireMember(tx);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
    throw new SenderError("invalid location");
  tx.db.member.id.update({ ...me, originLat: lat, originLng: lng });
  if (isAgent(tx.db, me.groupId)) {
    const need = tx.db.agent_need.memberId.find(me.id);
    if (need) tx.db.agent_need.memberId.update({ ...need, confirmed: false });
    invalidateAgent(tx, me.groupId);
  }
});

export const setDemoMode = spacetimedb.reducer({ on: t.bool() }, (tx, { on }) => {
  const g = requireHost(tx);
  if (on && isAgent(tx.db, g.id)) throw new SenderError("Agent mode reports failures explicitly; synthetic planning is not enabled.");
  tx.db.group.id.update({ ...g, demoMode: on });
});

export const setShowWhoCompromised = spacetimedb.reducer({ on: t.bool() }, (tx, { on }) => {
  const g = requireHost(tx);
  tx.db.group.id.update({ ...g, showWhoCompromised: on });
});
