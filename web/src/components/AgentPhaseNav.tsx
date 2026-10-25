import { Link, useLocation } from "react-router";
import type { GroupContext } from "../groupContext";
import Tick from "./Tick";

// The huddle's steps as a vertical rail: done steps are ticked, the open screen
// is highlighted, steps the group hasn't reached yet are shown but locked.
export default function AgentPhaseNav({ ctx }: { ctx: GroupContext }) {
  const { pathname } = useLocation();
  const { ballot } = ctx;
  const steps = [
    { route: "lobby", label: "People & invites", open: true },
    { route: "prefs", label: "Preferences", open: true },
    { route: "plans", label: "Options", open: !!ctx.group.latestRunId },
    { route: "vote", label: "Vote", open: ballot.current && ballot.choices.length > 0 },
    { route: "done", label: "Done", open: !!ballot.winner },
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
