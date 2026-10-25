import { Link } from "react-router";
import { useReducer } from "spacetimedb/react";
import { reducers } from "../module_bindings";
import { useAccount, useFriendRequests, useHuddleInvitations } from "../accountData";
import { clearAccountBrowserState } from "../session";
import { useRun } from "../useRun";

export default function AccountStatus() {
  const account = useAccount();
  const invitations = useHuddleInvitations();
  const requests = useFriendRequests();
  const logout = useReducer(reducers.logoutAccount);
  const { run, busy, error } = useRun();
  const pendingInvites = invitations?.filter(i => i.direction === "incoming" && i.status === "pending") ?? [];
  const pendingCount = pendingInvites.length + (requests?.filter(r => r.direction === "incoming" && r.status === "pending").length ?? 0);
  const newest = pendingInvites.toSorted((a, b) => b.createdAt - a.createdAt)[0];
  if (account === undefined) return <p className="on-sky" role="status">Checking account…</p>;
  return <section className="card account-status space-y-2" aria-label="Account">
    {account ? <div className="flex flex-wrap items-center justify-between gap-3">
      <p><strong>{account.displayName}</strong> <span className="muted">@{account.username}</span></p>
      <div className="flex flex-wrap gap-3"><Link className="btn" to="/start">My huddles</Link><Link className="btn" to="/inbox">Inbox{pendingCount ? ` (${pendingCount})` : ""}</Link><Link className="btn" to="/friends">Friends</Link>
        <button className="btn" disabled={busy} onClick={() => run(async () => {
          await logout();
          clearAccountBrowserState(true);
          const path = window.location.pathname;
          window.location.replace(path.startsWith("/invite/") ? `/login?returnTo=${encodeURIComponent(path)}` : "/login");
        })}>Sign out</button></div>
    </div> : <div className="flex flex-wrap items-center justify-between gap-3">
      <p>Sign in to keep your huddles across devices.</p><Link className="btn" to="/login">Sign in / create account</Link>
    </div>}
    {account && newest ? <p className="inbox-notice" role="status">{newest.message} <Link className="underline font-bold" to={newest.path}>Open Huddle →</Link></p> : null}
    {error ? <p className="error" role="alert">{error}</p> : null}
  </section>;
}
