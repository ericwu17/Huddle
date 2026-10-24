export const OUTING_TIME_ZONE = "America/Los_Angeles";

const inBerkeley = new Intl.DateTimeFormat("en-US", {
  timeZone: OUTING_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

function parts(instant: Date) {
  return Object.fromEntries(inBerkeley.formatToParts(instant).map(p => [p.type, p.value]));
}

export function berkeleyToday(now = new Date()) {
  const p = parts(now);
  return `${p.year}-${p.month}-${p.day}`;
}

export function dateAfter(date: string, days: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

// Resolve the selected Berkeley midnight with Intl's timezone rules. A fixed
// -07:00 offset would search the wrong dates after daylight-saving changes.
export function berkeleyMidnight(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Choose a valid search date.");
  const target = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(target) || new Date(target).toISOString().slice(0, 10) !== date) throw new Error("Choose a valid search date.");
  let candidate = target;
  for (let i = 0; i < 4; i++) {
    const p = parts(new Date(candidate));
    const represented = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
    const delta = target - represented;
    if (!delta) return new Date(candidate).toISOString();
    candidate += delta;
  }
  throw new Error("Could not resolve this date in Berkeley time. Choose another date.");
}
