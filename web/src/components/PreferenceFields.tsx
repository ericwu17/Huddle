import { useEffect, useRef, useState } from "react";
import type { AccountContext } from "../accountData";

const DIETARY_CHOICES = [
  ["vegetarian", "Vegetarian"], ["vegan", "Vegan"], ["halal", "Halal"], ["gluten_free", "Gluten-free"], ["kosher", "Kosher"],
] as const;

export function PreferenceFields({ value, onChange, prefix = "needs", budgetCeiling }: {
  value: AccountContext;
  onChange: (value: AccountContext) => void;
  prefix?: string;
  budgetCeiling?: number | null;
}) {
  const [allergyText, setAllergyText] = useState(value.allergies.join(", "));
  const lastAllergies = useRef(value.allergies.join(", "));
  const allergyValue = value.allergies.join(", ");
  useEffect(() => {
    if (allergyValue !== lastAllergies.current) { setAllergyText(allergyValue); lastAllergies.current = allergyValue; }
  }, [allergyValue]);
  const update = (patch: Partial<AccountContext>) => onChange({ ...value, ...patch });
  return <div className="space-y-5">
    <fieldset className="preference-field space-y-3">
      <legend className="font-bold">Whole-outing budget</legend>
      <p className="muted">Your private maximum per person, including every stop.</p>
      <label className="check"><input type="checkbox" disabled={budgetCeiling != null} checked={value.budgetMaxPerPerson !== null}
        onChange={e => update({ budgetMaxPerPerson: e.target.checked ? budgetCeiling ?? 30 : null })} />Set a budget limit</label>
      {value.budgetMaxPerPerson === null ? <p className="sticker">Flexible</p> : <>
        <label className="flex items-center justify-between gap-4" htmlFor={`${prefix}-budget`}>My total cap <output className="sticker sticker-sun">${value.budgetMaxPerPerson}</output></label>
        <input id={`${prefix}-budget`} className="range-input" type="range" min="0" max={budgetCeiling ?? Math.max(100, value.budgetMaxPerPerson)} step="1"
          value={value.budgetMaxPerPerson} onChange={e => update({ budgetMaxPerPerson: Number(e.target.value) })} />
        <div className="flex items-center gap-3"><label htmlFor={`${prefix}-budget-number`}>Exact amount ($)</label>
          <input id={`${prefix}-budget-number`} className="input max-w-28" type="number" min="0" max={budgetCeiling ?? 10000} step="0.01"
            value={value.budgetMaxPerPerson} onChange={e => update({ budgetMaxPerPerson: Math.min(budgetCeiling ?? 10000, Math.max(0, Number(e.target.value))) })} /></div>
        <p className="muted">$0 means free stops only.</p>
      </>}
      {budgetCeiling != null ? <p className="muted">Your current outing cap is ${budgetCeiling}. Raising or removing it requires your explicit acceptance of a private trade offer.</p> : null}
    </fieldset>
    <fieldset className="preference-field space-y-3">
      <legend className="font-bold">Time available</legend>
      <p className="muted">The whole outing, including time between stops.</p>
      <label className="check"><input type="checkbox" checked={value.maxOutingMinutes !== null}
        onChange={e => update({ maxOutingMinutes: e.target.checked ? 180 : null })} />Set a time limit</label>
      {value.maxOutingMinutes === null ? <p className="sticker">Flexible</p> : <>
        <label className="flex items-center justify-between gap-4" htmlFor={`${prefix}-duration`}>Maximum duration <output className="sticker sticker-sun">{value.maxOutingMinutes} min</output></label>
        <input id={`${prefix}-duration`} className="range-input" type="range" min="0" max={Math.max(480, value.maxOutingMinutes)} step="15"
          value={value.maxOutingMinutes} onChange={e => update({ maxOutingMinutes: Number(e.target.value) })} />
        <div className="flex items-center gap-3"><label htmlFor={`${prefix}-duration-number`}>Exact duration (min)</label>
          <input id={`${prefix}-duration-number`} className="input max-w-28" type="number" min="0" max="1440" step="1"
            value={value.maxOutingMinutes} onChange={e => update({ maxOutingMinutes: Math.max(0, Number(e.target.value)) })} /></div>
      </>}
    </fieldset>
    <fieldset className="preference-field space-y-3">
      <legend className="font-bold">Number of stops</legend>
      <p className="muted">The group plan aims for the average of everyone's choice. 1 is a meal; 2 adds dessert or an activity; 3 is a meal, activity and dessert.</p>
      <label className="check"><input type="checkbox" checked={value.preferredStops !== null}
        onChange={e => update({ preferredStops: e.target.checked ? 2 : null })} />Choose a number of stops</label>
      {value.preferredStops === null ? <p className="sticker">Flexible</p> :
        <div className="flex flex-wrap gap-2">{[1, 2, 3].map(n => <label key={n} className={`diet-chip ${value.preferredStops === n ? "selected" : ""}`}>
          <input type="radio" name={`${prefix}-stops`} checked={value.preferredStops === n} onChange={() => update({ preferredStops: n })} />{n} stop{n === 1 ? "" : "s"}
        </label>)}</div>}
    </fieldset>
    <fieldset className="space-y-3"><legend className="font-bold">Dietary requirements</legend>
      <p className="muted">Leave unselected if you are open to anything. These are requirements, not cuisine preferences.</p>
      <div className="flex flex-wrap gap-2">{DIETARY_CHOICES.map(([id, label]) => <label key={id} className={`diet-chip ${value.dietary.includes(id) ? "selected" : ""}`}>
        <input type="checkbox" checked={value.dietary.includes(id)} onChange={e => update({ dietary: e.target.checked ? [...value.dietary, id] : value.dietary.filter(d => d !== id) })} />{label}
      </label>)}</div>
    </fieldset>
    <div className="space-y-2"><label className="block font-bold" htmlFor={`${prefix}-allergies`}>Allergies (optional)</label>
      <input id={`${prefix}-allergies`} className="input" placeholder="For example: peanuts, shellfish" maxLength={400}
        value={allergyText} onChange={e => {
          setAllergyText(e.target.value);
          const empty = ["none", "no allergies", "no known allergies", "n/a"].includes(e.target.value.trim().toLowerCase());
          const allergies = empty ? [] : e.target.value.split(",").map(s => s.trim()).filter(Boolean);
          lastAllergies.current = allergies.join(", "); update({ allergies });
        }} />
      <p className="muted">Separate allergens with commas. A venue needs verified evidence before it can be marked safe for an allergy.</p>
    </div>
  </div>;
}
