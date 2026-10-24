import { useCouncilMessages } from "../../data";
import type { CouncilOutcome, Plan } from "../../types";
import { KIND_LABEL } from "../../plans";

type Props = { runId: string; plans: Plan[]; council: CouncilOutcome | null };

const ROUNDS = [
  { round: 1, title: "Round 1" },
  { round: 2, title: "Round 2" },
  { round: 3, title: "Chair" },
] as const;

// B4: council messages stream in live from the my_council_messages view.
export default function CouncilPanel({ runId, plans, council }: Props) {
  const messages = useCouncilMessages(runId);
  const planName = (id: string) => {
    const plan = plans.find((p) => p.id === id);
    return plan ? KIND_LABEL[plan.kind] : id;
  };

  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">Council</h2>
      {messages === undefined && <p className="muted">Loading…</p>}
      {messages?.length === 0 && <p className="muted">Waiting for the advocates…</p>}
      {ROUNDS.map(({ round, title }) => {
        const inRound = messages?.filter((m) => m.round === round) ?? [];
        if (inRound.length === 0) return null;
        return (
          <div key={round} className="space-y-2">
            <h3 className="text-sm font-semibold">{title}</h3>
            {inRound.map((m) => (
              <div key={m.id} className="rounded-lg bg-gray-100 p-2 text-sm">
                <p className="font-semibold">
                  {m.label}
                  {m.memberId && <span className="muted"> ({m.memberId})</span>}
                </p>
                <p>{m.text}</p>
                {m.stance && (
                  <p className="muted">
                    {Object.entries(m.stance)
                      .map(([id, s]) => `${planName(id)}: ${s}`)
                      .join(" · ")}
                  </p>
                )}
                {m.speaker === "chair" && m.planId && (
                  <p className="font-semibold">Recommended: {planName(m.planId)}</p>
                )}
              </div>
            ))}
          </div>
        );
      })}
      {council?.fallbackUsed && <p className="text-sm">Safe plan used (the council check failed).</p>}
    </section>
  );
}
