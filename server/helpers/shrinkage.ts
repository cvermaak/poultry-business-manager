/**
 * Shrinkage Calculation Helper
 * 
 * Calculates weight loss during the slaughter process based on:
 * - Gut evacuation (depends on feed removal duration)
 * - Catching & handling (fixed)
 * - Loading & holding (fixed)
 * - Transport (depends on transport time)
 */

export interface ShrinkageComponents {
  gutEvacuationPercent: number;
  catchingHandlingPercent: number;
  loadingHoldingPercent: number;
  transportPercent: number;
  totalShrinkagePercent: number;
}

/**
 * Calculate shrinkage percentages based on feed removal hours and transport time
 * 
 * @param feedRemovalHours - Hours of feed removal before catching (e.g., 6-7 hours)
 * @param transportTimeHours - Transport time to slaughterhouse (default 2 hours)
 * @returns Shrinkage components with percentages
 */
export function calculateShrinkage(
  feedRemovalHours: number,
  transportTimeHours: number = 2
): ShrinkageComponents {
  // Gut evacuation: 2-3%, scales with feed removal time
  // At 0 hours: 2%, at 24 hours: 3%
  const gutEvacuationPercent = 2 + Math.min(feedRemovalHours / 24, 1);

  // Catching & handling: 1.5-2.0% (fixed midpoint)
  const catchingHandlingPercent = 1.75;

  // Loading & holding: 0.5-0.8% (fixed midpoint)
  const loadingHoldingPercent = 0.65;

  // Transport: 0.7-1.0%, scales with transport time
  // At 0 hours: 0.7%, at 2+ hours: 1.0%
  const transportPercent = 0.7 + Math.min((transportTimeHours / 2) * 0.3, 0.3);

  const totalShrinkagePercent =
    gutEvacuationPercent +
    catchingHandlingPercent +
    loadingHoldingPercent +
    transportPercent;

  return {
    gutEvacuationPercent: parseFloat(gutEvacuationPercent.toFixed(2)),
    catchingHandlingPercent: parseFloat(catchingHandlingPercent.toFixed(2)),
    loadingHoldingPercent: parseFloat(loadingHoldingPercent.toFixed(2)),
    transportPercent: parseFloat(transportPercent.toFixed(2)),
    totalShrinkagePercent: parseFloat(totalShrinkagePercent.toFixed(2)),
  };
}

/**
 * Calculate estimated weight at slaughterhouse based on farm weight and shrinkage
 * 
 * @param farmWeight - Average weight at farm (kg)
 * @param shrinkagePercent - Total shrinkage percentage
 * @returns Estimated weight at slaughterhouse (kg)
 */
export function calculateEstimatedSlaughterhouseWeight(
  farmWeight: number,
  shrinkagePercent: number
): number {
  const shrinkageMultiplier = 1 - shrinkagePercent / 100;
  return parseFloat((farmWeight * shrinkageMultiplier).toFixed(3));
}

/**
 * Calculate variance between estimated and actual slaughterhouse weight
 * 
 * @param estimatedWeight - Estimated weight at slaughterhouse (kg)
 * @param actualWeight - Actual weight received from slaughterhouse (kg)
 * @returns Object with variance and variance percentage
 */
export function calculateWeightVariance(
  estimatedWeight: number,
  actualWeight: number
): { variance: number; variancePercent: number } {
  const variance = parseFloat((estimatedWeight - actualWeight).toFixed(3));
  const variancePercent = parseFloat(
    ((variance / estimatedWeight) * 100).toFixed(2)
  );

  return { variance, variancePercent };
}
