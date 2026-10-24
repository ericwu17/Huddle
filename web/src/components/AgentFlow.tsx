import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useProcedure, useReducer } from "spacetimedb/react";
import { procedures, reducers } from "../module_bindings";
import { useGroup } from "../groupContext";
import { useRun } from "../useRun";
import { useAgentMessages, useAgentPreferences, useAgentRun, type AgentPlan, type AgentStructuredPreferences } from "../agentData";
import { EMPTY_CONTEXT, useAccount, useAccountContext, type AccountContext } from "../accountData";
import { PreferenceFields } from "./PreferenceFields";
import { useCatalogListings } from "../catalogData";
import { useVotes } from "../data";
import PlanMap from "./PlanMap";
import MeetupCalendarAction from "./MeetupCalendarAction";
import { VoteChoice, VoteStatus } from "./VoteTally";

export function AgentPrefs() {
  const { agentNeeds, group, session } = useGroup();
  const account = useAccount();
  const profile = useAccountContext();
  const structured = useAgentPreferences();
  if (account === undefined || agentNeeds === undefined || profile === undefined || structured === undefined || (structured && structured.memberId !== session.memberId)) return <p className="card" role="status">Loading your private needs…</p>;
  return <AgentPrefsForm key={`${account?.accountId ?? "guest"}:${group.id}:${session.memberId}`} initialProfile={profile?.context ?? EMPTY_CONTEXT} initialStructured={structured?.structured} />;
}

