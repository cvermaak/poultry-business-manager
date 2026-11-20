import { getRossObjective } from "./ross308-reference";

export type BreedType = "ross_308" | "cobb_500" | "arbor_acres";

// Existing application values for other breeds are intentionally unchanged.
// Their original provenance has not been upgraded by this Ross-only release.
const LEGACY_CURVES = {
  cobb_500: { 0: 0.042, 7: 0.175, 14: 0.480, 21: 0.950, 28: 1.540, 35: 2.215, 42: 2.970, 49: 3.800 },
  arbor_acres: { 0: 0.042, 7: 0.168, 14: 0.458, 21: 0.910, 28: 1.480, 35: 2.145, 42: 2.900, 49: 3.720 },
} as const;

/** Ross: exact published integer ages 0–56 only. Other breeds retain their legacy interpolation. */
export function getTargetWeight(dayNumber: number, breed: BreedType = "ross_308"): number | null {
  if (breed === "ross_308") return getRossObjective(dayNumber)?.weightKg ?? null;
  const growthCurve: Record<number, number> = LEGACY_CURVES[breed];
  if (growthCurve[dayNumber] !== undefined) return growthCurve[dayNumber];
  const days = Object.keys(growthCurve).map(Number).sort((a, b) => a - b);
  if (dayNumber < days[0]) return growthCurve[days[0]];
  if (dayNumber > days[days.length - 1]) {
    const lastDay = days[days.length - 1], previousDay = days[days.length - 2];
    const dailyGain = (growthCurve[lastDay] - growthCurve[previousDay]) / (lastDay - previousDay);
    return growthCurve[lastDay] + (dayNumber - lastDay) * dailyGain;
  }
  for (let i = 0; i < days.length - 1; i++) {
    const low = days[i], high = days[i + 1];
    if (dayNumber >= low && dayNumber <= high) {
      const fraction = (dayNumber - low) / (high - low);
      return growthCurve[low] + (growthCurve[high] - growthCurve[low]) * fraction;
    }
  }
  return 0.042;
}

export function getTargetGrowthCurve(startDay = 0, endDay = 42, breed: BreedType = "ross_308"): Array<{ day: number; targetWeight: number | null }> {
  if (!Number.isSafeInteger(startDay) || !Number.isSafeInteger(endDay) || endDay < startDay || endDay - startDay > 1000) return [];
  return Array.from({ length: endDay - startDay + 1 }, (_, index) => {
    const day = startDay + index;
    return { day, targetWeight: getTargetWeight(day, breed) };
  });
}

export function calculatePerformanceDeviation(actualWeight: number, dayNumber: number, breed: BreedType = "ross_308"): number | null {
  const target = getTargetWeight(dayNumber, breed);
  if (target === null || target <= 0 || !Number.isFinite(actualWeight) || actualWeight <= 0) return null;
  const deviation = ((actualWeight - target) / target) * 100;
  return Math.round(deviation * 10) / 10;
}

/** Existing ±5/−10 bands are application policy, not breeder or South African standards. */
export function getPerformanceStatus(deviation: number | null): "ahead" | "on-track" | "behind" | "critical" | "unavailable" {
  if (deviation === null || !Number.isFinite(deviation)) return "unavailable";
  if (deviation >= 5) return "ahead";
  if (deviation >= -5) return "on-track";
  if (deviation > -10) return "behind";
  return "critical";
}

export function validateTargetWeight(breed: BreedType, growingPeriod: number, targetWeight: number): {
  isRealistic: boolean;
  expectedWeight: number | null;
  message: string;
} {
  const expectedWeight = getTargetWeight(growingPeriod, breed);
  if (breed === "ross_308") {
    const valid = Number.isFinite(targetWeight) && targetWeight > 0 && Number.isSafeInteger(growingPeriod) && growingPeriod > 0;
    if (!valid) return { isRealistic: false, expectedWeight, message: "Enter a positive commercial weight and a valid growing period." };
    const context = expectedWeight === null
      ? "The Ross breeder objective is unavailable outside published Days 0–56."
      : `Day ${growingPeriod} breeder objective: ${expectedWeight.toFixed(3)} kg. Commercial target differs by ${(((targetWeight - expectedWeight) / expectedWeight) * 100).toFixed(1)}%.`;
    return { isRealistic: true, expectedWeight, message: `${context} The former ±15% band is informational application policy; it does not reject an intentional market weight.` };
  }
  // Other breeds retain the existing ±15% advisory behaviour.
  const expected = expectedWeight as number;
  const deviation = ((targetWeight - expected) / expected) * 100;
  const isRealistic = Math.abs(deviation) <= 15;
  const message = isRealistic
    ? `Target weight is realistic for ${breed.replace("_", " ")} at day ${growingPeriod} (expected: ${expected.toFixed(2)}kg)`
    : deviation > 15
      ? `Target weight (${targetWeight.toFixed(2)}kg) is ${deviation.toFixed(1)}% higher than expected ${expected.toFixed(2)}kg for ${breed.replace("_", " ")} at day ${growingPeriod}. This may be unrealistic.`
      : `Target weight (${targetWeight.toFixed(2)}kg) is ${Math.abs(deviation).toFixed(1)}% lower than expected ${expected.toFixed(2)}kg for ${breed.replace("_", " ")} at day ${growingPeriod}. This may indicate poor performance.`;
  return { isRealistic, expectedWeight, message };
}
