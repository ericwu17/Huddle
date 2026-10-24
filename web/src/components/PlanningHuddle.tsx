import { useEffect, useState } from "react";
import { Buddy } from "../doodle/Doodle";

type Member = { id: string; name: string };

// Shown in the middle of the screen while the coordinator plans. Each person's
// stick figure "advocates" with generic lines about the outing; nothing here
// comes from anyone's private needs, budget or prompt.
const LINES = [
  "Somewhere we can all walk to?",
  "Food first, then something fun?",
  "Keeping it inside everyone's budget.",
  "My person's must-haves come first.",
  "Is it open at {start}?",
  "Dessert to finish, maybe?",
  "Let's not go too far.",
  "Limits stay private, promise.",
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
  const cast = members.slice(0, 6);
  if (hidden) {
    return <button className="planning-pill btn btn-sun" onClick={() => setHidden(false)}>Planning… show the huddle</button>;
  }
  const speaker = cast.length ? tick % cast.length : -1;
  const line = LINES[(tick * 5) % LINES.length].replace("{start}", start);
  return (
    <div className="planning-overlay" role="status" aria-live="polite">
      <section className="planning-card card">
        <h2 className="card-title">Your coordinator is planning</h2>
        <p className="muted">Everyone's advocates are talking it over. No booking is being made.</p>
        <div className="planning-stage" aria-hidden="true">
          <div className="planning-chair">
            <Buddy who="Coordinator" pose="ear" size={84} crown boil />
            <span className="planning-name">Coordinator</span>
          </div>
          <ul className="planning-ring">
            {cast.map((m, i) => (
              <li key={m.id} className={i === speaker ? "is-speaking" : ""}>
                {i === speaker ? <p className="planning-bubble">{line}</p> : <p className="planning-bubble is-quiet"><span className="dots"><i /><i /><i /></span></p>}
                <Buddy who={m.name} pose={i === speaker ? "argue" : "huddle"} size={64} boil={i === speaker} />
                <span className="planning-name">{m.name}'s advocate</span>
              </li>
            ))}
          </ul>
        </div>
        <button className="btn btn-quiet" onClick={() => setHidden(true)}>Hide</button>
      </section>
    </div>
  );
}
