export default function DemoBanner({ on }: { on: boolean }) {
  if (!on) return null;
  return <div className="card bg-yellow-50 text-sm">Demo mode: cached data</div>;
}
