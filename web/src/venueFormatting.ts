const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
export function dollars(value: number) { return money.format(value); }

// Some scraped menus use all caps. Keep the source data and mixed-case names
// intact; soften only the all-caps labels we display.
export function displayMenuItem(value: string) {
  const name = value.trim();
  return name === name.toLocaleUpperCase() && name !== name.toLocaleLowerCase()
    ? name.toLocaleLowerCase().replace(/\p{L}/u, letter => letter.toLocaleUpperCase())
    : name;
}

// The wire contract and native time inputs remain HH:mm; only labels change.
export function displayTime(value: string | null | undefined) {
  if (!value) return "";
  const clock = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!clock) return value;
  const hour = Number(clock[1]);
  return `${hour % 12 || 12}:${clock[2]} ${hour >= 12 ? "PM" : "AM"}`;
}

export function displayTimesInText(value: string) {
  return value.replace(/\b(?:[01]\d|2[0-3]):[0-5]\d\b/g, clock => displayTime(clock));
}
