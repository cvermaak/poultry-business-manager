import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { crateTypes, catchSessions, catchCrates, catchBatches, flocks, harvestRecords } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { addCatchCrateBatch, updateCatchBatch, deleteCatchBatch } from "./catch-batch";
import { catchReportProcedures } from "./catch-report";

// ============================================================================
// CRATE TYPES MANAGEMENT
// ============================================================================

export const listCrateTypes = protectedProcedure
  .query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const types = await db
      .select()
      .from(crateTypes)
      .where(eq(crateTypes.isActive, 1))
      .orderBy(crateTypes.name);
    return types;
  });

export const createCrateType = protectedProcedure
  .input(z.object({
    name: z.string().min(1),
    length: z.number().positive(),
    width: z.number().positive(),
    height: z.number().positive(),
    tareWeight: z.number().positive(),
    notes: z.string().optional(),
  }))
  .mutation(async ({ input }: { input: any }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    await db.insert(crateTypes).values({
      name: input.name,
      length: input.length.toString(),
      width: input.width.toString(),
      height: input.height.toString(),
      tareWeight: input.tareWeight.toString(),
      notes: input.notes,
    });
    return { success: true };
  });

export const updateCrateType = protectedProcedure
  .input(z.object({
    id: z.number(),
    name: z.string().min(1),
    length: z.number().positive(),
    width: z.number().positive(),
    height: z.number().positive(),
    tareWeight: z.number().positive(),
    notes: z.string().optional(),
  }))
  .mutation(async ({ input }: { input: any }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    await db
      .update(crateTypes)
      .set({
        name: input.name,
        length: input.length.toString(),
        width: input.width.toString(),
        height: input.height.toString(),
        tareWeight: input.tareWeight.toString(),
        notes: input.notes,
      })
      .where(eq(crateTypes.id, input.id));
    return { success: true };
  });

export const deleteCrateType = protectedProcedure
  .input(z.object({ id: z.number() }))
  .mutation(async ({ input }: { input: any }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    // Soft delete
    await db
      .update(crateTypes)
      .set({ isActive: 0 })
      .where(eq(crateTypes.id, input.id));
    return { success: true };
  });

// ============================================================================
// CATCH OPERATIONS
// ============================================================================

export const startCatchSession = protectedProcedure
  .input(z.object({
    flockId: z.number(),
    catchDate: z.string(),
    catchTeam: z.string().optional(),
    weighingMethod: z.enum(["individual", "digital_scale_stack", "platform_scale"]).default("individual"),
    palletWeight: z.number().optional(),
    targetBirds: z.number().optional(),
    targetWeight: z.number().optional(),
    // Planned distribution fields
    crateTypeId: z.number().optional(),
    transportDurationHours: z.number().optional(),
    season: z.string().optional(),
    plannedStandardDensity: z.number().optional(),
    plannedStandardCrates: z.number().optional(),
    plannedOddDensity: z.number().optional(),
    plannedOddCrates: z.number().optional(),
    plannedTotalBirds: z.number().optional(),
    availableCrates: z.number().optional(),
  }))
  .mutation(async ({ input, ctx }: { input: any; ctx: any }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    // Verify flock exists
    const flock = await db
      .select()
      .from(flocks)
      .where(eq(flocks.id, input.flockId))
      .limit(1);

    if (!flock.length) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Flock not found",
      });
    }

    const [result] = await db.insert(catchSessions).values({
      flockId: input.flockId,
      catchDate: new Date(input.catchDate),
      catchTeam: input.catchTeam,
      weighingMethod: input.weighingMethod,
      palletWeight: input.palletWeight?.toString(),
      targetBirds: input.targetBirds,
      targetWeight: input.targetWeight?.toString(),
      status: "active",
      startTime: new Date(),
      createdBy: ctx.user.id,
      // Planned distribution
      crateTypeId: input.crateTypeId,
      transportDurationHours: input.transportDurationHours?.toString(),
      season: input.season,
      plannedStandardDensity: input.plannedStandardDensity,
      plannedStandardCrates: input.plannedStandardCrates,
      plannedOddDensity: input.plannedOddDensity,
      plannedOddCrates: input.plannedOddCrates,
      plannedTotalBirds: input.plannedTotalBirds,
      availableCrates: input.availableCrates,
    });

    return { sessionId: Number(result.insertId) };
  });

