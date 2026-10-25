import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useProcedure, useReducer } from "spacetimedb/react";
import { procedures, reducers } from "../module_bindings";
import { useGroupConnectors } from "../accountData";
import { useGroup } from "../groupContext";
import { useRun } from "../useRun";
import { useHuddleTiming } from "../huddleTiming";
import { OUTING_TIME_ZONE, TIME_OF_DAY_OPTIONS, berkeleyMidnight, berkeleyToday, dateAfter, dayBounds } from "../calendarTime";
import { displayTime } from "../venueFormatting";

export default function CalendarTimeSelector() {
  const { group, isHost, agent } = useGroup();
  const calendars = useGroupConnectors();
  const timing = useHuddleTiming();
  const schedule = useProcedure(procedures.scheduleHuddle);
  const setWindow = useReducer(reducers.setHuddleWindow);
  const setPreference = useReducer(reducers.setHuddleTimePreference);
  const status = useProcedure(procedures.connectorStatus);
  const { run, busy, error } = useRun();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [searchStart, setSearchStart] = useState(berkeleyToday);
  const [searchEnd, setSearchEnd] = useState(() => dateAfter(berkeleyToday(), 6));
  const [manualDate, setManualDate] = useState("");
  const [manualStart, setManualStart] = useState("");
  const [manualEnd, setManualEnd] = useState("");
  const [duration, setDuration] = useState(0);
  const [notice, setNotice] = useState("");
  const timeOfDay = timing?.groupId === group.id ? timing.timeOfDay : "flexible";
  const scheduled = timing?.groupId === group.id && timing.source !== "pending";
  const locked = busy || agent?.status === "planning" || timing === undefined;
  const allConnected = group.members.length >= 2 && group.members.every(m => calendars?.some(c => c.memberId === m.id && c.connected));
  useEffect(() => {
    let current = true;
    void status().then(result => { if (current) setConfigured(result.googleConfigured); }).catch(() => { if (current) setConfigured(false); });
    return () => { current = false; };
  }, [status]);
  return <section className="card space-y-4" aria-label="Find a time together">
    <h2 className="card-title">When are we going?</h2>
    {scheduled ? <p><strong>{group.date} · {displayTime(group.window.start)}–{displayTime(group.window.end)}</strong>
      {timing.source === "calendar" ? " · Works with everyone’s calendar" : " · Picked by the host"}</p>
      : <p>Find a time that works for everyone, or pick one yourself.</p>}
    {isHost ? <div className="space-y-2"><label className="block font-bold" htmlFor="outing-time-of-day">Time of day (optional)</label>
      <select id="outing-time-of-day" className="input" value={timeOfDay} disabled={locked} onChange={e => {
        const value = e.target.value;
        void run(async () => { await setPreference({ timeOfDay: value }); setNotice("Saved. We’ll use this for the next plan."); });
      }}>{TIME_OF_DAY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
    </div> : <p>Time preference: {TIME_OF_DAY_OPTIONS.find(option => option.value === timeOfDay)?.label ?? "Any time"}</p>}
    <ul className="calendar-members">{group.members.map(m => <li key={m.id}><strong>{m.name}</strong><span className="muted">{calendars === undefined ? "Checking…" : calendars.some(c => c.memberId === m.id && c.connected) ? "Connected ✓" : "Not connected"}</span></li>)}</ul>
    <Link className="underline font-bold" to="/connectors">{allConnected ? "Calendar settings" : "Connect your calendar"}</Link>
    {isHost ? <form className="space-y-4" onSubmit={e => { e.preventDefault(); void run(async () => {
      const response = await schedule({ searchStart: berkeleyMidnight(searchStart), searchEnd: berkeleyMidnight(dateAfter(searchEnd, 1)),
        ...dayBounds(timeOfDay), durationMinutes: duration, timeZone: OUTING_TIME_ZONE });
      setNotice(response.message);
      if (!response.ok) throw new Error(response.message);
    }); }}>
      <details className="space-y-3"><summary className="font-bold">More options</summary>
        <label className="block font-bold" htmlFor="schedule-start">Search from</label><input id="schedule-start" className="input" type="date" required value={searchStart} onChange={e => setSearchStart(e.target.value)} />
        <label className="block font-bold" htmlFor="schedule-end">Search through</label><input id="schedule-end" className="input" type="date" required min={searchStart} value={searchEnd} onChange={e => setSearchEnd(e.target.value)} />
        <label className="block font-bold" htmlFor="schedule-duration">Outing length</label><select id="schedule-duration" className="input" value={duration} onChange={e => setDuration(Number(e.target.value))}>
          <option value={0}>Use our time limits</option>{[60, 90, 120, 180].map(minutes => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
        </select>
      </details>
      <button className="btn" disabled={locked || !configured || !allConnected}>{busy ? "Finding a time…" : "Find a time"}</button>
    </form> : null}
    {configured === false ? <p className="muted">Calendar sync isn’t set up yet. You can still pick places and a time.</p>
      : !allConnected ? <p className="muted">Connect everyone’s calendar to find a time. You can pick places first.</p> : null}
    {isHost ? <details className="space-y-4"><summary className="font-bold">Pick a time myself</summary>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); void run(async () => {
        await setWindow({ date: manualDate, windowStart: manualStart, windowEnd: manualEnd, timeZone: OUTING_TIME_ZONE });
        setNotice("Time saved. Find plans to use it.");
      }); }}>
        <label className="block font-bold" htmlFor="manual-outing-date">Date</label><input id="manual-outing-date" className="input" type="date" required value={manualDate} onChange={e => setManualDate(e.target.value)} />
        <div className="grid grid-cols-2 gap-3"><div><label className="block font-bold" htmlFor="manual-outing-start">Start</label><input id="manual-outing-start" className="input" type="time" required value={manualStart} onChange={e => setManualStart(e.target.value)} /></div>
          <div><label className="block font-bold" htmlFor="manual-outing-end">End</label><input id="manual-outing-end" className="input" type="time" required value={manualEnd} onChange={e => setManualEnd(e.target.value)} /></div></div>
        <button className="btn" disabled={locked}>Use this time</button>
      </form>
    </details> : null}
    {notice ? <p role="status">{notice}</p> : null}{error ? <p className="error" role="alert">{error}</p> : null}
  </section>;
}
