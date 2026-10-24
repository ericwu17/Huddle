import { NavLink } from "react-router";

const STEPS = ["lobby", "prefs", "swipe", "plans", "vote", "call", "judge"];

export default function StatusNav({ groupId }: { groupId: string }) {
  return (
    <nav className="flex flex-wrap gap-2 text-sm">
      {STEPS.map((step) => (
        <NavLink
          key={step}
          to={`/g/${groupId}/${step}`}
          className={({ isActive }) => (isActive ? "font-bold underline" : "text-gray-600")}
        >
          {step}
        </NavLink>
      ))}
    </nav>
  );
}
