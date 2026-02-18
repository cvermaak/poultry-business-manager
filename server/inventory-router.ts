import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as inventoryDb from "./db-inventory";

export const inventoryRouter = router({
  // ============================================================================
  // INVENTORY ITEMS
  // ============================================================================

  listItems: protectedProcedure
    .input(
      z
        .object({
          category: z.string().optional(),
          isActive: z.boolean().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      return await inventoryDb.listInventoryItems(input);
    }),

  getItem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await inventoryDb.getInventoryItem(input.id);
    }),

  createItem: protectedProcedure
    .input(
      z.object({
        itemNumber: z.string(),
        name: z.string(),
        category: z.enum(["live_birds", "feed", "raw_materials", "supplies", "equipment"]),
        unit: z.string(),
        reorderPoint: z.number().optional(),
        unitCost: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return await inventoryDb.createInventoryItem(input);
    }),

  updateItem: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        category: z.enum(["live_birds", "feed", "raw_materials", "supplies", "equipment"]).optional(),
        unit: z.string().optional(),
        reorderPoint: z.number().optional(),
        unitCost: z.number().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return await inventoryDb.updateInventoryItem(id, data);
    }),

  deleteItem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return await inventoryDb.deleteInventoryItem(input.id);
    }),

  // ============================================================================
  // INVENTORY LOCATIONS
  // ============================================================================

  listLocations: protectedProcedure
    .input(
      z
        .object({
          isActive: z.boolean().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      return await inventoryDb.listInventoryLocations(input);
    }),

  createLocation: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        locationType: z.enum(["house", "warehouse", "silo", "cold_storage", "other"]),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return await inventoryDb.createInventoryLocation(input);
    }),

  updateLocation: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        locationType: z.enum(["house", "warehouse", "silo", "cold_storage", "other"]).optional(),
        description: z.string().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return await inventoryDb.updateInventoryLocation(id, data);
    }),

  // ============================================================================
  // INVENTORY STOCK
  // ============================================================================

  getStockByItem: protectedProcedure
    .input(z.object({ itemId: z.number() }))
    .query(async ({ input }) => {
      return await inventoryDb.getStockByItem(input.itemId);
    }),

  getAllStockLevels: protectedProcedure.query(async () => {
    return await inventoryDb.getAllStockLevels();
  }),

  updateStock: protectedProcedure
    .input(
      z.object({
        itemId: z.number(),
        locationId: z.number(),
        quantity: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return await inventoryDb.updateStock(
        input.itemId,
        input.locationId,
        input.quantity,
        ctx.user.id
      );
    }),

  // ============================================================================
  // INVENTORY TRANSACTIONS
  // ============================================================================

  recordTransaction: protectedProcedure
    .input(
      z.object({
        itemId: z.number(),
        locationId: z.number().optional(),
        transactionType: z.enum(["receipt", "issue", "transfer", "adjustment"]),
        quantity: z.number(),
        unitCost: z.number().optional(),
        totalCost: z.number().optional(),
        referenceType: z.string().optional(),
        referenceId: z.number().optional(),
        notes: z.string().optional(),
        transactionDate: z.date(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return await inventoryDb.recordTransaction({
        ...input,
        createdBy: ctx.user.id,
      });
    }),

  getTransactionHistory: protectedProcedure
    .input(
      z.object({
        itemId: z.number().optional(),
        locationId: z.number().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      })
    )
    .query(async ({ input }) => {
      return await inventoryDb.getTransactionHistory(
        input.itemId,
        input.locationId,
        input.startDate,
        input.endDate
      );
    }),

  // ============================================================================
  // REORDER ALERTS
  // ============================================================================

  getReorderAlerts: protectedProcedure.query(async () => {
    return await inventoryDb.getReorderAlerts();
  }),
});
