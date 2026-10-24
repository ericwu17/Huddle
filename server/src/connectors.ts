// Connector credentials and destinations stay private. Browser views expose
// only the owner's settings and group readiness, never calendar event contents.
import { SenderError, t } from "spacetimedb/server";
import spacetimedb, { calendar_oauth_expiry_job, calendar_revoke_job, invitation_delivery_job } from "./schema";
import { requireAccount, membershipKey } from "./lib/account-state";
import { callApi } from "./lib/api";
import { at, currentGroup, membersOf, newId, nowMs } from "./lib/util";
import type { ReadDb, Tx } from "./lib/types";
import { isMacContactsOwner, validMessageDestination } from "./contacts";

const oauthResult = t.object("StartGoogleCalendarResult", {
  ok: t.bool(), message: t.string(), authorizationUrl: t.option(t.string()),
});
const failOAuth = (message: string) => ({ ok: false, message, authorizationUrl: undefined });

function currentAccount(db: ReadDb, sender: Tx["sender"]) {
  const session = db.account_session.identity.find(sender);
  return session?.accountId ? db.account.id.find(session.accountId) : null;
}

export function publicFrontendBase(value: string | undefined): string | null {
  const input = value?.trim().replace(/\/+$/, "") ?? "";
  // Require a public HTTPS hostname. Loopback/LAN HTTP is intentionally not a
  // notification destination: the recipient must reach the same database's UI.
  const match = /^https:\/\/([a-z0-9.-]+)(?::443)?(\/[A-Za-z0-9/_-]*)?$/i.exec(input);
  const host = match?.[1].toLowerCase();
  if (!host || !host.includes(".") || host.split(".").some(label => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) || /^(?:\d+\.){3}\d+$/.test(host) ||
      /(?:^|\.)(?:localhost|local|internal|invalid|test)$/.test(host) || host.includes("..")) return null;
  return input;
}

function externalEnabled(tx: Pick<Tx, "env">) {
  return tx.env.MESSAGES_ENABLED === "true" && !!tx.env.FASTAPI_BASE_URL && !!publicFrontendBase(tx.env.PUBLIC_FRONTEND_BASE_URL);
}

export const saveMessageConnector = spacetimedb.reducer({ enabled: t.bool(), destination: t.string() }, (tx, { enabled, destination }) => {
  const { account } = requireAccount(tx);
  const value = destination.trim();
  if (value.length > 254 || enabled && !(/^\+[1-9]\d{7,14}$/.test(value) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))
    throw new SenderError("Use your own international phone number (+country code) or Apple ID email.");
  const row = { accountId: account.id, enabled, destination: value, updatedAt: nowMs(tx) };
  if (tx.db.message_connector.accountId.find(account.id)) tx.db.message_connector.accountId.update(row);
  else tx.db.message_connector.insert(row);
  // Opting out before dispatch prevents queued messages from being sent.
  if (!enabled) for (const invitation of tx.db.huddle_invitation.toAccountId.filter(account.id)) {
    const delivery = tx.db.invitation_delivery.invitationId.find(invitation.id);
    if (delivery?.status === "queued") tx.db.invitation_delivery.invitationId.update({ ...delivery,
      status: "in_app_only", error: "The recipient turned off Messages delivery.", destination: undefined, updatedAt: nowMs(tx) });
  }
});

export const setCalendarEventConsent = spacetimedb.reducer({ enabled: t.bool() }, (tx, { enabled }) => {
  const { account } = requireAccount(tx);
  const connection = tx.db.calendar_connection.accountId.find(account.id);
  if (!connection || enabled && (connection.status !== "connected" || !connection.tokenCiphertext))
    throw new SenderError("Connect Google Calendar before allowing meetup events.");
  tx.db.calendar_connection.accountId.update({ ...connection, eventConsent: enabled, updatedAt: nowMs(tx) });
});

