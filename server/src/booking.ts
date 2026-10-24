// Booking calls (S5.4, S5.5 startBooking/placeCall) and the fake-event replayer.
import { SenderError, t } from "spacetimedb/server";
import spacetimedb, { call_job, fake_event_job } from "./schema";
import { finishCouncil, insertCouncilMessage } from "./council";
import { requireMember } from "./groups";
import { replan } from "./replan";
import { voiceFor } from "./lib/demo";
import { fakeCallEvents } from "./lib/fakes";
import { findPlace } from "./lib/catalog";
import { availablePlans } from "./lib/availability";
import type { Tx } from "./lib/types";
import { at, membersOf, newId, nowMs } from "./lib/util";
import { agentBallot, isAgent } from "./lib/agent-state";
import { requireActor } from "./lib/account-state";

const FAKE_CALL_STEP_MS = 1200;
const REPLAN_REASONS = new Set(["full", "closed"]);

// Stores one call event (from voice's POST /callEvent or the fake call) and moves the
// booking along. failed + full|closed re-plans right away (replan.ts).
export function recordCallEvent(tx: Tx, e: any) {
  const b = tx.db.booking.id.find(e.bookingId);
  if (!b) throw new Error(`unknown booking ${e.bookingId}`);
  tx.db.call_event.insert({
    id: 0n, bookingId: e.bookingId, type: e.type, text: e.text ?? undefined, speaker: e.speaker ?? undefined,
    textEn: e.textEn ?? undefined, lang: e.lang ?? undefined, slot: e.slot ?? undefined,
    reason: e.reason ?? undefined, ts: e.ts ?? nowMs(tx),
  });
  // Keep late/replayed event history, but never revive a terminal booking.
  if (b.status === "failed" || b.status === "confirmed") return;
  if (e.type === "dialing" || e.type === "connected") tx.db.booking.id.update({ ...b, status: "calling" });
  if (e.type === "confirmed") {
    tx.db.booking.id.update({ ...b, status: "confirmed", slot: e.slot ?? b.slot });
    const g = tx.db.group.id.find(b.groupId);
    // A confirmation is still an external fact for this booking. It must not
    // commit a newer group run or an outing that no longer fits current caps.
    if (g && availablePlans(tx.db, b.groupId, b.runId).some((p) => p.id === b.planId))
      tx.db.group.id.update({ ...g, status: "booked" });
  }
  if (e.type === "failed") {
    tx.db.booking.id.update({ ...b, status: "failed", failReason: e.reason });
    if (REPLAN_REASONS.has(e.reason) && tx.db.group.id.find(b.groupId)?.latestRunId === b.runId)
      replan(tx, b.groupId, b.id);
  }
}

export const startBooking = spacetimedb.reducer(
  { runId: t.string(), planId: t.string(), stopIndex: t.u32() },
  (tx, { runId, planId, stopIndex }) => {
    const me = requireMember(tx);
    const run = tx.db.plan_run.runId.find(runId);
    if (!run || run.groupId !== me.groupId) throw new SenderError("no such run");
    const plan = availablePlans(tx.db, me.groupId, runId).find((p) => p.id === planId);
    if (!plan) throw new SenderError("plan is no longer available; choose a current plan");
    const stop = plan?.stops?.[stopIndex];
    if (!stop) throw new SenderError("no such stop");
    const g = tx.db.group.id.find(me.groupId)!;
    if (isAgent(tx.db, g.id)) {
      if (!g.hostIdentity.isEqual(requireActor(tx))) throw new SenderError("Only the host can start the booking simulation.");
      if (agentBallot(tx.db, g.id, runId).winner !== planId) throw new SenderError("Everyone must vote and resolve the current choice first.");
      if (stop.category !== "meal") throw new SenderError("Choose the meal stop for booking.");
      if (Array.from(tx.db.booking.groupId.filter(g.id)).some(b => b.runId === runId && b.status !== "failed"))
        throw new SenderError("A booking already exists for this run.");
    }
    const bookingId = newId(tx, "b", (id) => !!tx.db.booking.id.find(id));
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
      if (!b || b.status !== "pending") return null;
      const plan = availablePlans(tx.db, b.groupId, b.runId).find((p) => p.id === b.planId);
      if (!plan || plan.stops?.[b.stopIndex]?.placeId !== b.placeId ||
          isAgent(tx.db, b.groupId) && agentBallot(tx.db, b.groupId, b.runId).winner !== b.planId) {
        recordCallEvent(tx, { bookingId: b.id, type: "failed", reason: "error",
          text: "This booking is no longer available. Choose a current plan and book again." });
        return null;
      }
      // Claim dispatch before leaving the transaction. A repeated scheduled
      // job must not start a second call while voice is still responding.
      tx.db.booking.id.update({ ...b, status: "calling" });
      const members = membersOf(tx.db, b.groupId).sort((x, y) => x.joinedAt - y.joinedAt);
      const [, hh, mm] = b.time.match(/T(\d\d):(\d\d)/) ?? [];
      const mins = Number(hh) * 60 + Number(mm);
      const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      return {
        groupId: b.groupId,
        bookingId: b.id, placeId: b.placeId, restaurantName: b.restaurantName,
        restaurantPhone: findPlace(tx.db, b.placeId)?.phone ?? "", partySize: b.partySize, time: b.time,
        nameOnReservation: members[0]?.name ?? "Guest",
        alternativeWindow: { earliest: hhmm(mins - 30), latest: hhmm(mins + 90) },
        language: tx.env.AGENT_LANGUAGE ?? "zh",
      };
    });
    if (!body) return {};
    const { groupId, ...book } = body;
    // Agent-mode booking is always explicitly simulated; never call a live
    // voice URL just because the shared module has one configured.
    const simulate = ctx.withTx(tx => isAgent(tx.db, groupId));
    const res = simulate ? { ok: true as const, stub: true, data: { accepted: true } }
      : voiceFor(ctx, groupId, "/book", book);
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
