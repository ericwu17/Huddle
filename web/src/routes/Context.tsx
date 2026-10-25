import { useState } from "react";
import { useReducer } from "spacetimedb/react";
import { reducers } from "../module_bindings";
import { EMPTY_CONTEXT, useAccount, useAccountContext, type AccountContext } from "../accountData";
import AccountShell, { AccountRequired } from "../components/AccountShell";
import { PreferenceFields } from "../components/PreferenceFields";
import { useRun } from "../useRun";

function ContextForm({ initial }: { initial: AccountContext }) {
  const [draft, setDraft] = useState(initial);
  const save = useReducer(reducers.saveAccountContext);
  const clear = useReducer(reducers.clearAccountContext);
  const { run, busy, error } = useRun();
  const [notice, setNotice] = useState("");
  return <section className="card space-y-5">
    <p>These defaults are private to your account in SpacetimeDB. You can edit them for each outing. Saving here does not change an existing Huddle’s limits.</p>
    <PreferenceFields value={draft} onChange={setDraft} prefix="usual" />
    <label className="block font-bold" htmlFor="usual-preferences">Anything else you usually like (optional)</label>
    <textarea id="usual-preferences" className="input min-h-28" maxLength={4000} placeholder="Favorite cuisines, activities, quieter places…" value={draft.preferences}
      onChange={e => setDraft({ ...draft, preferences: e.target.value })} />
    <div className="flex flex-wrap gap-3"><button className="btn btn-sun" disabled={busy} onClick={() => run(async () => { await save({ contextJson: JSON.stringify(draft) }); setNotice("Your private defaults are saved."); })}>Save my defaults</button>
      <button className="btn" disabled={busy} onClick={() => { if (window.confirm("Clear your saved defaults? Existing Huddle requirements will stay as they are.")) void run(async () => { await clear(); setDraft({ ...EMPTY_CONTEXT }); setNotice("Saved context cleared."); }); }}>Clear my saved context</button></div>
    {notice ? <p role="status">{notice}</p> : null}{error ? <p className="error" role="alert">{error}</p> : null}
    <p className="muted">Huddle does not infer allergies, raise budgets or record a simulated booking as a place you visited.</p>
  </section>;
}

export default function Context() {
  const account = useAccount();
  const saved = useAccountContext();
  return <AccountShell loading={!!account && saved === undefined}>{account === undefined ? null : !account ? <AccountRequired /> : saved === undefined ? null : <>
    <div><h1 className="shout text-[56px]">Preferences</h1><p className="on-sky mt-3">A head start for your next hangout. Always yours to edit.</p></div>
    <ContextForm key={account.accountId} initial={saved?.context ?? EMPTY_CONTEXT} />
  </>}</AccountShell>;
}
