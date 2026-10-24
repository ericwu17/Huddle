import type { GroupContext } from "./groupContext";
import type { Booking } from "./types";

// The huddle as a sequence of steps. Each one says when its Next button opens,
// so nobody walks ahead of what the group has actually reached.
export const PHASES = [
  { step: "lobby", title: "Get everyone in", short: "Lobby" },
  { step: "prefs", title: "Say what you want", short: "Wants" },
  { step: "swipe", title: "This or that", short: "Swipe" },
  { step: "plans", title: "The plans", short: "Plans" },
  { step: "vote", title: "Pick one", short: "Vote" },
  { step: "call", title: "Book it", short: "Call" },
] as const;

export type Step = (typeof PHASES)[number]["step"];

const AFTER_PLANNING = ["planned", "voting", "booked"];

// Can this phone move past `step`? `hint` says what it is waiting for.
export function nextOpen(step: Step, ctx: GroupContext, booking: Booking | null | undefined): { open: boolean; hint: string } {
  const { group, mine } = ctx;
  switch (step) {
    case "lobby":
      return { open: group.status !== "lobby", hint: "Starts once there are 2+ people and everyone is ready" };
    case "prefs":
      return { open: !!mine?.text, hint: "Save what you want first" };
    case "swipe":
      return { open: AFTER_PLANNING.includes(group.status), hint: "Keep swiping until the group is confident" };
    case "plans":
      return { open: group.status === "voting" || group.status === "booked", hint: "Voting opens when the council finishes" };
    case "vote":
      return { open: !!booking || group.status === "booked", hint: "Book the winning plan first" };
    case "call":
      return { open: false, hint: "" };
  }
}

// The furthest step this phone may open from the progress bar.
export function reachable(ctx: GroupContext, booking: Booking | null | undefined): number {
  let i = 0;
  while (i < PHASES.length - 1 && nextOpen(PHASES[i].step, ctx, booking).open) i++;
  return i;
}
