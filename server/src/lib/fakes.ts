// FAKE api responses (disclosed in docs/HONESTY.md). callApi returns these while
// FASTAPI_BASE_URL is unset, so the whole app runs end to end before Max's solver is wired.
// Every shape follows docs/CONTRACT.md S5.3. Randomness is seeded from runId/memberId.
import { FEATURES, K } from "./constants";
import { PLACES, placeById, type Place } from "./places";
import { planFitsBudgets } from "./budgets";

type Posterior = { mean: number[]; cov: number[][] };
type Member = { memberId: string; name: string; posterior?: Posterior; hard?: any };

function seeded(seedText: string) {
  let h = 2166136261;
  for (const c of seedText) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
const round2 = (x: number) => Math.round(x * 100) / 100;

function diagPosterior(mean: number[], sd: number[]): Posterior {
  return {
    mean,
    cov: mean.map((_, i) => mean.map((_, j) => (i === j ? sd[i] * sd[i] : 0))),
  };
}

// /parse-prefs: a keyword parser in the spirit of build-brief C2's fallback.
function parsePrefs(body: { text: string }) {
  const text = body.text.toLowerCase();
  const budget = text.match(/\$\s?(\d+)/);
  const dietary = ["vegetarian", "vegan", "gluten_free", "halal", "kosher"].filter((d) =>
    text.includes(d.replace("_", " ")) || text.includes(d),
  );
  const vetoCuisines: string[] = [];
  if (/no (sushi|ramen|asian|chinese|thai)/.test(text)) vetoCuisines.push("asian");
  if (/no (tacos|mexican|latin)/.test(text)) vetoCuisines.push("latin");
  const rules: [RegExp, string, number][] = [
    [/quiet/, "noise", -1],
    [/crowd/, "crowd", -1],
    [/romantic/, "romance", 1],
    [/(cheap|broke|budget)/, "value", 1],
    [/outdoor/, "outdoor", 1],
    [/(new places|trying new|novel|unusual)/, "novelty", 1],
  ];
  const soft = rules
    .filter(([re]) => re.test(text))
    .map(([, feature, direction]) => ({ feature, direction, confidence: "high" }));
  const mean = Array(K).fill(0);
  const sd = Array(K).fill(1.0);
  for (const s of soft) {
    const i = FEATURES.indexOf(s.feature as (typeof FEATURES)[number]);
    mean[i] = s.direction * 1.5;
    sd[i] = 0.5;
  }
  return {
    hard: {
      vetoCuisines,
      vetoCategories: [],
      budgetMaxPerPerson: budget ? Number(budget[1]) : null,
      dietary,
      maxTravelMinutes: null,
    },
    soft,
    posterior: diagPosterior(mean, sd),
    warnings: ["SYNTHETIC STUB: local fallback preference fixture; not an LLM result."],
  };
}

function elicitNext(body: { memberId: string; alreadySeen?: string[][]; candidatePlaceIds?: string[] }) {
  const seen = new Set((body.alreadySeen ?? []).map((p) => [...p].sort().join("|")));
  const ids = body.candidatePlaceIds?.length ? body.candidatePlaceIds : PLACES.map((p) => p.id);
  const pool = ids.map(placeById).filter((p): p is Place => !!p);
  const rand = seeded(`${body.memberId}:${seen.size}`);
  const pairs: [Place, Place][] = [];
  for (const a of pool)
    for (const b of pool)
      if (a.id < b.id && a.category === b.category && !seen.has([a.id, b.id].sort().join("|")))
        pairs.push([a, b]);
  if (pairs.length === 0) return { a: pool[0].id, b: pool[1].id, category: pool[0].category };
  const [a, b] = pairs[Math.floor(rand() * pairs.length)];
  return rand() < 0.5
    ? { a: a.id, b: b.id, category: a.category }
    : { a: b.id, b: a.id, category: a.category };
}

function elicitUpdate(body: { posterior: Posterior }) {
  // Fake: shrink every variance by 35%. The real Laplace update lives in api/.
  const { mean, cov } = body.posterior;
  return { posterior: { mean, cov: cov.map((row) => row.map((x) => x * 0.65)) } };
}

function stop(p: Place, start: string, end: string) {
  return {
    placeId: p.id, name: p.name, category: p.category, start, end,
    lat: p.lat, lng: p.lng, costPerPerson: p.costPerPerson,
  };
}

function plan(body: { runId: string; members: Member[]; excludePlaceIds?: string[]; options?: any;
                      window?: { start: string; end: string } }) {
  const exclude = new Set(body.excludePlaceIds ?? []);
  const rand = seeded(body.runId);
  const kinds = [
    { kind: "safe", robustness: 0.93, i: 0 },
    { kind: "bold", robustness: 0.78, i: 1 },
    { kind: "budget", robustness: 0.81, i: 2 },
  ];
  const asMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const asClock = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  const candidates = kinds.map(({ kind, robustness }) => {
    let current = asMinutes(body.window?.start ?? "17:00");
    const stops = (["meal", "activity", "dessert"] as const).map((category) => {
      const place = placeById(`stub_${kind}_${category}`)!;
      const end = current + place.dwellMinutes;
      const result = stop(place, asClock(current), asClock(end));
      current = end + 15;
      return result;
    });
    const perMember = body.members.map((mem) => {
      const ratioMean = round2(0.7 + rand() * 0.25);
      return { memberId: mem.memberId, ratioMean, ratioP10: round2(ratioMean - 0.15) };
    });
    return {
      id: `plan_${kind}_${body.runId}`,
      kind,
      stops,
      costPerPerson: stops.reduce((s, x) => s + x.costPerPerson, 0),
      robustness,
      perMember,
      whyLine: "SYNTHETIC STUB: fixed fallback itinerary; scores are canned.",
      gaveUp: [],
    };
  });
  const plans = candidates.filter((candidate) => planFitsBudgets(candidate, body.members) &&
    candidate.stops.every((s) => !exclude.has(s.placeId) && s.end <= (body.window?.end ?? "23:00") &&
      body.members.every((member) => {
        const place = placeById(s.placeId)!;
        const hard = member.hard ?? {};
        return !(hard.vetoCuisines ?? []).includes(place.cuisine) &&
          !(hard.vetoCategories ?? []).includes(place.category) &&
          (place.category === "activity" || (hard.dietary ?? []).every((diet: string) => place.dietary.includes(diet)));
      })));
  if (plans.length && !plans.some((p) => p.kind === "safe"))
    plans.reduce((best, p) => p.robustness > best.robustness ? p : best).kind = "safe";
  plans.sort((a, b) => Number(b.kind === "safe") - Number(a.kind === "safe"));
  const preview = body.options?.preview === true;
  const minRatio = (p: (typeof plans)[number]) => Math.min(...p.perMember.map((x) => x.ratioMean), 1);
  const meanRatio = (p: (typeof plans)[number]) =>
    p.perMember.reduce((s, x) => s + x.ratioMean, 0) / Math.max(p.perMember.length, 1);
  const pareto = preview
    ? []
    : plans.map((p) => ({ planId: p.id, meanRatio: round2(meanRatio(p)), minRatio: round2(minRatio(p)), robustness: p.robustness }));
  return {
    runId: body.runId,
    plans: preview ? plans.slice(0, 1) : plans,
    pareto,
    posteriorSummary: body.members.map((m) => ({
      memberId: m.memberId,
      features: FEATURES.map((name, i) => ({
        name,
        mean: round2(m.posterior?.mean[i] ?? 0),
        sd: round2(Math.sqrt(m.posterior?.cov[i]?.[i] ?? 1)),
      })),
    })),
    stats: { candidatePlans: candidates.length, feasiblePlans: plans.length, samples: 0, elapsedMs: 0 },
    relaxationHints: [],
    warnings: ["SYNTHETIC STUB: fixed itineraries from the shared API fixture catalog; no optimization or inference."],
  };
}

function offers(_body: unknown) {
  // Match phase-zero FastAPI: do not fabricate a beneficial budget concession.
  return { offers: [] };
}

function roulette(body: { plans: { id: string; robustness: number }[]; seed?: number }) {
  const total = body.plans.reduce((s, p) => s + p.robustness ** 2, 0) || 1;
  const weights = Object.fromEntries(body.plans.map((p) => [p.id, round2(p.robustness ** 2 / total)]));
  let r = seeded(String(body.seed ?? 7))();
  for (const p of body.plans) {
    r -= p.robustness ** 2 / total;
    if (r <= 0) return { planId: p.id, weights };
  }
  return { planId: body.plans[body.plans.length - 1].id, weights };
}

function council(body: { runId: string; plans: any[]; members: Member[]; options?: { seed?: number } }) {
  const labels = ["A", "B", "C", "D"].map((l) => `Advocate ${l}`);
  const rand = seeded(`${body.runId}:${body.options?.seed ?? 7}`);
  const order = body.members.map((m, i) => ({ m, i, k: rand() })).sort((x, y) => x.k - y.k);
  const safe = body.plans.find((p) => p.kind === "safe");
  const now = 1792886400000; // Frozen synthetic timestamp, not a live event.
  const messages: any[] = [];
  for (const round of [1, 2]) {
    order.forEach(({ m }, idx) => {
      const score = safe?.perMember?.find((p: any) => p.memberId === m.memberId)?.ratioMean ?? 0.8;
      messages.push({
        runId: body.runId, round, speaker: "advocate", label: labels[idx % 4], memberId: m.memberId,
        planId: null,
        stance: Object.fromEntries(body.plans.map((p) => [p.id, "accept"])),
        text: "SYNTHETIC STUB: canned advocate; no preference reasoning was performed.",
        cited: [{ tool: "my_score", field: "ratioMean", value: score }],
        ts: now + messages.length,
      });
    });
  }
  messages.push({
    runId: body.runId, round: 3, speaker: "chair", label: "Chair", memberId: null, planId: safe?.id ?? null,
    text: "SYNTHETIC STUB: chair selects the supplied Safe plan; no live council ran.",
    cited: [{ tool: "plan_facts", field: "robustness", value: safe?.robustness }],
    ts: now + messages.length,
  });
  return {
    runId: body.runId, chosenPlanId: safe?.id, rationale: messages[messages.length - 1].text,
    fallbackUsed: false, agreesWithSolver: true, messages, elapsedMs: 40,
  };
}

const handlers: Record<string, (body: any) => unknown> = {
  "/health": () => ({ ok: true, stub: true, placesLoaded: PLACES.length }),
  "/parse-prefs": parsePrefs,
  "/elicit/next": elicitNext,
  "/elicit/update": elicitUpdate,
  "/plan": plan,
  "/offers": offers,
  "/roulette": roulette,
  "/council": council,
};

export function fakeApi(path: string, body: unknown): unknown {
  const handler = handlers[path];
  if (!handler) throw new Error(`fakeApi: no fake for ${path}`);
  return handler(body);
}

// FAKE voice call (used while VOICE_BASE_URL is unset). scenario "full" ends in failed/full.
export function fakeCallEvents(scenario: string) {
  const t = (text: string, speaker: "agent" | "restaurant") => ({ type: "transcript" as const, text, speaker, lang: "zh" });
  const base = [
    { type: "dialing" as const },
    { type: "connected" as const },
    t("您好，我是AI助理，代表客人预订座位。通话可能会被转录。", "agent"),
  ];
  if (scenario === "full")
    return [
      ...base,
      t("不好意思，今晚已经订满了。", "restaurant"),
      { type: "failed" as const, reason: "full" as const, text: "Restaurant said it is fully booked." },
      { type: "ended" as const },
    ];
  return [
    ...base,
    t("七点已经满了，七点四十五可以吗？", "restaurant"),
    { type: "slot_offered" as const, slot: "19:45" },
    t("可以，七点四十五，谢谢。", "agent"),
    { type: "confirmed" as const, slot: "19:45" },
    { type: "ended" as const },
  ];
}
