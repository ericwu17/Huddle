// Booking calls (S5.4, S5.5 startBooking/placeCall) and the fake-event replayer.
import { SenderError, t } from "spacetimedb/server";
import spacetimedb, { call_job, fake_event_job } from "./schema";
import { finishCouncil, insertCouncilMessage } from "./council";
import { requireMember } from "./groups";
import { callVoice } from "./lib/api";
import { fakeCallEvents } from "./lib/fakes";
import { placeById } from "./lib/places";
import { planFitsBudgets } from "./lib/budgets";
import { planMembers } from "./plans";
import type { Tx } from "./lib/types";
import { at, membersOf, newId, nowMs, parse } from "./lib/util";

const FAKE_CALL_STEP_MS = 1200;
const REPLAN_REASONS = new Set(["full", "closed"]);

// Stores one call event (from voice's POST /callEvent or the fake call) and moves the
// booking along. failed + full|closed schedules Haydn's replan (replan_job).
export function recordCallEvent(tx: Tx, e: any) {
  const b = tx.db.booking.id.find(e.bookingId);
  if (!b) throw new Error(`unknown booking ${e.bookingId}`);
  tx.db.call_event.insert({
    id: 0n, bookingId: e.bookingId, type: e.type, text: e.text ?? undefined, speaker: e.speaker ?? undefined,
    textEn: e.textEn ?? undefined, lang: e.lang ?? undefined, slot: e.slot ?? undefined,
    reason: e.reason ?? undefined, ts: e.ts ?? nowMs(tx),
  });
  if (e.type === "dialing" || e.type === "connected") tx.db.booking.id.update({ ...b, status: "calling" });
  if (e.type === "confirmed") {
    tx.db.booking.id.update({ ...b, status: "confirmed", slot: e.slot ?? b.slot });
    const g = tx.db.group.id.find(b.groupId);
    if (g) tx.db.group.id.update({ ...g, status: "booked" });
  }
  if (e.type === "failed") {
    tx.db.booking.id.update({ ...b, status: "failed", failReason: e.reason });
    if (REPLAN_REASONS.has(e.reason)) tx.db.replan_job.insert({ ...at(tx), groupId: b.groupId, bookingId: b.id });
  }
}

export const startBooking = spacetimedb.reducer(
  { runId: t.string(), planId: t.string(), stopIndex: t.u32() },
  (tx, { runId, planId, stopIndex }) => {
    const me = requireMember(tx);
    const run = tx.db.plan_run.runId.find(runId);
    if (!run || run.groupId !== me.groupId) throw new SenderError("no such run");
    const plan = (parse(run.resultJson)?.plans ?? []).find((p: any) => p.id === planId);
    const stop = plan?.stops?.[stopIndex];
    if (!stop) throw new SenderError("no such stop");
    if (!planFitsBudgets(plan, planMembers(tx, me.groupId)))
      throw new SenderError("plan is unavailable under current budgets");
    const g = tx.db.group.id.find(me.groupId)!;
    const bookingId = newId(tx, "b");
    tx.db.booking.insert({
      id: bookingId, groupId: g.id, runId, planId, stopIndex, placeId: stop.placeId, restaurantName: stop.name,
      time: `${g.date}T${stop.start}:00-07:00`, partySize: membersOf(tx.db, g.id).length, status: "pending",
      slot: undefined, failReason: undefined, createdAt: nowMs(tx),
    });
    tx.db.group.id.update({ ...g, replanFor: undefined }); // a new call clears the re-plan banner
    tx.db.call_job.insert({ ...at(tx), bookingId }); // never auto-called: only this tap gets here
  },
);

export const runCallJob = spacetimedb.procedure(
  { onSchedule: call_job }, { job: call_job.rowType }, t.unit(),
  (ctx, { job }) => {
    const body = ctx.withTx((tx) => {
      const b = tx.db.booking.id.find(job.bookingId);
      if (!b) return null;
      const members = membersOf(tx.db, b.groupId).sort((x, y) => x.joinedAt - y.joinedAt);
      const [, hh, mm] = b.time.match(/T(\d\d):(\d\d)/) ?? [];
      const mins = Number(hh) * 60 + Number(mm);
      const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      return {
        bookingId: b.id, placeId: b.placeId, restaurantName: b.restaurantName,
        restaurantPhone: placeById(b.placeId)?.phone ?? "", partySize: b.partySize, time: b.time,
        nameOnReservation: members[0]?.name ?? "Guest",
        alternativeWindow: { earliest: hhmm(mins - 30), latest: hhmm(mins + 90) },
        language: tx.env.AGENT_LANGUAGE ?? "zh",
      };
    });
    if (!body) return {};
    const res = callVoice(ctx, "/book", body);
    ctx.withTx((tx) => {
      if (!res.ok) {
        recordCallEvent(tx, { bookingId: job.bookingId, type: "failed", reason: "error", text: res.error.message });
        return;
      }
      if (!res.stub) return; // the voice service posts events to /callEvent itself
      fakeCallEvents(tx.env.STUB_SCENARIO ?? "confirm").forEach((e, i) =>
        tx.db.fake_event_job.insert({
          ...at(tx, i * FAKE_CALL_STEP_MS), kind: "call_event",
          payloadJson: JSON.stringify({ bookingId: job.bookingId, text: null, slot: null, ...e }),
        }),
      );
    });
    return {};
  },
);

// Replays stubbed council messages and call events on a timer so the UI sees them stream.
export const runFakeEventJob = spacetimedb.reducer(
  { onSchedule: fake_event_job }, { job: fake_event_job.rowType },
  (tx, { job }) => {
    const p = JSON.parse(job.payloadJson);
    if (job.kind === "council_message") insertCouncilMessage(tx, p);
    else if (job.kind === "council_done") finishCouncil(tx, p.runId, p.result);
    else if (job.kind === "call_event") recordCallEvent(tx, p);
  },
);
