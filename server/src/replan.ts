// Re-plan loop (S5.5). Part A's file, written by Eric Chen while Haydn is out.
// When a call fails with full or closed, recordCallEvent (booking.ts) calls replan() in the
// same transaction. It excludes that restaurant, starts a fresh run (plan -> offers + scout
// -> council -> voting all follow on their own), and sets replanFor so the UI shows "That
// place is full. New plan ready" with a one-tap "Call again". It never places a call itself.
//
// Runs inline rather than as a replan_job schedule: Maincloud cannot add a schedule to an
// existing table ("Adding schedules is not yet implemented"), and inline is simpler anyway.
import { startRun } from "./plans";
import type { Tx } from "./lib/types";

export function replan(tx: Tx, groupId: string, bookingId: string) {
  const b = tx.db.booking.id.find(bookingId);
  const g = tx.db.group.id.find(groupId);
  if (!b || !g) return;
  if (g.replanFor === b.id) return; // already handled (e.g. a repeated failed event)
  const excludedPlaceIds = g.excludedPlaceIds.includes(b.placeId)
    ? g.excludedPlaceIds
    : [...g.excludedPlaceIds, b.placeId];
  // Back to 'planned' so the new run reopens the vote once its council is done.
  tx.db.group.id.update({ ...g, excludedPlaceIds, replanFor: b.id, status: "planned" });
  startRun(tx, g.id);
}
