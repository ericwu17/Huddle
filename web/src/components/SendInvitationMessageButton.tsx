import { useReducer } from "spacetimedb/react";
import { reducers } from "../module_bindings";
import { useRun } from "../useRun";

export default function SendInvitationMessageButton({ invitationId, pending, status }: { invitationId: string; pending: boolean; status?: string }) {
  const send = useReducer(reducers.sendInvitationMessage);
  const { run, busy, error } = useRun();
  if (!pending || !status || !["in_app_only", "unavailable"].includes(status)) return null;
  return <div className="space-y-2"><button className="btn" disabled={busy} onClick={() => run(() => send({ invitationId }))}>{busy ? "Requesting message…" : "Send invitation message"}</button>
    {error ? <p className="error" role="alert">{error}</p> : null}
  </div>;
}
