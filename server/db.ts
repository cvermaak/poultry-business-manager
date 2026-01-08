import { eq, and, gte, lte, desc, asc, sql, or, like, inArray, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  houses,
  flocks,
  flockDailyRecords,
  vaccinationSchedules,
  healthRecords,
  mortalityRecords,
  feedFormulations,
  feedBatches,
  rawMaterials,
  rawMaterialTransactions,
  qualityControlRecords,
  customers,
  customerAddresses,
  salesOrders,
  salesOrderItems,
  invoices,
  invoiceItems,
  payments,
  paymentAllocations,
  suppliers,
  itemTemplates,
  procurementSchedules,
  procurementOrders,
  procurementOrderItems,
  chartOfAccounts,
  generalLedgerEntries,
  inventoryItems,
  inventoryLocations,
  inventoryTransactions,
  documents,
  userActivityLogs,
  reminders,
  vaccines,
  stressPacks,
  flockVaccinationSchedules,
  flockStressPackSchedules,
  reminderTemplates,
  healthProtocolTemplates,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ============================================================================
// USER MANAGEMENT
// ============================================================================

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? undefined;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function listUsers() {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(users).where(eq(users.isActive, true)).orderBy(asc(users.name));
}

export async function updateUserRole(userId: number, role: string) {
  const db = await getDb();
  if (!db) return false;

  await db.update(users).set({ role: role as any }).where(eq(users.id, userId));
  return true;
}

export async function logUserActivity(
  userId: number,
  action: string,
  entityType?: string,
  entityId?: number,
  details?: string,
  ipAddress?: string
) {
  const db = await getDb();
  if (!db) return;

  await db.insert(userActivityLogs).values({
    userId,
    action,
    entityType,
    entityId,
    details,
    ipAddress,
  });
}

// Email/Password Authentication Functions

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByUsername(username: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmailOrUsername(identifier: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users)
    .where(or(eq(users.email, identifier), eq(users.username, identifier)))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createEmailUser(data: {
  username: string;
  email: string;
  name: string;
  passwordHash: string;
  role: "admin" | "farm_manager" | "accountant" | "sales_staff" | "production_worker";
  createdBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(users).values({
    username: data.username,
    email: data.email,
    name: data.name,
    passwordHash: data.passwordHash,
    loginMethod: "email",
    role: data.role,
    isActive: true,
    mustChangePassword: true,
    createdBy: data.createdBy,
  });

  return result[0].insertId;
}

export async function updateUserPassword(userId: number, passwordHash: string, mustChangePassword: boolean = false) {
  const db = await getDb();
  if (!db) return false;

  await db.update(users).set({ 
    passwordHash, 
    mustChangePassword,
    updatedAt: new Date() 
  }).where(eq(users.id, userId));
  return true;
}

export async function updateUserLastSignIn(userId: number) {
  const db = await getDb();
  if (!db) return false;

  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, userId));
  return true;
}

export async function deactivateUser(userId: number) {
  const db = await getDb();
  if (!db) return false;

  await db.update(users).set({ isActive: false }).where(eq(users.id, userId));
  return true;
}

export async function activateUser(userId: number) {
  const db = await getDb();
  if (!db) return false;

  await db.update(users).set({ isActive: true }).where(eq(users.id, userId));
  return true;
}

export async function updateUser(userId: number, data: {
  name?: string;
  email?: string;
  username?: string;
  role?: "admin" | "farm_manager" | "accountant" | "sales_staff" | "production_worker";
}) {
  const db = await getDb();
  if (!db) return false;

  await db.update(users).set({ ...data, updatedAt: new Date() }).where(eq(users.id, userId));
  return true;
}

// ============================================================================
// HOUSE MANAGEMENT
// ============================================================================

export async function listHouses() {
  const db = await getDb();
  if (!db) return [];

  // Get houses with active flock count for status indication
  const houseList = await db.select().from(houses).where(eq(houses.isActive, true)).orderBy(asc(houses.name));
  
  // Get active/planned flock counts per house
  const flockCounts = await db
    .select({
      houseId: flocks.houseId,
      activeCount: sql<number>`SUM(CASE WHEN ${flocks.status} = 'active' THEN 1 ELSE 0 END)`,
      plannedCount: sql<number>`SUM(CASE WHEN ${flocks.status} = 'planned' THEN 1 ELSE 0 END)`,
    })
    .from(flocks)
    .where(inArray(flocks.status, ['active', 'planned']))
    .groupBy(flocks.houseId);
  
  const flockCountMap = new Map(flockCounts.map(fc => [fc.houseId, { active: fc.activeCount || 0, planned: fc.plannedCount || 0 }]));
  
  return houseList.map(house => ({
    ...house,
    activeFlockCount: flockCountMap.get(house.id)?.active || 0,
    plannedFlockCount: flockCountMap.get(house.id)?.planned || 0,
  }));
}

export async function getHouseById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(houses).where(eq(houses.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createHouse(data: Omit<typeof houses.$inferInsert, 'floorArea'>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Calculate floor area
  const length = Number(data.length);
  const width = Number(data.width);
  const floorArea = (length * width).toFixed(2);

  const result = await db.insert(houses).values({
    ...data,
    floorArea,
  });

  return result;
}

export async function updateHouse(id: number, data: Partial<typeof houses.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Recalculate floor area if dimensions changed
  if (data.length || data.width) {
    const house = await getHouseById(id);
    if (house) {
      const length = Number(data.length || house.length);
      const width = Number(data.width || house.width);
      data.floorArea = (length * width).toFixed(2) as any;
    }
  }

  await db.update(houses).set(data).where(eq(houses.id, id));
  return true;
}

export async function deleteHouse(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if house has any flocks (active or otherwise)
  const houseFlocks = await db.select().from(flocks).where(eq(flocks.houseId, id));
  if (houseFlocks.length > 0) {
    const activeFlocks = houseFlocks.filter(f => f.status === 'active' || f.status === 'planned');
    if (activeFlocks.length > 0) {
      throw new Error(`Cannot delete house: ${activeFlocks.length} active/planned flock(s) are using this house`);
    }
    // Soft delete - mark as inactive instead of hard delete if there are historical flocks
    await db.update(houses).set({ isActive: false }).where(eq(houses.id, id));
    return { softDeleted: true, message: "House marked as inactive due to historical flocks" };
  }

  // Hard delete if no flocks ever used this house
  await db.delete(houses).where(eq(houses.id, id));
  return { softDeleted: false, message: "House permanently deleted" };
}

export async function getHouseFlockCount(houseId: number) {
  const db = await getDb();
  if (!db) return { total: 0, active: 0, planned: 0 };

  const houseFlocks = await db.select().from(flocks).where(eq(flocks.houseId, houseId));
  return {
    total: houseFlocks.length,
    active: houseFlocks.filter(f => f.status === 'active').length,
    planned: houseFlocks.filter(f => f.status === 'planned').length,
  };
}

// ============================================================================
// FLOCK MANAGEMENT
// ============================================================================

export async function listFlocks(filters?: { status?: string; houseId?: number }) {
  const db = await getDb();
  if (!db) return [];

  let query = db.select().from(flocks).$dynamic();

  if (filters?.status) {
    query = query.where(eq(flocks.status, filters.status as any));
  }
  if (filters?.houseId) {
    query = query.where(eq(flocks.houseId, filters.houseId));
  }

  const flockList = await query.orderBy(desc(flocks.placementDate));
  
  // Calculate actual current count for each flock based on mortality
  const flocksWithCalculatedCount = await Promise.all(
    flockList.map(async (flock) => {
      const dailyRecords = await getFlockDailyRecords(flock.id);
      const totalMortality = dailyRecords.reduce((sum, record) => 
        sum + (record.mortality || 0), 0
      );
      return {
        ...flock,
        currentCount: flock.initialCount - totalMortality,
      };
    })
  );
  
  return flocksWithCalculatedCount;
}

export async function getFlockById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(flocks).where(eq(flocks.id, id)).limit(1);
  if (result.length === 0) return undefined;
  
  const flock = result[0];
  
  // Calculate actual current count based on mortality from daily records
  const dailyRecords = await getFlockDailyRecords(flock.id);
  const totalMortality = dailyRecords.reduce((sum, record) => 
    sum + (record.mortality || 0), 0
  );
  
  return {
    ...flock,
    currentCount: flock.initialCount - totalMortality,
  };
}

export async function createFlock(data: typeof flocks.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(flocks).values(data);
  return result;
}

export async function updateFlock(id: number, data: Partial<typeof flocks.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(flocks).set(data).where(eq(flocks.id, id));
  
  // Update feed transition reminder dates if feed schedule changed
  const feedScheduleChanged = 
    data.starterToDay !== undefined ||
    data.growerFromDay !== undefined ||
    data.growerToDay !== undefined ||
    data.finisherFromDay !== undefined;
  
  if (feedScheduleChanged) {
    await updateFeedTransitionReminderDates(
      id,
      data.starterToDay ?? undefined,
      data.growerFromDay ?? undefined,
      data.growerToDay ?? undefined,
      data.finisherFromDay ?? undefined
    );
  }
  
  return true;
}

export async function deleteFlockVaccinationSchedules(flockId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(flockVaccinationSchedules).where(eq(flockVaccinationSchedules.flockId, flockId));
  return true;
}

export async function deleteFlockStressPackSchedules(flockId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(flockStressPackSchedules).where(eq(flockStressPackSchedules.flockId, flockId));
  return true;
}

export async function deleteFlockReminders(flockId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(reminders).where(eq(reminders.flockId, flockId));
  return true;
}

export async function updateFlockReminderDates(flockId: number, daysDiff: number) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");
  const flockReminders = await dbConn.select().from(reminders).where(eq(reminders.flockId, flockId));
  for (const reminder of flockReminders) {
    const newDueDate = new Date(reminder.dueDate);
    newDueDate.setDate(newDueDate.getDate() + daysDiff);
    await dbConn.update(reminders)
      .set({ dueDate: newDueDate })
      .where(eq(reminders.id, reminder.id));
  }
  return true;
}

export async function deleteRemindersByTemplate(flockId: number, templateId: number) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");
  await dbConn.delete(reminders)
    .where(and(eq(reminders.flockId, flockId), eq(reminders.templateId, templateId)));
  return true;
}

