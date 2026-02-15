import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { catchSessions, catchBatches } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

/**
 * Calculate actual distribution progress from catch batches
 * Compares actual crate densities against planned distribution
 */
export const catchProgressRouter = router({
  /**
   * Get distribution progress for an active catch session
   */
  getDistributionProgress: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
    }))
    .query(async ({ input }: { input: { sessionId: number } }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      // Get session with planned distribution
      const [session] = await db
        .select()
        .from(catchSessions)
        .where(eq(catchSessions.id, input.sessionId))
        .limit(1);

      if (!session) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      }

      // Get all catch batches for this session
      const batches = await db
        .select()
        .from(catchBatches)
        .where(eq(catchBatches.sessionId, input.sessionId));

      // If no planned distribution, return basic stats
      if (!session.plannedStandardDensity) {
        const totalCrates = batches.reduce((sum: number, b: typeof batches[0]) => sum + b.numberOfCrates, 0);
        const totalBirds = batches.reduce((sum: number, b: typeof batches[0]) => sum + b.totalBirds, 0);
        
        return {
          hasPlannedDistribution: false,
          totalCrates,
          totalBirds,
          averageDensity: totalCrates > 0 ? Math.round(totalBirds / totalCrates) : 0,
        };
      }

      // Calculate actual distribution based on planned densities
      const { 
        plannedStandardDensity, 
        plannedStandardCrates, 
        plannedOddDensity, 
        plannedOddCrates 
      } = session;
      
      // Ensure non-null values
      const standardCratesPlanned = plannedStandardCrates ?? 0;
      const oddCratesPlanned = plannedOddCrates ?? 0;
      const oddDensityPlanned = plannedOddDensity ?? 0;

      // Categorize each batch's crates
      let actualStandardCrates = 0;
      let actualOddCrates = 0;
      let actualOffPlanCrates = 0;
      const offPlanDensities: number[] = [];

      for (const batch of batches) {
        const avgDensity = Math.round(batch.totalBirds / batch.numberOfCrates);
        
        if (avgDensity === plannedStandardDensity) {
          actualStandardCrates += batch.numberOfCrates;
        } else if (plannedOddDensity && avgDensity === plannedOddDensity) {
          actualOddCrates += batch.numberOfCrates;
        } else {
          actualOffPlanCrates += batch.numberOfCrates;
          offPlanDensities.push(avgDensity);
        }
      }

      const totalCrates = actualStandardCrates + actualOddCrates + actualOffPlanCrates;
      const totalBirds = batches.reduce((sum: number, b: typeof batches[0]) => sum + b.totalBirds, 0);

      // Calculate progress percentages
      const standardProgress = standardCratesPlanned > 0 
        ? Math.round((actualStandardCrates / standardCratesPlanned) * 100)
        : 0;
      
      const oddProgress = oddCratesPlanned > 0
        ? Math.round((actualOddCrates / oddCratesPlanned) * 100)
        : 0;

      // Determine status
      const isOnTrack = actualOffPlanCrates <= (totalCrates * 0.05); // Allow 5% deviation
      const isComplete = 
        actualStandardCrates >= standardCratesPlanned &&
        (oddCratesPlanned === 0 || actualOddCrates >= oddCratesPlanned);

      return {
        hasPlannedDistribution: true,
        planned: {
          standardDensity: plannedStandardDensity,
          standardCrates: standardCratesPlanned,
          oddDensity: oddDensityPlanned,
          oddCrates: oddCratesPlanned,
          totalCrates: standardCratesPlanned + oddCratesPlanned,
        },
        actual: {
          standardCrates: actualStandardCrates,
          oddCrates: actualOddCrates,
          offPlanCrates: actualOffPlanCrates,
          totalCrates,
          totalBirds,
        },
        progress: {
          standardProgress,
          oddProgress,
          isOnTrack,
          isComplete,
        },
        offPlanDetails: offPlanDensities.length > 0 ? {
          count: actualOffPlanCrates,
          densities: offPlanDensities,
        } : null,
      };
    }),
});
