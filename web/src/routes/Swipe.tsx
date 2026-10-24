import { useReducer } from "spacetimedb/react";
import { reducers } from "../module_bindings";
import { useGroup } from "../groupContext";
import { PLACE_BY_ID } from "../places";
import { useRun } from "../useRun";
import type { Place } from "../types";
import ConfidenceRing from "../components/ConfidenceRing";

const MAX_SWIPES = 12;

function PlaceCard({ place, id }: { place: Place | undefined; id: string }) {
  if (!place) return <div className="card">{id}</div>;
  return (
    <div className="card space-y-1">
      <p className="font-semibold">{place.name}</p>
      <p className="muted">
        {place.category} · {place.cuisine} · ${place.costPerPerson}/person
      </p>
      <p className="muted">
        ★ {place.rating} ({place.reviewCount})
      </p>
      {place.dietary.length > 0 && <p className="muted">{place.dietary.join(", ")}</p>}
    </div>
  );
}

export default function Swipe() {
  const { group, session, mine } = useGroup();
  const submitSwipe = useReducer(reducers.submitSwipe);
  const { run, busy, error } = useRun();

  const me = group.members.find((m) => m.id === session.memberId);
  const pair = mine?.nextPair;

  function choose(winnerPlaceId: string, loserPlaceId: string) {
    run(() => submitSwipe({ winnerPlaceId, loserPlaceId }));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <ConfidenceRing value={group.confidence} />
        <div className="text-sm">
          <p>
            Your swipes: {me?.swipeCount ?? 0} / {MAX_SWIPES}
          </p>
          <ul className="muted">
            {group.members.map((m) => (
              <li key={m.id}>
                {m.name}: {m.swipeCount}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <h2 className="text-lg font-semibold">This or that?</h2>
      {!pair ? (
        <p className="muted">
          {(me?.swipeCount ?? 0) >= MAX_SWIPES ? "You're done. Waiting for the group…" : "Loading next pair…"}
        </p>
      ) : (
        <div className="space-y-2">
          <PlaceCard place={PLACE_BY_ID.get(pair.a)} id={pair.a} />
          <PlaceCard place={PLACE_BY_ID.get(pair.b)} id={pair.b} />
          <div className="grid grid-cols-2 gap-2">
            <button className="btn" disabled={busy} onClick={() => choose(pair.a, pair.b)}>
              First
            </button>
            <button className="btn" disabled={busy} onClick={() => choose(pair.b, pair.a)}>
              Second
            </button>
          </div>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
