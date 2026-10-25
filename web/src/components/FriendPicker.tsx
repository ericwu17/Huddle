import { Link } from "react-router";
import { useFriends } from "../accountData";

export default function FriendPicker({ selected, onChange, disabled = false, exclude = [] }: {
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  exclude?: string[];
}) {
  const friends = useFriends();
  const choices = friends?.filter(f => !exclude.includes(f.accountId));
  return <details className="friend-picker">
    <summary className="btn btn-sun" aria-disabled={disabled}>Invite friends {selected.length ? `(${selected.length} selected)` : "⌄"}</summary>
    <div className="friend-picker-menu space-y-3">
      {choices === undefined ? <p role="status">Loading friends…</p> : choices.length ? choices.map(f => <label className="check" key={f.accountId}>
        <input type="checkbox" disabled={disabled || (!selected.includes(f.accountId) && selected.length >= 11)} checked={selected.includes(f.accountId)}
          onChange={e => onChange(e.target.checked ? [...selected, f.accountId] : selected.filter(id => id !== f.accountId))} />
        <span><strong>{f.displayName}</strong> <span className="muted">@{f.username}</span></span>
      </label>) : <p>No friends available yet. <Link className="underline font-bold" to="/friends">Add a friend by username</Link>.</p>}
      {choices?.length ? <p className="muted">Choose up to 11 friends.</p> : null}
    </div>
  </details>;
}
