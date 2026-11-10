import { eq } from "drizzle-orm";
import { catchSessions, companySettings, flocks, harvestRecords, houses } from "../drizzle/schema";
import { getDb } from "./db";
import { productionCalendarDate } from "./production-reports-db";
import type { HarvestReportSource } from "../shared/harvest-report";

/** SELECT-only application path; deliberately avoids catch readers that persist recalculated totals. */
export async function readHarvestReportSource(): Promise<{ source: HarvestReportSource; timezone: string }> {
  const db = await getDb();
  if (!db) throw new Error("Harvest Results database is unavailable.");
  return db.transaction(async tx => {
    const settings = await tx.select({ timezone: companySettings.timezone }).from(companySettings).where(eq(companySettings.id, 1)).limit(1);
    const timezone = settings[0]?.timezone || "UTC";
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
    const reportHouses = await tx.select({ id: houses.id, name: houses.name, houseNumber: houses.houseNumber }).from(houses);
    const reportFlocks = await tx.select({ id: flocks.id, flockNumber: flocks.flockNumber, houseId: flocks.houseId,
      placementDate: productionCalendarDate(flocks.placementDate), status: flocks.status }).from(flocks);
    const harvests = await tx.select({ id: harvestRecords.id, flockId: harvestRecords.flockId,
      harvestDate: productionCalendarDate(harvestRecords.harvestDate), chickenCountLoaded: harvestRecords.chickenCountLoaded,
      totalLoadedWeightKg: harvestRecords.totalLoadedWeightKg, chickenCountDelivered: harvestRecords.chickenCountDelivered,
      totalDeliveredWeightKg: harvestRecords.totalDeliveredWeightKg, transportMortalities: harvestRecords.transportMortalities }).from(harvestRecords);
    // Global minimal provenance is needed to detect a foreign-flock session referencing a selected harvest.
    const catches = await tx.select({ id: catchSessions.id, flockId: catchSessions.flockId,
      catchDate: productionCalendarDate(catchSessions.catchDate), harvestRecordId: catchSessions.harvestRecordId,
      status: catchSessions.status }).from(catchSessions);
    return { timezone, source: { houses: reportHouses, flocks: reportFlocks, harvests, catches } };
  }, { isolationLevel: "repeatable read" });
}
