import { executeInventoryItemUpdate, type UpdateInventoryItemInput } from "./inventory-item-update-executor";
import { getDb, mysqlTimestamp } from "./db";
import { inventoryItems, inventoryLocations, inventoryTransactions } from "../drizzle/schema";
import { eq, and, sql, desc, gte, lte, like, gt } from "drizzle-orm";
import { resolveInventoryStock } from "./inventory-stock-mapping";
import { executeInventoryItemCreate, type CreateInventoryItemInput } from "./inventory-create-executor";

// ============================================================================
// UNITS OF MEASURE HELPERS
// ============================================================================

/**
 * List all active units of measure from the master table.
 */
let standardUnitsEnsured = false;

/**
 * Idempotently seed standard packaging units. Migrations are run manually in
 * this project, so this guarantees the units exist without a manual step.
 */
async function ensureStandardUnits(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  if (standardUnitsEnsured) return;
  try {
    await db.execute(sql`
      INSERT IGNORE INTO unit_of_measures (code, name, symbol, uom_type, base_uom_code, conversion_factor, is_base, is_active)
      VALUES ('bag40', 'Bag (40 kg)', 'bag40', 'packaging', 'kg', 40.00000000, 0, 1)
    `);
    standardUnitsEnsured = true;
  } catch (err) {
    console.error("[uom] failed to seed standard units", err);
  }
}

export async function listUnitsOfMeasure() {
  const db = await getDb();
  if (!db) return [];
  await ensureStandardUnits(db);
  const rows = await db.execute(sql`
    SELECT code, name, symbol, uom_type, base_uom_code, conversion_factor, is_base, is_active
    FROM unit_of_measures
    WHERE is_active = 1
    ORDER BY uom_type, name
  `);
  return (rows[0] as unknown as any[]).map((r: any) => ({
    code: r.code as string,
    name: r.name as string,
    symbol: r.symbol as string,
    uomType: r.uom_type as string,
    baseUomCode: r.base_uom_code as string | null,
    conversionFactor: parseFloat(r.conversion_factor),
    isBase: Boolean(r.is_base),
  }));
}

/**
 * List all unit conversions defined for a specific inventory item.
 */
export async function listItemUnitConversions(itemId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.execute(sql`
    SELECT id, item_id, from_uom_code, to_uom_code, conversion_factor, notes
    FROM item_unit_conversions
    WHERE item_id = ${itemId}
    ORDER BY from_uom_code
  `);
  return (rows[0] as unknown as any[]).map((r: any) => ({
    id: r.id as number,
    itemId: r.item_id as number,
    fromUomCode: r.from_uom_code as string,
    toUomCode: r.to_uom_code as string,
    conversionFactor: parseFloat(r.conversion_factor),
    notes: r.notes as string | null,
  }));
}

/**
 * Save (upsert) a unit conversion for an inventory item.
 */
