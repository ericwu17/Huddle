import type { CSSProperties } from "react";
import { Buddy } from "../doodle/Doodle";
import { world } from "../doodle/doodles";
import "../huddle-brand.css";

// Reuse the world's global SVG definitions, without duplicating their IDs.
const BACKDROP = world({ quietSky: true });
const RUNNERS = ["Agent A", "Agent B", "Agent C", "Agent D", "Agent E"];

export default function HuddleLoading({ label = "Loading your Huddle" }: { label?: string }) {
  return <div className="huddle-loading" role="status" aria-live="polite" aria-label={label}>
    <div className="huddle-loading-backdrop" aria-hidden="true" dangerouslySetInnerHTML={{ __html: BACKDROP }} />
    <div className="huddle-loading-content" aria-hidden="true">
      <div className="huddle-running-stage">
        <div className="huddle-running-track" />
        {RUNNERS.map((who, index) => {
          const angle = Math.PI + index * Math.PI * 2 / RUNNERS.length;
          return <div key={who} className="huddle-runner" style={{
            "--run-delay": `${index * -1.08}s`,
            "--rest-x": `${Math.cos(angle) * 122}px`,
            "--rest-y": `${Math.sin(angle) * 52}px`,
          } as CSSProperties}>
            <Buddy who={who} pose="walk" size={110} />
          </div>;
        })}
      </div>
      <p className="huddle-loading-caption">Huddling<span className="huddle-loading-dots"><span>.</span><span>.</span><span>.</span></span></p>
    </div>
  </div>;
}
