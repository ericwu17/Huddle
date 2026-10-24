// Coordinator state helpers. No HTTP, model calls or private text in public errors.
import { SenderError } from "spacetimedb/server";
import type { ReadDb, Tx } from "./types";
import { at, membersOf, nowMs, parse } from "./util";
import { planFitsAgentRequirements } from "./agent-constraints";
import { validateOrders } from "./agent-orders";
import { catalogSnapshot } from "./catalog";
import { LIVE_PLACES } from "./places";

export const isAgent = (db: ReadDb, groupId: string) => !!db.agent_session.groupId.find(groupId);

export function invalidateAgent(tx: Tx, groupId: string) {
  const state = tx.db.agent_session.groupId.find(groupId);
  const group = tx.db.group.id.find(groupId);
  if (!state || !group) return;
  tx.db.agent_session.groupId.update({ ...state, revision: state.revision + 1,
    status: "needs", activeRunId: undefined, error: undefined });
  tx.db.group.id.update({ ...group, status: group.status === "lobby" ? "lobby" : "eliciting",
    latestRunId: undefined, confidence: undefined });
}

export function allAgentNeedsConfirmed(db: ReadDb, groupId: string): boolean {
  const members = membersOf(db, groupId);
  return members.length >= 2 && members.every((member) => {
    const need = db.agent_need.memberId.find(member.id);
    const result = parse(need?.resultJson);
    return !!need?.confirmed && !!result?.hard && !result.questions?.length;
  });
}

export function startAgentRun(tx: Tx, groupId: string): string {
  const state = tx.db.agent_session.groupId.find(groupId);
  const group = tx.db.group.id.find(groupId);
  if (!state || !group || !allAgentNeedsConfirmed(tx.db, groupId))
    throw new SenderError("Everyone must save their preferences and answer any private clarification first.");
  if (state.status === "planning") throw new SenderError("The coordinator is already planning.");
  const runId = `run_${group.code}_${group.runCounter + 1}`;
  const revision = state.revision + 1;
  tx.db.agent_session.groupId.update({ ...state, revision, status: "planning", activeRunId: runId, error: undefined });
  tx.db.group.id.update({ ...group, runCounter: group.runCounter + 1, latestRunId: runId,
    status: "planned", confidence: undefined, demoMode: false });
  tx.db.plan_run.insert({ runId, groupId, status: "running", resultJson: undefined,
    error: undefined, councilJson: undefined, rouletteJson: undefined, stub: false, createdAt: nowMs(tx) });
  tx.db.agent_plan_job.insert({ ...at(tx), groupId, runId, revision });
  return runId;
}

function currentAgentChoices(db: ReadDb, groupId: string, runId: string, mode: "proposal" | "selectable") {
  const group = db.group.id.find(groupId);
  const session = db.agent_session.groupId.find(groupId);
  const run = db.plan_run.runId.find(runId);
  const result = parse(run?.resultJson);
  if (!group || group.latestRunId !== runId || run?.groupId !== groupId || run.status !== "done" ||
      !session || !(mode === "proposal" ? ["ready", "blocked"].includes(session.status) : session.status === "ready") ||
      session.activeRunId !== runId || result?.mode !== "agent" || result.inputRevision !== session.revision ||
      !allAgentNeedsConfirmed(db, groupId)) return null;
  const members = membersOf(db, groupId).map(m => ({ memberId: m.id, hard: parse(db.private_prefs.memberId.find(m.id)?.hardJson) }));
  const catalog = catalogSnapshot(db);
  const places = catalog?.places ?? LIVE_PLACES;
  const evidence = catalog?.evidence ?? {};
  const privateRows = Array.from(db.agent_order.runId.filter(runId)).map(row => ({
    memberId: row.memberId, planId: row.planId, items: parse(row.itemsJson), total: row.total,
  }));
  const plans = Array.isArray(result.plans) ? result.plans.filter((plan: any) => {
    if (mode === "selectable" && plan.status === "provisional") return false;
    const rows = privateRows.filter(row => row.planId === plan.id);
    const verified = plan.costModel === "own_orders" ? validateOrders(plan, rows,
      members.map(member => ({ memberId: member.memberId, needs: { hard: member.hard } })),
      places, evidence, true) : null;
    if (plan.costModel === "own_orders" && (!verified || verified.requiresProvisional && plan.status !== "provisional")) return false;
    return planFitsAgentRequirements(plan, members, { mode, personalTotals: verified?.totals });
  }) : [];
  return { group, result, members, places, evidence, privateRows, plans };
}

// Timed, hard-validated choices only. Booking and Calendar must continue using
// this helper even when a provisional plan or untimed venue wins the ballot.
export function agentPlans(db: ReadDb, groupId: string, runId: string): any[] {
  return currentAgentChoices(db, groupId, runId, "selectable")?.plans ?? [];
}

// A vote expresses interest, not verification of an outing. Suggestions retain
// their original untimed shape; no schedule, affordability or booking is implied.
export function agentVotingChoices(db: ReadDb, groupId: string, runId: string): any[] {
  const current = currentAgentChoices(db, groupId, runId, "proposal");
  if (!current) return [];
  const { group, result, members, places, evidence, privateRows, plans } = current;
  const suggestions = Array.isArray(result.suggestions) ? result.suggestions.filter((suggestion: any) => {
    const place = places.find(p => p.id === suggestion.placeId);
    if (!place || group.excludedPlaceIds.includes(place.id) || members.some(({ hard }) => {
      if (!hard) return true;
      const label = `${place.name} ${place.cuisine} ${place.category}`.toLocaleLowerCase();
      return hard.vetoCategories.includes(place.category) || hard.vetoCuisines.includes(place.cuisine) ||
        hard.rejectedTerms.some((term: string) => label.includes(term.toLocaleLowerCase()));
    })) return false;
    const rows = privateRows.filter(row => row.planId === suggestion.id);
    return !rows.length || !!validateOrders({ id: suggestion.id, stops: [{ placeId: place.id, category: place.category }] }, rows,
      members.map(member => ({ memberId: member.memberId, needs: { hard: member.hard } })), places, evidence, false);
  }) : [];
  return [...plans, ...suggestions];
}

export function agentBallot(db: ReadDb, groupId: string, runId: string) {
  const plans = agentVotingChoices(db, groupId, runId);
  const members = membersOf(db, groupId);
  const ids = new Set(plans.map(p => p.id));
  const votes = Array.from(db.vote.runId.filter(runId)).filter(v => members.some(m => m.id === v.memberId) && ids.has(v.planId));
  const signature = votes.map(v => `${v.memberId}:${v.planId}`).sort().join("|");
  if (votes.length !== members.length || !members.length) return { leaders: [] as string[], signature, winner: null as string | null };
  const counts = new Map<string, number>();
  for (const vote of votes) counts.set(vote.planId, (counts.get(vote.planId) ?? 0) + 1);
  const top = Math.max(...counts.values());
  const leaders = [...counts].filter(([, count]) => count === top).map(([id]) => id);
  const spin = parse(db.plan_run.runId.find(runId)?.rouletteJson);
  const winner = leaders.length === 1 ? leaders[0]
    : spin?.voteSignature === signature && leaders.includes(spin.planId) ? spin.planId : null;
  return { leaders, signature, winner };
}
