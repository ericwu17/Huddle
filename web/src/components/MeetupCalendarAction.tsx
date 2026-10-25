import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useProcedure, useReducer } from "spacetimedb/react";
import { procedures, reducers } from "../module_bindings";
import { useConnectors, useMeetup } from "../accountData";
import { useRun } from "../useRun";

export default function MeetupCalendarAction({ runId, planId }: { runId: string; planId: string }) {
  const calendar = useConnectors();
  const meetup = useMeetup();
  const consent = useReducer(reducers.setCalendarEventConsent);
  const confirm = useReducer(reducers.confirmMeetup);
  const status = useProcedure(procedures.connectorStatus);
  const { run, busy, error } = useRun();
  const [configured, setConfigured] = useState<boolean | null>(null);
  useEffect(() => {
    let current = true;
    void status().then(result => { if (current) setConfigured(result.googleConfigured); }).catch(() => { if (current) setConfigured(false); });
    return () => { current = false; };
  }, [status]);
  const connected = calendar?.calendarStatus === "connected";
  const sameRun = meetup?.runId === runId;
  const sameChoice = sameRun && meetup?.planId === planId;
  const prior = !!meetup && !sameChoice;
  const submitted = !!meetup && (sameRun || ["pending", "sending", "created", "partial", "unknown"].includes(meetup.status));
  const label = prior && submitted ? "Previous calendar request exists" : sameChoice && meetup?.status === "created" ? "Added to my calendar ✓"
    : sameChoice && meetup?.status === "partial" ? "Check your calendar" : sameChoice && meetup?.status === "failed" ? "Calendar attempt failed"
      : sameChoice && meetup?.status === "unknown" ? "Check your calendar" : "Add to my calendar";
  return <section className="card space-y-4" aria-label="Agreed meetup calendar event">
    <h2 className="card-title">Your calendar</h2>
    <p>Add this meetup only to your connected Google Calendar. Your friends add it separately.</p>
    {meetup ? <p role="status">{meetup.message}</p> : null}
    {prior ? <p className="card-note rounded-xl p-3">The plan changed. Check your calendar—the old event hasn’t changed.</p> : null}
    {sameRun && meetup?.status === "failed" ? <p className="muted">This calendar attempt failed. It cannot be repeated on the same planning run.</p> : null}
    <div className="meetup-calendar-actions">
      <button className="btn btn-sun" disabled={busy || !configured || !connected || submitted} onClick={() => run(async () => {
        if (!calendar?.calendarEventConsent) await consent({ enabled: true });
        await confirm({ runId, planId });
      })}>{busy || meetup?.status === "pending" || meetup?.status === "sending" ? "Adding to my calendar…" : label}</button>
      <Link className="underline font-bold" to="/connectors">{connected ? "Calendar settings" : "Connect my Google Calendar"}</Link>
    </div>
    {configured === false ? <p className="muted">Calendar event creation is not configured yet. Voting and the booking simulation still work.</p> : null}
    {error ? <p className="error" role="alert">{error}</p> : null}
  </section>;
}
