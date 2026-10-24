import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useProcedure, useReducer, useSpacetimeDB } from "spacetimedb/react";
import { procedures, reducers } from "../module_bindings";
import { saveSession } from "../session";
import { useRun } from "../useRun";
import { Buddy } from "../doodle/Doodle";
import { useAccount, useAccountMemberships, useFriendContactDestinations, useFriends, useHuddleInvitations } from "../accountData";
import AccountShell, { AccountRequired } from "../components/AccountShell";
import FriendPicker from "../components/FriendPicker";

export default function Home() {
  const { isActive } = useSpacetimeDB();
  const navigate = useNavigate();
  const parseIntent = useProcedure(procedures.parseHuddleIntent);
  const create = useProcedure(procedures.createInvitationHuddle);
  const select = useReducer(reducers.selectHuddle);
  const account = useAccount();
  const memberships = useAccountMemberships();
  const friends = useFriends();
  const invitations = useHuddleInvitations();
  const contactDestinations = useFriendContactDestinations();
  const { run, busy, error } = useRun();
  const [prompt, setPrompt] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [review, setReview] = useState<{ friendAccountIds: string[]; ambiguousNames: string[]; unknownNames: string[]; outingKind: string; summary: string } | null>(null);
  const [namesResolved, setNamesResolved] = useState(false);
  const invitationRequest = useRef<string | null>(null);
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

  async function reviewInvitation(text = prompt) {
    await run(async () => {
      const result = await parseIntent({ text });
      setReview(result);
      setSelected(result.friendAccountIds);
      setNamesResolved(!result.ambiguousNames.length && !result.unknownNames.length);
    });
  }

  async function start() {
    if (!account || !review || !namesResolved) return;
    await run(async () => {
      invitationRequest.current ??= crypto.randomUUID();
      const session = await create({ requestId: invitationRequest.current, summary: review.summary, outingKind: review.outingKind, friendAccountIds: selected });
      invitationRequest.current = null;
      saveSession({ ...session, name: account.displayName });
      navigate(`/g/${session.groupId}/lobby`);
    });
  }

  return <AccountShell>{account === undefined ? <p role="status">Loading your Huddle…</p> : !account ? <AccountRequired /> : <>
    <div className="home-intro"><div><h1 className="shout text-[56px]">What are<br />we doing?</h1><p className="on-sky mt-4">Hi {account.displayName}. Bring your people. We’ll find the plan.</p></div>
      <div className="crowd" aria-hidden="true"><Buddy who={account.displayName} pose="wave" size={116} /><Buddy who="Your people" pose="huddle" size={104} /></div></div>
    {pending.length ? <section className="card card-note space-y-3" aria-label="New Huddle invitations"><h2 className="card-title">Your friends are gathering</h2>
      {pending.map(i => <div className="social-row" key={i.id}><p>{i.message}</p><Link className="btn btn-sun" to={i.path}>Open Huddle →</Link></div>)}</section> : null}
    <section className="card space-y-5"><h2 className="card-title">Start a huddle</h2>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); void reviewInvitation(); }}>
        <label className="block font-bold" htmlFor="start-prompt">Who would you like to hang out with?</label>
        <textarea id="start-prompt" className="input min-h-32" maxLength={2000} disabled={busy} value={prompt} onChange={e => { setPrompt(e.target.value); setReview(null); setNamesResolved(false); invitationRequest.current = null; }} placeholder="I want dinner with Alex and Mark…" required />
        <p className="muted">This starts an invitation. Set your private budget, time and dietary needs inside the Huddle.</p>
        <button className="btn btn-sun w-full" disabled={busy || !isActive || !prompt.trim()}>{busy ? "Finding your friends…" : "Review invitation"}</button>
        <button className="btn w-full" type="button" disabled={busy || !isActive} onClick={() => { setPrompt(""); setReview(null); invitationRequest.current = null; void reviewInvitation(""); }}>Choose friends instead</button>
      </form>
      {!isActive ? <p role="status">Connecting to Huddle…</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
    </section>
    {review ? <section className="card card-note space-y-4" aria-label="Review your Huddle invitation">
      <h2 className="card-title">Your invitation</h2><p className="font-bold">{review.summary}</p>
      <div><h3 className="font-bold">People to invite</h3>
        {selected.length ? <ul className="flex flex-wrap gap-2 mt-2">{selected.map(id => { const friend = friends?.find(f => f.accountId === id); return <li className="sticker" key={id}>{friend ? `${friend.displayName} (@${friend.username})` : "Loading friend…"}</li>; })}</ul> : <p className="muted">No friends selected yet. You can choose friends below, or start and invite them later.</p>}
      </div>
      <FriendPicker selected={selected} onChange={ids => { setSelected(ids); invitationRequest.current = null; }} disabled={busy} />
      {selected.some(id => contactDestinations?.some(c => c.friendAccountId === id)) ? <div className="rounded-xl bg-white p-3 space-y-3" aria-label="Review linked message destinations">
        <h3 className="font-bold">Your linked Mac Contacts</h3>
        <ul className="space-y-2">{selected.flatMap(id => { const mapped = contactDestinations?.find(c => c.friendAccountId === id); const friend = friends?.find(f => f.accountId === id); return mapped ? <li className="break-words" key={id}><strong>{friend?.displayName ?? "Selected friend"}</strong> · {mapped.contactName}<br /><span className="text-sm break-all">{mapped.destination}</span></li> : []; })}</ul>
        <p className="muted">Review these links before starting. Your friend’s own delivery settings take priority, including an explicit opt-out.</p>
        <Link className="underline font-bold" to="/connectors#mac-contacts">Edit my contact links</Link>
      </div> : null}
      {review.ambiguousNames.length || review.unknownNames.length ? <div className="space-y-3 rounded-xl bg-white p-3">
        {review.ambiguousNames.length ? <p>More than one match: <strong>{review.ambiguousNames.join(", ")}</strong>. Choose the intended friend above.</p> : null}
        {review.unknownNames.length ? <p>Not found in your friends: <strong>{review.unknownNames.join(", ")}</strong>. <Link className="underline font-bold" to="/friends">Add a friend</Link> or choose who to invite above.</p> : null}
        <label className="check"><input type="checkbox" disabled={busy} checked={namesResolved} onChange={e => setNamesResolved(e.target.checked)} />I have checked the selected people and resolved these names</label>
      </div> : null}
      <p className="muted">{account.displayName} wants to hang out with Huddle! Each selected friend gets their own invitation message and link. Nothing is sent until you start.</p>
      <button className="btn btn-sun w-full" disabled={busy || !namesResolved || !isActive || (account.username === "maxli" && contactDestinations === undefined) || selected.some(id => !friends?.some(f => f.accountId === id))} onClick={start}>{busy ? "Creating your Huddle…" : selected.length ? `Start & invite ${selected.length} ${selected.length === 1 ? "friend" : "friends"} ↗` : "Start a huddle ↗"}</button>
    </section> : null}
    <section className="card space-y-4" aria-label="Your saved huddles"><div className="flex flex-wrap justify-between gap-3"><h2 className="card-title">Your huddles</h2><Link className="underline font-bold" to="/context">Edit my defaults</Link></div>
      {memberships === undefined ? <p role="status">Loading your huddles…</p> : !memberships.length ? <p>Your Huddles will appear here, including on another device when you sign in.</p> :
        <ul className="space-y-3">{memberships.map(m => <li key={m.id} className="social-row"><p><strong>Huddle {m.code}</strong><br /><span className="muted">{m.date} · {m.role} · {m.status}</span></p>
          <button className="btn" disabled={busy} onClick={() => run(async () => { await select({ groupId: m.groupId }); saveSession({ groupId: m.groupId, memberId: m.memberId, code: m.code, name: m.name }); navigate(`/g/${m.groupId}/lobby`); })}>Open huddle {m.code}</button>
        </li>)}</ul>}
    </section>
  </>}</AccountShell>;
}