export const disconnectGoogleCalendar = spacetimedb.reducer({}, tx => {
  const { account } = requireAccount(tx);
  const old = tx.db.calendar_connection.accountId.find(account.id);
  if (old) {
    const generation = newId(tx, "calendar", id => id === old.generation || !!tx.db.calendar_revocation.generation.find(id));
    tx.db.calendar_connection.accountId.update({ ...old, status: "disconnected", generation, tokenCiphertext: undefined,
      email: undefined, scopesJson: "[]", expiresAt: undefined, eventConsent: false, error: undefined, updatedAt: nowMs(tx) });
    if (old.tokenCiphertext) {
      tx.db.calendar_revocation.insert({ generation, accountId: account.id, status: "pending" });
      tx.db.calendar_revoke_job.insert({ ...at(tx), accountId: account.id, tokenCiphertext: old.tokenCiphertext, generation });
    }
  }
  for (const state of tx.db.calendar_oauth_state.accountId.filter(account.id)) {
    if (state.status === "pending" || state.status === "claimed")
      tx.db.calendar_oauth_state.stateId.update({ ...state, status: "cancelled", claimNonce: undefined });
  }
});

export const runCalendarRevokeJob = spacetimedb.procedure(
  { onSchedule: calendar_revoke_job }, { job: calendar_revoke_job.rowType }, t.unit(), (ctx, { job }) => {
    const body = ctx.withTx(tx => {
      const state = tx.db.calendar_revocation.generation.find(job.generation);
      const connection = tx.db.calendar_connection.accountId.find(job.accountId);
      if (!state || state.status !== "pending" || state.accountId !== job.accountId) return null;
      if (!connection || connection.generation !== job.generation || connection.status !== "disconnected") {
        tx.db.calendar_revocation.generation.update({ ...state, status: "superseded" });
        return null;
      }
      tx.db.calendar_revocation.generation.update({ ...state, status: "attempted" });
      return { accountId: job.accountId, tokenCiphertext: job.tokenCiphertext };
    });
    if (!body) return {};
    const result = ctx.env.FASTAPI_BASE_URL ? callApi(ctx, "/connectors/google/revoke", body) : null;
    ctx.withTx(tx => {
      const state = tx.db.calendar_revocation.generation.find(job.generation);
      if (state?.status !== "attempted") return;
      const revoked = result?.ok && !result.stub && result.data.revoked === true;
      tx.db.calendar_revocation.generation.update({ ...state, status: revoked ? "revoked" : "unknown" });
      const connection = tx.db.calendar_connection.accountId.find(job.accountId);
      if (connection?.generation === job.generation && connection.status === "disconnected")
        tx.db.calendar_connection.accountId.update({ ...connection, error: revoked ? undefined :
          "Huddle is disconnected. Google permission removal could not be confirmed; manage this app in your Google account.", updatedAt: nowMs(tx) });
    });
    return {};
  },
);

export const connectorStatus = spacetimedb.procedure({}, t.object("ConnectorConfigurationResult", {
  googleConfigured: t.bool(), messagesConfigured: t.bool(), externalInvitesConfigured: t.bool(), googleCallbackUrl: t.option(t.string()),
}), ctx => {
  ctx.withTx(tx => requireAccount(tx));
  const response = ctx.env.FASTAPI_BASE_URL ? callApi(ctx, "/connectors/status", {}) : null;
  const available = response?.ok && !response.stub ? response.data : {};
  return { googleConfigured: available.googleConfigured === true, messagesConfigured: available.messagesConfigured === true,
    googleCallbackUrl: typeof available.googleCallbackUrl === "string" && /^https?:\/\//.test(available.googleCallbackUrl) && available.googleCallbackUrl.length <= 2000 ? available.googleCallbackUrl : undefined,
    externalInvitesConfigured: available.messagesConfigured === true && externalEnabled(ctx) };
});

