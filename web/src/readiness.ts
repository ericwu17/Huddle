import type { GroupContext } from "./groupContext";
import type { Votes } from "./types";

export type Readiness = { ready: boolean; label: string };

// "Ready" belongs to the current step and starts over when the group moves on:
// in the lobby everyone is just here, on Needs it means saved, on Vote it means
// voted. Plans and Booking have no per-person action, so nobody is "ready" there.
export function readinessFor(step: string, ctx: GroupContext, memberId: string, votes?: Votes): Readiness {
  const member = ctx.group.members.find((m) => m.id === memberId);
  switch (step) {
    case "lobby":
      return ctx.agent ? { ready: true, label: "here" } : { ready: !!member?.ready, label: member?.ready ? "ready" : "not yet" };
    case "prefs": {
      const saved = ctx.agent ? ctx.agent.confirmedMemberIds.includes(memberId) : !!member?.ready;
      return { ready: saved, label: saved ? "ready" : "writing…" };
    }
    case "plans":
      return { ready: false, label: "reading" };
    case "vote": {
      const voted = !!votes?.voted.includes(memberId);
      return { ready: voted, label: voted ? "voted" : "deciding…" };
    }
    case "call":
      return { ready: false, label: "watching" };
    default:
      return { ready: false, label: "…" };
  }
}

export function stepOf(pathname: string) {
  return pathname.split("/").filter(Boolean).at(-1) ?? "lobby";
}
