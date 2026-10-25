import CityPicker from "../components/CityPicker";
import { chosenCity } from "../../../shared/cities";
import { useHuddleLocation } from "../huddleLocation";
import PageHeading from "../components/PageHeading";
import { useState } from "react";
import { Link } from "react-router";
import { useReducer } from "spacetimedb/react";
import { reducers } from "../module_bindings";
import { useGroup } from "../groupContext";
import { readinessFor } from "../readiness";
import { useRun } from "../useRun";
import { Buddy } from "../doodle/Doodle";
import FriendPicker from "../components/FriendPicker";
import { useAccount, useHuddleInvitations, useInvitationDeliveries } from "../accountData";
import InvitationDelivery from "../components/InvitationDelivery";

export default function Lobby() {
  const ctx = useGroup();
  const { group, session, isHost, agent } = ctx;
  const setReady = useReducer(reducers.setReady);
  const setOrigin = useReducer(reducers.setOrigin);
  const clearOrigin = useReducer(reducers.clearOrigin);
  const setLocationCity = useReducer(reducers.setLocationCity);
  const location = useHuddleLocation();
  const setDemoMode = useReducer(reducers.setDemoMode);
  const setShowWho = useReducer(reducers.setShowWhoCompromised);
  const invite = useReducer(reducers.inviteFriends);
  const account = useAccount();
  const invitations = useHuddleInvitations();
  const deliveries = useInvitationDeliveries();
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const { run, busy, error } = useRun();

  const me = group.members.find((m) => m.id === session.memberId);
  const sent = invitations?.filter(i => i.groupId === group.id && i.direction === "outgoing") ?? [];

  function shareLocation() {
    run(async () => {
      if (!navigator.geolocation) throw new Error("Location is unavailable in this browser.");
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error("Location unavailable. Allow location in your browser and try again.")),
          { timeout: 10000, maximumAge: 60000 }));
      await setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    });
  }

  return (
    <div className="space-y-5">
      <PageHeading lead="Get everyone" accent="together" />

      <section className="card space-y-4"><h2 className="card-title">Invite friends</h2>
        {account ? <><FriendPicker selected={selected} onChange={setSelected} disabled={busy} exclude={sent.filter(i => i.status === "pending" || i.status === "accepted").map(i => i.toAccountId)} />
          <button className="btn btn-sun" disabled={busy || !selected.length} onClick={() => run(async () => { await invite({ groupId: group.id, friendAccountIds: selected }); setNotice(`In-app invitations sent to ${selected.length} ${selected.length === 1 ? "friend" : "friends"}.`); setSelected([]); })}>Send invitations</button>
          <p className="muted">Invitations arrive in their Huddle inbox.</p>
          {notice ? <p role="status">{notice}</p> : null}
          {sent.length ? <ul className="space-y-3">{sent.map(i => <li className="space-y-2" key={i.id}><strong>{i.toDisplayName}</strong> · {i.status}<InvitationDelivery status={deliveries?.find(d => d.invitationId === i.id)?.status} /></li>)}</ul> : null}
        </> : <><p>Sign in to invite friends from your list.</p><Link className="btn" to="/login">Sign in</Link></>}
      </section>

      <section className="card card-note card-tilt-l space-y-3">
        <h2 className="card-title">Who's here ({group.members.length})</h2>
        <ul className="crowd">
          {group.members.map((m) => (
            <li key={m.id} className="crowd-member">
              <Buddy who={m.name} pose={m.ready ? "huddle" : "idle"} size={76} boil={m.id === session.memberId} />
              <b>{m.name}</b>
              <span className={`sticker ${readinessFor("lobby", ctx, m.id).ready ? "sticker-lime" : ""}`}>{readinessFor("lobby", ctx, m.id).label}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card space-y-3" aria-label="Huddle location">
        <h2 className="card-title">Where should we go?</h2>
        <p>{location?.myCity ? `Your shared city: ${location.myCity}` : "Your location is optional."}</p>
        <p role="status">{location?.destinationCities.length
          ? `Planning in ${location.destinationCities.join(" or ")}${location.destinationCities.length > 1 ? " — the cities are tied." : "."}`
          : "No city selected yet. Places across the catalog are available."}</p>
        <p className="muted">The most common shared city sets the destination. Tied cities get separate options. Exact starting points stay private.</p>
        <div className="flex flex-wrap gap-3">
          <button className="btn" disabled={busy || location === undefined} onClick={shareLocation}>{location?.myCity ? "Update my location" : "Use my location"}</button>
          {location?.myCity ? <button className="btn" disabled={busy} onClick={() => run(() => clearOrigin())}>Clear my location</button> : null}
        </div>
        <CitySelection key={location?.myCity ?? "flexible"} initial={location?.myCity ?? ""} disabled={busy || location === undefined}
          onSave={value => run(() => value ? setLocationCity({ city: value }) : clearOrigin())} />
        <p className="muted text-sm">After changing location, save your preferences again to get ready.</p>
      </section>
      <div className="flex gap-3">
        {agent ? <Link className="btn btn-sun" to={`/g/${session.groupId}/prefs`}>{agent.confirmedMemberIds.includes(session.memberId) ? "Edit preferences" : "Start huddle"}</Link> : <button className="btn btn-primary" disabled={busy || me?.ready} onClick={() => run(() => setReady())}>{me?.ready ? "Ready ✓" : "I'm ready"}</button>}
      </div>
      <p className="card !py-3 text-sm">Once two people are ready, you can find plans.</p>

      {isHost && !agent && (
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

function CitySelection({ initial, disabled, onSave }: { initial: string; disabled: boolean; onSave: (city: string | null) => unknown }) {
  const [value, setValue] = useState(initial);
  const city = chosenCity(value);
  return <div className="space-y-3"><CityPicker value={value} onChange={setValue} disabled={disabled} />
    <button className="btn" disabled={disabled || city === undefined || city === (initial || null)} onClick={() => city !== undefined && onSave(city)}>Use this city</button>
  </div>;
}
