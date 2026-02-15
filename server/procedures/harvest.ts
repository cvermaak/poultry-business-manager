import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { harvestRecords, flocks } from "../../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";

/**
 * Calculate derived fields for harvest record
 */
function calculateDerivedFields(data: any) {
  const derived: any = {};

  // Feed withdrawal duration (hours)
  if (data.feedWithdrawalStartTime && data.harvestStartTime) {
    const withdrawalMs = new Date(data.harvestStartTime).getTime() - new Date(data.feedWithdrawalStartTime).getTime();
    derived.feedWithdrawalDurationHours = (withdrawalMs / (1000 * 60 * 60)).toFixed(2);
  }

  // Average loaded weight
  if (data.chickenCountLoaded && data.totalLoadedWeightKg) {
    derived.averageLoadedWeightKg = (parseFloat(data.totalLoadedWeightKg) / data.chickenCountLoaded).toFixed(3);
  }

  // Travel duration (hours)
  if (data.transportDepartTime && data.transportArrivalTime) {
    const travelMs = new Date(data.transportArrivalTime).getTime() - new Date(data.transportDepartTime).getTime();
    derived.travelDurationHours = (travelMs / (1000 * 60 * 60)).toFixed(2);
  }

  // Average delivered weight
  if (data.chickenCountDelivered && data.totalDeliveredWeightKg) {
    derived.averageDeliveredWeightKg = (parseFloat(data.totalDeliveredWeightKg) / data.chickenCountDelivered).toFixed(3);
  }

  // Shrinkage percentage
  if (data.totalLoadedWeightKg && data.totalDeliveredWeightKg) {
    const shrinkage = ((parseFloat(data.totalLoadedWeightKg) - parseFloat(data.totalDeliveredWeightKg)) / parseFloat(data.totalLoadedWeightKg)) * 100;
    derived.shrinkagePercentage = shrinkage.toFixed(2);
  }

  // Total revenue
  if (data.pricePerKg && data.totalDeliveredWeightKg) {
    derived.totalRevenue = (parseFloat(data.pricePerKg) * parseFloat(data.totalDeliveredWeightKg)).toFixed(2);
  }

  return derived;
}

/**
 * Update flock current count and status after harvest
 */
async function updateFlockAfterHarvest(flockId: number, chickenCountLoaded: number) {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  
  // Get current flock data
  const [flock] = await db.select().from(flocks).where(eq(flocks.id, flockId));
  if (!flock) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Flock not found" });
  }

  const newCount = flock.currentCount - chickenCountLoaded;
  
  // Determine new status
  let newStatus = flock.status;
  if (newCount <= 0) {
    newStatus = "completed";
  } else if (flock.status === "active") {
    newStatus = "harvesting";
  }

  // Update flock
  await db.update(flocks)
    .set({ 
      currentCount: Math.max(0, newCount),
      status: newStatus,
      updatedAt: new Date(),
    })
    .where(eq(flocks.id, flockId));

  return { newCount: Math.max(0, newCount), newStatus };
}

const harvestInputSchema = z.object({
  flockId: z.number(),
  harvestDate: z.string().or(z.date()),
  harvestStartTime: z.string().or(z.date()),
  harvestDurationMinutes: z.number().optional(),
  feedWithdrawalStartTime: z.string().or(z.date()).optional(),
  destination: z.string().optional(),
  chickenCountLoaded: z.number(),
  totalLoadedWeightKg: z.number(),
  totalCrates: z.number().optional(),
  oddCrateCount: z.number().optional(),
  oddCrateWeightKg: z.number().optional(),
  transportDepartTime: z.string().or(z.date()).optional(),
  transportArrivalTime: z.string().or(z.date()).optional(),
  chickenCountDelivered: z.number().optional(),
  totalDeliveredWeightKg: z.number().optional(),
  transportMortalities: z.number().optional(),
  pricePerKg: z.number().optional(),
  paymentTerms: z.string().optional(),
  invoiceReference: z.string().optional(),
  notes: z.string().optional(),
});

