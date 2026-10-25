import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useProcedure, useReducer } from "spacetimedb/react";
import { procedures, reducers } from "../module_bindings";
import { useGroup } from "../groupContext";
import { useRun } from "../useRun";
import { isReadyAgentPlan, useAgentMessages, useAgentOrders, useAgentPreferences, useAgentRun, type AgentOrder, type AgentPlan, type AgentStructuredPreferences, type AgentSuggestion } from "../agentData";
import { useAccount, useAccountContext, type AccountContext } from "../accountData";
import { PreferenceFields } from "./PreferenceFields";
import { DEFAULT_PREFERENCES } from "../accountContextState";
import { useCatalogListings } from "../catalogData";
import PlanMap from "./PlanMap";
import AgentVenueDetails from "./AgentVenueDetails";
import { displayTime } from "../venueFormatting";
import PrivateOrderSummary from "./PrivateOrderSummary";
import { VoteChoice, VoteStatus } from "./VoteTally";
import { useAgentBallot } from "../useAgentBallot";
import PageHeading from "./PageHeading";
import { useCalendarPlanning } from "../huddleTiming";
import CalendarTimeSelector from "./CalendarTimeSelector";
import { labelOptions, type OptionLabel } from "../optionLabels";
import OptionLabels from "./OptionLabels";
import GoogleMapsAction from "./GoogleMapsAction";
import { selectOptionCovers, type OptionCover } from "../optionCovers";

export function AgentPrefs() {
  const { agentNeeds, group, session } = useGroup();
  const account = useAccount();
  const profile = useAccountContext();
  const structured = useAgentPreferences();
  if (account === undefined || agentNeeds === undefined || profile === undefined || structured === undefined || (structured && structured.memberId !== session.memberId)) return <p className="card" role="status">Loading preferences…</p>;
  return <AgentPrefsForm key={`${account?.accountId ?? "guest"}:${group.id}:${session.memberId}`} initialProfile={profile?.context ?? DEFAULT_PREFERENCES} initialStructured={structured?.structured} />;
}

