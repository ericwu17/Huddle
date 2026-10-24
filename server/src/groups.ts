// Groups and members (docs/CONTRACT.md S5.5).
// createGroup/joinGroup are procedures so they can return ids; the rest are reducers that
// act on the caller's own membership (identity replaces the old memberId + secret).
import { SenderError, t } from "spacetimedb/server";
import spacetimedb from "./schema";
import type { Tx } from "./lib/types";
import { currentGroup, currentMember, membersOf, newId, nowMs } from "./lib/util";

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
  const m = currentMember(tx.db, tx.sender);
  if (!m) throw new SenderError("join a huddle first");
  return m;
}

export function requireGroup(tx: Tx) {
  const g = currentGroup(tx.db, tx.sender);
  if (!g) throw new SenderError("no huddle");
  return g;
}

export const createGroup = spacetimedb.procedure(
  { name: t.option(t.string()) },
  t.object("CreateGroupResult", { groupId: t.string(), code: t.string() }),
  (ctx, { name }) =>
    ctx.withTx((tx) => {
      let code = randomCode(tx);
      while (tx.db.group.code.find(code)) code = randomCode(tx);
      const now = nowMs(tx);
      const groupId = newId(tx, "g", (id) => !!tx.db.group.id.find(id));
      tx.db.group.insert({
        id: groupId,
        code,
        hostIdentity: tx.sender,
        name,
        status: "lobby",
        date: nextSaturday(now),
        windowStart: "17:00",
        windowEnd: "23:00",
        demoMode: false,
        showWhoCompromised: false,
        confidence: undefined,
        latestRunId: undefined,
        runCounter: 0,
        excludedPlaceIds: [],
        replanFor: undefined,
        previewNonce: undefined,
        createdAt: now,
      });
      return { groupId, code };
    }),
);

export const joinGroup = spacetimedb.procedure(
  { code: t.string(), name: t.string() },
  t.object("JoinGroupResult", { memberId: t.string(), groupId: t.string() }),
  (ctx, { code, name }) =>
    ctx.withTx((tx) => {
      const g = tx.db.group.code.find(code.trim().toUpperCase());
      if (!g) throw new SenderError("no group with that code");
      if (g.status !== "lobby" && g.status !== "eliciting") throw new SenderError("this huddle has already planned");
      const memberId = newId(tx, "m", (id) => !!tx.db.member.id.find(id));
      tx.db.member.insert({
        id: memberId,
        groupId: g.id,
        identity: tx.sender,
        name: name.trim().slice(0, 40),
        originLat: undefined,
        originLng: undefined,
        ready: false,
        swipeCount: 0,
        joinedAt: nowMs(tx),
      });
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
  tx.db.member.id.update({ ...me, originLat: lat, originLng: lng });
});

export const setDemoMode = spacetimedb.reducer({ on: t.bool() }, (tx, { on }) => {
  const g = requireGroup(tx);
  tx.db.group.id.update({ ...g, demoMode: on });
});

export const setShowWhoCompromised = spacetimedb.reducer({ on: t.bool() }, (tx, { on }) => {
  const g = requireGroup(tx);
  tx.db.group.id.update({ ...g, showWhoCompromised: on });
});
