// Doodle ring for groupState.confidence (0-1, or null before the first preview).
export default function ConfidenceRing({ value, size = 88 }: { value: number | null; size?: number }) {
  const r = size / 2 - 8;
  const circ = 2 * Math.PI * r;
  const v = value ?? 0;
  const c = size / 2;
  return (
    <svg width={size} height={size} role="img" aria-label={`Confidence ${Math.round(v * 100)}%`} className="flex-none">
      <circle cx={c} cy={c} r={r} fill="#fff" stroke="#16152b" strokeWidth={3} />
      <circle cx={c} cy={c} r={r} fill="none" stroke="#efeadb" strokeWidth={9} />
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke="#ff5fb4"
        strokeWidth={9}
        strokeLinecap="round"
        strokeDasharray={`${circ * v} ${circ}`}
        transform={`rotate(-90 ${c} ${c})`}
      />
      <text
        x="50%"
        y="52%"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={size / 4}
        fontFamily="Anton, Impact, sans-serif"
        fill="#16152b"
      >
        {value === null ? "–" : `${Math.round(v * 100)}%`}
      </text>
    </svg>
  );
}
