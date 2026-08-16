import { describe, expect, it } from "vitest";
import { normalizeHealthRecordNotes } from "./health-record-notes";

describe("normalizeHealthRecordNotes", () => {
  it("preserves meaningful additional notes for the Health Record save payload", () => {
    expect(normalizeHealthRecordNotes("Birds remained active after treatment.")).toBe(
      "Birds remained active after treatment."
    );
  });

  it("uses null to explicitly clear an existing additional-notes value", () => {
    expect(normalizeHealthRecordNotes("   ")).toBeNull();
  });
});
