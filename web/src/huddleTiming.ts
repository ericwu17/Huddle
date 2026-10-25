import { useState } from "react";
import { useProcedure, useReducer, useTable } from "spacetimedb/react";
import { procedures, reducers, tables } from "./module_bindings";
import { useGroupConnectors } from "./accountData";
import { useGroup } from "./groupContext";
import { defaultCalendarSearch } from "./calendarTime";

export function useHuddleTiming() {
  const [rows, ready] = useTable(tables.myHuddleTiming);
  return ready ? rows[0] ?? null : undefined;
}

export function useMyTimePreference() {
  const [rows, ready] = useTable(tables.myTimePreference);
  return ready ? rows[0] ?? null : undefined;
}

// Find plans authorizes a free/busy check. Missing/failed calendar responses
// never become a claim that everyone is free.
export function useCalendarPlanning() {
  const { group } = useGroup();
  const timing = useHuddleTiming();
  const calendars = useGroupConnectors();
  const schedule = useProcedure(procedures.scheduleHuddle);
  const find = useReducer(reducers.findAgentPlans);
  const clearTime = useReducer(reducers.clearHuddleWindow);
  const [notice, setNotice] = useState("");
  const ready = timing !== undefined && calendars !== undefined;
  async function findPlans() {
    if (!ready) throw new Error("Wait for calendar connection status, then try again.");
    if (timing?.groupId === group.id && timing.source !== "manual") {
      const connected = group.members.length >= 2 && group.members.every(member => calendars?.some(c => c.memberId === member.id && c.connected));
      if (connected) {
        setNotice("Finding a shared calendar opening…");
        try {
          const response = await schedule(defaultCalendarSearch());
          if (!response.ok) await clearTime();
          setNotice(response.ok ? "A shared calendar opening was found." : "No shared calendar opening was found. Huddle picked a time for the plans.");
        } catch {
          await clearTime();
          setNotice("Calendars could not be checked. Huddle picked a time for the plans.");
        }
      } else setNotice("Huddle picked a time for the plans. Connect everyone’s calendar or choose a time to set it yourself.");
    }
    await find();
  }
  return { findPlans, ready, notice };
}
