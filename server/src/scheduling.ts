// Calendar scheduling is separate from venue selection and restaurant simulation.
import { SenderError, t } from "spacetimedb/server";
import { requireMember } from "./groups";
import spacetimedb, { meetup_job, personal_meetup_job } from "./schema";
import { requireAccount, requireActor } from "./lib/account-state";
import { currentGroup, currentMember, membersOf, nowMs, at, parse } from "./lib/util";
import { authorizedCalendarSnapshots, persistCalendarRefresh } from "./connectors";
import { callApi } from "./lib/api";
import { catalogSnapshot, planningSnapshot } from "./lib/catalog";
import { LIVE_PLACES } from "./lib/places";
import { huddleLocation } from "./lib/location-state";
import { postalCity } from "../../shared/geography";
import { invalidateAgent, agentBallot, agentVotingChoices } from "./lib/agent-state";
import { clockMinutes } from "./lib/agent-constraints";
import type { ReadDb, Tx } from "./lib/types";
import { huddleTiming, saveHuddleTiming, memberTimePreference, TIME_OF_DAY } from "./lib/huddle-timing";

const result = t.object("ScheduleHuddleResult", { ok: t.bool(), message: t.string(), date: t.option(t.string()), windowStart: t.option(t.string()), windowEnd: t.option(t.string()) });
const failed = (message: string) => ({ ok: false, message, date: undefined, windowStart: undefined, windowEnd: undefined });
const venueTimeZone = "America/Los_Angeles";
type SchedulingVenue = { placeId: string; name: string; category: string; dwellMinutes: number; hours: Record<string, string[][]> };
function schedulingVenues(db: ReadDb, excluded: string[], groupId: string): SchedulingVenue[] {
  const { destinationCities } = huddleLocation(db, groupId);
  const places = planningSnapshot(catalogSnapshot(db), destinationCities)?.places ?? LIVE_PLACES;
  return places.filter(place => !excluded.includes(place.id) && (!destinationCities.length || destinationCities.includes(postalCity(place.address)))).map(place => ({
    placeId: place.id, name: place.name, category: place.category, dwellMinutes: place.dwellMinutes,
    hours: (place as typeof place & { hours?: Record<string, string[][]> }).hours ??
      { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
  }));
}
function mealFitsWindow(venues: SchedulingVenue[], chosen: { date: string; windowStart: string; windowEnd: string }) {
  const day = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date(`${chosen.date}T12:00:00Z`).getUTCDay()];
  return venues.some(venue => venue.category === "meal" && (venue.hours[day] ?? []).some(([opening, closing]) =>
    Math.min(clockMinutes(closing), clockMinutes(chosen.windowEnd)) -
      Math.max(clockMinutes(opening), clockMinutes(chosen.windowStart)) >= venue.dwellMinutes));
}
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
    throw new SenderError("Choose a valid date and ordered start/end times.");
  if (state.status === "planning") throw new SenderError("Wait for the current planning run before changing its time.");
  if (group.date === args.date && group.windowStart === args.windowStart && group.windowEnd === args.windowEnd && ["calendar", "manual"].includes(huddleTiming(tx.db, group.id).source)) return;
  invalidateAgent(tx, group.id);
  const fresh = tx.db.group.id.find(group.id)!;
  tx.db.group.id.update({ ...fresh, date: args.date, windowStart: args.windowStart, windowEnd: args.windowEnd });
  // A manually chosen time carries no claim that calendars were checked.
  tx.db.group_schedule.groupId.delete(group.id);
  saveHuddleTiming(tx, group.id, "manual");
});

function clearGroupTime(tx: Tx, groupId: string, legacyHostPreference?: string) {
  invalidateAgent(tx, groupId);
  const group = tx.db.group.id.find(groupId)!;
  tx.db.group.id.update({ ...group, date: "", windowStart: "", windowEnd: "" });
  tx.db.group_schedule.groupId.delete(groupId);
  saveHuddleTiming(tx, groupId, "pending", legacyHostPreference);
}

export const setHuddleTimePreference = spacetimedb.reducer({ timeOfDay: t.string() }, (tx, { timeOfDay }) => {
  const me = requireMember(tx), group = tx.db.group.id.find(me.groupId)!;
  const state = tx.db.agent_session.groupId.find(group.id);
  if (!state) throw new SenderError("Time preferences are available in coordinator Huddles.");
  if (!TIME_OF_DAY.has(timeOfDay)) throw new SenderError("Choose Any time, Morning, Afternoon or Evening.");
  if (state.status === "planning") throw new SenderError("Wait for the current planning run before changing your time preference.");
  if (memberTimePreference(tx.db, group.id, me.id) === timeOfDay) return;
  const preference = { memberId: me.id, timeOfDay };
  if (tx.db.member_time_preference.memberId.find(me.id)) tx.db.member_time_preference.memberId.update(preference);
  else tx.db.member_time_preference.insert(preference);
  // Keep the legacy timing column compatible for older host clients, but it no
  // longer filters out other participants' preferred windows.
  clearGroupTime(tx, group.id, me.identity.isEqual(group.hostIdentity) ? timeOfDay : undefined);
});

