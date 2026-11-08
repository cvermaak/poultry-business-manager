/**
 * Normalize only an epoch-millisecond value selected by SQL, never a naive
 * TIMESTAMP string. MySQL may return UNIX_TIMESTAMP(...) * 1000 as a decimal
 * string (including a zero-only fractional part).
 */
export function normalizeAuditEpochMs(value: unknown): string | null {
  if (
    typeof value !== "number" &&
    (typeof value !== "string" || /^-?\d+(?:\.0+)?$/.exec(value)?.[0] !== value)
  ) {
    return null;
  }

  const milliseconds = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(milliseconds)) return null;

  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
