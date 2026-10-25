import { useOutletContext } from "react-router";
import type { Session } from "./session";
import type { GroupState, MyPrivate } from "./types";
import type { AgentNeeds, AgentState } from "./agentData";
import type { AgentBallot } from "./useAgentBallot";

export type GroupContext = {
  session: Session;
  group: GroupState;
  mine: MyPrivate | undefined;
  isHost: boolean;
  agent: AgentState | null;
  agentNeeds: AgentNeeds | null | undefined;
  ballot: AgentBallot;
};

export function useGroup() {
  return useOutletContext<GroupContext>();
}
