import { Link, useLocation } from "react-router";
import type { GroupContext } from "../groupContext";
import type { Booking } from "../types";

export default function AgentPhaseNav({ ctx, booking }: { ctx: GroupContext; booking: Booking | null | undefined }) {
  const { pathname } = useLocation();
  const steps = [
    { route: "lobby", label: "People & invites", open: true },
    { route: "prefs", label: "Private needs", open: true },
    { route: "plans", label: "Coordinator & plans", open: !!ctx.group.latestRunId },
    { route: "vote", label: "Vote", open: ctx.agent?.status === "ready" },
    { route: "call", label: "Booking simulation", open: !!booking && booking.runId === ctx.group.latestRunId },
  ];
  return <nav className="card flex flex-wrap gap-3 text-sm" aria-label="Huddle steps">
    {steps.map(step => step.open ? <Link key={step.route} className="underline"
      aria-current={pathname.endsWith(`/${step.route}`) ? "step" : undefined}
      to={`/g/${ctx.session.groupId}/${step.route}`}>{step.label}</Link>
      : <span key={step.route} className="muted" aria-disabled="true">{step.label}</span>)}
  </nav>;
}
