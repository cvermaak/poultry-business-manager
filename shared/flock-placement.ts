import { isProductionDate, productionDayDifference, productionToday } from "./production-report-dates";

/** Placement is an operational calendar label, not an instant to timezone-shift.
 * Stored strings retain their date prefix; Date transport values retain their UTC date.
 * Invalid/missing placement is never replaced with today.
 */
export function getFlockPlacementDate(value: Date | string): string {
  let key: string;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error("Invalid flock placement date.");
    key = value.toISOString().slice(0, 10);
  } else if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}(?:$|[T ])/.test(value)) {
    key = value.slice(0, 10);
  } else {
    throw new Error("Invalid flock placement date.");
  }
  if (!isProductionDate(key)) throw new Error("Invalid flock placement date.");
  return key;
}

/** Placement day is Day 0; today follows the company's calendar timezone. */
export function getFlockAgeDays(
  value: Date | string,
  now = new Date(),
  timezone = "Africa/Johannesburg",
): number {
  return productionDayDifference(getFlockPlacementDate(value), productionToday(timezone, now));
}

/** Daily records also carry calendar labels, not elapsed 24-hour periods. */
export function getFlockRecordDay(value: Date | string, recordDate: Date | string): number {
  return productionDayDifference(getFlockPlacementDate(value), getFlockPlacementDate(recordDate));
}
