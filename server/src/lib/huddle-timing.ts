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
    source: calendarCurrent ? "calendar" : row?.source === "manual" ? "manual" : "pending" };
}

export function saveHuddleTiming(tx: Tx, groupId: string, source: string, timeOfDay?: string) {
  const old = tx.db.huddle_timing.groupId.find(groupId);
  const row = { groupId, timeOfDay: timeOfDay ?? old?.timeOfDay ?? "flexible", source,
    membersKey: source === "calendar" ? Array.from(tx.db.member.groupId.filter(groupId)).map(member => member.id).sort().join("|") : "" };
  if (old) tx.db.huddle_timing.groupId.update(row); else tx.db.huddle_timing.insert(row);
}
