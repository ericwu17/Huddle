import { useState } from "react";
import { useNavigate } from "react-router";
import { useProcedure, useReducer } from "spacetimedb/react";
import { procedures, reducers } from "../module_bindings";
import { usePlanRun, useScout, useVotes } from "../data";
import { useGroup } from "../groupContext";
import { useRun } from "../useRun";
import { KIND_LABEL } from "../plans";
import PlanCard from "../components/PlanCard";

export default function Vote() {
  const { group, session } = useGroup();
  const navigate = useNavigate();
  const runId = group.latestRunId;
  const planRun = usePlanRun(runId);
  const scout = useScout(runId);
  const votes = useVotes(runId, session.memberId);
  const vote = useReducer(reducers.vote);
  const doRoulette = useProcedure(procedures.doRoulette);
  const startBooking = useReducer(reducers.startBooking);
  const { run, busy, error } = useRun();
  const [spun, setSpun] = useState<string | null>(null);

  if (!runId) return <p className="muted">Nothing to vote on yet.</p>;
  const plans = planRun?.result?.plans;
  if (!plans) return <p className="muted">Loading plans…</p>;

  const council = planRun!.council;
  const counts = votes?.counts ?? {};
  const top = Math.max(0, ...plans.map((p) => counts[p.id] ?? 0));
  const leaders = plans.filter((p) => (counts[p.id] ?? 0) === top && top > 0);
  // Ties are broken by the roulette, never silently.
  const winner =
    leaders.length === 1 ? leaders[0] : leaders.find((p) => p.id === spun) ?? null;
  const scoutByPlace = new Map((scout ?? []).map((c) => [c.placeId, c]));

  async function book() {
    if (!winner || !runId) return;
    const stopIndex = winner.stops.findIndex((s) => s.category === "meal");
    await run(async () => {
      await startBooking({ runId, planId: winner.id, stopIndex });
      navigate(`/g/${session.groupId}/call`);
    });
  }

  return (
    <div className="space-y-4">
      {council && !council.fallbackUsed && (
        <div className="card text-sm">
          <p className="font-semibold">Council's rationale</p>
          <p>{council.rationale}</p>
        </div>
      )}

      {plans.map((p) => (
        <div key={p.id} className="space-y-1">
          <PlanCard
            plan={p}
            scout={scoutByPlace}
            selected={votes?.myVote === p.id}
            recommended={council?.fallbackUsed === false && council.chosenPlanId === p.id}
          />
          <button
            className="btn w-full"
            disabled={busy}
            onClick={() => run(() => vote({ runId, planId: p.id }))}
          >
            {votes?.myVote === p.id ? "Your vote" : `Vote ${KIND_LABEL[p.kind]}`} · {counts[p.id] ?? 0}
          </button>
        </div>
      ))}

      <p className="muted">
        {votes?.total ?? 0} of {group.members.length} voted
      </p>

      <div className="flex gap-2">
        <button
          className="btn"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const res = await doRoulette({ runId });
              setSpun(res.planId);
            })
          }
        >
          Can't decide? Spin
        </button>
        <button className="btn btn-primary flex-1" disabled={busy || !winner} onClick={book}>
          {winner ? `Book ${KIND_LABEL[winner.kind]}` : "Book it"}
        </button>
      </div>
      {spun && (
        <p className="text-sm">
          Roulette picked: {KIND_LABEL[plans.find((p) => p.id === spun)?.kind ?? "safe"]}
        </p>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
