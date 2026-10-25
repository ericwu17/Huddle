import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useReducer } from "spacetimedb/react";
import { reducers } from "../module_bindings";
import { useAccount, useAccountMemberships, useHuddleInvitations } from "../accountData";
import AccountShell from "../components/AccountShell";
import { saveSession } from "../session";
import { useRun } from "../useRun";
import { useGroupState } from "../data";

export default function Invitation() {
  const { invitationId } = useParams();
  const account = useAccount();
  const invitations = useHuddleInvitations();
  const memberships = useAccountMemberships();
  const selectedGroup = useGroupState();
  const respond = useReducer(reducers.respondHuddleInvitation);
  const select = useReducer(reducers.selectHuddle);
  const { run, busy, error } = useRun();
  const navigate = useNavigate();
  const [joining, setJoining] = useState(false);
  const invitation = invitations?.find(i => i.id === invitationId);
  const membership = memberships?.find(m => m.groupId === invitation?.groupId);
  useEffect(() => {
    if (!joining || !membership || invitation?.status !== "accepted" || account?.activeGroupId !== membership.groupId || selectedGroup?.id !== membership.groupId) return;
    saveSession({ groupId: membership.groupId, memberId: membership.memberId, code: membership.code, name: membership.name });
    navigate(`/g/${membership.groupId}/lobby`, { replace: true });
  }, [joining, membership, invitation?.status, account?.activeGroupId, selectedGroup?.id, navigate]);
  return <AccountShell loading={!!account && invitations === undefined}>{account === undefined || invitations === undefined ? null : !account ?
    <section className="card space-y-4"><h1 className="card-title">Your people are gathering</h1><p>Sign in with the account this invitation was sent to. Your invitation will be waiting.</p>
      <Link className="btn btn-sun" to={`/login?returnTo=${encodeURIComponent(`/invite/${invitationId}`)}`}>Sign in to open Huddle</Link></section> : !invitation ?
      <section className="card space-y-4"><h1 className="card-title">Invitation unavailable</h1><p>This invitation belongs to a different account or is no longer available. You are signed in as @{account.username}.</p><Link className="btn" to="/inbox">My inbox</Link></section> :
      <section className="card card-note space-y-4"><h1 className="card-title">{invitation.message}</h1><p>{invitation.groupName}</p>
        {invitation.direction !== "incoming" ? <><p>You sent this invitation to {invitation.toDisplayName}.</p><Link className="btn" to="/start">My huddles</Link></> : invitation.status === "pending" ? <>
          <p>Join your friends, then choose your own private preferences. Accepting an invitation does not mark you ready.</p>
          <div className="flex flex-wrap gap-3"><button className="btn btn-sun" disabled={busy || joining} onClick={() => run(async () => { await respond({ invitationId: invitation.id, accept: true }); setJoining(true); })}>{joining ? "Opening your Huddle…" : "Accept & open Huddle"}</button>
            <button className="btn" disabled={busy || joining} onClick={() => run(() => respond({ invitationId: invitation.id, accept: false }))}>Decline invitation</button></div>
        </> : invitation.status === "accepted" && membership ? <button className="btn btn-sun" disabled={busy} onClick={() => run(async () => { await select({ groupId: membership.groupId }); setJoining(true); })}>Open Huddle</button>
          : <p>This invitation is {invitation.status}. Ask your friend for a new invitation if needed.</p>}
        {error ? <p className="error" role="alert">{error}</p> : null}
      </section>}
  </AccountShell>;
}
