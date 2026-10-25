import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "../module_bindings";
import { buildCatalogListings, CatalogState } from "../catalogData";

// Subscribe once the first screen shows venues, then keep the catalog while
// routes change, so cards and maps never resubscribe or reparse it.
export default function CatalogProvider({ children }: { children: ReactNode }) {
  const [requested, setRequested] = useState(false);
  const [rows] = useTable(tables.catalogVenues, { enabled: requested });
  const listings = useMemo(() => buildCatalogListings(rows), [rows]);
  const request = useCallback(() => setRequested(true), []);
  const value = useMemo(() => ({ listings, request }), [listings, request]);
  return <CatalogState.Provider value={value}>{children}</CatalogState.Provider>;
}
