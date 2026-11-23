import { describe, expect, it } from "vitest";
import { getTargetWeight, getTargetGrowthCurve, calculatePerformanceDeviation, getPerformanceStatus, validateTargetWeight } from "../shared/breed-growth";

const rossAnchors = [[0, .044], [7, .213], [14, .533], [21, 1.012], [28, 1.616], [35, 2.296], [42, 2.998], [49, 3.681], [56, 4.318]] as const;
const legacy = {
  cobb_500: { 0: .042, 7: .175, 14: .480, 21: .950, 28: 1.540, 35: 2.215, 42: 2.970, 49: 3.800 },
  arbor_acres: { 0: .042, 7: .168, 14: .458, 21: .910, 28: 1.480, 35: 2.145, 42: 2.900, 49: 3.720 },
} as const;
function originalWeight(day: number, curve: Record<number, number>) {
  if (curve[day] !== undefined) return curve[day];
  const days = Object.keys(curve).map(Number).sort((a, b) => a - b);
  if (day < days[0]) return curve[days[0]];
  if (day > days[days.length - 1]) {
    const last = days[days.length - 1], prior = days[days.length - 2];
    const gain = (curve[last] - curve[prior]) / (last - prior);
    return curve[last] + (day - last) * gain;
  }
  for (let i = 0; i < days.length - 1; i++) {
    const low = days[i], high = days[i + 1];
    if (day >= low && day <= high) {
      const fraction = (day - low) / (high - low);
      return curve[low] + (curve[high] - curve[low]) * fraction;
    }
  }
  return .042;
}

describe("Ross lookup and retained other-breed behaviour", () => {
  it.each(rossAnchors)("uses the published Ross Day %s reference %s kg", (day, weight) => {
    expect(getTargetWeight(day, "ross_308")).toBe(weight);
  });
  it("uses the published Day 10 row rather than interpolation", () => {
    expect(getTargetWeight(10, "ross_308")).toBe(.330);
  });
  it.each([-1, 57, 90, 7.5, NaN, Infinity])("withholds unsupported Ross age %s", day => {
    expect(getTargetWeight(day, "ross_308")).toBeNull();
    expect(calculatePerformanceDeviation(2.998, day, "ross_308")).toBeNull();
  });
  it.each(["cobb_500", "arbor_acres"] as const)("retains every %s legacy half-day result including extrapolation", breed => {
    for (let day = -1; day <= 90; day += .5) expect(getTargetWeight(day, breed)).toBe(originalWeight(day, legacy[breed]));
  });
  it("uses the corrected Ross order without upgrading other-breed references", () => {
    expect(getTargetWeight(42, "ross_308")).toBeGreaterThan(getTargetWeight(42, "cobb_500")!);
    expect(getTargetWeight(42, "cobb_500")).toBeGreaterThan(getTargetWeight(42, "arbor_acres")!);
  });
  it("returns all requested chart ages and null beyond publication", () => {
    const curve = getTargetGrowthCurve(0, 60, "ross_308");
    expect(curve).toHaveLength(61);
    expect(curve[42].targetWeight).toBe(2.998);
    expect(curve[56].targetWeight).toBe(4.318);
    expect(curve.slice(57).every(row => row.targetWeight === null)).toBe(true);
  });
  it.each([[2, 1], [0, 1001], [.5, 42], [0, Infinity]])("rejects invalid chart range %s..%s", (start, end) => {
    expect(getTargetGrowthCurve(start, end)).toEqual([]);
  });
  it("calculates signed actual-versus-objective deviation", () => {
    expect(calculatePerformanceDeviation(2.998, 42)).toBe(0);
    expect(calculatePerformanceDeviation(3.2, 42)).toBeGreaterThan(0);
    expect(calculatePerformanceDeviation(2.8, 42)).toBeLessThan(0);
    expect(calculatePerformanceDeviation(2.9, 42, "ross_308")).toBeLessThan(calculatePerformanceDeviation(2.9, 42, "cobb_500")!);
  });
  it.each([0, -1, NaN, Infinity])("withholds invalid actual weight %s", value => {
    expect(calculatePerformanceDeviation(value, 42)).toBeNull();
  });
  it.each([[5, "ahead"], [4, "on-track"], [-5, "on-track"], [-5.1, "behind"], [-9.9, "behind"], [-10, "critical"], [-15, "critical"], [null, "unavailable"], [NaN, "unavailable"]] as const)("uses the disclosed policy boundary %s → %s", (value, expected) => {
    expect(getPerformanceStatus(value)).toBe(expected);
  });
  it("does not reject a valid lower commercial Ross target using the old ±15% policy", () => {
    const result = validateTargetWeight("ross_308", 42, 1.9);
    expect(result.isRealistic).toBe(true);
    expect(result.expectedWeight).toBe(2.998);
    expect(result.message).toContain("informational application policy");
  });
  it("does not invent an objective for a valid market plan beyond Day 56", () => {
    const result = validateTargetWeight("ross_308", 60, 2.2);
    expect(result.isRealistic).toBe(true);
    expect(result.expectedWeight).toBeNull();
    expect(result.message).toContain("unavailable");
  });
  it.each([[0, 42], [-1, 42], [1.9, 0], [1.9, 42.5], [NaN, 42]])("rejects invalid Ross target/period %s/%s", (weight, age) => {
    expect(validateTargetWeight("ross_308", age, weight).isRealistic).toBe(false);
  });
  it("retains the other-breed advisory validation", () => {
    expect(validateTargetWeight("cobb_500", 42, 2.97).isRealistic).toBe(true);
    expect(validateTargetWeight("arbor_acres", 42, 1.9).isRealistic).toBe(false);
  });
});
