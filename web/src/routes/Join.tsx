import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useProcedure, useSpacetimeDB } from "spacetimedb/react";
import { procedures } from "../module_bindings";
import { saveSession } from "../session";
import { useRun } from "../useRun";
import { Buddy } from "../doodle/Doodle";
import { useAccount } from "../accountData";

export default function Join() {
  const { isActive } = useSpacetimeDB();
  const code = useParams().code!.toUpperCase();
  const navigate = useNavigate();
  const joinGroup = useProcedure(procedures.joinGroup);
  const { run, busy, error } = useRun();
  const [name, setName] = useState("");
  const account = useAccount();
  const currentName = account?.displayName ?? name;

  async function join() {
    await run(async () => {
      const joined = await joinGroup({ code, name: currentName });
      saveSession({ ...joined, code, name: currentName });
      navigate(`/g/${joined.groupId}/lobby`);
    });
  }

  return (
    <main className="page space-y-6">
      <a className="logo" href="/">
        huddle
      </a>
      <div className="flex items-end gap-4 pt-4">
        <h1 className="shout text-[56px]">
          You're invited to <span className="code-tag inline-block align-middle text-[34px]">{code}</span>
        </h1>
      </div>

      <div className="flex items-end gap-3">
        <Buddy who={name.trim() || code} pose="wave" size={110} boil crown />
        <p className="bubble hand mb-16 text-2xl">{name.trim() ? `Hi ${name.trim()}!` : "What's your name?"}</p>
      </div>

      <section className="card space-y-3">
        <input
          className="input"
          placeholder="Your first name"
          autoComplete="given-name"
          maxLength={24}
          value={currentName}
          readOnly={!!account}
          onChange={(e) => setName(e.target.value)}
        />
        {!isActive ? <p role="status" className="muted">Connecting to Huddle…</p> : null}
        <button className="btn btn-primary w-full" disabled={busy || !isActive || account === undefined || !currentName.trim()} onClick={join}>
          Join the huddle ↗
        </button>
        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );
}