export async function saveItemUnitConversion(data: {
  itemId: number;
  fromUomCode: string;
  toUomCode: string;
  conversionFactor: number;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.execute(sql`
    INSERT INTO item_unit_conversions (item_id, from_uom_code, to_uom_code, conversion_factor, notes)
    VALUES (${data.itemId}, ${data.fromUomCode}, ${data.toUomCode}, ${data.conversionFactor}, ${data.notes ?? null})
    ON DUPLICATE KEY UPDATE
      conversion_factor = VALUES(conversion_factor),
      notes = VALUES(notes)
  `);
  return true;
}

/**
 * Delete a unit conversion by id.
 */
export async function deleteItemUnitConversion(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.execute(sql`DELETE FROM item_unit_conversions WHERE id = ${id}`);
  return true;
}

/**
 * Convert a quantity from one unit to another for a given item.
 * Resolves via:
 *   1. item-specific conversion table
 *   2. global UoM conversion_factor (both units share same base_uom_code)
 *   3. identity (from === to)
 * Throws if no conversion path exists.
 */
export async function convertQuantity(
  itemId: number,
  quantity: number,
  fromUomCode: string,
  toUomCode: string
): Promise<number> {
  if (fromUomCode === toUomCode) return quantity;

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 1. Check item-specific conversions (direct)
  const itemConv = await db.execute(sql`
    SELECT conversion_factor FROM item_unit_conversions
    WHERE item_id = ${itemId} AND from_uom_code = ${fromUomCode} AND to_uom_code = ${toUomCode}
    LIMIT 1
  `);
  const itemRows = itemConv[0] as unknown as any[];
  if (itemRows.length > 0) {
    return quantity * parseFloat(itemRows[0].conversion_factor);
  }

  // 1b. Reverse direction
  const itemConvRev = await db.execute(sql`
    SELECT conversion_factor FROM item_unit_conversions
    WHERE item_id = ${itemId} AND from_uom_code = ${toUomCode} AND to_uom_code = ${fromUomCode}
    LIMIT 1
  `);
  const itemRowsRev = itemConvRev[0] as unknown as any[];
  if (itemRowsRev.length > 0) {
    return quantity / parseFloat(itemRowsRev[0].conversion_factor);
  }

  // 2. Global UoM table — both must share same base_uom_code
  const uoms = await db.execute(sql`
    SELECT code, base_uom_code, conversion_factor FROM unit_of_measures
    WHERE code IN (${fromUomCode}, ${toUomCode})
  `);
  const uomRows = uoms[0] as unknown as any[];
  const fromUom = uomRows.find((r: any) => r.code === fromUomCode);
  const toUom = uomRows.find((r: any) => r.code === toUomCode);

  if (
    fromUom && toUom &&
    fromUom.base_uom_code && toUom.base_uom_code &&
    fromUom.base_uom_code === toUom.base_uom_code
  ) {
    // Convert: quantity × fromFactor / toFactor
    const fromFactor = parseFloat(fromUom.conversion_factor);
    const toFactor = parseFloat(toUom.conversion_factor);
    return (quantity * fromFactor) / toFactor;
  }

  throw new Error(
    `No conversion path found from '${fromUomCode}' to '${toUomCode}' for item ${itemId}. ` +
    `Please define an item-specific conversion.`
  );
}

// ============================================================================
// INVENTORY ITEMS
// ============================================================================

/**
 * Get the next sequential number for a SKU pattern
 * @param primaryClass - Primary class code (e.g., 'FD')
 * @param subType - Sub-type code (e.g., 'ST')
 * @param form - Form code (e.g., 'P')
 * @returns Next sequential number (1 if no existing SKUs match the pattern)
 */
export async function getNextSequentialNumber(
  primaryClass: string,
  subType: string,
  form: string
): Promise<number> {
  const db = await getDb();
  if (!db) return 1;

  // Find all SKUs matching the pattern (e.g., 'FD-ST-P-%')
  const pattern = `${primaryClass}-${subType}-${form}-%`;
  
  // Include ALL items (active AND inactive) so deleted item SKUs are never reused
  const items = await db
    .select({ itemNumber: inventoryItems.itemNumber })
    .from(inventoryItems)
    .where(like(inventoryItems.itemNumber, pattern));

  if (items.length === 0) return 1;

  // Extract sequential numbers and find the max
  const numbers = items
    .map(item => {
      const parts = item.itemNumber.split('-');
      const seqStr = parts[parts.length - 1]; // Last part is the sequential number
      return parseInt(seqStr, 10);
    })
    .filter(n => !isNaN(n));

  if (numbers.length === 0) return 1;

  return Math.max(...numbers) + 1;
}

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
    conditions.push(eq(inventoryItems.isActive, filters.isActive ? 1 : 0));
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

export async function createInventoryItem(data: CreateInventoryItemInput, actorId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return executeInventoryItemCreate(db, data, actorId);
}

export async function updateInventoryItem(
  id: number,
  data: UpdateInventoryItemInput,
  actorId: number,
) {
  // Reject the deprecated field even for non-tRPC callers; never silently
  // write a stale metadata total. Creation remains on its existing path.
  if (Object.prototype.hasOwnProperty.call(data, "currentStock")) {
    throw new Error("currentStock cannot be edited on an existing item; use stockAdjustment for one location");
  }
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return executeInventoryItemUpdate(db, id, data, actorId);
}

export async function deleteInventoryItem(id: number) {
  const db = await getDb();
  if (!db) return false;

  await db.update(inventoryItems).set({ isActive: 0 }).where(eq(inventoryItems.id, id));
  return true;
}

// ============================================================================
// INVENTORY LOCATIONS
// ============================================================================

export async function listInventoryLocations(filters?: { isActive?: boolean }) {
  const db = await getDb();
  if (!db) return [];

  if (filters?.isActive !== undefined) {
    return await db.select().from(inventoryLocations).where(eq(inventoryLocations.isActive, filters.isActive ? 1 : 0));
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
  const inventoryStock = await resolveInventoryStock(db);

  const [stock] = await db
    .select()
    .from(inventoryStock)
    .where(and(eq(inventoryStock.itemId, itemId), eq(inventoryStock.locationId, locationId)));

  return stock || null;
}

export async function getStockByItem(itemId: number) {
  const db = await getDb();
  if (!db) return [];
  const inventoryStock = await resolveInventoryStock(db);

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
  const inventoryStock = await resolveInventoryStock(db);

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
    .where(eq(inventoryItems.isActive, 1));

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
  const inventoryStock = await resolveInventoryStock(db);

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

// Helper function to get current stock level
async function getStockLevel(itemId: number, locationId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const inventoryStock = await resolveInventoryStock(db);

  const [stock] = await db
    .select()
    .from(inventoryStock)
    .where(and(
      eq(inventoryStock.itemId, itemId),
      eq(inventoryStock.locationId, locationId)
    ));

  return stock ? Number(stock.quantity) : 0;
}

// Helper function to update stock level (add or subtract)
async function updateStockLevel(
  itemId: number,
  locationId: number,
  quantity: number,
  operation: "add" | "subtract",
  updatedBy: number = 1
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const inventoryStock = await resolveInventoryStock(db);

  const currentStock = await getStockLevel(itemId, locationId);
  const newStock = operation === "add" 
    ? currentStock + quantity 
    : currentStock - quantity;

  if (newStock < 0) {
    throw new Error(`Insufficient stock. Available: ${currentStock}, Requested: ${quantity}`);
  }

  // Check if stock record exists
  const [existing] = await db
    .select()
    .from(inventoryStock)
    .where(and(
      eq(inventoryStock.itemId, itemId),
      eq(inventoryStock.locationId, locationId)
    ));

  if (existing) {
    // Update existing record
    await db
      .update(inventoryStock)
      .set({
        quantity: newStock.toString(),
        lastUpdated: sql`NOW()`,
        updatedBy,
      })
      .where(and(
        eq(inventoryStock.itemId, itemId),
        eq(inventoryStock.locationId, locationId)
      ));
  } else {
    // Insert new record
    await db.insert(inventoryStock).values({
      itemId,
      locationId,
      quantity: newStock.toString(),
      lastUpdated: sql`NOW()`,
      updatedBy,
    });
  }
}

// Helper function to set stock level to exact value (for adjustments)
async function setStockLevel(
  itemId: number,
  locationId: number,
  quantity: number,
  updatedBy: number = 1
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const inventoryStock = await resolveInventoryStock(db);

  // Check if stock record exists
  const [existing] = await db
    .select()
    .from(inventoryStock)
    .where(and(
      eq(inventoryStock.itemId, itemId),
      eq(inventoryStock.locationId, locationId)
    ));

  if (existing) {
    // Update existing record
    await db
      .update(inventoryStock)
      .set({
        quantity: quantity.toString(),
        lastUpdated: sql`NOW()`,
        updatedBy,
      })
      .where(and(
        eq(inventoryStock.itemId, itemId),
        eq(inventoryStock.locationId, locationId)
      ));
  } else {
    // Insert new record
    await db.insert(inventoryStock).values({
      itemId,
      locationId,
      quantity: quantity.toString(),
      lastUpdated: sql`NOW()`,
      updatedBy,
    });
  }
}

/**
 * Calculate FIFO cost for issuing/transferring stock
 * Returns the total cost based on oldest receipt transactions first
 */
export async function calculateFIFOCost(
  itemId: number,
  locationId: number,
  quantityToIssue: number
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  // Get all receipt transactions for this item/location, ordered by date (FIFO)
  const receipts = await db
    .select({
      id: inventoryTransactions.id,
      quantity: inventoryTransactions.quantity,
      unitCost: inventoryTransactions.unitCost,
      transactionDate: inventoryTransactions.transactionDate,
    })
    .from(inventoryTransactions)
    .where(
      and(
        eq(inventoryTransactions.itemId, itemId),
        eq(inventoryTransactions.locationId, locationId),
        eq(inventoryTransactions.transactionType, "receipt")
      )
    )
    .orderBy(inventoryTransactions.transactionDate); // FIFO: oldest first

  let remainingQty = quantityToIssue;
  let totalCost = 0;

  for (const receipt of receipts) {
    if (remainingQty <= 0) break;

    const receiptQty = parseFloat(receipt.quantity);
    const receiptUnitCost = receipt.unitCost ?? 0;

    // If no unit cost, skip (can't calculate cost)
    if (receiptUnitCost === 0) continue;

    // Calculate how much to take from this receipt
    const qtyToTake = Math.min(remainingQty, receiptQty);
    
    // Add cost (unitCost is stored as integer cents)
    totalCost += qtyToTake * receiptUnitCost;
    
    remainingQty -= qtyToTake;
  }

  // If we couldn't find enough receipts with costs, use item's default unit cost
  if (remainingQty > 0) {
    const item = await db
      .select({ unitCost: inventoryItems.unitCost })
      .from(inventoryItems)
      .where(eq(inventoryItems.id, itemId))
      .limit(1);

    if (item[0]?.unitCost) {
      const defaultUnitCost = item[0].unitCost;
      totalCost += remainingQty * defaultUnitCost;
    }
  }

  return Math.round(totalCost); // Return as integer (cents)
}

export async function recordTransaction(data: {
  itemId: number;
  locationId: number; // Make required
  transactionType: "receipt" | "issue" | "transfer" | "adjustment";
  quantity: number;
  uomCode?: string;         // Unit the quantity was entered in
  unitCost?: number;
  totalCost?: number;
  referenceNumber?: string;
  notes?: string;
  transactionDate: Date;
  createdBy: number;
  flockId?: number; // For linking to flocks
  toLocationId?: number; // For transfers
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // Validate sufficient stock for ISSUE/TRANSFER
  if (data.transactionType === "issue" || data.transactionType === "transfer") {
    const currentStock = await getStockLevel(data.itemId, data.locationId);
    if (currentStock < data.quantity) {
      throw new Error(`Insufficient stock. Available: ${currentStock} ${data.quantity > 1 ? 'units' : 'unit'}, Requested: ${data.quantity}`);
    }
  }

  // Validate transfer has toLocationId
  if (data.transactionType === "transfer" && !data.toLocationId) {
    throw new Error("Transfer requires destination location (toLocationId)");
  }

  // Validate from and to locations are different for transfers
  if (data.transactionType === "transfer" && data.locationId === data.toLocationId) {
    throw new Error("Cannot transfer to the same location");
  }

  // Calculate FIFO cost for Issue and Transfer transactions
  let calculatedTotalCost = data.totalCost;
  if (data.transactionType === "issue" || data.transactionType === "transfer") {
    calculatedTotalCost = await calculateFIFOCost(data.itemId, data.locationId, data.quantity);
  } else if (data.transactionType === "receipt" && data.unitCost) {
    // For receipts, calculate totalCost from unitCost * quantity
    calculatedTotalCost = Math.round(data.unitCost * data.quantity);
  }

  // Resolve quantityInBaseUnit: convert from entered UoM to item's base UoM
  let quantityInBaseUnit: number | null = null;
  if (data.uomCode) {
    try {
      // Get item's base UoM
      const [itemRow] = await db.select({ baseUomCode: inventoryItems.baseUomCode }).from(inventoryItems).where(eq(inventoryItems.id, data.itemId)).limit(1);
      const baseUom = (itemRow as any)?.baseUomCode;
      if (baseUom && baseUom !== data.uomCode) {
        quantityInBaseUnit = await convertQuantity(data.itemId, data.quantity, data.uomCode, baseUom);
      } else {
        quantityInBaseUnit = data.quantity;
      }
    } catch {
      // If conversion fails, store null — do not block the transaction
      quantityInBaseUnit = null;
    }
  }

  // Record the transaction
  const result = await db.insert(inventoryTransactions).values({
    itemId: data.itemId,
    locationId: data.locationId,
    transactionType: data.transactionType,
    quantity: data.quantity.toString(),
    uomCode: data.uomCode ?? null,
    quantityInBaseUnit: quantityInBaseUnit !== null ? quantityInBaseUnit.toString() : null,
    unitCost: data.unitCost,
    totalCost: calculatedTotalCost,
    referenceType: data.referenceNumber,
    notes: data.notes,
    transactionDate: mysqlTimestamp(data.transactionDate),
    createdBy: data.createdBy,
  });

  const transactionId = Number(result[0].insertId);

  // Update stock levels based on transaction type
  switch (data.transactionType) {
    case "receipt":
      await updateStockLevel(data.itemId, data.locationId, data.quantity, "add", data.createdBy);
      break;

    case "issue":
      await updateStockLevel(data.itemId, data.locationId, data.quantity, "subtract", data.createdBy);
      break;

    case "transfer":
      if (!data.toLocationId) throw new Error("Transfer requires toLocationId");
      // Subtract from source location
      await updateStockLevel(data.itemId, data.locationId, data.quantity, "subtract", data.createdBy);
      // Add to destination location
      await updateStockLevel(data.itemId, data.toLocationId, data.quantity, "add", data.createdBy);
      // Record second transaction for destination (with same cost)
      await db.insert(inventoryTransactions).values({
        itemId: data.itemId,
        locationId: data.toLocationId,
        transactionType: "receipt",
        quantity: data.quantity.toString(),
        unitCost: calculatedTotalCost ? calculatedTotalCost / data.quantity : undefined,
        totalCost: calculatedTotalCost,
        referenceType: `TRANSFER-${transactionId}`,
        notes: `Transfer from location ${data.locationId}${data.notes ? ': ' + data.notes : ''}`,
        transactionDate: mysqlTimestamp(data.transactionDate),
        createdBy: data.createdBy,
      });
      break;

    case "adjustment":
      // Set new stock level directly
      await setStockLevel(data.itemId, data.locationId, data.quantity, data.createdBy);
      break;
  }

  return transactionId;
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
  if (startDate) conditions.push(gte(inventoryTransactions.transactionDate, mysqlTimestamp(startDate)));
  if (endDate) conditions.push(lte(inventoryTransactions.transactionDate, mysqlTimestamp(endDate)));

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
  const inventoryStock = await resolveInventoryStock(db);

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
        eq(inventoryItems.isActive, 1),
        sql`${inventoryItems.reorderPoint} IS NOT NULL`
      )
    )
    .groupBy(inventoryItems.id)
    .having(sql`COALESCE(SUM(${inventoryStock.quantity}), 0) <= ${inventoryItems.reorderPoint}`);

  return alerts;
}

// ============================================================================
// SKU IDENTITY BLOCK - VALIDATION & LOOKUP
// ============================================================================

/**
 * Find an inventory item by barcode
 * @param barcode - The barcode to search for
 * @returns The inventory item or null if not found
 */
export async function findItemByBarcode(barcode: string) {
  const db = await getDb();
  if (!db) return null;

  const [item] = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.barcode, barcode));

  return item || null;
}

