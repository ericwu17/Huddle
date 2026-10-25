// New coordinator flow. Legacy groups keep their original tables and jobs.
import { SenderError, t } from "spacetimedb/server";
import spacetimedb, { agent_needs_job, agent_plan_job } from "./schema";
import { createGroup, requireMember, setReady } from "./groups";
import { callApi } from "./lib/api";
import { agentVotingChoices, allAgentNeedsConfirmed, invalidateAgent, startAgentRun } from "./lib/agent-state";
import { preserveBudget } from "./lib/budgets";
import { at, currentGroup, currentMember, membersOf, nowMs, parse } from "./lib/util";
import { validateAgentResult } from "./lib/agent-result";
import { catalogSnapshot } from "./lib/catalog";
import type { ReadDb, Tx } from "./lib/types";
import { requireActor } from "./lib/account-state";
import { huddleTiming, saveHuddleTiming } from "./lib/huddle-timing";

export const createAgentGroup = spacetimedb.procedure(
  { name: t.option(t.string()) }, t.object("CreateAgentGroupResult", { groupId: t.string(), code: t.string() }),
  (ctx, args) => {
    const group = createGroup(ctx, args);
    ctx.withTx(tx => {
      tx.db.agent_session.insert({ groupId: group.groupId, revision: 0, status: "needs", activeRunId: undefined, error: undefined });
      const created = tx.db.group.id.find(group.groupId)!;
      tx.db.group.id.update({ ...created, date: "", windowStart: "", windowEnd: "" });
      saveHuddleTiming(tx, group.groupId, "pending");
    });
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
  // A legacy caller must not accidentally reuse an older structured submission.
  tx.db.agent_preference_input.memberId.delete(me.id);
  const prefs = tx.db.private_prefs.memberId.find(me.id);
  if (prefs) tx.db.private_prefs.memberId.update({ ...prefs, text: clean, updatedAt: nowMs(tx) });
  else tx.db.private_prefs.insert({ memberId: me.id, text: clean, hardJson: undefined,
    priorJson: undefined, posteriorJson: undefined, nextPairA: undefined, nextPairB: undefined,
    nextPairCategory: undefined, warningsJson: "[]", updatedAt: nowMs(tx) });
  invalidateAgent(tx, me.groupId); // immediately prevents old votes/booking while interpretation waits
  tx.db.agent_needs_job.insert({ ...at(tx), memberId: me.id, revision });
});

const DIETARY = new Set(["vegetarian", "vegan", "gluten_free", "halal", "kosher"]);
const INPUT_KEYS = new Set(["budgetMaxPerPerson", "maxOutingMinutes", "maxTravelMinutes", "preferredStops", "dietary", "allergies"]);
// Soft: the coordinator aims for the stop count nearest the members' average.
const validStops = (value: any) => value == null || Number.isInteger(value) && value >= 1 && value <= 5;
const emptyHard = () => ({ budgetMaxPerPerson: null, maxOutingMinutes: null, maxTravelMinutes: null, preferredStops: null,
  dietary: [] as string[], allergies: [] as string[], vetoCuisines: [] as string[],
  vetoCategories: [] as string[], rejectedTerms: [] as string[] });

function structuredInput(json: string, previous: any) {
  if (json.length > 8000) throw new SenderError("Preference controls are too long.");
  let input: any;
  try { input = parse(json); }
  catch { throw new SenderError("Check your preference controls and save again."); }
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(k => !INPUT_KEYS.has(k)))
    throw new SenderError("Use the budget, time, dietary and allergy controls.");
  for (const key of ["budgetMaxPerPerson", "maxOutingMinutes"])
    if (!(key in input)) throw new SenderError("Choose a limit or Flexible for budget and outing time.");
  for (const key of ["budgetMaxPerPerson", "maxOutingMinutes", "maxTravelMinutes"])
    if (key in input && input[key] !== null && (typeof input[key] !== "number" || !Number.isFinite(input[key]) || input[key] < 0))
      throw new SenderError("Limits must be nonnegative numbers or Flexible.");
  if (!validStops(input.preferredStops)) throw new SenderError("Choose 1–5 stops or Flexible.");
  for (const [key, max] of [["dietary", 5], ["allergies", 12]] as const) {
    if (!Array.isArray(input[key]) || input[key].length > max ||
        input[key].some((value: any) => typeof value !== "string" || !value.trim() || value.length > 2000))
      throw new SenderError("Check your dietary and allergy fields.");
    input[key] = [...new Set(input[key].map((value: string) => value.trim()))];
  }
  if (input.dietary.some((value: string) => !DIETARY.has(value)))
    throw new SenderError("Choose a supported dietary tag; describe other requirements in the prompt.");
  if (input.allergies.length === 1 && ["none", "no allergies", "no known allergies", "n/a"].includes(input.allergies[0].toLowerCase()))
    input.allergies = [];
  const protectedBudget = preserveBudget(previous, { ...emptyHard(), ...previous, ...input });
  return { hard: protectedBudget.hard, preserved: protectedBudget.preserved };
}