export const harvestRouter = router({
  /**
   * Create a new harvest record
   */
  create: protectedProcedure
    .input(harvestInputSchema)
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Convert string dates to Date objects for database insertion
      const processedInput = {
        ...input,
        harvestDate: input.harvestDate instanceof Date ? input.harvestDate : new Date(input.harvestDate),
        harvestStartTime: input.harvestStartTime instanceof Date ? input.harvestStartTime : new Date(input.harvestStartTime),
        feedWithdrawalStartTime: input.feedWithdrawalStartTime 
          ? (input.feedWithdrawalStartTime instanceof Date ? input.feedWithdrawalStartTime : new Date(input.feedWithdrawalStartTime))
          : undefined,
        transportDepartTime: input.transportDepartTime
          ? (input.transportDepartTime instanceof Date ? input.transportDepartTime : new Date(input.transportDepartTime))
          : undefined,
        transportArrivalTime: input.transportArrivalTime
          ? (input.transportArrivalTime instanceof Date ? input.transportArrivalTime : new Date(input.transportArrivalTime))
          : undefined,
      };

      // Calculate derived fields
      const derived = calculateDerivedFields(processedInput);

      // Insert harvest record
      const [result] = await db.insert(harvestRecords).values({
        ...processedInput,
        ...derived,
        recordedBy: ctx.user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Update flock current count and status
      await updateFlockAfterHarvest(input.flockId, input.chickenCountLoaded);

      return { id: result.insertId, success: true };
    }),

  /**
   * Update an existing harvest record
   */
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      data: harvestInputSchema.omit({ flockId: true }).partial(),
    }))
    .mutation(async ({ input }) => {
      console.log('[Harvest Update] Starting update for ID:', input.id);
      console.log('[Harvest Update] Input data:', JSON.stringify(input.data, null, 2));
      
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Get original record to restore flock count if needed
      const [original] = await db.select().from(harvestRecords).where(eq(harvestRecords.id, input.id));
      if (!original) {
        console.error('[Harvest Update] Record not found for ID:', input.id);
        throw new TRPCError({ code: "NOT_FOUND", message: "Harvest record not found" });
      }
      console.log('[Harvest Update] Original record found:', original.id);

      // Convert string dates to Date objects for database update
      const processedData: any = { ...input.data };
      if (processedData.harvestDate) {
        processedData.harvestDate = processedData.harvestDate instanceof Date ? processedData.harvestDate : new Date(processedData.harvestDate);
      }
      if (processedData.harvestStartTime) {
        processedData.harvestStartTime = processedData.harvestStartTime instanceof Date ? processedData.harvestStartTime : new Date(processedData.harvestStartTime);
      }
      if (processedData.feedWithdrawalStartTime) {
        processedData.feedWithdrawalStartTime = processedData.feedWithdrawalStartTime instanceof Date ? processedData.feedWithdrawalStartTime : new Date(processedData.feedWithdrawalStartTime);
      }
      if (processedData.transportDepartTime) {
        processedData.transportDepartTime = processedData.transportDepartTime instanceof Date ? processedData.transportDepartTime : new Date(processedData.transportDepartTime);
      }
      if (processedData.transportArrivalTime) {
        processedData.transportArrivalTime = processedData.transportArrivalTime instanceof Date ? processedData.transportArrivalTime : new Date(processedData.transportArrivalTime);
      }

      // Calculate derived fields
      const derived = calculateDerivedFields({ ...original, ...processedData });
      console.log('[Harvest Update] Derived fields:', derived);

      // Update harvest record
      console.log('[Harvest Update] Updating database with processed data...');
      await db.update(harvestRecords)
        .set({
          ...processedData,
          ...derived,
          updatedAt: new Date(),
        })
        .where(eq(harvestRecords.id, input.id));
      console.log('[Harvest Update] Database update completed');

      // If chicken count changed, adjust flock count
      if (input.data.chickenCountLoaded && input.data.chickenCountLoaded !== original.chickenCountLoaded) {
        const countDiff = input.data.chickenCountLoaded - original.chickenCountLoaded;
        const [flock] = await db.select().from(flocks).where(eq(flocks.id, original.flockId));
        if (flock) {
          await db.update(flocks)
            .set({ 
              currentCount: Math.max(0, flock.currentCount - countDiff),
              updatedAt: new Date(),
            })
            .where(eq(flocks.id, original.flockId));
        }
      }

      console.log('[Harvest Update] Update procedure completed successfully');
      return { success: true };
    }),

  /**
   * Delete a harvest record
   */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Get record to restore flock count
      const [record] = await db.select().from(harvestRecords).where(eq(harvestRecords.id, input.id));
      if (!record) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Harvest record not found" });
      }

      // Restore flock count
      const [flock] = await db.select().from(flocks).where(eq(flocks.id, record.flockId));
      if (flock) {
        const restoredCount = flock.currentCount + record.chickenCountLoaded;
        
        // Determine new status
        let newStatus = flock.status;
        if (flock.status === "completed" && restoredCount > 0) {
          // Check if there are other harvests
          const otherHarvests = await db.select().from(harvestRecords)
            .where(and(
              eq(harvestRecords.flockId, record.flockId),
              eq(harvestRecords.id, input.id) // Exclude current record
            ));
          
          newStatus = otherHarvests.length > 0 ? "harvesting" : "active";
        }

        await db.update(flocks)
          .set({ 
            currentCount: restoredCount,
            status: newStatus,
            updatedAt: new Date(),
          })
          .where(eq(flocks.id, record.flockId));
      }

      // Delete harvest record
      await db.delete(harvestRecords).where(eq(harvestRecords.id, input.id));

      return { success: true };
    }),

  /**
   * Get all harvest records
   */
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const records = await db.select().from(harvestRecords).orderBy(desc(harvestRecords.harvestDate));
    return records;
  }),

  /**
   * Get harvest records for a specific flock
   */
  getByFlock: protectedProcedure
    .input(z.object({ flockId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const records = await db.select()
        .from(harvestRecords)
        .where(eq(harvestRecords.flockId, input.flockId))
        .orderBy(desc(harvestRecords.harvestDate));
      return records;
    }),

  /**
   * Get a single harvest record by ID
   */
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const [record] = await db.select().from(harvestRecords).where(eq(harvestRecords.id, input.id));
      if (!record) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Harvest record not found" });
      }
      return record;
    }),

  /**
   * Get harvest performance analytics for a flock
   * Returns delivered weight vs target weight for each catch
   */
  getHarvestPerformance: protectedProcedure
    .input(z.object({ flockId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      // Get flock target weight
      const [flock] = await db.select().from(flocks).where(eq(flocks.id, input.flockId));
      if (!flock) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Flock not found" });
      }

      // Get all harvests for this flock
      const harvests = await db.select()
        .from(harvestRecords)
        .where(eq(harvestRecords.flockId, input.flockId))
        .orderBy(harvestRecords.harvestDate);

      // Calculate performance for each harvest
      const performance = harvests.map((harvest, index) => {
        const deliveredWeight = harvest.averageDeliveredWeightKg ? parseFloat(harvest.averageDeliveredWeightKg) : 0;
        const targetWeight = flock.targetDeliveredWeight ? parseFloat(flock.targetDeliveredWeight.toString()) : 0;
        const variance = deliveredWeight - targetWeight;
        const variancePercent = targetWeight > 0 ? (variance / targetWeight) * 100 : 0;

        return {
          catchNumber: index + 1,
          catchDate: harvest.harvestDate,
          deliveredWeight,
          targetWeight,
          variance,
          variancePercent,
          chickenCount: harvest.chickenCountDelivered || harvest.chickenCountLoaded,
        };
      });

      return performance;
    }),

  /**
   * Get shrinkage analysis across all harvests or for a specific flock
   */
  getShrinkageAnalysis: protectedProcedure
    .input(z.object({ flockId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Build query based on whether flockId is provided
      let query = db.select().from(harvestRecords);
      if (input.flockId) {
        query = query.where(eq(harvestRecords.flockId, input.flockId)) as any;
      }
      
      const harvests = await query.orderBy(harvestRecords.harvestDate);

      // Filter harvests that have complete shrinkage data
      const validHarvests = harvests.filter(h => 
        h.shrinkagePercentage && 
        h.travelDurationHours &&
        h.totalLoadedWeightKg &&
        h.totalDeliveredWeightKg
      );

      // Map to shrinkage data points
      const shrinkageData = validHarvests.map(harvest => ({
        catchDate: harvest.harvestDate,
        shrinkagePercent: parseFloat(harvest.shrinkagePercentage || "0"),
        travelDuration: parseFloat(harvest.travelDurationHours || "0"),
        feedWithdrawalDuration: parseFloat(harvest.feedWithdrawalDurationHours || "0"),
        loadedWeight: parseFloat(harvest.averageLoadedWeightKg || "0"),
        deliveredWeight: parseFloat(harvest.averageDeliveredWeightKg || "0"),
        chickenCount: harvest.chickenCountDelivered || harvest.chickenCountLoaded,
      }));

      return shrinkageData;
    }),

  /**
   * Get harvest comparison across multiple flocks
   */
  getHarvestComparison: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Get all flocks with their harvests
      const allFlocks = await db.select().from(flocks);
      const allHarvests = await db.select().from(harvestRecords).orderBy(harvestRecords.harvestDate);

      // Group harvests by flock and calculate metrics
      const flockMetrics = allFlocks
        .map(flock => {
          const flockHarvests = allHarvests.filter(h => h.flockId === flock.id);
          
          if (flockHarvests.length === 0) return null;

          const totalBirdsHarvested = flockHarvests.reduce((sum, h) => sum + (h.chickenCountDelivered || h.chickenCountLoaded), 0);
          const totalDeliveredWeight = flockHarvests.reduce((sum, h) => sum + parseFloat(h.totalDeliveredWeightKg || "0"), 0);
          const avgDeliveredWeight = totalBirdsHarvested > 0 ? totalDeliveredWeight / totalBirdsHarvested : 0;
          
          const validShrinkage = flockHarvests.filter(h => h.shrinkagePercentage);
          const avgShrinkage = validShrinkage.length > 0
            ? validShrinkage.reduce((sum, h) => sum + parseFloat(h.shrinkagePercentage || "0"), 0) / validShrinkage.length
            : 0;

          const totalRevenue = flockHarvests.reduce((sum, h) => sum + parseFloat(h.totalRevenue || "0"), 0);

          return {
            flockId: flock.id,
            flockNumber: flock.flockNumber,
            placementDate: flock.placementDate,
            targetDeliveredWeight: flock.targetDeliveredWeight ? parseFloat(flock.targetDeliveredWeight.toString()) : 0,
            catchCount: flockHarvests.length,
            totalBirdsHarvested,
            avgDeliveredWeight,
            avgShrinkage,
            totalRevenue,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      return flockMetrics;
    }),
});
