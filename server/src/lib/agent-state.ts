// Coordinator state helpers. No HTTP, model calls or private text in public errors.
import { SenderError } from "spacetimedb/server";
import type { ReadDb, Tx } from "./types";
import { at, membersOf, nowMs, parse } from "./util";
import { planFitsBudgets } from "./budgets";

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
    return !!need?.confirmed && !!result?.hard && !result.questions?.length && !result.hard.allergies?.length;
  });
}

export function startAgentRun(tx: Tx, groupId: string): string {
  const state = tx.db.agent_session.groupId.find(groupId);
  const group = tx.db.group.id.find(groupId);
  if (!state || !group || !allAgentNeedsConfirmed(tx.db, groupId))
    throw new SenderError("Everyone must confirm their current needs and resolve blocking questions first.");
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

export function agentPlans(db: ReadDb, groupId: string, runId: string): any[] {
  const group = db.group.id.find(groupId);
  const session = db.agent_session.groupId.find(groupId);
  const run = db.plan_run.runId.find(runId);
  const result = parse(run?.resultJson);
  if (!group || group.latestRunId !== runId || run?.groupId !== groupId || run.status !== "done" ||
      session?.status !== "ready" || session.activeRunId !== runId || result?.mode !== "agent" ||
      result.inputRevision !== session.revision || !allAgentNeedsConfirmed(db, groupId)) return [];
  const members = membersOf(db, groupId).map(m => ({ hard: parse(db.private_prefs.memberId.find(m.id)?.hardJson) }));
  return Array.isArray(result.plans) ? result.plans.filter((p: any) => planFitsBudgets(p, members)) : [];
}

export function agentBallot(db: ReadDb, groupId: string, runId: string) {
  const plans = agentPlans(db, groupId, runId);
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
