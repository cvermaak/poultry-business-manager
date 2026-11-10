const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
/** Operational date labels are not instants and must not be timezone-shifted. */
export function isProductionDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_KEY.test(value)) return false;
  const year = Number(value.slice(0, 4));
  if (year < 1000 || year > 9999) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
export function productionDayDifference(start: string, end: string): number {
  if (!isProductionDate(start) || !isProductionDate(end)) throw new Error("Invalid operational date.");
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000);
}
export function productionToday(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value;
  const key = `${get("year")}-${get("month")}-${get("day")}`;
  if (!isProductionDate(key)) throw new Error("Company timezone date is unavailable.");
  return key;
}
