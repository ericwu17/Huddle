import { useState } from "react";
import { useProcedure, useReducer } from "spacetimedb/react";
import { procedures, reducers } from "../module_bindings";
import { useFriendContactDestinations, useFriends } from "../accountData";
import { useRun } from "../useRun";

type ContactMatch = { contactId: string; displayName: string; destinations: { value: string; label: string; kind: string }[] };
type ContactChoice = { contactId: string; contactName: string; destination: string; label: string };

export default function MacContactsConnector() {
  const friends = useFriends();
  const mappings = useFriendContactDestinations();
  const search = useProcedure(procedures.searchMacContacts);
  const save = useReducer(reducers.saveFriendContact);
  const clear = useReducer(reducers.clearFriendContact);
  const { run, busy, error } = useRun();
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<ContactMatch[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [friendId, setFriendId] = useState("");
  const [choice, setChoice] = useState<ContactChoice | null>(null);
  const [notice, setNotice] = useState("");
  const friend = friends?.find(f => f.accountId === friendId);
  return <section id="mac-contacts" className="card space-y-4" aria-label="Mac Contacts links">
    <h2 className="card-title">Link friends from Mac Contacts</h2>
    <p>Match a Mac contact to a Huddle friend for invitation messages.</p>
    <p className="muted">Only your selected contact is saved. Your friend’s message settings take priority.</p>
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); void run(async () => {
      setChoice(null); setMatches(null); setNotice("");
      const result = await search({ query: query.trim() });
      if (!result.ok) throw new Error(result.message);
      setMatches(result.contacts); setTruncated(result.truncated);
    }); }}>
      <label className="block font-bold" htmlFor="mac-contact-query">Search Mac Contacts by name</label>
      <div className="flex flex-wrap gap-3"><input id="mac-contact-query" className="input flex-1 min-w-40" disabled={busy} minLength={2} maxLength={80} required value={query} onChange={e => { setQuery(e.target.value); setMatches(null); setChoice(null); }} placeholder="For example: Eric" />
        <button className="btn btn-sun" disabled={busy || query.trim().length < 2}>{busy ? "Please wait…" : "Search Mac Contacts"}</button></div>
    </form>
    <p className="muted">macOS may ask for Contacts or Automation access on Max’s Mac. If permission is denied, allow the demo’s access in System Settings → Privacy & Security, then search again.</p>
    {matches ? <div className="space-y-4">
      <label className="block font-bold" htmlFor="mac-huddle-friend">Huddle friend to link</label>
      <select id="mac-huddle-friend" className="input" value={friendId} disabled={busy} onChange={e => { setFriendId(e.target.value); setNotice(""); }}>
        <option value="">Choose the Huddle friend</option>
        {friends?.map(f => <option key={f.accountId} value={f.accountId}>{f.displayName} (@{f.username})</option>)}
      </select>
      <fieldset className="space-y-3"><legend className="font-bold">Choose the exact contact and destination</legend>
        {!matches.length ? <p>No contacts matched. Try a more specific name.</p> : <div className="contact-results space-y-4">{matches.map(contact => <div className="space-y-2" key={contact.contactId}>
          <h3 className="font-bold">{contact.displayName}</h3>
          {contact.destinations.length ? contact.destinations.map((d, i) => <label className="contact-choice" key={`${d.value}:${i}`}>
            <input type="radio" name="mac-contact-destination" disabled={busy} checked={choice?.contactId === contact.contactId && choice.destination === d.value}
              onChange={() => { setChoice({ contactId: contact.contactId, contactName: contact.displayName, destination: d.value, label: d.label }); setNotice(""); }} />
            <span><strong>{d.label || d.kind}</strong><br /><span className="text-sm">{d.value}</span></span>
          </label>) : <p className="muted">No supported phone number or email on this contact.</p>}
        </div>)}</div>}
        {truncated ? <p className="muted">There are more matches. Search with a more specific name before choosing.</p> : null}
      </fieldset>
      {friend && choice ? <div className="card-note rounded-xl p-3 space-y-2" aria-label="Review contact link">
        <p>Link <strong>{choice.contactName}</strong> ({choice.label})<br /><strong className="break-all">{choice.destination}</strong></p>
        <p>to <strong>{friend.displayName} (@{friend.username})</strong> in Huddle.</p>
        <p className="muted">Linking does not send a message. Your next explicit invitation can use this destination.</p>
      </div> : null}
      <button className="btn btn-sun" disabled={busy || !friend || !choice} onClick={() => run(async () => {
        if (!friend || !choice) return;
        await save({ friendAccountId: friend.accountId, contactId: choice.contactId, contactName: choice.contactName, destination: choice.destination });
        setNotice(`Contact linked to ${friend.displayName}. No message was sent.`);
      })}>Link contact</button>
    </div> : null}
    <div className="space-y-3"><h3 className="font-bold">Your linked friends</h3>
      {mappings === undefined ? <p role="status">Loading linked contacts…</p> : !mappings.length ? <p className="muted">No Mac Contacts linked yet.</p> : <ul className="space-y-3">{mappings.map(m => <li className="social-row" key={m.friendAccountId}>
        <p className="min-w-0 break-words"><strong>{friends?.find(f => f.accountId === m.friendAccountId)?.displayName ?? "Huddle friend"}</strong> · {m.contactName}<br /><span className="muted break-all">{m.destination}</span></p>
        <button className="btn" disabled={busy} onClick={() => run(async () => { await clear({ friendAccountId: m.friendAccountId }); setNotice("Contact link removed."); })}>Unlink contact</button>
      </li>)}</ul>}
    </div>
    {notice ? <p role="status">{notice}</p> : null}{error ? <p className="error" role="alert">{error}</p> : null}
  </section>;
}
