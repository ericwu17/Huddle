import PageHeading from "../components/PageHeading";
import { useState } from "react";
import { useReducer } from "spacetimedb/react";
import { reducers } from "../module_bindings";
import { useAccount, useAccountContext, type AccountContext } from "../accountData";
import AccountShell, { AccountRequired } from "../components/AccountShell";
import { PreferenceFields } from "../components/PreferenceFields";
import { DEFAULT_PREFERENCES } from "../accountContextState";
import { useRun } from "../useRun";

function ContextForm({ initial }: { initial: AccountContext }) {
  const [draft, setDraft] = useState(initial);
  const save = useReducer(reducers.saveAccountContext);
  const clear = useReducer(reducers.clearAccountContext);
  const { run, busy, error } = useRun();
  const [notice, setNotice] = useState("");
  return <section className="card preferences-form">
    <p className="muted">Defaults for new outings. Edit them anytime.</p>
    <PreferenceFields value={draft} onChange={setDraft} prefix="usual">
      <div className="preference-extra"><label className="block font-bold" htmlFor="usual-preferences">Anything else? (optional)</label>
      <textarea id="usual-preferences" className="input" rows={2} maxLength={4000} placeholder="Favorite cuisines, activities, quieter places…" value={draft.preferences}
        onChange={e => setDraft({ ...draft, preferences: e.target.value })} /></div>
    </PreferenceFields>
    <div className="preferences-actions"><button className="btn btn-sun" disabled={busy} onClick={() => run(async () => { await save({ contextJson: JSON.stringify(draft) }); setNotice("Defaults saved."); })}>Save defaults</button>
      <button className="btn btn-quiet" disabled={busy} onClick={() => { if (window.confirm("Reset saved preferences? Your current huddles stay as they are.")) void run(async () => { await clear(); setDraft({ ...DEFAULT_PREFERENCES }); setNotice("Saved preferences cleared."); }); }}>Reset defaults</button></div>
    {notice ? <p role="status">{notice}</p> : null}{error ? <p className="error" role="alert">{error}</p> : null}
  </section>;
}

export default function Context() {
  const account = useAccount();
  const saved = useAccountContext();
  return <AccountShell loading={!!account && saved === undefined}>{account === undefined ? null : !account ? <AccountRequired /> : saved === undefined ? null : <>
    <div><PageHeading lead="Your" accent="preferences" /><p className="on-sky mt-3">A head start for your next hangout.</p></div>
    <ContextForm key={account.accountId} initial={saved?.context ?? DEFAULT_PREFERENCES} />
  </>}</AccountShell>;
}