export const startGoogleCalendar = spacetimedb.procedure({}, oauthResult, ctx => {
  const pending = ctx.withTx(tx => {
    const { account, session } = requireAccount(tx);
    const old = tx.db.calendar_connection.accountId.find(account.id);
    const generation = newId(tx, "calendar", id => id === old?.generation ||
      Array.from(tx.db.calendar_oauth_state.accountId.filter(account.id)).some(state => state.generation === id));
    const row = { accountId: account.id, provider: "google", status: "pending", generation,
      tokenCiphertext: undefined, email: undefined, scopesJson: "[]", expiresAt: undefined,
      eventConsent: false, error: undefined, updatedAt: nowMs(tx) };
    if (old) tx.db.calendar_connection.accountId.update(row); else tx.db.calendar_connection.insert(row);
    for (const state of tx.db.calendar_oauth_state.accountId.filter(account.id))
      if (state.status === "pending" || state.status === "claimed") tx.db.calendar_oauth_state.stateId.update({ ...state, status: "cancelled", claimNonce: undefined });
    return { accountId: account.id, sessionNonce: session.nonce, generation };
  });
  const result = ctx.env.FASTAPI_BASE_URL ? callApi(ctx, "/connectors/google/start", { accountId: pending.accountId }) : null;
  return ctx.withTx(tx => {
    const session = tx.db.account_session.identity.find(tx.sender);
    const connection = tx.db.calendar_connection.accountId.find(pending.accountId);
    if (!connection || connection.generation !== pending.generation || session?.accountId !== pending.accountId ||
        session.nonce !== pending.sessionNonce || session.expiresAt <= nowMs(tx)) {
      if (connection?.generation === pending.generation && connection.status === "pending")
        tx.db.calendar_connection.accountId.update({ ...connection, status: "error", error: "This connection attempt ended. Connect again.", updatedAt: nowMs(tx) });
      return failOAuth("This connection attempt was superseded. Try again.");
    }
    const data = result?.ok && !result.stub ? result.data : null;
    if (!data || typeof data.authorizationUrl !== "string" || !/^https:\/\/accounts\.google\.com\//.test(data.authorizationUrl) ||
        typeof data.stateId !== "string" || !data.stateId || data.stateId.length > 4000 ||
        typeof data.expiresAt !== "number" || !Number.isFinite(data.expiresAt) || data.expiresAt <= nowMs(tx) ||
        data.expiresAt > nowMs(tx) + 30 * 60_000 || tx.db.calendar_oauth_state.stateId.find(data.stateId)) {
      tx.db.calendar_connection.accountId.update({ ...connection, status: "error", error: "Google Calendar is not configured or could not start. Retry after setup.", updatedAt: nowMs(tx) });
      return failOAuth("Google Calendar is not configured or could not start. Retry after setup.");
    }
    tx.db.calendar_oauth_state.insert({ stateId: data.stateId, accountId: pending.accountId,
      generation: pending.generation, ownerIdentity: tx.sender, sessionNonce: pending.sessionNonce,
      status: "pending", claimNonce: undefined, expiresAt: data.expiresAt, createdAt: nowMs(tx) });
    // The API's epoch milliseconds may include fractions; schedule no earlier
    // than its deadline and pass an integer to the BigInt timestamp helper.
    tx.db.calendar_oauth_expiry_job.insert({ ...at(tx, Math.ceil(data.expiresAt - nowMs(tx))), stateId: data.stateId });
    return { ok: true, message: "Continue with Google to authorize your own calendar.", authorizationUrl: data.authorizationUrl };
  });
});

function validOAuthState(tx: Tx, stateId: unknown, accountId: unknown) {
  if (typeof stateId !== "string" || typeof accountId !== "string") return null;
  const state = tx.db.calendar_oauth_state.stateId.find(stateId);
  const connection = tx.db.calendar_connection.accountId.find(accountId);
  const session = state && tx.db.account_session.identity.find(state.ownerIdentity);
  return state && connection && state.accountId === accountId && state.expiresAt > nowMs(tx) &&
    connection.generation === state.generation && connection.status === "pending" &&
    session?.accountId === accountId && session.nonce === state.sessionNonce && session.expiresAt > nowMs(tx)
    ? { state, connection } : null;
}

// Called only from service-secret-protected HTTP handlers. Claim before token
// exchange and require the one-use claim nonce on completion.
export function claimGoogleOAuth(tx: Tx, body: any) {
  const valid = validOAuthState(tx, body?.stateId, body?.accountId);
  if (!valid || valid.state.status !== "pending") throw new SenderError("Google authorization is expired or no longer current.");
  const claimNonce = newId(tx, "oauth_claim", () => false);
  tx.db.calendar_oauth_state.stateId.update({ ...valid.state, status: "claimed", claimNonce });
  return { ok: true, claimNonce };
}

