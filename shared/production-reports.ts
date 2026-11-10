export const PRODUCTION_REPORT_ROLES = ["admin", "farm_manager", "accountant"] as const;
export function canReadProductionReports(role?: string): boolean {
  return PRODUCTION_REPORT_ROLES.some(allowed => allowed === role);
}

export interface FlockPerformanceFilters {
  startDate?: string;
  endDate?: string;
  houseId?: number;
  flockId?: number;
}
export interface ResolvedFlockPerformanceFilters {
  startDate: string | null;
  endDate: string;
  houseId: number | null;
  flockId: number | null;
}
export interface ProductionReportHouse {
  id: number;
  name: string;
  houseNumber: string | null;
}
export interface ProductionReportFlock {
  id: number;
  flockNumber: string;
  houseId: number;
  placementDate: string | null;
  initialCount: number;
  status: string;
}
export interface ProductionDailySource {
  id: number;
  flockId: number;
  recordDate: string | null;
  dayNumber: number;
  mortality: number | string | null;
  averageWeight: number | string | null;
}
export interface ProductionHarvestSource {
  id: number;
  flockId: number;
  harvestDate: string | null;
  chickenCountLoaded: number | string | null;
}
export interface ProductionCatchSource {
  id: number;
  flockId: number;
  catchDate: string | null;
  harvestRecordId: number | null;
  status: string;
}
export interface FlockPerformanceSource {
  houses: ProductionReportHouse[];
  flocks: ProductionReportFlock[];
  dailyRecords: ProductionDailySource[];
  harvests: ProductionHarvestSource[];
  catches: ProductionCatchSource[];
}
export interface ProductionDailyDetail {
  id: number;
  date: string | null;
  dayNumber: number;
  mortality: number | null;
  weightKg: number | null;
  inPeriod: boolean;
  issues: string[];
}
export interface ProductionHarvestDetail {
  id: number;
  date: string | null;
  loadedBirds: number | null;
  eligible: boolean;
  classification: string;
  sessionIds: number[];
  issues: string[];
}
export interface ProductionCatchException {
  sessionId: number;
  harvestRecordId: number | null;
  date: string | null;
  reason: string;
}
export interface FlockPerformanceRow {
  flockId: number;
  flockNumber: string;
  houseId: number;
  houseName: string;
  placementDate: string | null;
  currentStatus: string;
  initialBirds: number | null;
  elapsedDays: number | null;
  periodDeaths: number | null;
  cumulativeDeaths: number | null;
  cumulativeMortalityPct: number | null;
  loadedBirds: number | null;
  remainingBirds: number | null;
  latestWeightKg: number | null;
  latestWeightDate: string | null;
  weightAgeDays: number | null;
  weightOutsidePeriod: boolean;
  observedGrowthGPerBirdDay: number | null;
  growthStartDate: string | null;
  growthEndDate: string | null;
  growthStartWeightKg: number | null;
  growthEndWeightKg: number | null;
  recordedDays: number;
  periodRecordedDays: number;
  expectedPeriodDays: number | null;
  missingPeriodDays: number | null;
  summaryEligible: boolean;
  issues: string[];
  dailyRecords: ProductionDailyDetail[];
  harvestRecords: ProductionHarvestDetail[];
  catchExceptions: ProductionCatchException[];
}
export interface FlockPerformanceSummary {
  flockCount: number;
  eligibleFlockCount: number;
  excludedFlockCount: number;
  initialBirds: number | null;
  periodDeaths: number | null;
  cumulativeDeaths: number | null;
  cumulativeMortalityPct: number | null;
  loadedBirds: number | null;
  remainingBirds: number | null;
  issues: string[];
}
export interface FlockPerformanceReport {
  kind: "flock-performance";
  generatedAt: string;
  timezone: string;
  filters: ResolvedFlockPerformanceFilters;
  rows: FlockPerformanceRow[];
  summary: FlockPerformanceSummary;
  notes: string[];
}
export interface ProductionReportOptions {
  timezone: string;
  today: string;
  houses: ProductionReportHouse[];
  flocks: Array<Pick<ProductionReportFlock, "id" | "flockNumber" | "houseId" | "placementDate" | "status">>;
}