function AgentPrefsForm({ initialProfile, initialStructured }: { initialProfile: AccountContext; initialStructured?: AgentStructuredPreferences }) {
  const { group, agent, agentNeeds, isHost, session } = useGroup();
  const account = useAccount();
  const submit = useReducer(reducers.saveAgentPreferences);
  const saveContext = useReducer(reducers.saveAccountContext);
  const find = useReducer(reducers.findAgentPlans);
  const { run, busy, error } = useRun();
  const [draft, setDraft] = useState<AccountContext>(() => {
    const hard = agentNeeds?.result?.hard;
    return { ...initialProfile, ...(initialStructured ? {
      budgetMaxPerPerson: initialStructured.budgetMaxPerPerson,
      maxOutingMinutes: initialStructured.maxOutingMinutes,
      dietary: initialStructured.dietary,
      allergies: initialStructured.allergies,
    } : {}), ...(hard ? {
      budgetMaxPerPerson: hard.budgetMaxPerPerson, maxOutingMinutes: hard.maxOutingMinutes ?? null,
      dietary: hard.dietary, allergies: hard.allergies,
    } : {}), preferences: agentNeeds?.text ?? initialProfile.preferences };
  });
  const [remember, setRemember] = useState(false);
  const untouched = useRef(true);
  const [notice, setNotice] = useState("");
  const lastSubmitted = useRef<string | null>(null);
  const lastApplied = useRef(agentNeeds?.revision ?? -1);
  const needs = agentNeeds?.result;
  const interpreting = !!agentNeeds && !needs && !agentNeeds.error;
  const allReady = agent?.confirmedMemberIds.length === group.members.length && group.members.length >= 2;
  useEffect(() => {
    if (untouched.current && !agentNeeds && !initialStructured) {
      setDraft(current => JSON.stringify(current) === JSON.stringify(initialProfile) ? current : initialProfile);
    }
  }, [initialProfile, initialStructured, agentNeeds]);
  useEffect(() => {
    if (!needs || !agentNeeds || lastApplied.current === agentNeeds.revision) return;
    lastApplied.current = agentNeeds.revision;
    if (lastSubmitted.current !== JSON.stringify(draft)) return;
    setDraft(current => ({ ...current, budgetMaxPerPerson: needs.hard.budgetMaxPerPerson,
      maxOutingMinutes: needs.hard.maxOutingMinutes ?? null, dietary: needs.hard.dietary, allergies: needs.hard.allergies }));
  }, [agentNeeds, needs, draft]);
  const saved = !!agentNeeds?.confirmed && !!needs && agentNeeds.text === draft.preferences.trim()
    && needs.hard.budgetMaxPerPerson === draft.budgetMaxPerPerson && (needs.hard.maxOutingMinutes ?? null) === draft.maxOutingMinutes
    && JSON.stringify(needs.hard.dietary) === JSON.stringify(draft.dietary) && JSON.stringify(needs.hard.allergies) === JSON.stringify(draft.allergies);
  return <div className="space-y-5">
    <div><h1 className="shout text-[48px]">Your kind of outing</h1><p className="on-sky mt-3">Set what matters. Leave everything else flexible.</p></div>
    <section className="card space-y-5" aria-label="Your private preferences">
      <p>Your limits and prompt stay private. The coordinator uses them to plan for everyone.</p>
      <PreferenceFields value={draft} onChange={value => { untouched.current = false; setDraft(value); }} budgetCeiling={agentNeeds?.result?.hard.budgetMaxPerPerson} />
      <div className="space-y-2"><label className="block font-bold" htmlFor="agent-prompt">Anything else? (optional)</label>
        <textarea id="agent-prompt" className="input min-h-32" maxLength={4000} value={draft.preferences}
          placeholder="Burgers sound good. Somewhere quiet, then a walk…"
          onChange={e => { untouched.current = false; setDraft({ ...draft, preferences: e.target.value }); }} />
        <p className="muted">Tell Claude your mood, preferences or other restrictions. A blank prompt is fine.</p>
      </div>
      {account ? <label className="check"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />Remember these choices as my private defaults</label> : null}
      <button className="btn btn-sun w-full" disabled={busy || interpreting} onClick={() => run(async () => {
        untouched.current = false;
        lastSubmitted.current = JSON.stringify(draft);
        await submit({ text: draft.preferences, structuredJson: JSON.stringify({
          budgetMaxPerPerson: draft.budgetMaxPerPerson, maxOutingMinutes: draft.maxOutingMinutes,
          dietary: draft.dietary, allergies: draft.allergies, maxTravelMinutes: needs?.hard.maxTravelMinutes ?? initialStructured?.maxTravelMinutes ?? null,
        }) });
        try { sessionStorage.removeItem(`huddle:draft:${group.id}`); } catch { /* Optional draft storage. */ }
        if (remember && account) { await saveContext({ contextJson: JSON.stringify(draft) }); setNotice("Your own choices were also saved as private defaults."); }
      })}>{interpreting ? "Claude is checking your extra request…" : "Save & ready"}</button>
      {saved ? <p className="sticker sticker-lime" role="status">Your needs are saved. Ready ✓</p> : interpreting ? <p role="status">Checking only what needs interpretation. Your sliders are already explicit.</p> : <p className="muted">Saving is your ready action. No separate review step is needed.</p>}
      {agentNeeds?.confirmed && !saved && !interpreting ? <p className="muted" role="status">You have unsaved changes. Save & ready to apply them to this Huddle.</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {agentNeeds?.error ? <p className="error" role="alert">{agentNeeds.error}</p> : null}
    </section>
    {needs ? <section className="card space-y-3" aria-label="Your private needs summary"><h2 className="card-title">Your private summary</h2>
      <p><strong>Whole-outing budget:</strong> {needs.hard.budgetMaxPerPerson == null ? "Flexible" : `$${needs.hard.budgetMaxPerPerson} per person across all stops`}</p>
      <p><strong>Time available:</strong> {needs.hard.maxOutingMinutes == null ? "Flexible" : `${needs.hard.maxOutingMinutes} minutes for the whole outing`}</p>
      <p><strong>Dietary requirements:</strong> {needs.hard.dietary.join(", ") || "None"}</p>
      <p><strong>Allergies:</strong> {needs.hard.allergies.join(", ") || "None stated"}</p>
      {needs.preferences.length ? <p><strong>Your vibe:</strong> {needs.preferences.join(" · ")}</p> : null}
      {[...needs.hard.vetoCuisines, ...needs.hard.vetoCategories, ...needs.hard.rejectedTerms].length ? <p><strong>Must reject:</strong> {[...needs.hard.vetoCuisines, ...needs.hard.vetoCategories, ...needs.hard.rejectedTerms].join(", ")}</p> : null}
      {needs.questions.length ? <div className="card-note p-3 space-y-2" role="status"><h3 className="font-bold">One thing to clarify privately</h3><ul>{needs.questions.map(q => <li key={q}>{q}</li>)}</ul><p className="muted">Update the relevant choice or your optional prompt above, then Save & ready again.</p></div> : null}
      {needs.warnings.map(w => <p className="muted" key={w}>{w}</p>)}
    </section> : null}
    <section className="card space-y-3"><h2 className="card-title">Your people</h2>
      <ul className="space-y-2">{group.members.map(m => <li key={m.id}>{m.name}{m.id === session.memberId ? " (you)" : ""}: {agent?.confirmedMemberIds.includes(m.id) ? "ready ✓" : "choosing private needs"}</li>)}</ul>
      {isHost ? <button className="btn btn-sun w-full" disabled={busy || !saved || !allReady || agent?.status === "planning" || group.status === "lobby"} onClick={() => run(() => find())}>Find plans</button> : <p className="muted">The host can find plans when everyone has saved their needs.</p>}
      {!allReady ? <p className="muted">Waiting for at least two people, each with saved needs.</p> : null}
    </section>
    {error ? <p className="error" role="alert">{error}</p> : null}
  </div>;
}

export function AgentPlanCard({ plan, recommended = false }: { plan: AgentPlan; recommended?: boolean }) {
  const listings = useCatalogListings();
  // At a glance: one line per stop. Addresses, sources, the coordinator's
  // reasoning and data limits stay one tap away under "More about this plan".
  const stops = plan.stops.map(stop => {
    const place = listings.get(stop.placeId);
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${stop.name} ${place?.address ?? `${stop.lat},${stop.lng}`}`)}${place?.googlePlaceId ? `&query_place_id=${encodeURIComponent(place.googlePlaceId)}` : ""}`;
    const rated = !!place && Number.isFinite(place.rating) && place.rating > 0;
    return { stop, place, mapsUrl, rated };
  });
  return <section className="card space-y-3">
    {recommended ? <span className="sticker sticker-sun">★ Coordinator's pick</span> : null}
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="card-title">{plan.title}</h2><span className="sticker sticker-lime">${plan.costPerPerson}/person</span></div>
    <ol className="plan-stops">{stops.map(({ stop, place, mapsUrl, rated }, i) =>
      <li key={stop.placeId}>
        <span className="plan-dot">{i + 1}</span>
        <div className="min-w-0">
          <a className="plan-stop-name" href={mapsUrl} target="_blank" rel="noopener noreferrer">{stop.name}</a>
          <p className="muted text-sm">{stop.start}–{stop.end} · {place?.label ?? stop.category} · ${stop.costPerPerson}{rated ? ` · ★ ${place!.rating.toFixed(1)}` : ""}</p>
        </div>
      </li>)}</ol>
    <details className="plan-more"><summary>More about this plan</summary>
      <div className="space-y-3 pt-2 text-sm">
        <p>{plan.whyLine}</p>
        <ul className="space-y-2">{stops.map(({ stop, place, rated }) => <li key={stop.placeId}>
          <strong>{stop.name}</strong>{place?.address ? ` · ${place.address}` : ""}
          {rated ? <span className="muted block">★ {place!.rating.toFixed(1)}/5{place!.reviewCount > 0 ? ` from ${place!.reviewCount.toLocaleString()} reviews` : ""} · {place!.observation ? <>{place!.observation.url ? <a className="underline" href={place!.observation.url} target="_blank" rel="noopener noreferrer">{place!.observation.source}</a> : place!.observation.source}, {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/Los_Angeles" }).format(new Date(place!.observation.fetchedAt))}</> : "cached catalog rating"}</span> : null}
          {place?.dietary?.length && stop.category !== "activity" ? <span className="muted block">Listed dietary options: {place.dietary.map(d => d.replaceAll("_", " ")).join(", ")}</span> : null}
        </li>)}</ul>
        <p className="muted">Check menus and allergy handling directly with each venue.</p>
        {plan.limitations.length ? <ul className="muted list-disc pl-5">{plan.limitations.map(l => <li key={l}>{l}</li>)}</ul> : null}
      </div>
    </details>
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
  if (runId && planRun === undefined) return <p className="card" role="status">Loading the plans…</p>;
  if (!runId || agent?.status !== "ready" || result?.inputRevision !== agent.revision) return <section className="card"><p>These choices are not current. Review your needs and plans first.</p><Link to={`/g/${session.groupId}/prefs`}>Review needs</Link></section>;
  const plans = result.plans;
  const counts = votes?.counts ?? {};
  const complete = votes?.total === group.members.length;
  const top = Math.max(0, ...Object.values(counts));
  const leaders = plans.filter(p => top > 0 && counts[p.id] === top);
  const winner = complete ? leaders.length === 1 ? leaders[0] : leaders.find(p => p.id === planRun?.roulette?.planId) : null;
  return <div className="space-y-5">
    <h1 className="shout text-[48px]">Choose together</h1>
    <VoteStatus votes={votes} members={group.members} winnerTitle={winner?.title}
      tiedTitles={complete && !winner ? leaders.map(p => p.title) : undefined} />
    <Link className="btn" to={`/g/${session.groupId}/plans`}>Read plans and conversation</Link>
    {plans.map(p => <div key={p.id} className={`vote-option ${votes?.myVote === p.id ? "is-mine" : ""}`}>
      <AgentPlanCard plan={p} recommended={p.id === result.recommendedPlanId} />
      <VoteChoice planId={p.id} title={p.title} votes={votes} members={group.members} myMemberId={session.memberId}
        busy={busy} onVote={() => run(() => vote({ runId, planId: p.id }))} />
    </div>)}
    <p className="on-sky muted">You can change your vote until the host starts booking.</p>
    {winner ? <MeetupCalendarAction runId={runId} planId={winner.id} isHost={isHost} /> : null}
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
