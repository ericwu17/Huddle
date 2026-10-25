import type { ReadDb, Tx } from "./types";
import { authorizedCalendarSnapshots } from "../connectors";

export const TIME_OF_DAY = new Set(["flexible", "morning", "afternoon", "evening"]);
export const TIME_OF_DAY_WINDOWS: Record<string, [string, string]> = {
  flexible: ["00:00", "23:59"], morning: ["06:00", "12:00"],
  afternoon: ["12:00", "17:00"], evening: ["17:00", "23:59"],
};

// Legacy seed dates are not evidence of a chosen outing. Calendar metadata or
// an explicit manual selection establishes the time for new planning work.
export function huddleTiming(db: ReadDb, groupId: string) {
  const row = db.huddle_timing.groupId.find(groupId);
  const members = Array.from(db.member.groupId.filter(groupId));
  const connections = authorizedCalendarSnapshots(db, groupId);
  const calendarCurrent = !!db.group_schedule.groupId.find(groupId) && row?.source === "calendar" &&
    row.membersKey === members.map(member => member.id).sort().join("|") && members.length >= 2 && connections.length === members.length;
  return { timeOfDay: row?.timeOfDay ?? "flexible",
    source: calendarCurrent ? "calendar" : row?.source === "manual" || row?.source === "auto" ? row.source : "pending" };
}

// Planning windows for an automatically chosen time, by participant preference.
const AUTO_WINDOWS: Record<string, [string, string]> = {
  morning: ["09:00", "12:00"], afternoon: ["12:00", "17:00"], evening: ["17:00", "22:00"], flexible: ["17:00", "22:00"],
};

// US Pacific time without Intl: daylight time runs from 2 AM on the second
// Sunday of March to 2 AM on the first Sunday of November.
function pacificNow(ms: number) {
  const year = new Date(ms).getUTCFullYear();
  const sunday = (month: number, nth: number) => 1 + (7 - new Date(Date.UTC(year, month, 1)).getUTCDay()) % 7 + (nth - 1) * 7;
  const daylight = ms >= Date.UTC(year, 2, sunday(2, 2), 10) && ms < Date.UTC(year, 10, sunday(10, 1), 9);
  const local = new Date(ms + (daylight ? -7 : -8) * 3600_000);
  return { date: local.toISOString().slice(0, 10), minutes: local.getUTCHours() * 60 + local.getUTCMinutes() };
}

// Every coordinator run plans for a concrete date and window. Without a
// calendar or manual choice, use the participants' most common day part on the
// next day it can still start (an hour's notice), and record it as automatic.
export function ensureOutingWindow(tx: Tx, groupId: string, nowMs: number) {
  const source = huddleTiming(tx.db, groupId).source;
  const group = tx.db.group.id.find(groupId);
  if (!group || source === "calendar" || source === "manual" && group.date && group.windowStart && group.windowEnd) return;
  const counts = new Map<string, number>();
  for (const member of tx.db.member.groupId.filter(groupId)) {
    const preference = memberTimePreference(tx.db, groupId, member.id);
    if (preference !== "flexible") counts.set(preference, (counts.get(preference) ?? 0) + 1);
  }
  const preference = ["evening", "afternoon", "morning"].reduce((best, part) =>
    (counts.get(part) ?? 0) > (counts.get(best) ?? 0) ? part : best, "flexible");
  const [windowStart, windowEnd] = AUTO_WINDOWS[preference];
  const now = pacificNow(nowMs);
  const [hour, minute] = windowStart.split(":").map(Number);
  const date = now.minutes + 60 <= hour * 60 + minute ? now.date
    : new Date(Date.parse(`${now.date}T12:00:00Z`) + 86400_000).toISOString().slice(0, 10);
  tx.db.group.id.update({ ...group, date, windowStart, windowEnd });
  saveHuddleTiming(tx, groupId, "auto");
}

export function saveHuddleTiming(tx: Tx, groupId: string, source: string, timeOfDay?: string) {
  const old = tx.db.huddle_timing.groupId.find(groupId);
  const row = { groupId, timeOfDay: timeOfDay ?? old?.timeOfDay ?? "flexible", source,
    membersKey: source === "calendar" ? Array.from(tx.db.member.groupId.filter(groupId)).map(member => member.id).sort().join("|") : "" };
  if (old) tx.db.huddle_timing.groupId.update(row); else tx.db.huddle_timing.insert(row);
}

// Private to each membership. Preserve a legacy host preference until that host
// explicitly changes it; other participants default to Flexible.
export function memberTimePreference(db: ReadDb, groupId: string, memberId: string): string {
  const personal = db.member_time_preference.memberId.find(memberId);
  if (personal) return personal.timeOfDay;
  const group = db.group.id.find(groupId), member = db.member.id.find(memberId);
  return group && member?.identity.isEqual(group.hostIdentity)
    ? db.huddle_timing.groupId.find(groupId)?.timeOfDay ?? "flexible" : "flexible";
}
