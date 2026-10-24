import type { ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { useAccount, useFriendRequests, useHuddleInvitations } from "../accountData";
import AccountStatus from "./AccountStatus";
import { Buddy } from "../doodle/Doodle";
import JoinByCode from "./JoinByCode";

export default function AccountShell({ children }: { children: ReactNode }) {
  const account = useAccount();
  const requests = useFriendRequests();
  const invitations = useHuddleInvitations();
  const count = (requests?.filter(r => r.direction === "incoming" && r.status === "pending").length ?? 0)
    + (invitations?.filter(i => i.direction === "incoming" && i.status === "pending").length ?? 0);
  return <main className="account-page">
    <aside className="account-sidebar">
      <Link className="logo" to="/start">huddle</Link>
      <div className="sidebar-buddy" aria-hidden="true"><Buddy who={account?.displayName ?? "Huddle"} pose="wave" size={128} /></div>
      <nav className="account-nav" aria-label="Your Huddle">
        <NavLink to="/start">Start a huddle</NavLink>
        <NavLink to="/friends">Friends</NavLink>
        <NavLink to="/inbox">Inbox {count ? <span className="sticker sticker-sun">{count}</span> : null}</NavLink>
        <NavLink to="/context">Your usual vibe</NavLink>
        <NavLink to="/connectors">Connectors</NavLink>
      </nav>
      <p className="on-sky muted">Your people. One great plan.</p>
    </aside>
    <div className="account-main space-y-6"><AccountStatus />{children}</div>
  </main>;
}

export function AccountRequired() {
  return <><section className="card space-y-4"><h1 className="card-title">Make room for your people</h1>
    <p>Sign in to find friends, receive invitations and keep your own preferences.</p>
    <Link className="btn btn-sun" to="/login">Sign in / create account</Link></section>
    <JoinByCode /></>;
}
