// Three simulated friends for a one-phone demo. They join your huddle by code,
// get ready and submit seeded private preferences. Agent groups confirm needs
// and vote; legacy groups also swipe and answer offers. The human host starts
// planning and the clearly labeled booking simulation.
//
//   node scripts/demo-friends.mjs ABCD                       # Sam, Jordan, Riley (you play Alex)
//   node scripts/demo-friends.mjs ABCD --friends Alex,Sam,Riley
//   node scripts/demo-friends.mjs ABCD --fast                # no human-like pauses
//
// Each friend is a separate SpacetimeDB identity, exactly like a separate phone,
// so the server treats them as real members: their preferences stay private and
// go through the real API. Target comes from SPACETIMEDB_URI / SPACETIMEDB_DB
// (env or the repo-root .env). Rerunning with the same code reuses the same
// friends (tokens kept in the ignored logs/demo-friends/). Ctrl+C stops them.
// Disclosed in docs/HONESTY.md: the other members in a one-phone demo are simulated.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";

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
const B = conf("SPACETIMEDB_URI", "https://maincloud.spacetimedb.com");
const DB = conf("SPACETIMEDB_DB", "huddle-calhacks");
const D = `${B}/v1/database/${DB}`;

const args = process.argv.slice(2);
const code = (args.find((a) => /^[A-Za-z0-9]{4}$/.test(a)) ?? "").toUpperCase();
const fast = args.includes("--fast");
const friendsArg = args.includes("--friends") ? args[args.indexOf("--friends") + 1] : null;
if (!code) {
  console.error("Usage: node scripts/demo-friends.mjs <CODE> [--friends Sam,Jordan,Riley] [--fast]");
  process.exit(2);
}

// The four seeded demo people (data/demo_group.json). `likes` scores a place
// for swipes; higher wins. `flexible` says which private offer they'd accept.
const words = (re) => (p) => (re.test(p.name) ? 1 : 0);
const PEOPLE = {
  Alex: {
    text: "vegetarian, under $30, somewhere quiet",
    likes: (p) => (p.dietary?.includes("vegetarian") ? 2 : 0) - p.costPerPerson / 15 + words(/museum|garden|library|gallery/i)(p),
    flexible: "travel",
  },
  Sam: {
    text: "no sushi, I love trying new places",
    likes: (p) => (p.cuisine === "asian" ? -5 : 0) + (1 - Math.min(p.reviewCount ?? 0, 2000) / 2000) + (p.rating ?? 4) / 5,
    flexible: "travel",
  },
  Jordan: {
    text: "broke this month, nothing over $20, outdoors if possible",
    likes: (p) => -p.costPerPerson / 8 + 2 * words(/park|garden|rock|trail|beach/i)(p),
    flexible: null,
  },
  Riley: {
    text: "romantic vibe, I don't care about price",
    likes: (p) => (p.rating ?? 4) + p.costPerPerson / 20 + words(/garden|theatre|theater|museum|wine|rose|music/i)(p),
    flexible: "budget",
  },
};
const names = friendsArg && !friendsArg.startsWith("--") ? friendsArg.split(",").map((s) => s.trim()) : ["Sam", "Jordan", "Riley"];
for (const n of names) if (!PEOPLE[n]) { console.error(`Unknown friend "${n}". Pick from ${Object.keys(PEOPLE).join(", ")}.`); process.exit(2); }

