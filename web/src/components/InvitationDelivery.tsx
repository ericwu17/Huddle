export default function InvitationDelivery({ status }: { status?: string }) {
  const labels: Record<string, string> = {
    in_app_only: "In-app invitation",
    queued: "External message queued",
    sending: "Submitting external message…",
    submitted: "Submitted to Messages · delivery not confirmed",
    unavailable: "External sender unavailable · invitation is in Huddle",
    unknown: "External delivery status unknown · invitation is in Huddle",
    cancelled: "External message cancelled",
  };
  return status ? <p className="muted">{labels[status] ?? "External delivery status unavailable"}</p> : null;
}
