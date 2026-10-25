import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Buddy } from "../doodle/Doodle";

export type TieOption = { id: string; number: number; who: string };
export const TIE_REVEAL_MS = 2500;
const SPIN_MS = 2000;

export default function TieBreaker({ options, winnerId, onComplete }: {
  options: TieOption[]; winnerId: string; onComplete: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [landed, setLanded] = useState(false);
  const winnerIndex = options.findIndex(option => option.id === winnerId);
  const winner = options[winnerIndex];
  const hasWinner = winnerIndex >= 0;
  const angleFor = (index: number) => -90 + index * 360 / options.length;
  const angle = ((angleFor(winnerIndex) % 360) + 360) % 360;
  const style = { "--spin-end": `${1440 + angle}deg`, "--spin-duration": `${SPIN_MS}ms` } as CSSProperties;

  useEffect(() => {
    const element = dialog.current;
    if (!element || !hasWinner) return;
    element.showModal();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const land = window.setTimeout(() => setLanded(true), reducedMotion ? 0 : SPIN_MS);
    const complete = window.setTimeout(onComplete, TIE_REVEAL_MS);
    return () => {
      window.clearTimeout(land);
      window.clearTimeout(complete);
      element.close();
    };
  }, [hasWinner, onComplete]);

  if (!winner) return null;
  return <dialog ref={dialog} className="tie-breaker-dialog" aria-labelledby="tie-breaker-title"
    aria-describedby="tie-breaker-status" onCancel={event => event.preventDefault()}>
    <section className="card tie-breaker-card" style={style} data-winner={winnerId}>
      <span className="sticker sticker-sun">It’s a tie!</span>
      <h2 id="tie-breaker-title">Let’s give it a spin</h2>
      <div className={`tie-wheel${landed ? " has-landed" : ""}`}>
        <div className="tie-wheel-ring" aria-hidden="true" />
        <ul className="tie-contenders" aria-label="Tied options">
          {options.map((option, index) => {
            const radians = angleFor(index) * Math.PI / 180;
            return <li key={option.id} className={`tie-contender${landed && option.id === winnerId ? " is-winner" : ""}`}
              style={{ left: `${50 + Math.sin(radians) * 35}%`, top: `${50 - Math.cos(radians) * 35}%` }}>
              <span className="tie-figure"><Buddy who={option.who} pose={landed && option.id === winnerId ? "wave" : "huddle"} size={88} crown={landed && option.id === winnerId} /></span>
              <strong className="tie-option-label">Option {option.number}</strong>
              <span className="tie-person">{option.who}</span>
            </li>;
          })}
        </ul>
        <div className="tie-pointer" aria-hidden="true">
          <svg className="tie-arrow" viewBox="0 0 200 200">
            <path d="M100 27 L120 57 L108 55 L108 115 Q100 126 92 115 L92 55 L80 57 Z" />
          </svg>
          <span className="tie-pointer-pin" />
        </div>
      </div>
      <p id="tie-breaker-status" className={`tie-result${landed ? " is-winner" : ""}`} role="status" aria-live="polite">
        {landed ? `Option ${winner.number} wins!` : "Round and round…"}
      </p>
    </section>
  </dialog>;
}
