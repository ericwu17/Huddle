// Calendar scheduling is separate from venue selection and restaurant simulation.
import { SenderError, t } from "spacetimedb/server";
import spacetimedb, { meetup_job } from "./schema";
import { requireAccount, requireActor } from "./lib/account-state";
import { currentGroup, currentMember, membersOf, nowMs, at, parse } from "./lib/util";
import { authorizedCalendarSnapshots, persistCalendarRefresh } from "./connectors";
import { callApi } from "./lib/api";
import { invalidateAgent, agentBallot, agentVotingChoices } from "./lib/agent-state";
import { clockMinutes } from "./lib/agent-constraints";
import type { ReadDb, Tx } from "./lib/types";

const result = t.object("ScheduleHuddleResult", { ok: t.bool(), message: t.string(), date: t.option(t.string()), windowStart: t.option(t.string()), windowEnd: t.option(t.string()) });
const failed = (message: string) => ({ ok: false, message, date: undefined, windowStart: undefined, windowEnd: undefined });
const venueTimeZone = "America/Los_Angeles";
function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function hostGroup(tx: Tx) {
  requireAccount(tx);
  const group = currentGroup(tx.db, tx.sender);
  if (!group || !group.hostIdentity.isEqual(requireActor(tx))) throw new SenderError("Only the current Huddle's host can do this.");
  if (!tx.db.agent_session.groupId.find(group.id)) throw new SenderError("Calendar scheduling is available in coordinator Huddles.");
  return group;
}

export const setHuddleWindow = spacetimedb.reducer({ date: t.string(), windowStart: t.string(), windowEnd: t.string(), timeZone: t.string() }, (tx, args) => {
  const group = hostGroup(tx), state = tx.db.agent_session.groupId.find(group.id)!;
  if (!validDate(args.date) || !Number.isFinite(clockMinutes(args.windowStart)) ||
      !Number.isFinite(clockMinutes(args.windowEnd)) || args.windowStart >= args.windowEnd || args.timeZone !== venueTimeZone)
    throw new SenderError("Choose a valid date and ordered start/end times in Berkeley time.");
  if (state.status === "planning") throw new SenderError("Wait for the current planning run before changing its time.");
  if (group.date === args.date && group.windowStart === args.windowStart && group.windowEnd === args.windowEnd) return;
  invalidateAgent(tx, group.id);
  const fresh = tx.db.group.id.find(group.id)!;
  tx.db.group.id.update({ ...fresh, date: args.date, windowStart: args.windowStart, windowEnd: args.windowEnd });
  // A manually chosen time carries no claim that calendars were checked.
  tx.db.group_schedule.groupId.delete(group.id);
});

