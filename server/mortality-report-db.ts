import { eq } from "drizzle-orm";
import { companySettings, flockDailyRecords, flocks, houses } from "../drizzle/schema";
import { getDb } from "./db";
import { productionCalendarDate } from "./production-reports-db";
import type { MortalityReportSource } from "../shared/mortality-report";

/** SELECT-only application path, not server-enforced READ ONLY access. */
export async function readMortalityReportSource(): Promise<{ source: MortalityReportSource; timezone: string }> {
  const db = await getDb();
  if (!db) throw new Error("Mortality report database is unavailable.");
  return db.transaction(async tx => {
    const settings = await tx.select({ timezone: companySettings.timezone })
      .from(companySettings).where(eq(companySettings.id, 1)).limit(1);
    const timezone = settings[0]?.timezone || "UTC";
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
    const reportHouses = await tx.select({ id: houses.id, name: houses.name, houseNumber: houses.houseNumber }).from(houses);
    const reportFlocks = await tx.select({
      id: flocks.id, flockNumber: flocks.flockNumber, houseId: flocks.houseId,
      placementDate: productionCalendarDate(flocks.placementDate),
      initialCount: flocks.initialCount, status: flocks.status,
    }).from(flocks);
    const dailyRecords = await tx.select({
      id: flockDailyRecords.id, flockId: flockDailyRecords.flockId,
      recordDate: productionCalendarDate(flockDailyRecords.recordDate),
      dayNumber: flockDailyRecords.dayNumber, mortality: flockDailyRecords.mortality,
    }).from(flockDailyRecords);
    return { timezone, source: { houses: reportHouses, flocks: reportFlocks, dailyRecords } };
  }, { isolationLevel: "repeatable read" });
}
