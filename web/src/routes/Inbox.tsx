import { Link } from "react-router";
import { useReducer } from "spacetimedb/react";
import { reducers } from "../module_bindings";
import { useAccount, useDismissedInvitations, useFriendRequests, useHuddleInvitations, useInvitationDeliveries } from "../accountData";
import AccountShell, { AccountRequired } from "../components/AccountShell";
import { useRun } from "../useRun";
import InvitationDelivery from "../components/InvitationDelivery";
import SendInvitationMessageButton from "../components/SendInvitationMessageButton";

export default function Inbox() {
  const account = useAccount();
  const invitations = useHuddleInvitations();
  const requests = useFriendRequests();
  const deliveries = useInvitationDeliveries();
  const respond = useReducer(reducers.respondFriendRequest);
  const cancel = useReducer(reducers.cancelHuddleInvitation);
  const clear = useReducer(reducers.clearInvitations);
  const dismissed = useDismissedInvitations();
  const { run, busy, error } = useRun();
  const incoming = invitations?.filter(i => i.direction === "incoming" && !dismissed.has(i.id)) ?? [];
  const outgoing = invitations?.filter(i => i.direction === "outgoing" && !dismissed.has(i.id)) ?? [];
  const clearableIn = incoming.filter(i => i.status !== "pending").length;
  const clearableOut = outgoing.filter(i => i.status !== "pending").length;
  const friends = requests?.filter(r => r.direction === "incoming" && r.status === "pending") ?? [];
  return <AccountShell loading={!!account && invitations === undefined}>{account === undefined ? null : !account ? <AccountRequired /> : <>
    <div><h1 className="shout text-[56px]">You’re invited</h1><p className="on-sky mt-3">Your Huddle invitations and friend requests, all in one place.</p></div>
    <section className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="card-title">Huddle messages</h2>
        <button className="btn" disabled={busy || !clearableIn} onClick={() => run(() => clear({ direction: "incoming" }))}>Clear inbox</button></div>
      {incoming.length > clearableIn && clearableIn ? <p className="muted">Invitations waiting for your answer stay until you reply.</p> : null}
      {invitations === undefined ? <p role="status">Loading messages…</p> : incoming.length ? incoming.map(i => <article className="inbox-message space-y-3" key={i.id}>
        <p className="font-bold">{i.message}</p><p>{i.groupName}</p>
        <span className={`sticker ${i.status === "pending" ? "sticker-sun" : ""}`}>{i.status}</span>
        <InvitationDelivery status={deliveries?.find(d => d.invitationId === i.id)?.status} />
        {i.status === "pending" || i.status === "accepted" ? <p><Link className="btn btn-sun" to={i.path}>Open Huddle →</Link></p> : null}
      </article>) : <p>Your inbox is clear. New invitations from friends show up here.</p>}
      <p className="muted">These messages are always available in Huddle. Optional external invitations depend on your <Link className="underline font-bold" to="/connectors">Connectors settings</Link>.</p>
    </section>
    {friends.length ? <section className="card card-note space-y-4"><h2 className="card-title">New friend requests</h2>{friends.map(r => <div className="social-row" key={r.id}>
      <p><strong>{r.fromDisplayName}</strong> <span className="muted">@{r.fromUsername}</span> wants to be friends.</p>
      <div className="flex gap-3"><button className="btn btn-sun" disabled={busy} onClick={() => run(() => respond({ requestId: r.id, accept: true }))}>Accept {r.fromDisplayName}</button>
        <button className="btn" disabled={busy} onClick={() => run(() => respond({ requestId: r.id, accept: false }))}>Decline</button></div>
    </div>)}</section> : null}
    {outgoing.length ? <section className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="card-title">Invitations you sent</h2>
        <button className="btn" disabled={busy || !clearableOut} onClick={() => run(() => clear({ direction: "outgoing" }))}>Clear invitations</button></div>
      {outgoing.map(i => <div className="social-row" key={i.id}>
      <div><p><strong>{i.toDisplayName}</strong> <span className="muted">@{i.toUsername}</span><br /><span className="muted">{i.groupName} · {i.status}</span></p><InvitationDelivery status={deliveries?.find(d => d.invitationId === i.id)?.status} /></div>
      <SendInvitationMessageButton invitationId={i.id} pending={i.status === "pending"} status={deliveries?.find(d => d.invitationId === i.id)?.status} />
      {i.status === "pending" ? <button className="btn" disabled={busy} onClick={() => run(() => cancel({ invitationId: i.id }))}>Cancel invitation</button> : null}
    </div>)}</section> : null}
    {error ? <p className="error" role="alert">{error}</p> : null}
  </>}</AccountShell>;
}
