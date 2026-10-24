// Scout check and council (S5.3 /council, S5.5 runScout/runCouncil, build-brief B3).
import { t } from "spacetimedb/server";
import scoutCache from "../../data/scout_cache.json";
import spacetimedb, { council_job, scout_job } from "./schema";
import { markVoting, planRequest } from "./plans";
import { callApi } from "./lib/api";
import type { Tx } from "./lib/types";
import { at, nowMs, parse } from "./lib/util";

type ScoutFact = {
  placeId: string; openNow: boolean | null; vegetarianOptions: boolean | null;
  checkedAt: number; source: string; cached: boolean;
};

const COUNCIL_STREAM_MS = 400; // fake council: one message every 400 ms

// Live Bright Data check lands at H19 (needs Haydn's docs/BRIGHTDATA.md). Until then every
// result comes from data/scout_cache.json and is labeled cached (shown as "Checked earlier").
export const runScoutJob = spacetimedb.procedure(
  { onSchedule: scout_job }, { job: scout_job.rowType }, t.unit(),
  (ctx, { job }) => {
    ctx.withTx((tx) => {
      const run = tx.db.plan_run.runId.find(job.runId);
      const plans: any[] = parse(run?.resultJson)?.plans ?? [];
      const mealIds = [...new Set(plans.map((p) => p.stops.find((s: any) => s.category === "meal")?.placeId).filter(Boolean))];
      for (const placeId of mealIds as string[]) {
        const hit = (scoutCache as ScoutFact[]).find((f) => f.placeId === placeId);
        tx.db.scout_check.insert({
          id: 0n, runId: job.runId, placeId,
          openNow: hit?.openNow ?? undefined, vegetarianOptions: hit?.vegetarianOptions ?? undefined,
          checkedAt: hit?.checkedAt ?? nowMs(tx), source: hit?.source ?? "none", cached: true,
        });
      }
      if (tx.env.COUNCIL_ENABLED !== "false") tx.db.council_job.insert({ ...at(tx), runId: job.runId });
    });
    return {};
  },
);

export function insertCouncilMessage(tx: Tx, m: any) {
  tx.db.council_message.insert({
    id: 0n, runId: m.runId, round: m.round, speaker: m.speaker, label: m.label,
    memberId: m.memberId ?? undefined, planId: m.planId ?? undefined,
    stanceJson: m.stance ? JSON.stringify(m.stance) : undefined, text: m.text,
    citedJson: m.cited ? JSON.stringify(m.cited) : undefined, ts: m.ts ?? nowMs(tx),
  });
}

export function finishCouncil(tx: Tx, runId: string, result: any) {
  const run = tx.db.plan_run.runId.find(runId);
  if (!run) return;
  const council = {
    chosenPlanId: result.chosenPlanId, rationale: result.rationale ?? "",
    fallbackUsed: !!result.fallbackUsed, agreesWithSolver: !!result.agreesWithSolver,
  };
  tx.db.plan_run.runId.update({ ...run, councilJson: JSON.stringify(council) });
  markVoting(tx, runId);
}

export const runCouncilJob = spacetimedb.procedure(
  { onSchedule: council_job }, { job: council_job.rowType }, t.unit(),
  (ctx, { job }) => {
    const body = ctx.withTx((tx) => {
      const run = tx.db.plan_run.runId.find(job.runId);
      const g = run && tx.db.group.id.find(run.groupId);
      const req = planRequest(tx, job.runId);
      const result = parse(run?.resultJson);
      if (!g || !req || !result) return null;
      const scoutFacts = Array.from(tx.db.scout_check.runId.filter(job.runId)).map(({ id, runId, ...f }) => ({
        ...f, openNow: f.openNow ?? null, vegetarianOptions: f.vegetarianOptions ?? null,
      }));
      return {
        runId: job.runId, plans: result.plans, pareto: result.pareto, members: req.members, scoutFacts,
        options: { rounds: 2, showWho: g.showWhoCompromised, seed: 7 },
      };
    });
    if (!body) return {};
    const res = callApi(ctx, "/council", body);
    ctx.withTx((tx) => {
      if (!res.ok) {
        // Council unavailable: skip it; the UI highlights Safe with its whyLine (S6).
        const safe = body.plans?.find((p: any) => p.kind === "safe");
        finishCouncil(tx, job.runId, { chosenPlanId: safe?.id ?? "", rationale: safe?.whyLine ?? "", fallbackUsed: true });
        return;
      }
      if (!res.stub) {
        // The real api already POSTed each message to /councilMessage as it passed validation.
        finishCouncil(tx, job.runId, res.data);
        return;
      }
      // Stub: replay the canned transcript as if it were streaming, then finish.
      const messages: any[] = res.data.messages ?? [];
      messages.forEach((m, i) =>
        tx.db.fake_event_job.insert({ ...at(tx, (i + 1) * COUNCIL_STREAM_MS), kind: "council_message", payloadJson: JSON.stringify(m) }),
      );
      const { messages: _, ...result } = res.data;
      tx.db.fake_event_job.insert({
        ...at(tx, (messages.length + 1) * COUNCIL_STREAM_MS), kind: "council_done",
        payloadJson: JSON.stringify({ runId: job.runId, result }),
      });
    });
    return {};
  },
);
