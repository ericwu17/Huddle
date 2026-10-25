import type { CSSProperties } from "react";
import { Buddy } from "../doodle/Doodle";
import { world } from "../doodle/doodles";
import "../huddle-brand.css";

// Reuse the world's global SVG definitions, without duplicating their IDs.
const BACKDROP = world();
const RUNNERS = ["Advocate A", "Advocate B", "Advocate D"];

export default function HuddleLoading({ label = "Loading your Huddle" }: { label?: string }) {
  return <div className="huddle-loading" role="status" aria-live="polite" aria-label={label}>
    <div className="huddle-loading-backdrop" aria-hidden="true" dangerouslySetInnerHTML={{ __html: BACKDROP }} />
    <div className="huddle-loading-content" aria-hidden="true">
      <div className="huddle-running-stage">
        <div className="huddle-running-track" />
        <div className="huddle-running-center">
          <Buddy who="Advocate C" pose="huddle" size={112} />
          <Buddy who="Advocate E" pose="huddle" size={106} />
        </div>
        {RUNNERS.map((who, index) => <div key={who} className={`huddle-runner huddle-runner-${index}`}
          style={{ "--run-delay": `${index * -1.8}s` } as CSSProperties}>
          <Buddy who={who} pose="walk" size={116} />
        </div>)}
      </div>
      <p className="huddle-loading-caption">Huddling<span className="huddle-loading-dots"><span>.</span><span>.</span><span>.</span></span></p>
    </div>
  </div>;
}
