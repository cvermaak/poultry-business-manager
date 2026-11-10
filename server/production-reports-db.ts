import { eq, sql, type SQLWrapper } from "drizzle-orm";
import { catchSessions, companySettings, flockDailyRecords, flocks, harvestRecords, houses } from "../drizzle/schema";
import { getDb } from "./db";
import type { FlockPerformanceSource } from "../shared/production-reports";

/**
 * Date-input fields are encoded as UTC calendar dates by their writers. Recover
 * that date independently of the connection's TIMESTAMP display timezone.
 * This is not a reinterpretation/repair of ambiguous legacy wall-clock fields.
 */
export const productionCalendarDate = (column: SQLWrapper) => sql<string | null>`
  CASE WHEN ${column} IS NULL OR CAST(${column} AS CHAR) LIKE '0000-%' THEN NULL
  ELSE DATE_FORMAT(TIMESTAMPADD(SECOND, UNIX_TIMESTAMP(${column}),
    CAST('1970-01-01 00:00:00' AS DATETIME)), '%Y-%m-%d') END`;

export async function readProductionReportSource(includeRecords = true): Promise<{ source: FlockPerformanceSource; timezone: string }> {
  const db = await getDb();
  if (!db) throw new Error("Production report database is unavailable.");
  // One repeatable-read snapshot; this dedicated path issues SELECT statements
  // only. TiDB rejects MySQL's combined READ ONLY / CONSISTENT SNAPSHOT syntax,
  // so read-only behavior is enforced by this reader, not a server access flag.
  return db.transaction(async tx => {
    const settings = await tx.select({ timezone: companySettings.timezone })
      .from(companySettings).where(eq(companySettings.id, 1)).limit(1);
    const timezone = settings[0]?.timezone || "UTC";
    // Do not silently display a wrong local date if a stored IANA zone is invalid.
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
    const reportHouses = await tx.select({ id: houses.id, name: houses.name, houseNumber: houses.houseNumber }).from(houses);
    const reportFlocks = await tx.select({
      id: flocks.id, flockNumber: flocks.flockNumber, houseId: flocks.houseId,
      placementDate: productionCalendarDate(flocks.placementDate),
      initialCount: flocks.initialCount, status: flocks.status,
    }).from(flocks);
    if (!includeRecords) return {
      timezone, source: { houses: reportHouses, flocks: reportFlocks, dailyRecords: [], harvests: [], catches: [] },
    };
    const dailyRecords = await tx.select({
      id: flockDailyRecords.id, flockId: flockDailyRecords.flockId,
      recordDate: productionCalendarDate(flockDailyRecords.recordDate),
      dayNumber: flockDailyRecords.dayNumber, mortality: flockDailyRecords.mortality,
      averageWeight: flockDailyRecords.averageWeight,
    }).from(flockDailyRecords);
    const harvests = await tx.select({
      id: harvestRecords.id, flockId: harvestRecords.flockId,
      harvestDate: productionCalendarDate(harvestRecords.harvestDate),
      chickenCountLoaded: harvestRecords.chickenCountLoaded,
    }).from(harvestRecords);
    const catches = await tx.select({
      id: catchSessions.id, flockId: catchSessions.flockId,
      catchDate: productionCalendarDate(catchSessions.catchDate),
      harvestRecordId: catchSessions.harvestRecordId, status: catchSessions.status,
    }).from(catchSessions);
    return { timezone, source: { houses: reportHouses, flocks: reportFlocks, dailyRecords, harvests, catches } };
  }, { isolationLevel: "repeatable read" });
}
