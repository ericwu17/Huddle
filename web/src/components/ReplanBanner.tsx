import { useNavigate } from "react-router";
import { useReducer } from "spacetimedb/react";
import { reducers } from "../module_bindings";
import { usePlanRun } from "../data";
import type { GroupContext } from "../groupContext";
import { pickedPlan } from "../plans";
import { useRun } from "../useRun";

// Shown when the restaurant said full/closed and replan produced a new run
// (S5.5 re-plan loop). Never calls automatically: the user taps "Call again".
export default function ReplanBanner({ ctx }: { ctx: GroupContext }) {
  const { group, session } = ctx;
  const navigate = useNavigate();
  const runId = group.latestRunId;
  const planRun = usePlanRun(group.replanFor ? runId : null);
  const startBooking = useReducer(reducers.startBooking);
  const { run, busy, error } = useRun();

  if (!group.replanFor) return null;

  const plan = planRun?.result ? pickedPlan(planRun) : undefined;
  const stopIndex = plan ? plan.stops.findIndex((s) => s.category === "meal") : -1;

  async function callAgain() {
    if (!plan || !runId) return;
    await run(async () => {
      await startBooking({ runId, planId: plan.id, stopIndex });
      navigate(`/g/${session.groupId}/call`);
    });
  }

  return (
    <div className="card space-y-2 bg-orange-50">
      <p className="font-semibold">That place is full. New plan ready.</p>
      {plan ? (
        <p className="text-sm">
          {plan.kind}: {plan.stops.map((s) => s.name).join(" → ")}
        </p>
      ) : (
        <p className="muted">Re-planning…</p>
      )}
      <button className="btn btn-primary" disabled={busy || !plan || stopIndex < 0} onClick={callAgain}>
        Call again
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