export function completeGoogleOAuth(tx: Tx, body: any) {
  const valid = validOAuthState(tx, body?.stateId, body?.accountId);
  if (!valid || valid.state.status !== "claimed" || !valid.state.claimNonce || body?.claimNonce !== valid.state.claimNonce)
    throw new SenderError("Google authorization is expired or no longer current.");
  if (body.error) {
    tx.db.calendar_oauth_state.stateId.update({ ...valid.state, status: "failed", claimNonce: undefined });
    tx.db.calendar_connection.accountId.update({ ...valid.connection, status: "error", error: "Google authorization failed. Reconnect to retry.", updatedAt: nowMs(tx) });
    return { ok: true };
  }
  if (typeof body.tokenCiphertext !== "string" || body.tokenCiphertext.length < 16 || body.tokenCiphertext.length > 32000 ||
      typeof body.email !== "string" || body.email.length > 254 || !Array.isArray(body.scopes) || body.scopes.length > 30 ||
      body.scopes.some((s: any) => typeof s !== "string" || s.length > 300) ||
      body.expiresAt != null && (typeof body.expiresAt !== "number" || !Number.isFinite(body.expiresAt)))
    throw new SenderError("Invalid encrypted Google connection result.");
  tx.db.calendar_connection.accountId.update({ ...valid.connection, status: "connected", tokenCiphertext: body.tokenCiphertext,
    email: body.email || undefined, scopesJson: JSON.stringify(body.scopes), expiresAt: body.expiresAt ?? undefined,
    eventConsent: false, error: undefined, updatedAt: nowMs(tx) });
  tx.db.calendar_oauth_state.stateId.update({ ...valid.state, status: "complete", claimNonce: undefined });
  return { ok: true };
}

export const runCalendarOAuthExpiryJob = spacetimedb.procedure(
  { onSchedule: calendar_oauth_expiry_job }, { job: calendar_oauth_expiry_job.rowType }, t.unit(),
  (ctx, { job }) => {
    ctx.withTx(tx => {
      const state = tx.db.calendar_oauth_state.stateId.find(job.stateId);
      if (!state || !["pending", "claimed"].includes(state.status) || state.expiresAt > nowMs(tx)) return;
      tx.db.calendar_oauth_state.stateId.update({ ...state, status: "expired", claimNonce: undefined });
      const connection = tx.db.calendar_connection.accountId.find(state.accountId);
      if (connection?.generation === state.generation && connection.status === "pending")
        tx.db.calendar_connection.accountId.update({ ...connection, status: "error", error: "Google authorization expired. Connect again.", updatedAt: nowMs(tx) });
    });
    return {};
  },
);

export type CalendarSnapshot = { accountId: string; memberId: string; tokenCiphertext: string; generation: string; eventConsent: boolean };

export function authorizedCalendarSnapshots(db: ReadDb, groupId: string): CalendarSnapshot[] {
  return membersOf(db, groupId).flatMap(member => {
    const account = db.account.principal.find(member.identity);
    const membership = account && db.account_membership.id.find(membershipKey(account.id, groupId));
    const connection = account && db.calendar_connection.accountId.find(account.id);
    return account && membership?.memberId === member.id && connection?.status === "connected" && connection.tokenCiphertext
      ? [{ accountId: account.id, memberId: member.id, tokenCiphertext: connection.tokenCiphertext,
        generation: connection.generation, eventConsent: connection.eventConsent }] : [];
  });
}

export function persistCalendarRefresh(tx: Tx, updates: Array<{ accountId: string; tokenCiphertext: string }>, snapshots: CalendarSnapshot[]) {
  if (!Array.isArray(updates) || updates.length > snapshots.length || new Set(updates.map(u => u.accountId)).size !== updates.length)
    throw new SenderError("Invalid calendar refresh response.");
  for (const update of updates) if (!snapshots.some(s => s.accountId === update.accountId) ||
      typeof update.tokenCiphertext !== "string" || update.tokenCiphertext.length < 16 || update.tokenCiphertext.length > 32000)
    throw new SenderError("Invalid calendar refresh response.");
  // Recheck the full authorized snapshot, including event consent, before any
  // refreshed credential is committed. A disconnect/reconnect invalidates it.
  for (const snapshot of snapshots) {
    const row = tx.db.calendar_connection.accountId.find(snapshot.accountId);
    if (!row || row.status !== "connected" || row.generation !== snapshot.generation ||
        row.tokenCiphertext !== snapshot.tokenCiphertext || row.eventConsent !== snapshot.eventConsent) return false;
  }
  for (const update of updates) {
    const row = tx.db.calendar_connection.accountId.find(update.accountId)!;
    tx.db.calendar_connection.accountId.update({ ...row, tokenCiphertext: update.tokenCiphertext, updatedAt: nowMs(tx) });
  }
  return true;
}

