/**
 * Seasonal Density Calculator for Broiler Transport
 * 
 * Based on scientific research:
 * - Yu et al. (2024): Effect of crating density and weather conditions
 * - Hussnain et al. (2020): Long-distance transportation in hot weather
 * - SA Poultry Association: 70 kg/m² legal maximum
 */

export type Season = 'summer' | 'winter' | 'moderate';

export interface CrateType {
  id: number;
  name: string;
  length: number; // cm
  width: number; // cm
  height: number; // cm
  tareWeight: number; // kg
}

export interface DensityRecommendation {
  season: Season;
  minBirdsPerCrate: number;
  maxBirdsPerCrate: number;
  recommendedBirdsPerCrate: number;
  legalMaxBirdsPerCrate: number;
  floorAreaM2: number;
}

export interface DistributionPlan {
  standardDensity: number; // Primary birds/crate
  standardCrates: number; // Number of crates at standard density
  oddDensity: number; // Secondary birds/crate
  oddCrates: number; // Number of crates at odd density
  totalBirds: number; // Total birds in plan
  totalCrates: number; // Total crates used
  shortage: number; // Birds short of target (negative if over)
  exceedsRecommendation: boolean; // True if any density exceeds seasonal recommendation
  withinLegalLimit: boolean; // True if all densities within legal limit
}

/**
 * Determine season from catch date (South African seasons)
 */
export function detectSeason(catchDate: Date): Season {
  const month = catchDate.getMonth() + 1; // 1-12
  
  // Summer: October to March (months 10, 11, 12, 1, 2, 3)
  if (month >= 10 || month <= 3) {
    return 'summer';
  }
  
  // Winter: April to September (months 4, 5, 6, 7, 8, 9)
  return 'winter';
}

/**
 * Calculate seasonal density recommendation for a crate type
 */
export function calculateDensityRecommendation(
  crateType: CrateType,
  season: Season,
  transportDurationHours?: number
): DensityRecommendation {
  // Calculate floor area in m²
  const floorAreaM2 = (crateType.length * crateType.width) / 10000;
  
  // Base recommendations (birds per m²)
  let minDensityPerM2: number;
  let maxDensityPerM2: number;
  
  if (season === 'summer') {
    minDensityPerM2 = 20;
    maxDensityPerM2 = 22;
  } else if (season === 'winter') {
    minDensityPerM2 = 25;
    maxDensityPerM2 = 28;
  } else { // moderate
    minDensityPerM2 = 23;
    maxDensityPerM2 = 25;
  }
  
  // Adjust for transport duration (if provided)
  if (transportDurationHours) {
    if (transportDurationHours > 3) {
      // Long haul: reduce density
      maxDensityPerM2 -= 2;
      minDensityPerM2 -= 2;
    } else if (transportDurationHours < 1) {
      // Short haul: can use slightly higher density
      maxDensityPerM2 += 1;
      minDensityPerM2 += 1;
    }
  }
  
  // Calculate birds per crate
  const minBirdsPerCrate = Math.floor(floorAreaM2 * minDensityPerM2);
  const maxBirdsPerCrate = Math.floor(floorAreaM2 * maxDensityPerM2);
  const recommendedBirdsPerCrate = Math.floor(floorAreaM2 * ((minDensityPerM2 + maxDensityPerM2) / 2));
  
  // Legal maximum: 28 birds/m² (70 kg/m² ÷ 2.5 kg/bird)
  const legalMaxBirdsPerCrate = Math.floor(floorAreaM2 * 28);
  
  return {
    season,
    minBirdsPerCrate,
    maxBirdsPerCrate,
    recommendedBirdsPerCrate,
    legalMaxBirdsPerCrate,
    floorAreaM2,
  };
}

/**
 * Calculate optimal crate distribution when there's a shortage
 * 
 * Strategy:
 * - Summer: Pack MOST crates at moderate density, FEW at higher density
 * - Winter: Pack MOST crates at standard density, SOME at higher density
 */
