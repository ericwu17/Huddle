// Hand-drawn stick figures, built as SVG so they can walk, wave and huddle.
// Every stroke runs through a "boiling" filter so the ink jitters like a flipbook.

export const INK = "#16152b";

// One shared filter: turbulence whose seed steps a few times a second.
export const filterDefs = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <filter id="boil" x="-20%" y="-20%" width="140%" height="140%">
    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="1">
      <animate attributeName="seed" values="1;4;7;2" dur="0.5s" calcMode="discrete" repeatCount="indefinite"/>
    </feTurbulence>
    <feDisplacementMap in="SourceGraphic" scale="2.6"/>
  </filter>
  <!-- The background wobble is two still frames (A and B), each drawn once and cached;
       the page flips between them instead of re-filtering the whole screen. -->
  <filter id="wobA" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" seed="3"/>
    <feDisplacementMap in="SourceGraphic" scale="5"/>
  </filter>
  <filter id="wobB" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" seed="8"/>
    <feDisplacementMap in="SourceGraphic" scale="5"/>
  </filter>
  <!-- Crayon hatching for the hills: a base colour with darker strokes laid at an angle. -->
  <pattern id="hatchFar" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(-32)">
    <rect width="22" height="22" fill="#c4f08e"/><path d="M0 6 H22 M0 17 H22" stroke="#a6e061" stroke-width="5" stroke-linecap="round"/>
  </pattern>
  <pattern id="hatchMid" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(28)">
    <rect width="20" height="20" fill="#9be34d"/><path d="M0 5 H20 M0 15 H20" stroke="#78cc2a" stroke-width="5" stroke-linecap="round"/>
  </pattern>
  <pattern id="hatchNear" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(-40)">
    <rect width="18" height="18" fill="#73d12c"/><path d="M0 4 H18 M0 13 H18" stroke="#52b31a" stroke-width="5" stroke-linecap="round"/>
  </pattern>
  <pattern id="hatchSky" width="60" height="60" patternUnits="userSpaceOnUse" patternTransform="rotate(-18)">
    <rect width="60" height="60" fill="#5b7cf5"/><path d="M0 14 H60 M0 44 H60" stroke="#6a89f8" stroke-width="16" stroke-linecap="round"/>
  </pattern>
  <pattern id="hatchSun" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect width="12" height="12" fill="#ffd23a"/><path d="M0 4 H12" stroke="#ffbf1a" stroke-width="4"/>
  </pattern>
</svg>`;

// ---- The drawn world: sky, sun, clouds, three hills, flowers -------------------
const cloud = (x: number, y: number, s: number) => `<path transform="translate(${x} ${y}) scale(${s})" d="M-90 20 c-30 0 -34 -40 -4 -44 c2 -30 46 -40 62 -14 c14 -34 70 -30 74 6 c32 -6 48 30 22 46 c4 14 -10 24 -26 22 z" fill="#fff" stroke="${INK}" stroke-width="${6 / s}"/>`;
function flowers(seed: number, n: number, y0: number, y1: number) {
  let s = seed, out = "";
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < n; i++) {
    const x = r() * 1600, y = y0 + r() * (y1 - y0), c = ["#ff5fb4", "#ffffff", "#ffd23a"][i % 3];
    out += `<g transform="translate(${x.toFixed(0)} ${y.toFixed(0)})"><path d="M0 0 v18" stroke="${INK}" stroke-width="3"/>` +
      [0, 72, 144, 216, 288].map((a) => `<circle cx="${(Math.cos(a * Math.PI / 180) * 7).toFixed(1)}" cy="${(Math.sin(a * Math.PI / 180) * 7).toFixed(1)}" r="6" fill="${c}" stroke="${INK}" stroke-width="2.5"/>`).join("") +
      `<circle r="4" fill="${INK}"/></g>`;
  }
  return out;
}
const birds = `<g fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"><path d="M560 220 q14 -14 26 0 q12 -14 26 0"/><path d="M640 180 q10 -10 20 0 q10 -10 20 0"/><path d="M500 260 q8 -8 16 0 q8 -8 16 0"/></g>`;

// `only` picks which layers to draw, so the page can stack them as separate planes.
export type Layer = "sky" | "sun" | "clouds" | "far" | "mid" | "near";

