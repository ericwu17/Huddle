// Active choices must come from the group's latest completed run and satisfy
// every member's CURRENT cumulative budget. Use the same check in actions,
// delayed responses/jobs and public views. Stored history stays unchanged.
import { planFitsBudgets } from "./budgets";
import type { ReadDb } from "./types";
import { membersOf, parse } from "./util";

export function availablePlans(db: ReadDb, groupId: string, runId: string): any[] {
  const group = db.group.id.find(groupId);
  const run = db.plan_run.runId.find(runId);
  if (!group || group.latestRunId !== runId || run?.groupId !== groupId || run.status !== "done") return [];
  const members = membersOf(db, groupId).map((member) => ({
    hard: parse(db.private_prefs.memberId.find(member.id)?.hardJson),
  }));
  const plans = parse(run.resultJson)?.plans;
  return Array.isArray(plans) ? plans.filter((plan) => planFitsBudgets(plan, members)) : [];
}
