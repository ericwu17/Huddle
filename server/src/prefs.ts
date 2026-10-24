// Private preferences, swipes, and elicitation (docs/CONTRACT.md S5.5, build-brief B1).
import { SenderError, t } from "spacetimedb/server";
import spacetimedb, { parse_job, preview_job, swipe_job } from "./schema";
import { requireMember } from "./groups";
import { planMembers, startRun } from "./plans";
import { apiFor } from "./lib/demo";
import { CONFIDENCE_TARGET, MAX_SWIPES, MIN_SWIPES, PREVIEW_DEBOUNCE_MS } from "./lib/constants";
import { placesForMode } from "./lib/places";
import { guardPlanResult, preserveBudget } from "./lib/budgets";
import type { Proc } from "./lib/types";
import { at, membersOf, nowMs, parse } from "./lib/util";

// ---- reducers (called by phones) ----

export const submitPrefs = spacetimedb.reducer({ text: t.string() }, (tx, { text }) => {
  const me = requireMember(tx);
  const clean = text.trim().slice(0, 500);
  const existing = tx.db.private_prefs.memberId.find(me.id);
  if (existing) tx.db.private_prefs.memberId.update({ ...existing, text: clean, updatedAt: nowMs(tx) });
  else
    tx.db.private_prefs.insert({
      memberId: me.id, text: clean, hardJson: undefined, priorJson: undefined, posteriorJson: undefined,
      nextPairA: undefined, nextPairB: undefined, nextPairCategory: undefined, warningsJson: "[]",
      updatedAt: nowMs(tx),
    });
  tx.db.parse_job.insert({ ...at(tx), memberId: me.id });
});

export const submitSwipe = spacetimedb.reducer(
  { winnerPlaceId: t.string(), loserPlaceId: t.string() },
  (tx, { winnerPlaceId, loserPlaceId }) => {
    const me = requireMember(tx);
    if (me.swipeCount >= MAX_SWIPES) throw new SenderError("swipe limit reached");
    const prefs = tx.db.private_prefs.memberId.find(me.id);
    if (!prefs?.posteriorJson) throw new SenderError("preferences not parsed yet");
    tx.db.swipe.insert({ id: 0n, memberId: me.id, winnerPlaceId, loserPlaceId, ts: nowMs(tx) });
    tx.db.member.id.update({ ...me, swipeCount: me.swipeCount + 1 });
    tx.db.private_prefs.memberId.update({ ...prefs, nextPairA: undefined, nextPairB: undefined, nextPairCategory: undefined });
    tx.db.swipe_job.insert({ ...at(tx), memberId: me.id, winnerPlaceId, loserPlaceId });
  },
);

// ---- jobs (private: only the scheduler runs them) ----

function readPrefs(ctx: Proc, memberId: string) {
  return ctx.withTx((tx) => {
    const m = tx.db.member.id.find(memberId);
    const prefs = tx.db.private_prefs.memberId.find(memberId);
    const swipes = Array.from(tx.db.swipe.memberId.filter(memberId));
    return {
      groupId: m?.groupId ?? "",
      text: prefs?.text ?? "",
      posterior: parse(prefs?.posteriorJson),
      alreadySeen: swipes.map((s) => [s.winnerPlaceId, s.loserPlaceId]),
      swipeCount: m?.swipeCount ?? 0,
    };
  });
}

function fetchNextPair(ctx: Proc, memberId: string) {
  const { groupId, posterior, alreadySeen, swipeCount } = readPrefs(ctx, memberId);
  if (swipeCount >= MAX_SWIPES || !posterior) return;
  const res = apiFor(ctx, groupId, "/elicit/next", {
    memberId, posterior, alreadySeen, candidatePlaceIds: placesForMode(ctx.env.STUB_MODE).map((p) => p.id), focusPlaceIds: [],
  });
  if (!res.ok) throw new Error(`elicit/next failed: ${JSON.stringify(res.error)}`);
  const { a, b, category } = res.data;
  ctx.withTx((tx) => {
    const prefs = tx.db.private_prefs.memberId.find(memberId);
    if (prefs) tx.db.private_prefs.memberId.update({ ...prefs, nextPairA: a, nextPairB: b, nextPairCategory: category });
  });
}

