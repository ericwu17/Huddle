import { QRCodeSVG } from "qrcode.react";
import { useReducer } from "spacetimedb/react";
import { reducers } from "../module_bindings";
import { useGroup } from "../groupContext";
import { useRun } from "../useRun";
import { Buddy } from "../doodle/Doodle";

export default function Lobby() {
  const { group, session, isHost } = useGroup();
  const setReady = useReducer(reducers.setReady);
  const setOrigin = useReducer(reducers.setOrigin);
  const setDemoMode = useReducer(reducers.setDemoMode);
  const setShowWho = useReducer(reducers.setShowWhoCompromised);
  const { run, busy, error } = useRun();

  const me = group.members.find((m) => m.id === session.memberId);
  const joinUrl = `${window.location.origin}/join/${group.code}`;

  function shareLocation() {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        run(() => setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude })),
      (err) => run(() => Promise.reject(new Error(`Location unavailable: ${err.message}`))),
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="shout text-[52px]">Get everyone in</h1>

      <section className="card flex flex-col items-center gap-2 text-center">
        <div className="rounded-2xl border-[3px] border-[var(--ink)] bg-white p-2">
          <QRCodeSVG value={joinUrl} size={168} fgColor="#16152b" />
        </div>
        <p className="display text-6xl tracking-[0.18em] text-[var(--cobalt)]">{group.code}</p>
        <p className="muted break-all">{joinUrl}</p>
      </section>

      <section className="card card-note card-tilt-l space-y-3">
        <h2 className="card-title">Who's here ({group.members.length})</h2>
        <ul className="crowd">
          {group.members.map((m) => (
            <li key={m.id} className="crowd-member">
              <Buddy who={m.name} pose={m.ready ? "huddle" : "idle"} size={76} boil={m.id === session.memberId} />
              <b>{m.name}</b>
              <span className={`sticker ${m.ready ? "sticker-lime" : ""}`}>{m.ready ? "ready ✓" : "not yet"}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <button className="btn btn-primary" disabled={busy || me?.ready} onClick={() => run(() => setReady())}>
          {me?.ready ? "Ready ✓" : "I'm ready"}
        </button>
        <button className="btn" disabled={busy} onClick={shareLocation}>
          Use my location
        </button>
      </div>
      <p className="on-sky muted">Starts once there are 2+ members and everyone is ready.</p>

      {isHost && (
        <section className="card space-y-3 text-sm">
          <h2 className="card-title">Host settings</h2>
          <label className="check">
            <input
              type="checkbox"
              checked={group.demoMode}
              onChange={(e) => run(() => setDemoMode({ on: e.target.checked }))}
            />
            Demo mode (cached data)
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={group.showWhoCompromised}
              onChange={(e) => run(() => setShowWho({ on: e.target.checked }))}
            />
            Show who compromised
          </label>
        </section>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
