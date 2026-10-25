import type { ReactNode } from "react";
import { Link, NavLink, useNavigation } from "react-router";
import { useReducer } from "spacetimedb/react";
import { reducers } from "../module_bindings";
import { useAccount, useFriendRequests, useHuddleInvitations } from "../accountData";
import { clearAccountBrowserState } from "../session";
import { useRun } from "../useRun";
import HuddleLoading from "./HuddleLoading";
import HuddleBrand from "./HuddleBrand";

export default function AccountShell({ children, loading = false, className = "" }: { children: ReactNode; loading?: boolean; className?: string }) {
  const account = useAccount();
  const navigation = useNavigation();
  const logout = useReducer(reducers.logoutAccount);
  const { run, busy } = useRun();
  const requests = useFriendRequests();
  const invitations = useHuddleInvitations();
  const count = (requests?.filter(r => r.direction === "incoming" && r.status === "pending").length ?? 0)
    + (invitations?.filter(i => i.direction === "incoming" && i.status === "pending").length ?? 0);
  // Unknown identity is a loading state, never a flash of signed-out navigation.
  if (account === undefined) return <HuddleLoading />;
  const waiting = loading || navigation.state !== "idle";
  return <main className={`account-page ${className}`}>
    {waiting ? <HuddleLoading /> : null}
    <aside className="account-sidebar" inert={waiting}>
      <HuddleBrand />
      <nav className="account-nav" aria-label="Your Huddle">
        <NavLink to="/start">Home</NavLink>
        {account ? <>
          <NavLink to="/friends">Friends</NavLink>
          <NavLink to="/inbox">Inbox {count ? <span className="sticker sticker-sun">{count}</span> : null}</NavLink>
          <NavLink to="/context">Preferences</NavLink>
          <NavLink to="/connectors">Connectors</NavLink>
        </> : <NavLink to="/login">Sign in</NavLink>}
      </nav>
      {account ? <div className="sidebar-account">
        <p className="text-sm">Signed in as <strong>{account.displayName}</strong></p>
        <button className="btn btn-quiet" disabled={busy} onClick={() => run(async () => {
          await logout();
          clearAccountBrowserState(true);
          window.location.replace("/login");
        })}>Sign out</button>
      </div> : null}
    </aside>
    <div className="account-main space-y-6" aria-busy={waiting} inert={waiting}>
      {children}
    </div>
  </main>;
}

export function AccountRequired() {
  return <section className="card space-y-4"><h1 className="card-title">Make room for your people</h1>
    <p>Sign in to find friends, receive invitations and keep your own preferences.</p>
    <Link className="btn btn-sun" to="/login">Sign in / create account</Link></section>;
}
