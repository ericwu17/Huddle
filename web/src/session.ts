// Per-group member session, kept in localStorage. Hackathon-grade auth
// (docs/CONTRACT.md S5.5): the SpacetimeDB token is the phone's identity, and
// the module works out the caller's member from it, so no call sends a secret.

export type Session = {
  groupId: string;
  code: string;
  memberId: string;
  name: string;
};

const key = (groupId: string) => `huddle:session:${groupId}`;
const TOKEN_KEY = "huddle:spacetimedb-token";

export function getSession(groupId: string): Session | null {
  try {
    const raw = localStorage.getItem(key(groupId));
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session) {
  try {
    localStorage.setItem(key(session.groupId), JSON.stringify(session));
  } catch {
    // Private mode or blocked storage: the session lasts only this page load.
  }
}

export function clearSession(groupId: string) {
  try {
    localStorage.removeItem(key(groupId));
  } catch {
    // ignore
  }
}

export function loadToken(): string | undefined {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function saveToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Blocked storage: this phone gets a new identity on every reload.
  }
}

// A full reload follows account transitions, clearing all subscribed React state.
export function clearAccountBrowserState(dropToken: boolean) {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith("huddle:session:"));
    for (const k of keys) localStorage.removeItem(k);
    for (const k of Object.keys(sessionStorage).filter(k => k.startsWith("huddle:draft:"))) sessionStorage.removeItem(k);
    if (dropToken) localStorage.removeItem(TOKEN_KEY);
  } catch { /* Storage can be disabled; the full account transition still reloads. */ }
}