export const addCatchCrate = protectedProcedure
  .input(z.object({
    sessionId: z.number(),
    crateTypeId: z.number(),
    birdCount: z.number().positive(),
    grossWeight: z.number().positive(),
  }))
  .mutation(async ({ input }: { input: any }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    // Get crate type for tare weight
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

    const tareWeight = parseFloat(crateType[0].tareWeight);
    const netWeight = input.grossWeight - tareWeight;
    const averageBirdWeight = netWeight / input.birdCount;

    // Get current crate count for this session
    const existingCrates = await db
      .select()
      .from(catchCrates)
      .where(eq(catchCrates.sessionId, input.sessionId));

    const crateNumber = existingCrates.length + 1;

    // Insert crate record
    await db.insert(catchCrates).values({
      sessionId: input.sessionId,
      crateTypeId: input.crateTypeId,
      crateNumber,
      birdCount: input.birdCount,
      grossWeight: input.grossWeight.toString(),
      netWeight: netWeight.toString(),
      averageBirdWeight: averageBirdWeight.toString(),
    });

    // Update session totals
    const allCrates = await db
      .select()
      .from(catchCrates)
      .where(eq(catchCrates.sessionId, input.sessionId));

    const totalBirds = allCrates.reduce((sum: number, c: any) => sum + c.birdCount, 0);
    const totalWeight = allCrates.reduce((sum: number, c: any) => sum + parseFloat(c.netWeight), 0);
    const avgWeight = totalWeight / totalBirds;

    await db
      .update(catchSessions)
      .set({
        totalBirdsCaught: totalBirds,
        totalNetWeight: totalWeight.toString(),
        totalCrates: allCrates.length,
        averageBirdWeight: avgWeight.toString(),
      })
      .where(eq(catchSessions.id, input.sessionId));

    return { success: true, crateNumber, netWeight, averageBirdWeight };
  });

export const getCatchSessionDetails = protectedProcedure
  .input(z.object({ sessionId: z.number() }))
  .query(async ({ input }: { input: any }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
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

    const sessionData = session[0];

    // For individual weighing method, query catchCrates
    if (sessionData.weighingMethod === "individual") {
      const crates = await db
        .select({
          id: catchCrates.id,
          crateNumber: catchCrates.crateNumber,
          birdCount: catchCrates.birdCount,
          grossWeight: catchCrates.grossWeight,
          netWeight: catchCrates.netWeight,
          averageBirdWeight: catchCrates.averageBirdWeight,
          recordedAt: catchCrates.recordedAt,
          crateTypeName: crateTypes.name,
          crateTypeTareWeight: crateTypes.tareWeight,
        })
        .from(catchCrates)
        .leftJoin(crateTypes, eq(catchCrates.crateTypeId, crateTypes.id))
        .where(eq(catchCrates.sessionId, input.sessionId))
        .orderBy(catchCrates.crateNumber);

      return {
        session: sessionData,
        crates,
        batches: [],
      };
    }

    // For batch weighing methods (digital_scale_stack, platform_scale), query catchBatches
    const batches = await db
      .select({
        id: catchBatches.id,
        batchNumber: catchBatches.batchNumber,
        numberOfCrates: catchBatches.numberOfCrates,
        birdsPerCrate: catchBatches.birdsPerCrate,
        totalBirds: catchBatches.totalBirds,
        totalGrossWeight: catchBatches.totalGrossWeight,
        crateWeight: catchBatches.crateWeight,
        palletWeight: catchBatches.palletWeight,
        totalNetWeight: catchBatches.totalNetWeight,
        averageBirdWeight: catchBatches.averageBirdWeight,
        recordedAt: catchBatches.recordedAt,
        crateTypeName: crateTypes.name,
      })
      .from(catchBatches)
      .leftJoin(crateTypes, eq(catchBatches.crateTypeId, crateTypes.id))
      .where(eq(catchBatches.sessionId, input.sessionId))
      .orderBy(catchBatches.batchNumber);

    return {
      session: sessionData,
      crates: [],
      batches,
    };
  });

export const completeCatchSession = protectedProcedure
  .input(z.object({
    sessionId: z.number(),
    notes: z.string().optional(),
  }))
  .mutation(async ({ input, ctx }: { input: any; ctx: any }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
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

    const sessionData = session[0];

    // Calculate total crates based on weighing method
    let totalCrates = 0;
    if (sessionData.weighingMethod === "individual") {
      // Count individual crate records
      const crateRecords = await db
        .select()
        .from(catchCrates)
        .where(eq(catchCrates.sessionId, input.sessionId));
      totalCrates = crateRecords.length;
    } else {
      // Sum numberOfCrates from all batches
      const batches = await db
        .select({ numberOfCrates: catchBatches.numberOfCrates })
        .from(catchBatches)
        .where(eq(catchBatches.sessionId, input.sessionId));
      totalCrates = batches.reduce((sum, batch) => sum + (batch.numberOfCrates || 0), 0);
    }

    // Create harvest record
    const [harvestResult] = await db.insert(harvestRecords).values({
      flockId: sessionData.flockId,
      harvestDate: sessionData.catchDate,
      harvestStartTime: sessionData.startTime,
      chickenCountLoaded: sessionData.totalBirdsCaught,
      totalLoadedWeightKg: sessionData.totalNetWeight,
      averageLoadedWeightKg: sessionData.averageBirdWeight,
      totalCrates: totalCrates,
      destination: "To be updated",
      notes: input.notes,
      recordedBy: ctx.user.id,
    });

    // Update session
    await db
      .update(catchSessions)
      .set({
        status: "completed",
        endTime: new Date(),
        harvestRecordId: Number(harvestResult.insertId),
        notes: input.notes,
      })
      .where(eq(catchSessions.id, input.sessionId));

    return {
      success: true,
      harvestRecordId: Number(harvestResult.insertId),
    };
  });

