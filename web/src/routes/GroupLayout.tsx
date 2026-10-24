import { useEffect, useRef } from "react";
import { Link, Outlet, useLoaderData, useLocation, useNavigate } from "react-router";
import { useGroupState, useLatestBooking, useMyPrivate } from "../data";
import type { Session } from "../session";
import type { GroupStatus } from "../types";
import type { GroupContext } from "../groupContext";
import StatusNav from "../components/StatusNav";
import DemoBanner from "../components/DemoBanner";
import ReplanBanner from "../components/ReplanBanner";
import OffersInbox from "../components/OffersInbox";
import { Buddy } from "../doodle/Doodle";

const STEP_FOR_STATUS: Record<GroupStatus, string> = {
  lobby: "lobby",
  eliciting: "prefs",
  planned: "plans",
  voting: "vote",
  booked: "call",
};

export default function GroupLayout() {
  const session = useLoaderData() as Session;
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const group = useGroupState();
  const mine = useMyPrivate();
  const booking = useLatestBooking();

  // Follow the group to the next step whenever its status changes, but only the
  // first time each run reaches a status, so a repeated or flapping update never
  // drags anyone back. The nav still lets testers jump to any screen.
  const lastStatus = useRef<GroupStatus | null>(null);
  const followed = useRef(new Set<string>());
  useEffect(() => {
    if (!group || group.id !== session.groupId || group.status === lastStatus.current) return;
    lastStatus.current = group.status;
    const key = `${group.latestRunId}:${group.status}`;
    if (followed.current.has(key)) return;
    followed.current.add(key);
    // The vote opens as the council finishes; stay on Plans so the debate can
    // be read. Plans has its own "Go vote" button.
    if (group.status === "voting" && pathname.endsWith("/plans")) return;
    let step = STEP_FOR_STATUS[group.status];
    if (group.status === "eliciting" && mine?.text) step = "swipe";
    navigate(`/g/${session.groupId}/${step}`);
  }, [group, mine, navigate, pathname, session.groupId]);

  // Status only becomes "booked" once the call is confirmed, so follow a new
  // booking too: every phone watches the call live.
  const lastBooking = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (booking === undefined) return;
    const id = booking?.bookingId ?? null;
    if (lastBooking.current !== undefined && id && id !== lastBooking.current) {
      navigate(`/g/${session.groupId}/call`);
    }
    lastBooking.current = id;
  }, [booking, navigate, session.groupId]);

  if (group === undefined) return <main className="page on-sky">Loading group…</main>;
  // Views only cover this phone's current group: the one it joined last.
  if (group === null || group.id !== session.groupId) {
    return (
      <main className="page space-y-4">
        <a className="logo" href="/">
          huddle
        </a>
        <section className="card space-y-3">
          <p>This phone isn't in huddle {session.code} anymore.</p>
          {group ? (
            <Link className="btn btn-primary w-full" to={`/g/${group.id}`}>
              Go to huddle {group.code}
            </Link>
          ) : (
            <Link className="btn w-full" to="/start">
              Start a new huddle
            </Link>
          )}
        </section>
      </main>
    );
  }

  const ctx: GroupContext = {
    session,
    group,
    mine,
    isHost: group.isHost,
  };

  return (
    <main className="page space-y-4">
      <header className="topbar">
        <a className="logo" href="/">
          huddle
        </a>
        <span className="code-tag" aria-label={`Huddle code ${group.code}`}>
          {group.code}
        </span>
        <span className="me-tag on-sky">
          <Buddy who={session.name} size={40} />
          <span>
            {session.name}
            {ctx.isHost && <span className="sticker sticker-sun ml-1.5">host</span>}
          </span>
        </span>
      </header>
      <StatusNav groupId={session.groupId} />
      <DemoBanner on={group.demoMode} />
      <ReplanBanner ctx={ctx} />
      <OffersInbox ctx={ctx} />
      <Outlet context={ctx} />
    </main>
  );
}
