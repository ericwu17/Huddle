import { useCouncilMessages, useGroupState } from "../../data";
import type { CouncilMessage, CouncilOutcome, Plan, Stance } from "../../types";
import { KIND_LABEL } from "../../plans";

type Props = { runId: string; plans: Plan[]; council: CouncilOutcome | null };

const ROUNDS = [
  { round: 1, title: "Round 1" },
  { round: 2, title: "Round 2" },
  { round: 3, title: "Chair" },
] as const;

// All of the panel's styling in one place, so the design-token pass only touches this.
const STYLE = {
  section: "card space-y-4",
  roundTitle: "text-xs font-semibold uppercase tracking-wide text-gray-500",
  advocate: "max-w-[85%] rounded-2xl rounded-tl-sm bg-gray-100 px-3 py-2 text-sm",
  chair: "rounded-2xl rounded-tr-sm bg-gray-900 px-3 py-2 text-sm text-white",
  speaker: "text-xs font-semibold",
  chips: "mt-1.5 flex flex-wrap gap-1",
  chip: "rounded-full px-2 py-0.5 text-xs",
  stance: {
    support: "bg-green-100 text-green-800",
    accept: "bg-white text-gray-700 ring-1 ring-gray-300",
    oppose: "bg-red-100 text-red-800",
  } satisfies Record<Stance, string>,
  cited: "mt-1 text-xs text-gray-500",
  citedChair: "mt-1 text-xs text-gray-300",
  verdict: "mt-2 border-t border-white/20 pt-2 font-semibold",
  fallback: "rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900",
  typing: "muted animate-pulse",
};

const STANCE_LABEL: Record<Stance, string> = { support: "for", accept: "ok", oppose: "against" };

// B4: council messages stream in live from the my_council_messages view.
export default function CouncilPanel({ runId, plans, council }: Props) {
  const messages = useCouncilMessages(runId);
  const group = useGroupState();
  const showWho = group?.showWhoCompromised ?? false;
  const memberName = (id?: string) => group?.members.find((m) => m.id === id)?.name;
  const planName = (id: string | null) => {
    const plan = plans.find((p) => p.id === id);
    return plan ? KIND_LABEL[plan.kind] : (id ?? "?");
  };

  const done = council !== null;
  const hasChair = messages?.some((m) => m.speaker === "chair") ?? false;

  return (
    <section className={STYLE.section}>
      <h2 className="font-semibold">Council</h2>
      {messages === undefined && <p className="muted">Loading the council…</p>}
      {messages?.length === 0 && !done && <p className={STYLE.typing}>Waiting for the advocates…</p>}
      {messages?.length === 0 && done && !council.fallbackUsed && (
        <p className="muted">The council did not post any messages for this plan.</p>
      )}
      {ROUNDS.map(({ round, title }) => {
        const inRound = messages?.filter((m) => m.round === round) ?? [];
        if (inRound.length === 0) return null;
        return (
          <div key={round} className="space-y-2">
            <h3 className={STYLE.roundTitle}>{title}</h3>
            {inRound.map((m) =>
              m.speaker === "chair" ? (
                <ChairBubble key={m.id} m={m} planName={planName} council={council} />
              ) : (
                <AdvocateBubble
                  key={m.id}
                  m={m}
                  name={showWho ? memberName(m.memberId) : undefined}
                  planName={planName}
                />
              ),
            )}
          </div>
        );
      })}
      {messages && messages.length > 0 && !hasChair && !done && (
        <p className={STYLE.typing}>The council is talking…</p>
      )}
      {/* The chair bubble carries this when there is one; otherwise show it on its own. */}
      {council?.fallbackUsed && !hasChair && <p className={STYLE.fallback}>Safe plan used (the council check failed)</p>}
    </section>
  );
}

function AdvocateBubble({
  m,
  name,
  planName,
}: {
  m: CouncilMessage;
  name: string | undefined;
  planName: (id: string) => string;
}) {
  return (
    <div className={STYLE.advocate}>
      <p className={STYLE.speaker}>
        {m.label}
        {name && <span className="font-normal text-gray-500"> · {name}</span>}
      </p>
      <p>{m.text}</p>
      {m.stance && (
        <div className={STYLE.chips}>
          {Object.entries(m.stance).map(([id, s]) => (
            <span key={id} className={`${STYLE.chip} ${STYLE.stance[s]}`}>
              {planName(id)}: {STANCE_LABEL[s]}
            </span>
          ))}
        </div>
      )}
      <Cited m={m} className={STYLE.cited} />
    </div>
  );
}

function ChairBubble({
  m,
  planName,
  council,
}: {
  m: CouncilMessage;
  planName: (id: string | null) => string;
  council: CouncilOutcome | null;
}) {
  // The verdict line is ours, so drop a trailing "Recommended: …" the model may have written.
  const text = m.text.replace(/\s*Recommended:[^.]*\.?\s*$/, "");
  return (
    <div className={STYLE.chair}>
      <p className={STYLE.speaker}>{m.label}</p>
      <p>{text}</p>
      <Cited m={m} className={STYLE.citedChair} />
      <p className={STYLE.verdict}>
        {council?.fallbackUsed
          ? "Safe plan used (the council check failed)"
          : `Recommended: ${planName(council?.chosenPlanId ?? m.planId)}`}
      </p>
    </div>
  );
}

function Cited({ m, className }: { m: CouncilMessage; className: string }) {
  if (m.cited.length === 0) return null;
  return (
    <p className={className}>
      {m.cited.map((c) => `${c.field} ${formatNumber(c.value)}`).join(" · ")}
    </p>
  );
}

function formatNumber(x: number | null | undefined) {
  if (typeof x !== "number") return "?";
  return Number.isInteger(x) ? String(x) : x.toFixed(2);
}
