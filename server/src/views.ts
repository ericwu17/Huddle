// What phones can read. Every view is scoped to the caller's own group (via ctx.sender),
// and the privacy rules from build-brief B1 are enforced here:
// - private prefs and offers only to their owner;
// - perMember, gaveUp, posteriorSummary and council memberId only when showWhoCompromised.
import { t } from "spacetimedb/server";
import spacetimedb, { booking, call_event, scout_check, vote } from "./schema";
import type { ReadDb, View } from "./lib/types";
import { FEATURES } from "./lib/constants";
import { availablePlans } from "./lib/availability";
import { currentGroup, currentMember, membersOf, parse } from "./lib/util";
import { principalFor } from "./lib/account-state";

const pub = (name: string) => ({ name, public: true as const });

function myGroup(ctx: View) {
  return currentGroup(ctx.db, ctx.sender);
}

function runsOf(db: ReadDb, groupId: string) {
  return Array.from(db.plan_run.groupId.filter(groupId));
}

export const my_group = spacetimedb.view(
  pub("my_group"),
  t.option(
    t.row("MyGroupRow", {
      id: t.string().primaryKey(),
      code: t.string(),
      status: t.string(),
      date: t.string(),
      windowStart: t.string(),
      windowEnd: t.string(),
      demoMode: t.bool(),
      showWhoCompromised: t.bool(),
      confidence: t.option(t.f64()),
      latestRunId: t.option(t.string()),
      replanFor: t.option(t.string()),
      isHost: t.bool(),
      myMemberId: t.option(t.string()),
    }),
  ),
  (ctx) => {
    const g = myGroup(ctx);
    if (!g) return undefined;
    return {
      id: g.id, code: g.code, status: g.status, date: g.date, windowStart: g.windowStart, windowEnd: g.windowEnd,
      demoMode: g.demoMode, showWhoCompromised: g.showWhoCompromised, confidence: g.confidence,
      latestRunId: g.latestRunId, replanFor: g.replanFor, isHost: !!principalFor(ctx.db, ctx.sender)?.isEqual(g.hostIdentity),
      myMemberId: currentMember(ctx.db, ctx.sender)?.id,
    };
  },
);

export const my_members = spacetimedb.view(
  pub("my_members"),
  t.array(t.row("MyMemberRow", { id: t.string().primaryKey(), name: t.string(), ready: t.bool(), swipeCount: t.u32() })),
  (ctx) => {
    const g = myGroup(ctx);
    return g ? membersOf(ctx.db, g.id).map((m) => ({ id: m.id, name: m.name, ready: m.ready, swipeCount: m.swipeCount })) : [];
  },
);

// Owner only: the caller's own text, parsed limits, posterior summary and next swipe pair.
export const my_private = spacetimedb.view(
  pub("my_private"),
  t.option(
    t.row("MyPrivateRow", {
      memberId: t.string().primaryKey(),
      text: t.string(),
      hardJson: t.option(t.string()),
      warningsJson: t.string(),
      posteriorSummaryJson: t.option(t.string()),
      nextPairA: t.option(t.string()),
      nextPairB: t.option(t.string()),
      nextPairCategory: t.option(t.string()),
      swipeCount: t.u32(),
    }),
  ),
  (ctx) => {
    const me = currentMember(ctx.db, ctx.sender);
    const prefs = me && ctx.db.private_prefs.memberId.find(me.id);
    if (!me || !prefs) return undefined;
    const post = parse<{ mean: number[]; cov: number[][] }>(prefs.posteriorJson);
    const summary = post && FEATURES.map((name, i) => ({ name, mean: post.mean[i], sd: Math.sqrt(post.cov[i][i]) }));
    return {
      memberId: me.id, text: prefs.text, hardJson: prefs.hardJson, warningsJson: prefs.warningsJson,
      posteriorSummaryJson: summary ? JSON.stringify(summary) : undefined,
      nextPairA: prefs.nextPairA, nextPairB: prefs.nextPairB, nextPairCategory: prefs.nextPairCategory,
      swipeCount: me.swipeCount,
    };
  },
);

// Owner only: open offers for the caller on the group's latest run. Never says who benefits.
export const my_offers = spacetimedb.view(
  pub("my_offers"),
  t.array(
    t.row("MyOfferRow", {
      id: t.string().primaryKey(), runId: t.string(), type: t.string(), amount: t.f64(), unit: t.string(),
      text: t.string(), planJson: t.string(), robustnessGain: t.f64(), minRatioGain: t.f64(),
    }),
  ),
  (ctx) => {
    const me = currentMember(ctx.db, ctx.sender);
    const g = me && ctx.db.group.id.find(me.groupId);
    if (!me || !g) return [];
    const names = memberNames(ctx.db, g.id);
    return Array.from(ctx.db.offer.toMemberId.filter(me.id))
      .filter((o) => o.runId === g.latestRunId && o.status === "open")
      .map(({ id, runId, type, amount, unit, text, planJson, robustnessGain, minRatioGain }) => ({
        id, runId, type, amount, unit, text, robustnessGain, minRatioGain,
        // Always stripped, whatever showWhoCompromised says: an offer never reveals who benefits.
        planJson: JSON.stringify(stripPlan(JSON.parse(planJson), names)),
      }));
  },
);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// "Ana gave up novelty; Ben accepted a longer walk." -> "Someone gave up novelty; someone ..."
function anonymize(text: string, names: string[]) {
  let out = text;
  for (const n of names.filter(Boolean)) out = out.replace(new RegExp(`\\b${escapeRe(n)}\\b`, "gi"), "someone");
  return out.replace(/(^|[.!?]\s+)someone/g, (_m, pre) => `${pre}Someone`);
}

