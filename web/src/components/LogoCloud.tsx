import { useEffect, useRef } from "react";

// The HUDDLE logo is a cloud that drifts across the top of every screen toward
// the sun drawn in the background. When it reaches the sun's rays the sun puffs
// and blows it all the way back to the start. The sun sits at (1330, 190) in the
// 1600x1000 "slice" world (see doodle/doodles.ts), so we mirror that geometry to
// know where the cloud has to stop; on narrow screens the sun is off the edge
// and the cloud turns back at the edge of the screen instead.
const SUN = { x: 1330, y: 190, rays: 142, w: 1600, h: 1000 };
const START = 12;

export default function LogoCloud() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const place = () => {
      const el = root.current;
      const cloud = el?.querySelector<HTMLElement>(".logo-cloud");
      if (!el || !cloud) return;
      const width = window.innerWidth, height = window.innerHeight;
      const scale = Math.max(width / SUN.w, height / SUN.h);
      const sunX = (width - SUN.w * scale) / 2 + SUN.x * scale;
      const w = cloud.offsetWidth;
      const stop = Math.max(0, Math.min(sunX - (SUN.rays + 8) * scale - w, width - w - 24) - START);
      el.style.setProperty("--travel", `${Math.round(stop)}px`);
      el.style.setProperty("--wind-x", `${Math.round(START + stop + w + 4)}px`);
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, []);

  return (
    <div className="logo-root" ref={root}>
      <svg className="logo-wind" viewBox="0 0 90 60" aria-hidden="true">
        <g fill="none" stroke="#fffdf7" strokeWidth="4.5" strokeLinecap="round">
          <path d="M86 12 C64 8 52 18 30 12" />
          <path d="M80 30 C56 26 40 38 12 30" />
          <path d="M86 48 C66 44 56 54 36 48" />
        </g>
      </svg>
      <a className="logo-cloud" href="/start" aria-label="Huddle home">
        <span className="logo-cloud-bob">
          <svg viewBox="0 0 220 110" aria-hidden="true" focusable="false">
            <path
              d="M46 94 C16 94 6 66 28 56 C22 28 60 16 78 36 C90 6 136 4 148 34 C168 16 206 32 194 60 C218 66 214 94 186 94 Z"
              fill="#fff" stroke="#16152b" strokeWidth="5" strokeLinejoin="round" filter="url(#wobA)"
            />
          </svg>
          <span className="logo-cloud-word">Huddle</span>
        </span>
      </a>
    </div>
  );
}
