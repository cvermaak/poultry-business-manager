import React from "react";
import { formatAuditTimestamp, parseAuditInstant, type AuditTimestamp as TimestampValue } from "@/lib/audit-time";

export function AuditTimestamp({
  value,
  timezone,
  timezoneError = false,
}: {
  value: TimestampValue;
  timezone?: string;
  timezoneError?: boolean;
}) {
  if (timezoneError) return <span>Timezone unavailable</span>;
  if (!timezone) return <span>Loading timezone...</span>;
  const instant = parseAuditInstant(value);
  return (
    <time dateTime={instant?.toISOString()}>
      {formatAuditTimestamp(value, timezone)}
    </time>
  );
}
