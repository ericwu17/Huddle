import { useMemo } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "./module_bindings";
import type { PlanStop } from "./types";

export type AgentHard = {
  budgetMaxPerPerson: number | null; dietary: string[]; allergies: string[];
  vetoCuisines: string[]; vetoCategories: string[]; rejectedTerms: string[]; maxTravelMinutes: number | null;
  maxOutingMinutes: number | null;
};
export type AgentNeedsResult = { hard: AgentHard; preferences: string[]; questions: string[]; warnings: string[] };
export type AgentNeeds = { memberId: string; text: string; revision: number; result: AgentNeedsResult | null; confirmed: boolean; error?: string };
export type AgentState = { groupId: string; revision: number; status: string; activeRunId?: string; error?: string; confirmedMemberIds: string[] };
export type AgentPlan = { id: string; title: string; stops: PlanStop[]; costPerPerson: number; whyLine: string; limitations: string[]; travelMinutes: number;
  status?: "ready" | "provisional"; summary?: string; costModel?: "own_orders"; costRange?: { min: number; max: number } };
export type AgentSuggestion = { id: string; placeId: string; summary: string; limitations: string[] };
export type AgentResult = { mode: "agent"; runId: string; inputRevision: number; plans: AgentPlan[]; recommendedPlanId: string | null; rationale: string; conflicts: string[]; warnings: string[]; suggestions?: AgentSuggestion[] };
export type AgentOrder = { id: string; runId: string; memberId: string; planId: string; items: { placeId: string; itemId: string | null }[]; total: number };

export function isReadyAgentPlan(plan: AgentPlan) { return plan.status === undefined || plan.status === "ready"; }

export function useAgentOrders(runId: string | null, memberId: string) {
  const [rows, ready] = useTable(tables.myAgentOrders);
  return useMemo(() => ready ? rows.filter(row => row.runId === runId && row.memberId === memberId).map(row => ({
    ...row, items: JSON.parse(row.itemsJson) as AgentOrder["items"],
  })) : [], [rows, ready, runId, memberId]);
}

export function useAgentState(): AgentState | null | undefined {
  const [rows, ready] = useTable(tables.myAgentSession);
  return ready ? rows[0] ?? null : undefined;
}

export function useAgentNeeds(): AgentNeeds | null | undefined {
  const [rows, ready] = useTable(tables.myAgentNeeds);
  return useMemo(() => {
    if (!ready) return undefined;
    const row = rows[0];
    return row ? { ...row, result: row.resultJson ? JSON.parse(row.resultJson) as AgentNeedsResult : null } : null;
  }, [rows, ready]);
}

export type AgentStructuredPreferences = { budgetMaxPerPerson: number | null; maxOutingMinutes: number | null; dietary: string[]; allergies: string[]; maxTravelMinutes?: number | null };
export function useAgentPreferences() {
  const [rows, ready] = useTable(tables.myAgentPreferences);
  return useMemo(() => ready ? rows[0] ? { ...rows[0], structured: JSON.parse(rows[0].structuredJson) as AgentStructuredPreferences } : null : undefined, [rows, ready]);
}

export function useAgentRun(runId: string | null) {
  const [rows, ready] = useTable(tables.myPlanRuns);
  return useMemo(() => {
    if (!ready) return undefined;
    const row = rows.find(r => r.runId === runId);
    return row ? { ...row, result: row.resultJson ? JSON.parse(row.resultJson) as AgentResult : null,
      roulette: row.rouletteJson ? JSON.parse(row.rouletteJson) as { planId: string } : null } : null;
  }, [rows, ready, runId]);
}

export function useAgentMessages(runId: string | null) {
  const [rows, ready] = useTable(tables.myCouncilMessages);
  return useMemo(() => ready ? rows.filter(r => r.runId === runId).sort((a, b) => Number(a.id - b.id)) : [], [rows, ready, runId]);
}
