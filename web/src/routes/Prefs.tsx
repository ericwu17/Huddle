import { useState } from "react";
import { useReducer } from "spacetimedb/react";
import { reducers } from "../module_bindings";
import { useGroup } from "../groupContext";
import { useRun } from "../useRun";
import { Buddy } from "../doodle/Doodle";

export default function Prefs() {
  const { session, mine } = useGroup();
  const submitPrefs = useReducer(reducers.submitPrefs);
  const { run, busy, error } = useRun();
  const [text, setText] = useState("");

  return (
    <div className="space-y-5">
      <h1 className="shout text-[52px]">What do you want?</h1>

      <section className="card card-note space-y-3">
        <div className="flex items-center gap-3">
          <Buddy who={session.name} pose="phone" size={84} boil />
          <p className="bubble hand text-xl">Only you see this. Be honest!</p>
        </div>
        <textarea
          className="input min-h-32"
          placeholder="no sushi, under $30, somewhere quiet"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          className="btn btn-primary w-full"
          disabled={busy || !text.trim()}
          onClick={() => run(() => submitPrefs({ text }))}
        >
          Save, privately
        </button>
        {error && <p className="error">{error}</p>}
      </section>

      {mine?.text && (
        <section className="card space-y-3 text-sm">
          <p className="hand text-xl">
            <span className="display mr-2 text-base text-[var(--cobalt)]">You said</span>"{mine.text}"
          </p>
          {mine.hard ? (
            <pre className="scrap">{JSON.stringify(mine.hard, null, 2)}</pre>
          ) : (
            <p className="muted">Reading it…</p>
          )}
          {mine.warnings.map((w) => (
            <p key={w} className="error">
              {w}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}
