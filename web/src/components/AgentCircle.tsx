import type { CSSProperties } from "react";
import { Buddy } from "../doodle/Doodle";

export type CircleAgent = { id: string; label: string; who: string; coordinator?: boolean };

// Everyone, including the coordinator, stands on the same ring.
export default function AgentCircle({ agents, activeId, speech }: {
  agents: CircleAgent[];
  activeId?: string;
  speech?: { text: string; turn: number };
}) {
  return <ul className="agent-circle" aria-label="Agents in the huddle">
    {agents.map((agent, index) => {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / agents.length;
      const speaking = agent.id === activeId;
      const side = Math.cos(angle) < -.25 ? "left" : Math.cos(angle) > .25 ? "right" : "center";
      const style = {
        left: `${50 + Math.cos(angle) * 34}%`,
        top: `${50 + Math.sin(angle) * 32}%`,
        zIndex: speaking ? 4 : Math.sin(angle) > 0 ? 2 : 1,
        "--agent-delay": `${index * -.38}s`,
      } as CSSProperties;
      return <li key={agent.id} className={`agent-circle-member speech-${side}${speaking ? " is-speaking" : ""}`} style={style}>
        {speaking && speech ? <div className="agent-speech">
          <p key={speech.turn} className="planning-bubble">
            <span className="planning-speaker">{agent.label}</span>
            <span>{speech.text}</span>
          </p>
        </div> : null}
        <span className="agent-circle-figure">
          <Buddy who={agent.who} pose={speaking ? "argue" : "huddle"} size={76} crown={agent.coordinator} />
        </span>
        <span className="agent-circle-name">{agent.label}</span>
      </li>;
    })}
  </ul>;
}
