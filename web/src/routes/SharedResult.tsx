import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { useProcedure, useSpacetimeDB } from "spacetimedb/react";
import { procedures } from "../module_bindings";
import { parseSharedResult, type SharedResult as PublicResult } from "../sharedResult";
import ChosenResult from "../components/ChosenResult";

export default function SharedResult() {
  const { shareId = "" } = useParams();
  const read = useProcedure(procedures.getResultShare);
  const { isActive } = useSpacetimeDB();
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<{ shareId: string; pending: boolean; result: PublicResult | null; error: boolean }>({ shareId, pending: true, result: null, error: false });
  useEffect(() => {
    if (!isActive || !shareId) return;
    let current = true, request = 0;
    function refresh() {
      const revision = ++request;
      setView({ shareId, pending: true, result: null, error: false });
      void read({ shareId }).then(response => {
        if (current && revision === request) setView({ shareId, pending: false, result: response.ok ? parseSharedResult(response.resultJson) : null, error: false });
      }).catch(() => { if (current && revision === request) setView({ shareId, pending: false, result: null, error: true }); });
    }
    function visible() { if (document.visibilityState === "visible") refresh(); }
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => { current = false; window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", visible); };
  }, [shareId, read, isActive, attempt]);
  const result = view.shareId === shareId ? view.result : null;
  const pending = !isActive || view.shareId !== shareId || view.pending;
  return <main className="page space-y-5">
    <Link className="logo" to="/start">huddle</Link>
    <h1 className="shout text-[48px]">Our Huddle</h1>
    {pending ? <p className="card" role="status">Opening the shared plan…</p> : result ? <>
      <ChosenResult date={result.date} choice={result.choice} />
      <p className="on-sky muted">A shared result. This does not join you to the Huddle or reserve a restaurant.</p>
    </> : <section className="card space-y-3"><h2 className="card-title">{view.error ? "Couldn’t open this result" : "This result is no longer available"}</h2>
      <p>{view.error ? "Try checking the link again." : "The group may have changed its choice. Ask them for a current link."}</p>
    </section>}
    {!pending ? <button className="btn" onClick={() => setAttempt(value => value + 1)}>Check result again</button> : null}
  </main>;
}
