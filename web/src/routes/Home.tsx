import { useState } from "react";
import { useNavigate } from "react-router";
import { useProcedure } from "spacetimedb/react";
import { procedures } from "../module_bindings";
import { saveSession } from "../session";
import { useRun } from "../useRun";

export default function Home() {
  const navigate = useNavigate();
  const createGroup = useProcedure(procedures.createGroup);
  const joinGroup = useProcedure(procedures.joinGroup);
  const { run, busy, error } = useRun();
  const [name, setName] = useState("");
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
      <h1 className="text-2xl font-bold">Huddle</h1>

      <section className="card space-y-2">
        <h2 className="font-semibold">Start a huddle</h2>
        <input
          className="input"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn btn-primary w-full" disabled={busy || !name.trim()} onClick={start}>
          Start a huddle
        </button>
        {error && <p className="error">{error}</p>}
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">Join with code</h2>
        <input
          className="input uppercase"
          placeholder="ABCD"
          maxLength={4}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <button
          className="btn w-full"
          disabled={code.length !== 4}
          onClick={() => navigate(`/join/${code}`)}
        >
          Join
        </button>
      </section>
    </main>
  );
}
