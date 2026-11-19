import { and, eq, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { inventoryItems, inventoryLocations, inventoryTransactions, users } from "../drizzle/schema";
import { resolveInventoryStock } from "./inventory-stock-mapping";

export type StockAdjustment = {
  locationId: number;
  /** New ABSOLUTE location balance, already in the item's stored base UoM. */
  quantity: number;
  /** Balance observed by the operator; compared with the locked location row. */
  expectedQuantity: number;
  reason?: string;
};

export type UpdateInventoryItemInput = {
  itemNumber?: string;
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
  isActive?: boolean;
  baseUomCode?: string;
  purchaseUomCode?: string;
  issueUomCode?: string;
  stockAdjustment?: StockAdjustment;
};

export function isPositiveInventoryId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** Validate decimal(10,2) without accepting rounded overprecision. */
export function isInventoryBalance(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 99999999.99
    && /^\d+(?:\.\d{1,2})?$/.test(String(value));
}

function positiveId(value: unknown, label: string) {
  if (!isPositiveInventoryId(value)) throw new Error(`${label} must be a positive safe integer`);
}
function balance(value: unknown, label: string) {
  if (!isInventoryBalance(value)) throw new Error(`${label} must be a finite nonnegative decimal(10,2) balance with at most two decimal places`);
  return Math.round(value * 100);
}
function decimal(cents: number) { return (cents / 100).toFixed(2); }

/** Inject only the caller's Drizzle DB. No getDb/auth/environment imports.
 * All business reads and writes use this SAME transaction, never old global
 * stock helpers. The item lock serializes this path even for absent stock rows;
 * existing row(s) are also locked and duplicates fail closed, never upserted.
 * No retries: any transaction/COMMIT error propagates; reconcile an uncertain
 * commit before an operator submits again. Other stock paths remain unchanged.
 */
export async function executeInventoryItemUpdate(
  db: MySql2Database<any>,
  id: number,
  data: UpdateInventoryItemInput,
  actorId: number,
): Promise<true> {
  positiveId(id, "Item ID");
  positiveId(actorId, "Actor ID");
  if (Object.prototype.hasOwnProperty.call(data, "currentStock")) {
    throw new Error("currentStock cannot be edited on an existing item; use stockAdjustment for one location");
  }
  const adjustment = data.stockAdjustment;
  let target = 0;
  let expected = 0;
  let reason = "";
  if (adjustment !== undefined) {
    if (!adjustment || typeof adjustment !== "object") throw new Error("Invalid stockAdjustment");
    positiveId(adjustment.locationId, "Location ID");
    target = balance(adjustment.quantity, "Quantity");
    expected = balance(adjustment.expectedQuantity, "Expected quantity");
    if (adjustment.reason !== undefined && typeof adjustment.reason !== "string") throw new Error("Adjustment reason must be text");
    reason = adjustment.reason?.trim() ?? "";
    if (reason.length > 500 || (target !== expected && !reason)) {
      throw new Error("A trimmed adjustment reason of 1 to 500 characters is required when quantity changes");
    }
  }

  return db.transaction(async tx => {
    const [actor] = await tx.select({ id: users.id, isActive: users.isActive }).from(users)
      .where(eq(users.id, actorId)).for("update");
    if (!actor || actor.isActive !== 1) throw new Error("Update actor must exist and be active");
    const [item] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, id)).for("update");
    if (!item || item.isActive !== 1) throw new Error("Inventory item must exist and be active");

    if (data.itemNumber && data.itemNumber !== item.itemNumber) throw new Error("Item number (SKU) cannot be changed after creation");
    if (data.barcode) {
      const [existing] = await tx.select({ id: inventoryItems.id }).from(inventoryItems)
        .where(and(eq(inventoryItems.barcode, data.barcode), sql`${inventoryItems.id} != ${id}`)).limit(1);
      if (existing) throw new Error("Barcode already exists");
    }

    // Explicit whitelist preserves omitted/legacy NULL classifications and
    // ordinary metadata fields, while dropping untrusted actor/quantity fields.
    const updateData: Record<string, any> = {};
    for (const key of ["name", "longDescription", "itemStatus", "itemType", "barcode",
      "manufacturerPartNumber", "internalReference", "supplierPartNumber", "brand", "model",
      "category", "unit", "unitCost", "baseUomCode", "purchaseUomCode", "issueUomCode"] as const) {
      if (data[key] !== undefined) updateData[key] = data[key];
    }
    for (const key of ["bagSizeKg", "reorderPoint"] as const) {
      if (data[key] !== undefined) updateData[key] = data[key]!.toString();
    }
    if (data.isActive !== undefined) updateData.isActive = data.isActive ? 1 : 0;

    let chosenStock: Awaited<ReturnType<typeof resolveInventoryStock>> | undefined;
    let chosenRow: { id: number; quantity: string } | undefined;
    let before = 0;
    let baseUom: string | undefined;
    if (adjustment !== undefined) {
      const storedBaseUom = item.baseUomCode || item.unit;
      // The existing Edit form fills a NULL base code from the stored unit.
      // That is normalization of the same base unit, not a conversion.
      if ((data.baseUomCode !== undefined && data.baseUomCode !== item.baseUomCode && data.baseUomCode !== storedBaseUom) ||
          (data.unit !== undefined && data.unit !== item.unit && data.unit !== storedBaseUom)) {
        throw new Error("Cannot change the item's base unit/unit together with a stock adjustment");
      }
      if (data.isActive === false || (data.itemStatus !== undefined && data.itemStatus !== item.itemStatus && data.itemStatus !== "active")) {
        throw new Error("Cannot deactivate an item together with a stock adjustment");
      }
      const [location] = await tx.select({ id: inventoryLocations.id, isActive: inventoryLocations.isActive })
        .from(inventoryLocations).where(eq(inventoryLocations.id, adjustment.locationId)).for("update");
      if (!location || location.isActive !== 1) throw new Error("Adjustment location must exist and be active");
      chosenStock = await resolveInventoryStock(tx);
      const rows = await tx.select({ id: chosenStock.id, quantity: chosenStock.quantity }).from(chosenStock)
        .where(and(eq(chosenStock.itemId, id), eq(chosenStock.locationId, adjustment.locationId))).for("update");
      if (rows.length > 1) throw new Error("Duplicate inventory stock rows for this item/location; repair explicitly before editing");
      chosenRow = rows[0];
      before = chosenRow ? balance(Number(chosenRow.quantity), "Stored location quantity") : 0;
      if (before !== expected) throw new Error("Stale location quantity: reload the item and review its current balance before saving");
      if (target !== before) {
        baseUom = item.baseUomCode || item.unit;
        if (!baseUom || baseUom.length > 20) throw new Error("Stored base unit cannot be represented in adjustment history");
        // Existing schema is DECIMAL(10,4), whose integer range is narrower
        // than stock DECIMAL(10,2). Never silently truncate history or migrate.
        if (target > 99999999) throw new Error("Adjustment target exceeds the existing quantityInBaseUnit decimal(10,4) history range");
      }
    }

    if (Object.keys(updateData).length) {
      await tx.update(inventoryItems).set(updateData).where(eq(inventoryItems.id, id));
    }
    if (adjustment !== undefined && target !== before) {
      const utc = new Date().toISOString();
      const timestamp = utc.slice(0, 19).replace("T", " ");
      const stockData = { quantity: decimal(target), lastUpdated: sql`UTC_TIMESTAMP()`, updatedBy: actorId };
      if (chosenRow) {
        positiveId(chosenRow.id, "Stock row ID");
        await tx.update(chosenStock!).set(stockData).where(and(
          eq(chosenStock!.id, chosenRow.id), eq(chosenStock!.itemId, id), eq(chosenStock!.locationId, adjustment.locationId),
        ));
      } else {
        await tx.insert(chosenStock!).values({ itemId: id, locationId: adjustment.locationId, ...stockData });
      }
      await tx.insert(inventoryTransactions).values({
        itemId: id, locationId: adjustment.locationId, transactionType: "adjustment",
        quantity: decimal(target), quantityInBaseUnit: decimal(target), uomCode: baseUom!,
        // No fabricated cost or receipt/FIFO layer.
        unitCost: null, totalCost: null, referenceType: "item_edit_adjustment",
        notes: `Reason: ${reason}\nBefore: ${decimal(before)} ${baseUom}; After: ${decimal(target)} ${baseUom}; Delta: ${decimal(target - before)} ${baseUom}\nUTC: ${utc}; Actor: ${actorId}`,
        transactionDate: timestamp, createdBy: actorId,
      });
    }
    // No-change adjustment (including absent row 0 -> 0): no stock write,
    // timestamp touch, row creation or history. Never reset item.currentStock.
    return true as const;
  });
}
