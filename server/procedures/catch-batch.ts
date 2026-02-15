import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { crateTypes, catchSessions, catchBatches } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

/**
 * Add batch of crates (for digital scale stack or platform scale methods)
 * 
 * This procedure handles batch weighing where multiple crates are weighed together:
 * - Digital Scale Stack: Multiple crates stacked, single weight reading
 * - Platform Scale: Multiple crates on pallet, single weight reading
 * 
 * The procedure:
 * 1. Takes total gross weight for all crates
 * 2. Subtracts pallet weight (if platform scale method)
 * 3. Subtracts all crate tare weights
 * 4. Calculates average bird weight
 * 5. Creates ONE batch record (not individual crate records)
 */
export const addCatchCrateBatch = protectedProcedure
  .input(z.object({
    sessionId: z.number(),
    crateTypeId: z.number(),
    numberOfCrates: z.number().positive().max(50), // Max 50 crates per batch
    birdsPerCrate: z.number().positive(),
    totalGrossWeight: z.number().positive(), // Total weight including crates (and pallet if applicable)
    crateWeight: z.number().positive(), // Manual crate weight entry (overrides crate type tare weight)
    palletWeight: z.number().optional(), // Only for platform scale method
  }))
  .mutation(async ({ input }: { input: any }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    // Get session to check weighing method
    const session = await db
      .select()
      .from(catchSessions)
      .where(eq(catchSessions.id, input.sessionId))
      .limit(1);

    if (!session.length) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Catch session not found",
      });
    }

    // Get crate type for reference
    const crateType = await db
      .select()
      .from(crateTypes)
      .where(eq(crateTypes.id, input.crateTypeId))
      .limit(1);

    if (!crateType.length) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Crate type not found",
      });
    }

    // Calculate net weight
    // Use manual crate weight from input instead of crate type tare weight
    const totalCrateWeight = input.crateWeight * input.numberOfCrates;
    const palletWeight = input.palletWeight || 0;
    const totalNetWeight = input.totalGrossWeight - totalCrateWeight - palletWeight;

    if (totalNetWeight <= 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Net weight is negative or zero. Check your weights.",
      });
    }

    // Calculate totals
    const totalBirds = input.birdsPerCrate * input.numberOfCrates;
    const averageBirdWeight = totalNetWeight / totalBirds;

    // Get current batch count for numbering
    const existingBatches = await db
      .select()
      .from(catchBatches)
      .where(eq(catchBatches.sessionId, input.sessionId));

    const batchNumber = existingBatches.length + 1;

    // Create single batch record
    await db.insert(catchBatches).values({
      sessionId: input.sessionId,
      crateTypeId: input.crateTypeId,
      batchNumber,
      numberOfCrates: input.numberOfCrates,
      birdsPerCrate: input.birdsPerCrate,
      totalBirds,
      totalGrossWeight: input.totalGrossWeight.toString(),
      crateWeight: input.crateWeight.toString(),
      palletWeight: palletWeight > 0 ? palletWeight.toString() : null,
      totalNetWeight: totalNetWeight.toString(),
      averageBirdWeight: averageBirdWeight.toString(),
    });

    // Update session totals
    const allBatches = await db
      .select()
      .from(catchBatches)
      .where(eq(catchBatches.sessionId, input.sessionId));

    const sessionTotalBirds = allBatches.reduce((sum: number, b: any) => sum + b.totalBirds, 0);
    const sessionTotalWeight = allBatches.reduce((sum: number, b: any) => sum + parseFloat(b.totalNetWeight), 0);
    const sessionAvgWeight = sessionTotalBirds > 0 ? sessionTotalWeight / sessionTotalBirds : 0;
    const sessionTotalCrates = allBatches.reduce((sum: number, b: any) => sum + b.numberOfCrates, 0);

    await db
      .update(catchSessions)
      .set({
        totalBirdsCaught: sessionTotalBirds,
        totalNetWeight: sessionTotalWeight.toString(),
        totalCrates: sessionTotalCrates,
        averageBirdWeight: sessionAvgWeight.toString(),
      })
      .where(eq(catchSessions.id, input.sessionId));

    return {
      success: true,
      batchNumber,
      cratesInBatch: input.numberOfCrates,
      totalBirds,
      totalNetWeight,
      averageBirdWeight,
    };
  });


/**
 * Update existing batch record
 */
