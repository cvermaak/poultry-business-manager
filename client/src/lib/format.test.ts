import { describe, it, expect } from "vitest";
import { formatCents, formatRand, formatNumber, formatWeight } from "./format";

describe("formatRand", () => {
  it("formats whole thousands with space separator", () => {
    expect(formatRand(89050)).toBe("R89 050.00");
  });

  it("formats values under 1000 without separator", () => {
    expect(formatRand(250)).toBe("R250.00");
  });

  it("formats millions correctly", () => {
    expect(formatRand(1234567.89)).toBe("R1 234 567.89");
  });

  it("formats zero", () => {
    expect(formatRand(0)).toBe("R0.00");
  });

  it("handles string input", () => {
    expect(formatRand("35150")).toBe("R35 150.00");
  });

  it("handles null/undefined gracefully", () => {
    expect(formatRand(null)).toBe("R0.00");
    expect(formatRand(undefined)).toBe("R0.00");
  });
});

describe("formatCents", () => {
  it("converts cents to rand correctly", () => {
    expect(formatCents(8905000)).toBe("R89 050.00");
  });

  it("converts small cent values", () => {
    expect(formatCents(25000)).toBe("R250.00");
  });

  it("handles zero", () => {
    expect(formatCents(0)).toBe("R0.00");
  });
});

describe("formatNumber", () => {
  it("formats with space thousands and dot decimal", () => {
    expect(formatNumber(35150)).toBe("35 150.00");
  });

  it("respects custom decimal places", () => {
    expect(formatNumber(1.5, 3)).toBe("1.500");
  });

  it("handles string input", () => {
    expect(formatNumber("1234.5")).toBe("1 234.50");
  });
});

describe("formatWeight", () => {
  it("formats weight with unit", () => {
    expect(formatWeight(2.345, "kg", 3)).toBe("2.345 kg");
  });

  it("uses default kg unit", () => {
    expect(formatWeight(1.5)).toBe("1.50 kg");
  });
});