export const scheduleHuddle = spacetimedb.procedure({ searchStart: t.string(), searchEnd: t.string(), dayStart: t.string(), dayEnd: t.string(), durationMinutes: t.u32(), timeZone: t.string() }, result,
  (ctx, args) => {
    const from = Date.parse(args.searchStart), until = Date.parse(args.searchEnd);
    if (!Number.isFinite(from) || !Number.isFinite(until) || until <= from || until - from > 14 * 86400_000 ||
        !Number.isFinite(clockMinutes(args.dayStart)) || !Number.isFinite(clockMinutes(args.dayEnd)) || args.dayStart >= args.dayEnd ||
        args.durationMinutes < 15 || args.durationMinutes > 720 || args.timeZone !== venueTimeZone)
      throw new SenderError("Use a date range up to 14 days, a daytime window and an outing length of 15–720 minutes in Berkeley time.");
    const snapshot = ctx.withTx(tx => {
      const group = hostGroup(tx), state = tx.db.agent_session.groupId.find(group.id)!;
      const { account, session } = requireAccount(tx);
      if (state.status === "planning") throw new SenderError("Wait for the current planning run before changing its time.");
      const members = membersOf(tx.db, group.id), connections = authorizedCalendarSnapshots(tx.db, group.id);
      if (members.length < 2 || connections.length !== members.length) throw new SenderError("Every participant must connect their own Google Calendar before checking a common time.");
      return { groupId: group.id, revision: state.revision, accountId: account.id, sessionNonce: session.nonce,
        connections, members: connections.map(connection => {
          const need = tx.db.agent_need.memberId.find(connection.memberId);
          const hard = parse(tx.db.private_prefs.memberId.find(connection.memberId)?.hardJson);
          return { accountId: connection.accountId, prompt: need?.text ?? "", maxOutingMinutes: hard?.maxOutingMinutes ?? null };
        }) };
    });
    if (snapshot.members.some(member => member.maxOutingMinutes != null && args.durationMinutes > member.maxOutingMinutes))
      return failed("The requested length exceeds a participant's private outing limit. Try a shorter outing; no limits were changed.");
    const response = callApi(ctx, "/connectors/calendar/schedule", {
      connections: snapshot.connections.map(({ accountId, tokenCiphertext }) => ({ accountId, tokenCiphertext })),
      members: snapshot.members, timeMin: args.searchStart, timeMax: args.searchEnd,
      dayStart: args.dayStart, dayEnd: args.dayEnd, durationMinutes: args.durationMinutes, timeZone: args.timeZone,
    });
    return ctx.withTx(tx => {
      const group = hostGroup(tx), { account, session } = requireAccount(tx);
      const state = tx.db.agent_session.groupId.find(group.id)!;
      if (group.id !== snapshot.groupId || state.revision !== snapshot.revision || account.id !== snapshot.accountId || session.nonce !== snapshot.sessionNonce)
        return failed("The Huddle changed while checking calendars. Request a fresh time; no date was changed.");
      const data = response.ok && !response.stub ? response.data : null;
      if (!data || typeof data.ok !== "boolean" || !Array.isArray(data.updatedConnections))
        return failed("Could not check every calendar or choose a time. Connections are saved; retry after setup.");
      if (!persistCalendarRefresh(tx, data.updatedConnections, snapshot.connections))
        return failed("A calendar connection changed. Check availability again; no date was changed.");
      if (!data.ok) return failed("No common opening fits this date range and everyone's private outing-length limits. Try other dates or a shorter outing.");
      const chosen = data.chosen;
      const start = Date.parse(chosen?.start), end = Date.parse(chosen?.end);
      if (!chosen || typeof chosen.start !== "string" || typeof chosen.end !== "string" ||
          typeof chosen.date !== "string" || !validDate(chosen.date) || !Number.isFinite(start) || !Number.isFinite(end) || start < Math.max(from, nowMs(tx)) || end > until ||
          end - start !== args.durationMinutes * 60000 || chosen.timeZone !== args.timeZone ||
          !/^\d{4}-\d{2}-\d{2}$/.test(chosen.date) || chosen.start.slice(0, 10) !== chosen.date || chosen.end.slice(0, 10) !== chosen.date ||
          chosen.start.slice(11, 16) !== chosen.windowStart || chosen.end.slice(11, 16) !== chosen.windowEnd ||
          chosen.windowStart < args.dayStart || chosen.windowEnd > args.dayEnd ||
          !Number.isFinite(clockMinutes(chosen.windowStart)) || !Number.isFinite(clockMinutes(chosen.windowEnd)) || chosen.windowStart >= chosen.windowEnd)
        return failed("The proposed calendar window could not be validated. No date was changed.");
      invalidateAgent(tx, group.id);
      const fresh = tx.db.group.id.find(group.id)!;
      tx.db.group.id.update({ ...fresh, date: chosen.date, windowStart: chosen.windowStart, windowEnd: chosen.windowEnd });
      const metadata = { groupId: group.id, timeZone: chosen.timeZone, start: chosen.start, end: chosen.end, checkedAt: nowMs(tx) };
      if (tx.db.group_schedule.groupId.find(group.id)) tx.db.group_schedule.groupId.update(metadata); else tx.db.group_schedule.insert(metadata);
      return { ok: true, message: "A common primary-calendar opening is now the Huddle's date and time. Review it before finding plans; no calendar event was created.", date: chosen.date, windowStart: chosen.windowStart, windowEnd: chosen.windowEnd };
    });
  },
);

function chosenPlan(db: ReadDb, groupId: string, runId: string, planId: string) {
  if (agentBallot(db, groupId, runId).winner !== planId) return null;
  // Calendar records the agreed meetup time. A provisional venue does not
  // certify a restaurant, and an untimed suggestion supplies no event window.
  return agentVotingChoices(db, groupId, runId).find(p => p.id === planId && Array.isArray(p.stops) && p.stops.length > 0) ?? null;
}

export const confirmMeetup = spacetimedb.reducer({ runId: t.string(), planId: t.string() }, (tx, args) => {
  const group = hostGroup(tx), state = tx.db.agent_session.groupId.find(group.id)!;
  if (!chosenPlan(tx.db, group.id, args.runId, args.planId)) throw new SenderError("Everyone must vote for a current timed plan before adding a meetup.");
  const connections = authorizedCalendarSnapshots(tx.db, group.id).filter(c => c.eventConsent);
  if (!connections.length) throw new SenderError("At least one participant must connect Calendar and allow agreed meetup events.");
  if (tx.db.meetup.runId.find(args.runId)) throw new SenderError("This run already has a calendar request. Check its status before creating another meetup.");
  if (Array.from(tx.db.meetup.groupId.filter(group.id)).some(row => ["pending", "sending", "created", "partial", "unknown"].includes(row.status)))
    throw new SenderError("This Huddle already has a calendar submission. Revised plans do not update existing calendar entries; check those entries first.");
  tx.db.meetup.insert({ runId: args.runId, groupId: group.id, planId: args.planId, inputRevision: state.revision,
    status: "pending", message: "Waiting to add the agreed meetup to opted-in calendars.", createdAt: nowMs(tx) });
  tx.db.meetup_job.insert({ ...at(tx), runId: args.runId });
});

