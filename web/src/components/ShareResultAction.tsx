import { useState } from "react";
import { useProcedure } from "spacetimedb/react";
import { procedures } from "../module_bindings";
import { useRun } from "../useRun";

export default function ShareResultAction({ runId, planId }: { runId: string; planId: string }) {
  const create = useProcedure(procedures.createResultShare);
  const { run, busy, error } = useRun();
  const [url, setUrl] = useState("");
  const [notice, setNotice] = useState("");
  return <section className="card space-y-3" aria-label="Share the chosen result">
    <h2 className="card-title">Share the plan</h2>
    <p>Share the route and time with friends.</p>
    <button className="btn btn-sun" disabled={busy} onClick={() => run(async () => {
      let nextUrl = url;
      if (!nextUrl) {
        const result = await create({ runId, planId });
        nextUrl = new URL(`/result/${encodeURIComponent(result.shareId)}`, window.location.origin).href;
        setUrl(nextUrl);
      }
      if (navigator.share) {
        try { await navigator.share({ title: "Our Huddle", text: "Here’s our Huddle plan.", url: nextUrl }); setNotice("Your result link is ready."); }
        catch (cause) {
          if (cause instanceof Error && cause.name === "AbortError") { setNotice("Your result link is ready to copy below."); return; }
          setNotice("Your result link is ready. Copy it below to share.");
        }
      } else if (navigator.clipboard) {
        try { await navigator.clipboard.writeText(nextUrl); setNotice("Result link copied."); }
        catch { setNotice("Your result link is ready. Select and copy it below."); }
      } else setNotice("Your result link is ready. Select and copy it below.");
    })}>{busy ? "Preparing result link…" : "Share result"}</button>
    {url ? <div className="space-y-3"><label className="block font-bold" htmlFor="result-share-url">Read-only result link</label>
      <input id="result-share-url" className="input" value={url} readOnly onFocus={event => event.target.select()} />
      <div className="flex flex-wrap gap-3"><button className="btn" disabled={busy} onClick={() => run(async () => {
        if (!navigator.clipboard) throw new Error("Select and copy the result link above.");
        await navigator.clipboard.writeText(url); setNotice("Result link copied.");
      })}>Copy link</button><a className="btn" href={url} target="_blank" rel="noopener noreferrer">Open shared result</a></div>
    </div> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {error ? <p className="error" role="alert">{error}</p> : null}
  </section>;
}
