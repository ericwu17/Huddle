// Plan runs, the post-plan pipeline, offers, votes and roulette (S5.5, build-brief B1).
// Pipeline: startRun -> plan job -> (offers job + scout job, in parallel) -> council job
// (scheduled by scout) -> status 'voting'. A voting-cap job flips to voting after 12 s
// even if the council is slow: the vote never waits on the council.
import { SenderError, t } from "spacetimedb/server";
import spacetimedb, { offers_job, plan_job, voting_cap_job } from "./schema";
import { requireMember } from "./groups";
import { apiFor } from "./lib/demo";
import { COUNCIL_CAP_MS } from "./lib/constants";
import { guardPlanResult, planFitsBudgets } from "./lib/budgets";
import { availablePlans } from "./lib/availability";
import type { Proc, Tx } from "./lib/types";
import { at, membersOf, newId, nowMs, parse } from "./lib/util";
import { agentBallot, isAgent, startAgentRun } from "./lib/agent-state";

export function planMembers(tx: Tx, groupId: string) {
  return membersOf(tx.db, groupId).sort((a, b) => a.joinedAt - b.joinedAt).map((m) => {
    const prefs = tx.db.private_prefs.memberId.find(m.id);
    return {
      memberId: m.id,
      name: m.name,
      posterior: parse(prefs?.posteriorJson),
      hard: parse(prefs?.hardJson),
      origin: m.originLat != null && m.originLng != null ? { lat: m.originLat, lng: m.originLng } : null,
    };
  });
}

export function groupIdOf(ctx: Proc, runId: string): string {
  return ctx.withTx((tx) => tx.db.plan_run.runId.find(runId)?.groupId ?? "");
}

// Starts a new run for the group and returns its runId. Exported for Haydn's replan.ts.
export function startRun(tx: Tx, groupId: string): string {
  if (isAgent(tx.db, groupId)) return startAgentRun(tx, groupId);
  const g = tx.db.group.id.find(groupId);
  if (!g) throw new Error(`group ${groupId} not found`);
  const runId = `run_${g.code}_${g.runCounter + 1}`;
  tx.db.group.id.update({ ...g, runCounter: g.runCounter + 1, latestRunId: runId });
  tx.db.plan_run.insert({
    runId, groupId, status: "running", resultJson: undefined, error: undefined,
    councilJson: undefined, rouletteJson: undefined, stub: false, createdAt: nowMs(tx),
  });
  tx.db.plan_job.insert({ ...at(tx), groupId, runId });
  return runId;
}

export function planRequest(tx: Tx, runId: string) {
  const run = tx.db.plan_run.runId.find(runId);
  const g = run && tx.db.group.id.find(run.groupId);
  if (!run || !g) return null;
  return {
    runId,
    date: g.date,
    window: { start: g.windowStart, end: g.windowEnd },
    members: planMembers(tx, g.id),
    excludePlaceIds: g.excludedPlaceIds,
    options: { samples: 300, tau: 0.6, topK: 60, preview: false },
  };
}

// The vote opens when the council finishes or the cap passes, whichever is first.
export function markVoting(tx: Tx, runId: string) {
  const run = tx.db.plan_run.runId.find(runId);
  const g = run && tx.db.group.id.find(run.groupId);
  if (g && g.latestRunId === runId && g.status === "planned") tx.db.group.id.update({ ...g, status: "voting" });
}