/**
 * Validate barcode uniqueness (excluding a specific item ID for updates)
 * @param barcode - The barcode to check
 * @param excludeItemId - Optional item ID to exclude from the check (for updates)
 * @returns true if barcode is unique, false if already exists
 */
export async function validateBarcodeUniqueness(barcode: string, excludeItemId?: number) {
  const db = await getDb();
  if (!db) return true; // Fail open if DB unavailable

  const conditions = [eq(inventoryItems.barcode, barcode)];
  
  if (excludeItemId) {
    conditions.push(sql`${inventoryItems.id} != ${excludeItemId}`);
  }

  const [existing] = await db
    .select({ id: inventoryItems.id })
    .from(inventoryItems)
    .where(and(...conditions));

  return !existing; // true if no existing item found
}

/**
 * Validate that itemNumber is not being changed (SKU immutability)
 * @param itemId - The item ID being updated
 * @param newItemNumber - The new itemNumber being attempted
 * @returns true if itemNumber matches existing, false if attempting to change
 */
export async function validateItemNumberImmutability(itemId: number, newItemNumber: string) {
  const db = await getDb();
  if (!db) return false;

  const [existing] = await db
    .select({ itemNumber: inventoryItems.itemNumber })
    .from(inventoryItems)
    .where(eq(inventoryItems.id, itemId));

  if (!existing) return false; // Item doesn't exist

  return existing.itemNumber === newItemNumber; // true if unchanged
}

