// New coordinator flow. Legacy groups keep their original tables and jobs.
import { SenderError, t } from "spacetimedb/server";
import spacetimedb, { agent_needs_job, agent_plan_job } from "./schema";
import { createGroup, requireMember } from "./groups";
import { callApi } from "./lib/api";
import { allAgentNeedsConfirmed, invalidateAgent, startAgentRun } from "./lib/agent-state";
import { preserveBudget, planFitsBudgets } from "./lib/budgets";
import { at, currentGroup, currentMember, membersOf, nowMs, parse } from "./lib/util";
import { LIVE_PLACES } from "./lib/places";
import type { ReadDb } from "./lib/types";

export const createAgentGroup = spacetimedb.procedure(
  { name: t.option(t.string()) }, t.object("CreateAgentGroupResult", { groupId: t.string(), code: t.string() }),
  (ctx, args) => {
    const group = createGroup(ctx, args);
    ctx.withTx(tx => tx.db.agent_session.insert({ groupId: group.groupId, revision: 0, status: "needs",
      activeRunId: undefined, error: undefined }));
    return group;
  },
);

export const submitAgentPrefs = spacetimedb.reducer({ text: t.string() }, (tx, { text }) => {
  const me = requireMember(tx);
  if (!tx.db.agent_session.groupId.find(me.groupId)) throw new SenderError("This huddle uses the legacy flow.");
  const clean = text.trim();
  if (!clean || clean.length > 4000) throw new SenderError("Use 1–4000 characters for your private prompt.");
  const previous = tx.db.agent_need.memberId.find(me.id);
  const revision = (previous?.revision ?? 0) + 1;
  const need = { memberId: me.id, groupId: me.groupId, text: clean, revision,
    resultJson: undefined, confirmed: false, error: undefined };
  if (previous) tx.db.agent_need.memberId.update(need); else tx.db.agent_need.insert(need);
  const prefs = tx.db.private_prefs.memberId.find(me.id);
  if (prefs) tx.db.private_prefs.memberId.update({ ...prefs, text: clean, updatedAt: nowMs(tx) });
  else tx.db.private_prefs.insert({ memberId: me.id, text: clean, hardJson: undefined,
    priorJson: undefined, posteriorJson: undefined, nextPairA: undefined, nextPairB: undefined,
    nextPairCategory: undefined, warningsJson: "[]", updatedAt: nowMs(tx) });
  invalidateAgent(tx, me.groupId); // immediately prevents old votes/booking while interpretation waits
  tx.db.agent_needs_job.insert({ ...at(tx), memberId: me.id, revision });
});

function validNeeds(value: any): boolean {
  const hard = value?.hard;
  return !!hard && [hard.dietary, hard.allergies, hard.vetoCuisines, hard.vetoCategories, hard.rejectedTerms,
    value.preferences, value.questions, value.warnings].every(a => Array.isArray(a) && a.length <= 30 && a.every(x => typeof x === "string" && x.length <= 2000)) &&
    [hard.budgetMaxPerPerson, hard.maxTravelMinutes].every(n => n === null || typeof n === "number" && Number.isFinite(n) && n >= 0);
}

export const runAgentNeedsJob = spacetimedb.procedure(
  { onSchedule: agent_needs_job }, { job: agent_needs_job.rowType }, t.unit(), (ctx, { job }) => {
    const body = ctx.withTx(tx => {
      const need = tx.db.agent_need.memberId.find(job.memberId);
      const prefs = tx.db.private_prefs.memberId.find(job.memberId);
      return need?.revision === job.revision && !need.resultJson ? {
        memberId: need.memberId, text: need.text, currentHard: parse(prefs?.hardJson),
      } : null;
    });
    if (!body) return {};
    const res = ctx.env.FASTAPI_BASE_URL ? callApi(ctx, "/agent/needs", body) : null;
    ctx.withTx(tx => {
      const need = tx.db.agent_need.memberId.find(job.memberId);
      if (!need || need.revision !== job.revision || need.resultJson) return;
      if (!res?.ok || res.stub || !validNeeds(res.data)) {
        tx.db.agent_need.memberId.update({ ...need, error: "Claude could not interpret your needs. Your prompt is saved; edit it or retry." });
        return;
      }
      const prefs = tx.db.private_prefs.memberId.find(need.memberId)!;
      const protectedBudget = preserveBudget(parse(prefs.hardJson), res.data.hard);
      const result = { ...res.data, hard: protectedBudget.hard,
        warnings: [...res.data.warnings, ...(protectedBudget.preserved ? ["Existing outing cap retained; increases require a private offer acceptance."] : [])] };
      tx.db.agent_need.memberId.update({ ...need, resultJson: JSON.stringify(result), error: undefined });
      // An unconfirmed model interpretation cannot establish a new cap. Keep
      // the last user-confirmed limits until the owner confirms this summary.
      tx.db.private_prefs.memberId.update({ ...prefs,
        warningsJson: JSON.stringify(result.warnings), updatedAt: nowMs(tx) });
    });
    return {};
  },
);

