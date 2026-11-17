import { and, eq, like } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { inventoryItems, inventoryLocations, inventoryTransactions, users } from "../drizzle/schema";
import { formatSKU } from "../shared/sku-constants";
import { resolveInventoryStock } from "./inventory-stock-mapping";

export type CreateInventoryItemInput = {
  itemNumber?: string;
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
  baseUomCode?: string;
  purchaseUomCode?: string;
  issueUomCode?: string;
};

function positiveId(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer`);
}

/** Inject the caller's database (or fake) only; imports no getDb/auth/config.
 * One real Drizzle transaction contains every business read/write for creation.
 * Never retries. A transaction/COMMIT transport error propagates unchanged:
 * its outcome may be unknown, so callers must reconcile before retrying.
 */
export async function executeInventoryItemCreate(
  db: MySql2Database<any>,
  data: CreateInventoryItemInput,
  actorId: number,
) {
  positiveId(actorId, "Actor ID");
  if (data.locationId !== undefined) positiveId(data.locationId, "Location ID");
  for (const key of ["bagSizeKg", "reorderPoint", "unitCost", "currentStock"] as const) {
    if (data[key] !== undefined && !Number.isFinite(data[key])) throw new Error(`${key} must be finite`);
  }
  if (data.unitCost !== undefined && (!Number.isSafeInteger(data.unitCost) || data.unitCost < -2147483648 || data.unitCost > 2147483647)) {
    throw new Error("Unit cost must be whole cents within the stored INT range");
  }
  if ((data.currentStock ?? 0) < 0) throw new Error("Initial stock cannot be negative");
  const initialTotalCost = data.unitCost !== undefined && (data.currentStock ?? 0) > 0
    ? Math.round(data.unitCost * data.currentStock!) : null;
  if (initialTotalCost !== null && !Number.isFinite(initialTotalCost)) throw new Error("Initial total cost must be finite");

  return db.transaction(async tx => {
    const [actor] = await tx.select({ id: users.id, isActive: users.isActive })
      .from(users).where(eq(users.id, actorId)).limit(1);
    if (!actor || actor.isActive !== 1) throw new Error("Creation actor must exist and be active");
    const inventoryStock = await resolveInventoryStock(tx);
    if (data.barcode) {
      const [existing] = await tx.select({ id: inventoryItems.id }).from(inventoryItems)
        .where(eq(inventoryItems.barcode, data.barcode)).limit(1);
      if (existing) throw new Error("Barcode already exists");
    }

    let itemNumber = data.itemNumber;
    if (data.primaryClass && data.subType && data.form) {
      const items = await tx.select({ itemNumber: inventoryItems.itemNumber }).from(inventoryItems)
        .where(like(inventoryItems.itemNumber, `${data.primaryClass}-${data.subType}-${data.form}-%`));
      const numbers = items.map(item => parseInt(item.itemNumber.split("-").at(-1)!, 10)).filter(n => !isNaN(n));
      itemNumber = formatSKU(data.primaryClass, data.subType, data.form, numbers.length ? Math.max(...numbers) + 1 : 1);
    }
    if (!itemNumber) throw new Error("Either itemNumber or (primaryClass + subType + form) must be provided");
    const insertData: any = {
      itemNumber, name: data.name, category: data.category, unit: data.unit,
      // New rows only; never backfill/reclassify legacy rows.
      itemStatus: data.itemStatus || "active",
      itemType: data.itemType || "stocked_item",
      baseUomCode: data.baseUomCode || data.unit || null,
    };
    for (const key of ["primaryClass", "subType", "form", "longDescription", "barcode",
      "manufacturerPartNumber", "internalReference", "supplierPartNumber", "brand", "model",
      "purchaseUomCode", "issueUomCode"] as const) {
      if (data[key]) insertData[key] = data[key];
    }
    for (const key of ["bagSizeKg", "reorderPoint", "currentStock"] as const) {
      if (data[key] !== undefined) insertData[key] = data[key]!.toString();
    }
    if (data.unitCost !== undefined) insertData.unitCost = data.unitCost;

    let result;
    try {
      result = await tx.insert(inventoryItems).values(insertData);
    } catch (err: any) {
      // Only translate a known item insert conflict. Do not retry nextSKU races.
      const cause = err?.cause ?? err;
      if (cause?.code === "ER_DUP_ENTRY") {
        throw new Error(`An item with item number '${itemNumber}' already exists. If you previously deleted this item, please contact an admin to restore or permanently remove it.`);
      }
      throw err;
    }
    const insertId = Number(result[0].insertId);
    positiveId(insertId, "Created item ID");
    const [createdItem] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, insertId));
    if (!createdItem) throw new Error("Created inventory item could not be read");

    // Use the item's actual stored base quantity after DECIMAL readback, not
    // an independently rounded quantity or any purchase/issue UoM conversion.
    const openingQuantity = Number(createdItem.currentStock ?? 0);
    if (!Number.isFinite(openingQuantity) || openingQuantity < 0) throw new Error("Invalid stored initial stock");
    if ((data.currentStock ?? 0) > 0 && openingQuantity > 0) {
      let locationId = data.locationId;
      if (locationId !== undefined) {
        const [location] = await tx.select({ id: inventoryLocations.id }).from(inventoryLocations)
          .where(and(eq(inventoryLocations.id, locationId), eq(inventoryLocations.isActive, 1))).limit(1);
        if (!location) throw new Error("Initial stock location must exist and be active");
      } else {
        const [location] = await tx.select({ id: inventoryLocations.id, isActive: inventoryLocations.isActive }).from(inventoryLocations)
          .where(eq(inventoryLocations.name, "Main Warehouse")).limit(1);
        if (location) {
          if (location.isActive !== 1) throw new Error("Initial stock default location must exist and be active");
          locationId = location.id;
        }
        else {
          const locationResult = await tx.insert(inventoryLocations).values({
            name: "Main Warehouse", locationType: "warehouse", description: "Default storage location", isActive: 1,
          });
          locationId = Number(locationResult[0].insertId);
        }
      }
      positiveId(locationId!, "Initial stock location ID");
      const quantity = openingQuantity.toString();
      const receiptTotalCost = data.unitCost !== undefined ? Math.round(data.unitCost * openingQuantity) : null;
      if (receiptTotalCost !== null && !Number.isFinite(receiptTotalCost)) throw new Error("Initial total cost must be finite");
      await tx.insert(inventoryStock).values({
        itemId: insertId, locationId: locationId!, quantity, updatedBy: actorId,
      });
      // Opening stock is already expressed in base UoM (as in current stock).
      // Purchase/issue units never cause an invented conversion or cost change.
      await tx.insert(inventoryTransactions).values({
        itemId: insertId, locationId: locationId!, transactionType: "receipt", quantity,
        uomCode: createdItem.baseUomCode || createdItem.unit || null,
        quantityInBaseUnit: quantity,
        unitCost: data.unitCost ?? null, totalCost: receiptTotalCost,
        referenceType: "initial_stock", notes: "Initial stock on item creation",
        transactionDate: new Date().toISOString().slice(0, 19).replace("T", " "), createdBy: actorId,
      });
    }
    return createdItem;
  });
}
