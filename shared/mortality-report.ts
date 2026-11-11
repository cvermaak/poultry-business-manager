import type { ProductionReportHouse, ProductionReportFlock, ResolvedFlockPerformanceFilters } from "./production-reports";

export interface MortalitySourceRecord {
  id: number;
  flockId: number;
  recordDate: string | null;
  dayNumber: number;
  mortality: number | string | null;
}
export interface MortalityReportSource {
  houses: ProductionReportHouse[];
  flocks: ProductionReportFlock[];
  dailyRecords: MortalitySourceRecord[];
}
export interface MortalitySourceDetail {
  id: number;
  date: string | null;
  dayNumber: number;
  rawMortality: number | string | null;
  deaths: number | null;
  inPeriod: boolean;
  eligible: boolean;
  cumulativeDeaths: number | null;
  issues: string[];
}
export interface MortalityTrendPoint {
  date: string;
  recordIds: number[];
  recordedDeaths: number | null;
  cumulativeDeaths: number | null;
  cumulativeMortalityPct: number | null;
  inPeriod: boolean;
  issues: string[];
}
export interface MortalityReportRow {
  flockId: number;
  flockNumber: string;
  houseId: number;
  houseName: string;
  placementDate: string | null;
  currentStatus: string;
  initialBirds: number | null;
  periodDeaths: number | null;
  periodMortalityPct: number | null;
  cumulativeDeaths: number | null;
  cumulativeMortalityPct: number | null;
  recordedDays: number;
  periodRecordedDays: number;
  calendarDaysInPeriod: number | null;
  unrecordedDaysInPeriod: number | null;
  periodSummaryEligible: boolean;
  cumulativeSummaryEligible: boolean;
  issues: string[];
  dailyRecords: MortalitySourceDetail[];
  trend: MortalityTrendPoint[];
}
export interface MortalityReportSummary {
  flockCount: number;
  periodEligibleFlockCount: number;
  cumulativeEligibleFlockCount: number;
  initialBirds: number | null;
  periodDeaths: number | null;
  periodMortalityPct: number | null;
  cumulativeDeaths: number | null;
  cumulativeMortalityPct: number | null;
  issues: string[];
}
export interface MortalityReport {
  kind: "mortality";
  generatedAt: string;
  timezone: string;
  filters: ResolvedFlockPerformanceFilters;
  rows: MortalityReportRow[];
  summary: MortalityReportSummary;
  notes: string[];
}