export async function getAppliedTemplatesForFlock(flockId: number) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");
  const result = await dbConn.select({ templateId: reminders.templateId })
    .from(reminders)
    .where(and(eq(reminders.flockId, flockId), isNotNull(reminders.templateId)))
    .groupBy(reminders.templateId);
  return result.map(r => r.templateId).filter((id): id is number => id !== null);
}

export async function deleteFlock(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Delete all related records first (order matters for foreign key constraints)
  await db.delete(flockDailyRecords).where(eq(flockDailyRecords.flockId, id));
  await db.delete(reminders).where(eq(reminders.flockId, id));
  await db.delete(flockVaccinationSchedules).where(eq(flockVaccinationSchedules.flockId, id));
  await db.delete(flockStressPackSchedules).where(eq(flockStressPackSchedules.flockId, id));
  await db.delete(vaccinationSchedules).where(eq(vaccinationSchedules.flockId, id));
  await db.delete(healthRecords).where(eq(healthRecords.flockId, id));
  await db.delete(mortalityRecords).where(eq(mortalityRecords.flockId, id));
  await db.delete(procurementSchedules).where(eq(procurementSchedules.flockId, id));
  // Set flockId to null for sales_order_items instead of deleting (preserve sales history)
  await db.update(salesOrderItems).set({ flockId: null }).where(eq(salesOrderItems.flockId, id));
  
  // Now delete the flock
  await db.delete(flocks).where(eq(flocks.id, id));
  return true;
}

export async function getFlockDailyRecords(flockId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(flockDailyRecords)
    .where(eq(flockDailyRecords.flockId, flockId))
    .orderBy(asc(flockDailyRecords.recordDate));
}

export async function createFlockDailyRecord(data: typeof flockDailyRecords.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(flockDailyRecords).values(data);
  return result;
}

export async function updateFlockDailyRecord(id: number, data: Partial<typeof flockDailyRecords.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(flockDailyRecords)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(flockDailyRecords.id, id));
  return { success: true };
}

