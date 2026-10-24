import { useReducer } from "spacetimedb/react";
import { reducers } from "../module_bindings";
import { useLatestBooking } from "../data";
import { useRun } from "../useRun";
import CallScreen from "../components/call/CallScreen";

export default function Call() {
  const booking = useLatestBooking();
  const startBooking = useReducer(reducers.startBooking);
  const { run, busy, error } = useRun();

  if (booking === undefined) return <p className="muted">Loading…</p>;
  if (booking === null) return <p className="muted">No booking yet. Vote, then tap "Book it".</p>;

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
