import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useProcedure, useReducer, useSpacetimeDB } from "spacetimedb/react";
import { procedures, reducers } from "../module_bindings";
import { useAccount, useConnectors } from "../accountData";
import AccountShell, { AccountRequired } from "../components/AccountShell";
import { useRun } from "../useRun";
import MacContactsConnector from "../components/MacContactsConnector";

type ConnectorConfiguration = { googleConfigured: boolean; messagesConfigured: boolean; externalInvitesConfigured: boolean; googleCallbackUrl?: string };
type ConnectorSettings = { messageEnabled: boolean; messageDestination: string; messageStatus: string; calendarStatus: string; calendarEmail?: string; calendarEventConsent: boolean; calendarError?: string };

function ConnectorForm({ initial, configuration }: { initial: ConnectorSettings | null; configuration: ConnectorConfiguration | null }) {
  const saveMessages = useReducer(reducers.saveMessageConnector);
  const disconnect = useReducer(reducers.disconnectGoogleCalendar);
  const eventConsent = useReducer(reducers.setCalendarEventConsent);
  const connect = useProcedure(procedures.startGoogleCalendar);
  const { run, busy, error } = useRun();
  const [enabled, setEnabled] = useState(initial?.messageEnabled ?? false);
  const [destination, setDestination] = useState(initial?.messageDestination ?? "");
  const [notice, setNotice] = useState("");
  const messagesReady = !!configuration?.messagesConfigured && !!configuration.externalInvitesConfigured;
  const calendarConnected = initial?.calendarStatus === "connected";
  return <div className="space-y-6">
    <section className="card space-y-4" aria-label="Messages connector">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="card-title">Messages invitations</h2>
        <span className={`sticker ${messagesReady ? "sticker-lime" : ""}`}>{configuration === null ? "Checking connection" : messagesReady ? "Demo sender available" : "Not configured"}</span></div>
      <p>Get an invitation message with a link to open Huddle. In this demo, Messages sends from Max’s Mac using his Messages account.</p>
      <p className="muted">Your phone number or Apple ID email stays private. Friends cannot see it.</p>
      {!messagesReady && configuration ? <p className="card-note rounded-xl p-3">The demo host has not connected the Messages sender and public invitation URL. In-app invitations still work.</p> : null}
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); void run(async () => {
        await saveMessages({ enabled, destination }); setNotice(enabled ? "You opted in to external invitation messages." : "External invitation messages are off.");
      }); }}>
        <label className="block font-bold" htmlFor="message-destination">Your Messages address</label>
        <input id="message-destination" className="input" type="text" autoComplete="off" maxLength={254} value={destination} onChange={e => setDestination(e.target.value)} placeholder="+15105551234 or your Apple ID email" required={enabled} />
        <label className="check"><input type="checkbox" checked={enabled} disabled={busy || (!messagesReady && !enabled)} onChange={e => setEnabled(e.target.checked)} />Send Huddle invitation messages to this address</label>
        <button className="btn btn-sun" disabled={busy}>Save my message settings</button>
      </form>
      <p className="muted">Submitting to Messages does not confirm delivery. You can always find your invitations in Huddle’s inbox.</p>
    </section>
    <section className="card space-y-4" aria-label="Google Calendar connector">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="card-title">Google Calendar</h2><span className={`sticker ${calendarConnected ? "sticker-lime" : ""}`}>{initial?.calendarStatus ?? "disconnected"}</span></div>
      <p>Find a time that works for everyone. Availability checks use your primary calendar’s free/busy times. Event names and descriptions are not shared with the group.</p>
      {calendarConnected && initial?.calendarEmail ? <p>Connected as <strong>{initial.calendarEmail}</strong></p> : null}
      {configuration && !configuration.googleConfigured ? <p className="card-note rounded-xl p-3">Google Calendar is not configured by the demo host yet. You can keep using Huddle without connecting a calendar.</p> : null}
      <div className="flex flex-wrap gap-3">{!calendarConnected ? <button className="btn btn-sun" disabled={busy || !configuration?.googleConfigured} onClick={() => run(async () => {
        const result = await connect();
        if (!result.ok || !result.authorizationUrl) throw new Error(result.message);
        window.location.assign(result.authorizationUrl);
      })}>{initial?.calendarStatus === "pending" ? "Continue connecting Google Calendar" : "Connect Google Calendar"}</button> : null}
        {initial && initial.calendarStatus !== "disconnected" ? <button className="btn" disabled={busy} onClick={() => run(async () => { await disconnect(); setNotice("Your Google Calendar is disconnected from Huddle."); })}>Disconnect Google Calendar</button> : null}</div>
      {!calendarConnected ? <p className="muted">This preview uses Google’s test mode. If Google shows 403/access_denied, ask the host to add your exact Google email under Auth Platform → Audience → Test users, then reconnect.</p> : null}
      {configuration?.googleCallbackUrl ? <details className="space-y-3"><summary className="font-bold">Google Calendar setup details</summary>
        <p className="muted">The host must register this exact callback as an authorized redirect URI for the Google OAuth web client. Update it when the API’s public address changes.</p>
        <label className="block font-bold" htmlFor="google-callback">Public callback URL</label>
        <input id="google-callback" className="input" readOnly value={configuration.googleCallbackUrl} onFocus={e => e.target.select()} />
        <button className="btn" disabled={busy} onClick={() => run(async () => {
          if (!navigator.clipboard) throw new Error("Select and copy the callback URL above.");
          await navigator.clipboard.writeText(configuration.googleCallbackUrl!); setNotice("The public Google callback URL was copied.");
        })}>Copy callback URL</button>
      </details> : null}
      {initial?.calendarError ? <p className="error" role="alert">{initial.calendarError}</p> : null}
      <label className="check"><input type="checkbox" checked={initial?.calendarEventConsent ?? false} disabled={busy || (!calendarConnected && !initial?.calendarEventConsent)} onChange={e => run(() => eventConsent({ enabled: e.target.checked }))} />Allow Huddle to add an agreed meetup to my calendar</label>
      <p className="muted">This is a separate opt-in. After everyone votes, the host explicitly adds the agreed meetup to calendars that opted in. It does not reserve a restaurant.</p>
    </section>
    {notice ? <p className="card" role="status">{notice}</p> : null}
    {error ? <p className="error" role="alert">{error}</p> : null}
  </div>;
}

