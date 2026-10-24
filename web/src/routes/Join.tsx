import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useProcedure } from "spacetimedb/react";
import { procedures } from "../module_bindings";
import { saveSession } from "../session";
import { useRun } from "../useRun";

export default function Join() {
  const code = useParams().code!.toUpperCase();
  const navigate = useNavigate();
  const joinGroup = useProcedure(procedures.joinGroup);
  const { run, busy, error } = useRun();
  const [name, setName] = useState("");

  async function join() {
    await run(async () => {
      const joined = await joinGroup({ code, name });
      saveSession({ ...joined, code, name });
      navigate(`/g/${joined.groupId}/lobby`);
    });
  }

  return (
    <main className="page space-y-4">
      <h1 className="text-2xl font-bold">Join huddle {code}</h1>
      <input
        className="input"
        placeholder="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button className="btn btn-primary w-full" disabled={busy || !name.trim()} onClick={join}>
        Join
      </button>
      {error && <p className="error">{error}</p>}
    </main>
  );
}
