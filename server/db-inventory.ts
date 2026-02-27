import { getDb } from "./db";
import { inventoryItems, inventoryLocations, inventoryStock, inventoryTransactions } from "../drizzle/schema";
import { eq, and, sql, desc, gte, lte, like, gt } from "drizzle-orm";
import { formatSKU } from "../shared/sku-constants";

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
  itemNumber?: string; // Optional - will be auto-generated if primaryClass/subType/form provided
  primaryClass?: string;
  subType?: string;
  form?: string;
  name: string;
  longDescription?: string;
  itemStatus?: "active" | "inactive" | "discontinued" | "obsolete";
  itemType?: "stocked_item" | "non_stocked" | "service" | "raw_material" | "finished_good" | "consumable";
  barcode?: string;
  manufacturerPartNumber?: string;
  internalReference?: string;
  supplierPartNumber?: string;
  brand?: string;
  model?: string;
  category: string;
  unit: string;
  bagSizeKg?: number;
  reorderPoint?: number;
  unitCost?: number;
  currentStock?: number;
  locationId?: number;
}) {
  const db = await getDb();
  if (!db) return null;

  // Validate barcode uniqueness if provided
  if (data.barcode) {
    const isUnique = await validateBarcodeUniqueness(data.barcode);
    if (!isUnique) {
      throw new Error("Barcode already exists");
    }
  }

  // Auto-generate SKU if components provided
  let itemNumber = data.itemNumber;
  if (data.primaryClass && data.subType && data.form) {
    const seqNumber = await getNextSequentialNumber(
      data.primaryClass,
      data.subType,
      data.form
    );
    itemNumber = formatSKU(data.primaryClass, data.subType, data.form, seqNumber);
  }

  if (!itemNumber) {
    throw new Error("Either itemNumber or (primaryClass + subType + form) must be provided");
  }

  const insertData: any = {
    itemNumber,
    name: data.name,
    category: data.category,
    unit: data.unit,
    itemStatus: data.itemStatus || "active",
    itemType: data.itemType || "stocked_item",
  };

  // Add SKU component fields
  if (data.primaryClass) insertData.primaryClass = data.primaryClass;
  if (data.subType) insertData.subType = data.subType;
  if (data.form) insertData.form = data.form;

  // Add optional SKU Identity Block fields
  if (data.longDescription) insertData.longDescription = data.longDescription;
  if (data.barcode) insertData.barcode = data.barcode;
  if (data.manufacturerPartNumber) insertData.manufacturerPartNumber = data.manufacturerPartNumber;
  if (data.internalReference) insertData.internalReference = data.internalReference;
  if (data.supplierPartNumber) insertData.supplierPartNumber = data.supplierPartNumber;
  if (data.brand) insertData.brand = data.brand;
  if (data.model) insertData.model = data.model;

  if (data.bagSizeKg !== undefined) {
    insertData.bagSizeKg = data.bagSizeKg.toString();
  }
  if (data.reorderPoint !== undefined) {
    insertData.reorderPoint = data.reorderPoint.toString();
  }
  if (data.unitCost !== undefined) {
    insertData.unitCost = data.unitCost;
  }
  if (data.currentStock !== undefined) {
    insertData.currentStock = data.currentStock.toString();
  }

  const result = await db.insert(inventoryItems).values(insertData);
  
  // Fetch the created item to get all fields including defaults
  const insertId = Number(result[0].insertId);
  const [createdItem] = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, insertId));
  
  // If currentStock > 0, create initial stock transaction
  if (data.currentStock && data.currentStock > 0) {
    let targetLocationId = data.locationId;
    
    // If no locationId provided, get or create default location ("Main Warehouse")
    if (!targetLocationId) {
      let defaultLocation = await db
        .select()
        .from(inventoryLocations)
        .where(eq(inventoryLocations.name, "Main Warehouse"))
        .limit(1);
      
      if (defaultLocation.length === 0) {
        // Create default location
        await db.insert(inventoryLocations).values({
          name: "Main Warehouse",
          locationType: "warehouse",
          description: "Default storage location",
          isActive: true,
        });
        defaultLocation = await db
          .select()
          .from(inventoryLocations)
          .where(eq(inventoryLocations.name, "Main Warehouse"))
          .limit(1);
      }
      
      targetLocationId = defaultLocation[0].id;
    }
    
    const locationId = targetLocationId;
    
    // Create or update stock level for the location
    await db.insert(inventoryStock).values({
      itemId: insertId,
      locationId,
      quantity: data.currentStock.toString(),
      updatedBy: 1, // System user
    });
  }
  
  return createdItem || null;
}

