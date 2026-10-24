import { useContext } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "./module_bindings";
import { AccountContextState } from "./accountContextState";
export { EMPTY_CONTEXT, type AccountContext } from "./accountContextState";

export function useAccount() {
  const [rows, ready] = useTable(tables.myAccount);
  return ready ? rows[0] ?? null : undefined;
}

export function useAccountMemberships() {
  const [rows, ready] = useTable(tables.myAccountMemberships);
  return ready ? rows : undefined;
}

export function useAccountContext() {
  return useContext(AccountContextState);
}

export function useFriends() {
  const [rows, ready] = useTable(tables.myFriends);
  return ready ? rows : undefined;
}

export function useFriendRequests() {
  const [rows, ready] = useTable(tables.myFriendRequests);
  return ready ? rows : undefined;
}

export function useHuddleInvitations() {
  const [rows, ready] = useTable(tables.myHuddleInvitations);
  return ready ? rows : undefined;
}

export function useConnectors() {
  const [rows, ready] = useTable(tables.myConnectors);
  return ready ? rows[0] ?? null : undefined;
}

export function useInvitationDeliveries() {
  const [rows, ready] = useTable(tables.myInvitationDeliveries);
  return ready ? rows : undefined;
}

export function useFriendContactDestinations() {
  const [rows, ready] = useTable(tables.myFriendContactDestinations);
  return ready ? rows : undefined;
}

export function useGroupConnectors() {
  const [rows, ready] = useTable(tables.myGroupConnectors);
  return ready ? rows : undefined;
}

export function useMeetup() {
  const [rows, ready] = useTable(tables.myMeetup);
  return ready ? rows[0] ?? null : undefined;
}