export const confirmAgentNeeds = spacetimedb.reducer({ revision: t.u32() }, (tx, { revision }) => {
  const me = requireMember(tx);
  const need = tx.db.agent_need.memberId.find(me.id);
  const result = parse(need?.resultJson);
  if (!need || need.revision !== revision || !validNeeds(result)) throw new SenderError("Review your current interpreted needs first.");
  if (result.questions.length || result.hard.allergies.length) throw new SenderError("Resolve the private questions or missing allergy evidence before confirming.");
  const prefs = tx.db.private_prefs.memberId.find(me.id)!;
  const protectedBudget = preserveBudget(parse(prefs.hardJson), result.hard);
  result.hard = protectedBudget.hard;
  tx.db.private_prefs.memberId.update({ ...prefs, hardJson: JSON.stringify(result.hard), updatedAt: nowMs(tx) });
  tx.db.agent_need.memberId.update({ ...need, resultJson: JSON.stringify(result), confirmed: true });
});

export const findAgentPlans = spacetimedb.reducer({}, tx => {
  const me = requireMember(tx);
  const group = tx.db.group.id.find(me.groupId)!;
  if (!group.hostIdentity.isEqual(tx.sender)) throw new SenderError("Only the host can request plans.");
  if (group.status === "lobby") throw new SenderError("Finish joining and getting ready first.");
  startAgentRun(tx, group.id);
});

function currentJob(db: ReadDb, job: { groupId: string; runId: string; revision: number }) {
  const state = db.agent_session.groupId.find(job.groupId);
  return state?.activeRunId === job.runId && state.revision === job.revision && state.status === "planning";
}

// Do not trust arbitrary service prose. Fact sentences used in public results
// are generated by the API from the catalog, never raw Claude prompt text.
function validResult(data: any, body: any): boolean {
  if (data?.mode !== "agent" || data.runId !== body.runId || data.inputRevision !== body.inputRevision ||
      !Array.isArray(data.plans) || data.plans.length > 3 || !Array.isArray(data.conflicts) || !Array.isArray(data.warnings)) return false;
  const ids = new Set();
  return data.plans.every((plan: any) => {
    if (!plan || typeof plan.id !== "string" || ids.has(plan.id) || !planFitsBudgets(plan, body.members.map((m: any) => ({ hard: m.needs.hard })))) return false;
    ids.add(plan.id);
    return plan.stops.every((stop: any) => {
      const place = LIVE_PLACES.find(p => p.id === stop.placeId);
      return place && place.name === stop.name && place.category === stop.category &&
        place.costPerPerson === stop.costPerPerson && !body.excludePlaceIds.includes(place.id);
    });
  }) && (data.plans.length ? ids.has(data.recommendedPlanId) : data.recommendedPlanId === null);
}

