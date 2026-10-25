import { useEffect, useRef, useState, type ReactNode } from "react";
import { DEFAULT_PREFERENCES, type AccountContext } from "../accountContextState";
import { stopTimeWarning } from "../../../shared/outingTiming";

const DIETARY_CHOICES = [
  ["vegetarian", "Vegetarian"], ["vegan", "Vegan"], ["halal", "Halal"], ["gluten_free", "Gluten-free"], ["kosher", "Kosher"],
] as const;

export function PreferenceFields({ value, onChange, prefix = "needs", budgetCeiling, children }: {
  value: AccountContext;
  onChange: (value: AccountContext) => void;
  prefix?: string;
  budgetCeiling?: number | null;
  children?: ReactNode;
}) {
  const [allergyText, setAllergyText] = useState(value.allergies.join(", "));
  const lastAllergies = useRef(value.allergies.join(", "));
  const allergyValue = value.allergies.join(", ");
  useEffect(() => {
    if (allergyValue !== lastAllergies.current) { setAllergyText(allergyValue); lastAllergies.current = allergyValue; }
  }, [allergyValue]);
  const update = (patch: Partial<AccountContext>) => onChange({ ...value, ...patch });
  const flexibleBudget = value.budgetMaxPerPerson === null;
  const flexibleTime = value.maxOutingMinutes === null;
  const timeWarning = stopTimeWarning(value.preferredStops, value.maxOutingMinutes);
  const warningId = `${prefix}-time-warning`;
  return <div className="preference-grid">
    <fieldset className="preference-field">
      <legend className={`font-bold${flexibleBudget ? "" : " required-label"}`}>Outing budget{!flexibleBudget ? <><span aria-hidden="true"> *</span><span className="sr-only"> (required)</span></> : null}</legend>
      <p className="muted">Your total across all stops.</p>
      <label className="check"><input type="checkbox" aria-label="Flexible budget: I'm down for whatever" disabled={budgetCeiling != null} checked={flexibleBudget}
        onChange={e => update({ budgetMaxPerPerson: e.target.checked ? null : budgetCeiling ?? DEFAULT_PREFERENCES.budgetMaxPerPerson })} />I'm down for whatever</label>
        <div className="preference-slider-row">
        <input id={`${prefix}-budget`} className="range-input" type="range" min="0" max={budgetCeiling ?? Math.max(100, value.budgetMaxPerPerson ?? 30)} step="1" disabled={flexibleBudget}
          aria-label="Total outing budget" value={value.budgetMaxPerPerson ?? 30} onChange={e => update({ budgetMaxPerPerson: Number(e.target.value) })} />
        <label className="preference-number">$<input id={`${prefix}-budget-number`} className="input" aria-label="Exact budget in dollars" type="number" min="0" max={budgetCeiling ?? 10000} step="0.01"
            disabled={flexibleBudget} required={!flexibleBudget} placeholder="—" value={value.budgetMaxPerPerson ?? ""} onChange={e => update({ budgetMaxPerPerson: Math.min(budgetCeiling ?? 10000, Math.max(0, Number(e.target.value))) })} /></label></div>
        {value.budgetMaxPerPerson === 0 ? <p className="muted">Free stops only.</p> : null}
      {budgetCeiling != null ? <p className="muted">Current cap: ${budgetCeiling}. Accept an offer to raise it.</p> : null}
    </fieldset>
    <fieldset className="preference-field">
      <legend className={`font-bold${flexibleTime ? "" : " required-label"}`}>Time available{!flexibleTime ? <><span aria-hidden="true"> *</span><span className="sr-only"> (required)</span></> : null}</legend>
      <p className="muted">Including travel between stops.</p>
      <label className="check"><input type="checkbox" aria-label="Flexible time: I'm down for whatever" checked={flexibleTime}
        onChange={e => update({ maxOutingMinutes: e.target.checked ? null : DEFAULT_PREFERENCES.maxOutingMinutes })} />I'm down for whatever</label>
        <div className="preference-slider-row">
        <input id={`${prefix}-duration`} className="range-input" type="range" min="0" max={Math.max(480, value.maxOutingMinutes ?? 180)} step="15" disabled={flexibleTime}
          aria-label="Maximum outing duration" aria-describedby={timeWarning ? warningId : undefined} value={value.maxOutingMinutes ?? 180} onChange={e => update({ maxOutingMinutes: Number(e.target.value) })} />
        <label className="preference-number"><input id={`${prefix}-duration-number`} className="input" aria-label="Exact duration in minutes" type="number" min="0" max="1440" step="1"
            disabled={flexibleTime} required={!flexibleTime} aria-describedby={timeWarning ? warningId : undefined} placeholder="—" value={value.maxOutingMinutes ?? ""} onChange={e => update({ maxOutingMinutes: Math.max(0, Number(e.target.value)) })} />min</label></div>
      {timeWarning ? <p id={warningId} className="outing-time-warning" role="status">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></svg>
        <span>{timeWarning}</span>
      </p> : null}
    </fieldset>
    <fieldset className="preference-field">
      <legend className="font-bold">Stops</legend>
      <div className="stop-choices">{[null, 1, 2, 3, 4, 5].map(n => <label key={n ?? "flexible"} className={`diet-chip ${value.preferredStops === n ? "selected" : ""}`}>
        <input type="radio" name={`${prefix}-stops`} aria-label={n === null ? "Flexible number of stops" : `${n} stop${n === 1 ? "" : "s"}`} checked={value.preferredStops === n} onChange={() => update({ preferredStops: n })} />{n ?? "Any"}
      </label>)}</div>
      <p className="muted">One meal, or make a day of it.</p>
    </fieldset>
    <fieldset className="preference-field"><legend className="font-bold">Dietary needs</legend>
      <div className="dietary-choices">{DIETARY_CHOICES.map(([id, label]) => <label key={id} className={`diet-chip ${value.dietary.includes(id) ? "selected" : ""}`}>
        <input type="checkbox" checked={value.dietary.includes(id)} onChange={e => update({ dietary: e.target.checked ? [...value.dietary, id] : value.dietary.filter(d => d !== id) })} />{label}
      </label>)}</div>
    </fieldset>
    <div className="preference-extra"><label className="block font-bold" htmlFor={`${prefix}-allergies`}>Allergies (optional)</label>
      <input id={`${prefix}-allergies`} className="input" placeholder="For example: peanuts, shellfish" maxLength={400}
        value={allergyText} onChange={e => {
          setAllergyText(e.target.value);
          const empty = ["none", "no allergies", "no known allergies", "n/a"].includes(e.target.value.trim().toLowerCase());
          const allergies = empty ? [] : e.target.value.split(",").map(s => s.trim()).filter(Boolean);
          lastAllergies.current = allergies.join(", "); update({ allergies });
        }} />
      <p className="muted">Separate with commas.</p>
    </div>
    {children}
  </div>;
}