function AgentPrefsForm({ initialProfile, initialStructured }: { initialProfile: AccountContext; initialStructured?: AgentStructuredPreferences }) {
  const { group, agent, agentNeeds, isHost, session } = useGroup();
  const account = useAccount();
  const submit = useReducer(reducers.saveAgentPreferences);
  const saveContext = useReducer(reducers.saveAccountContext);
  const { findPlans: find, ready: timingReady } = useCalendarPlanning();
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
    <div><PageHeading lead="Your kind of" accent="adventure" /><p className="on-sky mt-2">Leave anything flexible.</p></div>
    <section className="card preferences-form" aria-label="Your preferences">
      <PreferenceFields value={draft} onChange={value => { untouched.current = false; setDraft(value); }} budgetCeiling={agentNeeds?.result?.hard.budgetMaxPerPerson}>
      <div className="preference-extra"><label className="block font-bold" htmlFor="agent-prompt">Anything else? (optional)</label>
        <textarea id="agent-prompt" className="input" rows={2} maxLength={4000} value={draft.preferences}
          placeholder="Burgers sound good. Somewhere quiet, then a walk…"
          onChange={e => { untouched.current = false; setDraft({ ...draft, preferences: e.target.value }); }} />
      </div>
      </PreferenceFields>
      <div className="preferences-actions">
      {account ? <label className="check"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />Remember for next time</label> : null}
      <button className="btn btn-sun" disabled={busy || interpreting} onClick={() => run(async () => {
        untouched.current = false;
        lastSubmitted.current = JSON.stringify(draft);
        await submit({ text: draft.preferences, structuredJson: JSON.stringify({
          budgetMaxPerPerson: draft.budgetMaxPerPerson, maxOutingMinutes: draft.maxOutingMinutes, preferredStops: draft.preferredStops,
          dietary: draft.dietary, allergies: draft.allergies, maxTravelMinutes: needs?.hard.maxTravelMinutes ?? initialStructured?.maxTravelMinutes ?? null,
        }) });
        try { sessionStorage.removeItem(`huddle:draft:${group.id}`); } catch { /* Optional draft storage. */ }
        if (remember && account) { await saveContext({ contextJson: JSON.stringify(draft) }); setNotice("Saved for next time."); }
      })}>{interpreting ? "Checking your request…" : "Save & ready"}</button>
      </div>
      {saved ? <p className="sticker sticker-lime" role="status">Ready ✓</p> : null}
      {agentNeeds?.confirmed && !saved && !interpreting ? <p className="muted" role="status">Unsaved changes</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {agentNeeds?.error ? <p className="error" role="alert">{agentNeeds.error}</p> : null}
    </section>
    {needs ? <details className="card saved-preferences" open={needs.questions.length > 0}><summary>Saved preferences</summary><div className="space-y-2">
      <p><strong>Whole-outing budget:</strong> {needs.hard.budgetMaxPerPerson == null ? "Flexible" : `$${needs.hard.budgetMaxPerPerson} per person across all stops`}</p>
      <p><strong>Time available:</strong> {needs.hard.maxOutingMinutes == null ? "Flexible" : `${needs.hard.maxOutingMinutes} minutes for the whole outing`}</p>
      <p><strong>Stops:</strong> {needs.hard.preferredStops == null ? "Flexible" : `${needs.hard.preferredStops} stop${needs.hard.preferredStops === 1 ? "" : "s"}, averaged with the group`}</p>
      <p><strong>Dietary requirements:</strong> {needs.hard.dietary.join(", ") || "None"}</p>
      <p><strong>Allergies:</strong> {needs.hard.allergies.join(", ") || "None stated"}</p>
      {needs.preferences.length ? <p><strong>Your vibe:</strong> {needs.preferences.join(" · ")}</p> : null}
      {[...needs.hard.vetoCuisines, ...needs.hard.vetoCategories, ...needs.hard.rejectedTerms].length ? <p><strong>Must reject:</strong> {[...needs.hard.vetoCuisines, ...needs.hard.vetoCategories, ...needs.hard.rejectedTerms].join(", ")}</p> : null}
      {needs.questions.length ? <div className="card-note p-3 space-y-2" role="status"><h3 className="font-bold">One thing to clarify</h3><ul>{needs.questions.map(q => <li key={q}>{q}</li>)}</ul><p className="muted">Update your choices, then save again.</p></div> : null}
      {needs.warnings.map(w => <p className="muted" key={w}>{w}</p>)}
    </div></details> : null}
    <CalendarTimeSelector />
    <section className="card space-y-3"><h2 className="section-title">Your people</h2>
      <ul className="readiness-list">{group.members.map(m => <li key={m.id}>{m.name}{m.id === session.memberId ? " (you)" : ""}: {agent?.confirmedMemberIds.includes(m.id) ? "ready ✓" : "thinking…"}</li>)}</ul>
      {isHost ? <button className="btn btn-sun w-full" disabled={busy || !timingReady || !saved || !allReady || agent?.status === "planning" || group.status === "lobby"} onClick={() => run(() => find())}>Find plans</button> : <p className="muted">The host can find plans when everyone has saved their needs.</p>}
      {!allReady ? <p className="muted">At least two people need to be ready.</p> : null}
    </section>
    {error ? <p className="error" role="alert">{error}</p> : null}
  </div>;
}

// Every option gets its own street map; straight segments are only the
// fallback the map draws if the walking route can't be fetched.
export function OptionMap({ plan }: { plan: AgentPlan }) {
  const stops = plan.stops.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng));
  if (!stops.length) return null;
  const lines = stops.slice(1).map((s, i) => [[stops[i].lng, stops[i].lat], [s.lng, s.lat]] as [number, number][]);
  return <PlanMap plan={{ ...plan, stops }} lines={lines} />;
}

export function AgentPlanCard({ plan, order, recommended = false, optionNumber = 1, heading, compact = false, labels, showMapsLink = true, cover }: { plan: AgentPlan; order?: AgentOrder; recommended?: boolean; optionNumber?: number; heading?: string; compact?: boolean; labels?: readonly OptionLabel[]; showMapsLink?: boolean; cover?: OptionCover }) {
  const listings = useCatalogListings();
  const ready = isReadyAgentPlan(plan);
  const [expanded, setExpanded] = useState(false);
  const first = plan.stops[0];
  const venues = <ol className="space-y-4">{plan.stops.map(stop => <li key={stop.placeId} className="venue-details space-y-2">
    <strong>{stop.name}</strong><p className="muted">{displayTime(stop.start)}–{displayTime(stop.end)}</p>
    <AgentVenueDetails place={listings.get(stop.placeId)} name={stop.name} />
  </li>)}</ol>;
  return <section className={`card option-card${compact ? " is-compact" : ""}`}>
    <div className="option-card-heading"><h2 className="card-title">{heading ?? `Option ${optionNumber}`}</h2>
      <OptionLabels labels={labels} />
      {recommended && ready ? <span className="sticker sticker-sun">Claude’s pick</span> : null}</div>
    <h3 className="option-route">{plan.stops.map(stop => stop.name).join(" → ")}</h3>
    {compact && first ? <AgentVenueDetails place={cover?.place ?? listings.get(first.placeId)} name={cover?.place.name ?? first.name} compact photo={cover?.photo} showName={!!cover && cover.place.id !== first.placeId} /> : null}
    {compact && first ? <p className="option-meta"><span>{displayTime(first.start)}–{displayTime(plan.stops.at(-1)!.end)}</span><span>{plan.stops.length} stop{plan.stops.length === 1 ? "" : "s"}</span></p> : null}
    <PrivateOrderSummary order={order} listings={listings} stops={plan.stops} compact={compact} />
    {showMapsLink ? <GoogleMapsAction stops={plan.stops} /> : null}
    {compact ? <details className="option-details" onToggle={e => setExpanded(e.currentTarget.open)}><summary>Map & details</summary>
      {expanded ? <div className="space-y-4"><OptionMap plan={plan} />{venues}</div> : null}
    </details> : venues}
  </section>;
}

