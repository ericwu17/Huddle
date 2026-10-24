// End-to-end smoke test for Huddle (build-brief A2), run against a live SpacetimeDB module.
// Four separate identities = four phones. Prints PASS/FAIL per step; exit 1 on any failure.
//
//   node scripts/smoke.mjs                 # target from env / repo-root .env
//   SPACETIMEDB_URI=http://127.0.0.1:3000 SPACETIMEDB_DB=huddle-local node scripts/smoke.mjs
//
// Needs SPACETIMEDB_URI, SPACETIMEDB_DB and HUDDLE_SHARED_SECRET (env or .env). Works on fakes or
// real services. Each run creates a throwaway group in the target database.
// Written by Eric Chen from his module test while Haydn is out (Haydn owns scripts/).
import { readFileSync, existsSync } from "node:fs";

const envFile = new URL("../.env", import.meta.url);
const fileEnv = existsSync(envFile)
  ? Object.fromEntries(
      readFileSync(envFile, "utf8").split(/\r?\n/)
        .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
        .filter(Boolean)
        .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
    )
  : {};
const conf = (k, d) => process.env[k] || fileEnv[k] || d;
const base = conf("SPACETIMEDB_URI", "http://127.0.0.1:3000");
const db = conf("SPACETIMEDB_DB", "huddle-local");
const secret = conf("HUDDLE_SHARED_SECRET");
if (!secret) { console.error("HUDDLE_SHARED_SECRET is not set (env or .env)"); process.exit(2); }
console.log(`smoke: ${base} / ${db}`);
const B = base;
const D = `${B}/v1/database/${db}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (!ok) fails++;
};

async function newPhone() {
  const { token } = await (await fetch(`${B}/v1/identity`, { method: "POST" })).json();
  return token;
}
async function call(tok, fn, args) {
  const r = await fetch(`${D}/call/${fn}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
const unopt = (v) => (Array.isArray(v) && v.length === 2 && (v[0] === 0 || v[0] === 1) && (v[0] === 1 ? Array.isArray(v[1]) && v[1].length === 0 : true) ? (v[0] === 0 ? v[1] : null) : v);
async function view(tok, name) {
  const r = await fetch(`${D}/sql`, { method: "POST", headers: { Authorization: `Bearer ${tok}` }, body: `SELECT * FROM ${name}` });
  const j = await r.json();
  const cols = j[0].schema.elements.map((e) => e.name.some);
  return j[0].rows.map((row) => Object.fromEntries(cols.map((c, i) => [c, unopt(row[i])])));
}
async function until(desc, fn, timeoutMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const v = await fn();
    if (v) return v;
    await sleep(500);
  }
  throw new Error(`timed out waiting for ${desc}`);
}

const demo = [
  ["Alex", "vegetarian, under $30, somewhere quiet"],
  ["Sam", "no sushi, I love trying new places"],
  ["Jordan", "broke this month, nothing over $20, outdoors if possible"],
  ["Riley", "romantic vibe, I don't care about price"],
];

// 1. Join
const host = await newPhone();
const [groupId, code] = await call(host, "create_group", [{ none: [] }]);
check("create_group returns id + code", !!groupId && /^[A-Z2-9]{4}$/.test(code), code);
const phones = [];
for (const [name] of demo) {
  const tok = await newPhone();
  const [memberId] = await call(tok, "join_group", [code, name]);
  phones.push({ tok, name, memberId });
}
check("4 members visible", (await view(host, "my_members")).length === 4);
for (const p of phones) await call(p.tok, "set_ready", []);
check("status -> eliciting", (await view(host, "my_group"))[0].status === "eliciting");

// 2. Private prefs + swipes
for (let i = 0; i < 4; i++) await call(phones[i].tok, "submit_prefs", [demo[i][1]]);
for (const p of phones) await until(`${p.name} next pair`, async () => (await view(p.tok, "my_private"))[0]?.next_pair_a);
const alexPriv = (await view(phones[0].tok, "my_private"))[0];
check("parse: Alex budget 30 + vegetarian", JSON.parse(alexPriv.hard_json).budgetMaxPerPerson === 30 && JSON.parse(alexPriv.hard_json).dietary.includes("vegetarian"));
check("privacy: my_private only shows own row", (await view(phones[1].tok, "my_private")).every((r) => r.member_id === phones[1].memberId));