export function calculateDistribution(
  targetBirds: number,
  availableCrates: number,
  recommendation: DensityRecommendation
): DistributionPlan {
  const { season, recommendedBirdsPerCrate, legalMaxBirdsPerCrate } = recommendation;
  
  // Check if we have enough crates at recommended density
  const cratesNeeded = Math.ceil(targetBirds / recommendedBirdsPerCrate);
  
  if (cratesNeeded <= availableCrates) {
    // No shortage - simple case
    const standardCrates = Math.ceil(targetBirds / recommendedBirdsPerCrate);
    return {
      standardDensity: recommendedBirdsPerCrate,
      standardCrates,
      oddDensity: 0,
      oddCrates: 0,
      totalBirds: standardCrates * recommendedBirdsPerCrate,
      totalCrates: standardCrates,
      shortage: (standardCrates * recommendedBirdsPerCrate) - targetBirds,
      exceedsRecommendation: false,
      withinLegalLimit: true,
    };
  }
  
  // Shortage exists - calculate distribution based on season
  // Strategy: MOST crates at standard density, FEW crates at higher density
  let standardDensity: number;
  let oddDensity: number;
  
  if (season === 'summer') {
    // Summer: Most crates at moderate density (recommendation + 2), few at higher
    standardDensity = Math.min(recommendedBirdsPerCrate + 2, legalMaxBirdsPerCrate);
    oddDensity = Math.min(standardDensity + 2, legalMaxBirdsPerCrate);
  } else {
    // Winter: Most crates at standard recommendation, some at higher
    standardDensity = recommendedBirdsPerCrate;
    oddDensity = Math.min(standardDensity + 2, legalMaxBirdsPerCrate);
  }
  
  // Calculate distribution: maximize standard density crates, minimize odd density crates
  // Formula: (standardCrates × standardDensity) + (oddCrates × oddDensity) = targetBirds
  // Constraint: standardCrates + oddCrates = availableCrates
  
  // First, check if we can fit all birds at standard density
  const birdsAtStandard = availableCrates * standardDensity;
  
  if (birdsAtStandard >= targetBirds) {
    // Can fit all birds at standard density - no odd crates needed
    const standardCrates = Math.min(Math.ceil(targetBirds / standardDensity), availableCrates);
    return {
      standardDensity,
      standardCrates,
      oddDensity: 0,
      oddCrates: 0,
      totalBirds: standardCrates * standardDensity,
      totalCrates: standardCrates,
      shortage: Math.max(0, targetBirds - (standardCrates * standardDensity)),
      exceedsRecommendation: standardDensity > recommendation.maxBirdsPerCrate,
      withinLegalLimit: standardDensity <= legalMaxBirdsPerCrate,
    };
  }
  
  // Need odd density crates to reach target
  // Calculate: oddCrates = (targetBirds - availableCrates × standardDensity) / (oddDensity - standardDensity)
  const remainingBirds = targetBirds - birdsAtStandard;
  const densityDiff = oddDensity - standardDensity;
  
  let oddCrates = Math.ceil(remainingBirds / densityDiff);
  let standardCrates = availableCrates - oddCrates;
  
  // Ensure we don't exceed available crates
  if (oddCrates > availableCrates) {
    // Can't fit target even with all crates at odd density
    oddCrates = availableCrates;
    standardCrates = 0;
  } else if (standardCrates < 0) {
    // Edge case: need more odd crates than available
    oddCrates = availableCrates;
    standardCrates = 0;
  }
  
  const totalBirds = (standardCrates * standardDensity) + (oddCrates * oddDensity);
  const shortage = targetBirds - totalBirds;
  
  return {
    standardDensity,
    standardCrates,
    oddDensity,
    oddCrates,
    totalBirds,
    totalCrates: standardCrates + oddCrates,
    shortage,
    exceedsRecommendation: standardDensity > recommendation.maxBirdsPerCrate,
    withinLegalLimit: oddDensity <= legalMaxBirdsPerCrate,
  };
}
