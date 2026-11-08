import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { AuditTimestamp } from "../components/AuditTimestamp";
import { auditTimezoneLabel, formatAuditTimestamp, matchesAuditDateRange, parseAuditInstant } from "./audit-time";

const originalTimezone = process.env.TZ;
afterEach(() => { if (originalTimezone === undefined) delete process.env.TZ; else process.env.TZ = originalTimezone; });
const reportedInstant = "2026-11-08T14:57:24.000Z";

describe("audit company-timezone formatting", () => {
  it.each(["UTC", "Africa/Johannesburg", "America/New_York"])("shows the reported SAST time regardless of host timezone %s", zone => {
    process.env.TZ = zone;
    expect(formatAuditTimestamp(reportedInstant, "Africa/Johannesburg")).toBe("Nov 8, 2026 at 4:57 PM SAST");
  });
  it("respects an explicit source offset without converting twice", () => {
    expect(formatAuditTimestamp("2026-11-08T16:57:24+02:00", "Africa/Johannesburg")).toBe("Nov 8, 2026 at 4:57 PM SAST");
  });
  it("formats an epoch and a Date as the same instant", () => {
    const date = new Date(reportedInstant);
    expect(formatAuditTimestamp(date.getTime(), "Africa/Johannesburg")).toBe(formatAuditTimestamp(date, "Africa/Johannesburg"));
    expect(date.toISOString()).toBe(reportedInstant);
  });
  it("does not hard-code a two-hour adjustment", () => {
    expect(formatAuditTimestamp(reportedInstant, "UTC")).toBe("Nov 8, 2026 at 2:57 PM UTC");
    expect(formatAuditTimestamp(reportedInstant, "America/New_York")).toBe("Nov 8, 2026 at 9:57 AM America/New_York");
  });
  it("respects daylight-saving changes for a non-SAST company", () => {
    expect(formatAuditTimestamp("2026-07-08T14:57:24Z", "America/New_York")).toContain("10:57 AM");
    expect(formatAuditTimestamp("2026-11-08T14:57:24Z", "America/New_York")).toContain("9:57 AM");
  });
  it("uses company date at a UTC day boundary", () => {
    expect(formatAuditTimestamp("2026-11-08T22:05:00Z", "Africa/Johannesburg")).toBe("Nov 9, 2026 at 12:05 AM SAST");
  });
  it("uses 12-hour midnight and noon", () => {
    expect(formatAuditTimestamp("2026-11-08T22:00:00Z", "Africa/Johannesburg")).toContain("12:00 AM");
    expect(formatAuditTimestamp("2026-11-08T10:00:00Z", "Africa/Johannesburg")).toContain("12:00 PM");
  });
  it.each([null, undefined, "", "not a date", "2026-11-08", "2026-11-08 14:57:24", "2026-11-08T14:57:24", NaN, Infinity])("does not guess an invalid or ambiguous timestamp (%s)", value => {
    expect(parseAuditInstant(value)).toBeNull();
    expect(formatAuditTimestamp(value, "Africa/Johannesburg")).toBe("Timestamp unavailable");
  });
  it("reports invalid company zones instead of silently displaying UTC", () => {
    expect(auditTimezoneLabel("Not/AZone")).toBeNull();
    expect(formatAuditTimestamp(reportedInstant, "Not/AZone")).toBe("Timezone unavailable");
  });
  it("keeps epoch zero valid", () => {
    expect(parseAuditInstant(0)?.toISOString()).toBe("1970-01-01T00:00:00.000Z");
  });
});

describe("audit date filters use the company calendar", () => {
  const now = new Date("2026-11-08T22:30:00Z");
  it("includes the same company day across the UTC boundary", () => {
    expect(matchesAuditDateRange("2026-11-08T22:05:00Z", "today", "Africa/Johannesburg", now)).toBe(true);
    expect(matchesAuditDateRange("2026-11-08T21:59:59Z", "today", "Africa/Johannesburg", now)).toBe(false);
  });
  it("does not treat the previous 24 hours as today", () => {
    expect(matchesAuditDateRange("2026-11-08T14:57:24Z", "today", "Africa/Johannesburg", now)).toBe(false);
  });
  it.each(["UTC", "Africa/Johannesburg", "America/New_York"])("is host-independent in %s", zone => {
    process.env.TZ = zone;
    expect(matchesAuditDateRange("2026-11-08T22:05:00Z", "today", "Africa/Johannesburg", now)).toBe(true);
  });
  it("keeps All Time records visible when a timestamp is unavailable", () => {
    expect(matchesAuditDateRange(null, "all", "Africa/Johannesburg", now)).toBe(true);
    expect(matchesAuditDateRange(null, "today", "Africa/Johannesburg", now)).toBe(false);
  });
  it("bounds rolling week/month and rejects future entries", () => {
    expect(matchesAuditDateRange("2026-11-02T22:30:00Z", "week", "Africa/Johannesburg", now)).toBe(true);
    expect(matchesAuditDateRange("2026-10-31T22:30:00Z", "week", "Africa/Johannesburg", now)).toBe(false);
    expect(matchesAuditDateRange("2026-10-10T22:30:00Z", "month", "Africa/Johannesburg", now)).toBe(true);
    expect(matchesAuditDateRange("2026-11-09T22:30:00Z", "week", "Africa/Johannesburg", now)).toBe(false);
  });
});

describe("shared audit timestamp component", () => {
  it("renders a semantic UTC instant with a SAST label and no malformed tokens", () => {
    const markup = renderToStaticMarkup(React.createElement(AuditTimestamp, {value: reportedInstant, timezone: "Africa/Johannesburg"}));
    expect(markup).toContain('dateTime="2026-11-08T14:57:24.000Z"');
    expect(markup).toContain("Nov 8, 2026 at 4:57 PM SAST");
    expect(markup).not.toContain("\\PM");
    expect(markup).not.toContain("179414");
  });
  it("does not temporarily display browser time while company settings load", () => {
    expect(renderToStaticMarkup(React.createElement(AuditTimestamp, {value: reportedInstant}))).toContain("Loading timezone...");
  });
  it("makes settings failure visible instead of showing a misleading timezone", () => {
    expect(renderToStaticMarkup(React.createElement(AuditTimestamp, {value: reportedInstant, timezoneError: true}))).toContain("Timezone unavailable");
  });
});

describe("audit views share the approved contract", () => {
  it.each(["AuditLogs", "FlockDetail"])("uses the safe timezone endpoint and shared renderer in %s", name => {
    const source = readFileSync(`client/src/pages/${name}.tsx`, "utf8");
    expect(source).toContain("trpc.system.getDisplayTimezone.useQuery()");
    expect(source).toContain("<AuditTimestamp value={log.createdAt}");
    expect(source).not.toContain("companySettings.get.useQuery");
    expect(source).not.toContain("new Date(log.createdAt)");
  });
  it("does not mistake unavailable date-filter results for missing audit history", () => {
    const source = readFileSync("client/src/pages/AuditLogs.tsx", "utf8");
    expect(source).toContain("matchesAuditDateRange(log.createdAt");
    expect(source).toContain("Company timezone unavailable.");
    expect(source).toContain("Date-filter results unavailable until the company timezone is loaded.");
  });
});
