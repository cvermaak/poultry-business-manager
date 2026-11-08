import { describe, expect, it } from "vitest";
import { normalizeAuditEpochMs } from "./audit-time";

const instant = "2026-11-08T17:14:09.123Z";
const epochMs = Date.parse(instant);

describe("normalizeAuditEpochMs", () => {
  it.each([epochMs, String(epochMs), `${epochMs}.000000`])(
    "normalizes the SQL epoch value %s to canonical UTC",
    value => {
      expect(normalizeAuditEpochMs(value)).toBe(instant);
    },
  );

  it("preserves Unix epoch zero instead of treating it as missing", () => {
    expect(normalizeAuditEpochMs(0)).toBe("1970-01-01T00:00:00.000Z");
    expect(normalizeAuditEpochMs("0.000000")).toBe("1970-01-01T00:00:00.000Z");
    expect(normalizeAuditEpochMs(-1)).toBe("1969-12-31T23:59:59.999Z");
  });

  it.each([
    null,
    undefined,
    "",
    " ",
    false,
    true,
    {},
    [],
    new Date(instant),
    "2026-11-08 17:14:09",
    instant,
    "2026-11-08T19:14:09.123+02:00",
    "0000-00-00 00:00:00",
    "not-a-timestamp",
    "NaN",
    "Infinity",
    "1e12",
    "0x1000",
    ` ${epochMs}`,
    `${epochMs} `,
    `${epochMs}\n`,
    `${epochMs}junk`,
    `${epochMs}.1`,
    `${epochMs}.000000001`,
    `${epochMs}.`,
    `+${epochMs}`,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    1.25,
    Number.MAX_SAFE_INTEGER + 1,
    "9007199254740993",
    8640000000000001,
    -8640000000000001,
  ])("returns null for invalid or ambiguous input %s without throwing", value => {
    expect(normalizeAuditEpochMs(value)).toBeNull();
  });
});