for (let round = 0; round < 12; round++) {
  const g = (await view(host, "my_group"))[0];
  if (g.status !== "eliciting") break;
  for (const p of phones) {
    const priv = await until(`${p.name} pair r${round}`, async () => {
      const r = (await view(p.tok, "my_private"))[0];
      return r.next_pair_a || r.swipe_count >= 12 ? r : null;
    });
    if (priv.swipe_count >= 12) continue;
    await call(p.tok, "submit_swipe", [priv.next_pair_a, priv.next_pair_b]);
  }
  await sleep(2200); // let the 1.5 s debounced preview land
  console.log(`      round ${round + 1}: confidence ${(await view(host, "my_group"))[0].confidence}`);
}

// 3. Plan, scout, council, voting
const g = await until("status voting", async () => {
  const r = (await view(host, "my_group"))[0];
  return r.status === "voting" ? r : null;
}, 40000);
check("status -> voting with a run", !!g.latest_run_id, g.latest_run_id);
const run = (await view(host, "my_plan_runs")).find((r) => r.run_id === g.latest_run_id);
const result = JSON.parse(run.result_json);
check("3 plans safe/bold/budget", result.plans.map((p) => p.kind).join() === "safe,bold,budget");
check("privacy: perMember/gaveUp/posteriorSummary stripped", result.plans.every((p) => !p.perMember && !p.gaveUp) && !result.posteriorSummary);
const leaked = result.plans.filter((p) => demo.some(([n]) => new RegExp(`\\b${n}\\b`, "i").test(p.whyLine ?? "")));
check("privacy: no member names in whyLine", leaked.length === 0, leaked.map((p) => p.whyLine).join(" | "));
const msgs = await until("9 council messages", async () => {
  const m = await view(host, "my_council_messages");
  return m.length >= 9 ? m : null;
});
check("council: 9 messages, chair last, no memberId", msgs.length === 9 && msgs.at(-1).speaker === "chair" && msgs.every((m) => m.member_id == null));
check("council result stored", JSON.parse(run.council_json ?? (await view(host, "my_plan_runs")).find((r) => r.run_id === g.latest_run_id).council_json).chosenPlanId === result.plans[0].id);
check("scout rows (cached)", (await view(host, "my_scout")).length >= 1);
const offersFor = await Promise.all(phones.map(async (p) => (await view(p.tok, "my_offers")).length));
if (offersFor.every((n) => n === 0)) {
  // Phase-zero stubs return no offers on purpose (never a fabricated concession).
  console.log("SKIP  offers: none returned (expected until the real /offers exists)");
} else {
  check("offers reach at most one phone each, never everyone", offersFor.every((n) => n <= 1) && offersFor.some((n) => n === 0), offersFor.join());
  const holder = phones[offersFor.findIndex((n) => n > 0)];
  const offerPlan = JSON.parse((await view(holder.tok, "my_offers"))[0].plan_json);
  check("privacy: offer plan hides perMember/gaveUp and names", !offerPlan.perMember && !offerPlan.gaveUp && !demo.some(([n]) => (offerPlan.whyLine ?? "").includes(n)), offerPlan.whyLine);
}

// 4. Vote + roulette
for (const p of phones) await call(p.tok, "vote", [g.latest_run_id, result.plans[0].id]);
await call(phones[0].tok, "vote", [g.latest_run_id, result.plans[1].id]); // re-vote overwrites
const votes = await view(host, "my_votes");
check("4 votes, re-vote overwrote", votes.length === 4 && votes.filter((v) => v.plan_id === result.plans[1].id).length === 1);
const [rPlan] = await call(phones[1].tok, "do_roulette", [g.latest_run_id]);
check("roulette returns one of the plans", result.plans.some((p) => p.id === rPlan), rPlan);

