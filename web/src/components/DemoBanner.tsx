export default function DemoBanner({ on }: { on: boolean }) {
  if (!on) return null;
  return <p className="sticker sticker-sun">Demo mode: cached data</p>;
}
