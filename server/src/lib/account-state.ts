import { SenderError } from "spacetimedb/server";
import type { ReadDb, Tx } from "./types";

// Missing row is a legacy guest. Retained signed-out rows fail closed.
export function principalFor(db: ReadDb, sender: Tx["sender"]) {
  const session = db.account_session.identity.find(sender);
  if (!session) return sender;
  return session.accountId ? db.account.id.find(session.accountId)?.principal ?? null : null;
}

export function requireActor(tx: Tx) {
  const session = tx.db.account_session.identity.find(tx.sender);
  if (session && (!session.accountId || session.expiresAt <= Number(tx.timestamp.toMillis())))
    throw new SenderError("Sign in to your account again.");
  const principal = principalFor(tx.db, tx.sender);
  if (!principal) throw new SenderError("Sign in to your account again.");
  return principal;
}

export function requireAccount(tx: Tx) {
  requireActor(tx);
  const session = tx.db.account_session.identity.find(tx.sender);
  const account = session?.accountId && tx.db.account.id.find(session.accountId);
  if (!account || !session) throw new SenderError("Sign in to your account first.");
  return { account, session };
}

export const membershipKey = (accountId: string, groupId: string) => `${accountId}:${groupId}`;
