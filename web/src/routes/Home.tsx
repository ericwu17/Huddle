import PageHeading from "../components/PageHeading";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useProcedure, useReducer, useSpacetimeDB } from "spacetimedb/react";
import { procedures, reducers } from "../module_bindings";
import { saveSession } from "../session";
import { useRun } from "../useRun";
import { Buddy } from "../doodle/Doodle";
import { useAccount, useAccountMemberships, useHuddleInvitations, useHuddleNames } from "../accountData";
import AccountShell from "../components/AccountShell";
import NameHuddleDialog from "../components/NameHuddleDialog";

// Start an outing here; invite friends from its lobby or open an addressed invite.
export default function Home() {
  const { isActive } = useSpacetimeDB();
  const navigate = useNavigate();
  const createNamedForAccount = useProcedure(procedures.createNamedInvitationHuddle);
  const createForAccount = useProcedure(procedures.createInvitationHuddle);
  const createAsGuest = useProcedure(procedures.createAgentGroup);
  const joinGroup = useProcedure(procedures.joinGroup);
  const select = useReducer(reducers.selectHuddle);
  const remove = useReducer(reducers.removeHuddle);
  const account = useAccount();
  const memberships = useAccountMemberships();
  const huddleNames = useHuddleNames();
  const invitations = useHuddleInvitations();
  const { run, busy, error } = useRun();
  const [name, setName] = useState("");
  const [naming, setNaming] = useState(false);
  const request = useRef<string | null>(null);
  const submitting = useRef(false);
  const guestDraft = useRef<{ groupId: string; code: string } | null>(null);
  const [params] = useSearchParams();
  const requestedGroup = params.get("open");
  const restored = useRef<string | null>(null);
  const pending = invitations?.filter(i => i.direction === "incoming" && i.status === "pending") ?? [];

  useEffect(() => {
    if (!requestedGroup || !account || !memberships || restored.current === requestedGroup) return;
    restored.current = requestedGroup;
    const member = memberships.find(m => m.groupId === requestedGroup);
    if (!member) return;
    void run(async () => {
      await select({ groupId: member.groupId });
      saveSession({ groupId: member.groupId, memberId: member.memberId, code: member.code, name: member.name });
      navigate(`/g/${member.groupId}/${["finished", "booked"].includes(member.status) ? "done" : "lobby"}`, { replace: true });
    });
  }, [requestedGroup, account, memberships, run, select, navigate]);

  function showNaming() {
    request.current = null;
    guestDraft.current = null;
    setNaming(true);
  }

  async function start(huddleName?: string) {
    if (submitting.current) return;
    submitting.current = true;
    try {
      await run(async () => {
        if (account) {
          // One request id per click, so a double tap cannot create two huddles.
          request.current ??= crypto.randomUUID();
          const args = { requestId: request.current, summary: "", outingKind: "hangout", friendAccountIds: [] };
          const session = huddleName ? await createNamedForAccount({ ...args, name: huddleName }) : await createForAccount(args);
          request.current = null;
          saveSession({ ...session, name: account.displayName });
          navigate(`/g/${session.groupId}/lobby`);
        } else {
          guestDraft.current ??= await createAsGuest({ name: huddleName });
          const { code } = guestDraft.current;
          const joined = await joinGroup({ code, name });
          saveSession({ ...joined, code, name });
          navigate(`/g/${joined.groupId}/lobby`);
        }
      });
    } finally {
      submitting.current = false;
    }
  }

  function open(m: NonNullable<typeof memberships>[number]) {
    void run(async () => {
      await select({ groupId: m.groupId });
      saveSession({ groupId: m.groupId, memberId: m.memberId, code: m.code, name: m.name });
      navigate(`/g/${m.groupId}/${["finished", "booked"].includes(m.status) ? "done" : "lobby"}`);
    });
  }

  return <AccountShell className="account-home" loading={!!account && (memberships === undefined || invitations === undefined)}>{account === undefined ? null : <>
    <div className="home-intro home-welcome"><div className="home-welcome-copy">
      <PageHeading lead="What are" accent="we doing?" /></div>
      <div className="crowd home-hosts" aria-hidden="true"><Buddy who={account?.displayName ?? "You"} pose="wave" size={116} crown /><Buddy who="Your people" pose="huddle" size={104} /><Buddy who="Another friend" pose="idle" size={98} /></div></div>

    {pending.length ? <section className="card card-note space-y-3" aria-label="New Huddle invitations"><h2 className="card-title">You're invited</h2>
      {pending.map(i => <div className="social-row" key={i.id}><p>{i.message}</p><Link className="btn btn-sun" to={i.path}>Open</Link></div>)}</section> : null}

    <div className="home-start">
    <p className="on-sky home-greeting">{account ? `Hi ${account.displayName}. ` : ""}Start a huddle and invite your friends.</p>
    <section className="card space-y-3" aria-label="Start a huddle">
      <h2 className="card-title">Start a huddle</h2>
      {account ? null : <input className="input" placeholder="Your first name" autoComplete="given-name" maxLength={24}
        aria-label="Your first name" value={name} onChange={e => setName(e.target.value)} />}
      <button className="btn btn-sun w-full" disabled={busy || !isActive || (!account && !name.trim())} onClick={showNaming}>
        {busy ? "Starting…" : "Start a huddle"}
      </button>
      {!isActive ? <p role="status" className="muted">Connecting to Huddle…</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
    </section>
    </div>

    {account ? <section className="card space-y-4" aria-label="Your huddles"><h2 className="card-title">Your huddles</h2>
      {memberships === undefined ? <p role="status">Loading your huddles…</p> : !memberships.length ? <p className="muted"><strong>Your next adventure starts here.</strong></p> :
        <ul className="space-y-3">{memberships.map(m => <li key={m.id} className="social-row">
          <p><strong className="huddle-list-name">{huddleNames?.find(h => h.groupId === m.groupId)?.name || `Huddle ${m.code}`}</strong><br /><span className="muted">{m.date} · {m.role} · {m.status}</span></p>
          <div className="flex flex-wrap gap-2">
            <button className="btn" disabled={busy} onClick={() => open(m)}>Open</button>
            <button className="btn btn-danger" disabled={busy} aria-label={`Remove huddle ${m.code} from your list`}
              onClick={() => run(() => remove({ groupId: m.groupId }))}>Remove</button>
          </div>
        </li>)}</ul>}
    </section> : <p className="card !py-3 text-sm">Want your huddles on every device? <Link className="underline font-bold" to="/login">Sign in or create an account</Link></p>}
    {naming ? <NameHuddleDialog busy={busy} connected={isActive} error={error} onClose={() => setNaming(false)} onContinue={start} /> : null}
  </>}</AccountShell>;
}
