import { useReducer } from "spacetimedb/react";
import { Navigate } from "react-router";
import { reducers } from "../module_bindings";
import { useLatestBooking } from "../data";
import { useRun } from "../useRun";
import CallScreen from "../components/call/CallScreen";
import { useGroup } from "../groupContext";

export default function Call() {
  const { agent, group } = useGroup();
  const booking = useLatestBooking();
  const startBooking = useReducer(reducers.startBooking);
  const { run, busy, error } = useRun();

  if (agent) return <Navigate to={`/g/${group.id}/done`} replace />;
  if (agent === undefined) return <p className="on-sky">Loading…</p>;
  if (booking === undefined) return <p className="on-sky">Loading…</p>;
  if (booking === null) return <p className="on-sky">No booking yet. Vote, then tap "Book it".</p>;

  function retry() {
    run(() =>
      startBooking({
        runId: booking!.runId,
        planId: booking!.planId,
        stopIndex: booking!.stopIndex,
      }),
    );
  }

  return (
    <div className="space-y-2">
      <CallScreen booking={booking} onRetry={busy ? undefined : retry} />
      {error && <p className="error">{error}</p>}
    </div>
  );
}
