import type { ProductionDailySource, ProductionReportFlock, ProductionReportHouse, ProductionCatchSource, ResolvedFlockPerformanceFilters } from "./production-reports";
import type { HarvestResultSourceRecord, HarvestEventResult, HarvestCatchException } from "./harvest-report";

export interface FeedDailySource extends ProductionDailySource {
  feedConsumed: number | string | null;
  feedType: string | null;
}
export interface FeedReportSource {
  houses: ProductionReportHouse[];
  flocks: ProductionReportFlock[];
  dailyRecords: FeedDailySource[];
  harvests: HarvestResultSourceRecord[];
  catches: ProductionCatchSource[];
}
export type FeedStage = "starter" | "grower" | "finisher" | "unspecified";
export type FeedStageTotals = Record<FeedStage, number | null>;
export interface FeedTotals {
  kg: number | null;
  stages: FeedStageTotals;
  validRecords: number;
  validDays: number;
  expectedDays: number | null;
  partial: boolean;
  issues: string[];
}
export interface FeedCoverage {
  expectedDays: number | null;
  recordedDays: number;
  validFeedDays: number;
  validMortalityDays: number;
  feedRecords: number;
  zeroFeedRecords: number;
  missingFeedDays: number | null;
  complete: boolean;
  issues: string[];
}
export interface FeedDailyDetail {
  id: number;
  date: string | null;
  dayNumber: number | null;
  stage: FeedStage;
  feedKg: number | null;
  mortality: number | null;
  weightKg: number | null;
  /** Source validity and scope separately; excluded observations never contribute. */
  eligible: boolean;
  inPeriod: boolean;
  inCumulative: boolean;
  inFcr: boolean;
  issues: string[];
  sourceVersions: FeedDailySource[];
}
export interface FeedFcr {
  value: number | null;
  eligible: boolean;
  status: string;
  basis: string;
  endpoint: string | null;
  closureDate: string | null;
  cumulativeFeedKg: number | null;
  cumulativeDeaths: number | null;
  loadedBirds: number | null;
  loadedKg: number | null;
  remainingBirds: number | null;
  weightKg: number | null;
  weightDate: string | null;
  estimatedRemainingKg: number | null;
  biomassKg: number | null;
  coverage: FeedCoverage;
  reasons: string[];
}
export interface FeedReportRow {
  flockId: number;
  flockNumber: string;
  houseId: number | null;
  houseName: string;
  placementDate: string | null;
  currentStatus: string;
  initialBirds: number | null;
  periodFeed: FeedTotals;
  cumulativeFeed: FeedTotals;
  latestWeightKg: number | null;
  latestWeightDate: string | null;
  fcr: FeedFcr;
  dailyRecords: FeedDailyDetail[];
  harvestRecords: HarvestEventResult[];
  catchExceptions: HarvestCatchException[];
  issues: string[];
}
export interface FeedReportSummary {
  flockCount: number;
  qualifyingFlocks: number;
  periodFeed: FeedTotals;
  cumulativeFeed: FeedTotals;
  fcr: number | null;
  fcrFeedKg: number | null;
  biomassKg: number | null;
  issues: string[];
}
export interface FeedPerformanceReport {
  kind: "feed-performance";
  generatedAt: string;
  timezone: string;
  filters: ResolvedFlockPerformanceFilters;
  rows: FeedReportRow[];
  summary: FeedReportSummary;
  notes: string[];
}
