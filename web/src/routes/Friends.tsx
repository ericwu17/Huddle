import { useState } from "react";
import { useReducer } from "spacetimedb/react";
import { reducers } from "../module_bindings";
import { useAccount, useFriends, useFriendRequests } from "../accountData";
import AccountShell, { AccountRequired } from "../components/AccountShell";
import { Buddy } from "../doodle/Doodle";
import { useRun } from "../useRun";

export default function Friends() {
  const account = useAccount();
  const friends = useFriends();
  const requests = useFriendRequests();
  const request = useReducer(reducers.requestFriend);
  const respond = useReducer(reducers.respondFriendRequest);
  const remove = useReducer(reducers.removeFriend);
  const { run, busy, error } = useRun();
  const [username, setUsername] = useState("");
  const [notice, setNotice] = useState("");
  const incoming = requests?.filter(r => r.direction === "incoming" && r.status === "pending") ?? [];
  const outgoing = requests?.filter(r => r.direction === "outgoing" && r.status === "pending") ?? [];
  return <AccountShell>{account === undefined ? <p role="status">Loading your account…</p> : !account ? <AccountRequired /> : <>
    <div><h1 className="shout text-[56px]">Your people</h1><p className="on-sky mt-3">Find a friend once. Huddle together whenever.</p></div>
    <section className="card space-y-4"><h2 className="card-title">Add a friend</h2>
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); void run(async () => {
        await request({ username: username.trim() }); setUsername(""); setNotice("Friend request sent. Your friend can accept it in Huddle.");
      }); }}>
        <label className="block font-bold" htmlFor="friend-username">Their Huddle username</label>
        <div className="flex flex-wrap gap-3"><input id="friend-username" className="input flex-1 min-w-40" autoCapitalize="none" autoComplete="off" spellCheck={false}
          placeholder="username" maxLength={24} value={username} onChange={e => { setUsername(e.target.value.replace(/^@/, "")); setNotice(""); }} required />
          <button className="btn btn-sun" disabled={busy || !username.trim()}>Send friend request</button></div>
        <p className="muted">Your username is <strong>@{account.username}</strong>. Both of you choose to connect.</p>
      </form>{notice ? <p role="status">{notice}</p> : null}
    </section>
    {incoming.length ? <section className="card card-note space-y-4"><h2 className="card-title">Friend requests</h2>
      {incoming.map(r => <div key={r.id} className="social-row"><p><strong>{r.fromDisplayName}</strong> <span className="muted">@{r.fromUsername}</span> wants to connect.</p>
        <div className="flex gap-3"><button className="btn btn-sun" disabled={busy} onClick={() => run(() => respond({ requestId: r.id, accept: true }))}>Accept {r.fromDisplayName}</button>
          <button className="btn" disabled={busy} onClick={() => run(() => respond({ requestId: r.id, accept: false }))}>Decline</button></div></div>)}
    </section> : null}
    <section className="card space-y-4"><h2 className="card-title">Friends ({friends?.length ?? 0})</h2>
      {friends === undefined ? <p role="status">Loading your friends…</p> : friends.length ? <ul className="space-y-4">{friends.map(f => <li className="social-row" key={f.accountId}>
        <div className="flex items-center gap-3"><Buddy who={f.displayName} pose="wave" size={64} /><p><strong>{f.displayName}</strong><br /><span className="muted">@{f.username}</span></p></div>
        <button className="btn" disabled={busy} onClick={() => { if (window.confirm(`Remove ${f.displayName} from your friends?`)) void run(() => remove({ friendAccountId: f.accountId })); }}>Remove friend</button>
      </li>)}</ul> : <p>Your friends will gather here. Ask someone for their Huddle username to get started.</p>}
    </section>
    {outgoing.length ? <section className="card space-y-3"><h2 className="card-title">Waiting for a reply</h2>{outgoing.map(r => <p key={r.id}>{r.toDisplayName} <span className="muted">@{r.toUsername} · request sent</span></p>)}</section> : null}
    {error ? <p className="error" role="alert">{error}</p> : null}
  </>}</AccountShell>;
}
