import { Identity } from "spacetimedb";
import { SenderError, t } from "spacetimedb/server";
import spacetimedb, { account_expiry_job } from "./schema";
import { callApi } from "./lib/api";
import { at, newId, nowMs } from "./lib/util";
import { membershipKey, requireAccount } from "./lib/account-state";
import type { Proc, Tx } from "./lib/types";

const DAY = 24 * 60 * 60 * 1000;
const WINDOW = 10 * 60 * 1000;
const authResult = t.object("AccountAuthResult", { ok: t.bool(), message: t.string() });
const failure = (message: string) => ({ ok: false, message });

function attempt(tx: Tx, key: string, max: number) {
  const old = tx.db.account_auth_attempt.key.find(key);
  const row = old && nowMs(tx) - old.windowStartedAt < WINDOW ? { ...old, count: old.count + 1 }
    : { key, count: 1, windowStartedAt: nowMs(tx) };
  if (old) tx.db.account_auth_attempt.key.update(row); else tx.db.account_auth_attempt.insert(row);
  return row.count <= max;
}

function authenticate(ctx: Proc, action: "register" | "login", args: { username: string; password: string; displayName?: string }) {
  const username = args.username.trim().toLowerCase();
  const displayName = args.displayName?.trim();
  if (!/^[a-z0-9_]{3,24}$/.test(username)) return failure("Use a username with 3–24 letters, numbers or underscores.");
  if (args.password.length < 8 || args.password.length > 128) return failure("Use a password with 8–128 characters.");
  if (action === "register" && (!displayName || displayName.length > 40)) return failure("Use a display name with 1–40 characters.");
  const pending = ctx.withTx(tx => {
    const previous = tx.db.account_session.identity.find(tx.sender);
    if (previous?.accountId && previous.expiresAt > nowMs(tx)) return { error: "Sign out before switching accounts." };
    const nameAllowed = attempt(tx, `name:${username}`, 10);
    const deviceAllowed = attempt(tx, `device:${tx.sender.toHexString()}`, 20);
    if (!nameAllowed || !deviceAllowed) return { error: "Too many attempts. Try again in 10 minutes." };
    const nonce = newId(tx, "auth", () => false);
    const session = { identity: tx.sender, accountId: undefined, nonce, activeGroupId: undefined, expiresAt: 0 };
    if (previous) tx.db.account_session.identity.update(session); else tx.db.account_session.insert(session);
    const existing = tx.db.account.username.find(username);
    return { nonce, existing };
  });
  if (pending.error) return failure(pending.error);
  if (action === "register" && pending.existing) return failure("That username is unavailable.");
  const snapshot = pending.existing;
  const res = ctx.env.FASTAPI_BASE_URL ? callApi(ctx, "/accounts/credentials", {
    action, username, password: args.password,
    account: snapshot ? { id: snapshot.id, username: snapshot.username, passwordHash: snapshot.passwordHash } : null,
  }) : null;
  return ctx.withTx(tx => {
    const session = tx.db.account_session.identity.find(tx.sender);
    if (!session || session.nonce !== pending.nonce || session.accountId)
      return failure("This sign-in attempt was superseded. Try again.");
    if (!res?.ok || res.stub) return failure("Account service is unavailable. Please retry.");
    if (res.data.authenticated !== true) return failure("Invalid username or password.");
    if (typeof res.data.passwordHash !== "string" || !res.data.passwordHash.startsWith("$argon2id$") || res.data.passwordHash.length > 500)
      return failure("Account service returned an invalid result. Please retry.");
    let account = tx.db.account.username.find(username);
    if (action === "register") {
      if (account) return failure("That username is unavailable.");
      if (typeof res.data.principalHex !== "string" || !/^[0-9a-f]{64}$/.test(res.data.principalHex))
        return failure("Account service returned an invalid result. Please retry.");
      account = tx.db.account.insert({ id: newId(tx, "a", id => !!tx.db.account.id.find(id)), username,
        displayName: displayName!, principal: Identity.fromString(res.data.principalHex),
        passwordHash: res.data.passwordHash, createdAt: nowMs(tx) });
    } else {
      if (!account || account.id !== snapshot?.id || account.passwordHash !== snapshot.passwordHash)
        return failure("Account changed during sign-in. Please retry.");
      if (res.data.passwordHash !== account.passwordHash) {
        account = { ...account, passwordHash: res.data.passwordHash };
        tx.db.account.id.update(account);
      }
    }
    tx.db.account_session.identity.update({ ...session, accountId: account.id, expiresAt: nowMs(tx) + DAY });
    tx.db.account_expiry_job.insert({ ...at(tx, DAY), identity: tx.sender, nonce: session.nonce });
    return { ok: true, message: action === "register" ? "Account created." : "Signed in." };
  });
}

