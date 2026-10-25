export default function InvitationDelivery({ status }: { status?: string }) {
  const labels: Record<string, string> = {
    in_app_only: "In their Huddle inbox",
    queued: "Text queued",
    sending: "Sending to Messages…",
    submitted: "Handed to Messages · delivery unconfirmed",
    unavailable: "Text unavailable · invite is in Huddle",
    unknown: "Text status unknown · invite is in Huddle",
    cancelled: "Text cancelled",
  };
  return status ? <p className="muted">{labels[status] ?? "Text status unavailable"}</p> : null;
}
