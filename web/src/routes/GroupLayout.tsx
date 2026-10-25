import { useHuddleLocation } from "../huddleLocation";
import { useEffect, useMemo, useRef } from "react";
import { Link, Outlet, useLoaderData, useLocation, useNavigate } from "react-router";
import { useGroupState, useLatestBooking, useMyPrivate } from "../data";
import { readinessFor, stepOf } from "../readiness";
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
import { useAgentBallot } from "../useAgentBallot";
import { winnerTransition } from "../agentBallot";
import HuddleLoading from "../components/HuddleLoading";
import { useHuddleTiming } from "../huddleTiming";
import HuddleBrand from "../components/HuddleBrand";
import { useHuddleNames } from "../accountData";
import TieBreaker from "../components/TieBreaker";
import { useTieBreakReveal } from "../useTieBreakReveal";

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
  const huddleNames = useHuddleNames();
  const mine = useMyPrivate();
  const booking = useLatestBooking();
  const agent = useAgentState();
  const agentNeeds = useAgentNeeds();
  const timing = useHuddleTiming();
  const huddleLocation = useHuddleLocation();
  const ballot = useAgentBallot(group?.id === session.groupId ? group : group === undefined ? undefined : null, agent, session.memberId);
  const tieKey = group?.id === session.groupId && agent?.groupId === session.groupId && ballot.current && ballot.complete && ballot.leaders.length > 1
    ? JSON.stringify([group.id, ballot.runId, agent.revision, ballot.signature]) : null;
  const tieReveal = useTieBreakReveal(tieKey, ballot.winner?.id ?? null, ballot.loading);
  const lastAgentState = useRef<string | null>(null);
  const lastWinner = useRef<{ groupId: string; key: string | null } | null>(null);

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
      lastAgentState.current = key;
      // Vote stays navigable during subscription updates and after needs change.
      // AgentVote removes stale choices and shows its empty state until replanned.
      if (pathname.endsWith("/lobby") || pathname.endsWith("/vote") || pathname.endsWith("/done") ||
          pathname.endsWith("/prefs") && ["needs", "ready", "blocked"].includes(agent.status)) return;
      const step = group.status === "lobby" ? "lobby" : group.status === "booked" ? "done"
        : agent.status === "needs" ? "prefs" : "plans";
      navigate(`/g/${session.groupId}/${step}`);
      return;
    }
    if (agent === undefined || pathname.endsWith("/lobby") || pathname.endsWith("/done")) return;
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

  useEffect(() => {
    if (!agent || agent.groupId !== session.groupId || group?.id !== session.groupId || ballot.loading || tieReveal.visible) return;
    const key = ballot.winner ? `${ballot.runId}:${agent.revision}:${ballot.winner.id}` : null;
    const transition = winnerTransition(lastWinner.current, group.id, key,
      pathname.endsWith("/vote") || pathname.endsWith("/prefs"));
    lastWinner.current = transition.state;
    if (transition.follow) navigate(`/g/${session.groupId}/done`);
  }, [agent, group, ballot.loading, ballot.runId, ballot.winner, tieReveal.visible, navigate, pathname, session.groupId]);

  // Status only becomes "booked" once the call is confirmed, so follow a new
  // booking too: every phone watches the call live.
  const lastBooking = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (agent !== null) return;
    if (booking === undefined) return;
    const id = booking?.bookingId ?? null;
    if (lastBooking.current !== undefined && id && id !== lastBooking.current) {
      navigate(`/g/${session.groupId}/call`);
    }
    lastBooking.current = id;
  }, [agent, booking, navigate, session.groupId]);

  // A stable context lets step screens skip rerendering when only data they
  // don't read (timing, names, location, bookings) changes.
  const groupCtx = useMemo<GroupContext | null>(() => group && agent !== undefined
    ? { session, group, mine, isHost: group.isHost, agent, agentNeeds, ballot } : null,
  [session, group, mine, agent, agentNeeds, ballot]);

  if (group === undefined || agent === undefined) return <HuddleLoading label="Loading your group" />;
  // Views only cover this phone's current group: the one it joined last.
  if (group === null || group.id !== session.groupId) {
    return (
      <main className="page space-y-4">
        <HuddleBrand />
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
    return <HuddleLoading label="Loading this Huddle’s context" />;
  }

  // Set whenever group and agent have loaded, which the checks above ensure.
  const ctx = groupCtx!;

  // Web layout: a vertical sidebar (who, steps, people) beside the step's
  // screen. On a phone the sidebar collapses to the header and the step list.
  return (
    <main className="group-page">
      <aside className="group-sidebar">
        <header className="topbar">
          <HuddleBrand />
        </header>
        <p className="group-name on-sky">{huddleNames?.find(h => h.groupId === group.id)?.name || `Huddle ${group.code}`}</p>
        <span className="me-tag">
          <Buddy who={session.name} size={56} crown />
          <span>
            {session.name}
            {ctx.isHost && <span className="sticker sticker-sun ml-1.5">host</span>}
          </span>
        </span>
        {agent ? <AgentPhaseNav ctx={ctx} /> : <PhaseProgress ctx={ctx} booking={booking} />}
        <SidebarPeople ctx={ctx} />
      </aside>
      <div className="group-main space-y-4">
      <AccountStatus />
      {/* The final page shows the agreed date and time in its own card. */}
      {!pathname.endsWith("/done") ? <p className="on-sky text-sm">{timing?.groupId === group.id && timing.source !== "pending"
        ? `${group.date} · ${displayTime(group.window.start)}–${displayTime(group.window.end)}`
        : "Date and time to be decided"}</p> : null}
      {huddleLocation?.groupId === group.id && huddleLocation.destinationCities.length ? <p className="on-sky text-sm">Planning in {huddleLocation.destinationCities.join(" or ")}{huddleLocation.destinationCities.length > 1 ? " · tied city preferences" : ""}</p> : null}
      <DemoBanner on={group.demoMode} />
      {!agent ? <ReplanBanner ctx={ctx} /> : null}
      {!agent ? <OffersInbox ctx={ctx} /> : null}
      <Outlet key={group.id} context={ctx} />
      {agent?.status === "planning" ? <PlanningHuddle members={group.members} start={group.window.start} /> : null}
      {tieReveal.visible && ballot.winner ? <TieBreaker key={tieReveal.resultKey} winnerId={ballot.winner.id} onComplete={tieReveal.finish}
        options={ballot.leaders.map(choice => ({
          id: choice.id, number: ballot.choices.findIndex(option => option.id === choice.id) + 1,
          who: group.members.find(member => ballot.votes?.byPlan[choice.id]?.includes(member.id))?.name ?? "Huddle agent",
        }))} /> : null}
      {!agent ? <PhaseFooter ctx={ctx} booking={booking} /> : null}
      </div>
    </main>
  );
}

// Desktop only: joined people and their public readiness.
function SidebarPeople({ ctx }: { ctx: GroupContext }) {
  const { group, session, ballot: { votes } } = ctx;
  const { pathname } = useLocation();
  const step = stepOf(pathname);
  return (
    <section className="sidebar-people card" aria-label="Who's in">
      <h2 className="section-title">Your people</h2>
      <ul className="sidebar-members">
        {group.members.map((m) => {
          const { ready, label } = readinessFor(step, ctx, m.id, votes);
          return (
            <li key={m.id}>
              <Buddy who={m.name} pose={ready ? "huddle" : "idle"} size={30} />
              <span className="member-name">{m.id === session.memberId ? `${m.name} (you)` : m.name}</span>
              <span className={`sticker ${ready ? "sticker-lime" : ""}`}>{label}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
