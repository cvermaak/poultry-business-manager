/** Audit instants must carry an explicit offset (or be epoch milliseconds).
 * Never guess the timezone of an old database wall-clock string.
 */
export type AuditTimestamp = string | number | Date | null | undefined;

export function parseAuditInstant(value: AuditTimestamp): Date | null {
  if (value == null || (typeof value === "string" && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value))) {
    return null;
  }
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function auditTimezoneLabel(timezone: string): string | null {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return timezone === "Africa/Johannesburg" ? "SAST" : timezone;
  } catch {
    return null;
  }
}

export function formatAuditTimestamp(value: AuditTimestamp, timezone: string): string {
  const date = parseAuditInstant(value);
  if (!date) return "Timestamp unavailable";
  const label = auditTimezoneLabel(timezone);
  if (!label) return "Timezone unavailable";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return `${values.month} ${values.day}, ${values.year} at ${values.hour}:${values.minute} ${values.dayPeriod} ${label}`;
}

/** "Today" means the company calendar day, not the previous 24 hours. */
export function matchesAuditDateRange(
  value: AuditTimestamp,
  range: string,
  timezone: string,
  now: Date = new Date(),
): boolean {
  if (range === "all") return true;
  const date = parseAuditInstant(value);
  if (!date || !Number.isFinite(now.getTime()) || !auditTimezoneLabel(timezone)) return false;
  if (range === "today") {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    });
    return formatter.format(date) === formatter.format(now);
  }
  const days = range === "week" ? 7 : range === "month" ? 30 : null;
  if (days == null) return true;
  const elapsed = now.getTime() - date.getTime();
  return elapsed >= 0 && elapsed <= days * 24 * 60 * 60 * 1000;
}