// Calendar-search failures must clear the selected window, never overwrite an
// individual's preference merely to reset shared scheduling state.
export const clearHuddleWindow = spacetimedb.reducer((tx) => {
  const group = hostGroup(tx), state = tx.db.agent_session.groupId.find(group.id)!;
  if (state.status === "planning") throw new SenderError("Wait for the current planning run before changing its time.");
  if (!group.date && !group.windowStart && !group.windowEnd && huddleTiming(tx.db, group.id).source === "pending") return;
  clearGroupTime(tx, group.id);
});

export const my_time_preference = spacetimedb.view({ name: "my_time_preference", public: true }, t.option(t.row("MyTimePreferenceRow", {
  memberId: t.string().primaryKey(), groupId: t.string(), timeOfDay: t.string(),
})), ctx => {
  const me = currentMember(ctx.db, ctx.sender);
  return me && ctx.db.agent_session.groupId.find(me.groupId)
    ? { memberId: me.id, groupId: me.groupId, timeOfDay: memberTimePreference(ctx.db, me.groupId, me.id) } : undefined;
});

export const my_huddle_timing = spacetimedb.view({ name: "my_huddle_timing", public: true }, t.option(t.row("MyHuddleTimingRow", {
  groupId: t.string().primaryKey(), timeOfDay: t.string(), source: t.string(),
})), ctx => {
  const group = currentGroup(ctx.db, ctx.sender);
  return group && ctx.db.agent_session.groupId.find(group.id) ? { groupId: group.id, ...huddleTiming(ctx.db, group.id) } : undefined;
});