// Without showWhoCompromised, a plan must not say who compromised or how each person scores.
function stripPlan({ perMember, gaveUp, ...p }: any, names: string[]) {
  return { ...p, whyLine: p.whyLine ? anonymize(p.whyLine, names) : p.whyLine };
}

function memberNames(db: ReadDb, groupId: string) {
  return membersOf(db, groupId).map((m) => m.name);
}

function stripResult(json: string | undefined, showWho: boolean, names: string[]) {
  const r = parse(json);
  if (!r || showWho) return json;
  const { posteriorSummary, ...rest } = r;
  rest.plans = (rest.plans ?? []).map((p: any) => stripPlan(p, names));
  return JSON.stringify(rest);
}

export const my_plan_runs = spacetimedb.view(
  pub("my_plan_runs"),
  t.array(
    t.row("MyPlanRunRow", {
      runId: t.string().primaryKey(), status: t.string(), resultJson: t.option(t.string()),
      councilJson: t.option(t.string()), rouletteJson: t.option(t.string()), error: t.option(t.string()),
      stub: t.bool(), createdAt: t.f64(),
    }),
  ),
  (ctx) => {
    const g = myGroup(ctx);
    if (!g) return [];
    const names = memberNames(ctx.db, g.id);
    return runsOf(ctx.db, g.id).map((r) => ({
      runId: r.runId, status: r.status, resultJson: stripResult(r.resultJson, g.showWhoCompromised, names),
      councilJson: r.councilJson,
      rouletteJson: availablePlans(ctx.db, g.id, r.runId).some((p) => p.id === parse(r.rouletteJson)?.planId)
        ? r.rouletteJson : undefined,
      error: r.error, stub: r.stub, createdAt: r.createdAt,
    }));
  },
);

export const my_council_messages = spacetimedb.view(
  pub("my_council_messages"),
  t.array(
    t.row("MyCouncilMessageRow", {
      id: t.u64().primaryKey(), runId: t.string(), round: t.u32(), speaker: t.string(), label: t.string(),
      memberId: t.option(t.string()), planId: t.option(t.string()), stanceJson: t.option(t.string()),
      text: t.string(), citedJson: t.option(t.string()), ts: t.f64(),
    }),
  ),
  (ctx) => {
    const g = myGroup(ctx);
    if (!g) return [];
    return runsOf(ctx.db, g.id)
      .flatMap((r) => Array.from(ctx.db.council_message.runId.filter(r.runId)))
      .map((m) => ({ ...m, memberId: g.showWhoCompromised ? m.memberId : undefined }));
  },
);

export const my_scout = spacetimedb.view(pub("my_scout"), t.array(scout_check.rowType), (ctx) => {
  const g = myGroup(ctx);
  return g ? runsOf(ctx.db, g.id).flatMap((r) => Array.from(ctx.db.scout_check.runId.filter(r.runId))) : [];
});

export const my_votes = spacetimedb.view(pub("my_votes"), t.array(vote.rowType), (ctx) => {
  const g = myGroup(ctx);
  if (!g?.latestRunId) return [];
  const ids = new Set(availablePlans(ctx.db, g.id, g.latestRunId).map((p) => p.id));
  // Keep historical rows in storage; only currently usable votes count live.
  return Array.from(ctx.db.vote.runId.filter(g.latestRunId)).filter((v) => ids.has(v.planId));
});

export const my_bookings = spacetimedb.view(pub("my_bookings"), t.array(booking.rowType), (ctx) => {
  const g = myGroup(ctx);
  return g ? Array.from(ctx.db.booking.groupId.filter(g.id)) : [];
});

export const my_call_events = spacetimedb.view(pub("my_call_events"), t.array(call_event.rowType), (ctx) => {
  const g = myGroup(ctx);
  if (!g) return [];
  return Array.from(ctx.db.booking.groupId.filter(g.id)).flatMap((b) => Array.from(ctx.db.call_event.bookingId.filter(b.id)));
});

// The live venue catalog (lib/catalog.ts) is public listing data, not group state, so these
// two views are the same for every caller. Empty while the bundled catalog applies.
export const catalog_status = spacetimedb.view(pub("catalog_status"), t.option(t.row("CatalogStatusRow", {
  id: t.u32().primaryKey(), version: t.string(), generatedAt: t.string(), venueCount: t.u32(), updatedAt: t.f64(),
})), (ctx) => ctx.db.catalog_state.id.find(0) ?? undefined);

export const catalog_venues = spacetimedb.view(pub("catalog_venues"), t.array(t.row("CatalogVenueRow", {
  id: t.string().primaryKey(), name: t.string(), category: t.string(), cuisine: t.string(),
  address: t.string(), lat: t.f64(), lng: t.f64(), costPerPerson: t.f64(), rating: t.f64(), reviewCount: t.u32(),
  evidenceJson: t.string(), version: t.string(),
})), (ctx) => Array.from(ctx.db.venue.iter()).filter((v) => v.active).map((v) => {
  const p = JSON.parse(v.placeJson);
  return { id: v.id, name: p.name, category: p.category, cuisine: p.cuisine, address: p.address, lat: p.lat,
    lng: p.lng, costPerPerson: p.costPerPerson, rating: p.rating, reviewCount: p.reviewCount,
    evidenceJson: v.evidenceJson, version: v.version };
}));
