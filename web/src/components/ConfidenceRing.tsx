// Plain SVG ring for groupState.confidence (0-1, or null before the first preview).
export default function ConfidenceRing({ value, size = 88 }: { value: number | null; size?: number }) {
  const r = size / 2 - 6;
  const circ = 2 * Math.PI * r;
  const v = value ?? 0;
  return (
    <svg width={size} height={size} role="img" aria-label={`Confidence ${Math.round(v * 100)}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ddd" strokeWidth={8} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#111"
        strokeWidth={8}
        strokeDasharray={`${circ * v} ${circ}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize={size / 5}>
        {value === null ? "–" : `${Math.round(v * 100)}%`}
      </text>
    </svg>
  );
}
