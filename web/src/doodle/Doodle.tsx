import type { CSSProperties } from "react";
import { figure, filterDefs, world, type Face, type Hair } from "./doodles";

// The hills stay still; CSS animates the clouds and sun without React rerenders.
const WORLD = filterDefs + world({ wobble: "wobA", quietSky: true });

export function DoodleWorld() {
  return <div className="app-world" aria-hidden="true" dangerouslySetInnerHTML={{ __html: WORLD }} />;
}

type Look = { hair: Hair; face: Face; scarf: string };

// The first four are the default friends (and Agents A to D).
const LOOKS: Look[] = [
  { hair: "curly", face: "smile", scarf: "#8fe03b" },
  { hair: "mop", face: "grin", scarf: "#ff5fb4" },
  { hair: "cap", face: "beard", scarf: "#1f3fd8" },
  { hair: "pony", face: "smile", scarf: "#ffd23a" },
  { hair: "spiky", face: "grin", scarf: "#ff8a3d" },
  { hair: "bald", face: "beard", scarf: "#a35bff" },
  { hair: "mop", face: "smile", scarf: "#19b5a5" },
  { hair: "curly", face: "grin", scarf: "#ff5fb4" },
];

// Agent labels retain the same looks as historical council labels.
function lookFor(key: string): Look {
  const letter = /^(?:Agent|Advocate) ([A-Z])$/.exec(key)?.[1];
  if (letter) return LOOKS[(letter.charCodeAt(0) - 65) % LOOKS.length];
  let h = 7;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return LOOKS[h % LOOKS.length];
}

export type Pose = "idle" | "wave" | "argue" | "huddle" | "phone" | "ear" | "walk";

type BuddyProps = {
  who: string;
  pose?: Pose;
  size?: number; // height in px
  boil?: boolean; // jittery ink: keep it for the one or two figures that are "live"
  crown?: boolean;
  className?: string;
};

export function Buddy({ who, pose = "idle", size = 72, boil = false, crown = false, className = "" }: BuddyProps) {
  const style = { height: size, width: (size * 92) / 162 } as CSSProperties;
  return (
    <span className={`buddy pose-${pose} ${className}`} style={style} aria-hidden="true">
      <span className="buddy-fig" dangerouslySetInnerHTML={{ __html: figure({ ...lookFor(who), boil }) }} />
      {crown && (
        <svg className="buddy-crown" viewBox="0 0 40 26">
          <path d="M3 23 L5 6 L13 15 L20 3 L27 15 L35 6 L37 23 Z" />
        </svg>
      )}
    </span>
  );
}
