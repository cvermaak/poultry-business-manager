import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { crateTypes } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import {
  detectSeason,
  calculateDensityRecommendation,
  calculateDistribution,
  type Season,
  type CrateType,
} from "../utils/density-calculator";

/**
 * Calculate seasonal density recommendation and distribution plan
 */
export const calculateDensityPlan = protectedProcedure
  .input(z.object({
    crateTypeId: z.number(),
    catchDate: z.string(),
    targetBirds: z.number(),
    availableCrates: z.number(),
    transportDurationHours: z.number().optional(),
  }))
  .mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    // Fetch crate type
    const [crateType] = await db
      .select()
      .from(crateTypes)
      .where(eq(crateTypes.id, input.crateTypeId))
      .limit(1);

    if (!crateType) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Crate type not found",
      });
    }

    // Convert crate type to calculator format
    const crateForCalc: CrateType = {
      id: crateType.id,
      name: crateType.name,
      length: parseFloat(crateType.length),
      width: parseFloat(crateType.width),
      height: parseFloat(crateType.height),
      tareWeight: parseFloat(crateType.tareWeight),
    };

    // Detect season from catch date
    const catchDate = new Date(input.catchDate);
    const season = detectSeason(catchDate);

    // Calculate density recommendation
    const recommendation = calculateDensityRecommendation(
      crateForCalc,
      season,
      input.transportDurationHours
    );

    // Calculate distribution plan
    const distribution = calculateDistribution(
      input.targetBirds,
      input.availableCrates,
      recommendation
    );

    return {
      season,
      recommendation,
      distribution,
      crateType: {
        id: crateType.id,
        name: crateType.name,
        floorAreaM2: recommendation.floorAreaM2,
      },
    };
  });

export const densityRouter = router({
  calculatePlan: calculateDensityPlan,
});
