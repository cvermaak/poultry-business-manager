import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { calculateHouseCapacity, validateDensity } from "./house-capacity";

const routersPath = resolve(process.cwd(), "server/routers.ts");

describe("house capacity calculation", () => {
  it("calculates the reported 1,400 m² closed-house placement capacity without a divide-by-ten error", () => {
    const result = calculateHouseCapacity({
      floorArea: 1400,
      houseType: "closed",
      densityKgPerSqm: 38,
      targetSlaughterWeight: 1.9,
      mortalityRate: 4,
    });

    expect(result.totalKgCapacity).toBe(53200);
    expect(result.finishedBirds).toBe(28000);
    expect(result.placementCapacity).toBe(29166);
  });

  it("rejects density outside the safe range for the selected house type", () => {
    expect(validateDensity("closed", 41)).toEqual({
      valid: false,
      message: "Density 41 kg/m² exceeds safe maximum of 40 kg/m² for closed houses",
    });
  });

  it("keeps automatic capacity optional on create and recalculates it on capacity-driver updates", () => {
    const routerSource = readFileSync(routersPath, "utf8");

    expect(routerSource).toContain("capacity: z.number().int().positive().optional()");
    expect(routerSource).toContain("capacity: input.capacity ?? capacityCalculation.placementCapacity");
    expect(routerSource).toContain("const recalculationRequired = length !== undefined");
    expect(routerSource).toContain("else if (capacityCalculation) data.capacity = capacityCalculation.placementCapacity");
    expect(routerSource).toContain("const densityValidation = validateDensity(effectiveHouseType, effectiveDensity)");
  });
});
