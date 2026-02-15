import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { harvestRecords, flocks } from "../../drizzle/schema";
import { getDb } from "../db";
import { eq, desc, sql, and, gte, lte } from "drizzle-orm";

/**
 * Harvest Analytics Procedures
 * Advanced analytics for harvest performance, shrinkage analysis, and comparisons
 */

export const harvestAnalyticsRouter = router({
  /**
   * Get harvest performance metrics for a specific flock
   * Shows delivered weight vs target across all catches
   */
  getHarvestPerformance: protectedProcedure
    .input(z.object({ flockId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();

      // Get flock details
      const [flock] = await db!
        .select()
        .from(flocks)
        .where(eq(flocks.id, input.flockId))
        .limit(1);

      if (!flock) return null;

      // Get all harvests for this flock
      const harvests = await db!
        .select()
        .from(harvestRecords)
        .where(eq(harvestRecords.flockId, input.flockId))
        .orderBy(harvestRecords.harvestDate);

      // Calculate metrics
      const totalHarvested = harvests.reduce((sum, h) => sum + (h.chickenCountDelivered || 0), 0);
      const totalDeliveredWeight = harvests.reduce((sum, h) => sum + parseFloat(h.totalDeliveredWeightKg?.toString() || "0"), 0);
      const totalRevenue = harvests.reduce((sum, h) => sum + parseFloat(h.totalRevenue?.toString() || "0"), 0);
      const avgDeliveredWeight = totalHarvested > 0 ? totalDeliveredWeight / totalHarvested : 0;
      const avgShrinkage = harvests.length > 0
        ? harvests.reduce((sum, h) => sum + parseFloat(h.shrinkagePercentage?.toString() || "0"), 0) / harvests.length
        : 0;

      // Target metrics
      const targetDeliveredWeight = parseFloat(flock.targetDeliveredWeight?.toString() || "0");
      const weightDeviation = avgDeliveredWeight - targetDeliveredWeight;
      const weightDeviationPercent = targetDeliveredWeight > 0 
        ? (weightDeviation / targetDeliveredWeight) * 100 
        : 0;

      return {
        flock: {
          id: flock.id,
          flockNumber: flock.flockNumber,
          initialCount: flock.initialCount,
          targetDeliveredWeight,
        },
        summary: {
          totalCatches: harvests.length,
          totalHarvested,
          totalDeliveredWeight,
          avgDeliveredWeight,
          avgShrinkage,
          totalRevenue,
          weightDeviation,
          weightDeviationPercent,
        },
        harvests: harvests.map((h) => ({
          id: h.id,
          harvestDate: h.harvestDate,
          chickenCountDelivered: h.chickenCountDelivered,
          totalDeliveredWeightKg: parseFloat(h.totalDeliveredWeightKg?.toString() || "0"),
          averageDeliveredWeightKg: parseFloat(h.averageDeliveredWeightKg?.toString() || "0"),
          shrinkagePercentage: parseFloat(h.shrinkagePercentage?.toString() || "0"),
          revenue: parseFloat(h.totalRevenue?.toString() || "0"),
        })),
      };
    }),

  /**
   * Get shrinkage analysis across all harvests
   * Identify patterns and optimization opportunities
   */
  getShrinkageAnalysis: protectedProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();

      let query = db!
        .select({
          id: harvestRecords.id,
          flockId: harvestRecords.flockId,
          flockNumber: flocks.flockNumber,
          harvestDate: harvestRecords.harvestDate,
          destination: harvestRecords.destination,
          chickenCountLoaded: harvestRecords.chickenCountLoaded,
          totalLoadedWeightKg: harvestRecords.totalLoadedWeightKg,
          chickenCountDelivered: harvestRecords.chickenCountDelivered,
          totalDeliveredWeightKg: harvestRecords.totalDeliveredWeightKg,
          shrinkagePercentage: harvestRecords.shrinkagePercentage,
          feedWithdrawalDurationHours: harvestRecords.feedWithdrawalDurationHours,
          travelDurationHours: harvestRecords.travelDurationHours,
          transportMortalities: harvestRecords.transportMortalities,
        })
        .from(harvestRecords)
        .leftJoin(flocks, eq(harvestRecords.flockId, flocks.id));

      // Apply date filters if provided
      const conditions: any[] = [];
      if (input.startDate) {
        conditions.push(gte(harvestRecords.harvestDate, new Date(input.startDate)));
      }
      if (input.endDate) {
        conditions.push(lte(harvestRecords.harvestDate, new Date(input.endDate)));
      }
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      const harvests = await query.orderBy(desc(harvestRecords.harvestDate));

      // Calculate aggregate metrics
      const totalHarvests = harvests.length;
      const avgShrinkage = harvests.length > 0
        ? harvests.reduce((sum, h) => sum + parseFloat(h.shrinkagePercentage?.toString() || "0"), 0) / harvests.length
        : 0;
      const maxShrinkage = Math.max(...harvests.map((h) => parseFloat(h.shrinkagePercentage?.toString() || "0")));
      const minShrinkage = Math.min(...harvests.map((h) => parseFloat(h.shrinkagePercentage?.toString() || "0")));

      // Group by destination
      const byDestination = harvests.reduce((acc: any, h) => {
        const dest = h.destination || "Unknown";
        if (!acc[dest]) {
          acc[dest] = {
            destination: dest,
            count: 0,
            totalShrinkage: 0,
            avgShrinkage: 0,
          };
        }
        acc[dest].count++;
        acc[dest].totalShrinkage += parseFloat(h.shrinkagePercentage?.toString() || "0");
        return acc;
      }, {});

      // Calculate averages
      Object.values(byDestination).forEach((dest: any) => {
        dest.avgShrinkage = dest.totalShrinkage / dest.count;
      });

      return {
        summary: {
          totalHarvests,
          avgShrinkage,
          maxShrinkage,
          minShrinkage,
        },
        byDestination: Object.values(byDestination),
        harvests: harvests.map((h) => ({
          id: h.id,
          flockNumber: h.flockNumber,
          harvestDate: h.harvestDate,
          destination: h.destination,
          shrinkagePercentage: parseFloat(h.shrinkagePercentage?.toString() || "0"),
          feedWithdrawalHours: parseFloat(h.feedWithdrawalDurationHours?.toString() || "0"),
          travelHours: parseFloat(h.travelDurationHours?.toString() || "0"),
          mortalities: h.transportMortalities,
        })),
      };
    }),

  /**
   * Compare harvest performance across multiple flocks
   */
  getHarvestComparison: protectedProcedure
    .input(
      z.object({
        flockIds: z.array(z.number()).optional(),
        limit: z.number().default(10),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();

      // Get flocks with their harvest summaries
      let query = db!
        .select({
          flockId: flocks.id,
          flockNumber: flocks.flockNumber,
          initialCount: flocks.initialCount,
          targetDeliveredWeight: flocks.targetDeliveredWeight,
          harvestCount: sql<number>`COUNT(${harvestRecords.id})`,
          totalHarvested: sql<number>`SUM(${harvestRecords.chickenCountDelivered})`,
          avgDeliveredWeight: sql<number>`AVG(${harvestRecords.averageDeliveredWeightKg})`,
          avgShrinkage: sql<number>`AVG(${harvestRecords.shrinkagePercentage})`,
          totalRevenue: sql<number>`SUM(${harvestRecords.totalRevenue})`,
        })
        .from(flocks)
        .leftJoin(harvestRecords, eq(flocks.id, harvestRecords.flockId))
        .groupBy(flocks.id);

      // Filter by specific flocks if provided
      if (input.flockIds && input.flockIds.length > 0) {
        query = query.having(sql`${flocks.id} IN (${sql.join(input.flockIds.map((id) => sql`${id}`), sql`, `)})`) as any;
      }

      const results = await query
        .orderBy(desc(sql`SUM(${harvestRecords.totalRevenue})`))
        .limit(input.limit);

      return results.map((r) => ({
        flockId: r.flockId,
        flockNumber: r.flockNumber,
        initialCount: r.initialCount,
        targetDeliveredWeight: parseFloat(r.targetDeliveredWeight?.toString() || "0"),
        harvestCount: r.harvestCount || 0,
        totalHarvested: r.totalHarvested || 0,
        avgDeliveredWeight: parseFloat(r.avgDeliveredWeight?.toString() || "0"),
        avgShrinkage: parseFloat(r.avgShrinkage?.toString() || "0"),
        totalRevenue: parseFloat(r.totalRevenue?.toString() || "0"),
        weightDeviation: parseFloat(r.avgDeliveredWeight?.toString() || "0") - parseFloat(r.targetDeliveredWeight?.toString() || "0"),
      }));
    }),
});
