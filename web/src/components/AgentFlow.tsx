import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useProcedure, useReducer } from "spacetimedb/react";
import { procedures, reducers } from "../module_bindings";
import { useGroup } from "../groupContext";
import { useRun } from "../useRun";
import { isReadyAgentPlan, useAgentMessages, useAgentOrders, useAgentPreferences, useAgentRun, type AgentOrder, type AgentPlan, type AgentStructuredPreferences, type AgentSuggestion } from "../agentData";
import { EMPTY_CONTEXT, useAccount, useAccountContext, type AccountContext } from "../accountData";
import { PreferenceFields } from "./PreferenceFields";
import { useCatalogListings } from "../catalogData";
import { useVotes } from "../data";
import PlanMap from "./PlanMap";
import MeetupCalendarAction from "./MeetupCalendarAction";
import AgentVenueDetails from "./AgentVenueDetails";
import { displayTime } from "../venueFormatting";
import PrivateOrderSummary from "./PrivateOrderSummary";
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
      preferredStops: initialStructured.preferredStops ?? null,
      dietary: initialStructured.dietary,
      allergies: initialStructured.allergies,
    } : {}), ...(hard ? {
      budgetMaxPerPerson: hard.budgetMaxPerPerson, maxOutingMinutes: hard.maxOutingMinutes ?? null,
      preferredStops: hard.preferredStops ?? null, dietary: hard.dietary, allergies: hard.allergies,
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
      maxOutingMinutes: needs.hard.maxOutingMinutes ?? null, preferredStops: needs.hard.preferredStops ?? null,
      dietary: needs.hard.dietary, allergies: needs.hard.allergies }));
  }, [agentNeeds, needs, draft]);
  const saved = !!agentNeeds?.confirmed && !!needs && agentNeeds.text === draft.preferences.trim()
    && needs.hard.budgetMaxPerPerson === draft.budgetMaxPerPerson && (needs.hard.maxOutingMinutes ?? null) === draft.maxOutingMinutes
    && (needs.hard.preferredStops ?? null) === draft.preferredStops
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
          budgetMaxPerPerson: draft.budgetMaxPerPerson, maxOutingMinutes: draft.maxOutingMinutes, preferredStops: draft.preferredStops,
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
      <p><strong>Stops:</strong> {needs.hard.preferredStops == null ? "Flexible" : `${needs.hard.preferredStops} stop${needs.hard.preferredStops === 1 ? "" : "s"}, averaged with the group`}</p>
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

// Every option gets its own street map; straight segments are only the
// fallback the map draws if the walking route can't be fetched.
function OptionMap({ plan }: { plan: AgentPlan }) {
  const stops = plan.stops.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng));
  if (!stops.length) return null;
  const lines = stops.slice(1).map((s, i) => [[stops[i].lng, stops[i].lat], [s.lng, s.lat]] as [number, number][]);
  return <PlanMap plan={{ ...plan, stops }} lines={lines} />;
}

