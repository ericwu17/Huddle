import { useReducer } from "spacetimedb/react";
import { reducers } from "../module_bindings";
import type { GroupContext } from "../groupContext";
import { useRun } from "../useRun";

// Private trade offers (A6.5). They come from the my_offers view, so only the
// member an offer is addressed to ever sees it.
export default function OffersInbox({ ctx }: { ctx: GroupContext }) {
  const acceptOffer = useReducer(reducers.acceptOffer);
  const declineOffer = useReducer(reducers.declineOffer);
  const { run, busy, error } = useRun();

  const open = ctx.mine?.offers.filter((o) => o.status === "open") ?? [];
  if (open.length === 0) return null;

  return (
    <section className="card card-pink card-tilt-l space-y-3">
      <h2 className="card-title">Psst, a private offer</h2>
      <p className="muted">Only you see this.</p>
      {open.map((offer) => (
        <div key={offer.offerId} className="space-y-2">
          <p className="hand text-xl leading-tight">
            {offer.text ||
              (offer.type === "budget"
                ? `Stretch your budget by $${offer.amount} for a plan the group would like better?`
                : `Travel ${offer.amount} more minutes for a plan the group would like better?`)}
          </p>
          <p className="muted">
            {offer.plan.stops.map((s) => s.name).join(" → ")} · robustness +
            {Math.round(offer.robustnessGain * 100)} pts
          </p>
          <div className="flex gap-2">
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => run(() => acceptOffer({ offerId: offer.offerId }))}
            >
              Accept
            </button>
            <button
              className="btn"
              disabled={busy}
              onClick={() => run(() => declineOffer({ offerId: offer.offerId }))}
            >
              Decline
            </button>
          </div>
        </div>
      ))}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
