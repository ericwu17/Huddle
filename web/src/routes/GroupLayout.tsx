import { useEffect, useRef } from "react";
import { Link, Outlet, useLoaderData, useLocation, useNavigate } from "react-router";
import { useGroupState, useLatestBooking, useMyPrivate } from "../data";
import type { Session } from "../session";
import type { GroupStatus } from "../types";
import type { GroupContext } from "../groupContext";
import { PhaseFooter, PhaseProgress } from "../components/PhaseNav";
import DemoBanner from "../components/DemoBanner";
import ReplanBanner from "../components/ReplanBanner";
import OffersInbox from "../components/OffersInbox";
import { Buddy } from "../doodle/Doodle";
import { useAgentNeeds, useAgentState } from "../agentData";
import AgentPhaseNav from "../components/AgentPhaseNav";
import PlanningHuddle from "../components/PlanningHuddle";
import AccountStatus from "../components/AccountStatus";
import { displayTime } from "../venueFormatting";

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
  const agent = useAgentState();
  const agentNeeds = useAgentNeeds();
  const lastAgentState = useRef<string | null>(null);

  // Follow the group to the next step whenever its status changes, but only the
  // first time each run reaches a status, so a repeated or flapping update never
  // drags anyone back. The nav still lets testers jump to any screen.
  const lastStatus = useRef<GroupStatus | null>(null);
  const followed = useRef(new Set<string>());
  useEffect(() => {
    if (agent && agent.groupId !== session.groupId) return;
    if (group && group.id === session.groupId && agent) {
      const key = `${group.latestRunId}:${agent.status}:${group.status}`;
      if (lastAgentState.current === key) return;
      const firstLoad = lastAgentState.current === null;
      lastAgentState.current = key;
      // An explicit Vote URL stays open on refresh, including its empty state.
      // Later run/needs changes still take everyone back through the new plans.
      if (firstLoad && pathname.endsWith("/vote")) return;
      const step = group.status === "lobby" ? "lobby" : group.status === "booked" ? "call"
        : agent.status === "needs" ? "prefs" : "plans";
      navigate(`/g/${session.groupId}/${step}`);
      return;
    }
    if (agent === undefined) return;
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
  }, [group, agent, mine, navigate, pathname, session.groupId]);

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

  if (group === undefined || agent === undefined) return <main className="page on-sky">Loading group…</main>;
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

  if ((agent && agent.groupId !== group.id) || (agentNeeds && agentNeeds.memberId !== session.memberId)) {
    return <main className="page on-sky">Loading this huddle’s context…</main>;
  }

  const ctx: GroupContext = {
    session,
    group,
    mine,
    isHost: group.isHost,
    agent,
    agentNeeds,
  };

  // Web layout: a vertical sidebar (who, steps, people) beside the step's
  // screen. On a phone the sidebar collapses to the header and the step list.
  return (
    <main className="group-page">
      <aside className="group-sidebar">
        <header className="topbar">
          <a className="logo" href="/">
            huddle
          </a>
        </header>
        <span className="me-tag on-sky">
          <Buddy who={session.name} size={40} />
          <span>
            {session.name}
            {ctx.isHost && <span className="sticker sticker-sun ml-1.5">host</span>}
          </span>
        </span>
        {agent ? <AgentPhaseNav ctx={ctx} booking={booking} /> : <PhaseProgress ctx={ctx} booking={booking} />}
        <SidebarPeople ctx={ctx} />
      </aside>
      <div className="group-main space-y-4">
      <AccountStatus />
      <p className="on-sky text-sm">Outing: {group.date} · {displayTime(group.window.start)}–{displayTime(group.window.end)} · Berkeley time</p>
      <DemoBanner on={group.demoMode} />
      {!agent ? <ReplanBanner ctx={ctx} /> : group.replanFor ? <p className="card card-note">The simulated venue was unavailable. Review the replacement plans and vote again before starting another simulation.</p> : null}
      {!agent ? <OffersInbox ctx={ctx} /> : null}
      <Outlet key={group.id} context={ctx} />
      {agent?.status === "planning" ? <PlanningHuddle members={group.members} start={group.window.start} /> : null}
      {!agent ? <PhaseFooter ctx={ctx} booking={booking} /> : null}
      <p className="text-center">
        <Link className="on-sky muted underline" to={`/g/${session.groupId}/judge`}>
          Under the hood
        </Link>
      </p>
      </div>
    </main>
  );
}

// Desktop only: joined people and their public readiness.
function SidebarPeople({ ctx }: { ctx: GroupContext }) {
  const { group, agent, session } = ctx;
  return (
    <section className="sidebar-people card" aria-label="Who's in">
      <h2 className="card-title">Your people</h2>
      <ul className="sidebar-members">
        {group.members.map((m) => {
          const ready = agent ? agent.confirmedMemberIds.includes(m.id) : m.ready;
          return (
            <li key={m.id}>
              <Buddy who={m.name} pose={ready ? "huddle" : "idle"} size={30} />
              <span className="min-w-0 flex-1 truncate">{m.id === session.memberId ? `${m.name} (you)` : m.name}</span>
              <span className={`sticker ${ready ? "sticker-lime" : ""}`}>{ready ? "ready" : "…"}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
