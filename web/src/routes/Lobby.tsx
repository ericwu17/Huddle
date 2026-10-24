import { QRCodeSVG } from "qrcode.react";
import { useReducer } from "spacetimedb/react";
import { reducers } from "../module_bindings";
import { useGroup } from "../groupContext";
import { useRun } from "../useRun";

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
    <div className="space-y-4">
      <section className="card flex flex-col items-center gap-2">
        <QRCodeSVG value={joinUrl} size={180} />
        <p className="text-4xl font-bold tracking-widest">{group.code}</p>
        <p className="muted break-all">{joinUrl}</p>
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">Members ({group.members.length})</h2>
        <ul className="flex flex-wrap gap-2">
          {group.members.map((m) => (
            <li key={m.id} className="rounded-full border px-3 py-1 text-sm">
              {m.name} {m.ready ? "✓" : "…"}
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={busy || me?.ready} onClick={() => run(() => setReady())}>
          {me?.ready ? "Ready" : "I'm ready"}
        </button>
        <button className="btn" disabled={busy} onClick={shareLocation}>
          Use my location
        </button>
      </div>
      <p className="muted">Starts once there are 2+ members and everyone is ready.</p>

      {isHost && (
        <section className="card space-y-2 text-sm">
          <h2 className="font-semibold">Host settings</h2>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={group.demoMode}
              onChange={(e) => run(() => setDemoMode({ on: e.target.checked }))}
            />
            Demo mode (cached data)
          </label>
          <label className="flex items-center gap-2">
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
