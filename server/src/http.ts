// HTTP routes for the api and voice services (S5.4, S5.5). Served at
// {SPACETIMEDB_URI}/v1/database/{SPACETIMEDB_DB}/route/<path> (paths: /health, /call-event, /council-message). SpacetimeDB does not
// authenticate these routes, so each handler checks X-Huddle-Secret itself.
import { SyncResponse, Router, type Request } from "spacetimedb/server";
import spacetimedb from "./schema";
import { recordCallEvent } from "./booking";
import { insertCouncilMessage } from "./council";
import { placesForMode } from "./lib/places";

const json = (body: unknown, status = 200) =>
  new SyncResponse(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function authorized(req: Request, secret: string | undefined) {
  return !!secret && req.headers.get("x-huddle-secret") === secret;
}

export const health = spacetimedb.httpHandler((ctx, _req) =>
  json({ ok: true, stub: ctx.env.STUB_MODE !== "false" || !ctx.env.FASTAPI_BASE_URL,
         placesLoaded: placesForMode(ctx.env.STUB_MODE).length }),
);

export const callEvent = spacetimedb.httpHandler((ctx, req) => {
  if (!authorized(req, ctx.env.HUDDLE_SHARED_SECRET)) return json({ error: "unauthorized" }, 401);
  try {
    const e = req.json();
    ctx.withTx((tx) => recordCallEvent(tx, e));
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

export const councilMessage = spacetimedb.httpHandler((ctx, req) => {
  if (!authorized(req, ctx.env.HUDDLE_SHARED_SECRET)) return json({ error: "unauthorized" }, 401);
  try {
    const m = req.json();
    ctx.withTx((tx) => insertCouncilMessage(tx, m));
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

export const router = spacetimedb.httpRouter(
  new Router().get("/health", health).post("/call-event", callEvent).post("/council-message", councilMessage),
);
