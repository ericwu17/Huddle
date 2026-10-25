import PageHeading from "../components/PageHeading";
import { useReducer } from "spacetimedb/react";
import { reducers } from "../module_bindings";
import { useGroup } from "../groupContext";
import { PLACE_BY_ID } from "../places";
import { useRun } from "../useRun";
import type { Place } from "../types";
import ConfidenceRing from "../components/ConfidenceRing";
import { Navigate } from "react-router";

const MAX_SWIPES = 12;

function PlaceCard({
  place,
  id,
  disabled,
  onPick,
  tilt,
}: {
  place: Place | undefined;
  id: string;
  disabled: boolean;
  onPick: () => void;
  tilt: string;
}) {
  return (
    <button className={`card place-card ${tilt} w-full text-left`} disabled={disabled} onClick={onPick}>
      {!place ? (
        <p className="display text-2xl">{id}</p>
      ) : (
        <span className="block space-y-1.5">
          <span className="display block text-[28px] text-[var(--cobalt)]">{place.name}</span>
          <span className="flex flex-wrap gap-1.5">
            <span className="sticker">{place.category}</span>
            {(place.label || place.cuisine) && <span className="sticker">{place.label || place.cuisine}</span>}
            <span className="sticker sticker-lime">${place.costPerPerson}/person</span>
            <span className="sticker sticker-sun">
              ★ {place.rating} ({place.reviewCount})
            </span>
          </span>
          {place.dietary.length > 0 && <span className="muted block">{place.dietary.join(", ")}</span>}
        </span>
      )}
    </button>
  );
}

export default function Swipe() {
  const { agent, session } = useGroup();
  return agent ? <Navigate replace to={`/g/${session.groupId}/prefs`} /> : <LegacySwipe />;
}

function LegacySwipe() {
  const { group, session, mine } = useGroup();
  const submitSwipe = useReducer(reducers.submitSwipe);
  const { run, busy, error } = useRun();

  const me = group.members.find((m) => m.id === session.memberId);
  const pair = mine?.nextPair;

  function choose(winnerPlaceId: string, loserPlaceId: string) {
    run(() => submitSwipe({ winnerPlaceId, loserPlaceId }));
  }

  return (
    <div className="space-y-5">
      <section className="card flex items-center gap-4">
        <ConfidenceRing value={group.confidence} />
        <div className="min-w-0 flex-1 text-sm">
          <p className="display text-xl text-[var(--cobalt)]">
            Your swipes {me?.swipeCount ?? 0} / {MAX_SWIPES}
          </p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {group.members.map((m) => (
              <li key={m.id} className="sticker">
                {m.name} · {m.swipeCount}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <PageHeading lead="This or" accent="that?" />
      {!pair ? (
        <p className="on-sky">
          {(me?.swipeCount ?? 0) >= MAX_SWIPES ? "You're done. Waiting for the group…" : "Loading next pair…"}
        </p>
      ) : (
        <div className="space-y-3">
          <PlaceCard
            place={PLACE_BY_ID.get(pair.a)}
            id={pair.a}
            disabled={busy}
            tilt="card-tilt-l"
            onPick={() => choose(pair.a, pair.b)}
          />
          <p className="shout text-center text-3xl" aria-hidden="true">
            or
          </p>
          <PlaceCard
            place={PLACE_BY_ID.get(pair.b)}
            id={pair.b}
            disabled={busy}
            tilt="card-tilt-r"
            onPick={() => choose(pair.b, pair.a)}
          />
          <p className="on-sky muted text-center">Tap the one you'd rather go to.</p>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