export const runParseJob = spacetimedb.procedure(
  { onSchedule: parse_job }, { job: parse_job.rowType }, t.unit(),
  (ctx, { job }) => {
    const { groupId, text } = readPrefs(ctx, job.memberId);
    const res = apiFor(ctx, groupId, "/parse-prefs", { text, memberId: job.memberId });
    if (!res.ok) throw new Error(`parse-prefs failed: ${JSON.stringify(res.error)}`);
    const { hard, posterior, warnings } = res.data;
    const applied = ctx.withTx((tx) => {
      const prefs = tx.db.private_prefs.memberId.find(job.memberId);
      // A delayed parse cannot overwrite a more recent preference submission.
      if (!prefs || prefs.text !== text) return false;
      const protectedBudget = preserveBudget(parse(prefs.hardJson), hard);
      tx.db.private_prefs.memberId.update({
        ...prefs, hardJson: JSON.stringify(protectedBudget.hard), priorJson: JSON.stringify(posterior),
        posteriorJson: JSON.stringify(posterior), warningsJson: JSON.stringify([
          ...(warnings ?? []), ...(protectedBudget.preserved
            ? ["Existing outing budget preserved; increases require accepting a private offer."] : []),
        ]), updatedAt: nowMs(tx),
      });
      return true;
    });
    if (applied) fetchNextPair(ctx, job.memberId);
    return {};
  },
);

export const runSwipeJob = spacetimedb.procedure(
  { onSchedule: swipe_job }, { job: swipe_job.rowType }, t.unit(),
  (ctx, { job }) => {
    const { groupId, posterior } = readPrefs(ctx, job.memberId);
    const res = apiFor(ctx, groupId, "/elicit/update", {
      posterior, winnerPlaceId: job.winnerPlaceId, loserPlaceId: job.loserPlaceId,
    });
    if (!res.ok) throw new Error(`elicit/update failed: ${JSON.stringify(res.error)}`);
    ctx.withTx((tx) => {
      const prefs = tx.db.private_prefs.memberId.find(job.memberId);
      const m = tx.db.member.id.find(job.memberId);
      const g = m && tx.db.group.id.find(m.groupId);
      if (!prefs || !g) return;
      tx.db.private_prefs.memberId.update({ ...prefs, posteriorJson: JSON.stringify(res.data.posterior), updatedAt: nowMs(tx) });
      // Debounce: only the newest preview job (matching previewNonce) does any work.
      const nonce = `${nowMs(tx)}_${tx.random.uint32().toString(36)}`;
      tx.db.group.id.update({ ...g, previewNonce: nonce });
      tx.db.preview_job.insert({ ...at(tx, PREVIEW_DEBOUNCE_MS), groupId: g.id, nonce });
    });
    fetchNextPair(ctx, job.memberId);
    return {};
  },
);

export const runPreviewJob = spacetimedb.procedure(
  { onSchedule: preview_job }, { job: preview_job.rowType }, t.unit(),
  (ctx, { job }) => {
    const input = ctx.withTx((tx) => {
      const g = tx.db.group.id.find(job.groupId);
      if (!g || g.previewNonce !== job.nonce || g.status !== "eliciting") return null;
      return { g, members: planMembers(tx, g.id).filter((m) => m.posterior) };
    });
    if (!input) return {};
    const res = apiFor(ctx, job.groupId, "/plan", {
      runId: `preview_${job.groupId}_${job.nonce}`,
      date: input.g.date,
      window: { start: input.g.windowStart, end: input.g.windowEnd },
      members: input.members,
      excludePlaceIds: input.g.excludedPlaceIds,
      options: { samples: 100, tau: 0.6, topK: 60, preview: true },
    });
    if (!res.ok) throw new Error(`preview plan failed: ${JSON.stringify(res.error)}`);
    // Stopping rule: confidence >= 0.9 and everyone has >= 4 swipes, or everyone hit the cap.
    ctx.withTx((tx) => {
      const g = tx.db.group.id.find(job.groupId);
      if (!g || g.previewNonce !== job.nonce || g.status !== "eliciting") return;
      const confidence: number = guardPlanResult(res.data, planMembers(tx, g.id)).plans?.[0]?.robustness ?? 0;
      const members = membersOf(tx.db, g.id);
      const enough = members.every((m) => m.swipeCount >= MIN_SWIPES) && confidence >= CONFIDENCE_TARGET;
      const capped = members.every((m) => m.swipeCount >= MAX_SWIPES);
      tx.db.group.id.update({ ...g, confidence, status: enough || capped ? "planned" : g.status });
      if (enough || capped) startRun(tx, g.id);
    });
    return {};
  },
);