export async function getFlockDailyRecordById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(flockDailyRecords).where(eq(flockDailyRecords.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function deleteFlockDailyRecord(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(flockDailyRecords).where(eq(flockDailyRecords.id, id));
  return { success: true };
}

export async function getFlockVaccinationSchedule(flockId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(vaccinationSchedules)
    .where(eq(vaccinationSchedules.flockId, flockId))
    .orderBy(asc(vaccinationSchedules.scheduledDate));
}

export async function getFlockHealthRecords(flockId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(healthRecords)
    .where(eq(healthRecords.flockId, flockId))
    .orderBy(desc(healthRecords.recordDate));
}

// ============================================================================
// FEED MANUFACTURING
// ============================================================================

export async function listFeedFormulations(filters?: { feedRange?: string; feedStage?: string }) {
  const db = await getDb();
  if (!db) return [];

  let query = db.select().from(feedFormulations).$dynamic();

  if (filters?.feedRange) {
    query = query.where(eq(feedFormulations.feedRange, filters.feedRange as any));
  }
  if (filters?.feedStage) {
    query = query.where(eq(feedFormulations.feedStage, filters.feedStage as any));
  }

  return await query.where(eq(feedFormulations.isActive, true)).orderBy(asc(feedFormulations.name));
}

export async function getFeedFormulationById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(feedFormulations).where(eq(feedFormulations.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function listFeedBatches(limit = 50) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(feedBatches).orderBy(desc(feedBatches.productionDate)).limit(limit);
}

export async function getFeedBatchById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(feedBatches).where(eq(feedBatches.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function listRawMaterials() {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(rawMaterials).where(eq(rawMaterials.isActive, true)).orderBy(asc(rawMaterials.name));
}

export async function getRawMaterialById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(rawMaterials).where(eq(rawMaterials.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ============================================================================
// CUSTOMER MANAGEMENT
// ============================================================================

export async function listCustomers(filters?: { segment?: string; isActive?: boolean }) {
  const db = await getDb();
  if (!db) return [];

  let query = db.select().from(customers).$dynamic();

  if (filters?.segment) {
    query = query.where(eq(customers.segment, filters.segment as any));
  }
  if (filters?.isActive !== undefined) {
    query = query.where(eq(customers.isActive, filters.isActive));
  }

  return await query.orderBy(asc(customers.name));
}

export async function getCustomerById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createCustomer(data: typeof customers.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(customers).values(data);
  return result;
}

export async function getCustomerAddresses(customerId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(customerAddresses).where(eq(customerAddresses.customerId, customerId));
}

// ============================================================================
// SALES & INVOICING
// ============================================================================

export async function listInvoices(filters?: { customerId?: number; status?: string }) {
  const db = await getDb();
  if (!db) return [];

  let query = db.select().from(invoices).$dynamic();

  if (filters?.customerId) {
    query = query.where(eq(invoices.customerId, filters.customerId));
  }
  if (filters?.status) {
    query = query.where(eq(invoices.status, filters.status as any));
  }

  return await query.orderBy(desc(invoices.invoiceDate));
}

export async function getInvoiceById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getInvoiceItems(invoiceId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
}

export async function listPayments(customerId?: number) {
  const db = await getDb();
  if (!db) return [];

  let query = db.select().from(payments).$dynamic();

  if (customerId) {
    query = query.where(eq(payments.customerId, customerId));
  }

  return await query.orderBy(desc(payments.paymentDate));
}

// ============================================================================
// PROCUREMENT & SUPPLIER MANAGEMENT
// ============================================================================

export async function listSuppliers(filters?: { category?: string; isActive?: boolean }) {
  const db = await getDb();
  if (!db) return [];

  let query = db.select().from(suppliers).$dynamic();

  if (filters?.category) {
    query = query.where(eq(suppliers.category, filters.category));
  }
  if (filters?.isActive !== undefined) {
    query = query.where(eq(suppliers.isActive, filters.isActive));
  }

  return await query.orderBy(asc(suppliers.name));
}

export async function getSupplierById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function listItemTemplates(filters?: { category?: string; isActive?: boolean }) {
  const db = await getDb();
  if (!db) return [];

  let query = db.select().from(itemTemplates).$dynamic();

  if (filters?.category) {
    query = query.where(eq(itemTemplates.category, filters.category));
  }
  if (filters?.isActive !== undefined) {
    query = query.where(eq(itemTemplates.isActive, filters.isActive));
  }

  return await query.orderBy(asc(itemTemplates.name));
}

export async function getItemTemplateById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(itemTemplates).where(eq(itemTemplates.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function listProcurementSchedules(flockId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(procurementSchedules)
    .where(eq(procurementSchedules.flockId, flockId))
    .orderBy(asc(procurementSchedules.scheduledOrderDate));
}

export async function listUpcomingProcurementSchedules(days = 7) {
  const db = await getDb();
  if (!db) return [];

  const today = new Date();
  const futureDate = new Date();
  futureDate.setDate(today.getDate() + days);

  return await db
    .select()
    .from(procurementSchedules)
    .where(
      and(
        gte(procurementSchedules.scheduledOrderDate, today),
        lte(procurementSchedules.scheduledOrderDate, futureDate),
        eq(procurementSchedules.status, "pending")
      )
    )
    .orderBy(asc(procurementSchedules.scheduledOrderDate));
}

// ============================================================================
// FINANCIAL ACCOUNTING
// ============================================================================

export async function listChartOfAccounts(accountType?: string) {
  const db = await getDb();
  if (!db) return [];

  let query = db.select().from(chartOfAccounts).$dynamic();

  if (accountType) {
    query = query.where(eq(chartOfAccounts.accountType, accountType as any));
  }

  return await query.where(eq(chartOfAccounts.isActive, true)).orderBy(asc(chartOfAccounts.accountNumber));
}

export async function getChartOfAccountById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function listGeneralLedgerEntries(filters?: {
  accountId?: number;
  startDate?: Date;
  endDate?: Date;
}) {
  const db = await getDb();
  if (!db) return [];

  let query = db.select().from(generalLedgerEntries).$dynamic();

  if (filters?.accountId) {
    query = query.where(eq(generalLedgerEntries.accountId, filters.accountId));
  }
  if (filters?.startDate) {
    query = query.where(gte(generalLedgerEntries.entryDate, filters.startDate));
  }
  if (filters?.endDate) {
    query = query.where(lte(generalLedgerEntries.entryDate, filters.endDate));
  }

  return await query.orderBy(desc(generalLedgerEntries.entryDate));
}

// ============================================================================
// INVENTORY MANAGEMENT
// ============================================================================

export async function listInventoryItems(category?: string) {
  const db = await getDb();
  if (!db) return [];

  let query = db.select().from(inventoryItems).$dynamic();

  if (category) {
    query = query.where(eq(inventoryItems.category, category as any));
  }

  return await query.where(eq(inventoryItems.isActive, true)).orderBy(asc(inventoryItems.name));
}

export async function getInventoryItemById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function listInventoryLocations() {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(inventoryLocations).where(eq(inventoryLocations.isActive, true)).orderBy(asc(inventoryLocations.name));
}

// ============================================================================
// DOCUMENT MANAGEMENT
// ============================================================================

export async function listDocuments(filters?: {
  category?: string;
  relatedEntityType?: string;
  relatedEntityId?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  let query = db.select().from(documents).$dynamic();

  if (filters?.category) {
    query = query.where(eq(documents.category, filters.category as any));
  }
  if (filters?.relatedEntityType && filters?.relatedEntityId) {
    query = query.where(
      and(
        eq(documents.relatedEntityType, filters.relatedEntityType),
        eq(documents.relatedEntityId, filters.relatedEntityId)
      )
    );
  }

  return await query.where(eq(documents.status, "active")).orderBy(desc(documents.uploadedAt));
}

export async function getDocumentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ============================================================================
// ANALYTICS & REPORTING HELPERS
// ============================================================================

export async function getActiveFlockCount() {
  const db = await getDb();
  if (!db) return 0;

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(flocks)
    .where(eq(flocks.status, "active"));

  return result[0]?.count || 0;
}

export async function getTotalCustomerCount() {
  const db = await getDb();
  if (!db) return 0;

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(customers)
    .where(eq(customers.isActive, true));

  return result[0]?.count || 0;
}

export async function getMonthlyRevenue(year: number, month: number) {
  const db = await getDb();
  if (!db) return 0;

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const result = await db
    .select({ total: sql<number>`sum(${invoices.totalAmount})` })
    .from(invoices)
    .where(
      and(
        gte(invoices.invoiceDate, startDate),
        lte(invoices.invoiceDate, endDate),
        or(eq(invoices.status, "paid"), eq(invoices.status, "partial"))
      )
    );

  return result[0]?.total || 0;
}


// ============================================================================
// ADDITIONAL FLOCK MANAGEMENT FUNCTIONS
// ============================================================================

export async function createHealthRecord(data: typeof healthRecords.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(healthRecords).values(data);
  return result;
}

export async function createVaccinationSchedule(data: typeof vaccinationSchedules.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(vaccinationSchedules).values(data);
  return result;
}

export async function updateVaccinationSchedule(id: number, data: Partial<typeof vaccinationSchedules.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(vaccinationSchedules).set(data).where(eq(vaccinationSchedules.id, id));
  return true;
}

export async function getMortalityRecords(flockId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(mortalityRecords)
    .where(eq(mortalityRecords.flockId, flockId))
    .orderBy(asc(mortalityRecords.recordDate));
}

export async function getFlockPerformanceMetrics(flockId: number) {
  const db = await getDb();
  if (!db) return null;

  const flock = await getFlockById(flockId);
  if (!flock) return null;

  const dailyRecords = await getFlockDailyRecords(flockId);
  
  // Calculate totals
  const totalFeedConsumed = dailyRecords.reduce((sum, record) => 
    sum + (record.feedConsumed ? parseFloat(record.feedConsumed.toString()) : 0), 0
  );
  
  const totalMortality = dailyRecords.reduce((sum, record) => 
    sum + (record.mortality || 0), 0
  );

  // Get latest weight sample
  //const latestRecord = dailyRecords[dailyRecords.length - 1];
  //const averageWeight = latestRecord?.averageWeight 
  //  ? parseFloat(latestRecord.averageWeight.toString()) 
  //  : 0;
  
  // NEW CODE //
  // Get latest weight sample (find the most recent record with a non-zero weight)
  let averageWeight = 0;
  for (let i = 0; i < dailyRecords.length; i++) {
    const record = dailyRecords[i];
    if (record.averageWeight && parseFloat(record.averageWeight.toString()) > 0) {
      averageWeight = parseFloat(record.averageWeight.toString());
    }
  }
  // END NEW CODE //

  // Calculate current count as initial count minus cumulative mortality
  const calculatedCurrentCount = flock.initialCount - totalMortality;

  // Calculate FCR (Feed Conversion Ratio) using calculated current count
  const totalWeight = calculatedCurrentCount * averageWeight;
  const fcr = totalWeight > 0 ? totalFeedConsumed / totalWeight : 0;

  // Calculate mortality rate
  const mortalityRate = flock.initialCount > 0 
    ? (totalMortality / flock.initialCount) * 100 
    : 0;

  // Calculate age in days (placement day = Day 0)
  // Use UTC dates to ensure consistent calculation regardless of server timezone
  const placementDate = new Date(flock.placementDate);
  const today = new Date();
  // Get UTC date components only (year, month, day) to avoid timezone issues
  const placementUTC = Date.UTC(placementDate.getUTCFullYear(), placementDate.getUTCMonth(), placementDate.getUTCDate());
  const todayUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const ageInDays = Math.floor((todayUTC - placementUTC) / (1000 * 60 * 60 * 24));

// Shrinkage (fixed for now, configurable later)
  const DEFAULT_SHRINKAGE_PERCENT = 6.5;

// Delivered (slaughterhouse) target
  const deliveredTargetWeight =
  flock.targetSlaughterWeight
    ? parseFloat(flock.targetSlaughterWeight)
    : 0;

// Convert to pre-catch (farm) target weight
  const targetWeight =
  deliveredTargetWeight > 0
    ? deliveredTargetWeight / (1 - DEFAULT_SHRINKAGE_PERCENT / 100)
    : 0;
	
  const growingPeriod = flock.growingPeriod || 42;

  return {
    flockId: flock.id,
    flockNumber: flock.flockNumber,
    ageInDays,
    currentCount: calculatedCurrentCount,
    initialCount: flock.initialCount,
    totalMortality,
    mortalityRate: parseFloat(mortalityRate.toFixed(2)),
    totalFeedConsumed: parseFloat(totalFeedConsumed.toFixed(2)),
    averageWeight: parseFloat(averageWeight.toFixed(3)),
    fcr: parseFloat(fcr.toFixed(2)),
    targetWeight,
    growingPeriod,
    daysRemaining: growingPeriod - ageInDays,
  };
}


// ============================================================================
// Breed-Specific Target Growth Curve Functions
// ============================================================================

type BreedType = 'ross_308' | 'cobb_500' | 'arbor_acres';

/**
 * Breed-specific growth curves based on official performance objectives (2022)
 * All weights in kg
 */
const BREED_GROWTH_CURVES: Record<BreedType, Record<number, number>> = {
  ross_308: {
    0: 0.042, 7: 0.170, 14: 0.465, 21: 0.925, 28: 1.505, 35: 2.180, 42: 2.950, 49: 3.790,
  },
  cobb_500: {
    0: 0.042, 7: 0.175, 14: 0.480, 21: 0.950, 28: 1.540, 35: 2.215, 42: 2.970, 49: 3.800,
  },
  arbor_acres: {
    0: 0.042, 7: 0.168, 14: 0.458, 21: 0.910, 28: 1.480, 35: 2.145, 42: 2.900, 49: 3.720,
  },
};

/**
 * Get target weight for a specific breed and day
 * Uses linear interpolation for days between defined points
 * Uses linear extrapolation for days beyond 49
 */
export function getTargetWeight(dayNumber: number, breed: BreedType = 'ross_308'): number {
  const growthCurve = BREED_GROWTH_CURVES[breed];
  
  // If exact day exists, return it
  if (growthCurve[dayNumber] !== undefined) {
    return growthCurve[dayNumber]!;
  }
  
  // Get sorted day keys
  const days = Object.keys(growthCurve).map(Number).sort((a, b) => a - b);
  
  // For days before first defined point
  if (dayNumber < days[0]!) {
    return growthCurve[days[0]!]!;
  }
  
  // For days beyond last defined point, use linear extrapolation
  if (dayNumber > days[days.length - 1]!) {
    const lastDay = days[days.length - 1]!;
    const secondLastDay = days[days.length - 2]!;
    const dailyGain = (growthCurve[lastDay]! - growthCurve[secondLastDay]!) / (lastDay - secondLastDay);
    return growthCurve[lastDay]! + (dayNumber - lastDay) * dailyGain;
  }
  
  // For days between defined points, use linear interpolation
  for (let i = 0; i < days.length - 1; i++) {
    const lowerDay = days[i]!;
    const upperDay = days[i + 1]!;
    
    if (dayNumber >= lowerDay && dayNumber <= upperDay) {
      const fraction = (dayNumber - lowerDay) / (upperDay - lowerDay);
      return growthCurve[lowerDay]! + (growthCurve[upperDay]! - growthCurve[lowerDay]!) * fraction;
    }
  }
  
  // Fallback
  return 0.042;
}

/**
 * Legacy function for backward compatibility - defaults to Ross 308
 * @deprecated Use getTargetWeight(dayNumber, breed) instead
 */
function getTargetWeightLegacy(dayNumber: number): number {
  return getTargetWeight(dayNumber, 'ross_308');
}

/**
 * Get target growth curve data for charting (breed-specific)
 * Returns array of {day, targetWeight} for the specified day range
 */
export function getTargetGrowthCurve(input: {
  startDay: number;
  endDay: number;
  breed: BreedType;
  deliveredTargetWeight: number;
  growingPeriod: number;
  shrinkagePercent?: number;
}): Array<{ day: number; targetWeight: number }> {

  const {
    startDay,
    endDay,
    deliveredTargetWeight,
    growingPeriod,
    shrinkagePercent = 6.5,
  } = input;

  if (!deliveredTargetWeight || deliveredTargetWeight <= 0) {
    throw new Error("Invalid delivered target weight");
  }

  if (!growingPeriod || growingPeriod <= 0) {
    throw new Error("Invalid growing period");
  }

  // 1️⃣ Convert delivered weight → pre-catch live weight
  const preCatchTargetWeight =
    deliveredTargetWeight / (1 - shrinkagePercent / 100);

  // 2️⃣ Expected average daily gain (kg/day)
  const expectedDailyGain =
    preCatchTargetWeight / growingPeriod;

  // 3️⃣ Build curve
  const curve: Array<{ day: number; targetWeight: number }> = [];

  for (let day = startDay; day <= endDay; day++) {
    curve.push({
      day,
      targetWeight: Number((expectedDailyGain * day).toFixed(4)),
    });
  }

  return curve;
}

/**
 * Calculate performance deviation from target (breed-specific)
 * Returns percentage deviation (positive = ahead of target, negative = behind target)
 */
export function calculatePerformanceDeviation(actualWeight: number, dayNumber: number, breed: BreedType = 'ross_308'): number {
  const targetWeight = getTargetWeight(dayNumber, breed);
  if (targetWeight === 0) return 0;
  
  const deviation = ((actualWeight - targetWeight) / targetWeight) * 100;
  return Math.round(deviation * 10) / 10; // Round to 1 decimal place
}

/**
 * Get performance status based on deviation from target
 * Returns: 'ahead' | 'on-track' | 'behind' | 'critical'
 */
export function getPerformanceStatus(deviation: number): 'ahead' | 'on-track' | 'behind' | 'critical' {
  if (deviation >= 5) return 'ahead';           // 5% or more ahead
  if (deviation >= -5) return 'on-track';       // Within ±5%
  if (deviation > -10) return 'behind';         // 5-10% behind (not including -10%)
  return 'critical';                             // -10% or more behind
}


/**
 * Validate if target weight is realistic for given breed and growing period
 * Returns { isRealistic: boolean, expectedWeight: number, message: string }
 */
export function validateTargetWeight(
  breed: "ross_308" | "cobb_500" | "arbor_acres",
  growingPeriod: number,
  targetWeight: number
): { isRealistic: boolean; expectedWeight: number; message: string } {
  const expectedWeight = getTargetWeight(growingPeriod, breed);
  const deviation = ((targetWeight - expectedWeight) / expectedWeight) * 100;
  
  // Allow ±15% deviation from expected weight
  const isRealistic = Math.abs(deviation) <= 15;
  
  let message = "";
  if (!isRealistic) {
    if (deviation > 15) {
      message = `Target weight (${targetWeight.toFixed(2)}kg) is ${deviation.toFixed(1)}% higher than expected ${expectedWeight.toFixed(2)}kg for ${breed.replace("_", " ")} at day ${growingPeriod}. This may be unrealistic.`;
    } else {
      message = `Target weight (${targetWeight.toFixed(2)}kg) is ${Math.abs(deviation).toFixed(1)}% lower than expected ${expectedWeight.toFixed(2)}kg for ${breed.replace("_", " ")} at day ${growingPeriod}. This may indicate poor performance.`;
    }
  } else {
    message = `Target weight is realistic for ${breed.replace("_", " ")} at day ${growingPeriod} (expected: ${expectedWeight.toFixed(2)}kg)`;
  }
  
  return { isRealistic, expectedWeight, message };
}


// ============================================================================
// REMINDER MANAGEMENT
// ============================================================================

export async function listReminders(filters?: {
  flockId?: number;
  houseId?: number;
  status?: string;
  statusIn?: string[];
  priority?: string;
  startDate?: Date;
  endDate?: Date;
  completedStartDate?: Date;
  completedEndDate?: Date;
}) {
  const db = await getDb();
  if (!db) return [];

  // Build conditions array to combine with and()
  const conditions: any[] = [];

  if (filters?.flockId !== undefined) {
    // When filtering by flockId, only return reminders for that specific flock
    // This excludes reminders with null flockId (orphaned test data)
    conditions.push(eq(reminders.flockId, filters.flockId));
  }
  if (filters?.houseId) {
    conditions.push(eq(reminders.houseId, filters.houseId));
  }
  if (filters?.status) {
    conditions.push(eq(reminders.status, filters.status as any));
  }
  if (filters?.statusIn && filters.statusIn.length > 0) {
    conditions.push(inArray(reminders.status, filters.statusIn as any));
  }
  if (filters?.priority) {
    conditions.push(eq(reminders.priority, filters.priority as any));
  }
  if (filters?.startDate) {
    conditions.push(gte(reminders.dueDate, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(reminders.dueDate, filters.endDate));
  }
  if (filters?.completedStartDate) {
    conditions.push(gte(reminders.completedAt, filters.completedStartDate));
  }
  if (filters?.completedEndDate) {
    conditions.push(lte(reminders.completedAt, filters.completedEndDate));
  }

  // Apply all conditions with and()
  let query = db.select().from(reminders).$dynamic();
  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  // Order by completedAt desc if filtering by completion date, otherwise by dueDate asc
  if (filters?.completedStartDate || filters?.completedEndDate) {
    return await query.orderBy(desc(reminders.completedAt));
  }
  return await query.orderBy(asc(reminders.dueDate));
}

export async function getUpcomingReminders(days: number = 7) {
  const db = await getDb();
  if (!db) return [];

  // Use UTC dates to ensure consistent filtering regardless of server timezone
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const futureDate = new Date(todayStart);
  futureDate.setUTCDate(futureDate.getUTCDate() + days);

  const results = await db
    .select({
      id: reminders.id,
      flockId: reminders.flockId,
      houseId: reminders.houseId,
      reminderType: reminders.reminderType,
      title: reminders.title,
      description: reminders.description,
      dueDate: reminders.dueDate,
      priority: reminders.priority,
      status: reminders.status,
      completedAt: reminders.completedAt,
      completedBy: reminders.completedBy,
      templateId: reminders.templateId,
      actionNotes: reminders.actionNotes,
      createdAt: reminders.createdAt,
      updatedAt: reminders.updatedAt,
      houseName: houses.name,
    })
    .from(reminders)
    .leftJoin(houses, eq(reminders.houseId, houses.id))
    .where(
      and(
        gte(reminders.dueDate, todayStart),
        lte(reminders.dueDate, futureDate),
        eq(reminders.status, "pending")
      )
    )
    .orderBy(asc(reminders.dueDate));

  return results;
}

export async function getTodayReminders() {
  const db = await getDb();
  if (!db) return [];

  // Use UTC dates to ensure consistent filtering regardless of server timezone
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const todayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

  const results = await db
    .select({
      id: reminders.id,
      flockId: reminders.flockId,
      houseId: reminders.houseId,
      reminderType: reminders.reminderType,
      title: reminders.title,
      description: reminders.description,
      dueDate: reminders.dueDate,
      priority: reminders.priority,
      status: reminders.status,
      completedAt: reminders.completedAt,
      completedBy: reminders.completedBy,
      templateId: reminders.templateId,
      actionNotes: reminders.actionNotes,
      createdAt: reminders.createdAt,
      updatedAt: reminders.updatedAt,
      houseName: houses.name,
    })
    .from(reminders)
    .leftJoin(houses, eq(reminders.houseId, houses.id))
    .where(
      and(
        gte(reminders.dueDate, todayStart),
        lte(reminders.dueDate, todayEnd),
        eq(reminders.status, "pending")
      )
    )
    .orderBy(asc(reminders.dueDate));

  return results;
}

export async function createReminder(data: typeof reminders.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(reminders).values(data);
  return { insertId: (result as any)[0]?.insertId || (result as any).insertId };
}

export async function updateReminderStatus(
  id: number,
  status: "pending" | "completed" | "dismissed",
  completedBy?: number,
  actionNotes?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: any = { status };
  if (completedBy) {
    updateData.completedBy = completedBy;
    updateData.completedAt = new Date();
  }
  if (actionNotes) {
    updateData.actionNotes = actionNotes;
  }

  await db.update(reminders).set(updateData).where(eq(reminders.id, id));
  return { success: true };
}

export async function deleteReminder(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(reminders).where(eq(reminders.id, id));
  return { success: true };
}

/**
 * Generate automatic reminders for a flock based on placement date and configuration
 */
export async function generateFlockReminders(flockId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const flock = await getFlockById(flockId);
  if (!flock) throw new Error("Flock not found");

  const house = await getHouseById(flock.houseId);
  if (!house) throw new Error("House not found");

  const placementDate = new Date(flock.placementDate);
  const remindersToCreate: Array<typeof reminders.$inferInsert> = [];

  // House Preparation Reminders (before placement)
  const cleaningDate = new Date(placementDate);
  cleaningDate.setDate(cleaningDate.getDate() - 7);
  remindersToCreate.push({
    flockId,
    houseId: flock.houseId,
    reminderType: "house_preparation",
    title: `House Cleaning - ${house.name}`,
    description: `Clean and wash house ${house.name} in preparation for flock ${flock.flockNumber}`,
    dueDate: cleaningDate,
    priority: "high",
  });

  const disinfectionDate = new Date(placementDate);
  disinfectionDate.setDate(disinfectionDate.getDate() - 3);
  remindersToCreate.push({
    flockId,
    houseId: flock.houseId,
    reminderType: "house_preparation",
    title: `Disinfection - ${house.name}`,
    description: `Disinfect house ${house.name} for flock ${flock.flockNumber}`,
    dueDate: disinfectionDate,
    priority: "high",
  });

  const beddingDate = new Date(placementDate);
  beddingDate.setDate(beddingDate.getDate() - 3);
  remindersToCreate.push({
    flockId,
    houseId: flock.houseId,
    reminderType: "house_preparation",
    title: `Pine Shavings Delivery - ${house.name}`,
    description: `Ensure pine shavings are delivered for house ${house.name}`,
    dueDate: beddingDate,
    priority: "high",
  });

  // Feed Transition Reminders
  if (flock.starterToDay) {
    const starterToGrowerDate = new Date(placementDate);
    starterToGrowerDate.setDate(starterToGrowerDate.getDate() + (flock.starterToDay || 0));
    remindersToCreate.push({
      flockId,
      houseId: flock.houseId,
      reminderType: "feed_transition",
      title: `Feed Transition: Starter → Grower`,
      description: `Change from ${flock.starterFeedType} starter to ${flock.growerFeedType} grower feed for flock ${flock.flockNumber}`,
      dueDate: starterToGrowerDate,
      priority: "high",
    });
  }

  if (flock.growerToDay) {
    const growerToFinisherDate = new Date(placementDate);
    growerToFinisherDate.setDate(growerToFinisherDate.getDate() + (flock.growerToDay || 0));
    remindersToCreate.push({
      flockId,
      houseId: flock.houseId,
      reminderType: "feed_transition",
      title: `Feed Transition: Grower → Finisher`,
      description: `Change from ${flock.growerFeedType} grower to ${flock.finisherFeedType} finisher feed for flock ${flock.flockNumber}`,
      dueDate: growerToFinisherDate,
      priority: "high",
    });
  }

  // Vaccination Reminders (get from vaccination schedule)
  const vaccinations = await getFlockVaccinationSchedule(flockId);
  for (const vacc of vaccinations) {
    if (vacc.status === "scheduled") {
      remindersToCreate.push({
        flockId,
        houseId: flock.houseId,
        reminderType: "vaccination",
        title: `Vaccination: ${vacc.vaccineName}`,
        description: `Administer ${vacc.vaccineName} to flock ${flock.flockNumber}. Dosage: ${vacc.dosage || "As per protocol"}`,
        dueDate: vacc.scheduledDate,
        priority: "urgent",
      });
    }
  }

  // Routine Task Reminders
  const weightSamplingDays = [7, 14, 21, 28, 35, 42];
  for (const day of weightSamplingDays) {
    if (day <= (flock.growingPeriod || 42)) {
      const samplingDate = new Date(placementDate);
      samplingDate.setDate(samplingDate.getDate() + day);
      remindersToCreate.push({
        flockId,
        houseId: flock.houseId,
        reminderType: "routine_task",
        title: `Weight Sampling - Day ${day}`,
        description: `Conduct weight sampling for flock ${flock.flockNumber} (Day ${day})`,
        dueDate: samplingDate,
        priority: "medium",
      });
    }
  }

  // Milestone Reminders
  const slaughterDate = new Date(placementDate);
  slaughterDate.setDate(slaughterDate.getDate() + (flock.growingPeriod || 42));
  remindersToCreate.push({
    flockId,
    houseId: flock.houseId,
    reminderType: "milestone",
    title: `Expected Slaughter Date`,
    description: `Flock ${flock.flockNumber} reaches target age (${flock.growingPeriod || 42} days)`,
    dueDate: slaughterDate,
    priority: "high",
  });

  // Biosecurity Reminders (recurring every 3 days for footbath)
  for (let day = 0; day <= (flock.growingPeriod || 42); day += 3) {
    const footbathDate = new Date(placementDate);
    footbathDate.setDate(footbathDate.getDate() + day);
    remindersToCreate.push({
      flockId,
      houseId: flock.houseId,
      reminderType: "biosecurity",
      title: `Footbath Solution Change`,
      description: `Change footbath solution for house ${house.name}`,
      dueDate: footbathDate,
      priority: "low",
    });
  }

  // Environmental Check Reminders (weekly)
  for (let week = 1; week <= Math.ceil((flock.growingPeriod || 42) / 7); week++) {
    const checkDate = new Date(placementDate);
    checkDate.setDate(checkDate.getDate() + (week * 7));
    remindersToCreate.push({
      flockId,
      houseId: flock.houseId,
      reminderType: "environmental_check",
      title: `Environmental Check - Week ${week}`,
      description: `Check temperature, humidity, and CO2 levels for house ${house.name}`,
      dueDate: checkDate,
      priority: "medium",
    });
  }

  // Insert all reminders
  if (remindersToCreate.length > 0) {
    await db.insert(reminders).values(remindersToCreate);
  }

  return remindersToCreate.length;
}

export async function generateRemindersFromTemplates(flockId: number, templateIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (templateIds.length === 0) return 0;

  const flock = await getFlockById(flockId);
  if (!flock) throw new Error("Flock not found");

  const templates = await db.select().from(reminderTemplates).where(inArray(reminderTemplates.id, templateIds));
  const placementDate = new Date(flock.placementDate);
  const remindersToCreate: Array<typeof reminders.$inferInsert> = [];

  for (const template of templates) {
    // Check if this is a bundle template
    if (template.isBundle && template.bundleConfig) {
      // Generate multiple reminders from bundle configuration
      const bundleConfig = template.bundleConfig as any[];
      for (const category of bundleConfig) {
        if (category.enabled && category.reminders) {
          // Get the reminderType from the category level (e.g., "vaccination", "feed_transition")
          const categoryReminderType = category.category as string;
          
          for (const reminderDef of category.reminders) {
            // Use 'name' field from bundle config (not 'title')
            const reminderTitle = reminderDef.name || reminderDef.title;
            // Use category-level reminderType, fallback to reminderDef.reminderType if exists
            const reminderType = reminderDef.reminderType || categoryReminderType;
            
            // For feed_transition reminders, use flock's actual feed schedule instead of template dayOffset
            let actualDayOffset = reminderDef.dayOffset;
            if (reminderType === "feed_transition") {
              if (reminderTitle.includes("Starter") && reminderTitle.includes("Grower")) {
                actualDayOffset = flock.starterToDay || reminderDef.dayOffset;
              } else if (reminderTitle.includes("Grower") && reminderTitle.includes("Finisher")) {
                actualDayOffset = flock.growerToDay || reminderDef.dayOffset;
              }
            }
            
            const dueDate = new Date(placementDate);
            dueDate.setDate(dueDate.getDate() + actualDayOffset);
            
            remindersToCreate.push({
              flockId,
              houseId: flock.houseId,
              reminderType: reminderType,
              title: reminderTitle,
              description: reminderDef.description || `${reminderTitle} for flock ${flock.flockNumber}`,
              dueDate,
              priority: reminderDef.priority,
              templateId: template.id,
            });
          }
        }
      }
    } else {
      // Single reminder template
      const dueDate = new Date(placementDate);
      dueDate.setDate(dueDate.getDate() + template.dayOffset);

      remindersToCreate.push({
        flockId,
        houseId: flock.houseId,
        reminderType: template.reminderType,
        title: template.name,
        description: template.description || `${template.name} for flock ${flock.flockNumber}`,
        dueDate,
        priority: template.priority,
        templateId: template.id,
      });
    }
  }

  if (remindersToCreate.length > 0) {
    await db.insert(reminders).values(remindersToCreate);
  }

  return remindersToCreate.length;
}

/**
 * Generate reminders from templates, filtering out ones that already exist
 */
export async function generateRemindersFromTemplatesWithFilter(
  flockId: number, 
  templateIds: number[], 
  existingKeys: Set<string>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (templateIds.length === 0) return 0;

  const flock = await getFlockById(flockId);
  if (!flock) throw new Error("Flock not found");

  const templates = await db.select().from(reminderTemplates).where(inArray(reminderTemplates.id, templateIds));
  const placementDate = new Date(flock.placementDate);
  const remindersToCreate: Array<typeof reminders.$inferInsert> = [];

  for (const template of templates) {
    if (template.isBundle && template.bundleConfig) {
      const bundleConfig = template.bundleConfig as any[];
      for (const category of bundleConfig) {
        if (category.enabled && category.reminders) {
          const categoryReminderType = category.category as string;
          
          for (const reminderDef of category.reminders) {
            const reminderTitle = reminderDef.name || reminderDef.title;
            const reminderType = reminderDef.reminderType || categoryReminderType;
            
            let actualDayOffset = reminderDef.dayOffset;
            if (reminderType === "feed_transition") {
              if (reminderTitle.includes("Starter") && reminderTitle.includes("Grower")) {
                actualDayOffset = flock.starterToDay || reminderDef.dayOffset;
              } else if (reminderTitle.includes("Grower") && reminderTitle.includes("Finisher")) {
                actualDayOffset = flock.growerToDay || reminderDef.dayOffset;
              }
            }
            
            const dueDate = new Date(placementDate);
            dueDate.setDate(dueDate.getDate() + actualDayOffset);
            
            // Check if this reminder already exists (skip if it does)
            const reminderKey = `${reminderTitle}|${dueDate.toISOString().split('T')[0]}`;
            if (existingKeys.has(reminderKey)) {
              continue; // Skip existing reminders
            }
            
            remindersToCreate.push({
              flockId,
              houseId: flock.houseId,
              reminderType: reminderType,
              title: reminderTitle,
              description: reminderDef.description || `${reminderTitle} for flock ${flock.flockNumber}`,
              dueDate,
              priority: reminderDef.priority,
              templateId: template.id,
            });
          }
        }
      }
    } else {
      const dueDate = new Date(placementDate);
      dueDate.setDate(dueDate.getDate() + template.dayOffset);
      
      // Check if this reminder already exists (skip if it does)
      const reminderKey = `${template.name}|${dueDate.toISOString().split('T')[0]}`;
      if (existingKeys.has(reminderKey)) {
        continue; // Skip existing reminders
      }

      remindersToCreate.push({
        flockId,
        houseId: flock.houseId,
        reminderType: template.reminderType,
        title: template.name,
        description: template.description || `${template.name} for flock ${flock.flockNumber}`,
        dueDate,
        priority: template.priority,
        templateId: template.id,
      });
    }
  }

  if (remindersToCreate.length > 0) {
    await db.insert(reminders).values(remindersToCreate);
  }

  return remindersToCreate.length;
}

// ============================================================================
// HEALTH MANAGEMENT HELPERS
// ============================================================================

export async function listVaccines() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(vaccines);
}

export async function listStressPacks() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(stressPacks);
}

export async function getVaccineById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(vaccines).where(eq(vaccines.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getStressPackById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(stressPacks).where(eq(stressPacks.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createVaccine(data: typeof vaccines.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(vaccines).values(data);
  return { id: Number((result as any).insertId) };
}

export async function updateVaccine(data: { id: number } & Partial<typeof vaccines.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { id, ...updates } = data;
  await db.update(vaccines).set(updates).where(eq(vaccines.id, id));
  return { success: true };
}

export async function deleteVaccine(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(vaccines).where(eq(vaccines.id, id));
  return { success: true };
}

export async function createStressPack(data: typeof stressPacks.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(stressPacks).values(data);
  return { id: Number((result as any).insertId) };
}

export async function updateStressPack(data: { id: number } & Partial<typeof stressPacks.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { id, ...updates } = data;
  await db.update(stressPacks).set(updates).where(eq(stressPacks.id, id));
  return { success: true };
}

export async function deleteStressPack(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(stressPacks).where(eq(stressPacks.id, id));
  return { success: true };
}

export async function listReminderTemplates() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(reminderTemplates).where(eq(reminderTemplates.isActive, true));
}

export async function createReminderTemplate(data: typeof reminderTemplates.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(reminderTemplates).values(data);
  // MySQL returns insertId in the result array
  const insertId = (result as any)[0]?.insertId ?? (result as any).insertId;
  return { id: Number(insertId) };
}

export async function updateReminderTemplate(data: { id: number } & Partial<typeof reminderTemplates.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { id, ...updates } = data;
  await db.update(reminderTemplates).set(updates).where(eq(reminderTemplates.id, id));
  return { success: true };
}

export async function deleteReminderTemplate(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(reminderTemplates).where(eq(reminderTemplates.id, id));
  return { success: true };
}

/**
 * Create a bundle template from multiple existing templates
 * The bundle will contain references to the selected templates and generate all their reminders when applied
 */
export async function createBundleTemplate(name: string, description: string | undefined, templateIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get the selected templates to build the bundle config
  const selectedTemplates = await db.select().from(reminderTemplates)
    .where(inArray(reminderTemplates.id, templateIds));

  if (selectedTemplates.length === 0) {
    throw new Error("No valid templates found");
  }

  // Group templates by reminderType to create categories
  const categoriesMap = new Map<string, any[]>();
  for (const template of selectedTemplates) {
    const category = template.reminderType;
    if (!categoriesMap.has(category)) {
      categoriesMap.set(category, []);
    }
    categoriesMap.get(category)!.push({
      name: template.name,
      dayOffset: template.dayOffset,
      priority: template.priority,
      description: template.description,
      sourceTemplateId: template.id,
    });
  }

  // Build bundle config from categories
  const bundleConfig = Array.from(categoriesMap.entries()).map(([category, reminders]) => ({
    category,
    enabled: true,
    reminders,
  }));

  // Create the bundle template
  const result = await db.insert(reminderTemplates).values({
    name,
    description,
    reminderType: "routine_task", // Default type for bundles
    priority: "medium",
    dayOffset: 0,
    isBundle: true,
    bundleConfig,
    isActive: true,
  });

  // MySQL returns insertId in the result array
  const insertId = (result as any)[0]?.insertId ?? (result as any).insertId;
  return { id: Number(insertId), templateCount: selectedTemplates.length };
}

/**
 * Update an existing bundle template
 */
export async function updateBundleTemplate(id: number, name: string, description: string | undefined, bundleConfig: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(reminderTemplates)
    .set({
      name,
      description,
      bundleConfig,
    })
    .where(eq(reminderTemplates.id, id));

  return { success: true };
}

/**
 * Copy a template and customize its bundle configuration
 */
export async function copyAndCustomizeTemplate(sourceTemplateId: number, newName: string, customBundleConfig: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get source template
  const [sourceTemplate] = await db.select().from(reminderTemplates).where(eq(reminderTemplates.id, sourceTemplateId));
  if (!sourceTemplate) throw new Error("Source template not found");

  // Create new template with customized configuration
  const [result] = await db.insert(reminderTemplates).values({
    name: newName,
    description: sourceTemplate.description,
    reminderType: sourceTemplate.reminderType,
    priority: sourceTemplate.priority,
    dayOffset: sourceTemplate.dayOffset,
    isBundle: true,
    bundleConfig: customBundleConfig,
    isActive: true,
  });

  // Return the newly created template
  const [newTemplate] = await db.select().from(reminderTemplates).where(eq(reminderTemplates.name, newName)).orderBy(desc(reminderTemplates.id)).limit(1);
  return newTemplate;
}


export async function updateFeedTransitionReminderDates(
  flockId: number,
  starterToDay?: number,
  growerFromDay?: number,
  growerToDay?: number,
  finisherFromDay?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const flock = await getFlockById(flockId);
  if (!flock) throw new Error("Flock not found");

  const placementDate = new Date(flock.placementDate);

  // Update Starter → Grower transition reminder
  if (starterToDay !== undefined || growerFromDay !== undefined) {
    const transitionDay = starterToDay !== undefined ? starterToDay : growerFromDay;
    if (transitionDay !== undefined) {
      const newDueDate = new Date(placementDate);
      newDueDate.setDate(newDueDate.getDate() + transitionDay);

      await db
        .update(reminders)
        .set({ dueDate: newDueDate })
        .where(
          and(
            eq(reminders.flockId, flockId),
            eq(reminders.reminderType, "feed_transition"),
            like(reminders.title, "%Starter%Grower%")
          )
        );
    }
  }

  // Update Grower → Finisher transition reminder
  if (growerToDay !== undefined || finisherFromDay !== undefined) {
    const transitionDay = growerToDay !== undefined ? growerToDay : finisherFromDay;
    if (transitionDay !== undefined) {
      const newDueDate = new Date(placementDate);
      newDueDate.setDate(newDueDate.getDate() + transitionDay);

      await db
        .update(reminders)
        .set({ dueDate: newDueDate })
        .where(
          and(
            eq(reminders.flockId, flockId),
            eq(reminders.reminderType, "feed_transition"),
            like(reminders.title, "%Grower%Finisher%")
          )
        );
    }
  }

  return true;
}


/**
 * Automatically activate flocks whose placement date has arrived
 * Called periodically (e.g., daily cron job or on-demand)
 */
export async function autoActivateFlocks() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const now = new Date();
  
  // Find flocks that should be activated (planned status + placement date <= today)
  const flocksToActivate = await db
    .select()
    .from(flocks)
    .where(
      and(
        eq(flocks.status, "planned"),
        lte(flocks.placementDate, now)
      )
    );

  for (const flock of flocksToActivate) {
    await db
      .update(flocks)
      .set({
        status: "active",
        statusChangedAt: now,
        isManualStatusChange: 0, // automatic
        statusChangeReason: "Automatic activation on placement date",
      })
      .where(eq(flocks.id, flock.id));
  }

  return flocksToActivate.length;
}

/**
 * Manually change flock status with audit trail
 */
export async function manuallyChangeFlockStatus(
  flockId: number,
  newStatus: "planned" | "active" | "completed" | "cancelled",
  userId: number,
  reason: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(flocks)
    .set({
      status: newStatus,
      statusChangedAt: new Date(),
      statusChangedBy: userId,
      statusChangeReason: reason,
      isManualStatusChange: 1, // manual
    })
    .where(eq(flocks.id, flockId));

  return true;
}

/**
 * Get status change history for a flock
 */
export async function getFlockStatusHistory(flockId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const flock = await getFlockById(flockId);
  if (!flock) return [];

  // For now, return the current status change info
  // In future, could create a separate status_history table for full history
  return [
    {
      status: flock.status,
      changedAt: flock.statusChangedAt,
      changedBy: flock.statusChangedBy,
      reason: flock.statusChangeReason,
      isManual: flock.isManualStatusChange === 1,
    },
  ];
}


// ============================================================================
// HEALTH PROTOCOL TEMPLATES
// ============================================================================

/**
 * Create a new health protocol template
 */
export async function createHealthProtocolTemplate(data: typeof healthProtocolTemplates.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(healthProtocolTemplates).values(data);
  return result;
}

/**
 * Get all health protocol templates
 */
export async function getHealthProtocolTemplates() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db
    .select()
    .from(healthProtocolTemplates)
    .where(eq(healthProtocolTemplates.isActive, true))
    .orderBy(desc(healthProtocolTemplates.createdAt));
}

/**
 * Get a health protocol template by ID
 */
export async function getHealthProtocolTemplateById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const results = await db
    .select()
    .from(healthProtocolTemplates)
    .where(eq(healthProtocolTemplates.id, id));
  
  return results[0] || null;
}

/**
 * Update a health protocol template
 */
export async function updateHealthProtocolTemplate(
  id: number,
  data: Partial<typeof healthProtocolTemplates.$inferInsert>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .update(healthProtocolTemplates)
    .set(data)
    .where(eq(healthProtocolTemplates.id, id));
  
  return true;
}

/**
 * Delete a health protocol template (soft delete)
 */
export async function deleteHealthProtocolTemplate(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .update(healthProtocolTemplates)
    .set({ isActive: false })
    .where(eq(healthProtocolTemplates.id, id));
  
  return true;
}


/**
 * Sync flock reminders from a template - preserves completed/dismissed reminders,
 * removes pending reminders, and regenerates only NEW reminders from the updated template
 */
export async function syncFlockRemindersFromTemplate(flockId: number, templateId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get only completed/dismissed reminders for this flock/template (to avoid duplicates)
  // We only want to preserve these - pending reminders will be regenerated
  const existingReminders = await db.select({ title: reminders.title, dueDate: reminders.dueDate, status: reminders.status })
    .from(reminders)
    .where(and(
      eq(reminders.flockId, flockId),
      eq(reminders.templateId, templateId),
      or(
        eq(reminders.status, "completed"),
        eq(reminders.status, "dismissed")
      )
    ));
  
  // Create a set of existing reminder keys (title + dueDate as date-only) for quick lookup
  const existingKeys = new Set(
    existingReminders.map(r => {
      const dateStr = r.dueDate ? r.dueDate.toISOString().split('T')[0] : '';
      return `${r.title}|${dateStr}`;
    })
  );

  // Delete only pending reminders from this template (preserve completed/dismissed)
  await db.delete(reminders)
    .where(and(
      eq(reminders.flockId, flockId),
      eq(reminders.templateId, templateId),
      eq(reminders.status, "pending")
    ));

  // Generate new reminders but filter out ones that already exist (completed/dismissed)
  const newReminderCount = await generateRemindersFromTemplatesWithFilter(flockId, [templateId], existingKeys);
  
  return { newReminderCount };
}

/**
 * Get all flocks that use a specific template
 */
export async function getFlocksUsingTemplate(templateId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Find flocks that have reminders with this templateId
  const results = await db
    .selectDistinct({ flockId: reminders.flockId })
    .from(reminders)
    .where(eq(reminders.templateId, templateId));

  const flockIds = results.map(r => r.flockId).filter((id): id is number => id !== null);
  if (flockIds.length === 0) return [];

  // Get full flock details
  const flockList = await db
    .select()
    .from(flocks)
    .where(inArray(flocks.id, flockIds));

  return flockList;
}
