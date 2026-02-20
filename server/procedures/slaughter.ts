import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import {
  createSlaughterBatch,
  getSlaughterBatchesByFlock,
  getSlaughterBatchSummary,
  createSlaughterCatchRecord,
  deleteSlaughterCatchRecord,
  getCatchRecordById,
  createSlaughterhouseRecord,
} from "../helpers/slaughter-db";
import {
  calculateShrinkage,
  calculateEstimatedSlaughterhouseWeight,
  calculateWeightVariance,
} from "../helpers/shrinkage";

export const slaughterRouter = router({
  // Create a new slaughter batch
  createBatch: protectedProcedure
    .input(
      z.object({
        flockId: z.number(),
        batchNumber: z.string(),
        transportTimeHours: z.number().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await createSlaughterBatch({
        flockId: input.flockId,
        batchNumber: input.batchNumber,
        startDate: new Date(),
        transportTimeHours: input.transportTimeHours
          ? (input.transportTimeHours.toFixed(2) as any)
          : undefined,
        notes: input.notes,
        createdBy: ctx.user.id,
      });
      await db.logUserActivity(
        ctx.user.id,
        "create_slaughter_batch",
        "slaughter_batch",
        input.flockId,
        `Created batch ${input.batchNumber}`
      );
      return result;
    }),

  // Get all batches for a flock
  getBatchesByFlock: protectedProcedure
    .input(z.object({ flockId: z.number() }))
    .query(async ({ input }) => {
      return await getSlaughterBatchesByFlock(input.flockId);
    }),

  // Get batch with details
  getBatchById: protectedProcedure
    .input(z.object({ batchId: z.number() }))
    .query(async ({ input }) => {
      return await getSlaughterBatchSummary(input.batchId);
    }),

  // Add a catch record to a batch
  addCatchRecord: protectedProcedure
    .input(
      z.object({
        batchId: z.number(),
        catchDate: z.date(),
        dayNumber: z.number(),
        birdsCaught: z.number().int().positive(),
        averageWeightAtFarm: z.number().positive(),
        feedRemovalHours: z.number().int().nonnegative(),
        transportTimeHours: z.number().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Calculate shrinkage
      const shrinkage = calculateShrinkage(
        input.feedRemovalHours,
        input.transportTimeHours || 2
      );
      const estimatedWeight = calculateEstimatedSlaughterhouseWeight(
        input.averageWeightAtFarm,
        shrinkage.totalShrinkagePercent
      );

      const result = await createSlaughterCatchRecord({
        batchId: input.batchId,
        catchDate: input.catchDate,
        dayNumber: input.dayNumber,
        birdsCaught: input.birdsCaught,
        averageWeightAtFarm: input.averageWeightAtFarm.toString() as any,
        feedRemovalHours: input.feedRemovalHours,
        gutEvacuationPercent: shrinkage.gutEvacuationPercent.toString() as any,
        catchingHandlingPercent: shrinkage.catchingHandlingPercent.toString() as any,
        loadingHoldingPercent: shrinkage.loadingHoldingPercent.toString() as any,
        transportPercent: shrinkage.transportPercent.toString() as any,
        totalShrinkagePercent: shrinkage.totalShrinkagePercent.toString() as any,
        estimatedWeightAtSlaughterhouse: estimatedWeight.toString() as any,
        notes: input.notes,
        createdBy: ctx.user.id,
      });

      await db.logUserActivity(
        ctx.user.id,
        "add_catch_record",
        "slaughter_catch_record",
        input.batchId,
        `Added catch record: ${input.birdsCaught} birds`
      );
      return result;
    }),

  // Delete a catch record
  deleteCatchRecord: protectedProcedure
    .input(z.object({ catchRecordId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await deleteSlaughterCatchRecord(input.catchRecordId);
      await db.logUserActivity(
        ctx.user.id,
        "delete_catch_record",
        "slaughter_catch_record",
        input.catchRecordId,
        "Deleted catch record"
      );
      return { success: true };
    }),

  // Add slaughterhouse data
  addSlaughterhouseRecord: protectedProcedure
    .input(
      z.object({
        catchRecordId: z.number(),
        actualWeightAtSlaughterhouse: z.number().positive(),
        slaughterhouseReference: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const catchRecord = await getCatchRecordById(input.catchRecordId);
      if (!catchRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Catch record not found",
        });
      }

      const estimatedWeight = parseFloat(
        catchRecord.estimatedWeightAtSlaughterhouse.toString()
      );
      const { variance, variancePercent } = calculateWeightVariance(
        estimatedWeight,
        input.actualWeightAtSlaughterhouse
      );

      const result = await createSlaughterhouseRecord({
        catchRecordId: input.catchRecordId,
        actualWeightAtSlaughterhouse: input.actualWeightAtSlaughterhouse.toString() as any,
        variance: variance.toString() as any,
        variancePercent: variancePercent.toString() as any,
        slaughterhouseReference: input.slaughterhouseReference,
        receivedDate: new Date(),
        notes: input.notes,
        createdBy: ctx.user.id,
      });

      await db.logUserActivity(
        ctx.user.id,
        "add_slaughterhouse_record",
        "slaughterhouse_record",
        input.catchRecordId,
        `Added slaughterhouse data`
      );
      return result;
    }),
});
