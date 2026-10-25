import { useId } from "react";
import { SUPPORTED_CITIES } from "../../../shared/cities";
export default function CityPicker({ value, onChange, disabled = false }: {
  value: string; onChange: (value: string) => void; disabled?: boolean;
}) {
  const id = useId();
  return <label className="block space-y-2"><span className="font-bold">Your city</span>
    <input className="input w-full" list={id} value={value} disabled={disabled} maxLength={60}
      placeholder="Any city — type or select" autoComplete="off" onChange={event => onChange(event.target.value)} />
    <datalist id={id}>{SUPPORTED_CITIES.map(city => <option key={city} value={city} />)}</datalist>
  </label>;
}
