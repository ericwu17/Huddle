// Connected naming checks with synthetic accounts, no messages or model calls.
import { randomUUID } from "node:crypto";

const server = process.env.SPACETIMEDB_URI;
const database = process.env.SPACETIMEDB_DB;
if (!server || !database) throw new Error("Set an explicit SPACETIMEDB_URI and SPACETIMEDB_DB.");
const base = `${server.replace(/\/$/, "")}/v1/database/${database}`;
const suffix = Date.now().toString(36);
const alice = `qa_a_${suffix}`, bob = `qa_b_${suffix}`;
const password = `Synthetic-${randomUUID()}`;
let checks = 0;
function check(ok, label) {
  if (!ok) throw new Error(`FAIL ${label}`);
  checks++;
  console.log(`PASS ${label}`);
}
async function identity() {
  const response = await fetch(`${server}/v1/identity`, { method: "POST" });
  if (!response.ok) throw new Error(`Identity service HTTP ${response.status}`);
  return (await response.json()).token;
}
async function call(token, name, args = []) {
  const response = await fetch(`${base}/call/${name}`, { method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(args) });
  if (!response.ok) throw new Error(`${name} rejected (HTTP ${response.status})`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
const unopt = value => Array.isArray(value) && value.length === 2 && (value[0] === 0 || value[0] === 1)
  ? value[0] === 0 ? value[1] : null : value;
async function view(token, name) {
  const response = await fetch(`${base}/sql`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: `SELECT * FROM ${name}` });
  if (!response.ok) throw new Error(`${name} rejected (HTTP ${response.status})`);
  const results = await response.json();
  const columns = results[0].schema.elements.map(c => c.name.some);
  return results[0].rows.map(row => Object.fromEntries(columns.map((col, i) => [col, unopt(row[i])])));
}
async function rejected(fn) { try { await fn(); return false; } catch { return true; } }

const tokens = await Promise.all([identity(), identity(), identity(), identity()]);
console.log(`Naming smoke on ${server} / ${database}; synthetic accounts only.`);
try {
  check((await call(tokens[0], "register_account", [alice, password, "Naming host"]))[0], "Register host");
  check((await call(tokens[1], "register_account", [bob, password, "Naming friend"]))[0], "Register friend");
  await call(tokens[0], "request_friend", [bob]);
  const request = (await view(tokens[1], "my_friend_requests")).find(row => row.status === "pending");
  await call(tokens[1], "respond_friend_request", [request.id, true]);
  const friend = (await view(tokens[1], "my_account"))[0];
  const args = [randomUUID(), "PRIVATE_PROMPT_NEVER_PUBLIC", "hangout", [friend.account_id], "  Friday   night bites 🍔  "];
  const first = await call(tokens[0], "create_named_invitation_huddle", args);
  const [groupId] = first;
  check(JSON.stringify(await call(tokens[0], "create_named_invitation_huddle", [...args.slice(0, 4), "Friday night bites 🍔"])) === JSON.stringify(first), "Retry recovers one Huddle");
  check((await view(tokens[0], "my_account_memberships")).length === 1, "One membership after repeated creation");
  check((await view(tokens[0], "my_huddle_names"))[0]?.name === "Friday night bites 🍔", "Name is normalized and stored");
  check((await view(tokens[0], "my_account_memberships"))[0]?.name === "Naming host", "Member display name stays separate");
  check((await view(tokens[1], "my_huddle_names")).length === 0, "Unjoined friend cannot list the Huddle");
  check((await view(tokens[2], "my_huddle_names")).length === 0, "Outsider cannot list names");
  const invitation = (await view(tokens[1], "my_huddle_invitations")).find(row => row.group_id === groupId);
  check(invitation.group_name === "Friday night bites 🍔", "Invitation carries Huddle name");
  check(!JSON.stringify(invitation).includes("PRIVATE_PROMPT"), "Name does not expose private summary");
  await call(tokens[1], "respond_huddle_invitation", [invitation.id, true]);
  check((await view(tokens[1], "my_huddle_names")).some(row => row.group_id === groupId && row.name === "Friday night bites 🍔"), "Joined friend sees the same name");
  check(await rejected(() => call(tokens[0], "create_named_invitation_huddle", [...args.slice(0, 4), "Changed name"])), "Changed retry cannot overwrite or duplicate a Huddle");
  for (const invalid of ["   ", "x".repeat(81), "Dinner\u0000crew"])
    check(await rejected(() => call(tokens[0], "create_named_invitation_huddle", [randomUUID(), "", "hangout", [], invalid])), "Invalid name is rejected");
  check((await view(tokens[0], "my_account_memberships")).length === 1, "Rejected names create nothing");
  check((await call(tokens[3], "login_account", [alice, password]))[0], "Same account logs in on a fresh device");
  check((await view(tokens[3], "my_huddle_names"))[0]?.name === "Friday night bites 🍔", "Name persists across devices");
  const legacy = await call(tokens[0], "create_invitation_huddle", [randomUUID(), "PRIVATE_OLD_SUMMARY", "hangout", []]);
  check(legacy.length === 3, "Original four-argument start contract remains compatible");
  check((await view(tokens[0], "my_huddle_names")).find(row => row.group_id === legacy[0])?.name === "A Huddle with friends", "Skipping a name keeps the default");
  const [guestId, guestCode] = await call(tokens[2], "create_agent_group", [[0, "Guest adventure"]]);
  await call(tokens[2], "join_group", [guestCode, "Riley"]);
  check((await view(tokens[2], "my_huddle_names"))[0]?.name === "Guest adventure", "Guest flow keeps its explicit name");
  check(!(await view(tokens[0], "my_huddle_names")).some(row => row.group_id === guestId), "Guest name is absent from another account");
  await call(tokens[0], "logout_account");
  check((await view(tokens[0], "my_huddle_names")).length === 0, "Logout hides saved names");
  await call(tokens[3], "remove_huddle", [groupId]);
  check(!(await view(tokens[3], "my_huddle_names")).some(row => row.group_id === groupId), "List removal hides only the owner's name entry");
  check((await view(tokens[1], "my_huddle_names")).some(row => row.group_id === groupId), "Friend keeps the name after host list removal");
  console.log(`ALL PASS: ${checks} naming checks; no real people, messages, plans or bookings.`);
} finally {
  for (const index of [0, 1, 3]) await call(tokens[index], "logout_account").catch(() => {});
}