/**
 * Search inventory items across multiple identifier fields
 * @param searchTerm - The search term to match against multiple fields
 * @param filters - Optional filters for category, status, type
 * @returns Array of matching inventory items
 */
export async function searchInventoryItems(
  searchTermOrFilters?: string | {
    searchTerm?: string;
    category?: string;
    itemStatus?: string;
    itemType?: string;
    brand?: string;
    manufacturerPartNumber?: string;
  },
  legacyFilters?: {
    category?: string;
    itemStatus?: string;
    itemType?: string;
  }
) {
  const db = await getDb();
  if (!db) return [];

  // Handle both old signature (searchTerm, filters) and new signature (filters only)
  let searchTerm: string | undefined;
  let filters: any = {};

  if (typeof searchTermOrFilters === 'string') {
    // Old signature: searchInventoryItems("term", {filters})
    searchTerm = searchTermOrFilters;
    filters = legacyFilters || {};
  } else if (searchTermOrFilters) {
    // New signature: searchInventoryItems({searchTerm: "term", ...filters})
    searchTerm = searchTermOrFilters.searchTerm;
    filters = searchTermOrFilters;
  }

  const conditions: any[] = [];

  // Add search term condition if provided
  if (searchTerm) {
    const searchPattern = `%${searchTerm}%`;
    conditions.push(
      sql`(
        ${inventoryItems.itemNumber} LIKE ${searchPattern} OR
        ${inventoryItems.name} LIKE ${searchPattern} OR
        ${inventoryItems.barcode} LIKE ${searchPattern} OR
        ${inventoryItems.manufacturerPartNumber} LIKE ${searchPattern} OR
        ${inventoryItems.internalReference} LIKE ${searchPattern} OR
        ${inventoryItems.supplierPartNumber} LIKE ${searchPattern} OR
        ${inventoryItems.brand} LIKE ${searchPattern} OR
        ${inventoryItems.model} LIKE ${searchPattern}
      )`
    );
  }

  // Add filter conditions
  if (filters.category) {
    conditions.push(eq(inventoryItems.category, filters.category as any));
  }
  if (filters.itemStatus) {
    conditions.push(eq(inventoryItems.itemStatus, filters.itemStatus as any));
  }
  if (filters.itemType) {
    conditions.push(eq(inventoryItems.itemType, filters.itemType as any));
  }
  if (filters.brand) {
    conditions.push(eq(inventoryItems.brand, filters.brand));
  }
  if (filters.manufacturerPartNumber) {
    conditions.push(eq(inventoryItems.manufacturerPartNumber, filters.manufacturerPartNumber));
  }

  // If no conditions, return all items
  if (conditions.length === 0) {
    return await db.select().from(inventoryItems);
  }

  return await db
    .select()
    .from(inventoryItems)
    .where(and(...conditions));
}