export async function updateInventoryItem(
  id: number,
  data: {
    itemNumber?: string; // Will be validated for immutability
    name?: string;
    longDescription?: string;
    itemStatus?: "active" | "inactive" | "discontinued" | "obsolete";
    itemType?: "stocked_item" | "non_stocked" | "service" | "raw_material" | "finished_good" | "consumable";
    barcode?: string;
    manufacturerPartNumber?: string;
    internalReference?: string;
    supplierPartNumber?: string;
    brand?: string;
    model?: string;
    category?: string;
    unit?: string;
    bagSizeKg?: number;
    reorderPoint?: number;
    unitCost?: number;
    currentStock?: number;
    isActive?: boolean;
  }
) {
  const db = await getDb();
  if (!db) return false;

  // Validate SKU immutability - itemNumber cannot be changed
  if (data.itemNumber) {
    const isValid = await validateItemNumberImmutability(id, data.itemNumber);
    if (!isValid) {
      throw new Error("Item number (SKU) cannot be changed after creation");
    }
    // Remove from update data since it shouldn't change
    delete data.itemNumber;
  }

  // Validate barcode uniqueness if being updated
  if (data.barcode) {
    const isUnique = await validateBarcodeUniqueness(data.barcode, id);
    if (!isUnique) {
      throw new Error("Barcode already exists");
    }
  }

  const updateData: any = { ...data };
  if (data.bagSizeKg !== undefined) {
    updateData.bagSizeKg = data.bagSizeKg.toString();
  }
  if (data.reorderPoint !== undefined) {
    updateData.reorderPoint = data.reorderPoint.toString();
  }
  if (data.currentStock !== undefined) {
    updateData.currentStock = data.currentStock.toString();
  }

  // If no fields to update (e.g., only itemNumber was provided and was removed), return success
  if (Object.keys(updateData).length === 0) {
    return true;
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

// Helper function to get current stock level
async function getStockLevel(itemId: number, locationId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

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
    const receiptUnitCost = receipt.unitCost ? parseInt(receipt.unitCost) : 0;

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
      const defaultUnitCost = parseInt(item[0].unitCost);
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

  // Record the transaction
  const result = await db.insert(inventoryTransactions).values({
    itemId: data.itemId,
    locationId: data.locationId,
    transactionType: data.transactionType,
    quantity: data.quantity.toString(),
    unitCost: data.unitCost?.toString(),
    totalCost: calculatedTotalCost?.toString(),
    referenceNumber: data.referenceNumber,
    notes: data.notes,
    transactionDate: data.transactionDate,
    createdBy: data.createdBy,
    flockId: data.flockId,
  } as any);

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
        unitCost: calculatedTotalCost ? (calculatedTotalCost / data.quantity).toString() : undefined,
        totalCost: calculatedTotalCost?.toString(),
        referenceNumber: `TRANSFER-${transactionId}`,
        notes: `Transfer from location ${data.locationId}${data.notes ? ': ' + data.notes : ''}`,
        transactionDate: data.transactionDate,
        createdBy: data.createdBy,
      } as any);
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
    const cost = stock.unitCost ? parseFloat(stock.unitCost) / 100 : 0; // unitCost stored in cents, convert to Rand
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
      unitCost: stock.unitCost,
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
