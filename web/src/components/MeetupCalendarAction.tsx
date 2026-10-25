import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useProcedure, useReducer } from "spacetimedb/react";
import { procedures, reducers } from "../module_bindings";
import { useGroupConnectors, useMeetup } from "../accountData";
import { useRun } from "../useRun";

export default function MeetupCalendarAction({ runId, planId, isHost }: { runId: string; planId: string; isHost: boolean }) {
  const calendars = useGroupConnectors();
  const meetup = useMeetup();
  const confirm = useReducer(reducers.confirmMeetup);
  const status = useProcedure(procedures.connectorStatus);
  const { run, busy, error } = useRun();
  const [configured, setConfigured] = useState<boolean | null>(null);
  useEffect(() => {
    let current = true;
    void status().then(result => { if (current) setConfigured(result.googleConfigured); }).catch(() => { if (current) setConfigured(false); });
    return () => { current = false; };
  }, [status]);
  const optedIn = calendars?.filter(c => c.connected && c.eventConsent).length ?? 0;
  const sameRun = meetup?.runId === runId;
  const sameChoice = sameRun && meetup?.planId === planId;
  const prior = !!meetup && !sameChoice;
  const submitted = !!meetup && (sameRun || ["pending", "sending", "created", "partial", "unknown"].includes(meetup.status));
  const label = prior && submitted ? "Previous calendar request exists" : sameChoice && meetup?.status === "created" ? "Added to calendars ✓"
    : sameChoice && meetup?.status === "partial" ? "Added to some calendars" : sameChoice && meetup?.status === "failed" ? "Calendar attempt failed"
      : sameChoice && meetup?.status === "unknown" ? "Check your calendar" : "Add to calendars";
  return <section className="card space-y-4" aria-label="Agreed meetup calendar event">
    <h2 className="card-title">Put it on the calendar</h2>
    <p>{optedIn} {optedIn === 1 ? "person has" : "people have"} opted in to add this plan.</p>
    <p className="muted">Adds an event, not a restaurant reservation.</p>
    {meetup ? <p role="status">{meetup.message}</p> : null}
    {prior ? <p className="card-note rounded-xl p-3">The plan changed. Check your calendar—the old event hasn’t changed.</p> : null}
    {sameRun && meetup?.status === "failed" ? <p className="muted">This calendar attempt failed. It cannot be repeated on the same planning run.</p> : null}
    {isHost ? <button className="btn btn-sun" disabled={busy || !configured || !optedIn || submitted} onClick={() => run(() => confirm({ runId, planId }))}>{busy || meetup?.status === "pending" || meetup?.status === "sending" ? "Adding agreed meetup…" : label}</button> : <p className="muted">The host can add the agreed meetup after your own calendar opt-in.</p>}
    {configured === false ? <p className="muted">Calendar event creation is not configured yet. Voting and the booking simulation still work.</p> : null}
    <Link className="underline font-bold" to="/connectors">Calendar settings</Link>
    {error ? <p className="error" role="alert">{error}</p> : null}
  </section>;
}
