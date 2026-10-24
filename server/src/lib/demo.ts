// Demo-mode safety net (build-brief S6). Every api and voice call from a job goes through
// here, scoped to one group:
// - group.demoMode on (host toggle): use the labeled fakes, never touch the network.
// - a call fails (tunnel down, 5xx, timeout): switch that group to demo mode and carry on
//   with fakes, so a dead laptop mid-demo shows the honest "Demo mode: cached data" banner
//   instead of a frozen screen. Demo mode stays on until the host turns it off.
// Disclosed in docs/HONESTY.md.
import { callApi, callVoice, type ApiResult } from "./api";
import { fakeApi } from "./fakes";
import type { Proc } from "./types";

export type DemoResult<T> = ApiResult<T> & { demo?: string };

function isDemo(ctx: Proc, groupId: string): boolean {
  return ctx.withTx((tx) => tx.db.group.id.find(groupId)?.demoMode ?? false);
}

function enterDemo(ctx: Proc, groupId: string) {
  ctx.withTx((tx) => {
    const g = tx.db.group.id.find(groupId);
    if (g && !g.demoMode) tx.db.group.id.update({ ...g, demoMode: true });
  });
}

// This reason becomes a group-visible plan warning. Remote response bodies and
// exception text can echo private preferences or credentials; never include them.
const reason = (r: ApiResult<unknown>) => r.ok ? "" :
  `${r.error.path}${r.error.status == null ? " unavailable or timed out" : ` HTTP ${r.error.status}`}`;

// Same result shape as callApi; `demo` says why fakes were used, if they were.
export function apiFor<T = any>(ctx: Proc, groupId: string, path: string, body: unknown): DemoResult<T> {
  if (isDemo(ctx, groupId)) return { ok: true, data: fakeApi(path, body) as T, stub: true, demo: "demo mode on" };
  const res = callApi<T>(ctx, path, body);
  if (res.ok) return res;
  const why = reason(res);
  enterDemo(ctx, groupId);
  return { ok: true, data: fakeApi(path, body) as T, stub: true, demo: `api unreachable: ${why}` };
}

// stub: true means "play the module's fake call events" (the voice service did not take it).
export function voiceFor<T = any>(ctx: Proc, groupId: string, path: string, body: unknown): DemoResult<T> {
  if (isDemo(ctx, groupId)) return { ok: true, data: { accepted: true } as T, stub: true, demo: "demo mode on" };
  const res = callVoice<T>(ctx, path, body);
  if (res.ok) return res;
  const why = reason(res);
  enterDemo(ctx, groupId);
  return { ok: true, data: { accepted: true } as T, stub: true, demo: `voice unreachable: ${why}` };
}
