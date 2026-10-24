// The only place the module talks to the api (Max) and voice (Eric Wu) services.
// Unset FASTAPI_BASE_URL / VOICE_BASE_URL => fake responses (lib/fakes.ts), so the
// stubs-to-real flip at H13 is republishing with the URL set.
// Must be called from a procedure, outside ctx.withTx (the host forbids HTTP inside a tx).
import { TimeDuration } from "spacetimedb";
import { API_TIMEOUT_MS } from "./constants";
import { fakeApi } from "./fakes";
import type { Proc } from "./types";

export type ApiResult<T> =
  | { ok: true; data: T; stub: boolean }
  | { ok: false; error: { path: string; status?: number; message: string } };

function post<T>(ctx: Proc, base: string, path: string, body: unknown, idempotent: boolean): ApiResult<T> {
  const attempts = idempotent ? 2 : 1;
  let last: ApiResult<T> = { ok: false, error: { path, message: "not attempted" } };
  for (let i = 0; i < attempts; i++) {
    try {
      const res = ctx.http.fetch(`${base.replace(/\/$/, "")}${path}`, {
        method: path === "/health" ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Huddle-Secret": ctx.env.HUDDLE_SHARED_SECRET ?? "",
        },
        body: path === "/health" ? undefined : JSON.stringify(body),
        timeout: TimeDuration.fromMillis(API_TIMEOUT_MS),
      });
      if (res.status >= 200 && res.status < 300)
        return { ok: true, data: res.json() as T, stub: res.headers.get("x-huddle-stub") === "true" };
      last = { ok: false, error: { path, status: res.status, message: res.text().slice(0, 500) } };
      if (res.status < 500) break; // 4xx will not get better on retry
    } catch (e) {
      last = { ok: false, error: { path, message: e instanceof Error ? e.message : String(e) } };
    }
  }
  return last;
}

// Future live council calls may have delivery side effects, so do not retry them.
const NOT_IDEMPOTENT = new Set(["/council"]);

export function callApi<T = any>(ctx: Proc, path: string, body: unknown): ApiResult<T> {
  const base = ctx.env.FASTAPI_BASE_URL;
  if (!base) return { ok: true, data: fakeApi(path, body) as T, stub: true };
  return post<T>(ctx, base, path, body, !NOT_IDEMPOTENT.has(path));
}

// stub: true when VOICE_BASE_URL is unset; the caller then plays fakeCallEvents.
export function callVoice<T = any>(ctx: Proc, path: string, body: unknown): ApiResult<T> {
  const base = ctx.env.VOICE_BASE_URL;
  if (!base) return { ok: true, data: { accepted: true } as T, stub: true };
  return post<T>(ctx, base, path, body, false);
}