export default function Connectors() {
  const account = useAccount();
  const settings = useConnectors();
  const status = useProcedure(procedures.connectorStatus);
  const { isActive } = useSpacetimeDB();
  const [configuration, setConfiguration] = useState<ConnectorConfiguration | null>(null);
  const [error, setError] = useState("");
  const accountId = account?.accountId;
  useEffect(() => {
    if (!accountId || !isActive) return;
    let current = true;
    void status().then(result => { if (current) { setConfiguration(result); setError(""); } }).catch(() => { if (current) setError("Could not check connector availability. Refresh to try again."); });
    return () => { current = false; };
  }, [accountId, isActive, status]);
  return <AccountShell loading={!!account && settings === undefined}>{account === undefined ? null : !account ? <AccountRequired /> : settings === undefined ? null : <>
    <div><h1 className="shout text-[56px]">Connect your world</h1><p className="on-sky mt-3">Your connections. Your choices. Huddle still works without them.</p></div>
    {account.activeGroupId ? <Link className="btn" to={`/g/${account.activeGroupId}`}>Back to my current Huddle</Link> : null}
    {account.username === "maxli" ? <MacContactsConnector /> : null}
    <ConnectorForm key={account.accountId} initial={settings} configuration={configuration} />
    {error ? <p className="error" role="alert">{error}</p> : null}
  </>}</AccountShell>;
}
