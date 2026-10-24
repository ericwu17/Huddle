const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const observed = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/Los_Angeles" });

export function dollars(value: number) { return money.format(value); }
export function observedDate(value: string) { return observed.format(new Date(value)); }
