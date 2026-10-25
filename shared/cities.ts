export const SUPPORTED_CITIES = ["Berkeley", "Oakland", "San Francisco", "Albany", "Emeryville"] as const;
// null means Flexible; undefined means typed text does not name a supported city.
export function chosenCity(value: string): string | null | undefined {
  const input = value.trim().toLowerCase();
  if (!input || input === "any city") return null;
  if (input === "sf") return "San Francisco";
  return SUPPORTED_CITIES.find(city => city.toLowerCase() === input);
}
