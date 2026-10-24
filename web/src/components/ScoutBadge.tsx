import type { ScoutCheck } from "../types";
import { timeAgo } from "../plans";

// Scout result for a plan's restaurant (S1 step 7). Unknown values (null)
// are left out rather than guessed.
export default function ScoutBadge({ check }: { check: ScoutCheck | undefined }) {
  if (!check) return <span className="muted">Not checked yet</span>;
  const parts: string[] = [];
  if (check.openNow !== null) parts.push(check.openNow ? "Open now" : "Closed now");
  if (check.vegetarianOptions !== null)
    parts.push(check.vegetarianOptions ? "vegetarian options" : "no vegetarian options");
  parts.push(check.cached ? "Checked earlier" : `checked ${timeAgo(check.checkedAt)}`);
  return <span className="rounded bg-green-50 px-2 py-0.5 text-sm">{parts.join(", ")}</span>;
}
