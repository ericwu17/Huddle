import { Link, useLocation } from "react-router";
import type { GroupContext } from "../groupContext";
import type { Booking } from "../types";
import { useAgentRun } from "../agentData";
import Tick from "./Tick";

// The huddle's steps as a vertical rail: done steps are ticked, the open screen
// is highlighted, steps the group hasn't reached yet are shown but locked.
export default function AgentPhaseNav({ ctx, booking }: { ctx: GroupContext; booking: Booking | null | undefined }) {
  const { pathname } = useLocation();
  const planRun = useAgentRun(ctx.group.latestRunId);
  // Vote opens only once there are current options to vote on (plans or suggestions).
  const result = planRun?.result;
  const canVote = !!ctx.agent && ["ready", "blocked"].includes(ctx.agent.status)
    && result?.inputRevision === ctx.agent.revision && (result.plans.length > 0 || (result.suggestions?.length ?? 0) > 0);
  const steps = [
    { route: "lobby", label: "People & invites", open: true },
    { route: "prefs", label: "Private needs", open: true },
    { route: "plans", label: "Coordinator & plans", open: !!ctx.group.latestRunId },
    { route: "vote", label: "Vote", open: canVote },
    { route: "call", label: "Booking simulation", open: !!booking && booking.runId === ctx.group.latestRunId },
  ];
  const at = steps.findIndex(s => pathname.endsWith(`/${s.route}`));
  return <nav aria-label="Huddle steps">
    <ol className="step-rail">
      {steps.map((step, i) => {
        const state = i === at ? "is-now" : !step.open ? "is-locked" : i < at ? "is-done" : "is-open";
        const mark = state === "is-done" ? <Tick size={14} /> : String(i + 1);
        return <li key={step.route} className={state}>
          {step.open ? <Link to={`/g/${ctx.session.groupId}/${step.route}`} aria-current={i === at ? "step" : undefined}>
            <span className="step-mark" aria-hidden="true">{mark}</span>{step.label}
          </Link> : <span aria-disabled="true"><span className="step-mark" aria-hidden="true">{mark}</span>{step.label}</span>}
        </li>;
      })}
    </ol>
  </nav>;
}
