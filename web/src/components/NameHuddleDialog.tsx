import { useEffect, useRef, useState } from "react";
import { Buddy } from "../doodle/Doodle";

const SUGGESTIONS = ["Dinner crew", "Weekend wander", "Coffee catch-up"];

type Props = {
  busy: boolean;
  connected: boolean;
  error: string | null;
  onClose: () => void;
  onContinue: (name?: string) => Promise<void>;
};

export default function NameHuddleDialog({ busy, connected, error, onClose, onContinue }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const cleanName = name.trim().replace(/\s+/g, " ");

  useEffect(() => {
    const element = dialog.current!;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = "hidden";
    element.showModal();
    input.current?.focus();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  return <dialog ref={dialog} className="name-huddle-dialog" aria-labelledby="name-huddle-title" aria-describedby="name-huddle-hint"
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <button type="button" className="name-huddle-close" aria-label="Cancel naming this Huddle" disabled={busy} onClick={onClose}>×</button>
    <div className="name-huddle-art" aria-hidden="true"><Buddy who="Your next adventure" pose="wave" size={90} crown /></div>
    <h2 id="name-huddle-title">What would you like to <span>name this Huddle?</span></h2>
    <p id="name-huddle-hint" className="muted">A little name for your next adventure. Your friends will see it too.</p>
    <form className="space-y-5" aria-busy={busy} onSubmit={event => {
      event.preventDefault();
      if (cleanName && connected && !busy) void onContinue(cleanName);
    }}>
      <label className="name-huddle-field"><span>Huddle name</span>
        <input ref={input} className="input" placeholder="Friday night bites…" maxLength={80}
          autoComplete="off" value={name} disabled={busy} onChange={event => setName(event.target.value)} />
      </label>
      <div className="name-huddle-suggestions" aria-label="Huddle name suggestions">
        {SUGGESTIONS.map(suggestion => <button type="button" className="name-suggestion" key={suggestion} disabled={busy}
          onClick={() => { setName(suggestion); input.current?.focus(); }}>{suggestion}</button>)}
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {!connected ? <p className="muted" role="status">Reconnecting to Huddle…</p> : null}
      <div className="name-huddle-actions">
        <button type="button" className="btn btn-quiet" disabled={busy || !connected} onClick={() => void onContinue()}>Skip for now</button>
        <button type="submit" className="btn btn-sun" disabled={busy || !connected || !cleanName}>{busy ? "Starting…" : "Continue →"}</button>
      </div>
    </form>
  </dialog>;
}