export const scheduleHuddle = spacetimedb.procedure({ searchStart: t.string(), searchEnd: t.string(), dayStart: t.string(), dayEnd: t.string(), durationMinutes: t.u32(), timeZone: t.string() }, result,
  (ctx, args) => {
    const from = Date.parse(args.searchStart), until = Date.parse(args.searchEnd);
    if (!Number.isFinite(from) || !Number.isFinite(until) || until <= from || until - from > 14 * 86400_000 ||
        !Number.isFinite(clockMinutes(args.dayStart)) || !Number.isFinite(clockMinutes(args.dayEnd)) || args.dayStart >= args.dayEnd ||
        args.durationMinutes !== 0 && args.durationMinutes < 15 || args.durationMinutes > 720 || args.timeZone !== venueTimeZone)
      throw new SenderError("Use a date range up to 14 days, a daytime window and an outing length of 15–720 minutes, or Automatic.");
    const snapshot = ctx.withTx(tx => {
      const group = hostGroup(tx), state = tx.db.agent_session.groupId.find(group.id)!;
      const { account, session } = requireAccount(tx);
      if (state.status === "planning") throw new SenderError("Wait for the current planning run before changing its time.");
      const members = membersOf(tx.db, group.id), connections = authorizedCalendarSnapshots(tx.db, group.id);
      if (members.length < 2 || connections.length !== members.length) throw new SenderError("Every participant must connect their own Google Calendar before checking a common time.");
      return { groupId: group.id, revision: state.revision, accountId: account.id, sessionNonce: session.nonce,
        timeOfDay: huddleTiming(tx.db, group.id).timeOfDay,
        venues: schedulingVenues(tx.db, group.excludedPlaceIds, group.id),
        connections, members: connections.map(connection => {
          const need = tx.db.agent_need.memberId.find(connection.memberId);
          const hard = parse(tx.db.private_prefs.memberId.find(connection.memberId)?.hardJson);
          return { accountId: connection.accountId, timeOfDay: memberTimePreference(tx.db, group.id, connection.memberId), prompt: need?.text ?? "", maxOutingMinutes: hard?.maxOutingMinutes ?? null };
        }) };
    });
    const duration = args.durationMinutes || Math.floor(Math.min(120, ...snapshot.members.map(member => member.maxOutingMinutes ?? 720)));
    if (duration < 15 || snapshot.members.some(member => member.maxOutingMinutes != null && duration > member.maxOutingMinutes))
      return failed("The requested length exceeds a participant's private outing limit. Try a shorter outing; no limits were changed.");
    // Explicit search bounds are hard; each member's day-part choice is soft
    // context for Claude, not a host-only veto over the search range.
    const dayStart = args.dayStart, dayEnd = args.dayEnd;
    const response = callApi(ctx, "/connectors/calendar/schedule", {
      connections: snapshot.connections.map(({ accountId, tokenCiphertext }) => ({ accountId, tokenCiphertext })),
      members: snapshot.members, timeMin: args.searchStart, timeMax: args.searchEnd,
      dayStart, dayEnd, durationMinutes: duration, timeZone: args.timeZone, venues: snapshot.venues,
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
      if (!data.ok) return failed("No common opening fits this date range, everyone's outing-length limits and meal opening hours. Try other dates or a shorter outing.");
      const chosen = data.chosen;
      const start = Date.parse(chosen?.start), end = Date.parse(chosen?.end);
      if (!chosen || typeof chosen.start !== "string" || typeof chosen.end !== "string" ||
          typeof chosen.date !== "string" || !validDate(chosen.date) || !Number.isFinite(start) || !Number.isFinite(end) || start < Math.max(from, nowMs(tx)) || end > until ||
          end - start !== duration * 60000 || chosen.timeZone !== args.timeZone ||
          !/^\d{4}-\d{2}-\d{2}$/.test(chosen.date) || chosen.start.slice(0, 10) !== chosen.date || chosen.end.slice(0, 10) !== chosen.date ||
          chosen.start.slice(11, 16) !== chosen.windowStart || chosen.end.slice(11, 16) !== chosen.windowEnd ||
          chosen.windowStart < dayStart || chosen.windowEnd > dayEnd ||
          !Number.isFinite(clockMinutes(chosen.windowStart)) || !Number.isFinite(clockMinutes(chosen.windowEnd)) || chosen.windowStart >= chosen.windowEnd)
        return failed("The proposed calendar window could not be validated. No date was changed.");
      if (!mealFitsWindow(snapshot.venues, chosen) || !mealFitsWindow(schedulingVenues(tx.db, group.excludedPlaceIds, group.id), chosen))
        return failed("Meal opening hours do not fit that calendar window. Request another time; no date was changed.");
      invalidateAgent(tx, group.id);
      const fresh = tx.db.group.id.find(group.id)!;
      tx.db.group.id.update({ ...fresh, date: chosen.date, windowStart: chosen.windowStart, windowEnd: chosen.windowEnd });
      const metadata = { groupId: group.id, timeZone: chosen.timeZone, start: chosen.start, end: chosen.end, checkedAt: nowMs(tx) };
      if (tx.db.group_schedule.groupId.find(group.id)) tx.db.group_schedule.groupId.update(metadata); else tx.db.group_schedule.insert(metadata);
      saveHuddleTiming(tx, group.id, "calendar");
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

// The public arguments intentionally contain no account ID or calendar ID.
// The authenticated caller alone selects the destination account.
export const confirmMeetup = spacetimedb.reducer({ runId: t.string(), planId: t.string() }, (tx, args) => {
  const { account } = requireAccount(tx);
  const group = currentGroup(tx.db, tx.sender);
  const state = group && tx.db.agent_session.groupId.find(group.id);
  if (!group || !state) throw new SenderError("Open your Huddle before adding a meetup.");
  if (!chosenPlan(tx.db, group.id, args.runId, args.planId)) throw new SenderError("Everyone must vote for a current timed plan before adding a meetup.");
  const connection = authorizedCalendarSnapshots(tx.db, group.id).find(c => c.accountId === account.id && c.eventConsent);
  if (!connection) throw new SenderError("Connect your own Calendar and allow agreed meetup events first.");
  const id = `${args.runId}:${account.id}`;
  if (tx.db.personal_meetup.id.find(id)) throw new SenderError("You already have a calendar request for this run. Check its status.");
  if (Array.from(tx.db.personal_meetup.groupId.filter(group.id)).some(row => row.accountId === account.id &&
      ["pending", "sending", "created", "unknown"].includes(row.status)))
    throw new SenderError("You already have a calendar submission for this Huddle. Revised plans do not update existing entries; check your calendar first.");
  tx.db.personal_meetup.insert({ id, runId: args.runId, accountId: account.id, groupId: group.id, planId: args.planId,
    connectionGeneration: connection.generation, inputRevision: state.revision,
    status: "pending", message: "Waiting to add this meetup to your calendar.", createdAt: nowMs(tx) });
  tx.db.personal_meetup_job.insert({ ...at(tx), requestId: id });
});

// Retire queued group-wide writes. Earlier events remain provider facts; they
// are not deleted or changed. New requests must come from each calendar owner.
export const runMeetupJob = spacetimedb.procedure({ onSchedule: meetup_job }, { job: meetup_job.rowType }, t.unit(), (ctx, { job }) => {
  ctx.withTx(tx => {
    const row = tx.db.meetup.runId.find(job.runId);
    if (!row || !["pending", "sending"].includes(row.status)) return;
    tx.db.meetup.runId.update({ ...row, status: row.status === "sending" ? "unknown" : "stale",
      message: "Group calendar requests are retired. Each participant can add the meetup from their own account." });
  });
  return {};
});

export const runPersonalMeetupJob = spacetimedb.procedure({ onSchedule: personal_meetup_job },
  { job: personal_meetup_job.rowType }, t.unit(), (ctx, { job }) => {
  const snapshot = ctx.withTx(tx => {
    const meetup = tx.db.personal_meetup.id.find(job.requestId);
    if (!meetup) return null;
    if (meetup.status === "sending") {
      tx.db.personal_meetup.id.update({ ...meetup, status: "unknown", message: "Calendar submission status is unknown. Check your calendar before another request." });
      return null;
    }
    if (meetup.status !== "pending") return null;
    const state = tx.db.agent_session.groupId.find(meetup.groupId);
    const group = tx.db.group.id.find(meetup.groupId);
    const plan = chosenPlan(tx.db, meetup.groupId, meetup.runId, meetup.planId);
    const connection = authorizedCalendarSnapshots(tx.db, meetup.groupId).find(c => c.accountId === meetup.accountId &&
      c.eventConsent && c.generation === meetup.connectionGeneration);
    if (!group || state?.revision !== meetup.inputRevision || !plan || !connection) {
      tx.db.personal_meetup.id.update({ ...meetup, status: "stale", message: "The plan or your calendar connection/consent changed. No meetup was added." });
      return null;
    }
    tx.db.personal_meetup.id.update({ ...meetup, status: "sending", message: "Adding this meetup to your calendar." });
    tx.db.personal_meetup_job.insert({ ...at(tx, 45_000), requestId: meetup.id });
    return { meetup, connection, body: { meetingId: meetup.runId,
      connections: [{ accountId: connection.accountId, tokenCiphertext: connection.tokenCiphertext }],
      summary: "Huddle meetup", location: plan.stops[0].name, date: group.date,
      startTime: plan.stops[0].start, endTime: plan.stops.at(-1).end,
      timeZone: tx.db.group_schedule.groupId.find(group.id)?.timeZone ?? "America/Los_Angeles" } };
  });
  if (!snapshot) return {};
  const response = callApi(ctx, "/connectors/calendar/meetup", snapshot.body);
  ctx.withTx(tx => {
    const row = tx.db.personal_meetup.id.find(job.requestId);
    if (!row || row.status !== "sending") return;
    const data = response.ok && !response.stub ? response.data : null;
    const valid = data && Array.isArray(data.created) && Array.isArray(data.failed) && Array.isArray(data.updatedConnections) &&
      [...data.created, ...data.failed].length === 1 && data.updatedConnections.length <= 1 &&
      data.updatedConnections.every((u: any) => u?.accountId === snapshot.meetup.accountId &&
        typeof u.tokenCiphertext === "string" && u.tokenCiphertext.length >= 16 && u.tokenCiphertext.length <= 32000) &&
      [...data.created, ...data.failed].every((r: any) => r?.accountId === snapshot.meetup.accountId) &&
      data.created.every((r: any) => typeof r.eventId === "string" && r.eventId.trim().length > 0 && r.eventId.length <= 1024 && typeof r.alreadyExisted === "boolean") &&
      data.failed.every((r: any) => typeof r.message === "string" && r.message.trim().length > 0 && r.message.length <= 2000);
    if (!valid) {
      tx.db.personal_meetup.id.update({ ...row, status: "unknown", message: "Calendar submission status is unknown. Check your calendar before another request." });
      return;
    }
    // A refresh can update only the requesting owner's still-current credential.
    persistCalendarRefresh(tx, data.updatedConnections, [snapshot.connection]);
    const status = data.created.length === 1 ? "created" : "failed";
    tx.db.personal_meetup.id.update({ ...row, status, message: status === "created"
      ? "Meetup added to your calendar. Your friends add it separately."
      : "The meetup could not be added to your calendar. Check your connection and availability." });
  });
  return {};
});

export const my_meetup = spacetimedb.view({ name: "my_meetup", public: true }, t.option(t.row("MyMeetupRow", {
  runId: t.string().primaryKey(), planId: t.string(), status: t.string(), message: t.string(),
})), ctx => {
  const session = ctx.db.account_session.identity.find(ctx.sender);
  const account = session?.accountId && ctx.db.account.id.find(session.accountId);
  const group = account && currentGroup(ctx.db, ctx.sender);
  if (!group || !account) return undefined;
  const rows = Array.from(ctx.db.personal_meetup.accountId.filter(account.id)).filter(r => r.groupId === group.id);
  const row = rows.find(r => r.runId === group.latestRunId) ?? rows.sort((a, b) => b.createdAt - a.createdAt)[0];
  return row ? { runId: row.runId, planId: row.planId, status: row.status, message: row.message } : undefined;
});
