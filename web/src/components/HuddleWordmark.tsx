import { useId, type CSSProperties } from "react";
import "../huddle-brand.css";

// Independent windows into the generated letter atlas preserve the drawn logo.
// The first seam curves through the transparent gap between h and u.
const SEAM = "385 0 385 220 376 260 375 300 372 340 368 380 366 420 379 460 397 500 405 540 400 600 400 731";
const LETTERS = [
  { letter: "h", x: 0, width: 400, clip: `0 0 ${SEAM} 0 731` },
  { letter: "u", x: 400, width: 339, clip: `${SEAM} 739 731 739 0` },
  { letter: "d", x: 739, width: 365 },
  { letter: "d", x: 1104, width: 396 },
  { letter: "l", x: 1500, width: 260 },
  { letter: "e", x: 1760, width: 392 },
];

export default function HuddleWordmark({ className = "", decorative = false }: { className?: string; decorative?: boolean }) {
  const id = useId();
  return <span className={`huddle-wordmark ${className}`} role={decorative ? undefined : "img"} aria-label={decorative ? undefined : "Huddle"} aria-hidden={decorative || undefined}>
    {LETTERS.map(({ letter, x, width, clip }, index) => <span className="huddle-letter" data-letter={letter} key={index}
      style={{ "--letter-width": `${width / 2152 * 100}%` } as CSSProperties} aria-hidden="true">
      <svg className="huddle-letter-art" viewBox={`${x} 90 ${width} 535`} preserveAspectRatio="none" focusable="false">
        <defs><clipPath id={`${id}-letter-${index}`} clipPathUnits="userSpaceOnUse">
          {clip ? <polygon points={clip} /> : <rect x={x} y="0" width={width} height="731" />}
        </clipPath></defs>
        <image href="/brand/huddle-letters.png" width="2152" height="731" clipPath={`url(#${id}-letter-${index})`} />
      </svg>
    </span>)}
  </span>;
}
