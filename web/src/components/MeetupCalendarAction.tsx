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
  const prior = !!meetup && !sameRun;
  const submitted = !!meetup && (sameRun || ["pending", "sending", "created", "partial", "unknown"].includes(meetup.status));
  return <section className="card space-y-4" aria-label="Agreed meetup calendar event">
    <h2 className="card-title">Put it on the calendar</h2>
    <p>Everyone has voted on this plan. Add the agreed meetup to connected calendars that explicitly opted in.</p>
    <p className="muted">{optedIn} {optedIn === 1 ? "participant has" : "participants have"} opted in. This creates a calendar event; it does not reserve a restaurant.</p>
    {meetup ? <p role="status">{meetup.message}</p> : null}
    {prior ? <p className="card-note rounded-xl p-3">Plans have changed since the previous calendar operation. Existing calendar entries are not changed when plans are revised; check your calendar.</p> : null}
    {sameRun && meetup?.status === "failed" ? <p className="muted">This calendar attempt failed. It cannot be repeated on the same planning run.</p> : null}
    {isHost ? <button className="btn btn-sun" disabled={busy || !configured || !optedIn || submitted} onClick={() => run(() => confirm({ runId, planId }))}>{busy || meetup?.status === "pending" || meetup?.status === "sending" ? "Adding agreed meetup…" : "Add meetup to opted-in calendars"}</button> : <p className="muted">The host can add the agreed meetup after your own calendar opt-in.</p>}
    {configured === false ? <p className="muted">Calendar event creation is not configured yet. Voting and the booking simulation still work.</p> : null}
    <Link className="underline font-bold" to="/connectors">Manage my calendar and event opt-in</Link>
    {error ? <p className="error" role="alert">{error}</p> : null}
  </section>;
}