export function AgentPlanCard({ plan, order, recommended = false, optionNumber = 1 }: { plan: AgentPlan; order?: AgentOrder; recommended?: boolean; optionNumber?: number }) {
  const listings = useCatalogListings();
  const ready = isReadyAgentPlan(plan);
  return <section className="card space-y-3">
    {recommended && ready ? <span className="sticker sticker-sun">Coordinator's recommendation</span> : null}
    <h2 className="card-title">Option {optionNumber}</h2>
    <p className="font-bold">{plan.stops.map(stop => stop.name).join(" → ")}</p>
    <PrivateOrderSummary order={order} listings={listings} stops={plan.stops} />
    <ol className="space-y-4">{plan.stops.map(stop => {
      const place = listings.get(stop.placeId);
      return <li key={stop.placeId} className="venue-details space-y-2">
        <strong className="text-lg">{stop.name}</strong><p className="muted">{displayTime(stop.start)}–{displayTime(stop.end)}</p>
        <AgentVenueDetails place={place} name={stop.name} lat={stop.lat} lng={stop.lng} />
      </li>;
    })}</ol>
  </section>;
}

function AgentSuggestionCard({ suggestion, order, optionNumber }: { suggestion: AgentSuggestion; order?: AgentOrder; optionNumber: number }) {
  const listings = useCatalogListings();
  const place = listings.get(suggestion.placeId);
  if (!place) return <article className="card space-y-3" role="status"><h2 className="card-title">Option {optionNumber}</h2><p>Loading venue…</p></article>;
  return <article className="card space-y-3">
    <h2 className="card-title">Option {optionNumber}</h2>
    <p className="font-bold">{place.name}</p>
    <p className="muted">Time not set</p>
    <PrivateOrderSummary order={order} listings={listings} alternative />
    <AgentVenueDetails place={place} name={place.name} />
  </article>;
}

function OtherOptions({ suggestions, orders, startAt }: { suggestions: AgentSuggestion[]; orders: AgentOrder[]; startAt: number }) {
  if (!suggestions.length) return null;
  return <section className="space-y-4" aria-label="Other options to explore">
    {suggestions.map((suggestion, index) => <AgentSuggestionCard key={suggestion.id} suggestion={suggestion} optionNumber={startAt + index}
      order={orders.find(order => order.planId === suggestion.id)} />)}
  </section>;
}

export function AgentPlans() {
  const { group, agent, session, isHost } = useGroup();
  const planRun = useAgentRun(group.latestRunId);
  const orders = useAgentOrders(group.latestRunId, session.memberId);
  const messages = useAgentMessages(group.latestRunId);
  const find = useReducer(reducers.findAgentPlans);
  const post = useReducer(reducers.postAgentDiscussion);
  const { run, busy, error } = useRun();
  const [message, setMessage] = useState("");
  if (agent?.status === "planning") return <section className="card space-y-3" role="status"><h1 className="card-title">Your coordinator is planning</h1><p>Considering confirmed prompts and checking catalog itineraries. No booking is being made.</p></section>;
  const result = planRun?.result;
  const active = !!agent && ["ready", "blocked"].includes(agent.status) && result?.inputRevision === agent.revision;
  const hasChoices = active && !!(result?.plans.length || result?.suggestions?.length);
  const canDiscuss = hasChoices;
  return <div className="space-y-5">
    <h1 className="shout text-[48px]">Your group’s plans</h1>
    {agent?.error ? <p className="card error" role="alert">{agent.error}</p> : null}
    {!active && !result?.conflicts.length ? <p className="card">Review everyone's current needs before generating plans.</p> : null}
    {result?.conflicts.map(c => <p className="card card-note" key={c}>{c}</p>)}
    {active ? result?.plans.map((plan, index) => <div key={plan.id} className="space-y-3"><OptionMap plan={plan} /><AgentPlanCard plan={plan} optionNumber={index + 1} order={orders.find(order => order.planId === plan.id)} recommended={plan.id === result.recommendedPlanId} /></div>) : null}
    {active ? <OtherOptions suggestions={result?.suggestions ?? []} orders={orders} startAt={(result?.plans.length ?? 0) + 1} /> : null}
    <section className="card space-y-3">
      <h2 className="card-title">Coordinator and group conversation</h2>
      <p className="muted">This conversation is shared. Update hard requirements privately on the Needs screen.</p>
      <ol className="space-y-3">{messages.map(m => <li key={String(m.id)}><strong>{m.label}</strong><p>{m.text}</p></li>)}</ol>
      {canDiscuss ? <form className="space-y-2" onSubmit={e => { e.preventDefault(); void run(async () => { await post({ text: message }); setMessage(""); }); }}>
        <label htmlFor="group-discussion">Message everyone</label>
        <textarea id="group-discussion" className="input" maxLength={2000} value={message} onChange={e => setMessage(e.target.value)} />
        <button className="btn" disabled={busy || !message.trim()}>Send to group</button>
      </form> : null}
      {canDiscuss ? <p className="muted">The coordinator considers this discussion next time the host chooses Find plans again.</p> : null}
    </section>
    <div className="flex flex-wrap gap-3">
      <Link className="btn" to={`/g/${session.groupId}/prefs`}>Edit my private needs</Link>
      {hasChoices ? <Link className="btn btn-primary" to={`/g/${session.groupId}/vote`}>Go to vote</Link> : null}
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
  const orders = useAgentOrders(runId, session.memberId);
  const listings = useCatalogListings();
  const votes = useVotes(runId, session.memberId);
  const vote = useReducer(reducers.vote);
  const spin = useProcedure(procedures.doRoulette);
  const book = useReducer(reducers.startBooking);
  const { run, busy, error } = useRun();
  const result = planRun?.result;
  if (runId && planRun === undefined) return <p className="card" role="status">Loading the plans…</p>;
  if (!runId || !agent || !["ready", "blocked"].includes(agent.status) || result?.inputRevision !== agent.revision) return <section className="card space-y-3"><p>There are no current options to vote on yet.</p><Link className="underline font-bold" to={`/g/${session.groupId}/plans`}>Open plans</Link></section>;
  const choices = [...result.plans, ...(result.suggestions ?? [])];
  const counts = votes?.counts ?? {};
  const complete = votes?.total === group.members.length;
  const top = Math.max(0, ...Object.values(counts));
  const leaders = choices.filter(p => top > 0 && counts[p.id] === top);
  const winner = complete ? leaders.length === 1 ? leaders[0] : leaders.find(p => p.id === planRun?.roulette?.planId) : null;
  const bookingPlan = winner ? result.plans.find(plan => plan.id === winner.id && isReadyAgentPlan(plan)) : undefined;
  const titleFor = (id: string) => `Option ${choices.findIndex(choice => choice.id === id) + 1}`;
  return <div className="space-y-5">
    <h1 className="shout text-[48px]">Choose together</h1>
    {choices.length ? <VoteStatus votes={votes} members={group.members} winnerTitle={winner ? titleFor(winner.id) : undefined}
      tiedTitles={complete && !winner ? leaders.map(p => titleFor(p.id)) : undefined} /> : null}
    <Link className="btn" to={`/g/${session.groupId}/plans`}>Read plans and conversation</Link>
    {!choices.length ? <p className="card">No options yet. The host can find plans after everyone saves their needs.</p> : null}
    {choices.map((choice, index) => <div key={choice.id} className={`vote-option ${votes?.myVote === choice.id ? "is-mine" : ""}`}>
      {"stops" in choice ? <><OptionMap plan={choice} /><AgentPlanCard plan={choice} optionNumber={index + 1} order={orders.find(order => order.planId === choice.id)} recommended={choice.id === result.recommendedPlanId} /></>
        : <AgentSuggestionCard suggestion={choice} optionNumber={index + 1} order={orders.find(order => order.planId === choice.id)} />}
      <VoteChoice planId={choice.id} title={`Option ${index + 1}`} votes={votes} members={group.members} myMemberId={session.memberId}
        busy={busy || !("stops" in choice) && !listings.has(choice.placeId)} onVote={() => run(() => vote({ runId, planId: choice.id }))} />
    </div>)}
    {choices.length ? <p className="on-sky muted">You can change your vote until the host starts booking.</p> : null}
    {bookingPlan ? <MeetupCalendarAction runId={runId} planId={bookingPlan.id} isHost={isHost} /> : null}
    {bookingPlan ? <p className="card card-note">Booking is a simulation. No restaurant will be called or reserved.</p> : null}
    {choices.length ? <div className="flex flex-wrap gap-3">
      <button className="btn" disabled={busy || !complete || leaders.length < 2 || !!winner}
        onClick={() => run(() => spin({ runId }))}>Resolve tie: equal-chance Spin</button>
      {isHost && bookingPlan ? <button className="btn btn-primary" disabled={busy} onClick={() => run(async () => {
        await book({ runId, planId: bookingPlan.id, stopIndex: bookingPlan.stops.findIndex(s => s.category === "meal") });
        navigate(`/g/${session.groupId}/call`);
      })}>Simulate booking {titleFor(bookingPlan.id)}</button> : null}
    </div> : null}
    {error ? <p className="error" role="alert">{error}</p> : null}
  </div>;
}