export function AgentSuggestionCard({ suggestion, order, optionNumber = 1, heading, compact = false, labels, showMapsLink = true, cover }: { suggestion: AgentSuggestion; order?: AgentOrder; optionNumber?: number; heading?: string; compact?: boolean; labels?: readonly OptionLabel[]; showMapsLink?: boolean; cover?: OptionCover }) {
  const listings = useCatalogListings();
  const [expanded, setExpanded] = useState(false);
  const place = listings.get(suggestion.placeId);
  if (!place) return <article className="card space-y-3" role="status"><h2 className="card-title">{heading ?? `Option ${optionNumber}`}</h2><p>Loading venue…</p></article>;
  const pin = Number.isFinite(place.lat) && Number.isFinite(place.lng)
    ? { stops: [{ placeId: place.id, name: place.name, lat: place.lat as number, lng: place.lng as number }] } : null;
  return <div className={compact ? "comparison-suggestion" : "space-y-3"}>
    {/* Done and public results already render the selected venue's map. */}
    {pin && !heading && !compact ? <PlanMap plan={pin} lines={[]} /> : null}
  <article className="card option-card">
    <div className="option-card-heading"><h2 className="card-title">{heading ?? `Option ${optionNumber}`}</h2><OptionLabels labels={labels} /></div>
    <h3 className="option-route">{place.name}</h3>
    {compact ? <AgentVenueDetails place={place} name={place.name} compact photo={cover?.photo} /> : null}
    <p className="muted">Time to be decided</p>
    <PrivateOrderSummary order={order} listings={listings} alternative compact={compact} />
    {showMapsLink ? <GoogleMapsAction stops={[{ placeId: place.id, name: place.name, lat: place.lat, lng: place.lng }]} /> : null}
    {compact ? <details className="option-details" onToggle={e => setExpanded(e.currentTarget.open)}><summary>Map & details</summary>
      {expanded ? <div className="space-y-4">{pin ? <PlanMap plan={pin} lines={[]} /> : null}<AgentVenueDetails place={place} name={place.name} /></div> : null}
    </details> : <AgentVenueDetails place={place} name={place.name} />}
  </article></div>;
}