export const listCatchSessions = protectedProcedure
  .input(z.object({
    flockId: z.number().optional(),
    status: z.enum(["active", "completed", "cancelled"]).optional(),
  }))
  .query(async ({ input }: { input: any }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    let query = db
      .select({
        id: catchSessions.id,
        flockId: catchSessions.flockId,
        flockNumber: flocks.flockNumber,
        catchDate: catchSessions.catchDate,
        catchTeam: catchSessions.catchTeam,
        targetBirds: catchSessions.targetBirds,
        targetWeight: catchSessions.targetWeight,
        status: catchSessions.status,
        totalBirdsCaught: catchSessions.totalBirdsCaught,
        totalNetWeight: catchSessions.totalNetWeight,
        totalCrates: catchSessions.totalCrates,
        averageBirdWeight: catchSessions.averageBirdWeight,
        startTime: catchSessions.startTime,
        endTime: catchSessions.endTime,
      })
      .from(catchSessions)
      .leftJoin(flocks, eq(catchSessions.flockId, flocks.id))
      .$dynamic();

    if (input.flockId) {
      query = query.where(eq(catchSessions.flockId, input.flockId));
    }

    if (input.status) {
      query = query.where(eq(catchSessions.status, input.status));
    }

    const sessions = await query.orderBy(desc(catchSessions.catchDate));
    return sessions;
  });

// ============================================================================
// SMART BIRD-PER-CRATE CALCULATOR
// ============================================================================

export const calculateRecommendedBirdsPerCrate = protectedProcedure
  .input(z.object({
    flockId: z.number(),
    crateTypeId: z.number(),
    season: z.enum(["summer", "winter"]).optional(),
    transportDurationHours: z.number().optional(),
  }))
  .query(async ({ input }: { input: any }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    // Get flock data for average bird weight
    const flock = await db
      .select()
      .from(flocks)
      .where(eq(flocks.id, input.flockId))
      .limit(1);

    if (!flock.length) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Flock not found",
      });
    }

    // Get crate dimensions
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

    // Calculate crate floor area (convert cm to m²)
    const length = parseFloat(crateType[0].length) / 100;
    const width = parseFloat(crateType[0].width) / 100;
    const floorArea = length * width; // m²

    // Estimate average bird weight (kg) - use target or default
    const avgBirdWeight = flock[0].targetDeliveredWeight 
      ? parseFloat(flock[0].targetDeliveredWeight)
      : 2.5;

    // Base stocking density: 12-14 birds/m² for winter, 8-10 birds/m² for summer
    let baseDensity = 13; // birds/m² (winter standard)
    
    if (input.season === "summer") {
      baseDensity = 9; // 30% reduction for summer
    }

    // Adjust for transport duration (reduce by 20% if >4 hours)
    if (input.transportDurationHours && input.transportDurationHours > 4) {
      baseDensity *= 0.8;
    }

    // Adjust for bird weight (heavier birds need more space)
    if (avgBirdWeight > 2.5) {
      baseDensity *= 0.9;
    }

    // Calculate recommended birds per crate
    const recommended = Math.floor(floorArea * baseDensity);
    const min = Math.floor(recommended * 0.8);
    const max = Math.ceil(recommended * 1.2);

    return {
      recommended,
      min,
      max,
      floorArea: floorArea.toFixed(3),
      avgBirdWeight: avgBirdWeight.toFixed(2),
      baseDensity: baseDensity.toFixed(1),
    };
  });


export const catchRouter = router({
  // Crate Types
  createCrateType,
  updateCrateType,
  deleteCrateType,
  listCrateTypes,
  
  // Catch Sessions
  startCatchSession,
  addCatchCrate,
  addCatchCrateBatch, // Batch weighing for digital scale stack and platform scale
  updateCatchBatch, // Update existing batch
  deleteCatchBatch, // Delete batch
  getCatchSessionDetails,
  completeCatchSession,
  listCatchSessions,
  
  // Utilities
  calculateRecommendedBirdsPerCrate,
  
  // Reports
  generateTransportReport: catchReportProcedures.generateTransportReport,
});
