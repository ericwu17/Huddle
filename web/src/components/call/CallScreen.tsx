import { useCallEvents } from "../../data";
import type { Booking } from "../../types";
import { Buddy } from "../../doodle/Doodle";
import { displayTime } from "../../venueFormatting";

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
    <section className="space-y-5">
      <div className="flex items-end gap-3">
        <Buddy who={booking.restaurantName} pose={confirmed ? "huddle" : "ear"} size={96} boil={!confirmed && !failed} />
        <h1 className="shout text-[44px]">Calling {booking.restaurantName}</h1>
      </div>

      <ol className="flex flex-wrap gap-1.5">
        {STEPS.map((s) => (
          <li key={s.type} className={`sticker ${seen.has(s.type) ? "sticker-lime" : "opacity-70"}`}>
            {seen.has(s.type) ? "✓ " : ""}
            {s.label}
          </li>
        ))}
      </ol>

      <div className={`call-phone ${confirmed || failed ? "" : "is-ringing"}`}>
        <div className="call-screen">
          {events === undefined && <p className="muted">Loading…</p>}
          {events !== undefined && transcript.length === 0 && (
            <p className="muted hand text-center text-lg">
              Ringing <span className="dots"><i /><i /><i /></span>
            </p>
          )}
          {transcript.map((e) => (
            <div key={e.id} className={`call-line pop-in ${e.speaker === "agent" ? "is-us" : "is-them"}`}>
              <p className="call-who">{e.speaker === "agent" ? "Huddle AI" : "Restaurant"}</p>
              <p>{e.text}</p>
              {e.textEn && <p className="muted italic">{e.textEn}</p>}
            </div>
          ))}
        {events
          ?.filter((e) => e.type === "slot_offered")
          .map((e) => (
            <p key={e.id} className="sticker sticker-sun mx-auto">
              Offered {displayTime(e.slot)}
            </p>
          ))}
        </div>
      </div>

      {confirmed && (
        <div className="card card-mint card-tilt-r pop-in space-y-1 text-center">
          <p className="display text-5xl text-[var(--green)]">Booked!</p>
          <p className="font-bold">{booking.restaurantName}</p>
          <p>
            {displayTime(confirmed.slot ?? booking.slot)} · party of {booking.partySize}
          </p>
        </div>
      )}

      {failed && (
        <div className="card card-pink space-y-2">
          {failed.reason === "full" || failed.reason === "closed" ? (
            <p className="card-title">Call failed: that place is {failed.reason}. Re-planning…</p>
          ) : (
            <>
              <p className="card-title">Call failed ({failed.reason ?? "error"})</p>
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
