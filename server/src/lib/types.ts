// Context types shared by every file in the module.
import type { InferSchema, ProcedureCtx, ReducerCtx, ViewCtx } from "spacetimedb/server";
import type spacetimedb from "../schema";

export type S = InferSchema<typeof spacetimedb>;
export type Tx = ReducerCtx<S>; // also what ctx.withTx hands a procedure or HTTP handler
export type Proc = ProcedureCtx<S>;
export type View = ViewCtx<S>;
export type ReadDb = View["db"];
