import { ScheduleAt } from "spacetimedb/server";
import type { ReadDb, Tx } from "./types";

export const nowMs = (ctx: { timestamp: { toMillis(): bigint } }) => Number(ctx.timestamp.toMillis());

// For schedule-table rows: run `delayMs` from now. scheduledId 0n is replaced by autoInc.
export function at(ctx: Tx, delayMs = 0) {
  return { scheduledId: 0n, scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + BigInt(delayMs) * 1000n) };
}

export const newId = (ctx: Tx, prefix: string) => `${prefix}_${ctx.newUuidV4().toString().replace(/-/g, "").slice(0, 12)}`;

export const parse = <T = any>(json: string | undefined | null): T | null => (json ? (JSON.parse(json) as T) : null);

// The caller's member row: their most recent join. Phones identify by SpacetimeDB Identity.
export function currentMember(db: ReadDb, sender: Tx["sender"]) {
  let best: ReturnType<ReadDb["member"]["id"]["find"]> = null;
  for (const m of db.member.identity.filter(sender)) if (!best || m.joinedAt > best.joinedAt) best = m;
  return best;
}

// The caller's group: the one they joined, else the one they most recently created.
export function currentGroup(db: ReadDb, sender: Tx["sender"]) {
  const m = currentMember(db, sender);
  if (m) return db.group.id.find(m.groupId);
  let best: ReturnType<ReadDb["group"]["id"]["find"]> = null;
  for (const g of db.group.hostIdentity.filter(sender)) if (!best || g.createdAt > best.createdAt) best = g;
  return best;
}

export function membersOf(db: ReadDb, groupId: string) {
  return Array.from(db.member.groupId.filter(groupId));
}
