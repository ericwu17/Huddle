import type { AgentPlan, AgentResult, AgentSuggestion } from "./agentData";
import type { Votes } from "./types";

export type AgentChoice = AgentPlan | AgentSuggestion;

export function winnerTransition(previous: { groupId: string; key: string | null } | null, groupId: string, key: string | null, explicitVote: boolean) {
  const firstVisit = previous?.groupId !== groupId;
  return { state: { groupId, key }, follow: !!key && previous?.key !== key && !(firstVisit && explicitVote) };
}

export function deriveAgentBallot({ runId, result, revision, status, memberIds, votes, roulette }: {
  runId: string | null; result: AgentResult | null | undefined; revision?: number; status?: string;
  memberIds: string[]; votes?: Votes; roulette?: { planId: string; voteSignature?: string } | null;
}) {
  const current = !!runId && !!result && result.runId === runId && result.inputRevision === revision && (status === "ready" || status === "blocked");
  const choices: AgentChoice[] = current ? [...result.plans, ...(result.suggestions ?? [])] : [];
  const validIds = new Set(choices.map(choice => choice.id));
  const members = new Set(memberIds);
  const ballot = Object.entries(votes?.byPlan ?? {}).flatMap(([planId, voters]) => validIds.has(planId)
    ? voters.filter(memberId => members.has(memberId)).map(memberId => ({ memberId, planId })) : []);
  const counts: Record<string, number> = {};
  for (const vote of ballot) counts[vote.planId] = (counts[vote.planId] ?? 0) + 1;
  const complete = current && members.size > 0 && ballot.length === members.size && new Set(ballot.map(vote => vote.memberId)).size === members.size;
  const signature = ballot.map(vote => `${vote.memberId}:${vote.planId}`).sort().join("|");
  const top = Math.max(0, ...Object.values(counts));
  const leaders = complete ? choices.filter(choice => counts[choice.id] === top) : [];
  const winner = leaders.length === 1 ? leaders[0] : complete && roulette?.voteSignature === signature
    ? leaders.find(choice => choice.id === roulette.planId) ?? null : null;
  const winnerNumber = winner ? choices.findIndex(choice => choice.id === winner.id) + 1 : null;
  return { current, choices, counts, complete, signature, leaders, winner, winnerNumber };
}
