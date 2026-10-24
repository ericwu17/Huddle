import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useProcedure, useReducer } from "spacetimedb/react";
import { procedures, reducers } from "../module_bindings";
import { useGroup } from "../groupContext";
import { useRun } from "../useRun";
import { useAgentMessages, useAgentRun, type AgentPlan } from "../agentData";
import { useVotes } from "../data";
import PlanMap from "./PlanMap";

export function AgentPrefs() {
  const { group, agent, agentNeeds, isHost } = useGroup();
  const submit = useReducer(reducers.submitAgentPrefs);
  const confirm = useReducer(reducers.confirmAgentNeeds);
  const find = useReducer(reducers.findAgentPlans);
  const { run, busy, error } = useRun();
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? agentNeeds?.text ?? "";
  const needs = agentNeeds?.result;
  const allReady = agent?.confirmedMemberIds.length === group.members.length && group.members.length >= 2;
  const blocked = !!needs?.questions.length || !!needs?.hard.allergies.length;
  const interpreting = !!agentNeeds && !needs && !agentNeeds.error;
  return <div className="space-y-5">
    <h1 className="shout text-[48px]">What do you want?</h1>
    <section className="card card-note space-y-3">
      <p>Your prompt and summary are private. The coordinator considers everyone's needs without publishing their prompts or caps.</p>
      <label className="block font-bold" htmlFor="agent-prompt">Your private request</label>
      <textarea id="agent-prompt" className="input min-h-32" maxLength={4000} value={text}
        placeholder="Vegetarian, under $25 for the whole outing, a meal and something fun afterward"
        onChange={e => setDraft(e.target.value)} />
      <button className="btn btn-primary w-full" disabled={busy || !text.trim() || interpreting}
        onClick={() => run(() => submit({ text }))}>{interpreting ? "Claude is reading your needs…" : "Review my needs privately"}</button>
      {agentNeeds?.error ? <p className="error" role="alert">{agentNeeds.error}</p> : null}
    </section>
    {needs ? <section className="card space-y-3" aria-label="Your private needs summary">
      <h2 className="card-title">Check your needs</h2>
      <dl className="space-y-2">
        <div><dt className="font-bold">Whole-outing budget, per person</dt><dd>{needs.hard.budgetMaxPerPerson == null ? "No cap stated" : `$${needs.hard.budgetMaxPerPerson} across all stops`}</dd></div>
        <div><dt className="font-bold">Dietary requirements</dt><dd>{needs.hard.dietary.join(", ") || "None stated"}</dd></div>
        <div><dt className="font-bold">Allergies</dt><dd>{needs.hard.allergies.join(", ") || "None stated"}</dd></div>
        <div><dt className="font-bold">Must reject</dt><dd>{[...needs.hard.vetoCuisines, ...needs.hard.vetoCategories, ...needs.hard.rejectedTerms].join(", ") || "None stated"}</dd></div>
        <div><dt className="font-bold">Travel limit</dt><dd>{needs.hard.maxTravelMinutes == null ? "None stated" : `${needs.hard.maxTravelMinutes} minutes from your starting location`}</dd></div>
      </dl>
      <h3 className="font-bold">Preferences</h3>
      <ul>{needs.preferences.map(p => <li key={p}>{p}</li>)}</ul>
      {needs.questions.length ? <div className="card-note p-3"><h3 className="font-bold">Please clarify privately</h3><ul>{needs.questions.map(q => <li key={q}>{q}</li>)}</ul></div> : null}
      {needs.warnings.map(w => <p className="muted" key={w}>{w}</p>)}
      <p className="muted">To correct the summary or answer a question, edit your prompt above and request another review.</p>
      <button className="btn btn-primary" disabled={busy || blocked || agentNeeds?.confirmed || text !== agentNeeds?.text}
        onClick={() => run(() => confirm({ revision: agentNeeds!.revision }))}>{agentNeeds?.confirmed ? "Your needs are confirmed ✓" : "Confirm my needs"}</button>
    </section> : null}
    <section className="card space-y-3">
      <h2 className="card-title">Group readiness</h2>
      <ul>{group.members.map(m => <li key={m.id}>{m.name}: {agent?.confirmedMemberIds.includes(m.id) ? "needs confirmed ✓" : "reviewing private needs"}</li>)}</ul>
      {isHost ? <button className="btn btn-primary w-full" disabled={busy || !allReady || agent?.status === "planning" || group.status === "lobby"}
        onClick={() => run(() => find())}>Find plans</button> : <p className="muted">The host can find plans when everyone confirms.</p>}
      {!allReady ? <p className="muted">Waiting for everyone to confirm their current needs.</p> : null}
    </section>
    {error ? <p className="error" role="alert">{error}</p> : null}
  </div>;
}

