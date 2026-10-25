import type { AgentPlan } from "./agentData";
import { OUTING_TIME_ZONE } from "./calendarTime";

function calendarText(value: string) {
  return value.replaceAll("\\", "\\\\").replace(/\r\n|\n|\r/g, "\\n").replaceAll(";", "\\;").replaceAll(",", "\\,");
}

// RFC 5545 limits content lines to 75 octets, including a continuation space.
function foldLine(line: string) {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  let current = "", bytes = 0;
  for (const character of line) {
    const width = encoder.encode(character).length;
    if (bytes + width > 75) { lines.push(current); current = " "; bytes = 1; }
    current += character; bytes += width;
  }
  lines.push(current);
  return lines.join("\r\n");
}

export function createResultCalendar({ date, plan, uid, timeZone = OUTING_TIME_ZONE, now = new Date() }: {
  date: string; plan: AgentPlan; uid: string; timeZone?: string; now?: Date;
}) {
  const first = plan.stops[0], last = plan.stops.at(-1);
  const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (timeZone !== OUTING_TIME_ZONE || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ||
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date || !first || !last || !clock.test(first.start) || !clock.test(last.end) || last.end <= first.start) {
    throw new Error("This choice does not have a valid Berkeley calendar time yet.");
  }
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const day = date.replaceAll("-", "");
  const route = plan.stops.map(stop => stop.name).join(" → ");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Huddle//Meetup//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VTIMEZONE", `TZID:${OUTING_TIME_ZONE}`, `X-LIC-LOCATION:${OUTING_TIME_ZONE}`,
    "BEGIN:DAYLIGHT", "TZOFFSETFROM:-0800", "TZOFFSETTO:-0700", "TZNAME:PDT", "DTSTART:20070311T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU", "END:DAYLIGHT",
    "BEGIN:STANDARD", "TZOFFSETFROM:-0700", "TZOFFSETTO:-0800", "TZNAME:PST", "DTSTART:20071104T020000", "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU", "END:STANDARD", "END:VTIMEZONE",
    "BEGIN:VEVENT", `UID:${calendarText(uid)}@huddle`, `DTSTAMP:${stamp}`,
    `DTSTART;TZID=${OUTING_TIME_ZONE}:${day}T${first.start.replace(":", "")}00`,
    `DTEND;TZID=${OUTING_TIME_ZONE}:${day}T${last.end.replace(":", "")}00`,
    `SUMMARY:${calendarText(`Huddle: ${route}`)}`, `LOCATION:${calendarText(first.name)}`,
    `DESCRIPTION:${calendarText(`Meetup planned with Huddle.\nRoute: ${route}\nThis calendar event is not a restaurant reservation.`)}`,
    "END:VEVENT", "END:VCALENDAR"];
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
