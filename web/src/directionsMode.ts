// A local directions preview, not a change to the group's saved itinerary.
// Map controls and external links for the same public stop sequence stay in sync.
import { useCallback, useSyncExternalStore } from "react";
import type { DirectionsMode, MapsStop } from "./googleMaps";
const modes = new Map<string, DirectionsMode>();
const listeners = new Set<() => void>();
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function useDirectionsMode(stops: readonly MapsStop[]) {
  const key = JSON.stringify(stops.map(stop => [stop.placeId, stop.lat, stop.lng]));
  const read = useCallback(() => modes.get(key) ?? "driving", [key]);
  const mode = useSyncExternalStore(subscribe, read, () => "driving" as const);
  const setMode = useCallback((value: DirectionsMode) => {
    modes.set(key, value);
    // Bound the in-memory preview state. No private inputs or account state.
    if (modes.size > 100) modes.delete(modes.keys().next().value!);
    listeners.forEach(listener => listener());
  }, [key]);
  return [mode, setMode] as const;
}