export const runMeetupJob = spacetimedb.procedure({ onSchedule: meetup_job }, { job: meetup_job.rowType }, t.unit(), (ctx, { job }) => {
  const snapshot = ctx.withTx(tx => {
    const meetup = tx.db.meetup.runId.find(job.runId);
    if (!meetup) return null;
    if (meetup.status === "sending") {
      tx.db.meetup.runId.update({ ...meetup, status: "unknown", message: "Calendar submission status is unknown. Check your calendar before another meetup request." });
      return null;
    }
    if (meetup.status !== "pending") return null;
    const state = tx.db.agent_session.groupId.find(meetup.groupId);
    const group = tx.db.group.id.find(meetup.groupId);
    const plan = chosenPlan(tx.db, meetup.groupId, meetup.runId, meetup.planId);
    const connections = authorizedCalendarSnapshots(tx.db, meetup.groupId).filter(c => c.eventConsent);
    if (!group || state?.revision !== meetup.inputRevision || !plan || !connections.length) {
      tx.db.meetup.runId.update({ ...meetup, status: "stale", message: "The plan or calendar consent changed. No meetup was added." });
      return null;
    }
    tx.db.meetup.runId.update({ ...meetup, status: "sending", message: "Adding the agreed meetup to opted-in calendars." });
    tx.db.meetup_job.insert({ ...at(tx, 45_000), runId: meetup.runId });
    return { meetup, connections, body: { meetingId: meetup.runId,
      connections: connections.map(({ accountId, tokenCiphertext }) => ({ accountId, tokenCiphertext })),
      summary: "Huddle meetup", location: plan.stops[0].name, date: group.date,
      startTime: plan.stops[0].start, endTime: plan.stops.at(-1).end,
      timeZone: tx.db.group_schedule.groupId.find(group.id)?.timeZone ?? "America/Los_Angeles" } };
  });
  if (!snapshot) return {};
  const response = callApi(ctx, "/connectors/calendar/meetup", snapshot.body);
  ctx.withTx(tx => {
    const row = tx.db.meetup.runId.find(job.runId);
    if (!row || row.status !== "sending") return;
    const data = response.ok && !response.stub ? response.data : null;
    const ids = new Set(snapshot.connections.map(c => c.accountId));
    const valid = data && Array.isArray(data.created) && Array.isArray(data.failed) && Array.isArray(data.updatedConnections) &&
      [...data.created, ...data.failed].length === ids.size && [...data.created, ...data.failed].every((r: any) => r && ids.has(r.accountId)) &&
      new Set([...data.created, ...data.failed].map((r: any) => r.accountId)).size === ids.size &&
      data.created.every((r: any) => typeof r.eventId === "string" && r.eventId.trim().length > 0 && r.eventId.length <= 1024 && typeof r.alreadyExisted === "boolean") &&
      data.failed.every((r: any) => typeof r.message === "string" && r.message.trim().length > 0 && r.message.length <= 2000);
    if (!valid) {
      tx.db.meetup.runId.update({ ...row, status: "unknown", message: "Calendar submission status is unknown. Check your calendar before another meetup request." });
      return;
    }
    // Credentials cannot be revived after an opt-out. External writes are facts
    // even when a participant changes consent while the provider is responding.
    persistCalendarRefresh(tx, data.updatedConnections, snapshot.connections);
    const status = data.created.length === ids.size ? "created" : data.created.length ? "partial" : "failed";
    tx.db.meetup.runId.update({ ...row, status, message: status === "created"
      ? `Meetup added to ${ids.size} opted-in calendar${ids.size === 1 ? "" : "s"}. This is not a restaurant reservation.`
      : status === "partial" ? "Some calendar entries were added. Other calendars need attention; no automatic retry was sent."
      : "Calendar entries could not be added. Check the connections and current availability." });
  });
  return {};
});

export const my_meetup = spacetimedb.view({ name: "my_meetup", public: true }, t.option(t.row("MyMeetupRow", {
  runId: t.string().primaryKey(), planId: t.string(), status: t.string(), message: t.string(),
})), ctx => {
  const group = currentGroup(ctx.db, ctx.sender);
  const row = group && ((group.latestRunId && ctx.db.meetup.runId.find(group.latestRunId)) ||
    Array.from(ctx.db.meetup.groupId.filter(group.id)).sort((a, b) => b.createdAt - a.createdAt)[0]);
  return row && row.groupId === group?.id ? { runId: row.runId, planId: row.planId, status: row.status, message: row.message } : undefined;
});
