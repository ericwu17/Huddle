import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useProcedure, useReducer, useSpacetimeDB } from "spacetimedb/react";
import { procedures, reducers } from "../module_bindings";
import { saveSession } from "../session";
import { useRun } from "../useRun";
import { Buddy } from "../doodle/Doodle";
import { useAccount, useAccountMemberships, useHuddleInvitations } from "../accountData";
import AccountShell from "../components/AccountShell";

// Start an outing here; invite friends from its lobby or open an addressed invite.
export default function Home() {
  const { isActive } = useSpacetimeDB();
  const navigate = useNavigate();
  const createForAccount = useProcedure(procedures.createInvitationHuddle);
  const createAsGuest = useProcedure(procedures.createAgentGroup);
  const joinGroup = useProcedure(procedures.joinGroup);
  const select = useReducer(reducers.selectHuddle);
  const remove = useReducer(reducers.removeHuddle);
  const account = useAccount();
  const memberships = useAccountMemberships();
  const invitations = useHuddleInvitations();
  const { run, busy, error } = useRun();
  const [name, setName] = useState("");
  const request = useRef<string | null>(null);
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
      navigate(`/g/${member.groupId}/lobby`, { replace: true });
    });
  }, [requestedGroup, account, memberships, run, select, navigate]);

  async function start() {
    await run(async () => {
      if (account) {
        // One request id per click, so a double tap cannot create two huddles.
        request.current ??= crypto.randomUUID();
        const session = await createForAccount({ requestId: request.current, summary: "", outingKind: "hangout", friendAccountIds: [] });
        request.current = null;
        saveSession({ ...session, name: account.displayName });
        navigate(`/g/${session.groupId}/lobby`);
      } else {
        const { code } = await createAsGuest({ name: undefined });
        const joined = await joinGroup({ code, name });
        saveSession({ ...joined, code, name });
        navigate(`/g/${joined.groupId}/lobby`);
      }
    });
  }

  function open(m: NonNullable<typeof memberships>[number]) {
    void run(async () => {
      await select({ groupId: m.groupId });
      saveSession({ groupId: m.groupId, memberId: m.memberId, code: m.code, name: m.name });
      navigate(`/g/${m.groupId}/lobby`);
    });
  }

  return <AccountShell>{account === undefined ? <p role="status" className="on-sky">Loading your Huddle…</p> : <>
    <div className="home-intro"><div><h1 className="shout text-[56px]">Ready to<br />huddle?</h1>
      <p className="on-sky mt-4">{account ? `Hi ${account.displayName}. ` : ""}Start a huddle and invite your friends.</p></div>
      <div className="crowd" aria-hidden="true"><Buddy who={account?.displayName ?? "You"} pose="wave" size={116} crown /><Buddy who="Your people" pose="huddle" size={104} /></div></div>

    {pending.length ? <section className="card card-note space-y-3" aria-label="New Huddle invitations"><h2 className="card-title">You're invited</h2>
      {pending.map(i => <div className="social-row" key={i.id}><p>{i.message}</p><Link className="btn btn-sun" to={i.path}>Open</Link></div>)}</section> : null}

    <section className="card space-y-3" aria-label="Start a huddle">
      <h2 className="card-title">Start a huddle</h2>
      {account ? null : <input className="input" placeholder="Your first name" autoComplete="given-name" maxLength={24}
        aria-label="Your first name" value={name} onChange={e => setName(e.target.value)} />}
      <button className="btn btn-sun w-full" disabled={busy || !isActive || (!account && !name.trim())} onClick={start}>
        {busy ? "Starting…" : "Start a huddle"}
      </button>
      {!isActive ? <p role="status" className="muted">Connecting to Huddle…</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
    </section>

    {account ? <section className="card space-y-4" aria-label="Your huddles"><h2 className="card-title">Your huddles</h2>
      {memberships === undefined ? <p role="status">Loading your huddles…</p> : !memberships.length ? <p className="muted">Huddles you start or join show up here, on any device you sign in on.</p> :
        <ul className="space-y-3">{memberships.map(m => <li key={m.id} className="social-row">
          <p><strong>Huddle {m.code}</strong><br /><span className="muted">{m.date} · {m.role} · {m.status}</span></p>
          <div className="flex flex-wrap gap-2">
            <button className="btn" disabled={busy} onClick={() => open(m)}>Open</button>
            <button className="btn btn-quiet" disabled={busy} aria-label={`Remove huddle ${m.code} from your list`}
              onClick={() => run(() => remove({ groupId: m.groupId }))}>Remove</button>
          </div>
        </li>)}</ul>}
      {memberships?.length ? <p className="muted">Remove takes a huddle off your list only. Others in it keep it.</p> : null}
    </section> : <p className="card !py-3 text-sm">Want your huddles on every device? <Link className="underline font-bold" to="/login">Sign in or create an account</Link></p>}
  </>}</AccountShell>;
}
