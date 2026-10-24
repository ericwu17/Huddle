import { useCallEvents } from "../../data";
import type { Booking } from "../../types";

const STEPS = [
  { type: "dialing", label: "Dialing" },
  { type: "connected", label: "Connected" },
  { type: "slot_offered", label: "Slot offered" },
  { type: "confirmed", label: "Confirmed" },
] as const;

type Props = { booking: Booking; onRetry?: () => void };

// D5: live call screen, driven by the my_call_events view.
export default function CallScreen({ booking, onRetry }: Props) {
  const events = useCallEvents(booking.bookingId);

  const seen = new Set(events?.map((e) => e.type));
  const transcript = events?.filter((e) => e.type === "transcript") ?? [];
  const confirmed = events?.findLast((e) => e.type === "confirmed");
  const failed = events?.findLast((e) => e.type === "failed");

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Calling {booking.restaurantName}</h2>

      <ol className="flex gap-2 text-sm">
        {STEPS.map((s) => (
          <li
            key={s.type}
            className={`rounded px-2 py-1 ${seen.has(s.type) ? "bg-black text-white" : "bg-gray-100"}`}
          >
            {s.label}
          </li>
        ))}
      </ol>

      <div className="card max-h-80 space-y-2 overflow-y-auto text-sm">
        {events === undefined && <p className="muted">Loading…</p>}
        {events !== undefined && transcript.length === 0 && <p className="muted">No transcript yet.</p>}
        {transcript.map((e) => (
          <div key={e.id} className={e.speaker === "agent" ? "text-right" : ""}>
            <p className="muted">{e.speaker === "agent" ? "Huddle AI" : "Restaurant"}</p>
            <p>{e.text}</p>
            {e.textEn && <p className="muted italic">{e.textEn}</p>}
          </div>
        ))}
        {events
          ?.filter((e) => e.type === "slot_offered")
          .map((e) => (
            <p key={e.id} className="muted">
              Restaurant offered {e.slot}
            </p>
          ))}
      </div>

      {confirmed && (
        <div className="card space-y-1 bg-green-50">
          <p className="font-semibold">Booked ✓</p>
          <p>{booking.restaurantName}</p>
          <p>
            {confirmed.slot ?? booking.slot} · party of {booking.partySize}
          </p>
        </div>
      )}

      {failed && (
        <div className="card space-y-2 bg-red-50">
          {failed.reason === "full" || failed.reason === "closed" ? (
            <p className="font-semibold">Call failed: that place is {failed.reason}. Re-planning…</p>
          ) : (
            <>
              <p className="font-semibold">Call failed ({failed.reason ?? "error"})</p>
              {failed.text && <p className="text-sm">{failed.text}</p>}
              <button className="btn" disabled={!onRetry} onClick={onRetry}>
                Try again
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