export const runPlanJob = spacetimedb.procedure(
  { onSchedule: plan_job }, { job: plan_job.rowType }, t.unit(),
  (ctx, { job }) => {
    const body = ctx.withTx((tx) => {
      const run = tx.db.plan_run.runId.find(job.runId);
      return run?.status === "running" ? planRequest(tx, job.runId) : null; // idempotent by runId
    });
    if (!body) return {};
    const res = apiFor<any>(ctx, groupIdOf(ctx, job.runId), "/plan", body);
    if (!res.ok) throw new Error(`plan failed: ${JSON.stringify(res.error)}`);
    const { stub } = res;
    // A plan that did not come from the api says so (the smoke test checks for "fallback:").
    const data = res.demo
      ? { ...res.data, warnings: [...(res.data.warnings ?? []), `fallback: ${res.demo}`] }
      : res.data;
    ctx.withTx((tx) => {
      const run = tx.db.plan_run.runId.find(job.runId);
      if (!run) return;
      // Recheck current caps inside the commit transaction, not just the earlier
      // request snapshot: a member may have lowered a cap while HTTP was in flight.
      const guarded = guardPlanResult(data, planMembers(tx, run.groupId));
      tx.db.plan_run.runId.update({ ...run, status: "done", resultJson: JSON.stringify(guarded), stub });
      tx.db.offers_job.insert({ ...at(tx), runId: job.runId });
      tx.db.scout_job.insert({ ...at(tx), runId: job.runId });
      tx.db.voting_cap_job.insert({ ...at(tx, COUNCIL_CAP_MS), runId: job.runId });
    });
    return {};
  },
);

export const runVotingCapJob = spacetimedb.reducer(
  { onSchedule: voting_cap_job }, { job: voting_cap_job.rowType },
  (tx, { job }) => markVoting(tx, job.runId),
);

const offerText = (type: string, amount: number) =>
  type === "budget"
    ? `Stretch your budget by $${amount} for a plan the group would like better?`
    : `Travel ${amount} more minutes for a plan the group would like better?`;

export const runOffersJob = spacetimedb.procedure(
  { onSchedule: offers_job }, { job: offers_job.rowType }, t.unit(),
  (ctx, { job }) => {
    const input = ctx.withTx((tx) => {
      const run = tx.db.plan_run.runId.find(job.runId);
      const safe = parse(run?.resultJson)?.plans?.find((p: any) => p.kind === "safe");
      const body = planRequest(tx, job.runId);
      return safe && body ? { ...body, baselinePlanId: safe.id } : null;
    });
    if (!input) return {};
    const res = apiFor(ctx, groupIdOf(ctx, job.runId), "/offers", input);
    if (!res.ok) throw new Error(`offers failed: ${JSON.stringify(res.error)}`);
    ctx.withTx((tx) => {
      for (const o of res.data.offers ?? []) {
        tx.db.offer.insert({
          id: newId(tx, "o", (id) => !!tx.db.offer.id.find(id)), runId: job.runId, toMemberId: o.toMemberId, type: o.type, amount: o.amount,
          unit: o.unit, planId: o.plan.id, planJson: JSON.stringify(o.plan), robustnessGain: o.robustnessGain,
          minRatioGain: o.minRatioGain, text: offerText(o.type, o.amount), status: "open",
        });
      }
    });
    return {};
  },
);

// Applies the relaxation to the member's own limits and re-plans with a new runId.
export const acceptOffer = spacetimedb.reducer({ offerId: t.string() }, (tx, { offerId }) => {
  const me = requireMember(tx);
  const o = tx.db.offer.id.find(offerId);
  if (!o || o.toMemberId !== me.id || o.status !== "open") throw new SenderError("no such offer");
  const group = tx.db.group.id.find(me.groupId);
  const run = tx.db.plan_run.runId.find(o.runId);
  if (!group || group.latestRunId !== o.runId || run?.groupId !== me.groupId)
    throw new SenderError("offer is stale");
  if (!Number.isFinite(o.amount) || o.amount <= 0 || o.amount > 15 ||
      !((o.type === "budget" && o.unit === "usd") || (o.type === "travel" && o.unit === "min")))
    throw new SenderError("invalid offer");
  const prefs = tx.db.private_prefs.memberId.find(me.id);
  const hard = parse(prefs?.hardJson) ?? {};
  const field = o.type === "budget" ? "budgetMaxPerPerson" : "maxTravelMinutes";
  if (typeof hard[field] !== "number" || !Number.isFinite(hard[field]) || hard[field] < 0)
    throw new SenderError("offer has no finite limit to raise");
  hard[field] += o.amount; // Only this authenticated, owner-only acceptance raises a cap.
  const members = planMembers(tx, me.groupId).map((member) => member.memberId === me.id ? { ...member, hard } : member);
  if (!planFitsBudgets(parse(o.planJson), members)) throw new SenderError("offer no longer fits current budgets");
  if (prefs) tx.db.private_prefs.memberId.update({ ...prefs, hardJson: JSON.stringify(hard), updatedAt: nowMs(tx) });
  tx.db.offer.id.update({ ...o, status: "accepted" });
  startRun(tx, me.groupId);
});