export function AgentPlans() {
  const { group, agent, session, isHost } = useGroup();
  const planRun = useAgentRun(group.latestRunId);
  const orders = useAgentOrders(group.latestRunId, session.memberId);
  const messages = useAgentMessages(group.latestRunId).filter(message => message.speaker === "participant");
  const listings = useCatalogListings();
  const { findPlans: find, ready: timingReady } = useCalendarPlanning();
  const post = useReducer(reducers.postAgentDiscussion);
  const { run, busy, error } = useRun();
  const [message, setMessage] = useState("");
  if (agent?.status === "planning") return <section className="card" role="status"><h1 className="card-title">Finding your next outing…</h1></section>;
  const result = planRun?.result;
  const covers = selectOptionCovers([...(result?.plans ?? []), ...(result?.suggestions ?? [])], listings);
  const active = !!agent && ["ready", "blocked"].includes(agent.status) && result?.inputRevision === agent.revision;
  const hasChoices = active && !!(result?.plans.length || result?.suggestions?.length);
  const canDiscuss = hasChoices;
  const labels = labelOptions(result ? [...result.plans, ...(result.suggestions ?? [])] : [], listings, orders);
  return <div className="space-y-5">
    <div className="page-title-row"><PageHeading lead="Your group’s" accent="options" />
      <div className="page-actions">
        <Link className="btn btn-quiet" to={`/g/${session.groupId}/prefs`}>Edit preferences</Link>
        {isHost && agent?.status !== "needs" ? <button className="btn" disabled={busy || !timingReady} onClick={() => run(() => find())}>Plan again</button> : null}
        {hasChoices ? <Link className="btn btn-sun" to={`/g/${session.groupId}/vote`}>Vote →</Link> : null}
      </div>
    </div>
    {agent?.error ? <p className="card error" role="alert">{agent.error}</p> : null}
    {!active && !result?.conflicts.length ? <p className="card">Review everyone's current needs before generating plans.</p> : null}
    {result?.conflicts.map(c => <p className="card card-note" key={c}>{c}</p>)}
    {active ? <div className="comparison-grid" aria-label="Compare outing options">
      {result?.plans.map((plan, index) => <AgentPlanCard key={plan.id} plan={plan} labels={labels.get(plan.id)} cover={covers.get(plan.id)} compact optionNumber={index + 1} order={orders.find(order => order.planId === plan.id)} recommended={plan.id === result.recommendedPlanId} />)}
      {result?.suggestions?.map((suggestion, index) => <AgentSuggestionCard key={suggestion.id} suggestion={suggestion} labels={labels.get(suggestion.id)} cover={covers.get(suggestion.id)} compact optionNumber={(result.plans.length ?? 0) + index + 1} order={orders.find(order => order.planId === suggestion.id)} />)}
    </div> : null}
    <details className="card group-discussion">
      <summary>Group conversation{messages.length ? ` (${messages.length})` : ""}</summary>
      <div className="space-y-3">
      {messages.length ? <ol className="space-y-3">{messages.map(m => <li key={String(m.id)}><strong>{m.label}</strong><p className="group-message">{m.text}</p></li>)}</ol> : <p className="muted">No messages yet.</p>}
      {canDiscuss ? <form className="space-y-2" onSubmit={e => { e.preventDefault(); void run(async () => { await post({ text: message }); setMessage(""); }); }}>
        <label htmlFor="group-discussion">Message everyone</label>
        <textarea id="group-discussion" className="input" maxLength={2000} value={message} onChange={e => setMessage(e.target.value)} />
        <button className="btn" disabled={busy || !message.trim()}>Send to group</button>
      </form> : null}
      {canDiscuss ? <p className="muted">Choose Plan again to include new messages.</p> : null}
      </div>
    </details>
    {error ? <p className="error" role="alert">{error}</p> : null}
  </div>;
}

export function AgentVote() {
  const { group, session, agent } = useGroup();
  const { runId, planRun, votes, loading, current, choices, complete, leaders, winner } = useAgentBallot(group, agent, session.memberId);
  const orders = useAgentOrders(runId, session.memberId);
  const listings = useCatalogListings();
  const vote = useReducer(reducers.vote);
  const spin = useProcedure(procedures.doRoulette);
  const { run, busy, error } = useRun();
  const result = planRun?.result;
  if (loading) return <p className="card" role="status">Loading the plans…</p>;
  if (!runId || !current || !result) return <section className="card space-y-3"><p>There are no current options to vote on yet.</p><Link className="underline font-bold" to={`/g/${session.groupId}/plans`}>Open plans</Link></section>;
  const labels = labelOptions(choices, listings, orders);
  const covers = selectOptionCovers(choices, listings);
  const titleFor = (id: string) => `Option ${choices.findIndex(choice => choice.id === id) + 1}`;
  return <div className="space-y-5">
    <div className="page-title-row"><PageHeading lead="Choose" accent="together" />
      <div className="page-actions"><Link className="btn" to={`/g/${session.groupId}/plans`}>Plans & chat</Link>
      {winner ? <Link className="btn btn-sun" to={`/g/${session.groupId}/done`}>See the group’s choice →</Link> : null}</div>
    </div>
    {choices.length ? <VoteStatus votes={votes} members={group.members} winnerTitle={winner ? titleFor(winner.id) : undefined}
      tiedTitles={complete && !winner ? leaders.map(p => titleFor(p.id)) : undefined} /> : null}
    {!choices.length ? <p className="card">No options yet. The host can find plans after everyone saves their needs.</p> : null}
    <div className="comparison-grid" aria-label="Vote on an outing">{choices.map((choice, index) => <div key={choice.id} className={`vote-option ${votes?.myVote === choice.id ? "is-mine" : ""}`}>
      <VoteChoice planId={choice.id} title={`Option ${index + 1}`} votes={votes} members={group.members} myMemberId={session.memberId}
        busy={busy || !("stops" in choice) && !listings.has(choice.placeId)} onVote={() => run(() => vote({ runId, planId: choice.id }))} />
      {"stops" in choice ? <AgentPlanCard plan={choice} labels={labels.get(choice.id)} cover={covers.get(choice.id)} compact optionNumber={index + 1} order={orders.find(order => order.planId === choice.id)} recommended={choice.id === result.recommendedPlanId} />
        : <AgentSuggestionCard suggestion={choice} labels={labels.get(choice.id)} cover={covers.get(choice.id)} compact optionNumber={index + 1} order={orders.find(order => order.planId === choice.id)} />}
    </div>)}</div>
    {choices.length ? <div className="flex flex-wrap gap-3">
      <button className="btn" disabled={busy || !complete || leaders.length < 2 || !!winner}
        onClick={() => run(() => spin({ runId }))}>Break the tie: spin</button>
    </div> : null}
    {error ? <p className="error" role="alert">{error}</p> : null}
  </div>;
}
