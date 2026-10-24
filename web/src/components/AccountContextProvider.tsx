import { useMemo, type ReactNode } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "../module_bindings";
import { useAccount } from "../accountData";
import { AccountContextState, type AccountContext } from "../accountContextState";

// Keep this owner-scoped subscription alive while routes and active Huddles
// change. Page-local subscription teardown must not look like cleared defaults.
export default function AccountContextProvider({ children }: { children: ReactNode }) {
  const account = useAccount();
  const [rows, ready] = useTable(tables.myAccountContext);
  const value = useMemo(() => {
    if (account === undefined || !ready) return undefined;
    if (!account) return null;
    const row = rows.find(r => r.accountId === account.accountId);
    return row ? { ...row, context: JSON.parse(row.contextJson) as AccountContext } : null;
  }, [account, rows, ready]);
  return <AccountContextState.Provider value={value}>{children}</AccountContextState.Provider>;
}
