/**
 * House Capacity Calculation Logic
 * Based on industry standards for broiler density by house type
 */

export type HouseType = 'open_sided' | 'closed' | 'semi_closed';

/**
 * Density ranges (kg/m²) by house type
 * Based on South African broiler industry standards
 */
export const DENSITY_RANGES: Record<HouseType, { min: number; max: number; recommended: number }> = {
  open_sided: {
    min: 30,
    max: 34,
    recommended: 32,
  },
  semi_closed: {
    min: 33,
    max: 36,
    recommended: 35,
  },
  closed: {
    min: 36,
    max: 40,
    recommended: 38,
  },
};

export interface CapacityCalculationParams {
  floorArea: number; // m²
  houseType: HouseType;
  densityKgPerSqm?: number; // Optional - uses recommended if not provided
  targetSlaughterWeight: number; // kg per bird
  mortalityRate: number; // percentage (e.g., 4.0 for 4%)
}

export interface CapacityCalculationResult {
  totalKgCapacity: number;
  finishedBirds: number;
  placementCapacity: number;
  densityUsed: number;
  calculationSteps: string[];
}

/**
 * Calculate house capacity based on density, area, mortality, and target weight
 */
export function calculateHouseCapacity(params: CapacityCalculationParams): CapacityCalculationResult {
  const { floorArea, houseType, targetSlaughterWeight, mortalityRate } = params;
  
  // Use provided density or recommended density for house type
  const densityUsed = params.densityKgPerSqm || DENSITY_RANGES[houseType].recommended;
  
  // Step 1: Calculate total kg capacity
  const totalKgCapacity = floorArea * densityUsed;
  
  // Step 2: Calculate finished birds (birds that reach slaughter weight)
  const finishedBirds = Math.floor(totalKgCapacity / targetSlaughterWeight);
  
  // Step 3: Calculate placement capacity (accounting for mortality)
  // Formula: finishedBirds ÷ (1 - mortalityRate/100)
  const survivalRate = 1 - (mortalityRate / 100);
  const placementCapacity = Math.floor(finishedBirds / survivalRate);
  
  // Generate calculation steps for display
  const calculationSteps = [
    `Floor Area: ${floorArea.toFixed(2)} m²`,
    `Density: ${densityUsed.toFixed(2)} kg/m² (${houseType.replace('_', ' ')})`,
    `Total kg capacity: ${floorArea.toFixed(2)} × ${densityUsed.toFixed(2)} = ${totalKgCapacity.toFixed(2)} kg`,
    `Finished birds: ${totalKgCapacity.toFixed(2)} ÷ ${targetSlaughterWeight.toFixed(2)} kg = ${finishedBirds.toLocaleString()} birds`,
    `Mortality rate: ${mortalityRate.toFixed(2)}% (survival rate: ${(survivalRate * 100).toFixed(2)}%)`,
    `Placement capacity: ${finishedBirds.toLocaleString()} ÷ ${survivalRate.toFixed(4)} = ${placementCapacity.toLocaleString()} chicks`,
  ];
  
  return {
    totalKgCapacity,
    finishedBirds,
    placementCapacity,
    densityUsed,
    calculationSteps,
  };
}

/**
 * Validate density is within safe range for house type
 */
export function validateDensity(houseType: HouseType, density: number): { valid: boolean; message?: string } {
  const range = DENSITY_RANGES[houseType];
  
  if (density < range.min) {
    return {
      valid: false,
      message: `Density ${density} kg/m² is below safe minimum of ${range.min} kg/m² for ${houseType.replace('_', ' ')} houses`,
    };
  }
  
  if (density > range.max) {
    return {
      valid: false,
      message: `Density ${density} kg/m² exceeds safe maximum of ${range.max} kg/m² for ${houseType.replace('_', ' ')} houses`,
    };
  }
  
  return { valid: true };
}

/**
 * Get recommended density for house type
 */
export function getRecommendedDensity(houseType: HouseType): number {
  return DENSITY_RANGES[houseType].recommended;
}

/**
 * Get density range for house type
 */
export function getDensityRange(houseType: HouseType): { min: number; max: number; recommended: number } {
  return DENSITY_RANGES[houseType];
}
