import { useEffect, useState } from "react";
import { displayTime } from "../venueFormatting";
import AgentCircle, { type CircleAgent } from "./AgentCircle";

type Member = { id: string; name: string };

// Shown in the middle of the screen while the coordinator plans. Each person's
// agent chats with generic lines about the outing; nothing here
// comes from anyone's private needs, budget or prompt.
const LINES = [
  "Somewhere we can all walk to?",
  "Food first, then something fun?",
  "Keeping it inside everyone's budget.",
  "My person's must-haves come first.",
  "Is it open at {start}?",
  "Dessert to finish, maybe?",
  "Let's not go too far.",
  "Finding something we all like.",
  "That one fits the time window.",
  "Checking the ratings…",
  "Can we all agree on this one?",
  "Something everyone can eat.",
];

export default function PlanningHuddle({ members, start }: { members: Member[]; start: string }) {
  const [tick, setTick] = useState(0);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 2400);
    return () => clearInterval(id);
  }, []);
  const cast = members.slice(0, 5);
  if (hidden) {
    return <button className="planning-pill btn btn-sun" onClick={() => setHidden(false)}>Planning… show the huddle</button>;
  }
  const speaker = cast.length ? tick % cast.length : -1;
  const line = LINES[(tick * 5) % LINES.length].replace("{start}", displayTime(start));
  const agents: CircleAgent[] = [
    { id: "coordinator", label: "Coordinator", who: "Coordinator", coordinator: true },
    ...cast.map(m => ({ id: m.id, label: `${m.name}'s agent`, who: m.name })),
  ];
  const activeId = cast[speaker]?.id ?? "coordinator";
  return (
    <div className="planning-overlay" role="status" aria-live="polite">
      <section className="planning-card card">
        <h2 className="card-title">Your coordinator is planning</h2>
        <p className="muted">Everyone's agents are talking it over.</p>
        <div className="planning-stage">
          <AgentCircle agents={agents} activeId={activeId} speech={{ text: line, turn: tick }} />
        </div>
        <button className="btn btn-quiet" onClick={() => setHidden(true)}>Hide</button>
      </section>
    </div>
  );
}
