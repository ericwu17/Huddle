import "../huddle-brand.css";

export default function HuddleWordmark({ className = "", decorative = false }: { className?: string; decorative?: boolean }) {
  return <img className={`huddle-wordmark ${className}`} src="/brand/huddle-wordmark.png"
    width={2152} height={731} alt={decorative ? "" : "Huddle"} decoding="async" />;
}