export function calendarConnectionState(db: ReadDb, groupId: string) {
  const connected = new Map(authorizedCalendarSnapshots(db, groupId).map(row => [row.memberId, row]));
  return membersOf(db, groupId).map(member => ({ memberId: member.id, connected: connected.has(member.id), eventConsent: connected.get(member.id)?.eventConsent ?? false }));
}

export const my_connectors = spacetimedb.view({ name: "my_connectors", public: true }, t.option(t.row("MyConnectorsRow", {
  accountId: t.string().primaryKey(), messageEnabled: t.bool(), messageDestination: t.string(), messageStatus: t.string(),
  calendarStatus: t.string(), calendarEmail: t.option(t.string()), calendarEventConsent: t.bool(), calendarError: t.option(t.string()),
})), ctx => {
  const account = currentAccount(ctx.db, ctx.sender);
  if (!account) return undefined;
  const message = ctx.db.message_connector.accountId.find(account.id), calendar = ctx.db.calendar_connection.accountId.find(account.id);
  return { accountId: account.id, messageEnabled: message?.enabled ?? false, messageDestination: message?.destination ?? "",
    messageStatus: message?.enabled ? "enabled" : "disabled", calendarStatus: calendar?.status ?? "disconnected",
    calendarEmail: calendar?.email, calendarEventConsent: calendar?.eventConsent ?? false, calendarError: calendar?.error };
});

export const my_group_connectors = spacetimedb.view({ name: "my_group_connectors", public: true }, t.array(t.row("MyGroupConnectorRow", {
  memberId: t.string().primaryKey(), connected: t.bool(), eventConsent: t.bool(),
})), ctx => {
  const group = currentGroup(ctx.db, ctx.sender);
  return group ? calendarConnectionState(ctx.db, group.id) : [];
});

export function resolveAddress(tx: Tx, invitation: { fromAccountId: string; toAccountId: string }): string | null {
  const recipient = tx.db.message_connector.accountId.find(invitation.toAccountId);
  // An explicit recipient setting is authoritative, including an opt-out.
  // A sender's Contacts selection must never override it.
  if (recipient) return recipient.enabled && validMessageDestination(recipient.destination) ? recipient.destination : null;
  const sender = tx.db.account.id.find(invitation.fromAccountId);
  if (!sender || !isMacContactsOwner(tx, sender) ||
      !tx.db.account_friend.id.find(`${sender.id}:${invitation.toAccountId}`)) return null;
  const mapping = tx.db.friend_contact_destination.id.find(`${sender.id}:${invitation.toAccountId}`);
  return mapping && mapping.ownerAccountId === sender.id && mapping.friendAccountId === invitation.toAccountId &&
    validMessageDestination(mapping.destination) ? mapping.destination : null;
}

export function queueInvitationDelivery(tx: Tx, invitationId: string) {
  if (tx.db.invitation_delivery.invitationId.find(invitationId)) return;
  const invitation = tx.db.huddle_invitation.id.find(invitationId);
  if (!invitation) return;
  const destination = resolveAddress(tx, invitation);
  const queued = invitation.status === "pending" && invitation.expiresAt > nowMs(tx) && !!destination && externalEnabled(tx);
  tx.db.invitation_delivery.insert({ invitationId, status: queued ? "queued" : "in_app_only",
    error: queued ? undefined : "In-app invitation saved. Messages delivery needs a permitted linked address and host configuration.",
    destination: queued ? destination ?? undefined : undefined, message: undefined, updatedAt: nowMs(tx) });
  if (queued) tx.db.invitation_delivery_job.insert({ ...at(tx), invitationId });
}

