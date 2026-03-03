/**
 * Tests for rolling reforecast logic.
 * After each catch session completes, remaining days' targets are recalculated
 * so the weighted house average stays on the contract target.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Types (mirror db.ts) ────────────────────────────────────────────────────

interface CatchPlanDay {
  day: number;
  targetBirds: number;
  targetCatchingWeight: number;
  targetDeliveredWeight: number;
  percentOfFlock: number;
  actualBirds?: number;
  actualAvgCatchingWeight?: number;
  actualAvgDeliveredWeight?: number;
  completedAt?: string;
}

interface CatchPlan {
  totalCatchDays: number;
  dailyGainKg: number;
  shrinkagePct: number;
  overallTargetCatchingWeight: number;
  overallTargetDeliveredWeight: number;
  processorMaxCatchingWeight: number | null;
  days: CatchPlanDay[];
  createdAt: string;
  lastUpdatedAt: string;
}

// ─── Pure reforecast function (extracted from db.ts for unit testing) ─────────

function reforecastPlan(
  plan: CatchPlan,
  dayIndex: number,
  actualBirds: number,
  actualAvgCatchingWeight: number,
  completedAt: string
): CatchPlan {
  // Deep clone to avoid mutation
  const updated: CatchPlan = JSON.parse(JSON.stringify(plan));

  // Record actual results for the completed day
  updated.days[dayIndex] = {
    ...updated.days[dayIndex],
    actualBirds,
    actualAvgCatchingWeight,
    actualAvgDeliveredWeight: actualAvgCatchingWeight * (1 - updated.shrinkagePct / 100),
    completedAt,
  };

  // Recalculate remaining days' targets
  const completedDays = updated.days.filter((d) => d.actualBirds !== undefined);
  const remainingDays = updated.days.filter((d) => d.actualBirds === undefined);

  if (remainingDays.length > 0) {
    const usedWeightBudget = completedDays.reduce(
      (sum, d) => sum + d.actualBirds! * d.actualAvgCatchingWeight!,
      0
    );
    const usedBirds = completedDays.reduce((sum, d) => sum + d.actualBirds!, 0);
    const totalBirds = updated.days.reduce((sum, d) => sum + d.targetBirds, 0);
    const totalWeightBudget = updated.overallTargetCatchingWeight * totalBirds;
    const remainingBudget = totalWeightBudget - usedWeightBudget;
    const remainingBirds = totalBirds - usedBirds;
    const remainingAvgTarget =
      remainingBirds > 0
        ? remainingBudget / remainingBirds
        : updated.overallTargetCatchingWeight;

    // Distribute remaining budget across remaining days using daily gain stagger
    const midRemainingIdx = (remainingDays.length - 1) / 2;
    remainingDays.forEach((day, i) => {
      const offset = (i - midRemainingIdx) * updated.dailyGainKg;
      const newTarget = Math.round((remainingAvgTarget + offset) * 1000) / 1000;
      const dayIdx = updated.days.findIndex((d) => d.day === day.day);
      updated.days[dayIdx] = {
        ...updated.days[dayIdx],
        targetCatchingWeight: newTarget,
        targetDeliveredWeight:
          Math.round(newTarget * (1 - updated.shrinkagePct / 100) * 1000) / 1000,
      };
    });
  }

  updated.lastUpdatedAt = new Date().toISOString();
  return updated;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePlan(
  overallTarget: number,
  dailyGain: number,
  birdsPerDay: number[],
  shrinkagePct = 5.5
): CatchPlan {
  const totalBirds = birdsPerDay.reduce((a, b) => a + b, 0);
  const weightedDayIndex =
    birdsPerDay.reduce((sum, b, i) => sum + b * i, 0) / totalBirds;
  const day1Base = overallTarget - dailyGain * weightedDayIndex;

  const days: CatchPlanDay[] = birdsPerDay.map((birds, i) => {
    const target = Math.round((day1Base + i * dailyGain) * 1000) / 1000;
    return {
      day: i + 1,
      targetBirds: birds,
      targetCatchingWeight: target,
      targetDeliveredWeight: Math.round(target * (1 - shrinkagePct / 100) * 1000) / 1000,
      percentOfFlock: Math.round((birds / totalBirds) * 1000) / 10,
    };
  });

  return {
    totalCatchDays: birdsPerDay.length,
    dailyGainKg: dailyGain,
    shrinkagePct,
    overallTargetCatchingWeight: overallTarget,
    overallTargetDeliveredWeight:
      Math.round(overallTarget * (1 - shrinkagePct / 100) * 1000) / 1000,
    processorMaxCatchingWeight: null,
    days,
    createdAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
  };
}

function weightedAvg(days: CatchPlanDay[]): number {
  const totalBirds = days.reduce((s, d) => s + d.targetBirds, 0);
  const weightedSum = days.reduce((s, d) => s + d.targetBirds * d.targetCatchingWeight, 0);
  return weightedSum / totalBirds;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const TARGET = 1.905;
const DAILY_GAIN = 0.055;
const COMPLETED_AT = "2026-03-01T08:00:00.000Z";

describe("Rolling Reforecast — Day 1 completion", () => {
  const plan = makePlan(TARGET, DAILY_GAIN, [11000, 11000]);

  it("records actual birds and weight on completed day", () => {
    const updated = reforecastPlan(plan, 0, 11000, 1.880, COMPLETED_AT);
    expect(updated.days[0].actualBirds).toBe(11000);
    expect(updated.days[0].actualAvgCatchingWeight).toBe(1.880);
    expect(updated.days[0].completedAt).toBe(COMPLETED_AT);
  });

  it("records actual delivered weight (catching × (1 - shrinkage))", () => {
    const updated = reforecastPlan(plan, 0, 11000, 1.880, COMPLETED_AT);
    const expectedDelivered = 1.880 * (1 - 5.5 / 100);
    expect(updated.days[0].actualAvgDeliveredWeight).toBeCloseTo(expectedDelivered, 4);
  });

  it("Day 1 is still marked completed after reforecast", () => {
    const updated = reforecastPlan(plan, 0, 11000, 1.880, COMPLETED_AT);
    expect(updated.days[0].completedAt).toBeTruthy();
  });

  it("Day 2 target is adjusted to compensate for Day 1 under-performance", () => {
    // Day 1 caught at 1.880 (below target 1.878 — actually slightly above)
    // Total budget: 1.905 * 22000 = 41910
    // Used: 11000 * 1.880 = 20680
    // Remaining budget: 41910 - 20680 = 21230 for 11000 birds → 1.930 kg
    const updated = reforecastPlan(plan, 0, 11000, 1.880, COMPLETED_AT);
    expect(updated.days[1].targetCatchingWeight).toBeCloseTo(1.930, 2);
  });

  it("weighted average of remaining plan still equals contract target", () => {
    const updated = reforecastPlan(plan, 0, 11000, 1.880, COMPLETED_AT);
    // Combine actual for day 0 and new target for day 1
    const allBirds = updated.days.reduce((s, d) => s + d.targetBirds, 0);
    const actualWeight = updated.days[0].actualAvgCatchingWeight! * updated.days[0].targetBirds;
    const remainingWeight = updated.days[1].targetCatchingWeight * updated.days[1].targetBirds;
    const overallAvg = (actualWeight + remainingWeight) / allBirds;
    expect(overallAvg).toBeCloseTo(TARGET, 2);
  });
});

describe("Rolling Reforecast — Three-day plan, Day 1 over-performs", () => {
  const plan = makePlan(TARGET, DAILY_GAIN, [7333, 7333, 7334]);

  it("remaining two days are recalculated symmetrically", () => {
    // Day 1 caught at 1.900 (above original target 1.850)
    const updated = reforecastPlan(plan, 0, 7333, 1.900, COMPLETED_AT);
    const d2 = updated.days[1];
    const d3 = updated.days[2];
    // Day 2 and Day 3 should still be staggered by one daily gain
    const diff = d3.targetCatchingWeight - d2.targetCatchingWeight;
    expect(diff).toBeCloseTo(DAILY_GAIN, 2);
  });

  it("weighted average of remaining days compensates for over-performance", () => {
    const updated = reforecastPlan(plan, 0, 7333, 1.900, COMPLETED_AT);
    const totalBirds = plan.days.reduce((s, d) => s + d.targetBirds, 0);
    const usedWeight = 7333 * 1.900;
    const remainingWeight =
      updated.days[1].targetCatchingWeight * updated.days[1].targetBirds +
      updated.days[2].targetCatchingWeight * updated.days[2].targetBirds;
    const overallAvg = (usedWeight + remainingWeight) / totalBirds;
    expect(overallAvg).toBeCloseTo(TARGET, 2);
  });
});

describe("Rolling Reforecast — Last day completion", () => {
  const plan = makePlan(TARGET, DAILY_GAIN, [11000, 11000]);

  it("no remaining days to reforecast after final day completes", () => {
    // Complete Day 1 first
    const afterDay1 = reforecastPlan(plan, 0, 11000, 1.878, COMPLETED_AT);
    // Complete Day 2
    const afterDay2 = reforecastPlan(afterDay1, 1, 11000, 1.932, COMPLETED_AT);
    const remaining = afterDay2.days.filter((d) => !d.completedAt);
    expect(remaining.length).toBe(0);
  });

  it("all days have actual data after both days complete", () => {
    const afterDay1 = reforecastPlan(plan, 0, 11000, 1.878, COMPLETED_AT);
    const afterDay2 = reforecastPlan(afterDay1, 1, 11000, 1.932, COMPLETED_AT);
    expect(afterDay2.days[0].actualAvgCatchingWeight).toBe(1.878);
    expect(afterDay2.days[1].actualAvgCatchingWeight).toBe(1.932);
  });
});

describe("Rolling Reforecast — Single-day plan", () => {
  const plan = makePlan(TARGET, DAILY_GAIN, [22000]);

  it("single day plan completes with no remaining days", () => {
    const updated = reforecastPlan(plan, 0, 22000, 1.905, COMPLETED_AT);
    expect(updated.days[0].completedAt).toBeTruthy();
    const remaining = updated.days.filter((d) => !d.completedAt);
    expect(remaining.length).toBe(0);
  });
});

describe("Rolling Reforecast — Delivered weight calculation", () => {
  const plan = makePlan(TARGET, DAILY_GAIN, [11000, 11000]);

  it("reforecast updates delivered weight for remaining days", () => {
    const updated = reforecastPlan(plan, 0, 11000, 1.880, COMPLETED_AT);
    const d2 = updated.days[1];
    const expectedDelivered = Math.round(d2.targetCatchingWeight * (1 - 5.5 / 100) * 1000) / 1000;
    expect(d2.targetDeliveredWeight).toBe(expectedDelivered);
  });
});

describe("Rolling Reforecast — Five-day plan, Day 2 completion", () => {
  const plan = makePlan(TARGET, DAILY_GAIN, [4400, 4400, 4400, 4400, 4400]);

  it("completing Day 2 leaves 3 remaining days", () => {
    const afterDay1 = reforecastPlan(plan, 0, 4400, plan.days[0].targetCatchingWeight, COMPLETED_AT);
    const afterDay2 = reforecastPlan(afterDay1, 1, 4400, plan.days[1].targetCatchingWeight, COMPLETED_AT);
    const remaining = afterDay2.days.filter((d) => !d.completedAt);
    expect(remaining.length).toBe(3);
  });

  it("remaining 3 days are staggered by daily gain", () => {
    const afterDay1 = reforecastPlan(plan, 0, 4400, plan.days[0].targetCatchingWeight, COMPLETED_AT);
    const afterDay2 = reforecastPlan(afterDay1, 1, 4400, plan.days[1].targetCatchingWeight, COMPLETED_AT);
    const remaining = afterDay2.days.filter((d) => !d.completedAt);
    const diff1 = remaining[1].targetCatchingWeight - remaining[0].targetCatchingWeight;
    const diff2 = remaining[2].targetCatchingWeight - remaining[1].targetCatchingWeight;
    expect(diff1).toBeCloseTo(DAILY_GAIN, 2);
    expect(diff2).toBeCloseTo(DAILY_GAIN, 2);
  });
});
