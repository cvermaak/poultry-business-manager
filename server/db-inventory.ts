import { getDb } from "./db";
import { inventoryItems, inventoryLocations, inventoryStock, inventoryTransactions } from "../drizzle/schema";
import { eq, and, sql, desc, gte, lte } from "drizzle-orm";

// ============================================================================
// INVENTORY ITEMS
// ============================================================================

export async function listInventoryItems(filters?: {
  category?: string;
  isActive?: boolean;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters?.category) {
    conditions.push(eq(inventoryItems.category, filters.category as any));
  }
  if (filters?.isActive !== undefined) {
    conditions.push(eq(inventoryItems.isActive, filters.isActive));
  }

  if (conditions.length > 0) {
    return await db.select().from(inventoryItems).where(and(...conditions));
  }

  return await db.select().from(inventoryItems);
}

export async function getInventoryItem(id: number) {
  const db = await getDb();
  if (!db) return null;

  const [item] = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, id));

  return item || null;
}

export async function createInventoryItem(data: {
  itemNumber: string;
  name: string;
  category: string;
  unit: string;
  reorderPoint?: number;
  unitCost?: number;
}) {
  const db = await getDb();
  if (!db) return null;

  const insertData: any = {
    itemNumber: data.itemNumber,
    name: data.name,
    category: data.category,
    unit: data.unit,
  };

  if (data.reorderPoint !== undefined) {
    insertData.reorderPoint = data.reorderPoint.toString();
  }
  if (data.unitCost !== undefined) {
    insertData.unitCost = data.unitCost;
  }

  const [item] = await db.insert(inventoryItems).values(insertData);
  return item;
}

export async function updateInventoryItem(
  id: number,
  data: {
    name?: string;
    category?: string;
    unit?: string;
    reorderPoint?: number;
    unitCost?: number;
    isActive?: boolean;
  }
) {
  const db = await getDb();
  if (!db) return false;

  const updateData: any = { ...data };
  if (data.reorderPoint !== undefined) {
    updateData.reorderPoint = data.reorderPoint.toString();
  }

  await db.update(inventoryItems).set(updateData).where(eq(inventoryItems.id, id));
  return true;
}

export async function deleteInventoryItem(id: number) {
  const db = await getDb();
  if (!db) return false;

  await db.update(inventoryItems).set({ isActive: false }).where(eq(inventoryItems.id, id));
  return true;
}

// ============================================================================
// INVENTORY LOCATIONS
// ============================================================================

export async function listInventoryLocations(filters?: { isActive?: boolean }) {
  const db = await getDb();
  if (!db) return [];

  if (filters?.isActive !== undefined) {
    return await db.select().from(inventoryLocations).where(eq(inventoryLocations.isActive, filters.isActive));
  }

  return await db.select().from(inventoryLocations);
}

export async function createInventoryLocation(data: {
  name: string;
  locationType: string;
  description?: string;
}) {
  const db = await getDb();
  if (!db) return null;

  const [location] = await db.insert(inventoryLocations).values(data as any);
  return location;
}

export async function updateInventoryLocation(
  id: number,
  data: {
    name?: string;
    locationType?: string;
    description?: string;
    isActive?: boolean;
  }
) {
  const db = await getDb();
  if (!db) return false;

  await db.update(inventoryLocations).set(data as any).where(eq(inventoryLocations.id, id));
  return true;
}

// ============================================================================
// INVENTORY STOCK (Per-Location)
// ============================================================================

export async function getStockByLocation(itemId: number, locationId: number) {
  const db = await getDb();
  if (!db) return null;

  const [stock] = await db
    .select()
    .from(inventoryStock)
    .where(and(eq(inventoryStock.itemId, itemId), eq(inventoryStock.locationId, locationId)));

  return stock || null;
}

export async function getStockByItem(itemId: number) {
  const db = await getDb();
  if (!db) return [];

  const stocks = await db
    .select({
      id: inventoryStock.id,
      itemId: inventoryStock.itemId,
      locationId: inventoryStock.locationId,
      locationName: inventoryLocations.name,
      locationType: inventoryLocations.locationType,
      quantity: inventoryStock.quantity,
      lastUpdated: inventoryStock.lastUpdated,
    })
    .from(inventoryStock)
    .leftJoin(inventoryLocations, eq(inventoryStock.locationId, inventoryLocations.id))
    .where(eq(inventoryStock.itemId, itemId));

  return stocks;
}

