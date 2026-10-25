import type { AgentChoice } from "./agentBallot";
import { OUTING_TIME_ZONE } from "./calendarTime";

export type SharedResult = { date: string; timeZone: string; choice: AgentChoice };

export function parseSharedResult(json: string | undefined): SharedResult | null {
  if (!json) return null;
  try {
    const result = JSON.parse(json);
    if (!result || result.timeZone !== OUTING_TIME_ZONE || typeof result.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(result.date)) return null;
    const choice = result.choice;
    if (!choice || typeof choice.id !== "string" || !choice.id) return null;
    if (Array.isArray(choice.stops)) {
      if (!choice.stops.length || !choice.stops.every((stop: Record<string, unknown>) => stop && typeof stop.name === "string" && typeof stop.placeId === "string" &&
        typeof stop.start === "string" && typeof stop.end === "string" && typeof stop.lat === "number" && Number.isFinite(stop.lat) && typeof stop.lng === "number" && Number.isFinite(stop.lng))) return null;
    } else if (typeof choice.placeId !== "string" || !choice.placeId) return null;
    return { date: result.date, timeZone: result.timeZone, choice };
  } catch { return null; }
}
