import PageHeading from "../components/PageHeading";
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
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="card-title">Text invites</h2>
        <span className={`sticker ${messagesReady ? "sticker-lime" : ""}`}>{configuration === null ? "Checking…" : messagesReady ? "Ready" : "Not set up"}</span></div>
      <p>Get invites in Messages, sent from Max’s Mac.</p>

      {!messagesReady && configuration ? <p className="card-note rounded-xl p-3">Text invites aren’t set up yet. Your Huddle inbox still works.</p> : null}
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); void run(async () => {
        await saveMessages({ enabled, destination }); setNotice(enabled ? "Text invites are on." : "Text invites are off.");
      }); }}>
        <label className="block font-bold" htmlFor="message-destination">Phone number or Apple ID email</label>
        <input id="message-destination" className="input" type="text" autoComplete="off" maxLength={254} value={destination} onChange={e => setDestination(e.target.value)} placeholder="+15105551234 or your Apple ID email" required={enabled} />
        <label className="check"><input type="checkbox" checked={enabled} disabled={busy || (!messagesReady && !enabled)} onChange={e => setEnabled(e.target.checked)} />Send invites here</label>
        <button className="btn btn-sun" disabled={busy}>Save settings</button>
      </form>
      <p className="muted">Delivery isn’t guaranteed. Invites also appear in your Huddle inbox.</p>
    </section>
    <section className="card space-y-4" aria-label="Google Calendar connector">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="card-title">Google Calendar</h2><span className={`sticker ${calendarConnected ? "sticker-lime" : ""}`}>{calendarConnected ? "Connected" : initial?.calendarStatus === "pending" ? "Connecting…" : "Not connected"}</span></div>
      <p>Find a shared time using your primary calendar’s availability. Event details stay hidden.</p>
      {calendarConnected && initial?.calendarEmail ? <p>Connected as <strong>{initial.calendarEmail}</strong></p> : null}
      {configuration && !configuration.googleConfigured ? <p className="card-note rounded-xl p-3">Calendar sync isn’t set up yet. You can still use Huddle.</p> : null}
      <div className="flex flex-wrap gap-3">{!calendarConnected ? <button className="btn btn-sun" disabled={busy || !configuration?.googleConfigured} onClick={() => run(async () => {
        const result = await connect();
        if (!result.ok || !result.authorizationUrl) throw new Error(result.message);
        window.location.assign(result.authorizationUrl);
      })}>{initial?.calendarStatus === "pending" ? "Continue connecting Google Calendar" : "Connect Google Calendar"}</button> : null}
        {initial && initial.calendarStatus !== "disconnected" ? <button className="btn" disabled={busy} onClick={() => run(async () => { await disconnect(); setNotice("Your Google Calendar is disconnected from Huddle."); })}>Disconnect Google Calendar</button> : null}</div>
      {!calendarConnected ? <details className="space-y-2"><summary className="font-bold">Trouble connecting?</summary><p className="muted">If Google blocks sign-in, ask the host to add your email as a test user, then try again.</p></details> : null}
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
      <label className="check"><input type="checkbox" checked={initial?.calendarEventConsent ?? false} disabled={busy || (!calendarConnected && !initial?.calendarEventConsent)} onChange={e => run(() => eventConsent({ enabled: e.target.checked }))} />Allow additions I request to my calendar</label>
      <p className="muted">After voting, choose “Add to my calendar” on the Done page. Only you can add it to your connected account.</p>
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
    <div><PageHeading lead="Connect your" accent="world" /><p className="on-sky mt-3">Optional connections for easier plans.</p></div>
    {account.activeGroupId ? <Link className="btn" to={`/g/${account.activeGroupId}`}>Back to my huddle</Link> : null}
    {account.username === "maxli" ? <MacContactsConnector /> : null}
    <ConnectorForm key={account.accountId} initial={settings} configuration={configuration} />
    {error ? <p className="error" role="alert">{error}</p> : null}
  </>}</AccountShell>;
}
