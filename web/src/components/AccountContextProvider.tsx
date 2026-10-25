import { useMemo, type ReactNode } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "../module_bindings";
import { AccountContextState, type AccountContext } from "../accountContextState";
import { AccountNavigationState } from "../accountNavigationState";

// Keep this owner-scoped subscription alive while routes and active Huddles
// change. Page-local subscription teardown must not look like cleared defaults.
export default function AccountContextProvider({ children }: { children: ReactNode }) {
  const [accounts, accountReady] = useTable(tables.myAccount);
  const [memberships, membershipsReady] = useTable(tables.myAccountMemberships);
  const [friends, friendsReady] = useTable(tables.myFriends);
  const [requests, requestsReady] = useTable(tables.myFriendRequests);
  const [invitations, invitationsReady] = useTable(tables.myHuddleInvitations);
  const account = accountReady ? accounts[0] ?? null : undefined;
  const [rows, ready] = useTable(tables.myAccountContext);
  const navigation = useMemo(() => ({
    account,
    memberships: account === null ? [] : account && membershipsReady ? memberships : undefined,
    friends: account === null ? [] : account && friendsReady ? friends : undefined,
    requests: account === null ? [] : account && requestsReady ? requests : undefined,
    invitations: account === null ? [] : account && invitationsReady ? invitations : undefined,
  }), [account, memberships, membershipsReady, friends, friendsReady, requests, requestsReady, invitations, invitationsReady]);
  const value = useMemo(() => {
    if (account === undefined || !ready) return undefined;
    if (!account) return null;
    const row = rows.find(r => r.accountId === account.accountId);
    return row ? { ...row, context: { preferredStops: null, ...JSON.parse(row.contextJson) } as AccountContext } : null;
  }, [account, rows, ready]);
  return <AccountNavigationState.Provider value={navigation}>
    <AccountContextState.Provider value={value}>{children}</AccountContextState.Provider>
  </AccountNavigationState.Provider>;
}
