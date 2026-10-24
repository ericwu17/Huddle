import { useState } from "react";
import { Link } from "react-router";
import { QRCodeSVG } from "qrcode.react";
import { joinUrl } from "../joinUrl";
import { useReducer } from "spacetimedb/react";
import { reducers } from "../module_bindings";
import { useGroup } from "../groupContext";
import { useRun } from "../useRun";
import { Buddy } from "../doodle/Doodle";
import FriendPicker from "../components/FriendPicker";
import { useAccount, useHuddleInvitations, useInvitationDeliveries } from "../accountData";
import InvitationDelivery from "../components/InvitationDelivery";
import CalendarTimeSelector from "../components/CalendarTimeSelector";
import SendInvitationMessageButton from "../components/SendInvitationMessageButton";

export default function Lobby() {
  const { group, session, isHost, agent } = useGroup();
  const setReady = useReducer(reducers.setReady);
  const setOrigin = useReducer(reducers.setOrigin);
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
  const link = joinUrl(group.code);
  const [copied, setCopied] = useState(false);

  function copyLink() {
    navigator.clipboard?.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }, () => {});
  }

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

      <section className="card join-card" aria-label="Join this huddle">
        <div className="join-qr">
          <QRCodeSVG value={link} size={168} fgColor="#16152b" marginSize={1} title={`QR code to join huddle ${group.code}`} />
        </div>
        <div className="join-info">
          <p className="muted">Scan, or enter this code on Huddle</p>
          <p className="join-code" aria-label={`Huddle code ${group.code.split("").join(" ")}`}>{group.code}</p>
          <p className="muted break-all text-sm">{link}</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={copyLink}>{copied ? "Link copied" : "Copy link"}</button>
            {"share" in navigator ? <button className="btn" onClick={() => void navigator.share({ title: "Join my huddle", text: `Join my huddle: code ${group.code}`, url: link }).catch(() => {})}>Share…</button> : null}
          </div>
        </div>
      </section>

      <section className="card space-y-4"><h2 className="card-title">Or invite Huddle friends</h2>
        {account ? <><FriendPicker selected={selected} onChange={setSelected} disabled={busy} exclude={sent.filter(i => i.status === "pending" || i.status === "accepted").map(i => i.toAccountId)} />
          <button className="btn btn-sun" disabled={busy || !selected.length} onClick={() => run(async () => { await invite({ groupId: group.id, friendAccountIds: selected }); setNotice(`In-app invitations sent to ${selected.length} ${selected.length === 1 ? "friend" : "friends"}.`); setSelected([]); })}>Send invitations</button>
          <p className="muted">Friends get a message in their Huddle inbox with a link to open this outing.</p>
          {notice ? <p role="status">{notice}</p> : null}
          {sent.length ? <ul className="space-y-3">{sent.map(i => <li className="space-y-2" key={i.id}><strong>{i.toDisplayName}</strong> · {i.status}<InvitationDelivery status={deliveries?.find(d => d.invitationId === i.id)?.status} /><SendInvitationMessageButton invitationId={i.id} pending={i.status === "pending"} status={deliveries?.find(d => d.invitationId === i.id)?.status} /></li>)}</ul> : null}
        </> : <><p>Have a Huddle account? Sign in to invite friends from your list. The code above works without one.</p><Link className="btn" to="/login">Sign in</Link></>}
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
        {agent ? <Link className="btn btn-sun" to={`/g/${session.groupId}/prefs`}>{agent.confirmedMemberIds.includes(session.memberId) ? "Edit my private needs" : "Set my needs & get ready"}</Link> : <button className="btn btn-primary" disabled={busy || me?.ready} onClick={() => run(() => setReady())}>{me?.ready ? "Ready ✓" : "I'm ready"}</button>}
        <button className="btn" disabled={busy} onClick={shareLocation}>
          Use my location
        </button>
      </div>
      <p className="on-sky muted">Each person saves their own private needs. The host can find plans once 2+ people are ready.</p>
      {agent && account ? <CalendarTimeSelector /> : null}

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