export const updateCatchBatch = protectedProcedure
  .input(z.object({
    batchId: z.number(),
    numberOfCrates: z.number().positive().max(50).optional(),
    birdsPerCrate: z.number().positive().optional(),
    totalGrossWeight: z.number().positive().optional(),
    crateWeight: z.number().positive().optional(),
    palletWeight: z.number().optional(),
  }))
  .mutation(async ({ input }: { input: any }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    // Get existing batch
    const existingBatch = await db
      .select()
      .from(catchBatches)
      .where(eq(catchBatches.id, input.batchId))
      .limit(1);

    if (!existingBatch.length) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Batch not found",
      });
    }

    const batch = existingBatch[0];

    // Use existing values if not provided
    const numberOfCrates = input.numberOfCrates ?? batch.numberOfCrates;
    const birdsPerCrate = input.birdsPerCrate ?? batch.birdsPerCrate;
    const totalGrossWeight = input.totalGrossWeight ?? parseFloat(batch.totalGrossWeight);
    const crateWeight = input.crateWeight ?? parseFloat(batch.crateWeight);
    const palletWeight = input.palletWeight ?? (batch.palletWeight ? parseFloat(batch.palletWeight) : 0);

    // Recalculate totals
    const totalCrateWeight = crateWeight * numberOfCrates;
    const totalNetWeight = totalGrossWeight - totalCrateWeight - palletWeight;

    if (totalNetWeight <= 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Net weight is negative or zero. Check your weights.",
      });
    }

    const totalBirds = birdsPerCrate * numberOfCrates;
    const averageBirdWeight = totalNetWeight / totalBirds;

    // Update batch record
    await db
      .update(catchBatches)
      .set({
        numberOfCrates,
        birdsPerCrate,
        totalBirds,
        totalGrossWeight: totalGrossWeight.toString(),
        crateWeight: crateWeight.toString(),
        palletWeight: palletWeight > 0 ? palletWeight.toString() : null,
        totalNetWeight: totalNetWeight.toString(),
        averageBirdWeight: averageBirdWeight.toString(),
      })
      .where(eq(catchBatches.id, input.batchId));

    // Update session totals
    const allBatches = await db
      .select()
      .from(catchBatches)
      .where(eq(catchBatches.sessionId, batch.sessionId));

    const sessionTotalBirds = allBatches.reduce((sum: number, b: any) => sum + b.totalBirds, 0);
    const sessionTotalWeight = allBatches.reduce((sum: number, b: any) => sum + parseFloat(b.totalNetWeight), 0);
    const sessionAvgWeight = sessionTotalBirds > 0 ? sessionTotalWeight / sessionTotalBirds : 0;
    const sessionTotalCrates = allBatches.reduce((sum: number, b: any) => sum + b.numberOfCrates, 0);

    await db
      .update(catchSessions)
      .set({
        totalBirdsCaught: sessionTotalBirds,
        totalNetWeight: sessionTotalWeight.toString(),
        totalCrates: sessionTotalCrates,
        averageBirdWeight: sessionAvgWeight.toString(),
      })
      .where(eq(catchSessions.id, batch.sessionId));

    return {
      success: true,
      totalNetWeight,
      averageBirdWeight,
    };
  });

/**
 * Delete batch record
 */
export const deleteCatchBatch = protectedProcedure
  .input(z.object({
    batchId: z.number(),
  }))
  .mutation(async ({ input }: { input: any }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    // Get batch to find session ID
    const batch = await db
      .select()
      .from(catchBatches)
      .where(eq(catchBatches.id, input.batchId))
      .limit(1);

    if (!batch.length) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Batch not found",
      });
    }

    const sessionId = batch[0].sessionId;

    // Delete batch
    await db
      .delete(catchBatches)
      .where(eq(catchBatches.id, input.batchId));

    // Update session totals
    const allBatches = await db
      .select()
      .from(catchBatches)
      .where(eq(catchBatches.sessionId, sessionId));

    const sessionTotalBirds = allBatches.reduce((sum: number, b: any) => sum + b.totalBirds, 0);
    const sessionTotalWeight = allBatches.reduce((sum: number, b: any) => sum + parseFloat(b.totalNetWeight), 0);
    const sessionAvgWeight = sessionTotalBirds > 0 ? sessionTotalWeight / sessionTotalBirds : 0;
    const sessionTotalCrates = allBatches.reduce((sum: number, b: any) => sum + b.numberOfCrates, 0);

    await db
      .update(catchSessions)
      .set({
        totalBirdsCaught: sessionTotalBirds,
        totalNetWeight: sessionTotalWeight.toString(),
        totalCrates: sessionTotalCrates,
        averageBirdWeight: sessionAvgWeight.toString(),
      })
      .where(eq(catchSessions.id, sessionId));

    return {
      success: true,
    };
  });