export const sendInvitationMessage = spacetimedb.reducer({ invitationId: t.string() }, (tx, { invitationId }) => {
  const { account } = requireAccount(tx);
  const invitation = tx.db.huddle_invitation.id.find(invitationId);
  if (!invitation || invitation.fromAccountId !== account.id) throw new SenderError("Only the original sender can send this invitation message.");
  if (invitation.status !== "pending" || invitation.expiresAt <= nowMs(tx)) throw new SenderError("This invitation is no longer pending.");
  const delivery = tx.db.invitation_delivery.invitationId.find(invitationId);
  if (!delivery || !["in_app_only", "unavailable"].includes(delivery.status))
    throw new SenderError("This message is already queued/submitted or needs manual review. It cannot be resent.");
  const destination = resolveAddress(tx, invitation);
  if (!destination) throw new SenderError("No permitted Messages address is linked. A recipient's explicit opt-out cannot be overridden.");
  if (!externalEnabled(tx)) throw new SenderError("Messages delivery or the public invitation URL is not configured.");
  tx.db.invitation_delivery.invitationId.update({ ...delivery, status: "queued", destination,
    message: undefined, error: undefined, updatedAt: nowMs(tx) });
  tx.db.invitation_delivery_job.insert({ ...at(tx), invitationId });
});

export const runInvitationDeliveryJob = spacetimedb.procedure(
  { onSchedule: invitation_delivery_job }, { job: invitation_delivery_job.rowType }, t.unit(),
  (ctx, { job }) => {
    const body = ctx.withTx(tx => {
      const delivery = tx.db.invitation_delivery.invitationId.find(job.invitationId);
      if (delivery?.status === "sending") {
        tx.db.invitation_delivery.invitationId.update({ ...delivery, status: "unknown",
          error: "Submission status is unknown. Check Messages before another invitation.", updatedAt: nowMs(tx) });
        return null;
      }
      if (!delivery || delivery.status !== "queued") return null;
      const invitation = tx.db.huddle_invitation.id.find(job.invitationId);
      const destination = invitation && resolveAddress(tx, invitation);
      const from = invitation && tx.db.account.id.find(invitation.fromAccountId);
      const base = publicFrontendBase(tx.env.PUBLIC_FRONTEND_BASE_URL);
      const valid = invitation?.status === "pending" && invitation.expiresAt > nowMs(tx);
      if (!valid || !destination || delivery.destination !== destination || !base || !from || !externalEnabled(tx)) {
        tx.db.invitation_delivery.invitationId.update({ ...delivery, status: valid ? "in_app_only" : "cancelled",
          destination: undefined, error: valid ? "Messages address/permission changed or delivery is not configured. Review the in-app invitation." : "The invitation is no longer pending.", updatedAt: nowMs(tx) });
        return null;
      }
      const message = `${from.displayName} wants to hang out with Huddle! ${base}/invite/${invitation.id}`;
      // Claim before HTTP. Timeouts/process interruption must never replay a
      // potentially submitted message automatically.
      tx.db.invitation_delivery.invitationId.update({ ...delivery, status: "sending", error: undefined,
        destination, message, updatedAt: nowMs(tx) });
      tx.db.invitation_delivery_job.insert({ ...at(tx, 30_000), invitationId: invitation.id });
      return { dispatchId: invitation.id, recipient: destination, message };
    });
    if (!body) return {};
    const result = callApi(ctx, "/connectors/messages/send", body);
    ctx.withTx(tx => {
      const delivery = tx.db.invitation_delivery.invitationId.find(job.invitationId);
      if (!delivery || delivery.status !== "sending") return;
      const data = result.ok && !result.stub ? result.data : null;
      const status = data?.dispatchId === job.invitationId && ["submitted", "unavailable"].includes(data?.status) ? data.status : "unknown";
      tx.db.invitation_delivery.invitationId.update({ ...delivery, status,
        error: status === "submitted" ? undefined : status === "unavailable"
          ? "Messages was unavailable before submission. The invitation remains in Huddle."
          : "Submission status is unknown. Do not resend automatically; check Messages before another invitation.", updatedAt: nowMs(tx) });
    });
    return {};
  },
);

export const my_invitation_deliveries = spacetimedb.view({ name: "my_invitation_deliveries", public: true }, t.array(t.row("MyInvitationDeliveryRow", {
  invitationId: t.string().primaryKey(), status: t.string(), error: t.option(t.string()),
})), ctx => {
  const account = currentAccount(ctx.db, ctx.sender);
  if (!account) return [];
  const invitations = [...ctx.db.huddle_invitation.fromAccountId.filter(account.id), ...ctx.db.huddle_invitation.toAccountId.filter(account.id)];
  return invitations.flatMap(invitation => {
    const row = ctx.db.invitation_delivery.invitationId.find(invitation.id);
    return row ? [{ invitationId: row.invitationId, status: row.status, error: row.error }] : [];
  });
});