export function world({ sun = true, wobble = "wobA", only = ["sky", "sun", "clouds", "far", "mid", "near"] as Layer[] } = {}) {
  const has = (k: Layer) => only.includes(k);
  return `
<svg class="doodle-world" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
  <g filter="url(#${wobble})" stroke-linejoin="round" stroke-linecap="round">
    ${has("sky") ? `<g class="lay lay-sky"><rect x="-200" y="-300" width="2000" height="1600" fill="url(#hatchSky)"/>${birds}</g>` : ""}
    ${sun && has("sun") ? `<g class="lay lay-sun" transform="translate(1330 190)">
      <g stroke="${INK}" stroke-width="7">${Array.from({ length: 12 }, (_, i) => { const a = i * 30 * Math.PI / 180; return `<path d="M${(Math.cos(a) * 98).toFixed(0)} ${(Math.sin(a) * 98).toFixed(0)} L${(Math.cos(a) * (i % 2 ? 128 : 142)).toFixed(0)} ${(Math.sin(a) * (i % 2 ? 128 : 142)).toFixed(0)}"/>`; }).join("")}</g>
      <circle r="82" fill="url(#hatchSun)" stroke="${INK}" stroke-width="7"/>
      <circle cx="-26" cy="-10" r="7" fill="${INK}"/><circle cx="26" cy="-10" r="7" fill="${INK}"/>
      <path d="M-30 22 q30 30 60 0" fill="none" stroke="${INK}" stroke-width="7"/>
      <circle cx="-46" cy="16" r="10" fill="#ff8cc8"/><circle cx="46" cy="16" r="10" fill="#ff8cc8"/>
    </g>` : ""}
    ${has("clouds") ? `<g class="lay lay-clouds">${cloud(260, 210, 1.3)}${cloud(820, 120, 0.9)}${cloud(1080, 330, 1.1)}${cloud(-20, 420, 0.8)}${cloud(1560, 470, 0.9)}</g>` : ""}
    ${has("far") ? `<g class="lay lay-far"><path d="M-100 610 C180 520 380 560 540 600 C700 640 840 530 1020 556 C1200 582 1320 520 1700 580 V1300 H-100Z" fill="url(#hatchFar)" stroke="${INK}" stroke-width="7"/></g>` : ""}
    ${has("mid") ? `<g class="lay lay-mid"><path d="M-100 730 C160 650 360 660 560 712 C760 764 930 650 1130 662 C1330 674 1450 720 1700 690 V1300 H-100Z" fill="url(#hatchMid)" stroke="${INK}" stroke-width="7"/>${flowers(7, 10, 740, 820)}</g>` : ""}
    ${has("near") ? `<g class="lay lay-near"><path d="M-100 850 C200 780 450 796 650 840 C870 888 1060 800 1290 806 C1460 812 1560 846 1700 834 V1300 H-100Z" fill="url(#hatchNear)" stroke="${INK}" stroke-width="7"/>${flowers(19, 14, 870, 980)}</g>` : ""}
  </g>
</svg>`;
}

// Hair and faces, so each friend reads as a different person.
export const HAIR = {
  spiky: `<path d="M-13 14 l3 -9 l3 6 l3 -9 l3 7 l3 -9 l3 8 l3 -6" fill="none"/>`,
  mop: `<path d="M-15 18 c-2 -14 10 -22 18 -18 c6 -4 14 2 12 14 c-4 -6 -10 -8 -14 -6 c-6 -2 -12 2 -16 10z" fill="${INK}"/>`,
  pony: `<path d="M-14 16 c0 -14 26 -16 28 -2" fill="none"/><path d="M13 12 c10 2 12 14 6 22" fill="none"/>`,
  cap: `<path d="M-15 14 c2 -14 28 -14 30 0z" fill="${INK}"/><path d="M14 13 l12 1" fill="none"/>`,
  bald: ``,
  curly: `<path d="M-14 12 c-4 -6 2 -10 5 -8 c0 -6 8 -6 9 -1 c2 -5 10 -4 9 2 c5 -1 7 5 3 8" fill="none"/>`,
};
export const FACE = {
  smile: `<circle cx="-5" cy="20" r="1.8" fill="${INK}" stroke="none"/><circle cx="6" cy="20" r="1.8" fill="${INK}" stroke="none"/><path d="M-7 27 q6 6 13 0" fill="none"/>`,
  grin: `<circle cx="-5" cy="19" r="1.8" fill="${INK}" stroke="none"/><circle cx="6" cy="19" r="1.8" fill="${INK}" stroke="none"/><path d="M-8 25 q8 9 16 0 z" fill="${INK}"/>`,
  beard: `<circle cx="-5" cy="19" r="1.8" fill="${INK}" stroke="none"/><circle cx="6" cy="19" r="1.8" fill="${INK}" stroke="none"/><path d="M-9 26 c2 10 16 10 18 0 c-4 4 -14 4 -18 0z" fill="${INK}"/>`,
};

// Stick figure, hip at (0, 92). Parts are grouped so CSS can swing them.
export type Hair = keyof typeof HAIR;
export type Face = keyof typeof FACE;

export function figure({
  hair = "bald" as Hair,
  face = "smile" as Face,
  scarf = "#ff5fb4",
  boil = true,
}: { hair?: Hair; face?: Face; scarf?: string; boil?: boolean } = {}) {
  return `
<svg class="fig" viewBox="-46 -14 92 162" aria-hidden="true">
  <g ${boil ? 'filter="url(#boil)"' : ""} stroke="${INK}" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <g class="leg leg-l"><path d="M0 92 L-6 138 l-9 1"/></g>
    <g class="leg leg-r"><path d="M0 92 L6 138 l9 1"/></g>
    <path class="torso" d="M-2 40 C-3 58 -1 76 0 92 M2 42 C3 60 2 76 1 90" stroke-width="5.6"/>
    <path d="M-7 40 q7 6 14 0" stroke="${scarf}" stroke-width="5"/>
    <g class="arm arm-l"><path d="M0 48 L-18 78 m0 0 l-5 3 m5 -3 l-2 6 m2 -6 l-6 -1"/></g>
    <g class="arm arm-r"><path d="M0 48 L18 78 m0 0 l5 3 m-5 -3 l2 6 m-2 -6 l6 -1"/>
      <rect class="phone" x="13" y="72" width="11" height="17" rx="3" fill="#fff" stroke-width="3.4"/></g>
    <circle cx="0" cy="22" r="16" fill="#fff"/>
    ${FACE[face]}
    ${HAIR[hair]}
  </g>
</svg>`;
}

// A scribbled padlock, shown over heads when they type privately.
export const LOCK = `<svg class="lock" viewBox="0 0 30 34" aria-hidden="true"><g filter="url(#boil)" stroke="${INK}" stroke-width="3" fill="#fff" stroke-linecap="round"><path d="M8 15 v-5 a7 7 0 0 1 14 0 v5" fill="none"/><rect x="4" y="15" width="22" height="16" rx="4"/><path d="M15 21 v4"/></g></svg>`;
