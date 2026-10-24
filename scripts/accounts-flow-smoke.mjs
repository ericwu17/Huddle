// Connected branch acceptance: synthetic accounts only, real Claude planning,
// and an explicitly simulated booking. Never sends SMS/email or restaurant calls.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const server = process.env.SPACETIMEDB_URI;
const database = process.env.SPACETIMEDB_DB;
if (!server || !database) throw new Error("Set explicit SPACETIMEDB_URI and SPACETIMEDB_DB.");
const base = `${server.replace(/\/$/, "")}/v1/database/${database}`;
const suffix = Date.now().toString(36);
const password = `QA-${randomUUID()}`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let checks = 0;
function check(ok, label) { assert.ok(ok, label); checks++; console.log(`PASS ${label}`); }
async function rejects(label, action) { let denied = false; try { await action(); } catch { denied = true; } check(denied, label); }
async function identity() {
  const r = await fetch(`${server}/v1/identity`, { method: "POST" });
  assert.ok(r.ok, `Identity service HTTP ${r.status}`);
  return { token: (await r.json()).token };
}
async function call(user, name, args = []) {
  const r = await fetch(`${base}/call/${name}`, { method: "POST", headers: {
    Authorization: `Bearer ${user.token}`, "Content-Type": "application/json",
  }, body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  const text = await r.text(); return text ? JSON.parse(text) : null;
}
const unopt = v => Array.isArray(v) && v.length === 2 && (v[0] === 0 || v[0] === 1) &&
  (v[0] === 1 ? Array.isArray(v[1]) && !v[1].length : true) ? v[0] === 0 ? v[1] : null : v;
async function view(user, name) {
  const r = await fetch(`${base}/sql`, { method: "POST", headers: { Authorization: `Bearer ${user.token}` }, body: `SELECT * FROM ${name}` });
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  const tables = await r.json();
  const names = tables[0].schema.elements.map(c => c.name.some);
  return tables[0].rows.map(row => Object.fromEntries(names.map((name, i) => [name, unopt(row[i])])));
}
async function until(label, read, timeout = 50000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { const value = await read(); if (value) return value; await sleep(500); }
  throw new Error(`Timed out: ${label}`);
}
const structured = (budget = null, duration = null, extra = {}) => ({ budgetMaxPerPerson: budget,
  maxOutingMinutes: duration, dietary: [], allergies: [], maxTravelMinutes: null, ...extra });
async function save(user, hard, text = "") {
  await call(user, "save_agent_preferences", [text, JSON.stringify(hard)]);
  return until("saved private needs", async () => {
    const own = (await view(user, "my_agent_needs"))[0];
    if (own?.error) throw new Error(own.error);
    return own?.result_json ? { ...own, result: JSON.parse(own.result_json) } : null;
  });
}

console.log(`Account + friends + invitation + preferences smoke: ${server} / ${database}. Synthetic people; no external messages/calls.`);
const users = await Promise.all([identity(), identity(), identity()]);
for (let i = 0; i < users.length; i++) {
  users[i].username = `flow_${i}_${suffix}`;
  check((await call(users[i], "register_account", [users[i].username, password, ["Max QA", "Friend QA", "Outsider QA"][i]]))[0], `Register independent account ${i + 1}`);
  users[i].account = (await view(users[i], "my_account"))[0];
}
const [host, friend, outsider] = users;
const context = { version: 1, preferences: "PRIVATE_SAVED_CONTEXT burgers and a walk", dietary: [], allergies: [],
  budgetMaxPerPerson: 30, maxOutingMinutes: 240, maxTravelMinutes: null };
await call(host, "save_account_context", [JSON.stringify(context)]);
check((await view(host, "my_account_context"))[0].context_json.includes("PRIVATE_SAVED_CONTEXT"), "Saved context persists in owner-scoped Maincloud view");
check(!(await view(friend, "my_account_context")).length, "Other account cannot see saved context");
await rejects("Private context table is not queryable", () => view(outsider, "account_context"));
await call(host, "request_friend", [friend.username.toUpperCase()]);
const request = (await view(friend, "my_friend_requests")).find(r => r.direction === "incoming" && r.status === "pending");
check(!!request, "Friend request reaches recipient inbox");
await rejects("Outsider cannot accept another person's friend request", () => call(outsider, "respond_friend_request", [request.id, true]));
await call(friend, "respond_friend_request", [request.id, true]);
check((await view(host, "my_friends")).some(f => f.account_id === friend.account.account_id) &&
  (await view(friend, "my_friends")).some(f => f.account_id === host.account.account_id), "Accepted friendship is reciprocal");
check(!(await view(outsider, "my_friends")).length && !(await view(outsider, "my_friend_requests")).length, "Friend network is account-scoped");
const [groupId, code] = await call(host, "create_agent_group", [null]);
await call(host, "join_group", [code, "Untrusted display name"]);
await rejects("Account huddle cannot be joined by guessed code", () => call(outsider, "join_group", [code, "Outsider"]));
await call(host, "invite_friends", [groupId, [friend.account.account_id]]);
await call(host, "invite_friends", [groupId, [friend.account.account_id]]);
const invitations = (await view(friend, "my_huddle_invitations")).filter(i => i.group_id === groupId && i.status === "pending");
check(invitations.length === 1, "Repeated Invite friends creates one pending invitation");
const invite = invitations[0];
check(invite.message.includes("Max QA") && invite.path === `/invite/${invite.id}`, "Invitation notification contains host message and opening link");
check(!(await view(outsider, "my_huddle_invitations")).length, "Outsider cannot read invitation message");
await rejects("Invitation link cannot grant outsider membership", () => call(outsider, "respond_huddle_invitation", [invite.id, true]));
await call(friend, "respond_huddle_invitation", [invite.id, true]);
await call(friend, "respond_huddle_invitation", [invite.id, true]);
check((await view(friend, "my_account_memberships")).filter(m => m.group_id === groupId).length === 1, "Repeated acceptance recovers one durable membership");
check((await view(friend, "my_members")).length === 2 && (await view(friend, "my_members")).every(m => !m.ready), "Acceptance joins selected huddle but does not infer readiness");
check(!(await view(outsider, "my_members")).length, "Outsider cannot read huddle participants");
const hostNeeds = await save(host, structured(30, 240));
const friendNeeds = await save(friend, structured(25, 240, { dietary: ["vegetarian"] }));
check(hostNeeds.confirmed && friendNeeds.confirmed, "Blank optional prompts save & ready without extraction or second confirmation");
check((await view(host, "my_group"))[0].status === "eliciting", "Save & ready replaces separate lobby readiness");
check(JSON.parse((await view(host, "my_private"))[0].hard_json).budgetMaxPerPerson === 30, "Slider sets private cumulative budget directly");
check(!JSON.stringify(await view(host, "my_agent_session")).includes("budgetMaxPerPerson"), "Shared readiness does not expose budgets");
check((await view(host, "my_agent_needs"))[0].member_id !== (await view(friend, "my_agent_needs"))[0].member_id, "Each participant sees only own private submission");
await rejects("Non-host cannot start planning", () => call(friend, "find_agent_plans"));
await call(host, "find_agent_plans");
const current = await until("Claude plans", async () => {
  const state = (await view(host, "my_agent_session"))[0];
  if (state.error) throw new Error(state.error);
  if (!["ready", "blocked"].includes(state.status)) return null;
  const run = (await view(host, "my_plan_runs")).find(r => r.run_id === state.active_run_id);
  return run?.result_json ? { runId: run.run_id, result: JSON.parse(run.result_json) } : null;
});
check(current.result.plans.length > 0, "Real Claude returns validated catalog choices");
const mins = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
check(current.result.plans.every(p => p.costPerPerson === p.stops.reduce((sum, s) => sum + s.costPerPerson, 0) && p.costPerPerson <= 25), "Every cumulative total equals stop costs and fits every cap");
check(current.result.plans.every(p => mins(p.stops.at(-1).end) - mins(p.stops[0].start) <= 240), "Plans fit whole-outing duration including gaps/travel");
check(!JSON.stringify(current.result).includes("PRIVATE_SAVED_CONTEXT"), "Public result does not leak saved profile context");
const plan = current.result.plans.find(p => p.id === current.result.recommendedPlanId);
await call(host, "vote", [current.runId, plan.id]);
const bookingArgs = [current.runId, plan.id, plan.stops.findIndex(s => s.category === "meal")];
await rejects("Booking waits for every participant's vote", () => call(host, "start_booking", bookingArgs));
await call(friend, "vote", [current.runId, plan.id]);
await call(host, "start_booking", bookingArgs);
await until("simulated booking", async () => (await view(host, "my_bookings")).some(b => b.run_id === current.runId && b.status === "confirmed"));
check(true, "Explicit host booking reaches simulated confirmation; no restaurant called");
await rejects("Duplicate booking is rejected", () => call(host, "start_booking", bookingArgs));
await save(friend, structured(12, 240, { dietary: ["vegetarian"] }));
check(!(await view(host, "my_votes")).length, "Budget edit immediately clears usable old votes");
await rejects("Old plan cannot receive a vote", () => call(host, "vote", [current.runId, plan.id]));
await rejects("Old plan cannot be spun", () => call(host, "do_roulette", [current.runId]));
await rejects("Old plan cannot be booked", () => call(host, "start_booking", bookingArgs));
const retained = await save(friend, structured(null, 240, { dietary: ["vegetarian"] }));
check(retained.result.hard.budgetMaxPerPerson === 12, "Flexible later edit cannot erase established cumulative cap");
const raised = await save(friend, structured(40, 240, { dietary: ["vegetarian"] }));
check(raised.result.hard.budgetMaxPerPerson === 12, "Slider cannot raise established cap without private offer acceptance");
const allergic = await save(friend, structured(12, 240, { dietary: ["vegetarian"], allergies: ["peanut"] }));
check(allergic.confirmed && !allergic.result.questions.length, "Known allergy is saved & ready without redundant question");
await call(host, "find_agent_plans");
const evidence = await until("venue evidence state", async () => {
  const state = (await view(host, "my_agent_session"))[0];
  if (state.error) throw new Error(state.error);
  if (state.status !== "blocked") return null;
  const run = (await view(host, "my_plan_runs")).find(r => r.run_id === state.active_run_id);
  return run?.result_json ? JSON.parse(run.result_json) : null;
});
check(!evidence.plans.length && evidence.conflicts.length > 0, "Missing allergy evidence cannot become a selectable food plan");
await call(host, "clear_account_context");
check(!(await view(host, "my_account_context")).length, "Owner can clear saved context");
await call(host, "logout_account");
check(!(await view(host, "my_friends")).length && !(await view(host, "my_huddle_invitations")).length, "Logout revokes friends and inbox views for old bearer");
for (const user of [friend, outsider]) await call(user, "logout_account");
console.log(`ALL PASS: ${checks} checks. Synthetic huddle ${groupId}. Profile/friends/invites remain only in selected test DB; all sessions signed out.`);
