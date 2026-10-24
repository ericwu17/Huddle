// Every read the UI makes, in one place. Each hook subscribes to one of the
// module's views (server/src/views.ts, docs/CONTRACT.md S5.5) and maps its
// rows to the contract types in types.ts. A hook returns undefined until its
// subscription has loaded. Views are scoped to the caller's current group, so
// none of these take a groupId.
import { useMemo } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "./module_bindings";
import type {
  Booking,
  CallEvent,
  Category,
  CouncilMessage,
  FailReason,
  GroupState,
  GroupStatus,
  MyPrivate,
  Offer,
  PlanRun,
  ScoutCheck,
  Votes,
} from "./types";

const parse = <T>(json: string | undefined): T | null => (json ? (JSON.parse(json) as T) : null);

export function useGroupState(): GroupState | null | undefined {
  const [groups, groupsReady] = useTable(tables.myGroup);
  const [members, membersReady] = useTable(tables.myMembers);
  return useMemo(() => {
    if (!groupsReady || !membersReady) return undefined;
    const g = groups[0];
    if (!g) return null;
    return {
      id: g.id,
      status: g.status as GroupStatus,
      code: g.code,
      date: g.date,
      window: { start: g.windowStart, end: g.windowEnd },
      demoMode: g.demoMode,
      showWhoCompromised: g.showWhoCompromised,
      isHost: g.isHost,
      members: members.map((m) => ({ id: m.id, name: m.name, ready: m.ready, swipeCount: m.swipeCount })),
      confidence: g.confidence ?? null,
      latestRunId: g.latestRunId ?? null,
      replanFor: g.replanFor ?? null,
    };
  }, [groups, groupsReady, members, membersReady]);
}

export function useMyPrivate(): MyPrivate | undefined {
  const [rows, rowsReady] = useTable(tables.myPrivate);
  const [offers, offersReady] = useTable(tables.myOffers);
  return useMemo(() => {
    if (!rowsReady || !offersReady) return undefined;
    const me = rows[0];
    const summary = parse<{ name: string; mean: number; sd: number }[]>(me?.posteriorSummaryJson);
    return {
      text: me?.text ?? null,
      hard: parse(me?.hardJson),
      warnings: parse<string[]>(me?.warningsJson) ?? [],
      posteriorSummary: me && summary ? { memberId: me.memberId, features: summary } : null,
      nextPair:
        me?.nextPairA && me.nextPairB
          ? { a: me.nextPairA, b: me.nextPairB, category: me.nextPairCategory as Category }
          : null,
      // The view only returns open offers on the latest run.
      offers: offers.map(
        (o): Offer => ({
          offerId: o.id,
          type: o.type as Offer["type"],
          amount: o.amount,
          unit: o.unit as Offer["unit"],
          plan: JSON.parse(o.planJson),
          text: o.text,
          robustnessGain: o.robustnessGain,
          minRatioGain: o.minRatioGain,
          status: "open",
        }),
      ),
    };
  }, [rows, rowsReady, offers, offersReady]);
}

export function usePlanRun(runId: string | null): PlanRun | null | undefined {
  const [runs, ready] = useTable(tables.myPlanRuns);
  return useMemo(() => {
    if (!ready) return undefined;
    const r = runs.find((run) => run.runId === runId);
    if (!r) return null;
    return {
      runId: r.runId,
      status: r.status as PlanRun["status"],
      result: parse(r.resultJson),
      council: parse(r.councilJson),
      error: r.error ?? null,
    };
  }, [runs, ready, runId]);
}

export function useScout(runId: string | null): ScoutCheck[] | undefined {
  const [rows, ready] = useTable(tables.myScout);
  return useMemo(() => {
    if (!ready) return undefined;
    return rows
      .filter((c) => c.runId === runId)
      .map((c) => ({
        placeId: c.placeId,
        openNow: c.openNow ?? null,
        vegetarianOptions: c.vegetarianOptions ?? null,
        checkedAt: c.checkedAt,
        source: c.source,
        cached: c.cached,
      }));
  }, [rows, ready, runId]);
}

export function useVotes(runId: string | null, myMemberId: string): Votes | undefined {
  const [rows, ready] = useTable(tables.myVotes);
  return useMemo(() => {
    if (!ready) return undefined;
    const inRun = rows.filter((v) => v.runId === runId);
    const counts: Record<string, number> = {};
    const byPlan: Record<string, string[]> = {};
    for (const v of inRun) {
      counts[v.planId] = (counts[v.planId] ?? 0) + 1;
      (byPlan[v.planId] ??= []).push(v.memberId);
    }
    return {
      counts,
      byPlan,
      total: inRun.length,
      myVote: inRun.find((v) => v.memberId === myMemberId)?.planId ?? null,
    };
  }, [rows, ready, runId, myMemberId]);
}

export function useCouncilMessages(runId: string): CouncilMessage[] | undefined {
  const [rows, ready] = useTable(tables.myCouncilMessages);
  return useMemo(() => {
    if (!ready) return undefined;
    return rows
      .filter((m) => m.runId === runId)
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((m) => ({
        id: String(m.id),
        runId: m.runId,
        round: m.round as CouncilMessage["round"],
        speaker: m.speaker as CouncilMessage["speaker"],
        label: m.label,
        memberId: m.memberId,
        planId: m.planId ?? null,
        stance: parse(m.stanceJson),
        text: m.text,
        cited: parse(m.citedJson) ?? [],
        ts: m.ts,
      }));
  }, [rows, ready, runId]);
}

// The group's most recent booking, or null if nobody has tapped "Book it".
export function useLatestBooking(): Booking | null | undefined {
  const [rows, ready] = useTable(tables.myBookings);
  return useMemo(() => {
    if (!ready) return undefined;
    const b = [...rows].sort((x, y) => y.createdAt - x.createdAt)[0];
    if (!b) return null;
    return {
      bookingId: b.id,
      runId: b.runId,
      planId: b.planId,
      stopIndex: b.stopIndex,
      placeId: b.placeId,
      restaurantName: b.restaurantName,
      partySize: b.partySize,
      time: b.time,
      status: b.status as Booking["status"],
      slot: b.slot ?? null,
      failReason: (b.failReason as FailReason | undefined) ?? null,
    };
  }, [rows, ready]);
}

export function useCallEvents(bookingId: string): CallEvent[] | undefined {
  const [rows, ready] = useTable(tables.myCallEvents);
  return useMemo(() => {
    if (!ready) return undefined;
    return rows
      .filter((e) => e.bookingId === bookingId)
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((e) => ({
        id: String(e.id),
        bookingId: e.bookingId,
        type: e.type as CallEvent["type"],
        text: e.text ?? null,
        textEn: e.textEn ?? null,
        speaker: e.speaker as CallEvent["speaker"],
        lang: e.lang,
        slot: e.slot ?? null,
        reason: e.reason as FailReason | undefined,
        ts: e.ts,
      }));
  }, [rows, ready, bookingId]);
}