const places = new Map(JSON.parse(readFileSync(new URL("../data/places.json", import.meta.url), "utf8")).map((p) => [p.id, p]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pause = (lo, hi) => (fast ? sleep(200) : sleep(lo + Math.random() * (hi - lo)));
const say = (who, msg) => console.log(`${new Date().toTimeString().slice(0, 8)}  ${who.padEnd(7)} ${msg}`);

async function call(tok, fn, a) {
  const r = await fetch(`${D}/call/${fn}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify(a),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
const unopt = (v) => (Array.isArray(v) && v.length === 2 && (v[0] === 0 || v[0] === 1) && (v[0] === 1 ? Array.isArray(v[1]) && v[1].length === 0 : true) ? (v[0] === 0 ? v[1] : null) : v);
async function view(tok, name) {
  const r = await fetch(`${D}/sql`, { method: "POST", headers: { Authorization: `Bearer ${tok}` }, body: `SELECT * FROM ${name}` });
  if (!r.ok) throw new Error(`${name}: ${r.status} ${await r.text()}`);
  const j = await r.json();
  const cols = j[0].schema.elements.map((e) => e.name.some);
  return j[0].rows.map((row) => Object.fromEntries(cols.map((c, i) => [c, unopt(row[i])])));
}

// ---------- join (or rejoin from a previous run with this code) ----------
const stateDir = new URL("../logs/demo-friends/", import.meta.url);
mkdirSync(stateDir, { recursive: true });
const stateFile = new URL(`${code}.json`, stateDir);
const saved = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : {};

console.log(`demo friends for huddle ${code} on ${B} / ${DB}: ${names.join(", ")}${fast ? " (fast)" : ""}`);
const friends = [];
for (const name of names) {
  let tok = saved[name];
  if (!tok) {
    ({ token: tok } = await (await fetch(`${B}/v1/identity`, { method: "POST" })).json());
    try {
      await call(tok, "join_group", [code, name]);
    } catch (e) {
      if (/no group with that code/i.test(String(e.message))) {
        console.error(`\nNo huddle with code ${code} on ${DB}.`);
        console.error("Use the 4 letters shown on your phone's lobby screen (not the ABCD example),");
        console.error("and start the huddle on the same site the friends join (the Vercel link uses huddle-calhacks).");
      } else {
        console.error(`\nCould not join: ${e.message}`);
      }
      process.exitCode = 1;
      break;
    }
    say(name, "joined");
  } else {
    say(name, "back (same phone as last run)");
  }
  saved[name] = tok;
  writeFileSync(stateFile, JSON.stringify(saved, null, 2));
  friends.push({ name, tok, ...PEOPLE[name], ready: false, wrote: false, voted: new Set(), answered: new Set(), busy: false });
}

// ---------- each friend reacts to the group, like a person with the app open ----------
let booked = false;
async function step(f) {
  const g = (await view(f.tok, "my_group"))[0];
  if (!g) return;
  if (g.status === "lobby") {
    const me = (await view(f.tok, "my_members")).find((m) => m.name === f.name);
    if (!f.ready && me && !me.ready) {
      await pause(1500, 4000);
      await call(f.tok, "set_ready", []);
      say(f.name, "is ready");
    }
    f.ready = true;
    return;
  }
  // These remain simulated participants, not Claude agents. In coordinator
  // huddles they confirm their seeded needs and wait for the human host's
  // explicit Find plans/booking actions; they never swipe or auto-book.
  let coordinator = null;
  try { coordinator = (await view(f.tok, "my_agent_session"))[0]; }
  catch (e) { if (!/unknown|no such|not found|does not exist|unresolved/i.test(String(e.message))) throw e; }
  if (coordinator) {
    const own = (await view(f.tok, "my_agent_needs"))[0];
    if (!own && !f.wrote) {
      await pause(1000, 2500);
      await call(f.tok, "submit_agent_prefs", [f.text]);
      f.wrote = true;
      say(f.name, "submitted simulated private needs");
      return;
    }
    if (own?.result_json && !own.confirmed) {
      const summary = JSON.parse(own.result_json);
      if (!summary.questions.length && !summary.hard.allergies.length) {
        await call(f.tok, "confirm_agent_needs", [own.revision]);
        say(f.name, "confirmed simulated needs");
      }
      return;
    }
    if (g.status === "voting" && g.latest_run_id && !f.voted.has(g.latest_run_id)) {
      const current = (await view(f.tok, "my_plan_runs")).find(r => r.run_id === g.latest_run_id);
      if (!current?.result_json) return;
      const result = JSON.parse(current.result_json);
      if (!result.plans.length) return;
      await pause(1500, 4000);
      await call(f.tok, "vote", [g.latest_run_id, result.recommendedPlanId]);
      f.voted.add(g.latest_run_id);
      say(f.name, "cast simulated vote for the coordinator's recommendation");
    }
    return;
  }
  const mine = (await view(f.tok, "my_private"))[0];
  if (g.status === "eliciting") {
    if (!mine?.text && !f.wrote) {
      await pause(3000, 8000);
      await call(f.tok, "submit_prefs", [f.text]);
      f.wrote = true;
      say(f.name, `wrote privately: "${f.text}"`);
      return;
    }
    if (mine?.next_pair_a && mine.swipe_count < 12) {
      const a = places.get(mine.next_pair_a), b = places.get(mine.next_pair_b);
      const pickA = !a || !b ? true : f.likes(a) >= f.likes(b);
      const [win, lose] = pickA ? [mine.next_pair_a, mine.next_pair_b] : [mine.next_pair_b, mine.next_pair_a];
      await pause(1200, 3000);
      await call(f.tok, "submit_swipe", [win, lose]);
      say(f.name, `swiped ${mine.swipe_count + 1}/12: ${places.get(win)?.name ?? win}`);
    }
    return;
  }
  // Private offers on the current plan: accept the kind this person is flexible on.
  for (const o of await view(f.tok, "my_offers")) {
    if (f.answered.has(o.id)) continue;
    f.answered.add(o.id);
    await pause(2000, 5000);
    const yes = f.flexible === o.type;
    await call(f.tok, yes ? "accept_offer" : "decline_offer", [o.id]);
    say(f.name, `${yes ? "accepted" : "declined"} a private offer (${o.type} +${o.amount} ${o.unit})`);
  }
  if (g.status === "voting" && g.latest_run_id && !f.voted.has(g.latest_run_id)) {
    const run = (await view(f.tok, "my_plan_runs")).find((r) => r.run_id === g.latest_run_id);
    if (!run?.result_json) return;
    const plans = JSON.parse(run.result_json).plans ?? [];
    if (plans.length === 0) return;
    // Most friends go with the chair; the last one votes for their own favourite.
    // The council's verdict can land just after voting opens, so followers wait
    // for it (up to a minute) before deciding.
    const follower = friends.indexOf(f) < friends.length - 1;
    f.votingSince ??= {};
    f.votingSince[g.latest_run_id] ??= Date.now();
    if (follower && !run.council_json && Date.now() - f.votingSince[g.latest_run_id] < 60000) return;
    const council = run.council_json ? JSON.parse(run.council_json) : null;
    const follows = follower && council && !council.fallbackUsed;
    const score = (p) => p.stops.reduce((s, st) => s + (places.has(st.placeId) ? f.likes(places.get(st.placeId)) : 0), 0);
    const pick = (follows && plans.find((p) => p.id === council.chosenPlanId)) || plans.reduce((x, y) => (score(y) > score(x) ? y : x));
    f.voted.add(g.latest_run_id);
    await pause(4000, 9000); // time to read the debate
    await call(f.tok, "vote", [g.latest_run_id, pick.id]);
    say(f.name, `voted ${pick.kind}${follows ? " (with the chair)" : " (own favourite)"}`);
    return;
  }
  if (g.status === "booked" && !booked) {
    booked = true;
    say("all", "booked. The friends are done; Ctrl+C or wait 10 s.");
    setTimeout(() => process.exit(0), 10000);
  }
}

async function live(f) {
  for (;;) {
    try {
      await step(f);
    } catch (e) {
      const msg = String(e.message ?? e);
      // A vote or swipe that raced a new run is harmless; anything else is worth seeing.
      if (!/no longer available|already|not your turn|stale/i.test(msg)) say(f.name, `error: ${msg.slice(0, 160)}`);
    }
    await sleep(fast ? 400 : 1500);
  }
}
// Exit by letting the event loop drain (process.exit mid-fetch trips a libuv
// assertion on Windows).
if (friends.length === names.length) await Promise.all(friends.map(live));