export function AgentPlanCard({ plan, recommended = false }: { plan: AgentPlan; recommended?: boolean }) {
  return <section className="card space-y-3">
    {recommended ? <span className="sticker sticker-sun">Coordinator's recommendation</span> : null}
    <div className="flex justify-between gap-3"><h2 className="card-title">{plan.title}</h2><span className="sticker sticker-lime">Est. ${plan.costPerPerson}/person total</span></div>
    <ol className="space-y-2">{plan.stops.map(stop => <li key={stop.placeId}>
      <strong>{stop.name}</strong><p className="muted">{stop.start}–{stop.end} · {stop.category} · est. ${stop.costPerPerson}/person</p>
    </li>)}</ol>
    <p>{plan.whyLine}</p>
    <details><summary>Data limitations</summary><ul className="muted">{plan.limitations.map(l => <li key={l}>{l}</li>)}</ul></details>
  </section>;
}

export function AgentPlans() {
  const { group, agent, session, isHost } = useGroup();
  const planRun = useAgentRun(group.latestRunId);
  const messages = useAgentMessages(group.latestRunId);
  const find = useReducer(reducers.findAgentPlans);
  const post = useReducer(reducers.postAgentDiscussion);
  const { run, busy, error } = useRun();
  const [message, setMessage] = useState("");
  if (agent?.status === "planning") return <section className="card space-y-3" role="status"><h1 className="card-title">Your coordinator is planning</h1><p>Considering confirmed prompts and checking catalog itineraries. No booking is being made.</p></section>;
  const result = planRun?.result;
  const active = agent?.status === "ready" && result?.inputRevision === agent.revision;
  const first = active ? result?.plans[0] : null;
  const lines = first?.stops.slice(1).map((s, i) => [[first.stops[i].lng, first.stops[i].lat], [s.lng, s.lat]] as [number, number][]) ?? [];
  return <div className="space-y-5">
    <h1 className="shout text-[48px]">Your group’s plans</h1>
    {agent?.error ? <p className="card error" role="alert">{agent.error}</p> : null}
    {!active && !result?.conflicts.length ? <p className="card">Review everyone's current needs before generating plans.</p> : null}
    {result?.conflicts.map(c => <p className="card card-note" key={c}>{c}</p>)}
    {first ? <PlanMap plan={first} lines={lines} /> : null}
    {active ? result?.plans.map(plan => <AgentPlanCard key={plan.id} plan={plan} recommended={plan.id === result.recommendedPlanId} />) : null}
    <section className="card space-y-3">
      <h2 className="card-title">Coordinator and group conversation</h2>
      <p className="muted">This conversation is shared. Update hard requirements privately on the Needs screen.</p>
      <ol className="space-y-3">{messages.map(m => <li key={String(m.id)}><strong>{m.label}</strong><p>{m.text}</p></li>)}</ol>
      {active ? <form className="space-y-2" onSubmit={e => { e.preventDefault(); void run(async () => { await post({ text: message }); setMessage(""); }); }}>
        <label htmlFor="group-discussion">Message everyone</label>
        <textarea id="group-discussion" className="input" maxLength={2000} value={message} onChange={e => setMessage(e.target.value)} />
        <button className="btn" disabled={busy || !message.trim()}>Send to group</button>
      </form> : null}
      {active ? <p className="muted">The coordinator considers this discussion next time the host chooses Find plans again.</p> : null}
    </section>
    <div className="flex flex-wrap gap-3">
      <Link className="btn" to={`/g/${session.groupId}/prefs`}>Edit my private needs</Link>
      {active ? <Link className="btn btn-primary" to={`/g/${session.groupId}/vote`}>Go to vote</Link> : null}
      {isHost && agent?.status !== "needs" ? <button className="btn" disabled={busy} onClick={() => run(() => find())}>Find plans again</button> : null}
    </div>
    {error ? <p className="error" role="alert">{error}</p> : null}
  </div>;
}

export function AgentVote() {
  const { group, session, agent, isHost } = useGroup();
  const navigate = useNavigate();
  const runId = group.latestRunId;
  const planRun = useAgentRun(runId);
  const votes = useVotes(runId, session.memberId);
  const vote = useReducer(reducers.vote);
  const spin = useProcedure(procedures.doRoulette);
  const book = useReducer(reducers.startBooking);
  const { run, busy, error } = useRun();
  const result = planRun?.result;
  if (!runId || agent?.status !== "ready" || result?.inputRevision !== agent.revision) return <section className="card"><p>These choices are not current. Review your needs and plans first.</p><Link to={`/g/${session.groupId}/prefs`}>Review needs</Link></section>;
  const plans = result.plans;
  const counts = votes?.counts ?? {};
  const complete = votes?.total === group.members.length;
  const top = Math.max(0, ...Object.values(counts));
  const leaders = plans.filter(p => top > 0 && counts[p.id] === top);
  const winner = complete ? leaders.length === 1 ? leaders[0] : leaders.find(p => p.id === planRun?.roulette?.planId) : null;
  return <div className="space-y-5">
    <h1 className="shout text-[48px]">Choose together</h1>
    <Link className="btn" to={`/g/${session.groupId}/plans`}>Read plans and conversation</Link>
    {plans.map(p => <div key={p.id} className="space-y-2"><AgentPlanCard plan={p} recommended={p.id === result.recommendedPlanId} />
      <button className="btn w-full" disabled={busy} onClick={() => run(() => vote({ runId, planId: p.id }))}>
        {votes?.myVote === p.id ? "Your vote ✓" : `Vote ${p.title}`} · {counts[p.id] ?? 0}
      </button></div>)}
    <p className="on-sky">{votes?.total ?? 0} of {group.members.length} voted</p>
    <p className="card card-note">Booking is a simulation. No restaurant will be called or reserved.</p>
    <div className="flex flex-wrap gap-3">
      <button className="btn" disabled={busy || !complete || leaders.length < 2 || !!winner}
        onClick={() => run(() => spin({ runId }))}>Resolve tie: equal-chance Spin</button>
      {isHost ? <button className="btn btn-primary" disabled={busy || !winner} onClick={() => run(async () => {
        if (!winner) return;
        await book({ runId, planId: winner.id, stopIndex: winner.stops.findIndex(s => s.category === "meal") });
        navigate(`/g/${session.groupId}/call`);
      })}>{winner ? `Simulate booking ${winner.title}` : "Waiting for a complete group choice"}</button> : <p className="on-sky">The host starts the simulation after everyone votes.</p>}
    </div>
    {error ? <p className="error" role="alert">{error}</p> : null}
  </div>;
}
