import { useState } from "react";
import type { AgentPlan } from "../agentData";
import { createResultCalendar } from "../resultCalendar";
import { useRun } from "../useRun";

export default function CalendarDownload({ date, plan, runId }: { date: string; plan: AgentPlan; runId: string }) {
  const { run, busy, error } = useRun();
  const [notice, setNotice] = useState("");
  return <section className="card space-y-3" aria-label="Download meetup calendar file">
    <h2 className="card-title">Use another calendar</h2>
    <p>Download a calendar file for Apple Calendar, Outlook or Google Calendar.</p>
    <button className="btn" disabled={busy} onClick={() => run(async () => {
      const content = createResultCalendar({ date, plan, uid: `${runId}-${plan.id}` });
      const url = URL.createObjectURL(new Blob([content], { type: "text/calendar;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url; link.download = `huddle-${date}.ics`;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Calendar download started. Open the file to add this meetup.");
    })}>Download calendar (.ics)</button>
    {notice ? <p role="status">{notice}</p> : null}
    {error ? <p className="error" role="alert">{error}</p> : null}
  </section>;
}
