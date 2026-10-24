// A designated host may search matching Mac Contacts and explicitly link one
// address to an accepted Huddle friend. The address book is never persisted.
import { SenderError, t } from "spacetimedb/server";
import spacetimedb from "./schema";
import { requireAccount } from "./lib/account-state";
import { callApi } from "./lib/api";
import { nowMs } from "./lib/util";
import type { Tx } from "./lib/types";

export function isMacContactsOwner(ctx: Pick<Tx, "env">, account: { username: string }) {
  const designated = ctx.env.MAC_CONTACTS_OWNER_USERNAME?.trim().toLowerCase();
  return !!designated && account.username === designated;
}

function requireMacContactsOwner(tx: Tx) {
  const owner = requireAccount(tx);
  if (!isMacContactsOwner(tx, owner.account)) throw new SenderError("Only the designated Mac Contacts owner can use this connector.");
  return owner;
}

export function validMessageDestination(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 &&
    (/^\+[1-9]\d{7,14}$/.test(value) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

const destinationType = t.object("MacContactDestination", { value: t.string(), label: t.string(), kind: t.string() });
const contactType = t.object("MacContactMatch", { contactId: t.string(), displayName: t.string(), destinations: t.array(destinationType) });
const searchResult = t.object("MacContactsSearchResult", {
  ok: t.bool(), message: t.string(), contacts: t.array(contactType), truncated: t.bool(),
});
const failedSearch = () => ({ ok: false, message: "Mac Contacts could not be searched. Check host setup and Contacts permission, then retry.", contacts: [], truncated: false });

function validContacts(value: any): boolean {
  return !!value && typeof value.truncated === "boolean" && Array.isArray(value.contacts) && value.contacts.length <= 10 &&
    new Set(value.contacts.map((c: any) => c?.contactId)).size === value.contacts.length && value.contacts.every((c: any) =>
      c && typeof c.contactId === "string" && c.contactId.length > 0 && c.contactId.length <= 512 &&
      typeof c.displayName === "string" && c.displayName.length <= 200 && Array.isArray(c.destinations) && c.destinations.length <= 12 &&
      c.destinations.every((d: any) => d && typeof d.label === "string" && d.label.length <= 80 && validMessageDestination(d.value) &&
        (d.kind === "phone" && /^\+[1-9]\d{7,14}$/.test(d.value) || d.kind === "email" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.value))));
}

export const searchMacContacts = spacetimedb.procedure({ query: t.string() }, searchResult, (ctx, args) => {
  const query = args.query.trim();
  if (query.length < 2 || query.length > 80 || /[\u0000-\u001f\u007f]/.test(query)) throw new SenderError("Search a contact name using 2–80 characters.");
  const snapshot = ctx.withTx(tx => {
    const { account, session } = requireMacContactsOwner(tx);
    return { accountId: account.id, nonce: session.nonce };
  });
  const result = ctx.env.FASTAPI_BASE_URL ? callApi(ctx, "/connectors/contacts/search", { query }) : null;
  return ctx.withTx(tx => {
    const { account, session } = requireMacContactsOwner(tx);
    if (account.id !== snapshot.accountId || session.nonce !== snapshot.nonce)
      throw new SenderError("Your account changed. Search Contacts again.");
    const data = result?.ok && !result.stub ? result.data : null;
    if (!validContacts(data)) return failedSearch();
    // Project only the bounded contract. Unexpected provider fields, including
    // other contact properties, never leave the service boundary.
    return { ok: true, message: data.contacts.length ? "Choose the intended contact and address, then link it to your friend." : "No matching contacts were found.",
      contacts: data.contacts.map((c: any) => ({ contactId: c.contactId, displayName: c.displayName,
        destinations: c.destinations.map((d: any) => ({ value: d.value, label: d.label, kind: d.kind })) })), truncated: data.truncated };
  });
});

function requireFriend(tx: Tx, accountId: string, friendAccountId: string) {
  if (!tx.db.account_friend.id.find(`${accountId}:${friendAccountId}`) || !tx.db.account.id.find(friendAccountId))
    throw new SenderError("Link a contact only to someone in your accepted friends list.");
}

function suppressQueuedContactInvitations(tx: Tx, ownerAccountId: string, friendAccountId: string) {
  for (const invitation of tx.db.huddle_invitation.fromAccountId.filter(ownerAccountId)) {
    if (invitation.toAccountId !== friendAccountId) continue;
    const delivery = tx.db.invitation_delivery.invitationId.find(invitation.id);
    if (delivery?.status === "queued") tx.db.invitation_delivery.invitationId.update({ ...delivery, status: "in_app_only",
      destination: undefined, error: "The linked contact changed. Review the invitation before explicitly sending a message.", updatedAt: nowMs(tx) });
  }
}

export const saveFriendContact = spacetimedb.reducer({ friendAccountId: t.string(), contactId: t.string(), contactName: t.string(), destination: t.string() }, (tx, args) => {
  const { account } = requireMacContactsOwner(tx);
  requireFriend(tx, account.id, args.friendAccountId);
  const contactId = args.contactId.trim(), contactName = args.contactName.trim(), destination = args.destination.trim();
  if (!contactId || contactId.length > 512 || contactName.length > 200 || !validMessageDestination(destination))
    throw new SenderError("Choose a valid contact and its international phone number or email address.");
  const id = `${account.id}:${args.friendAccountId}`;
  const old = tx.db.friend_contact_destination.id.find(id);
  const row = { id, ownerAccountId: account.id, friendAccountId: args.friendAccountId,
    contactId, contactName, destination, updatedAt: nowMs(tx) };
  if (old) tx.db.friend_contact_destination.id.update(row); else tx.db.friend_contact_destination.insert(row);
  if (old && (old.contactId !== contactId || old.destination !== destination)) suppressQueuedContactInvitations(tx, account.id, args.friendAccountId);
});

export const clearFriendContact = spacetimedb.reducer({ friendAccountId: t.string() }, (tx, { friendAccountId }) => {
  const { account } = requireMacContactsOwner(tx);
  requireFriend(tx, account.id, friendAccountId);
  tx.db.friend_contact_destination.id.delete(`${account.id}:${friendAccountId}`);
  suppressQueuedContactInvitations(tx, account.id, friendAccountId);
});

export const my_friend_contact_destinations = spacetimedb.view({ name: "my_friend_contact_destinations", public: true }, t.array(t.row("MyFriendContactDestinationRow", {
  friendAccountId: t.string().primaryKey(), contactId: t.string(), contactName: t.string(), destination: t.string(),
})), ctx => {
  const session = ctx.db.account_session.identity.find(ctx.sender);
  const account = session?.accountId && ctx.db.account.id.find(session.accountId);
  if (!account) return [];
  return Array.from(ctx.db.friend_contact_destination.ownerAccountId.filter(account.id)).map(row => ({
    friendAccountId: row.friendAccountId, contactId: row.contactId, contactName: row.contactName, destination: row.destination,
  }));
});
