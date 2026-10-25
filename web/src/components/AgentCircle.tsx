import type { CSSProperties } from "react";
import { Buddy } from "../doodle/Doodle";

export type CircleAgent = { id: string; label: string; who: string; coordinator?: boolean };

// Everyone, including the coordinator, stands on the same ring.
export default function AgentCircle({ agents, activeId }: { agents: CircleAgent[]; activeId?: string }) {
  return <ul className="agent-circle" aria-label="Agents in the huddle">
    {agents.map((agent, index) => {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / agents.length;
      const speaking = agent.id === activeId;
      const style = {
        left: `${50 + Math.cos(angle) * 34}%`,
        top: `${50 + Math.sin(angle) * 32}%`,
        zIndex: speaking ? 4 : Math.sin(angle) > 0 ? 2 : 1,
        "--agent-delay": `${index * -.38}s`,
      } as CSSProperties;
      return <li key={agent.id} className={`agent-circle-member${speaking ? " is-speaking" : ""}`} style={style}>
        <span className="agent-circle-figure">
          <Buddy who={agent.who} pose={speaking ? "argue" : "huddle"} size={76} crown={agent.coordinator} />
        </span>
        <span className="agent-circle-name">{agent.label}</span>
      </li>;
    })}
  </ul>;
}
