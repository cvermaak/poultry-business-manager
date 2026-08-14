import { describe, expect, it } from "vitest";
import { validateStressPackAdministration } from "./stress-pack-administration";

describe("stress-pack administration controls", () => {
  const now = new Date("2026-08-14T12:00:00.000Z");

  it("allows a recorded administration for an active schedule", () => {
    expect(validateStressPackAdministration({
      status: "active",
      quantityUsed: "5 kg in drinking water",
      administeredAt: new Date("2026-08-14T10:30:00.000Z"),
      now,
    })).toEqual({ ok: true });
  });

  it("blocks duplicate or cancelled schedule administrations", () => {
    expect(validateStressPackAdministration({
      status: "completed",
      quantityUsed: "5 kg",
      administeredAt: now,
      now,
    })).toEqual({ ok: false, error: "Only scheduled or active stress-pack periods can be administered." });
    expect(validateStressPackAdministration({
      status: "cancelled",
      quantityUsed: "5 kg",
      administeredAt: now,
      now,
    })).toEqual({ ok: false, error: "Only scheduled or active stress-pack periods can be administered." });
  });

  it("requires a quantity and prevents future administration records", () => {
    expect(validateStressPackAdministration({
      status: "scheduled",
      quantityUsed: "   ",
      administeredAt: now,
      now,
    })).toEqual({ ok: false, error: "Quantity used is required when recording a stress-pack administration." });
    expect(validateStressPackAdministration({
      status: "scheduled",
      quantityUsed: "5 kg",
      administeredAt: new Date("2026-08-14T12:01:00.000Z"),
      now,
    })).toEqual({ ok: false, error: "Administration time cannot be in the future." });
  });
});
