import { getRossObjective } from "@shared/ross308-reference";
import type { RossDailyConsumption, RossGrowthInterval, RossWeightSample } from "@shared/ross-flock-metrics";

export const ROSS_GROWTH_POLICY = "Application planning policy (not a breeder standard): ahead ≥ +5%; on track −5% to < +5%; behind > −10% to < −5%; critical ≤ −10%.";

export function finiteNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

export function positiveNumber(value: number | string | null | undefined): number | null {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : null;
}

export function formatStoredFeedAllocation(value: number | string | null | undefined): string {
  const number = finiteNumber(value);
  return number !== null && number >= 0 ? `${number.toFixed(3)} kg/bird` : "Not specified";
}

export function formatRossNumber(value: number | null | undefined, decimals = 2, unit = ""): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "N/A";
  return `${value.toFixed(decimals)}${unit ? ` ${unit}` : ""}`;
}

export function rossGrowthStatus(deviation: number | null | undefined) {
  if (deviation === null || deviation === undefined || !Number.isFinite(deviation)) return { label: "N/A", className: "text-muted-foreground" };
  if (deviation <= -10) return { label: "Critical — review required", className: "text-red-600 dark:text-red-400" };
  if (deviation < -5) return { label: "Behind objective", className: "text-amber-600 dark:text-amber-400" };
  if (deviation < 5) return { label: "On track", className: "text-blue-600 dark:text-blue-400" };
  return { label: "Ahead of objective", className: "text-green-600 dark:text-green-400" };
}

/** The engine validates date/day consistency. Here we sort its measured samples;
 * no placement surrogate, missing-day weight, interpolation or extrapolation. */
export function sortedRossSamples(samples: readonly RossWeightSample[]): RossWeightSample[] {
  return samples.filter(sample => Number.isInteger(sample.day) && sample.day >= 0 && Number.isFinite(sample.weightKg) && sample.weightKg > 0)
    .map(sample => ({ ...sample })).sort((a, b) => a.day - b.day || a.date.localeCompare(b.date));
}

export function buildRossChartRows(samples: readonly RossWeightSample[], plannedDay: number | null = null) {
  const measured = sortedRossSamples(samples);
  const days = new Set(Array.from({ length: 57 }, (_, day) => day));
  for (const sample of measured) days.add(sample.day);
  if (plannedDay !== null && Number.isInteger(plannedDay) && plannedDay >= 0) days.add(plannedDay);
  return Array.from(days).sort((a, b) => a - b).map(day => {
    const objective = getRossObjective(day);
    const actual = measured.find(sample => sample.day === day);
    return {
      day, actualWeightKg: actual?.weightKg ?? null,
      breederWeightKg: objective?.weightKg ?? null,
      dailyFeedG: objective?.dailyFeedG ?? null,
      cumulativeFeedKg: objective?.cumulativeFeedKg ?? null,
      referenceFcr: objective?.fcr ?? null,
      publishedDailyGainG: objective?.dailyGainG ?? null,
      publishedAverageDailyGainG: objective?.averageDailyGainG ?? null,
    };
  });
}

export function sortedRossIntervals(intervals: readonly RossGrowthInterval[]) {
  return intervals.filter(interval => Number.isInteger(interval.startDay) && Number.isInteger(interval.endDay) && interval.startDay >= 0 && interval.endDay > interval.startDay && Number.isFinite(interval.adgG))
    .map(interval => ({ ...interval, interval: `Day ${interval.startDay}–${interval.endDay}` }))
    .sort((a, b) => a.startDay - b.startDay || a.endDay - b.endDay);
}

export interface RossCommercialPlan {
  targetCatchingWeight: number | string | null | undefined;
  targetDeliveredWeight: number | string | null | undefined;
  growingPeriod: number | null | undefined;
}

export function rossCommercialProgress(plan: RossCommercialPlan, latest: RossWeightSample | null, observedAdgG: number | null) {
  const catchingWeightKg = positiveNumber(plan.targetCatchingWeight);
  const deliveredWeightKg = positiveNumber(plan.targetDeliveredWeight);
  const measuredWeightKg = latest ? positiveNumber(latest.weightKg) : null;
  const progressPct = catchingWeightKg !== null && measuredWeightKg !== null ? measuredWeightKg / catchingWeightKg * 100 : null;
  let daysToTarget: number | null = null;
  let projectionReason: string | null = null;
  if (catchingWeightKg === null) projectionReason = "Stored target catching weight is missing or invalid.";
  else if (!latest || measuredWeightKg === null || !Number.isInteger(latest.day) || latest.day < 0) projectionReason = "A valid dated weight measurement is required.";
  else if (measuredWeightKg >= catchingWeightKg) daysToTarget = 0;
  else if (observedAdgG === null || !Number.isFinite(observedAdgG) || observedAdgG <= 0) projectionReason = "At least two dated weighings with positive observed ADG are required; no fallback gain is used.";
  else {
    const days = Math.ceil((catchingWeightKg - measuredWeightKg) / (observedAdgG / 1000));
    if (Number.isSafeInteger(days) && days >= 0) daysToTarget = days;
    else projectionReason = "Observed growth does not support a finite estimate.";
  }
  return {
    catchingWeightKg, deliveredWeightKg, progressPct, daysToTarget, projectionReason,
    projectedAgeDay: latest && daysToTarget !== null ? latest.day + daysToTarget : null,
    plannedDay: plan.growingPeriod !== null && plan.growingPeriod !== undefined && Number.isInteger(plan.growingPeriod) && plan.growingPeriod >= 0 ? plan.growingPeriod : null,
  };
}

/** Difference already implicit in stored commercial targets, not invented or measured shrinkage. */
export function storedCommercialTargetDifferencePct(plan: RossCommercialPlan): number | null {
  const catching = positiveNumber(plan.targetCatchingWeight);
  const delivered = positiveNumber(plan.targetDeliveredWeight);
  return catching !== null && delivered !== null && delivered <= catching ? (1 - delivered / catching) * 100 : null;
}

export function rossFeedDeviationPct(row: RossDailyConsumption): number | null {
  const actual = row.feedGPerBird.value;
  const reference = row.reference?.dailyFeedG ?? null;
  return actual !== null && Number.isFinite(actual) && reference !== null && reference > 0 ? (actual - reference) / reference * 100 : null;
}

/** Only the latest two consecutive recorded ages; gaps must not look like a daily trend. */
export function rossRecentWaterChange(rows: readonly RossDailyConsumption[]) {
  const sorted = [...rows].sort((a, b) => a.day - b.day || a.date.localeCompare(b.date));
  const last = sorted.at(-1);
  const previous = sorted.at(-2);
  if (!last || !previous || last.day !== previous.day + 1) return null;
  const now = last.meteredWaterMlPerBird.value;
  const before = previous.meteredWaterMlPerBird.value;
  if (now === null || before === null || !Number.isFinite(now) || !Number.isFinite(before) || before <= 0) return null;
  return { startDay: previous.day, endDay: last.day, changePct: (now - before) / before * 100, previousTemperatureC: previous.temperatureC, latestTemperatureC: last.temperatureC };
}
