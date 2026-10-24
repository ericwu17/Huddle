// Connected coordinator smoke. Synthetic people, real Claude through Maincloud.
// Creates disposable groups/bookings; never makes a phone call. Use an explicit
// test module first. The Python check_live.py --agent helper loads the secret.
import assert from "node:assert/strict";

const base = process.env.SPACETIMEDB_URI;
const database = process.env.SPACETIMEDB_DB;
const secret = process.env.HUDDLE_SHARED_SECRET;
if (!base || !database || !secret) throw new Error("Set SPACETIMEDB_URI, SPACETIMEDB_DB and HUDDLE_SHARED_SECRET privately.");
const D = `${base.replace(/\/$/, "")}/v1/database/${database}`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let checks = 0;
function check(label, condition) { assert.ok(condition, label); console.log(`PASS ${label}`); checks++; }
async function rejects(label, action) {
  let rejected = false;
  try { await action(); } catch { rejected = true; }
  check(label, rejected);
}
async function phone() {
  const r = await fetch(`${base}/v1/identity`, { method: "POST" });
  assert.ok(r.ok, `identity HTTP ${r.status}`);
  return { token: (await r.json()).token, memberId: "" };
}
async function call(user, fn, args) {
  const r = await fetch(`${D}/call/${fn}`, { method: "POST", headers: {
    Authorization: `Bearer ${user.token}`, "Content-Type": "application/json",
  }, body: JSON.stringify(args) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${fn}: HTTP ${r.status} ${text.slice(0, 250)}`);
  return text ? JSON.parse(text) : null;
}
const unopt = v => Array.isArray(v) && v.length === 2 && (v[0] === 0 || v[0] === 1) &&
  (v[0] === 1 ? Array.isArray(v[1]) && v[1].length === 0 : true) ? v[0] === 0 ? v[1] : null : v;
async function view(user, name) {
  const r = await fetch(`${D}/sql`, { method: "POST", headers: { Authorization: `Bearer ${user.token}` }, body: `SELECT * FROM ${name}` });
  assert.ok(r.ok, `${name}: HTTP ${r.status}`);
  const tables = await r.json();
  const columns = tables[0].schema.elements.map(e => e.name.some);
  return tables[0].rows.map(row => Object.fromEntries(columns.map((c, i) => [c, unopt(row[i])])));
}
async function until(label, action, timeout = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await action();
    if (result) return result;
    await sleep(500);
  }
  throw new Error(`Timed out: ${label}`);
}

console.log(`Coordinator smoke on ${base} / ${database} (synthetic participants; scripted booking)`);
if (process.env.FASTAPI_BASE_URL) {
  const url = process.env.FASTAPI_BASE_URL;
  check("API rejects missing secret", (await fetch(`${url}/health`)).status === 401);
  check("API rejects wrong secret", (await fetch(`${url}/health`, { headers: { "X-Huddle-Secret": "incorrect-test-secret" } })).status === 401);
  const h = await fetch(`${url}/health`, { headers: { "X-Huddle-Secret": secret } });
  const body = await h.json();
  check("Real API has the 45-place catalog", h.ok && body.ok && body.stub === false && body.placesLoaded === 45);
}

const users = await Promise.all([phone(), phone(), phone()]);
const [groupId, code] = await call(users[0], "create_agent_group", [{ none: [] }]);
check("create coordinator huddle", !!groupId && /^[A-Z2-9]{4}$/.test(code));
for (let i = 0; i < users.length; i++) {
  [users[i].memberId] = await call(users[i], "join_group", [code, `Agent smoke ${i + 1}`]);
  await call(users[i], "set_ready", []);
}
const prompts = [
  "PRIVATE_MARKER_ONE. Burgers if possible, under $30 for the whole outing.",
  "PRIVATE_MARKER_TWO. I am vegetarian. Under $25 for the whole outing. A meal and an activity sound good.",
  "PRIVATE_MARKER_THREE. Under $20 for the whole outing. I prefer a short trip between the stops, but that is a soft preference, not a hard travel limit.",
];
await Promise.all(users.map((user, i) => call(user, "submit_agent_prefs", [prompts[i]])));
const summaries = await Promise.all(users.map(user => until("private interpretation", async () => {
  const own = (await view(user, "my_agent_needs"))[0];
  if (own?.error) throw new Error(`Interpretation failed: ${own.error}`);
  return own?.result_json ? own : null;
})));
for (let i = 0; i < users.length; i++) {
  const own = await view(users[i], "my_agent_needs");
  check(`Only participant ${i + 1}'s private needs are visible`, own.length === 1 && own[0].member_id === users[i].memberId && own[0].text === prompts[i]);
  const parsed = JSON.parse(summaries[i].result_json);
  check(`Participant ${i + 1}'s whole-outing cap was interpreted`, parsed.hard.budgetMaxPerPerson === [30, 25, 20][i]);
  if (parsed.questions.length) console.log('Synthetic fixture clarification:', parsed.questions);
  check(`Participant ${i + 1} has no unresolved clarification`, !parsed.questions.length);
}
check("Vegetarian requirement preserved", JSON.parse(summaries[1].result_json).hard.dietary.includes("vegetarian"));
await rejects("Host cannot plan before every confirmation", () => call(users[0], "find_agent_plans", []));
for (let i = 0; i < users.length; i++) await call(users[i], "confirm_agent_needs", [summaries[i].revision]);
await rejects("A non-host cannot trigger planning", () => call(users[1], "find_agent_plans", []));
const publicState = (await view(users[0], "my_agent_session"))[0];
check("Public readiness has no prompts or caps", publicState.confirmed_member_ids.length === 3 && !JSON.stringify(publicState).includes("PRIVATE_MARKER") && !JSON.stringify(publicState).includes("budgetMax"));

async function waitPlans() {
  return until("current coordinator plans", async () => {
    const state = (await view(users[0], "my_agent_session"))[0];
    if (state.error) throw new Error(state.error);
    if (state.status !== "ready" && state.status !== "blocked") return null;
    const run = (await view(users[0], "my_plan_runs")).find(r => r.run_id === state.active_run_id);
    return run?.result_json ? { runId: run.run_id, result: JSON.parse(run.result_json) } : null;
  });
}
await call(users[0], "find_agent_plans", []);
let current = await waitPlans();
check("Claude coordinator returns actual choices", current.result.mode === "agent" && current.result.plans.length > 0 && current.result.plans.length <= 3);
check("No invented math scores", current.result.plans.every(p => !("robustness" in p)) && !("pareto" in current.result));
check("Every total equals its stops and respects every cap", current.result.plans.every(p => p.costPerPerson === p.stops.reduce((sum, s) => sum + s.costPerPerson, 0) && p.costPerPerson <= 20));
check("No private prompt markers in public result", !JSON.stringify(current.result).includes("PRIVATE_MARKER"));
const messages = await view(users[1], "my_council_messages");
check("One factual coordinator message, no advocate theater", messages.filter(m => m.speaker === "coordinator").length === 1 && !JSON.stringify(messages).includes("PRIVATE_MARKER"));
await call(users[1], "post_agent_discussion", ["Could we keep the travel short? This is a public discussion message."]);
check("Shared discussion reaches other participants", (await view(users[0], "my_council_messages")).some(m => m.speaker === "participant"));

// A second independent huddle cannot subscribe to this group's private context or results.
const stranger = await phone();
const [, otherCode] = await call(stranger, "create_agent_group", [{ none: [] }]);
await call(stranger, "join_group", [otherCode, "Separate group"]);
check("Another huddle cannot read private needs", (await view(stranger, "my_agent_needs")).length === 0);
check("Another huddle cannot read these plans/messages", (await view(stranger, "my_plan_runs")).length === 0 && (await view(stranger, "my_council_messages")).length === 0);

async function voteAll(choice = current.result.recommendedPlanId) {
  for (const user of users) await call(user, "vote", [current.runId, choice]);
}
async function book() {
  const selected = current.result.plans.find(p => p.id === current.result.recommendedPlanId);
  await call(users[0], "start_booking", [current.runId, selected.id, selected.stops.findIndex(s => s.category === "meal")]);
  return (await view(users[0], "my_bookings")).sort((a, b) => b.created_at - a.created_at)[0];
}
await call(users[0], "vote", [current.runId, current.result.recommendedPlanId]);
await rejects("Booking waits for a complete group vote", () => book());
await voteAll();
const selected = current.result.plans.find(p => p.id === current.result.recommendedPlanId);
await rejects("Only host starts booking", () => call(users[1], "start_booking", [current.runId, selected.id, selected.stops.findIndex(s => s.category === "meal")]));
const booking = await book();
await until("scripted booking confirmation", async () => (await view(users[0], "my_bookings")).some(b => b.id === booking.id && b.status === "confirmed"));
check("Explicit booking reaches scripted confirmation", true);
await rejects("Duplicate booking rejected", () => book());

const old = current;
await call(users[2], "submit_agent_prefs", ["Under $12 for the whole outing. Keep the meal and activity; this is my updated private request."]);
check("Editing immediately invalidates old votes", (await view(users[0], "my_votes")).length === 0);
await rejects("Old vote rejected after input change", () => call(users[0], "vote", [old.runId, old.result.recommendedPlanId]));
await rejects("Old Spin rejected after input change", () => call(users[0], "do_roulette", [old.runId]));
const changed = await until("updated private needs", async () => {
  const own = (await view(users[2], "my_agent_needs"))[0];
  if (own?.error) throw new Error(own.error);
  return own?.result_json ? own : null;
});
check("Changed budget is cumulative and lower", JSON.parse(changed.result_json).hard.budgetMaxPerPerson === 12);
await call(users[2], "confirm_agent_needs", [changed.revision]);
await call(users[0], "find_agent_plans", []);
current = await waitPlans();
check("Replanning uses the new cap", current.runId !== old.runId && current.result.plans.length > 0 && current.result.plans.every(p => p.costPerPerson <= 12));
await voteAll();
const full = await book();
const injected = await fetch(`${D}/route/call-event`, { method: "POST", headers: { "Content-Type": "application/json", "X-Huddle-Secret": secret },
  body: JSON.stringify({ bookingId: full.id, type: "failed", reason: "full", text: "Synthetic full response for coordinator smoke." }) });
check("Synthetic full callback accepted", injected.ok);
const replacedRun = current.runId;
current = await waitPlans();
if (current.runId === replacedRun) current = await until("replacement run", async () => {
  const next = await waitPlans(); return next.runId !== replacedRun ? next : null;
});
check("Full result creates a fresh coordinator run", current.runId !== replacedRun);
check("Replacement excludes the unavailable venue", current.result.plans.every(p => p.stops.every(s => s.placeId !== full.place_id)));
check("Replacement never books automatically", !(await view(users[0], "my_bookings")).some(b => b.run_id === current.runId));
console.log(`ALL PASS: ${checks} coordinator checks. Synthetic test huddle ${code} (${groupId}); booking was simulated.`);