export const declineOffer = spacetimedb.reducer({ offerId: t.string() }, (tx, { offerId }) => {
  const me = requireMember(tx);
  const o = tx.db.offer.id.find(offerId);
  if (!o || o.toMemberId !== me.id) throw new SenderError("no such offer");
  tx.db.offer.id.update({ ...o, status: "declined" });
});

// One vote per member per run; re-voting overwrites. Any of the three plans.
export const castVote = spacetimedb.reducer({ name: "vote" }, { runId: t.string(), planId: t.string() }, (tx, { runId, planId }) => {
  const me = requireMember(tx);
  const run = tx.db.plan_run.runId.find(runId);
  if (!run || run.groupId !== me.groupId) throw new SenderError("no such run");
  if (!availablePlans(tx.db, me.groupId, runId).some((p) => p.id === planId))
    throw new SenderError("plan is no longer available; choose a current plan");
  const id = `${runId}:${me.id}`;
  const row = { id, runId, memberId: me.id, planId };
  if (tx.db.vote.id.find(id)) tx.db.vote.id.update(row);
  else tx.db.vote.insert(row);
  if (isAgent(tx.db, me.groupId)) tx.db.plan_run.runId.update({ ...run, rouletteJson: undefined });
});

export const doRoulette = spacetimedb.procedure(
  { runId: t.string() },
  t.object("RouletteResult", { planId: t.string() }),
  (ctx, { runId }) => {
    const agentPick = ctx.withTx(tx => {
      const me = requireMember(tx);
      if (!isAgent(tx.db, me.groupId)) return null;
      const ballot = agentBallot(tx.db, me.groupId, runId);
      if (ballot.leaders.length < 2) throw new SenderError("Spin is only available after everyone votes and the current choices are tied.");
      if (ballot.winner) return { planId: ballot.winner };
      const planId = ballot.leaders[tx.random.integerInRange(0, ballot.leaders.length - 1)];
      const run = tx.db.plan_run.runId.find(runId)!;
      tx.db.plan_run.runId.update({ ...run, rouletteJson: JSON.stringify({ planId, voteSignature: ballot.signature,
        weights: ballot.leaders.map(id => ({ planId: id, weight: 1 / ballot.leaders.length })) }) });
      return { planId };
    });
    if (agentPick) return agentPick;
    const input = ctx.withTx((tx) => {
      const me = requireMember(tx);
      const run = tx.db.plan_run.runId.find(runId);
      if (!run || run.groupId !== me.groupId) throw new SenderError("no such run");
      return { groupId: me.groupId, plans: availablePlans(tx.db, me.groupId, runId)
        .map((p) => ({ id: p.id, robustness: p.robustness })) };
    });
    if (!input.plans.length) throw new SenderError("no current plans fit current budgets");
    const seed = Number(ctx.timestamp.toMillis() % 100000n);
    const res = apiFor(ctx, input.groupId, "/roulette", { plans: input.plans, seed });
    if (!res.ok) throw new SenderError(`roulette failed: ${res.error.message}`);
    return ctx.withTx((tx) => {
      const me = requireMember(tx);
      const planId = res.data?.planId;
      // HTTP may finish after a cap changed, a re-plan started, or the caller
      // joined another group. Never persist/return an unchecked external pick.
      if (me.groupId !== input.groupId || typeof planId !== "string" ||
          !input.plans.some((p) => p.id === planId) ||
          !availablePlans(tx.db, input.groupId, runId).some((p) => p.id === planId))
        throw new SenderError("roulette choice is no longer available; choose again");
      const run = tx.db.plan_run.runId.find(runId)!;
      tx.db.plan_run.runId.update({ ...run, rouletteJson: JSON.stringify(res.data) });
      return { planId };
    });
  },
);
