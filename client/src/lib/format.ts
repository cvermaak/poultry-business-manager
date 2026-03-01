/**
 * Shared formatting utilities for the AFGRO Poultry Manager.
 *
 * Currency convention (South African Rand):
 *   - Space as thousands separator
 *   - Dot as decimal separator
 *   - e.g. R89 050.00
 *
 * All monetary values stored in the database are in CENTS (integer).
 * Use formatCents() when the raw value is in cents.
 * Use formatRand() when the value is already in Rand (floating point).
 */

/**
 * Format an integer cent value as a Rand string.
 * e.g. formatCents(8905000) → "R89 050.00"
 */
export function formatCents(cents: number | string | null | undefined): string {
  const value = parseFloat(String(cents ?? 0)) / 100;
  return formatRand(value);
}

/**
 * Format a Rand value (already divided by 100) as a display string.
 * e.g. formatRand(89050) → "R89 050.00"
 */
export function formatRand(value: number | string | null | undefined): string {
  const num = parseFloat(String(value ?? 0));
  if (isNaN(num)) return "R0.00";
  const [intPart, decPart] = num.toFixed(2).split(".");
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `R${intFormatted}.${decPart}`;
}

/**
 * Format a plain number with space-thousands and dot-decimal (no currency symbol).
 * e.g. formatNumber(35150) → "35 150.00"
 */
export function formatNumber(
  value: number | string | null | undefined,
  decimals = 2
): string {
  const num = parseFloat(String(value ?? 0));
  if (isNaN(num)) return (0).toFixed(decimals);
  const [intPart, decPart] = num.toFixed(decimals).split(".");
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return decPart !== undefined ? `${intFormatted}.${decPart}` : intFormatted;
}

/**
 * Format a weight value with the appropriate unit.
 * e.g. formatWeight(2.345, "kg", 3) → "2.345 kg"
 */
export function formatWeight(
  value: number | string | null | undefined,
  unit = "kg",
  decimals = 2
): string {
  const num = parseFloat(String(value ?? 0));
  if (isNaN(num)) return `0.${"0".repeat(decimals)} ${unit}`;
  return `${num.toFixed(decimals)} ${unit}`;
}