export async function getAllStockLevels() {
  const db = await getDb();
  if (!db) return [];

  const stocks = await db
    .select({
      itemId: inventoryStock.itemId,
      itemNumber: inventoryItems.itemNumber,
      itemName: inventoryItems.name,
      category: inventoryItems.category,
      unit: inventoryItems.unit,
      reorderPoint: inventoryItems.reorderPoint,
      locationId: inventoryStock.locationId,
      locationName: inventoryLocations.name,
      locationType: inventoryLocations.locationType,
      quantity: inventoryStock.quantity,
      lastUpdated: inventoryStock.lastUpdated,
    })
    .from(inventoryStock)
    .leftJoin(inventoryItems, eq(inventoryStock.itemId, inventoryItems.id))
    .leftJoin(inventoryLocations, eq(inventoryStock.locationId, inventoryLocations.id))
    .where(eq(inventoryItems.isActive, true));

  return stocks;
}

export async function updateStock(
  itemId: number,
  locationId: number,
  quantity: number,
  userId: number
) {
  const db = await getDb();
  if (!db) return false;

  // Check if stock record exists
  const existing = await getStockByLocation(itemId, locationId);

  if (existing) {
    await db
      .update(inventoryStock)
      .set({
        quantity: quantity.toString(),
        updatedBy: userId,
      })
      .where(
        and(eq(inventoryStock.itemId, itemId), eq(inventoryStock.locationId, locationId))
      );
  } else {
    await db.insert(inventoryStock).values({
      itemId,
      locationId,
      quantity: quantity.toString(),
      updatedBy: userId,
    });
  }

  return true;
}

// ============================================================================
// INVENTORY TRANSACTIONS
// ============================================================================

export async function recordTransaction(data: {
  itemId: number;
  locationId?: number;
  transactionType: "receipt" | "issue" | "transfer" | "adjustment";
  quantity: number;
  unitCost?: number;
  totalCost?: number;
  referenceType?: string;
  referenceId?: number;
  notes?: string;
  transactionDate: Date;
  createdBy: number;
}) {
  const db = await getDb();
  if (!db) return null;

  const [transaction] = await db.insert(inventoryTransactions).values({
    ...data,
    quantity: data.quantity.toString(),
  } as any);

  return transaction;
}

export async function getTransactionHistory(
  itemId?: number,
  locationId?: number,
  startDate?: Date,
  endDate?: Date
) {
  const db = await getDb();
  if (!db) return [];

  const baseQuery = db
    .select({
      id: inventoryTransactions.id,
      itemId: inventoryTransactions.itemId,
      itemName: inventoryItems.name,
      locationId: inventoryTransactions.locationId,
      locationName: inventoryLocations.name,
      transactionType: inventoryTransactions.transactionType,
      quantity: inventoryTransactions.quantity,
      unitCost: inventoryTransactions.unitCost,
      totalCost: inventoryTransactions.totalCost,
      referenceType: inventoryTransactions.referenceType,
      referenceId: inventoryTransactions.referenceId,
      notes: inventoryTransactions.notes,
      transactionDate: inventoryTransactions.transactionDate,
      createdAt: inventoryTransactions.createdAt,
    })
    .from(inventoryTransactions)
    .leftJoin(inventoryItems, eq(inventoryTransactions.itemId, inventoryItems.id))
    .leftJoin(inventoryLocations, eq(inventoryTransactions.locationId, inventoryLocations.id));

  const conditions = [];
  if (itemId) conditions.push(eq(inventoryTransactions.itemId, itemId));
  if (locationId) conditions.push(eq(inventoryTransactions.locationId, locationId));
  if (startDate) conditions.push(gte(inventoryTransactions.transactionDate, startDate));
  if (endDate) conditions.push(lte(inventoryTransactions.transactionDate, endDate));

  if (conditions.length > 0) {
    return await baseQuery.where(and(...conditions)).orderBy(desc(inventoryTransactions.transactionDate));
  }

  return await baseQuery.orderBy(desc(inventoryTransactions.transactionDate));
}

// ============================================================================
// REORDER ALERTS
// ============================================================================

export async function getReorderAlerts() {
  const db = await getDb();
  if (!db) return [];

  // Get items where total stock across all locations is below reorder point
  const alerts = await db
    .select({
      itemId: inventoryItems.id,
      itemNumber: inventoryItems.itemNumber,
      itemName: inventoryItems.name,
      category: inventoryItems.category,
      unit: inventoryItems.unit,
      reorderPoint: inventoryItems.reorderPoint,
      totalStock: sql<string>`COALESCE(SUM(${inventoryStock.quantity}), 0)`,
    })
    .from(inventoryItems)
    .leftJoin(inventoryStock, eq(inventoryItems.id, inventoryStock.itemId))
    .where(
      and(
        eq(inventoryItems.isActive, true),
        sql`${inventoryItems.reorderPoint} IS NOT NULL`
      )
    )
    .groupBy(inventoryItems.id)
    .having(sql`COALESCE(SUM(${inventoryStock.quantity}), 0) < ${inventoryItems.reorderPoint}`);

  return alerts;
}
