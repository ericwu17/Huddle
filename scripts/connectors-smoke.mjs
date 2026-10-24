// Isolated connector wiring only: no Google login, calendar writes or Messages sends.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const server = process.env.SPACETIMEDB_URI;
const database = process.env.SPACETIMEDB_DB;
const api = process.env.FASTAPI_BASE_URL;
const frontend = process.env.PUBLIC_FRONTEND_BASE_URL;
if (!server || !database || !api || !frontend) throw new Error("Set the four explicit public preview targets.");
const base = `${server.replace(/\/$/, "")}/v1/database/${database}`;
let checks = 0;
function check(value, label) { assert.ok(value, label); checks++; console.log(`PASS ${label}`); }
async function call(token, name, args = []) {
  const r = await fetch(`${base}/call/${name}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}
async function view(token, name) {
  const r = await fetch(`${base}/sql`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: `SELECT * FROM ${name}` });
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  return (await r.json())[0].rows;
}
const identity = await fetch(`${server}/v1/identity`, { method: "POST" });
assert.ok(identity.ok);
const { token } = await identity.json();
const registered = await call(token, "register_account", [`connector_${Date.now().toString(36)}`, `QA-${randomUUID()}`, "Connector synthetic test"]);
check(registered[0], "Synthetic account registers against the explicit preview");
try {
  const configured = await call(token, "connector_status");
  check(configured[0], "API reports Google OAuth configured through Maincloud");
  check(configured.every(value => typeof value === "boolean"), "Connector readiness exposes booleans only");
  const settings = (await view(token, "my_connectors"))[0];
  check(settings && settings[1] === false && settings[4] === "disconnected" && settings[6] === false, "Messages and event consent default off; Calendar starts disconnected");
  let denied = false;
  try { await view(token, "calendar_connection"); } catch { denied = true; }
  check(denied, "Encrypted credential table remains private");
  const started = await call(token, "start_google_calendar");
  check(started[0] === true && started[2][0] === 0, "Owner starts a pending OAuth connection");
  const authorization = new URL(started[2][1]);
  check(authorization.origin === "https://accounts.google.com", "Authorization URL uses Google");
  check(authorization.searchParams.get("redirect_uri") === `${api}/connectors/google/callback`, "OAuth callback matches this API tunnel exactly");
  check(authorization.searchParams.get("code_challenge_method") === "S256" && !!authorization.searchParams.get("code_challenge"), "OAuth request uses PKCE");
  const state = authorization.searchParams.get("state");
  assert.ok(state);
  const callback = new URL(`${api}/connectors/google/callback`);
  callback.searchParams.set("state", state);
  callback.searchParams.set("error", "access_denied");
  // A denied authorization never reaches Google's token endpoint.
  const declined = await fetch(callback, { redirect: "manual" });
  check(declined.status === 303 && declined.headers.get("location") === `${frontend}/connectors?google=failed`, "Denied consent completes the protected callback and returns to this frontend");
  check(declined.headers.get("referrer-policy") === "no-referrer", "Callback does not forward OAuth state through referrers");
  const after = (await view(token, "my_connectors"))[0];
  check(after[4] === "error" && after[6] === false, "Denied consent never becomes a connected or event-authorized account");
  const replay = await fetch(callback, { redirect: "manual" });
  check(replay.status >= 400, "Consumed callback state cannot be replayed");
  await call(token, "disconnect_google_calendar");
  check((await view(token, "my_connectors"))[0][4] === "disconnected", "Owner can clear the failed connection");
} finally { await call(token, "logout_account"); }
console.log(`ALL PASS: ${checks} checks. No Google authorization, events or Messages sends occurred.`);
