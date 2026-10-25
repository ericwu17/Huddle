import { createContext } from "react";
import type { MyAccountRow, MyAccountMembershipRow, MyFriendRow, MyFriendRequestRow, MyHuddleInvitationRow } from "./module_bindings/types";

// Connection-scoped live data, kept above the router. No browser storage cache.
export type AccountNavigation = {
  account: MyAccountRow | null | undefined;
  memberships: readonly MyAccountMembershipRow[] | undefined;
  friends: readonly MyFriendRow[] | undefined;
  requests: readonly MyFriendRequestRow[] | undefined;
  invitations: readonly MyHuddleInvitationRow[] | undefined;
};

export const AccountNavigationState = createContext<AccountNavigation | undefined>(undefined);
