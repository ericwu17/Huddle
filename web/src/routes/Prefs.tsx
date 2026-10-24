import { useState } from "react";
import { Link } from "react-router";
import { useReducer } from "spacetimedb/react";
import { reducers } from "../module_bindings";
import { useGroup } from "../groupContext";
import { useRun } from "../useRun";

export default function Prefs() {
  const { session, mine } = useGroup();
  const submitPrefs = useReducer(reducers.submitPrefs);
  const { run, busy, error } = useRun();
  const [text, setText] = useState("");

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">What do you want?</h2>
      <p className="muted">Only you see this.</p>
      <textarea
        className="input min-h-28"
        placeholder="no sushi, under $30, somewhere quiet"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button
        className="btn btn-primary w-full"
        disabled={busy || !text.trim()}
        onClick={() => run(() => submitPrefs({ text }))}
      >
        Save
      </button>
      {error && <p className="error">{error}</p>}

      {mine?.text && (
        <section className="card space-y-2 text-sm">
          <p>
            <span className="font-semibold">You said:</span> {mine.text}
          </p>
          {mine.hard ? (
            <pre className="overflow-x-auto bg-gray-50 p-2">{JSON.stringify(mine.hard, null, 2)}</pre>
          ) : (
            <p className="muted">Parsing…</p>
          )}
          {mine.warnings.map((w) => (
            <p key={w} className="error">
              {w}
            </p>
          ))}
          <Link className="underline" to={`/g/${session.groupId}/swipe`}>
            Next: swipe →
          </Link>
        </section>
      )}
    </div>
  );
}
