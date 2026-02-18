/**
 * Weight Formatting Utilities
 * 
 * Handles conversion and display of weights based on user's preferred unit
 */

export type WeightUnit = "grams" | "kg";

/**
 * Format weight for display based on the selected unit
 * @param weightInKg - Weight value in kilograms (our base unit for storage)
 * @param unit - Display unit ("grams" or "kg")
 * @param decimals - Number of decimal places (default: 3 for kg, 0 for grams)
 * @returns Formatted weight string with unit label
 */
export function formatWeight(
  weightInKg: number | string | null | undefined,
  unit: WeightUnit = "kg",
  decimals?: number
): string {
  if (weightInKg === null || weightInKg === undefined || weightInKg === "") {
    return "-";
  }

  const weight = typeof weightInKg === "string" ? parseFloat(weightInKg) : weightInKg;
  
  if (isNaN(weight)) {
    return "-";
  }

  if (unit === "grams") {
    const grams = weight * 1000;
    const decimalPlaces = decimals !== undefined ? decimals : 0;
    return `${grams.toFixed(decimalPlaces)} g`;
  } else {
    const decimalPlaces = decimals !== undefined ? decimals : 3;
    return `${weight.toFixed(decimalPlaces)} kg`;
  }
}

/**
 * Get just the numeric value in the specified unit (without label)
 * @param weightInKg - Weight value in kilograms
 * @param unit - Target unit ("grams" or "kg")
 * @returns Numeric value in the specified unit
 */
export function getWeightValue(
  weightInKg: number | string | null | undefined,
  unit: WeightUnit = "kg"
): number {
  if (weightInKg === null || weightInKg === undefined || weightInKg === "") {
    return 0;
  }

  const weight = typeof weightInKg === "string" ? parseFloat(weightInKg) : weightInKg;
  
  if (isNaN(weight)) {
    return 0;
  }

  return unit === "grams" ? weight * 1000 : weight;
}

/**
 * Convert weight from display unit back to kilograms (for storage)
 * @param value - Weight value in the display unit
 * @param unit - Source unit ("grams" or "kg")
 * @returns Weight in kilograms
 */
export function convertToKg(value: number, unit: WeightUnit = "kg"): number {
  return unit === "grams" ? value / 1000 : value;
}

/**
 * Get the unit label
 * @param unit - Weight unit
 * @returns Unit label string
 */
export function getUnitLabel(unit: WeightUnit = "kg"): string {
  return unit === "grams" ? "g" : "kg";
}

/**
 * Get appropriate decimal places for the unit
 * @param unit - Weight unit
 * @returns Number of decimal places
 */
export function getDecimalPlaces(unit: WeightUnit = "kg"): number {
  return unit === "grams" ? 0 : 3;
}
