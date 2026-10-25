import { useContext, useMemo } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "./module_bindings";
import { AccountContextState } from "./accountContextState";
import { AccountNavigationState } from "./accountNavigationState";
export { EMPTY_CONTEXT, type AccountContext } from "./accountContextState";

export function useAccount() {
  return useContext(AccountNavigationState)?.account;
}

export function useAccountMemberships() {
  return useContext(AccountNavigationState)?.memberships;
}

export function useAccountContext() {
  return useContext(AccountContextState);
}

export function useFriends() {
  return useContext(AccountNavigationState)?.friends;
}

export function useFriendRequests() {
  return useContext(AccountNavigationState)?.requests;
}

export function useHuddleInvitations() {
  return useContext(AccountNavigationState)?.invitations;
}

// Invitations this account cleared from its own Inbox (hidden only for them).
export function useDismissedInvitations() {
  const [rows, ready] = useTable(tables.myDismissedInvitations);
  return useMemo(() => new Set(ready ? rows.map(r => r.invitationId) : []), [rows, ready]);
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