// 5. Booking (fake call, confirm scenario)
await call(phones[0].tok, "start_booking", [g.latest_run_id, result.plans[0].id, 0]);
const booking = await until("booking confirmed", async () => (await view(host, "my_bookings")).find((b) => b.status === "confirmed"), 20000);
await until("ended event", async () => (await view(host, "my_call_events")).some((e) => e.booking_id === booking.id && e.type === "ended"), 10000);
const evs = (await view(host, "my_call_events")).filter((e) => e.booking_id === booking.id).map((e) => e.type);
check("call events end confirmed/ended", evs.includes("confirmed") && evs.at(-1) === "ended", evs.join(">"));
check("status -> booked", (await view(host, "my_group"))[0].status === "booked");

// 6. Voice route: failed/full from the voice service
await call(phones[0].tok, "start_booking", [g.latest_run_id, result.plans[1].id, 0]);
const b2 = await until("second booking", async () => (await view(host, "my_bookings")).find((b) => b.plan_id === result.plans[1].id));
await sleep(9000); // let its fake confirm sequence finish first
const post = (body, s = secret) =>
  fetch(`${D}/route/call-event`, { method: "POST", headers: { "X-Huddle-Secret": s, "Content-Type": "application/json" }, body: JSON.stringify(body) });
check("route rejects bad secret", (await post({ bookingId: b2.id, type: "failed", reason: "full" }, "wrong")).status === 401);
const failRes = await post({ bookingId: b2.id, type: "failed", reason: "full", ts: Date.now() });
check("route accepts failed/full", failRes.ok, failRes.ok ? "" : `${failRes.status} ${await failRes.text()}`);
const b2after = (await view(host, "my_bookings")).find((b) => b.id === b2.id);
check("booking marked failed/full", b2after.status === "failed" && b2after.fail_reason === "full");
const replanned = await until("re-plan run", async () => {
  const gg = (await view(host, "my_group"))[0];
  return gg.replan_for === b2.id && gg.latest_run_id !== g.latest_run_id ? gg : null;
}, 20000);
check("re-plan: replan_for set, new run started", !!replanned, replanned?.latest_run_id);
const newRun = await until("re-plan run done", async () => (await view(host, "my_plan_runs")).find((r) => r.run_id === replanned.latest_run_id && r.status === "done"), 30000);
const newPlaces = JSON.parse(newRun.result_json).plans.flatMap((p) => p.stops.map((s) => s.placeId));
check("re-plan: new plans exclude the full restaurant", !newPlaces.includes(b2.place_id), b2.place_id);
await until("vote reopens after re-plan", async () => (await view(host, "my_group"))[0].status === "voting", 30000);
check("re-plan: vote reopens", true);
await call(phones[0].tok, "start_booking", [replanned.latest_run_id, JSON.parse(newRun.result_json).plans[0].id, 0]);
check("call again clears the banner", (await until("banner cleared", async () => (await view(host, "my_group"))[0].replan_for == null ? true : null, 10000)) === true);
const postCouncil = (memberId, label) => fetch(`${D}/route/council-message`, {
  method: "POST", headers: { "X-Huddle-Secret": secret, "Content-Type": "application/json" },
  body: JSON.stringify({ runId: g.latest_run_id, round: 1, speaker: "advocate", label, memberId, planId: null, stance: {}, text: "route test", cited: [], ts: Date.now() }),
});
// A member who already spoke in round 1: the module ignores the duplicate.
const dup = await postCouncil(phones[0].memberId, "Advocate Dup");
check("council-message route ignores a duplicate speaker", dup.ok && !(await view(host, "my_council_messages")).some((m) => m.label === "Advocate Dup"));
// A speaker with no round-1 message yet: stored, and memberId hidden from the group.
const cm = await postCouncil("m_smoke_route", "Advocate Z");
check("council-message route stores a new message", cm.ok && (await view(host, "my_council_messages")).some((m) => m.label === "Advocate Z" && m.member_id == null));

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