export const runAgentPlanJob = spacetimedb.procedure(
  { onSchedule: agent_plan_job }, { job: agent_plan_job.rowType }, t.unit(), (ctx, { job }) => {
    const body = ctx.withTx(tx => {
      if (!currentJob(tx.db, job) || !allAgentNeedsConfirmed(tx.db, job.groupId)) return null;
      const group = tx.db.group.id.find(job.groupId)!;
      const priorRuns = Array.from(tx.db.plan_run.groupId.filter(group.id)).slice(-3);
      const discussion = priorRuns.flatMap(r => Array.from(tx.db.council_message.runId.filter(r.runId)))
        .filter(m => m.speaker === "participant").slice(-20).map(m => m.text);
      return { runId: job.runId, inputRevision: job.revision, date: group.date,
        window: { start: group.windowStart, end: group.windowEnd }, excludePlaceIds: group.excludedPlaceIds, discussion,
        members: membersOf(tx.db, group.id).map(m => {
          const need = tx.db.agent_need.memberId.find(m.id)!;
          return { memberId: m.id, prompt: need.text, needs: parse(need.resultJson),
            origin: m.originLat != null && m.originLng != null ? { lat: m.originLat, lng: m.originLng } : null };
        }) };
    });
    if (!body) return {};
    const res = ctx.env.FASTAPI_BASE_URL ? callApi(ctx, "/agent/plan", body) : null;
    ctx.withTx(tx => {
      if (!currentJob(tx.db, job) || !allAgentNeedsConfirmed(tx.db, job.groupId)) return;
      const state = tx.db.agent_session.groupId.find(job.groupId)!;
      const group = tx.db.group.id.find(job.groupId)!;
      const run = tx.db.plan_run.runId.find(job.runId)!;
      // Commit only against the same confirmed snapshot and current budgets.
      const current = { ...body, members: body.members.map(m => ({ ...m,
        needs: parse(tx.db.agent_need.memberId.find(m.memberId)?.resultJson) })) };
      if (!res?.ok || res.stub || !validResult(res.data, current)) {
        const error = "The coordinator could not produce validated plans. Your needs are saved; retry Find plans.";
        tx.db.plan_run.runId.update({ ...run, status: "error", error });
        tx.db.agent_session.groupId.update({ ...state, status: "error", error });
        return;
      }
      const data = res.data;
      tx.db.plan_run.runId.update({ ...run, status: "done", resultJson: JSON.stringify(data), stub: false });
      tx.db.agent_session.groupId.update({ ...state, status: data.plans.length ? "ready" : "blocked", error: undefined });
      tx.db.group.id.update({ ...group, status: data.plans.length ? "voting" : "planned" });
      if (data.plans.length) tx.db.council_message.insert({ id: 0n, runId: job.runId, round: 1,
        speaker: "coordinator", label: "Huddle coordinator", memberId: undefined, planId: data.recommendedPlanId,
        stanceJson: undefined, text: data.rationale, citedJson: undefined, ts: nowMs(tx) });
    });
    return {};
  },
);

export const postAgentDiscussion = spacetimedb.reducer({ text: t.string() }, (tx, { text }) => {
  const me = requireMember(tx);
  const state = tx.db.agent_session.groupId.find(me.groupId);
  const clean = text.trim();
  if (!state?.activeRunId || state.status !== "ready" || !clean || clean.length > 2000)
    throw new SenderError("Post 1–2000 characters while current plans are ready.");
  tx.db.council_message.insert({ id: 0n, runId: state.activeRunId, round: 1, speaker: "participant",
    label: me.name, memberId: undefined, planId: undefined, stanceJson: undefined, text: clean, citedJson: undefined, ts: nowMs(tx) });
});

export const my_agent_session = spacetimedb.view({ name: "my_agent_session", public: true }, t.option(t.row("MyAgentSessionRow", {
  groupId: t.string().primaryKey(), revision: t.u32(), status: t.string(), activeRunId: t.option(t.string()),
  error: t.option(t.string()), confirmedMemberIds: t.array(t.string()),
})), ctx => {
  const group = currentGroup(ctx.db, ctx.sender);
  const state = group && ctx.db.agent_session.groupId.find(group.id);
  if (!state) return undefined;
  return { ...state, confirmedMemberIds: membersOf(ctx.db, state.groupId)
    .filter(m => ctx.db.agent_need.memberId.find(m.id)?.confirmed).map(m => m.id) };
});

export const my_agent_needs = spacetimedb.view({ name: "my_agent_needs", public: true }, t.option(t.row("MyAgentNeedsRow", {
  memberId: t.string().primaryKey(), text: t.string(), revision: t.u32(), resultJson: t.option(t.string()), confirmed: t.bool(), error: t.option(t.string()),
})), ctx => {
  const me = currentMember(ctx.db, ctx.sender);
  const need = me && ctx.db.agent_need.memberId.find(me.id);
  if (!need) return undefined;
  const { groupId: _privateGroup, ...row } = need;
  return row;
});