function directNeeds(hard: any, preserved: boolean) {
  return { hard, preferences: [], questions: [], warnings: [
    ...(preserved ? ["Your existing outing cap was kept. An increase requires accepting a private trade offer."] : []),
    ...(hard.allergies.length ? ["Your allergy is saved. Menu clues can inform provisional suggestions; venue allergy handling remains unverified."] : []),
  ] };
}

function markMemberReady(tx: Tx, memberId: string) {
  const member = tx.db.member.id.find(memberId);
  if (!member) return;
  tx.db.member.id.update({ ...member, ready: true });
  const group = tx.db.group.id.find(member.groupId);
  const members = membersOf(tx.db, member.groupId);
  if (group?.status === "lobby" && members.length >= 2 && members.every(m => m.id === memberId || m.ready))
    tx.db.group.id.update({ ...group, status: "eliciting" });
}

// The explicit Save & ready action authorizes the controls immediately. Text is
// optional; only additional text needs interpretation, and safe results become
// ready without asking the owner to confirm the same controls a second time.
export const saveAgentPreferences = spacetimedb.reducer({ text: t.string(), structuredJson: t.string() }, (tx, args) => {
  const me = requireMember(tx);
  if (!tx.db.agent_session.groupId.find(me.groupId)) throw new SenderError("This huddle uses the legacy flow.");
  const text = args.text.trim();
  if (text.length > 4000) throw new SenderError("Keep your optional prompt within 4000 characters.");
  const prefs = tx.db.private_prefs.memberId.find(me.id);
  const saved = structuredInput(args.structuredJson, parse(prefs?.hardJson));
  const old = tx.db.agent_need.memberId.find(me.id);
  const revision = (old?.revision ?? 0) + 1;
  const result = directNeeds(saved.hard, saved.preserved);
  const need = { memberId: me.id, groupId: me.groupId, text, revision,
    resultJson: text ? undefined : JSON.stringify(result), confirmed: !text, error: undefined };
  if (old) tx.db.agent_need.memberId.update(need); else tx.db.agent_need.insert(need);
  const input = { memberId: me.id, structuredJson: JSON.stringify(saved.hard), revision };
  if (tx.db.agent_preference_input.memberId.find(me.id)) tx.db.agent_preference_input.memberId.update(input);
  else tx.db.agent_preference_input.insert(input);
  if (prefs) tx.db.private_prefs.memberId.update({ ...prefs, text,
    hardJson: JSON.stringify(saved.hard), warningsJson: JSON.stringify(result.warnings), updatedAt: nowMs(tx) });
  else tx.db.private_prefs.insert({ memberId: me.id, text, hardJson: JSON.stringify(saved.hard), priorJson: undefined,
    posteriorJson: undefined, nextPairA: undefined, nextPairB: undefined, nextPairCategory: undefined,
    warningsJson: JSON.stringify(result.warnings), updatedAt: nowMs(tx) });
  tx.db.member.id.update({ ...me, ready: !text });
  invalidateAgent(tx, me.groupId);
  if (text) tx.db.agent_needs_job.insert({ ...at(tx), memberId: me.id, revision });
  else setReady(tx, {});
});

function validNeeds(value: any): boolean {
  const hard = value?.hard;
  const bounded = (list: any, max: number) => Array.isArray(list) && list.length <= max &&
    list.every(value => typeof value === "string" && value.length >= 1 && value.length <= 2000);
  return !!hard && [[hard.dietary, 5], [hard.allergies, 12], [hard.vetoCuisines, 6], [hard.vetoCategories, 3],
    [hard.rejectedTerms, 20], [value.preferences, 15], [value.questions, 8], [value.warnings, 12]]
    .every(([list, max]) => bounded(list, max as number)) &&
    [hard.budgetMaxPerPerson, hard.maxTravelMinutes, hard.maxOutingMinutes ?? null]
      .every(n => n === null || typeof n === "number" && Number.isFinite(n) && n >= 0) &&
    validStops(hard.preferredStops) && hard.dietary.every((value: string) => DIETARY.has(value));
}

