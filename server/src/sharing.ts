// Public result links contain venue facts only. Creating a link requires a
// current participant's explicit action; reading it grants no Huddle access.
import { SenderError, t } from "spacetimedb/server";
import spacetimedb from "./schema";
import { requireMember } from "./groups";
import { agentBallot, agentVotingChoices } from "./lib/agent-state";
import { catalogSnapshot } from "./lib/catalog";
import { LIVE_PLACES } from "./lib/places";
import { nowMs } from "./lib/util";
import type { ReadDb, Tx } from "./lib/types";
import { huddleTiming } from "./lib/huddle-timing";

const unavailable = () => ({ ok: false, resultJson: undefined });
const SHARE_ID = /^share_[0-9a-f]{64}$/;

function publicResult(db: ReadDb, groupId: string, runId: string, planId: string, revision: number) {
  const group = db.group.id.find(groupId), session = db.agent_session.groupId.find(groupId);
  if (!group || session?.revision !== revision || !["ready", "blocked"].includes(session.status) ||
      agentBallot(db, groupId, runId).winner !== planId) return null;
  const choice = agentVotingChoices(db, groupId, runId).find(choice => choice.id === planId);
  if (!choice) return null;
  const places = catalogSnapshot(db)?.places ?? LIVE_PLACES;
  const timeZone = db.group_schedule.groupId.find(groupId)?.timeZone ?? "America/Los_Angeles";
  if (!Array.isArray(choice.stops)) {
    const place = places.find(place => place.id === choice.placeId);
    if (!place) return null;
    return { date: huddleTiming(db, group.id).source === "pending" ? null : group.date, timeZone,
      choice: { id: choice.id, placeId: place.id, summary: place.name, limitations: [] } };
  }
  if (!choice.stops.length || typeof choice.travelMinutes !== "number" || !Number.isFinite(choice.travelMinutes) || choice.travelMinutes < 0) return null;
  const stops = choice.stops.map((stop: any) => ({ placeId: stop.placeId, name: stop.name, category: stop.category,
    lat: stop.lat, lng: stop.lng, start: stop.start, end: stop.end, costPerPerson: stop.costPerPerson }));
  const route = stops.map((stop: any) => stop.name).join(" → ");
  return { date: group.date, timeZone, choice: { id: choice.id, title: "Our Huddle", stops,
    costPerPerson: choice.costPerPerson, travelMinutes: choice.travelMinutes, status: choice.status ?? "ready",
    summary: route, whyLine: route, limitations: [] } };
}

function shareId(tx: Tx) {
  for (;;) {
    const bytes = tx.random.fill(new Uint8Array(32));
    const id = `share_${Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("")}`;
    if (!tx.db.result_share.id.find(id)) return id;
  }
}

export const createResultShare = spacetimedb.procedure({ runId: t.string(), planId: t.string() },
  t.object("CreateResultShareResult", { shareId: t.string() }), (ctx, { runId, planId }) => ctx.withTx(tx => {
    const member = requireMember(tx), session = tx.db.agent_session.groupId.find(member.groupId);
    if (!session || !runId || runId.length > 200 || !planId || planId.length > 200 ||
        !publicResult(tx.db, member.groupId, runId, planId, session.revision))
      throw new SenderError("Finish the current vote and choose its winner before sharing this result.");
    const existing = Array.from(tx.db.result_share.groupId.filter(member.groupId)).find(row =>
      row.runId === runId && row.planId === planId && row.inputRevision === session.revision);
    if (existing) return { shareId: existing.id };
    const id = shareId(tx);
    tx.db.result_share.insert({ id, groupId: member.groupId, runId, planId, inputRevision: session.revision, createdAt: nowMs(tx) });
    return { shareId: id };
  }));

export const getResultShare = spacetimedb.procedure({ shareId: t.string() },
  t.object("GetResultShareResult", { ok: t.bool(), resultJson: t.option(t.string()) }), (ctx, { shareId }) => ctx.withTx(tx => {
    if (!SHARE_ID.test(shareId)) return unavailable();
    const row = tx.db.result_share.id.find(shareId);
    if (!row) return unavailable();
    const result = publicResult(tx.db, row.groupId, row.runId, row.planId, row.inputRevision);
    return result ? { ok: true, resultJson: JSON.stringify(result) } : unavailable();
  }));
