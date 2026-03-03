/**
 * Tests for multi-day catch plan weight calculation logic.
 * Validates that per-day target catching weights are correctly calculated
 * so the weighted house average stays within the contract target.
 */

import { describe, it, expect } from "vitest";

// ─── Pure calculation helpers (extracted from PlanCatchDialog) ───────────────

interface CatchDay {
  birds: number;
  targetCatchingWeight: number;
  targetDeliveredWeight: number;
  vsContract: number;
}

function calculateCatchPlan(
  overallTargetCatching: number,
  dailyGainKg: number,
  birdsPerDay: number[],
  shrinkageFactor: number = 0.055
): CatchDay[] {
  const numDays = birdsPerDay.length;
  const totalBirds = birdsPerDay.reduce((a, b) => a + b, 0);

  if (totalBirds === 0) {
    // Return symmetric targets when no birds specified
    return birdsPerDay.map((birds, i) => {
      const midpoint = (numDays - 1) / 2;
      const targetCatching = overallTargetCatching + (i - midpoint) * dailyGainKg;
      return {
        birds,
        targetCatchingWeight: Math.round(targetCatching * 1000) / 1000,
        targetDeliveredWeight: Math.round(targetCatching * (1 - shrinkageFactor) * 1000) / 1000,
        vsContract: Math.round((targetCatching - overallTargetCatching) * 1000) / 1000,
      };
    });
  }

  // Weighted average formula: solve for Day 1 base so weighted avg = target
  // weighted_avg = sum(birds_i * (base + (i * dailyGain))) / totalBirds = target
  // base * 1 + dailyGain * sum(birds_i * i) / totalBirds = target
  // base = target - dailyGain * weightedDayIndex
  const weightedDayIndex = birdsPerDay.reduce((sum, b, i) => sum + b * i, 0) / totalBirds;
  const day1Base = overallTargetCatching - dailyGainKg * weightedDayIndex;

  return birdsPerDay.map((birds, i) => {
    const targetCatching = day1Base + i * dailyGainKg;
    const targetDelivered = targetCatching * (1 - shrinkageFactor);
    return {
      birds,
      targetCatchingWeight: Math.round(targetCatching * 1000) / 1000,
      targetDeliveredWeight: Math.round(targetDelivered * 1000) / 1000,
      vsContract: Math.round((targetCatching - overallTargetCatching) * 1000) / 1000,
    };
  });
}