export const runAgentNeedsJob = spacetimedb.procedure(
  { onSchedule: agent_needs_job }, { job: agent_needs_job.rowType }, t.unit(), (ctx, { job }) => {
    const body = ctx.withTx(tx => {
      const need = tx.db.agent_need.memberId.find(job.memberId);
      const prefs = tx.db.private_prefs.memberId.find(job.memberId);
      const input = tx.db.agent_preference_input.memberId.find(job.memberId);
      return need?.revision === job.revision && !need.resultJson ? {
        memberId: need.memberId, text: need.text, currentHard: parse(prefs?.hardJson),
        ...(input?.revision === job.revision ? { structured: parse(input.structuredJson) } : {}),
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
      const input = tx.db.agent_preference_input.memberId.find(need.memberId);
      const structured = input?.revision === job.revision ? parse(input.structuredJson) : null;
      // Validate again at the database boundary. A service/model result cannot
      // erase explicitly supplied restrictions or replace an outing-time slider.
      const hard = { ...res.data.hard, maxOutingMinutes: res.data.hard.maxOutingMinutes ?? null };
      if (structured) {
        for (const key of ["dietary", "allergies", "vetoCuisines", "vetoCategories", "rejectedTerms"])
          hard[key] = [...new Set([...structured[key], ...hard[key]])];
        for (const key of ["maxOutingMinutes", "maxTravelMinutes", "preferredStops"])
          if (structured[key] != null) hard[key] = structured[key];
        if (structured.budgetMaxPerPerson != null &&
            (hard.budgetMaxPerPerson == null || hard.budgetMaxPerPerson > structured.budgetMaxPerPerson))
          hard.budgetMaxPerPerson = structured.budgetMaxPerPerson;
      }
      const protectedBudget = preserveBudget(parse(prefs.hardJson), hard);
      const result = { ...res.data, hard: protectedBudget.hard,
        warnings: [...res.data.warnings, ...(protectedBudget.preserved ? ["Existing outing cap retained; increases require a private offer acceptance."] : [])] };
      if (!validNeeds(result)) {
        tx.db.agent_need.memberId.update({ ...need, error: "The combined restrictions exceed supported limits. Shorten repeated entries and save again." });
        return;
      }
      const autoReady = !!structured && !result.questions.length;
      tx.db.agent_need.memberId.update({ ...need, resultJson: JSON.stringify(result), confirmed: autoReady, error: undefined });
      // Legacy review requests still require confirmation. The Save & ready
      // flow already carries the owner's explicit action and saves safe text
      // interpretation without an extra confirmation screen.
      tx.db.private_prefs.memberId.update({ ...prefs,
        ...(autoReady ? { hardJson: JSON.stringify(result.hard) } : {}),
        warningsJson: JSON.stringify(result.warnings), updatedAt: nowMs(tx) });
      if (autoReady) markMemberReady(tx, need.memberId);
    });
    return {};
  },
);

export const confirmAgentNeeds = spacetimedb.reducer({ revision: t.u32() }, (tx, { revision }) => {
  const me = requireMember(tx);
  const need = tx.db.agent_need.memberId.find(me.id);
  const result = parse(need?.resultJson);
  if (!need || need.revision !== revision || !validNeeds(result)) throw new SenderError("Review your current interpreted needs first.");
  if (result.questions.length) throw new SenderError("Resolve the private clarification before saving your needs.");
  const prefs = tx.db.private_prefs.memberId.find(me.id)!;
  const protectedBudget = preserveBudget(parse(prefs.hardJson), result.hard);
  result.hard = protectedBudget.hard;
  tx.db.private_prefs.memberId.update({ ...prefs, hardJson: JSON.stringify(result.hard), updatedAt: nowMs(tx) });
  tx.db.agent_need.memberId.update({ ...need, resultJson: JSON.stringify(result), confirmed: true });
});

export const findAgentPlans = spacetimedb.reducer({}, tx => {
  const me = requireMember(tx);
  const group = tx.db.group.id.find(me.groupId)!;
  if (!group.hostIdentity.isEqual(requireActor(tx))) throw new SenderError("Only the host can request plans.");
  if (group.status === "lobby") throw new SenderError("Finish joining and getting ready first.");
  startAgentRun(tx, group.id);
});

function currentJob(db: ReadDb, job: { groupId: string; runId: string; revision: number }) {
  const state = db.agent_session.groupId.find(job.groupId);
  return state?.activeRunId === job.runId && state.revision === job.revision && state.status === "planning";
}

export const runAgentPlanJob = spacetimedb.procedure(
  { onSchedule: agent_plan_job }, { job: agent_plan_job.rowType }, t.unit(), (ctx, { job }) => {
    const body = ctx.withTx(tx => {
      if (!currentJob(tx.db, job) || !allAgentNeedsConfirmed(tx.db, job.groupId)) return null;
      const group = tx.db.group.id.find(job.groupId)!;
      const priorRuns = Array.from(tx.db.plan_run.groupId.filter(group.id)).slice(-3);
      const discussion = priorRuns.flatMap(r => Array.from(tx.db.council_message.runId.filter(r.runId)))
        .filter(m => m.speaker === "participant").slice(-20).map(m => m.text);
      const catalog = catalogSnapshot(tx.db);
      const scheduled = huddleTiming(tx.db, group.id).source !== "pending";
      return { runId: job.runId, inputRevision: job.revision, date: scheduled ? group.date : null, ...(catalog ? { catalog } : {}),
        window: scheduled ? { start: group.windowStart, end: group.windowEnd } : null, excludePlaceIds: group.excludedPlaceIds, discussion,
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
      const verified = res?.ok && !res.stub ? validateAgentResult(res.data, current) : null;
      if (!verified) {
        const error = "The coordinator could not produce validated plans. Your needs are saved; retry Find plans.";
        tx.db.plan_run.runId.update({ ...run, status: "error", error });
        tx.db.agent_session.groupId.update({ ...state, status: "error", error });
        return;
      }
      const data = verified.data;
      for (const order of verified.privateOrders) {
        const id = `${job.runId}:${order.memberId}:${order.planId}`;
        tx.db.agent_order.insert({ id, runId: job.runId, memberId: order.memberId, planId: order.planId, itemsJson: JSON.stringify(order.items), total: order.total });
      }
      tx.db.plan_run.runId.update({ ...run, status: "done", resultJson: JSON.stringify(data), stub: false });
      const hasChoices = data.plans.length > 0 || !!data.suggestions?.length;
      tx.db.agent_session.groupId.update({ ...state, status: hasChoices ? "ready" : "blocked", error: undefined });
      tx.db.group.id.update({ ...group, status: hasChoices ? "voting" : "planned" });
      if (hasChoices) tx.db.council_message.insert({ id: 0n, runId: job.runId, round: 1,
        speaker: "coordinator", label: "Huddle coordinator", memberId: undefined, planId: data.recommendedPlanId ?? undefined,
        stanceJson: undefined, text: data.rationale, citedJson: undefined, ts: nowMs(tx) });
    });
    return {};
  },
);

export const postAgentDiscussion = spacetimedb.reducer({ text: t.string() }, (tx, { text }) => {
  const me = requireMember(tx);
  const state = tx.db.agent_session.groupId.find(me.groupId);
  const clean = text.trim();
  if (!state?.activeRunId || !agentVotingChoices(tx.db, me.groupId, state.activeRunId).length || !clean || clean.length > 2000)
    throw new SenderError("Post 1–2000 characters while current choices are available.");
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

export const my_agent_preferences = spacetimedb.view({ name: "my_agent_preferences", public: true }, t.option(t.row("MyAgentPreferencesRow", {
  memberId: t.string().primaryKey(), structuredJson: t.string(), revision: t.u32(),
})), ctx => {
  const me = currentMember(ctx.db, ctx.sender);
  return me ? ctx.db.agent_preference_input.memberId.find(me.id) ?? undefined : undefined;
});

export const my_agent_orders = spacetimedb.view({ name: "my_agent_orders", public: true }, t.array(t.row("MyAgentOrderRow", {
  id: t.string().primaryKey(), runId: t.string(), memberId: t.string(), planId: t.string(), itemsJson: t.string(), total: t.f64(),
})), ctx => {
  const member = currentMember(ctx.db, ctx.sender);
  const group = member && ctx.db.group.id.find(member.groupId);
  if (!member || !group?.latestRunId) return [];
  return Array.from(ctx.db.agent_order.memberId.filter(member.id)).filter(row => row.runId === group.latestRunId);
});
