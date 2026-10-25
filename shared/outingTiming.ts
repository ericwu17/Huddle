// Proposed coordinator visit length; catalog evidence and legacy solver stays are unchanged.
export const STOP_VISIT_MINUTES = 60;
export const TRAVEL_ALLOWANCE_MINUTES = 15;

export function preferredStopCount(values: (number | null | undefined)[]): number | null {
  const explicit = values.filter((value): value is number => Number.isInteger(value) && value! >= 1 && value! <= 5);
  return explicit.length ? Math.round(explicit.reduce((sum, value) => sum + value, 0) / explicit.length) : null;
}

export function suggestedOutingMinutes(stops: number): number {
  return stops * STOP_VISIT_MINUTES + Math.max(0, stops - 1) * TRAVEL_ALLOWANCE_MINUTES;
}

export function stopTimeWarning(stops: number | null, available: number | null): string | null {
  if (stops == null || available == null || available >= suggestedOutingMinutes(stops)) return null;
  return `Time may be tight: stopping ${stops} ${stops === 1 ? "time" : "times"} usually needs about ${stops} ${stops === 1 ? "hour" : "hours"}, plus travel.`;
}
