import { eq } from "drizzle-orm";
import { catchSessions, companySettings, flockDailyRecords, flocks, harvestRecords, houses } from "../drizzle/schema";
import { getDb } from "./db";
import { productionCalendarDate } from "./production-reports-db";
import type { FeedReportSource } from "../shared/feed-report";

/** Dedicated SELECT-only snapshot; never calls catch readers that persist totals. */
export async function readFeedReportSource(): Promise<{ source: FeedReportSource; timezone: string }> {
  const db = await getDb();
  if (!db) throw new Error("Feed Performance database is unavailable.");
  return db.transaction(async tx => {
    const settings = await tx.select({ timezone: companySettings.timezone }).from(companySettings).where(eq(companySettings.id, 1)).limit(1);
    const timezone = settings[0]?.timezone || "UTC";
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
    const reportHouses = await tx.select({ id: houses.id, name: houses.name, houseNumber: houses.houseNumber }).from(houses);
    const reportFlocks = await tx.select({ id: flocks.id, flockNumber: flocks.flockNumber, houseId: flocks.houseId,
      placementDate: productionCalendarDate(flocks.placementDate), initialCount: flocks.initialCount, status: flocks.status }).from(flocks);
    const dailyRecords = await tx.select({ id: flockDailyRecords.id, flockId: flockDailyRecords.flockId,
      recordDate: productionCalendarDate(flockDailyRecords.recordDate), dayNumber: flockDailyRecords.dayNumber,
      feedConsumed: flockDailyRecords.feedConsumed, feedType: flockDailyRecords.feedType,
      mortality: flockDailyRecords.mortality, averageWeight: flockDailyRecords.averageWeight }).from(flockDailyRecords);
    const harvests = await tx.select({ id: harvestRecords.id, flockId: harvestRecords.flockId,
      harvestDate: productionCalendarDate(harvestRecords.harvestDate), chickenCountLoaded: harvestRecords.chickenCountLoaded,
      totalLoadedWeightKg: harvestRecords.totalLoadedWeightKg, chickenCountDelivered: harvestRecords.chickenCountDelivered,
      totalDeliveredWeightKg: harvestRecords.totalDeliveredWeightKg, transportMortalities: harvestRecords.transportMortalities }).from(harvestRecords);
    // Global minimal provenance is required to detect foreign-flock catch links.
    const catches = await tx.select({ id: catchSessions.id, flockId: catchSessions.flockId,
      catchDate: productionCalendarDate(catchSessions.catchDate), harvestRecordId: catchSessions.harvestRecordId,
      status: catchSessions.status }).from(catchSessions);
    return { timezone, source: { houses: reportHouses, flocks: reportFlocks, dailyRecords, harvests, catches } };
  }, { isolationLevel: "repeatable read" });
}
