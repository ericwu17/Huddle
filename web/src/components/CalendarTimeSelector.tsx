import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useProcedure, useReducer } from "spacetimedb/react";
import { procedures, reducers } from "../module_bindings";
import { useGroupConnectors } from "../accountData";
import { useGroup } from "../groupContext";
import { useRun } from "../useRun";
import { OUTING_TIME_ZONE, berkeleyMidnight, berkeleyToday, dateAfter } from "../calendarTime";
import { displayTime, displayTimesInText } from "../venueFormatting";

export default function CalendarTimeSelector() {
  const { group, isHost } = useGroup();
  const calendars = useGroupConnectors();
  const schedule = useProcedure(procedures.scheduleHuddle);
  const setWindow = useReducer(reducers.setHuddleWindow);
  const status = useProcedure(procedures.connectorStatus);
  const { run, busy, error } = useRun();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [searchStart, setSearchStart] = useState(berkeleyToday);
  const [searchEnd, setSearchEnd] = useState(() => dateAfter(berkeleyToday(), 6));
  const [manualDate, setManualDate] = useState(group.date);
  const [manualStart, setManualStart] = useState(group.window.start);
  const [manualEnd, setManualEnd] = useState(group.window.end);
  const [dayStart, setDayStart] = useState("17:00");
  const [dayEnd, setDayEnd] = useState("23:00");
  const [duration, setDuration] = useState(120);
  const [notice, setNotice] = useState("");
  const allConnected = group.members.length >= 2 && group.members.every(m => calendars?.some(c => c.memberId === m.id && c.connected));
  useEffect(() => {
    let current = true;
    void status().then(result => { if (current) setConfigured(result.googleConfigured); }).catch(() => { if (current) setConfigured(false); });
    return () => { current = false; };
  }, [status]);
  return <section className="card space-y-4" aria-label="Find a time together">
    <h2 className="card-title">Find a time together</h2>
    <p>Current outing: <strong>{group.date}, {displayTime(group.window.start)}–{displayTime(group.window.end)}</strong>.</p>
    <p className="muted">Dates and outing hours use Berkeley time (America/Los_Angeles).</p>
    {isHost ? <details className="space-y-4"><summary className="btn">Set date & time manually</summary>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); void run(async () => {
        await setWindow({ date: manualDate, windowStart: manualStart, windowEnd: manualEnd, timeZone: OUTING_TIME_ZONE });
        setNotice("The outing window was updated. Previous plans and choices need a fresh review.");
      }); }}>
        <label className="block font-bold" htmlFor="manual-outing-date">Outing date</label><input id="manual-outing-date" className="input" type="date" required value={manualDate} onChange={e => setManualDate(e.target.value)} />
        <div className="grid grid-cols-2 gap-3"><div><label className="block font-bold" htmlFor="manual-outing-start">Outing starts</label><input id="manual-outing-start" className="input" type="time" required value={manualStart} onChange={e => setManualStart(e.target.value)} /></div>
          <div><label className="block font-bold" htmlFor="manual-outing-end">Outing ends</label><input id="manual-outing-end" className="input" type="time" required value={manualEnd} onChange={e => setManualEnd(e.target.value)} /></div></div>
        <p className="muted">{displayTime(manualStart)}–{displayTime(manualEnd)}</p>
        <p className="muted">Changing the date or window makes previous plans, votes and booking choices stale.</p>
        <button className="btn btn-sun" disabled={busy}>Apply outing date & time</button>
      </form>
    </details> : null}
    <p className="muted">Optional: use everyone’s primary-calendar free/busy times. Calendar event details stay private.</p>
    <ul className="space-y-2">{group.members.map(m => <li key={m.id}><strong>{m.name}</strong>: {calendars === undefined ? "checking calendar…" : calendars.some(c => c.memberId === m.id && c.connected) ? "calendar connected ✓" : "calendar not connected"}</li>)}</ul>
    <Link className="underline font-bold" to="/connectors">Manage my calendar connection</Link>
    {isHost ? <details className="space-y-4"><summary className="btn">Choose a search window</summary>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); void run(async () => {
        const result = await schedule({ searchStart: berkeleyMidnight(searchStart), searchEnd: berkeleyMidnight(dateAfter(searchEnd, 1)), dayStart, dayEnd, durationMinutes: duration, timeZone: OUTING_TIME_ZONE });
        setNotice(displayTimesInText(result.message));
        if (!result.ok) throw new Error(displayTimesInText(result.message));
      }); }}>
        <p className="muted">Search dates and daily hours use Berkeley time, including daylight-saving changes.</p>
        <label className="block font-bold" htmlFor="schedule-start">Search from</label>
        <input id="schedule-start" className="input" type="date" required value={searchStart} onChange={e => setSearchStart(e.target.value)} />
        <label className="block font-bold" htmlFor="schedule-end">Search through</label>
        <input id="schedule-end" className="input" type="date" required min={searchStart} value={searchEnd} onChange={e => setSearchEnd(e.target.value)} />
        <div className="grid grid-cols-2 gap-3"><div><label className="block font-bold" htmlFor="schedule-day-start">Earliest start</label><input id="schedule-day-start" className="input" type="time" required value={dayStart} onChange={e => setDayStart(e.target.value)} /></div>
          <div><label className="block font-bold" htmlFor="schedule-day-end">Latest finish</label><input id="schedule-day-end" className="input" type="time" required value={dayEnd} onChange={e => setDayEnd(e.target.value)} /></div></div>
        <p className="muted">{displayTime(dayStart)}–{displayTime(dayEnd)}</p>
        <label className="block font-bold" htmlFor="schedule-duration">Meetup duration (minutes)</label><input id="schedule-duration" className="input" type="number" min="15" max="720" step="15" required value={duration} onChange={e => setDuration(Number(e.target.value))} />
        <button className="btn btn-sun" disabled={busy || !configured || !allConnected}>{busy ? "Checking shared availability…" : "Find a time everyone can make"}</button>
      </form>
    </details> : <p className="muted">The host can find a shared time when everyone connects a calendar.</p>}
    {configured === false ? <p className="muted">Calendar scheduling is not configured yet. You can continue with the current outing window.</p> : !allConnected ? <p className="muted">Everyone needs a connected calendar for a shared availability check. This does not block planning.</p> : null}
    {notice ? <p role="status">{notice}</p> : null}{error ? <p className="error" role="alert">{error}</p> : null}
  </section>;
}