export const registerAccount = spacetimedb.procedure(
  { username: t.string(), password: t.string(), displayName: t.string() }, authResult,
  (ctx, args) => authenticate(ctx, "register", args),
);
export const loginAccount = spacetimedb.procedure(
  { username: t.string(), password: t.string() }, authResult,
  (ctx, args) => authenticate(ctx, "login", args),
);
export const logoutAccount = spacetimedb.reducer({}, tx => {
  const session = tx.db.account_session.identity.find(tx.sender);
  if (session) tx.db.account_session.identity.update({ ...session, accountId: undefined,
    activeGroupId: undefined, expiresAt: 0, nonce: newId(tx, "logout", () => false) });
});
export const runAccountExpiryJob = spacetimedb.procedure(
  { onSchedule: account_expiry_job }, { job: account_expiry_job.rowType }, t.unit(),
  (ctx, { job }) => {
    ctx.withTx(tx => {
      const session = tx.db.account_session.identity.find(job.identity);
      if (session?.nonce === job.nonce && session.expiresAt <= nowMs(tx))
        tx.db.account_session.identity.update({ ...session, accountId: undefined, activeGroupId: undefined, expiresAt: 0 });
    });
    return {};
  },
);
export const selectHuddle = spacetimedb.reducer({ groupId: t.string() }, (tx, { groupId }) => {
  const { account, session } = requireAccount(tx);
  const membership = tx.db.account_membership.id.find(membershipKey(account.id, groupId));
  const member = membership && tx.db.member.id.find(membership.memberId);
  if (!member || member.groupId !== groupId || !member.identity.isEqual(account.principal))
    throw new SenderError("This account is not a member of that huddle.");
  tx.db.account_session.identity.update({ ...session, activeGroupId: groupId });
});

export const my_account = spacetimedb.view({ name: "my_account", public: true }, t.option(t.row("MyAccountRow", {
  accountId: t.string().primaryKey(), username: t.string(), displayName: t.string(),
  activeGroupId: t.option(t.string()), expiresAt: t.f64(),
})), ctx => {
  const session = ctx.db.account_session.identity.find(ctx.sender);
  const account = session?.accountId && ctx.db.account.id.find(session.accountId);
  return account && session ? { accountId: account.id, username: account.username, displayName: account.displayName,
    activeGroupId: session.activeGroupId, expiresAt: session.expiresAt } : undefined;
});
export const my_account_memberships = spacetimedb.view({ name: "my_account_memberships", public: true }, t.array(t.row("MyAccountMembershipRow", {
  id: t.string().primaryKey(), groupId: t.string(), code: t.string(), memberId: t.string(),
  name: t.string(), role: t.string(), status: t.string(), date: t.string(),
})), ctx => {
  const session = ctx.db.account_session.identity.find(ctx.sender);
  const account = session?.accountId && ctx.db.account.id.find(session.accountId);
  if (!account) return [];
  return Array.from(ctx.db.account_membership.accountId.filter(account.id)).flatMap(m => {
    const group = ctx.db.group.id.find(m.groupId);
    const member = ctx.db.member.id.find(m.memberId);
    return group && member?.identity.isEqual(account.principal) ? [{ ...m, code: group.code,
      name: member.name, status: group.status, date: group.date }] : [];
  });
});
