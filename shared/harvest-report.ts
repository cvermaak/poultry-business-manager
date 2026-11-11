import type { ProductionCatchSource, ProductionReportHouse, ProductionReportFlock, ResolvedFlockPerformanceFilters } from "./production-reports";

export interface HarvestResultSourceRecord {
  id: number;
  flockId: number;
  harvestDate: string | null;
  chickenCountLoaded: number | string | null;
  totalLoadedWeightKg: number | string | null;
  chickenCountDelivered: number | string | null;
  totalDeliveredWeightKg: number | string | null;
  transportMortalities: number | string | null;
}
export type HarvestResultFlock = Pick<ProductionReportFlock, "id" | "flockNumber" | "houseId" | "placementDate" | "status">;
export interface HarvestReportSource {
  houses: ProductionReportHouse[];
  flocks: HarvestResultFlock[];
  harvests: HarvestResultSourceRecord[];
  catches: ProductionCatchSource[];
}
export interface HarvestEventResult {
  id: number;
  date: string | null;
  inPeriod: boolean;
  eligible: boolean;
  classification: string;
  sessionIds: number[];
  loadedBirds: number | null;
  loadedKg: number | null;
  averageLoadedKg: number | null;
  deliveredBirds: number | null;
  deliveredKg: number | null;
  averageDeliveredKg: number | null;
  massLossKg: number | null;
  massLossPct: number | null;
  transportMortality: number | null;
  issues: string[];
  /** Full original relevant fields, including every conflicting version; no arbitrary winner. */
  sourceVersions: HarvestResultSourceRecord[];
}
export interface HarvestCatchException {
  sessionId: number;
  harvestRecordId: number | null;
  date: string | null;
  reason: string;
  sourceVersions: ProductionCatchSource[];
}
export interface HarvestMetricCoverage {
  loadedBirdEvents: number;
  loadedKgEvents: number;
  loadedAveragePairs: number;
  deliveredBirdEvents: number;
  deliveredKgEvents: number;
  deliveredAveragePairs: number;
  massLossPairs: number;
  transportMortalityEvents: number;
}
export interface HarvestMetrics {
  /** Original unique harvest IDs reviewed; may include an undated reconciliation row. */
  reviewedEventCount: number;
  eligibleEventCount: number;
  excludedEventCount: number;
  loadedBirds: number | null;
  loadedKg: number | null;
  averageLoadedKg: number | null;
  deliveredBirds: number | null;
  deliveredKg: number | null;
  averageDeliveredKg: number | null;
  massLossKg: number | null;
  massLossPct: number | null;
  transportMortality: number | null;
  coverage: HarvestMetricCoverage;
  issues: string[];
}
export interface HarvestReportRow {
  flockId: number;
  flockNumber: string;
  houseId: number | null;
  houseName: string;
  placementDate: string | null;
  currentStatus: string;
  metrics: HarvestMetrics;
  events: HarvestEventResult[];
  catchExceptions: HarvestCatchException[];
  issues: string[];
}
export interface HarvestReport {
  kind: "harvest-results";
  generatedAt: string;
  timezone: string;
  filters: ResolvedFlockPerformanceFilters;
  rows: HarvestReportRow[];
  summary: HarvestMetrics & { flockCount: number; catchExceptionCount: number };
  notes: string[];
}
