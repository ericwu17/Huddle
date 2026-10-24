// Disposable account fixtures on an explicitly chosen module. No real people/messages.
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

console.log(`Account smoke on ${server} / ${database}; synthetic credentials and groups.`);
const tokens = await Promise.all([identity(), identity(), identity()]);
check((await view(tokens[0], "my_account")).length === 0, "Fresh device is not an account");
check((await call(tokens[0], "register_account", [alice, password, "Alice test"]))[0], "Create account A with real password hashing");
check((await call(tokens[1], "register_account", [bob, password, "Bob test"]))[0], "Create independent account B");
const a = (await view(tokens[0], "my_account"))[0], b = (await view(tokens[1], "my_account"))[0];
check(a.username === alice && b.username === bob && a.account_id !== b.account_id, "Own account identities remain distinct");
check(!/password|principal|hash/i.test(JSON.stringify(a)), "Public account view excludes credentials and internal principal");
check(await rejected(() => view(tokens[0], "account")), "Clients cannot query the private credential table");
check(await rejected(() => view(tokens[0], "account_session")), "Clients cannot query private device bindings");
check(!(await call(tokens[2], "register_account", [alice.toUpperCase(), password, "Duplicate test"]))[0], "Duplicate usernames ignore case");
const wrong = await call(tokens[2], "login_account", [alice, `${password}-wrong`]);
const unknown = await call(tokens[2], "login_account", [`qa_x_${suffix}`, password]);
check(!wrong[0] && JSON.stringify(wrong) === JSON.stringify(unknown), "Wrong and unknown credentials fail generically");
check((await view(tokens[2], "my_account")).length === 0, "Failed login grants no account binding");

async function create(token) {
  const [groupId, code] = await call(token, "create_agent_group", [null]);
  const [memberId] = await call(token, "join_group", [code, "Untrusted name"]);
  return { groupId, code, memberId };
}
const first = await create(tokens[0]), second = await create(tokens[0]), other = await create(tokens[1]);
check((await view(tokens[0], "my_account_memberships")).length === 2, "Account A keeps both memberships");
check((await view(tokens[1], "my_account_memberships")).length === 1, "Account B sees only its membership");
check((await view(tokens[0], "my_members"))[0].name === "Alice test", "Account joins use its persisted display name");
check(await rejected(() => call(tokens[1], "select_huddle", [first.groupId])), "Foreign membership selection is rejected");
check((await view(tokens[1], "my_group"))[0].id === other.groupId, "Foreign selection cannot change active group");
await call(tokens[0], "submit_agent_prefs", ["ALICE_PRIVATE_FIXTURE under $25, burgers"]);
await call(tokens[1], "submit_agent_prefs", ["BOB_PRIVATE_FIXTURE under $20, vegetarian"]);
check((await view(tokens[0], "my_agent_needs"))[0].text.startsWith("ALICE_PRIVATE_FIXTURE"), "A reads only its private needs");
check((await view(tokens[1], "my_agent_needs"))[0].text.startsWith("BOB_PRIVATE_FIXTURE"), "B reads only its private needs");

check((await call(tokens[2], "login_account", [alice.toUpperCase(), password]))[0], "Same account logs in on a fresh device");
check((await view(tokens[2], "my_account"))[0].account_id === a.account_id, "New device resolves the stable account");
check((await view(tokens[2], "my_account_memberships")).length === 2, "New device recovers saved memberships");
await call(tokens[2], "select_huddle", [first.groupId]);
check((await view(tokens[2], "my_group"))[0].id === first.groupId, "New device explicitly opens an older huddle");
check((await view(tokens[0], "my_group"))[0].id === second.groupId, "Active huddle selection is device-local");
check((await view(tokens[2], "my_group"))[0].is_host, "Host ownership works across devices");
await call(tokens[2], "join_group", [first.code, "Another forged name"]);
check((await view(tokens[2], "my_members")).length === 1, "Rejoin from another device creates no duplicate member");

await call(tokens[0], "logout_account");
check((await view(tokens[0], "my_account")).length === 0, "Logout removes the account view for the old bearer");
check((await view(tokens[0], "my_account_memberships")).length === 0, "Logout removes memberships for the old bearer");
check((await view(tokens[0], "my_agent_needs")).length === 0, "Logout removes private needs for the old bearer");
check(await rejected(() => call(tokens[0], "create_agent_group", [null])), "Old signed-out bearer cannot create account-owned huddles");
check((await view(tokens[2], "my_account"))[0].account_id === a.account_id, "One device logout leaves another device signed in");
check((await call(tokens[0], "login_account", [bob, password]))[0], "Signed-out device can switch to B");
const after = await view(tokens[0], "my_account_memberships");
check(after.length === 1 && after[0].group_id === other.groupId, "Switching accounts exposes only B memberships");
await call(tokens[0], "select_huddle", [other.groupId]);
check((await view(tokens[0], "my_agent_needs"))[0].text.startsWith("BOB_PRIVATE_FIXTURE"), "Switching exposes only B private needs");
check(await rejected(() => call(tokens[0], "select_huddle", [second.groupId])), "A cached foreign group ID cannot restore A access");
await call(tokens[0], "logout_account"); await call(tokens[1], "logout_account"); await call(tokens[2], "logout_account");
console.log(`ALL PASS: ${checks} account checks. No contacts, invitations, model plans or real bookings created.`);