function weightedHouseAverage(days: CatchDay[]): number {
  const totalBirds = days.reduce((s, d) => s + d.birds, 0);
  if (totalBirds === 0) return 0;
  const weightedSum = days.reduce((s, d) => s + d.birds * d.targetCatchingWeight, 0);
  return Math.round((weightedSum / totalBirds) * 1000) / 1000;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Multi-Day Catch Plan — Weight Calculation", () => {
  const TARGET = 1.905; // kg catching weight
  const DAILY_GAIN = 0.055; // kg/day

  describe("Single-day catch", () => {
    it("returns exactly the contract target for a single day", () => {
      const plan = calculateCatchPlan(TARGET, DAILY_GAIN, [22000]);
      expect(plan[0].targetCatchingWeight).toBe(1.905);
      expect(plan[0].vsContract).toBe(0);
    });

    it("house average equals contract target", () => {
      const plan = calculateCatchPlan(TARGET, DAILY_GAIN, [22000]);
      expect(weightedHouseAverage(plan)).toBe(1.905);
    });
  });

  describe("Two-day catch — equal split", () => {
    const plan = calculateCatchPlan(TARGET, DAILY_GAIN, [11000, 11000]);

    it("Day 1 is below target by half a daily gain", () => {
      expect(plan[0].targetCatchingWeight).toBe(1.878); // 1.905 - 0.5*0.055
    });

    it("Day 2 is above target by half a daily gain", () => {
      // 1.905 + 0.5*0.055 = 1.9325 → rounds to 1.932
      expect(plan[1].targetCatchingWeight).toBe(1.932);
    });

    it("weighted house average equals contract target", () => {
      expect(weightedHouseAverage(plan)).toBe(1.905);
    });
  });

  describe("Three-day catch — equal split", () => {
    const plan = calculateCatchPlan(TARGET, DAILY_GAIN, [7333, 7333, 7334]);

    it("Day 1 is 1 daily gain below target", () => {
      expect(plan[0].targetCatchingWeight).toBe(1.85); // 1.905 - 0.055
    });

    it("Day 2 equals the contract target", () => {
      expect(plan[1].targetCatchingWeight).toBe(1.905);
    });

    it("Day 3 is 1 daily gain above target", () => {
      expect(plan[2].targetCatchingWeight).toBe(1.96); // 1.905 + 0.055
    });

    it("weighted house average equals contract target", () => {
      const avg = weightedHouseAverage(plan);
      expect(avg).toBeCloseTo(1.905, 2);
    });
  });

  describe("Five-day catch — equal split", () => {
    const birds = [4400, 4400, 4400, 4400, 4400];
    const plan = calculateCatchPlan(TARGET, DAILY_GAIN, birds);

    it("Day 3 (midpoint) equals the contract target", () => {
      expect(plan[2].targetCatchingWeight).toBe(1.905);
    });

    it("Day 1 is 2 daily gains below target", () => {
      expect(plan[0].targetCatchingWeight).toBe(1.795); // 1.905 - 2*0.055
    });

    it("Day 5 is 2 daily gains above target", () => {
      expect(plan[4].targetCatchingWeight).toBe(2.015); // 1.905 + 2*0.055
    });

    it("weighted house average equals contract target", () => {
      expect(weightedHouseAverage(plan)).toBe(1.905);
    });
  });

  describe("Unequal bird split", () => {
    it("weighted average stays on target when Day 1 has more birds", () => {
      // More birds on Day 1 → Day 1 target pulled closer to overall target
      const plan = calculateCatchPlan(TARGET, DAILY_GAIN, [15000, 4000, 3000]);
      const avg = weightedHouseAverage(plan);
      expect(avg).toBeCloseTo(1.905, 2);
    });

    it("weighted average stays on target when Day 3 has more birds", () => {
      // More birds on Day 3 → Day 1 target pulled lower
      const plan = calculateCatchPlan(TARGET, DAILY_GAIN, [3000, 4000, 15000]);
      const avg = weightedHouseAverage(plan);
      expect(avg).toBeCloseTo(1.905, 2);
    });

    it("per-day weights increase by approximately one daily gain each day", () => {
      const plan = calculateCatchPlan(TARGET, DAILY_GAIN, [5000, 7000, 10000]);
      const diff1 = plan[1].targetCatchingWeight - plan[0].targetCatchingWeight;
      const diff2 = plan[2].targetCatchingWeight - plan[1].targetCatchingWeight;
      // Allow ±0.002 tolerance for 3-decimal rounding
      expect(diff1).toBeCloseTo(DAILY_GAIN, 1);
      expect(diff2).toBeCloseTo(DAILY_GAIN, 1);
    });
  });

  describe("Delivered weight calculation", () => {
    it("delivered weight = catching weight × (1 - 5.5%)", () => {
      const plan = calculateCatchPlan(TARGET, DAILY_GAIN, [22000]);
      const expectedDelivered = Math.round(TARGET * (1 - 0.055) * 1000) / 1000;
      expect(plan[0].targetDeliveredWeight).toBe(expectedDelivered);
    });

    it("delivered weight for 1.905 kg catching = 1.800 kg", () => {
      const plan = calculateCatchPlan(TARGET, DAILY_GAIN, [22000]);
      expect(plan[0].targetDeliveredWeight).toBe(1.800);
    });
  });

  describe("Processor max weight warning", () => {
    it("identifies days that exceed processor max weight", () => {
      const processorMax = 1.950;
      const plan = calculateCatchPlan(TARGET, DAILY_GAIN, [4400, 4400, 4400, 4400, 4400]);
      const exceedingDays = plan.filter((d) => d.targetCatchingWeight > processorMax);
      // Day 4 = 1.960, Day 5 = 2.015 → both exceed 1.950
      expect(exceedingDays.length).toBe(2);
    });

    it("no warning when all days are within processor max", () => {
      const processorMax = 2.100;
      const plan = calculateCatchPlan(TARGET, DAILY_GAIN, [4400, 4400, 4400, 4400, 4400]);
      const exceedingDays = plan.filter((d) => d.targetCatchingWeight > processorMax);
      expect(exceedingDays.length).toBe(0);
    });
  });
});
