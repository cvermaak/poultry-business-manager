/**
 * Slaughter Database Helper Functions
 * 
 * Provides database operations for slaughter batch and catch record management
 */

import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../db";
import {
  slaughterBatches,
  slaughterCatchRecords,
  slaughterhouseRecords,
  type InsertSlaughterBatch,
  type InsertSlaughterCatchRecord,
  type InsertSlaughterhouseRecord,
} from "../../drizzle/schema";

/**
 * Create a new slaughter batch
 */
export async function createSlaughterBatch(data: InsertSlaughterBatch) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(slaughterBatches).values(data);
  return result;
}

/**
 * Get all slaughter batches for a flock
 */
export async function getSlaughterBatchesByFlock(flockId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(slaughterBatches)
    .where(eq(slaughterBatches.flockId, flockId))
    .orderBy(desc(slaughterBatches.startDate));
}

/**
 * Get a specific slaughter batch with details
 */
export async function getSlaughterBatchById(batchId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(slaughterBatches)
    .where(eq(slaughterBatches.id, batchId))
    .limit(1);

  return result[0] || null;
}

/**
 * Update a slaughter batch
 */
export async function updateSlaughterBatch(
  batchId: number,
  data: Partial<InsertSlaughterBatch>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(slaughterBatches)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(slaughterBatches.id, batchId));
}

/**
 * Create a catch record for a slaughter batch
 */
export async function createSlaughterCatchRecord(
  data: InsertSlaughterCatchRecord
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(slaughterCatchRecords).values(data);
  return result;
}

/**
 * Get all catch records for a batch
 */
export async function getCatchRecordsByBatch(batchId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(slaughterCatchRecords)
    .where(eq(slaughterCatchRecords.batchId, batchId))
    .orderBy(desc(slaughterCatchRecords.catchDate));
}

/**
 * Get a specific catch record
 */
export async function getCatchRecordById(catchRecordId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(slaughterCatchRecords)
    .where(eq(slaughterCatchRecords.id, catchRecordId))
    .limit(1);

  return result[0] || null;
}

/**
 * Update a catch record
 */
export async function updateSlaughterCatchRecord(
  catchRecordId: number,
  data: Partial<InsertSlaughterCatchRecord>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(slaughterCatchRecords)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(slaughterCatchRecords.id, catchRecordId));
}

/**
 * Delete a catch record
 */
export async function deleteSlaughterCatchRecord(catchRecordId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(slaughterCatchRecords)
    .where(eq(slaughterCatchRecords.id, catchRecordId));
}

/**
 * Create a slaughterhouse record
 */
export async function createSlaughterhouseRecord(
  data: InsertSlaughterhouseRecord
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(slaughterhouseRecords).values(data);
  return result;
}

/**
 * Get slaughterhouse record for a catch record
 */
export async function getSlaughterhouseRecordByCatchId(catchRecordId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(slaughterhouseRecords)
    .where(eq(slaughterhouseRecords.catchRecordId, catchRecordId))
    .limit(1);

  return result[0] || null;
}

/**
 * Update slaughterhouse record
 */
export async function updateSlaughterhouseRecord(
  recordId: number,
  data: Partial<InsertSlaughterhouseRecord>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(slaughterhouseRecords)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(slaughterhouseRecords.id, recordId));
}

/**
 * Get batch summary with catch records and slaughterhouse data
 */
export async function getSlaughterBatchSummary(batchId: number) {
  const db = await getDb();
  if (!db) return null;

  const batch = await getSlaughterBatchById(batchId);
  if (!batch) return null;

  const catchRecords = await getCatchRecordsByBatch(batchId);

  // Get slaughterhouse records for each catch record
  const catchRecordsWithSlaughterhouse = await Promise.all(
    catchRecords.map(async (record) => {
      const slaughterhouseRecord =
        await getSlaughterhouseRecordByCatchId(record.id);
      return {
        ...record,
        slaughterhouseRecord,
      };
    })
  );

  // Calculate totals
  const totalBirdsCaught = catchRecords.reduce(
    (sum, r) => sum + r.birdsCaught,
    0
  );
  const avgFarmWeight =
    catchRecords.length > 0
      ? catchRecords.reduce((sum, r) => sum + parseFloat(r.averageWeightAtFarm.toString()), 0) /
        catchRecords.length
      : 0;
  const avgEstimatedSlaughterhouseWeight =
    catchRecords.length > 0
      ? catchRecords.reduce(
          (sum, r) =>
            sum +
            parseFloat(r.estimatedWeightAtSlaughterhouse.toString()),
          0
        ) / catchRecords.length
      : 0;

  return {
    batch,
    catchRecords: catchRecordsWithSlaughterhouse,
    totalBirdsCaught,
    avgFarmWeight: parseFloat(avgFarmWeight.toFixed(3)),
    avgEstimatedSlaughterhouseWeight: parseFloat(
      avgEstimatedSlaughterhouseWeight.toFixed(3)
    ),
  };
}