/**
 * Get stock valuation report with breakdown by category and location
 */
export async function getStockValuation() {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const inventoryStock = await resolveInventoryStock(db);

  // Get all stock with item details
  const stockWithDetails = await db
    .select({
      itemId: inventoryStock.itemId,
      itemName: inventoryItems.name,
      itemNumber: inventoryItems.itemNumber,
      category: inventoryItems.category,
      locationId: inventoryStock.locationId,
      locationName: inventoryLocations.name,
      locationType: inventoryLocations.locationType,
      quantity: inventoryStock.quantity,
      unit: inventoryItems.unit,
      unitCost: inventoryItems.unitCost,
    })
    .from(inventoryStock)
    .innerJoin(inventoryItems, eq(inventoryStock.itemId, inventoryItems.id))
    .innerJoin(inventoryLocations, eq(inventoryStock.locationId, inventoryLocations.id))
    .where(sql`CAST(${inventoryStock.quantity} AS DECIMAL(10,2)) > 0`);

  // Calculate total value and breakdowns
  let totalValue = 0;
  const byCategory: Record<string, { value: number; items: number }> = {};
  const byLocation: Record<string, { value: number; items: number; locationType: string }> = {};
  const items: Array<{
    itemId: number;
    itemName: string;
    itemNumber: string;
    category: string;
    locationName: string;
    quantity: string;
      unit: string;
    unitCost: string | null;
    totalValue: number;
  }> = [];

  for (const stock of stockWithDetails) {
    const qty = parseFloat(stock.quantity);
    const cost = stock.unitCost ? stock.unitCost / 100 : 0; // unitCost stored in cents, convert to Rand
    const value = qty * cost;

    totalValue += value;

    // By category
    if (!byCategory[stock.category]) {
      byCategory[stock.category] = { value: 0, items: 0 };
    }
    byCategory[stock.category].value += value;
    byCategory[stock.category].items += 1;

    // By location
    if (!byLocation[stock.locationName]) {
      byLocation[stock.locationName] = { value: 0, items: 0, locationType: stock.locationType };
    }
    byLocation[stock.locationName].value += value;
    byLocation[stock.locationName].items += 1;

    // Item details
    items.push({
      itemId: stock.itemId,
      itemName: stock.itemName,
      itemNumber: stock.itemNumber,
      category: stock.category,
      locationName: stock.locationName,
      quantity: stock.quantity,
      unit: stock.unit,
      unitCost: stock.unitCost === null ? null : String(stock.unitCost),
      totalValue: value,
    });
  }

  return {
    totalValue,
    byCategory: Object.entries(byCategory).map(([category, data]) => ({
      category,
      value: data.value,
      items: data.items,
      percentage: totalValue > 0 ? (data.value / totalValue) * 100 : 0,
    })),
    byLocation: Object.entries(byLocation).map(([location, data]) => ({
      location,
      locationType: data.locationType,
      value: data.value,
      items: data.items,
      percentage: totalValue > 0 ? (data.value / totalValue) * 100 : 0,
    })),
    items: items.sort((a, b) => b.totalValue - a.totalValue), // Sort by value descending
    generatedAt: new Date(),
  };
}
