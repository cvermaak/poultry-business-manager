import { describe, expect, it } from "vitest";
import { buildStressPackCreateInput, buildVaccineCreateInput } from "./health-library-inputs";

function formData(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("Health library creation input builders", () => {
  it("creates an explicit vaccine payload from the selected values and form fields", () => {
    const result = buildVaccineCreateInput(
      formData({
        name: "  ND Clone 30  ",
        brand: "  Intervet  ",
        dosagePerBird: "1 dose",
        boosterIntervalDays: "21",
        withdrawalPeriodDays: "0",
        shelfLifeDays: "365",
      }),
      { diseaseType: "newcastle_disease", vaccineType: "live", applicationMethod: "drinking_water" },
    );

    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({
        name: "ND Clone 30",
        brand: "Intervet",
        diseaseType: "newcastle_disease",
        vaccineType: "live",
        applicationMethod: "drinking_water",
        boosterIntervalDays: 21,
        withdrawalPeriodDays: 0,
        shelfLifeDays: 365,
      }),
    });
  });

  it("rejects incomplete vaccine selections before a mutation is requested", () => {
    const result = buildVaccineCreateInput(
      formData({ name: "ND Clone 30", brand: "Intervet" }),
      { diseaseType: "", vaccineType: "live", applicationMethod: "" },
    );

    expect(result).toEqual({ ok: false, error: "Select a disease type." });
  });

  it("creates a validated stress-pack payload and rejects invalid price formats", () => {
    const valid = buildStressPackCreateInput(
      formData({ name: "Electrolyte Support", brand: "AFGRO", recommendedDurationDays: "3", costPerKg: "450.00" }),
      "double",
    );
    const invalid = buildStressPackCreateInput(
      formData({ name: "Electrolyte Support", brand: "AFGRO", recommendedDurationDays: "3", costPerKg: "R450" }),
      "double",
    );

    expect(valid).toEqual({
      ok: true,
      data: expect.objectContaining({ recommendedDurationDays: 3, dosageStrength: "double", costPerKg: "450.00" }),
    });
    expect(invalid).toEqual({ ok: false, error: "Cost per kg must be a non-negative amount with up to two decimal places." });
  });
});
