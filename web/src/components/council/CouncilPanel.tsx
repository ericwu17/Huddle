import { useCouncilMessages, useGroupState } from "../../data";
import type { CouncilMessage, CouncilOutcome, Plan, Stance } from "../../types";
import { KIND_LABEL } from "../../plans";
import { Buddy } from "../../doodle/Doodle";
import AgentCircle, { type CircleAgent } from "../AgentCircle";

type Props = { runId: string; plans: Plan[]; council: CouncilOutcome | null };

const ROUNDS = [
  { round: 1, title: "Round 1" },
  { round: 2, title: "Round 2" },
  { round: 3, title: "The chair" },
] as const;

// All of the panel's styling in one place. The look lives in index.css (.council-*).
const STYLE = {
  section: "council space-y-4",
  roundTitle: "council-round",
  row: "council-row pop-in",
  agent: "bubble council-bubble",
  chair: "bubble bubble-chair council-bubble",
  speaker: "council-speaker",
  text: "council-text",
  chips: "mt-2 flex flex-wrap gap-1",
  chip: "sticker",
  stance: {
    support: "sticker-lime",
    accept: "",
    oppose: "sticker-red",
  } satisfies Record<Stance, string>,
  cited: "council-cited",
  verdict: "sticker sticker-sun council-verdict",
  fallback: "error",
  waiting: "card council-waiting",
};

const STANCE_LABEL: Record<Stance, string> = { support: "for", accept: "ok", oppose: "against" };

const agentLabel = (label: string) => label.replace(/^Advocate\b/i, "Agent");

// Agent A stands on the left, B on the right, and so on down the page.
const sideFor = (label: string) => {
  const letter = /([A-Z])$/.exec(label)?.[1] ?? "A";
  return (letter.charCodeAt(0) - 65) % 2 === 0 ? "is-left" : "is-right";
};

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
  // Whoever spoke last keeps waving their arms until the next one speaks.
  const latestId = !done && messages?.length ? messages[messages.length - 1].id : null;
  const agentLabels = [...new Set([
    ...Array.from({ length: group?.members.length || 3 }, (_, i) => `Agent ${String.fromCharCode(65 + i)}`),
    ...(messages?.filter(m => m.speaker !== "chair").map(m => agentLabel(m.label)) ?? []),
  ])].slice(0, 5);
  const circleAgents: CircleAgent[] = [
    { id: "chair", label: "Coordinator", who: "Chair", coordinator: true },
    ...agentLabels.map(label => ({ id: label, label, who: label })),
  ];
  const latest = messages?.find(m => m.id === latestId);

  return (
    <section className={STYLE.section}>
      <header>
        <h2 className="shout text-[52px]">The council</h2>
        <p className="on-sky mt-2">Each friend's agent joins the huddle. The coordinator brings the plan together.</p>
      </header>
      <div className="card council-huddle">
        <AgentCircle agents={circleAgents} activeId={latest ? latest.speaker === "chair" ? "chair" : agentLabel(latest.label) : undefined} />
      </div>
      {messages === undefined && <p className="on-sky">Loading the council…</p>}
      {messages?.length === 0 && !done && (
        <Waiting who={["Agent A", "Agent B", "Agent C"]} pose="idle" text="Waiting for the agents" />
      )}
      {messages?.length === 0 && done && !council.fallbackUsed && (
        <p className="on-sky">The council did not post any messages for this plan.</p>
      )}
      {ROUNDS.map(({ round, title }) => {
        const inRound = messages?.filter((m) => m.round === round) ?? [];
        if (inRound.length === 0) return null;
        return (
          <div key={round} className="space-y-3">
            <h3 className={STYLE.roundTitle}>{title}</h3>
            {inRound.map((m) =>
              m.speaker === "chair" ? (
                <ChairBubble key={m.id} m={m} planName={planName} council={council} />
              ) : (
                <AgentBubble
                  key={m.id}
                  m={m}
                  live={m.id === latestId}
                  name={showWho ? memberName(m.memberId) : undefined}
                  planName={planName}
                />
              ),
            )}
          </div>
        );
      })}
      {messages && messages.length > 0 && !hasChair && !done && (
        <Waiting who={["Agent B", "Agent A"]} pose="argue" text="The agents are talking" />
      )}
      {/* The chair bubble carries this when there is one; otherwise show it on its own. */}
      {council?.fallbackUsed && !hasChair && <p className={STYLE.fallback}>Safe plan used (the council check failed)</p>}
    </section>
  );
}

function Waiting({ who, pose, text }: { who: string[]; pose: "idle" | "argue"; text: string }) {
  return (
    <div className={STYLE.waiting}>
      <span className="flex">
        {who.map((w, i) => (
          <Buddy key={w} who={w} pose={pose} size={64} boil={i === 0} />
        ))}
      </span>
      <p className="hand text-xl leading-tight">
        {text} <span className="dots"><i /><i /><i /></span>
      </p>
    </div>
  );
}

function AgentBubble({
  m,
  live,
  name,
  planName,
}: {
  m: CouncilMessage;
  live: boolean;
  name: string | undefined;
  planName: (id: string) => string;
}) {
  return (
    <div className={`${STYLE.row} ${sideFor(m.label)}`}>
      <Buddy who={m.label} pose={live ? "argue" : "idle"} size={88} boil={live} />
      <div className={STYLE.agent}>
        <p className={STYLE.speaker}>
          {agentLabel(m.label)}
          {name && <span className="council-for"> for {name}</span>}
        </p>
        <p className={STYLE.text}>{m.text}</p>
        {m.stance && (
          <div className={STYLE.chips}>
            {Object.entries(m.stance).map(([id, s]) => (
              <span key={id} className={`${STYLE.chip} ${STYLE.stance[s]}`}>
                {planName(id)}: {STANCE_LABEL[s]}
              </span>
            ))}
          </div>
        )}
        <Cited m={m} />
      </div>
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
    <div className={`${STYLE.row} is-chair`}>
      <Buddy who="Chair" pose={council ? "huddle" : "wave"} size={92} crown boil />
      <div className={STYLE.chair}>
        <p className={STYLE.speaker}>{m.label}</p>
        <p className={STYLE.text}>{text}</p>
        <Cited m={m} />
        <p className={STYLE.verdict}>
          {council?.fallbackUsed
            ? "Safe plan used (the council check failed)"
            : `★ Recommended: ${planName(council?.chosenPlanId ?? m.planId)}`}
        </p>
      </div>
    </div>
  );
}

function Cited({ m }: { m: CouncilMessage }) {
  if (m.cited.length === 0) return null;
  return <p className={STYLE.cited}>{m.cited.map((c) => `${c.field} ${formatNumber(c.value)}`).join(" · ")}</p>;
}

function formatNumber(x: number | null | undefined) {
  if (typeof x !== "number") return "?";
  return Number.isInteger(x) ? String(x) : x.toFixed(2);
}
