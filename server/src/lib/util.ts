import { ScheduleAt } from "spacetimedb/server";
import type { ReadDb, Tx } from "./types";
import { membershipKey, principalFor } from "./account-state";

export const nowMs = (ctx: { timestamp: { toMillis(): bigint } }) => Number(ctx.timestamp.toMillis());

// For schedule-table rows: run `delayMs` from now. scheduledId 0n is replaced by autoInc.
export function at(ctx: Tx, delayMs = 0) {
  return { scheduledId: 0n, scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + BigInt(delayMs) * 1000n) };
}

// SpacetimeDB seeds each transaction's RNG from its timestamp, so two transactions with the
// same timestamp draw the same "random" values (seen on Maincloud). Ids therefore mix in the
// timestamp, and `taken` rejects a clash so the next draw (the RNG advances) is used instead.
export function newId(ctx: Tx, prefix: string, taken: (id: string) => boolean): string {
  const ts = ctx.timestamp.microsSinceUnixEpoch.toString(36);
  for (;;) {
    const id = `${prefix}_${ts}${ctx.random.uint32().toString(36)}`;
    if (!taken(id)) return id;
  }
}

export const parse = <T = any>(json: string | undefined | null): T | null => (json ? (JSON.parse(json) as T) : null);

// The caller's member row: their most recent join. Phones identify by SpacetimeDB Identity.
export function currentMember(db: ReadDb, sender: Tx["sender"]) {
  const session = db.account_session.identity.find(sender);
  if (session) {
    if (!session.accountId || !session.activeGroupId) return null;
    const membership = db.account_membership.id.find(membershipKey(session.accountId, session.activeGroupId));
    const member = membership && db.member.id.find(membership.memberId);
    const principal = principalFor(db, sender);
    return member && principal && member.groupId === session.activeGroupId && member.identity.isEqual(principal) ? member : null;
  }
  let best: ReturnType<ReadDb["member"]["id"]["find"]> = null;
  for (const m of db.member.identity.filter(sender)) if (!best || m.joinedAt > best.joinedAt) best = m;
  return best;
}

// The caller's group: the one they joined, else the one they most recently created.
export function currentGroup(db: ReadDb, sender: Tx["sender"]) {
  const m = currentMember(db, sender);
  if (m) return db.group.id.find(m.groupId);
  if (db.account_session.identity.find(sender)) return null;
  let best: ReturnType<ReadDb["group"]["id"]["find"]> = null;
  for (const g of db.group.hostIdentity.filter(sender)) if (!best || g.createdAt > best.createdAt) best = g;
  return best;
}

export function membersOf(db: ReadDb, groupId: string) {
  return Array.from(db.member.groupId.filter(groupId));
}
