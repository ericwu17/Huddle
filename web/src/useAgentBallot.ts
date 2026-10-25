import { useMemo } from "react";
import { useAgentRun, type AgentState } from "./agentData";
import { useVotes } from "./data";
import type { GroupState } from "./types";
import { deriveAgentBallot } from "./agentBallot";

export type AgentBallot = ReturnType<typeof useAgentBallot>;

// GroupLayout calls this once and shares the result through the group context,
// so the run and votes are subscribed and parsed once per screen.
export function useAgentBallot(group: GroupState | null | undefined, agent: AgentState | null | undefined, memberId: string) {
  const runId = group?.latestRunId ?? null;
  const planRun = useAgentRun(runId);
  const votes = useVotes(runId, memberId);
  return useMemo(() => {
    const ballot = deriveAgentBallot({ runId, result: planRun?.result, revision: agent?.revision, status: agent?.status,
      memberIds: group?.members.map(member => member.id) ?? [], votes, roulette: planRun?.roulette });
    return { ...ballot, runId, planRun, votes, loading: group === undefined || agent === undefined || planRun === undefined || votes === undefined };
  }, [group, agent, runId, planRun, votes]);
}
