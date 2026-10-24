import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useProcedure, useSpacetimeDB } from "spacetimedb/react";
import { procedures } from "../module_bindings";
import { saveSession } from "../session";
import { useRun } from "../useRun";
import { Buddy } from "../doodle/Doodle";

export default function Home() {
  const { isActive } = useSpacetimeDB();
  const navigate = useNavigate();
  const createGroup = useProcedure(procedures.createAgentGroup);
  const joinGroup = useProcedure(procedures.joinGroup);
  const { run, busy, error } = useRun();
  // The landing page's form sends ?name= here.
  const [params] = useSearchParams();
  const [name, setName] = useState(params.get("name") ?? "");
  const [code, setCode] = useState("");

  async function start() {
    await run(async () => {
      const { code } = await createGroup({ name: undefined });
      // The creator is the host but still joins to take part (CONTRACT.md S5.5).
      const joined = await joinGroup({ code, name });
      saveSession({ ...joined, code, name });
      navigate(`/g/${joined.groupId}/lobby`);
    });
  }

  return (
    <main className="page space-y-6">
      <a className="logo" href="/">
        huddle
      </a>

      <div className="pt-4">
        <h1 className="shout text-[64px]">Get the group in</h1>
        <p className="on-sky mt-3">Start a huddle, drop the code in the group chat. First names only.</p>
      </div>

      <div className="crowd justify-center" aria-hidden="true">
        {["Advocate A", "Advocate B", "Advocate C", "Advocate D"].map((who, i) => (
          <Buddy key={who} who={who} pose={i % 2 ? "wave" : "huddle"} size={92} boil={i === 1} />
        ))}
      </div>

      <section className="card space-y-3">
        <h2 className="card-title">Start a huddle</h2>
        <input
          className="input"
          placeholder="Your first name"
          autoComplete="given-name"
          maxLength={24}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {!isActive ? <p role="status" className="muted">Connecting to Huddle…</p> : null}
        <button className="btn btn-primary w-full" disabled={busy || !isActive || !name.trim()} onClick={start}>
          Start a huddle ↗
        </button>
        {error && <p className="error">{error}</p>}
      </section>

      <section className="card card-note card-tilt-r space-y-3">
        <h2 className="card-title">Got a code?</h2>
        <input
          className="input display text-center text-3xl tracking-[0.3em] uppercase"
          placeholder="ABCD"
          aria-label="Huddle code"
          maxLength={4}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <button className="btn w-full" disabled={code.length !== 4} onClick={() => navigate(`/join/${code}`)}>
          Join
        </button>
      </section>
    </main>
  );
}
