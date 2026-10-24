import { Link, useLocation } from "react-router";
import type { GroupContext } from "../groupContext";
import type { Booking } from "../types";
import { PHASES, nextOpen, reachable, type Step } from "../phases";

type Props = { ctx: GroupContext; booking: Booking | null | undefined };

function currentIndex(pathname: string) {
  const step = pathname.split("/").pop() as Step;
  return PHASES.findIndex((p) => p.step === step);
}

// Top of the group screens: "Step 2 of 6" and a segment per step. Steps the
// group has reached can be tapped; later ones stay locked.
export function PhaseProgress({ ctx, booking }: Props) {
  const { pathname } = useLocation();
  const at = currentIndex(pathname);
  const far = reachable(ctx, booking);
  const base = `/g/${ctx.session.groupId}`;
  return (
    <nav className="phase-progress" aria-label="Huddle steps">
      <p className="phase-label on-sky">
        {at >= 0 ? `Step ${at + 1} of ${PHASES.length}` : "Under the hood"}
      </p>
      <ol className="phase-bar">
        {PHASES.map((p, i) => {
          const state = i === at ? "is-now" : i <= far ? "is-done" : "is-locked";
          return (
            <li key={p.step} className={state}>
              {i <= far ? (
                <Link to={`${base}/${p.step}`} aria-label={`Step ${i + 1}: ${p.title}`} aria-current={i === at ? "step" : undefined} />
              ) : (
                <span aria-label={`Step ${i + 1}: ${p.title} (locked)`} />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// Bottom of the group screens: Back and Next. Next opens once this phone has
// done its part and the group has moved on; until then it says what it waits for.
export function PhaseFooter({ ctx, booking }: Props) {
  const { pathname } = useLocation();
  const at = currentIndex(pathname);
  const base = `/g/${ctx.session.groupId}`;
  if (at < 0) {
    return (
      <div className="phase-footer">
        <Link className="btn" to={`${base}/plans`}>
          ← Back to the plans
        </Link>
      </div>
    );
  }
  const prev = PHASES[at - 1];
  const next = PHASES[at + 1];
  const gate = nextOpen(PHASES[at].step, ctx, booking);
  return (
    <div className="phase-footer">
      {!gate.open && next && <p className="phase-hint">{gate.hint}</p>}
      <div className="phase-buttons">
        {prev ? (
          <Link className="btn" to={`${base}/${prev.step}`}>
            ← Back
          </Link>
        ) : (
          <span />
        )}
        {next &&
          (gate.open ? (
            <Link className="btn btn-primary" to={`${base}/${next.step}`} aria-label={`Next: ${next.title}`}>
              Next: {next.short} →
            </Link>
          ) : (
            <button className="btn btn-primary" disabled aria-label={`Next: ${next.title} (not yet)`}>
              Next: {next.short} →
            </button>
          ))}
      </div>
    </div>
  );
}
