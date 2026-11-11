import { isProductionDate } from "@shared/production-report-dates";
import type { FlockPerformanceFilters, ProductionReportOptions } from "@shared/production-reports";

export interface FlockPerformanceDraft { startDate: string; endDate: string; houseId: string; flockId: string }
export function defaultFlockPerformanceDraft(today: string): FlockPerformanceDraft {
  return { startDate: "", endDate: today, houseId: "", flockId: "" };
}
export function flockPerformanceInput(draft: FlockPerformanceDraft): FlockPerformanceFilters {
  return { startDate: draft.startDate || undefined, endDate: draft.endDate,
    houseId: draft.houseId ? Number(draft.houseId) : undefined,
    flockId: draft.flockId ? Number(draft.flockId) : undefined };
}
export function sameFlockPerformanceFilters(a: FlockPerformanceDraft | null, b: FlockPerformanceDraft | null): boolean {
  return !!a && !!b && a.startDate === b.startDate && a.endDate === b.endDate && a.houseId === b.houseId && a.flockId === b.flockId;
}
export function changeFlockPerformanceHouse(draft: FlockPerformanceDraft, houseId: string, options: ProductionReportOptions): FlockPerformanceDraft {
  const flock = options.flocks.find(item => String(item.id) === draft.flockId);
  return { ...draft, houseId, flockId: !houseId || flock?.houseId === Number(houseId) ? draft.flockId : "" };
}
export function validateFlockPerformanceDraft(draft: FlockPerformanceDraft, options: ProductionReportOptions): string | null {
  if (!isProductionDate(draft.endDate) || (draft.startDate && !isProductionDate(draft.startDate))) return "Enter valid operational calendar dates.";
  if (draft.startDate && draft.startDate > draft.endDate) return "Start date must be on or before end date.";
  if (draft.houseId && !options.houses.some(house => String(house.id) === draft.houseId)) return "Select an available house.";
  const flock = options.flocks.find(item => String(item.id) === draft.flockId);
  if (draft.flockId && !flock) return "Select an available flock.";
  if (flock && draft.houseId && flock.houseId !== Number(draft.houseId)) return "The flock does not belong to the selected house.";
  return null;
}
export function canExportFlockPerformance(state: { authorized: boolean; hasReport: boolean; fetching: boolean; error: boolean; dirty: boolean }): boolean {
  return state.authorized && state.hasReport && !state.fetching && !state.error && !state.dirty;
}
