import { useTable } from "spacetimedb/react";
import { tables } from "./module_bindings";
export function useHuddleLocation() {
  const [rows, ready] = useTable(tables.myHuddleLocation);
  return ready ? rows[0] ?? null : undefined;
}
