import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { processors } from "../../drizzle/schema";
import { getDb } from "../db";
import { eq, desc, and } from "drizzle-orm";

/**
 * Processor Management Procedures
 * CRUD operations for managing processors/destinations
 */

export const processorRouter = router({
  /**
   * List all active processors
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    return db!
      .select()
      .from(processors)
      .where(eq(processors.isActive, true))
      .orderBy(desc(processors.name));
  }),

  /**
   * Get processor by ID
   */
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const [processor] = await db!
        .select()
        .from(processors)
        .where(eq(processors.id, input.id))
        .limit(1);
      return processor || null;
    }),

  /**
   * Create new processor
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, "Processor name is required"),
        contactPerson: z.string().optional(),
        email: z.string().email().optional().or(z.literal("")),
        phone: z.string().optional(),
        physicalAddress: z.string().optional(),
        gpsLatitude: z.number().optional(),
        gpsLongitude: z.number().optional(),
        paymentTerms: z.string().optional(),
        defaultPricePerKg: z.number().optional(),
        averageTravelTimeHours: z.number().optional(),
        operatingDays: z.string().optional(),
        operatingHours: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      
      const [newProcessor] = await db!
        .insert(processors)
        .values({
          ...input,
          gpsLatitude: input.gpsLatitude?.toString(),
          gpsLongitude: input.gpsLongitude?.toString(),
          defaultPricePerKg: input.defaultPricePerKg?.toString(),
          averageTravelTimeHours: input.averageTravelTimeHours?.toString(),
          createdBy: ctx.user.id,
        })
        .$returningId();

      return { id: newProcessor.id, success: true };
    }),

  /**
   * Update existing processor
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        contactPerson: z.string().optional(),
        email: z.string().email().optional().or(z.literal("")),
        phone: z.string().optional(),
        physicalAddress: z.string().optional(),
        gpsLatitude: z.number().optional(),
        gpsLongitude: z.number().optional(),
        paymentTerms: z.string().optional(),
        defaultPricePerKg: z.number().optional(),
        averageTravelTimeHours: z.number().optional(),
        operatingDays: z.string().optional(),
        operatingHours: z.string().optional(),
        notes: z.string().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...updates } = input;
      const db = await getDb();

      const updateData: any = { ...updates };
      if (updates.gpsLatitude !== undefined) updateData.gpsLatitude = updates.gpsLatitude?.toString();
      if (updates.gpsLongitude !== undefined) updateData.gpsLongitude = updates.gpsLongitude?.toString();
      if (updates.defaultPricePerKg !== undefined) updateData.defaultPricePerKg = updates.defaultPricePerKg?.toString();
      if (updates.averageTravelTimeHours !== undefined) updateData.averageTravelTimeHours = updates.averageTravelTimeHours?.toString();

      await db!
        .update(processors)
        .set(updateData)
        .where(eq(processors.id, id));

      return { success: true };
    }),

  /**
   * Delete processor (soft delete by setting isActive = false)
   */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();

      await db!
        .update(processors)
        .set({ isActive: false })
        .where(eq(processors.id, input.id));

      return { success: true };
    }),
});
