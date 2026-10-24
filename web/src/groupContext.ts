import { useOutletContext } from "react-router";
import type { Session } from "./session";
import type { GroupState, MyPrivate } from "./types";

export type GroupContext = {
  session: Session;
  group: GroupState;
  mine: MyPrivate | undefined;
  isHost: boolean;
};

export function useGroup() {
  return useOutletContext<GroupContext>();
}
