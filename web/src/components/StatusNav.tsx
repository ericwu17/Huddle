import { NavLink } from "react-router";

const STEPS = ["lobby", "prefs", "swipe", "plans", "vote", "call", "judge"];

export default function StatusNav({ groupId }: { groupId: string }) {
  return (
    <nav className="steps" aria-label="Huddle steps">
      {STEPS.map((step) => (
        <NavLink key={step} to={`/g/${groupId}/${step}`}>
          {step}
        </NavLink>
      ))}
    </nav>
  );
}
