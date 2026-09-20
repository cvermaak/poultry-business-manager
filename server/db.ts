import { eq, and, gte, lte, desc, asc, sql, or, like, inArray, isNotNull, isNull } from "drizzle-orm";
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
  invoiceLineItems,
  payments,
  paymentAllocations,
  suppliers,
  itemTemplates,
  procurementSchedules,
  procurementOrders,
  procurementOrderItems,
  chartOfAccounts,
  generalLedgerEntries,
  journalEntries,
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
  harvestRecords,
  processors,
  catchSessions,
  companySettings,
  expenseCategories,
  expenses,
  cashFlowForecasts,
  cashFlowItems,
  millCosts,
  customerFeedPrices,
  feedOrders,
  feedOrderDeliveries,
  additivePurchaseOrders,
  additiveInventoryMappings,
	inventoryStock,
	millInvoices,
	preTransportProtocols,
	accountingSourcePostings,
	customerInvoicePayments,
	supplierInvoicePayments,
	bankReconciliations,
	bankStatementLines,
	bankReconciliationMatches,
	financialPeriods,
	financialControlReviews,
	financialPeriodActions,
} from "../drizzle/schema";
import "../drizzle/relations";
import { ENV } from "./_core/env";
import {
	calculateAgedPayablesReport,
	calculateAgedReceivablesReport,
  calculateBalanceSheetReport,
  calculateCashFlowStatement,
  calculateProfitAndLossReport,
  calculateTrialBalanceReport,
} from "./financial-reporting";
import { selectEffectiveDatedRecord } from "./feed-pricing";
import {
  calculatePurchaseOrderLineTotal,
  calculatePurchaseOrderTotal,
  canTransitionPurchaseOrder,
  type PurchaseOrderLineInput,
  type PurchaseOrderStatus,
} from "./purchase-orders";
import { calculatePreTransportSchedule } from "./pre-transport-protocol";
import { AFGRO_DEFAULT_CHART_OF_ACCOUNTS, type JournalLineInput, validateBalancedJournal } from "./accounting";
import { buildCustomerInvoicePosting, CUSTOMER_INVOICE_POSTING_ACCOUNTS, getCustomerInvoiceJournalNumber, resolveCustomerInvoiceRevenueAccountNumber } from "./invoice-posting";
import { buildCustomerPaymentPosting, CUSTOMER_PAYMENT_POSTING_ACCOUNTS, getCustomerPaymentJournalNumber, parseRandAmount, resolveCustomerPaymentOutcome } from "./payment-posting";
import { buildSupplierInvoicePosting, buildSupplierPaymentPosting, getSupplierInvoiceJournalNumber, getSupplierPaymentJournalNumber, SUPPLIER_PAYABLE_POSTING_ACCOUNTS, validateSupplierPaymentAgainstBalance } from "./supplier-payable-posting";
import { normalizeLegacyInvoiceAmounts, normalizeLegacyInvoiceRecord } from "./invoice-amount-integrity";
import {
  calculateReconciliationControls,
  createStatementLineKey,
  ledgerSignedAmount,
	validateBankStatementMatch,
	type BankStatementDirection,
} from "./bank-reconciliation";
import {
	assertIsoPeriod,
	buildReversalJournalNumber,
	buildReversalLines,
	calculateVatSummary,
	evaluatePeriodCloseReadiness,
	isDateInsidePeriod,
	type CloseReviewStatus,
	type CloseReviewType,
} from "./period-close";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL, {
        mode: "default",
        schema: {
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
          invoiceLineItems,
          payments,
          paymentAllocations,
          suppliers,
          itemTemplates,
          procurementSchedules,
          procurementOrders,
          procurementOrderItems,
          chartOfAccounts,
          generalLedgerEntries,
          journalEntries,
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
          harvestRecords,
          processors,
          catchSessions,
          companySettings,
          expenseCategories,
          expenses,
          cashFlowForecasts,
          cashFlowItems,
          millCosts,
          customerFeedPrices,
          feedOrders,
          feedOrderDeliveries,
          additivePurchaseOrders,
          additiveInventoryMappings,
		  inventoryStock,
		  millInvoices,
			  preTransportProtocols,
			  accountingSourcePostings,
			  customerInvoicePayments,
			  supplierInvoicePayments,
			  bankReconciliations,
			  bankStatementLines,
			  bankReconciliationMatches,
			  financialPeriods,
			  financialControlReviews,
			  financialPeriodActions,
			},
      });
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
  role: "admin" | "farm_manager" | "accountant" | "sales_staff" | "production_worker" | "chicken_house_operator";
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
    mustChangePassword: false,
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

export async function deleteUser(userId: number) {
  const db = await getDb();
  if (!db) return false;

  await db.delete(users).where(eq(users.id, userId));
  return true;
}

export async function updateUser(userId: number, data: {
  name?: string;
  email?: string;
  username?: string;
  role?: "admin" | "farm_manager" | "accountant" | "sales_staff" | "production_worker" | "chicken_house_operator";
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

// ── Catch Plan ──────────────────────────────────────────────────────────────

export interface CatchPlanDay {
  day: number;           // 1-based catch day number
  targetBirds: number;  // birds to catch on this day
  targetCatchingWeight: number; // kg per bird on this day
  targetDeliveredWeight: number; // kg per bird delivered (after shrinkage)
  percentOfFlock: number; // % of total flock
  // Populated after the session is completed (rolling reforecast)
  actualBirds?: number;
  actualAvgCatchingWeight?: number;
  actualAvgDeliveredWeight?: number;
  completedAt?: string;
}

export interface CatchPlan {
  totalCatchDays: number;
  dailyGainKg: number;    // kg/day live weight gain
  shrinkagePct: number;   // e.g. 5.5
  overallTargetCatchingWeight: number;
  overallTargetDeliveredWeight: number;
  processorMaxCatchingWeight: number | null; // optional upper limit warning
  days: CatchPlanDay[];
  createdAt: string;
  lastUpdatedAt: string;
}

export async function saveCatchPlan(flockId: number, plan: CatchPlan) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(flocks)
    .set({ catchPlan: plan as any })
    .where(eq(flocks.id, flockId));
  return plan;
}

export async function getCatchPlanForFlock(flockId: number): Promise<CatchPlan | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select({ catchPlan: flocks.catchPlan }).from(flocks).where(eq(flocks.id, flockId)).limit(1);
  if (!result.length || !result[0].catchPlan) return null;
  return result[0].catchPlan as unknown as CatchPlan;
}

/**
 * Rolling reforecast: after a catch session completes, record actual results
 * and recalculate remaining days' targets so the house average stays on track.
 */
export async function reforecastCatchPlan(
  flockId: number,
  dayIndex: number,       // 0-based index of the completed day
  actualBirds: number,
  actualAvgCatchingWeight: number,
  completedAt: string
): Promise<CatchPlan | null> {
  const plan = await getCatchPlanForFlock(flockId);
  if (!plan) return null;

  // Record actual results for the completed day
  plan.days[dayIndex] = {
    ...plan.days[dayIndex],
    actualBirds,
    actualAvgCatchingWeight,
    actualAvgDeliveredWeight: actualAvgCatchingWeight * (1 - plan.shrinkagePct / 100),
    completedAt,
  };

  // Recalculate remaining days' targets
  const completedDays = plan.days.filter(d => d.actualBirds !== undefined);
  const remainingDays = plan.days.filter(d => d.actualBirds === undefined);

  if (remainingDays.length > 0) {
    // Calculate how much weight budget has been used by completed days
    const usedWeightBudget = completedDays.reduce(
      (sum, d) => sum + (d.actualBirds! * d.actualAvgCatchingWeight!), 0
    );
    const usedBirds = completedDays.reduce((sum, d) => sum + d.actualBirds!, 0);
    const totalBirds = plan.days.reduce((sum, d) => sum + d.targetBirds, 0);
    const totalWeightBudget = plan.overallTargetCatchingWeight * totalBirds;
    const remainingBudget = totalWeightBudget - usedWeightBudget;
    const remainingBirds = totalBirds - usedBirds;
    const remainingAvgTarget = remainingBirds > 0 ? remainingBudget / remainingBirds : plan.overallTargetCatchingWeight;

    // Distribute remaining budget across remaining days using daily gain stagger
    const midRemainingIdx = (remainingDays.length - 1) / 2;
    remainingDays.forEach((day, i) => {
      const offset = (i - midRemainingIdx) * plan.dailyGainKg;
      const newTarget = Math.round((remainingAvgTarget + offset) * 1000) / 1000;
      const dayIdx = plan.days.findIndex(d => d.day === day.day);
      plan.days[dayIdx] = {
        ...plan.days[dayIdx],
        targetCatchingWeight: newTarget,
        targetDeliveredWeight: Math.round(newTarget * (1 - plan.shrinkagePct / 100) * 1000) / 1000,
      };
    });
  }

  plan.lastUpdatedAt = new Date().toISOString();
  await saveCatchPlan(flockId, plan);
  return plan;
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
  await db.delete(catchSessions).where(eq(catchSessions.flockId, id));
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

export async function listFeedFormulations(filters?: {
  feedRange?: 'premium' | 'value' | 'econo';
  feedStage?: 'starter' | 'grower' | 'finisher';
  isActive?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions: ReturnType<typeof eq>[] = [];
  if (filters?.feedRange) conditions.push(eq(feedFormulations.feedRange, filters.feedRange));
  if (filters?.feedStage) conditions.push(eq(feedFormulations.feedStage, filters.feedStage));
  if (filters?.isActive !== undefined) conditions.push(eq(feedFormulations.isActive, filters.isActive));
  const query = db.select().from(feedFormulations).orderBy(desc(feedFormulations.createdAt));
  if (conditions.length > 0) {
    return await query.where(and(...conditions));
  }
  return await query;
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

export async function getNextCustomerNumber(): Promise<string> {
  const db = await getDb();
  if (!db) return "CUST-001";
  const result = await db
    .select({ customerNumber: customers.customerNumber })
    .from(customers)
    .orderBy(desc(customers.id))
    .limit(1);
  if (result.length === 0) return "CUST-001";
  const last = result[0].customerNumber;
  const match = last.match(/(\d+)$/);
  const next = match ? parseInt(match[1], 10) + 1 : 1;
  return `CUST-${String(next).padStart(3, "0")}`;
}

export async function updateCustomer(
  id: number,
  data: {
    name?: string;
    companyName?: string | null;
    contactPerson?: string | null;
    email?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
    segment?: "wholesale" | "retail" | "contract";
    creditLimit?: number;
    paymentTerms?: string;
    taxNumber?: string | null;
    vatNumber?: string | null;
    notes?: string | null;
    isActive?: boolean;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(customers).set({ ...data, updatedAt: new Date().toISOString() }).where(eq(customers.id, id));
  const updated = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  return updated[0];
}

export async function deleteCustomer(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(customers).set({ isActive: false, updatedAt: new Date().toISOString() }).where(eq(customers.id, id));
  const updated = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  return updated[0];
}

// ============================================================================
// SALES & INVOICING
// ============================================================================

export async function listInvoices(filters?: { customerId?: number; status?: string }) {
  const db = await getDb();
  if (!db) return [];

  let query = db
    .select({
      ...invoices,
      customerName: customers.name,
      orderNumber: salesOrders.orderNumber,
    })
    .from(invoices)
    .leftJoin(customers, eq(invoices.customerId, customers.id))
    .leftJoin(salesOrders, eq((invoices as any).orderId, salesOrders.id))
    .$dynamic();

  if (filters?.customerId) {
    query = query.where(eq(invoices.customerId, filters.customerId));
  }
  if (filters?.status) {
    query = query.where(eq(invoices.status, filters.status as any));
  }

  const rows = await query.orderBy(desc(invoices.invoiceDate));
  return rows.map((invoice) => normalizeLegacyInvoiceRecord(invoice));
}

export async function getInvoiceById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select({
      ...invoices,
      customerName: customers.name,
      orderNumber: salesOrders.orderNumber,
    })
    .from(invoices)
    .leftJoin(customers, eq(invoices.customerId, customers.id))
    .leftJoin(salesOrders, eq((invoices as any).orderId, salesOrders.id))
    .where(eq(invoices.id, id))
    .limit(1);
  return result.length > 0 ? normalizeLegacyInvoiceRecord(result[0]) : undefined;
}

export async function getInvoiceItems(invoiceId: number) {
  const db = await getDb();
  if (!db) return [];

  const legacyItems = await db
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, invoiceId));

  const lineItems = await db
    .select()
    .from(invoiceLineItems)
    .where(eq(invoiceLineItems.invoiceId, invoiceId));

  if (legacyItems.length > 0) {
    return legacyItems.map((item) => ({
      ...item,
      discountPercent: 0,
      discountAmount: 0,
    }));
  }

  if (lineItems.length > 0) {
    return lineItems.map((item) => {
      const pricePerUnit = parseFloat(item.pricePerUnit?.toString() || '0');
      const quantity = parseFloat(item.quantity?.toString() || '0');
      const discountPct = parseFloat(item.discount?.toString() || '0');
      const vatPct = parseFloat(item.vatPercentage?.toString() || '15');

      const subtotal = quantity * pricePerUnit;
      const discountAmount = subtotal * (discountPct / 100);

      const subtotalExcl = subtotal - discountAmount;
      const taxAmt = subtotalExcl * (vatPct / 100);
      const total = subtotalExcl + taxAmt;

      return {
        id: item.id,
        invoiceId: item.invoiceId,
        description: item.description,

        // ✅ IMPORTANT FIX
        quantity: quantity,

        unit: 'unit',
        unitPrice: Math.round(pricePerUnit * 100),
        subtotal: Math.round(subtotalExcl * 100),
        taxRate: vatPct,
        taxAmount: Math.round(taxAmt * 100),
        totalAmount: Math.round(total * 100),

        discountPercent: discountPct,
        discountAmount: Math.round(discountAmount * 100),

        createdAt: item.createdAt,
      };
    });
  }

  // ✅ MISSING IN YOUR FILE
  return [];
}

export async function createInvoiceLineItem(data: {
  invoiceId: number;
  description: string;
  quantity: number;
  pricePerUnit: number;
  discountPercent?: number;
  vatPercentage?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const discount = data.discountPercent ?? 0;
  const vatPct = data.vatPercentage ?? 15;
  const subtotal = data.quantity * data.pricePerUnit;
  const discountAmount = subtotal * (discount / 100);
  const amount = (subtotal - discountAmount) * (1 + vatPct / 100);

  await db.insert(invoiceLineItems).values({
    invoiceId: data.invoiceId,
    description: data.description,
    quantity: data.quantity.toString(),
    pricePerUnit: data.pricePerUnit.toString(),
    discount: discount.toString(),
    discountAmount: discountAmount.toFixed(2),
    vatPercentage: vatPct.toString(),
    amount: amount.toFixed(2),
  });
}

export async function insertInvoiceItems(items: {
  invoiceId: number;
  description: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  taxRate?: number;
}[]) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  if (!items || items.length === 0) return;

  await db.insert(invoiceLineItems).values(
    items.map((item) => {
      const quantity = Number(item.quantity || 0);
      const pricePerUnit = Number(item.unitPrice || 0);
      const vatPercentage = Number(item.taxRate ?? 15);
      const subtotal = quantity * pricePerUnit;
      const taxAmount = subtotal * (vatPercentage / 100);
      const totalAmount = subtotal + taxAmount;
      return {
        invoiceId: item.invoiceId,
        description: item.description,
        quantity: quantity.toString(),
        pricePerUnit: pricePerUnit.toString(),
        discount: '0',
        discountAmount: '0',
        vatPercentage: vatPercentage.toString(),
        amount: totalAmount.toFixed(2),
      };
    })
  );
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

export async function getNextSupplierNumber(): Promise<string> {
  const db = await getDb();
  if (!db) return "SUP-0001";
  const result = await db
    .select({ supplierNumber: suppliers.supplierNumber })
    .from(suppliers)
    .orderBy(desc(suppliers.id))
    .limit(1);
  if (result.length === 0) return "SUP-0001";
  const last = result[0].supplierNumber;
  const match = last.match(/(\d+)$/);
  const next = match ? parseInt(match[1], 10) + 1 : 1;
  return `SUP-${String(next).padStart(4, "0")}`;
}

export async function createSupplier(data: {
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  preferredContactMethod?: "email" | "whatsapp" | "phone" | "both";
  category?: string;
  paymentTerms?: string;
  taxNumber?: string;
  bankName?: string;
  bankAccountNumber?: string;
  notes?: string;
  address?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const supplierNumber = await getNextSupplierNumber();
  const result = await db.insert(suppliers).values({
    supplierNumber,
    name: data.name,
    contactPerson: data.contactPerson ?? null,
    email: data.email ?? null,
    phone: data.phone ?? null,
    whatsapp: data.whatsapp ?? null,
    preferredContactMethod: data.preferredContactMethod ?? "email",
    category: data.category ?? null,
    paymentTerms: data.paymentTerms ?? "cash",
    taxNumber: data.taxNumber ?? null,
    bankName: data.bankName ?? null,
    bankAccountNumber: data.bankAccountNumber ?? null,
    notes: data.notes ?? null,
    isActive: 1,
  });
  return { id: Number(result[0].insertId), supplierNumber };
}

export async function updateSupplier(id: number, data: {
  name?: string;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  preferredContactMethod?: "email" | "whatsapp" | "phone" | "both";
  category?: string | null;
  paymentTerms?: string | null;
  taxNumber?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  notes?: string | null;
  isActive?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(suppliers).set({
    ...(data.name !== undefined && { name: data.name }),
    ...(data.contactPerson !== undefined && { contactPerson: data.contactPerson }),
    ...(data.email !== undefined && { email: data.email }),
    ...(data.phone !== undefined && { phone: data.phone }),
    ...(data.whatsapp !== undefined && { whatsapp: data.whatsapp }),
    ...(data.preferredContactMethod !== undefined && { preferredContactMethod: data.preferredContactMethod }),
    ...(data.category !== undefined && { category: data.category }),
    ...(data.paymentTerms !== undefined && { paymentTerms: data.paymentTerms }),
    ...(data.taxNumber !== undefined && { taxNumber: data.taxNumber }),
    ...(data.bankName !== undefined && { bankName: data.bankName }),
    ...(data.bankAccountNumber !== undefined && { bankAccountNumber: data.bankAccountNumber }),
    ...(data.notes !== undefined && { notes: data.notes }),
    ...(data.isActive !== undefined && { isActive: data.isActive ? 1 : 0 }),
  }).where(eq(suppliers.id, id));
  return true;
}

export async function deleteSupplier(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Soft-delete: mark inactive
  await db.update(suppliers).set({ isActive: 0 }).where(eq(suppliers.id, id));
  return true;
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

export async function createChartOfAccount(data: {
  accountNumber: string;
  accountName: string;
  accountType: "asset" | "liability" | "equity" | "revenue" | "expense";
  accountSubtype?: string;
  normalBalance: "debit" | "credit";
  isPostingAccount?: boolean;
  description?: string;
  createdBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db.select({ id: chartOfAccounts.id })
    .from(chartOfAccounts)
    .where(eq(chartOfAccounts.accountNumber, data.accountNumber))
    .limit(1);
  if (existing[0]) throw new Error("An account with this number already exists.");

  const result = await db.insert(chartOfAccounts).values({
    ...data,
    isPostingAccount: data.isPostingAccount === false ? 0 : 1,
    isActive: 1,
  });
  return { id: Number((result as any)[0]?.insertId ?? (result as any).insertId ?? 0) };
}

export async function seedDefaultChartOfAccounts(createdBy: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db.select({ accountNumber: chartOfAccounts.accountNumber }).from(chartOfAccounts);
  const existingNumbers = new Set(existing.map((account) => account.accountNumber));
  const missingAccounts = AFGRO_DEFAULT_CHART_OF_ACCOUNTS
    .filter((account) => !existingNumbers.has(account.accountNumber))
    .map((account) => ({ ...account, isPostingAccount: 1, isActive: 1, createdBy }));

  if (missingAccounts.length > 0) await db.insert(chartOfAccounts).values(missingAccounts);
  return { created: missingAccounts.length, total: AFGRO_DEFAULT_CHART_OF_ACCOUNTS.length };
}

export async function postJournalEntry(input: {
  entryDate: Date;
  description: string;
  sourceType?: string;
  sourceId?: number;
  lines: JournalLineInput[];
  createdBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const validation = validateBalancedJournal(input.lines);
  if (!validation.ok) throw new Error(validation.error);

  const accountIds = Array.from(new Set(validation.lines.map((line) => line.accountId)));
  const accounts = await db.select({ id: chartOfAccounts.id, isActive: chartOfAccounts.isActive, isPostingAccount: chartOfAccounts.isPostingAccount })
    .from(chartOfAccounts)
    .where(inArray(chartOfAccounts.id, accountIds));
  if (accounts.length !== accountIds.length || accounts.some((account) => !account.isActive || !account.isPostingAccount)) {
    throw new Error("Every journal line must use an active posting account.");
  }

	const entryDate = input.entryDate.toISOString().slice(0, 19).replace("T", " ");
	await assertFinancialDateOpen(entryDate);
	const journalNumber = `JNL-${input.entryDate.toISOString().slice(0, 10).replace(/-/g, "")}-${Date.now()}`;
	return await (db as any).transaction(async (tx: any) => {
    const created = await tx.insert(journalEntries).values({
      journalNumber,
      entryDate,
      description: input.description.trim(),
      sourceType: input.sourceType?.trim() || "manual_journal",
      sourceId: input.sourceId,
      totalDebit: validation.totalDebit,
      totalCredit: validation.totalCredit,
      createdBy: input.createdBy,
    });
    const journalEntryId = Number(created[0]?.insertId ?? created.insertId ?? 0);
    if (!journalEntryId) throw new Error("Journal header could not be created.");

    await tx.insert(generalLedgerEntries).values(validation.lines.map((line) => ({
      entryNumber: journalNumber,
      entryDate,
      journalEntryId,
      accountId: line.accountId,
      debit: line.debit,
      credit: line.credit,
      description: line.description || input.description.trim(),
      referenceType: input.sourceType?.trim() || "manual_journal",
      referenceId: input.sourceId,
      createdBy: input.createdBy,
    })));
    return { id: journalEntryId, journalNumber, totalDebit: validation.totalDebit, totalCredit: validation.totalCredit };
	});
}

export async function getCustomerInvoicePosting(invoiceId: number) {
	const db = await getDb();
	if (!db) return null;

	const rows = await db.select({
		id: journalEntries.id,
		journalNumber: journalEntries.journalNumber,
		entryDate: journalEntries.entryDate,
		totalDebit: journalEntries.totalDebit,
		totalCredit: journalEntries.totalCredit,
		sourceType: accountingSourcePostings.sourceType,
	})
		.from(accountingSourcePostings)
		.innerJoin(journalEntries, eq(accountingSourcePostings.journalEntryId, journalEntries.id))
		.where(and(
			eq(accountingSourcePostings.sourceType, "customer_invoice"),
			eq(accountingSourcePostings.sourceId, invoiceId),
		))
			.limit(1);
		return rows[0] ?? null;
}

export async function getCustomerInvoicePaymentPostings(invoiceId: number) {
	const db = await getDb();
	if (!db) return [];

	return await db.select({
		paymentId: customerInvoicePayments.id,
		amount: customerInvoicePayments.amount,
		paymentMethod: customerInvoicePayments.paymentMethod,
		paymentDate: customerInvoicePayments.paymentDate,
		paymentReference: customerInvoicePayments.paymentReference,
		journalNumber: journalEntries.journalNumber,
		journalEntryId: journalEntries.id,
	})
		.from(customerInvoicePayments)
		.leftJoin(accountingSourcePostings, and(
			eq(accountingSourcePostings.sourceType, "customer_invoice_payment"),
			eq(accountingSourcePostings.sourceId, customerInvoicePayments.id),
		))
		.leftJoin(journalEntries, eq(accountingSourcePostings.journalEntryId, journalEntries.id))
		.where(eq(customerInvoicePayments.invoiceId, invoiceId))
		.orderBy(desc(customerInvoicePayments.paymentDate), desc(customerInvoicePayments.id));
}

export async function getMillInvoicePosting(millInvoiceId: number) {
	const db = await getDb();
	if (!db) return null;

	const rows = await db.select({
		id: journalEntries.id,
		journalNumber: journalEntries.journalNumber,
		entryDate: journalEntries.entryDate,
		totalDebit: journalEntries.totalDebit,
		totalCredit: journalEntries.totalCredit,
	})
		.from(accountingSourcePostings)
		.innerJoin(journalEntries, eq(accountingSourcePostings.journalEntryId, journalEntries.id))
		.where(and(
			eq(accountingSourcePostings.sourceType, "supplier_mill_invoice"),
			eq(accountingSourcePostings.sourceId, millInvoiceId),
		))
		.limit(1);
	return rows[0] ?? null;
}

export async function getMillInvoicePaymentPostings(millInvoiceId: number) {
	const db = await getDb();
	if (!db) return [];

	return await db.select({
		paymentId: supplierInvoicePayments.id,
		amount: supplierInvoicePayments.amount,
		paymentMethod: supplierInvoicePayments.paymentMethod,
		paymentDate: supplierInvoicePayments.paymentDate,
		paymentReference: supplierInvoicePayments.paymentReference,
		journalNumber: journalEntries.journalNumber,
		journalEntryId: journalEntries.id,
	})
		.from(supplierInvoicePayments)
		.leftJoin(accountingSourcePostings, and(
			eq(accountingSourcePostings.sourceType, "supplier_mill_invoice_payment"),
			eq(accountingSourcePostings.sourceId, supplierInvoicePayments.id),
		))
		.leftJoin(journalEntries, eq(accountingSourcePostings.journalEntryId, journalEntries.id))
		.where(eq(supplierInvoicePayments.millInvoiceId, millInvoiceId))
		.orderBy(desc(supplierInvoicePayments.paymentDate), desc(supplierInvoicePayments.id));
}

export async function markInvoiceAsSent(invoiceId: number, sentAt: string, createdBy: number) {
	const db = await getDb();
	if (!db) throw new Error("Database not available");

	const invoiceRows = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
	const invoice = invoiceRows[0];
	if (!invoice) throw new Error("Invoice not found");
	if (invoice.status === "cancelled") throw new Error("Cancelled invoices cannot be sent or posted.");
	await assertFinancialDateOpen(new Date(invoice.invoiceDate).toISOString().slice(0, 19).replace("T", " "));

	const revenueAccountNumber = resolveCustomerInvoiceRevenueAccountNumber(invoice.feedOrderId);
	const requiredAccountNumbers = [
		CUSTOMER_INVOICE_POSTING_ACCOUNTS.tradeReceivables,
		CUSTOMER_INVOICE_POSTING_ACCOUNTS.vatOutput,
		revenueAccountNumber,
	];
	const accounts = await db.select({
		id: chartOfAccounts.id,
		accountNumber: chartOfAccounts.accountNumber,
		isActive: chartOfAccounts.isActive,
		isPostingAccount: chartOfAccounts.isPostingAccount,
	})
		.from(chartOfAccounts)
		.where(inArray(chartOfAccounts.accountNumber, requiredAccountNumbers));

	const accountsByNumber = new Map(accounts.map((account) => [account.accountNumber, account]));
	for (const accountNumber of requiredAccountNumbers) {
		const account = accountsByNumber.get(accountNumber);
		if (!account || !account.isActive || !account.isPostingAccount) {
			throw new Error(`Required posting account ${accountNumber} is missing, inactive, or not postable. Seed or correct the chart of accounts before sending this invoice.`);
		}
	}

	const sourceDescription = `Customer invoice ${invoice.invoiceNumber}`;
	const journalLines = buildCustomerInvoicePosting({
		invoiceNumber: invoice.invoiceNumber,
		exclusiveTotal: invoice.exclusiveTotal ?? invoice.subtotal,
		vatAmount: invoice.vatAmount ?? invoice.taxAmount,
		inclusiveTotal: invoice.inclusiveTotal ?? invoice.totalAmount,
		feedOrderId: invoice.feedOrderId,
		accountIds: {
			tradeReceivables: accountsByNumber.get(CUSTOMER_INVOICE_POSTING_ACCOUNTS.tradeReceivables)!.id,
			vatOutput: accountsByNumber.get(CUSTOMER_INVOICE_POSTING_ACCOUNTS.vatOutput)!.id,
			revenue: accountsByNumber.get(revenueAccountNumber)!.id,
		},
	});
	const validation = validateBalancedJournal(journalLines);
	if (!validation.ok) throw new Error(validation.error);

	return await (db as any).transaction(async (tx: any) => {
		const existingLinks = await tx.select({ journalEntryId: accountingSourcePostings.journalEntryId, journalNumber: journalEntries.journalNumber })
			.from(accountingSourcePostings)
			.innerJoin(journalEntries, eq(accountingSourcePostings.journalEntryId, journalEntries.id))
			.where(and(
				eq(accountingSourcePostings.sourceType, "customer_invoice"),
				eq(accountingSourcePostings.sourceId, invoiceId),
			))
			.limit(1);
		if (existingLinks[0]) {
			return { id: existingLinks[0].journalEntryId, journalNumber: existingLinks[0].journalNumber, alreadyPosted: true };
		}

		const entryDate = new Date(invoice.invoiceDate).toISOString().slice(0, 19).replace("T", " ");
		const journalNumber = getCustomerInvoiceJournalNumber(invoice.id);
		const createdJournal = await tx.insert(journalEntries).values({
			journalNumber,
			entryDate,
			description: sourceDescription,
			sourceType: "customer_invoice",
			sourceId: invoiceId,
			totalDebit: validation.totalDebit,
			totalCredit: validation.totalCredit,
			createdBy,
		});
		const journalEntryId = Number(createdJournal[0]?.insertId ?? createdJournal.insertId ?? 0);
		if (!journalEntryId) throw new Error("Invoice journal header could not be created.");

		await tx.insert(generalLedgerEntries).values(validation.lines.map((line) => ({
			entryNumber: journalNumber,
			entryDate,
			journalEntryId,
			accountId: line.accountId,
			debit: line.debit,
			credit: line.credit,
			description: line.description || sourceDescription,
			referenceType: "customer_invoice",
			referenceId: invoiceId,
			createdBy,
		})));

		await tx.insert(accountingSourcePostings).values({
			sourceType: "customer_invoice",
			sourceId: invoiceId,
			journalEntryId,
			createdBy,
		});

		if (invoice.status === "draft") {
			await tx.update(invoices).set({
				status: "sent",
				sentAt,
				updatedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
			}).where(eq(invoices.id, invoiceId));
		}

		return { id: journalEntryId, journalNumber, alreadyPosted: false };
	});
}

export async function listJournalEntries(filters?: { startDate?: string; endDate?: string; includeJournalNumber?: string; limit?: number }) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [
    filters?.startDate ? gte(journalEntries.entryDate, filters.startDate) : undefined,
    filters?.endDate ? lte(journalEntries.entryDate, filters.endDate) : undefined,
  ].filter(Boolean) as any[];
  let query = db.select().from(journalEntries).$dynamic();
  const periodCondition = conditions.length ? and(...conditions) : undefined;
  const linkedJournalCondition = filters?.includeJournalNumber
    ? eq(journalEntries.journalNumber, filters.includeJournalNumber)
    : undefined;
  if (periodCondition && linkedJournalCondition) query = query.where(or(periodCondition, linkedJournalCondition));
  else if (periodCondition) query = query.where(periodCondition);
  else if (linkedJournalCondition) query = query.where(linkedJournalCondition);
  return await query.orderBy(desc(journalEntries.entryDate)).limit(filters?.limit ?? 100);
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
// FINANCIAL ACCOUNTING: BANK RECONCILIATION
// ============================================================================

type BankReconciliationCreateInput = {
  bankAccountId: number;
  statementStartDate: string;
  statementEndDate: string;
  openingStatementBalance: string;
  closingStatementBalance: string;
  notes?: string;
  createdBy: number;
};

type BankStatementLineCreateInput = {
  reconciliationId: number;
  transactionDate: string;
  valueDate?: string;
  description: string;
  reference?: string;
  direction: BankStatementDirection;
  amount: string;
  runningBalance?: string;
  createdBy: number;
};

function bankReconciliationDateTime(date: string, endOfDay = false) {
  return `${date} ${endOfDay ? "23:59:59" : "00:00:00"}`;
}

async function assertEditableBankReconciliation(tx: any, reconciliationId: number) {
  const rows = await tx.select().from(bankReconciliations).where(eq(bankReconciliations.id, reconciliationId)).limit(1);
  const reconciliation = rows[0];
  if (!reconciliation) throw new Error("Bank reconciliation not found.");
  if (reconciliation.status === "completed") throw new Error("A completed reconciliation is locked and cannot be changed.");
  return reconciliation;
}

export async function createBankReconciliation(input: BankReconciliationCreateInput) {
	const db = await getDb();
	if (!db) throw new Error("Database not available");
	if (input.statementStartDate > input.statementEndDate) {
		throw new Error("Statement start date must be on or before the statement end date.");
	}
	await assertFinancialRangeOpenWithDatabase(db, input.statementStartDate, input.statementEndDate);

	const accountRows = await db.select({
    id: chartOfAccounts.id,
    accountNumber: chartOfAccounts.accountNumber,
    isActive: chartOfAccounts.isActive,
    isPostingAccount: chartOfAccounts.isPostingAccount,
  }).from(chartOfAccounts).where(eq(chartOfAccounts.id, input.bankAccountId)).limit(1);
  const account = accountRows[0];
  if (!account || !account.isActive || !account.isPostingAccount || account.accountNumber !== "1000") {
    throw new Error("Bank Reconciliation currently requires the active posting account 1000 — Bank.");
  }

  const reconciliationNumber = `BR-${input.statementEndDate.replace(/-/g, "")}-${Date.now()}`;
  const existing = await db.select({ id: bankReconciliations.id }).from(bankReconciliations).where(and(
    eq(bankReconciliations.bankAccountId, input.bankAccountId),
    eq(bankReconciliations.statementStartDate, input.statementStartDate),
    eq(bankReconciliations.statementEndDate, input.statementEndDate),
  )).limit(1);
  if (existing[0]) throw new Error("A reconciliation already exists for this Bank account and statement period.");

  const result = await db.insert(bankReconciliations).values({
    reconciliationNumber,
    bankAccountId: input.bankAccountId,
    statementStartDate: input.statementStartDate,
    statementEndDate: input.statementEndDate,
    openingStatementBalance: input.openingStatementBalance,
    closingStatementBalance: input.closingStatementBalance,
    notes: input.notes?.trim() || null,
    createdBy: input.createdBy,
  });
  const id = Number((result as any)[0]?.insertId ?? (result as any).insertId ?? 0);
  if (!id) throw new Error("Bank reconciliation could not be created.");
  return { id, reconciliationNumber };
}

export async function listBankReconciliations() {
  const db = await getDb();
  if (!db) return [];
  return await db.select({
    id: bankReconciliations.id,
    reconciliationNumber: bankReconciliations.reconciliationNumber,
    bankAccountId: bankReconciliations.bankAccountId,
    bankAccountNumber: chartOfAccounts.accountNumber,
    bankAccountName: chartOfAccounts.accountName,
    statementStartDate: bankReconciliations.statementStartDate,
    statementEndDate: bankReconciliations.statementEndDate,
    openingStatementBalance: bankReconciliations.openingStatementBalance,
    closingStatementBalance: bankReconciliations.closingStatementBalance,
    status: bankReconciliations.status,
    completedAt: bankReconciliations.completedAt,
    createdAt: bankReconciliations.createdAt,
  }).from(bankReconciliations)
    .innerJoin(chartOfAccounts, eq(bankReconciliations.bankAccountId, chartOfAccounts.id))
    .orderBy(desc(bankReconciliations.statementEndDate), desc(bankReconciliations.id));
}

export async function getBankReconciliationWorkspace(reconciliationId: number) {
  const db = await getDb();
  if (!db) return null;

  const headerRows = await db.select({
    id: bankReconciliations.id,
    reconciliationNumber: bankReconciliations.reconciliationNumber,
    bankAccountId: bankReconciliations.bankAccountId,
    bankAccountNumber: chartOfAccounts.accountNumber,
    bankAccountName: chartOfAccounts.accountName,
    statementStartDate: bankReconciliations.statementStartDate,
    statementEndDate: bankReconciliations.statementEndDate,
    openingStatementBalance: bankReconciliations.openingStatementBalance,
    closingStatementBalance: bankReconciliations.closingStatementBalance,
    status: bankReconciliations.status,
    notes: bankReconciliations.notes,
    completedAt: bankReconciliations.completedAt,
  }).from(bankReconciliations)
    .innerJoin(chartOfAccounts, eq(bankReconciliations.bankAccountId, chartOfAccounts.id))
    .where(eq(bankReconciliations.id, reconciliationId)).limit(1);
  const reconciliation = headerRows[0];
  if (!reconciliation) return null;

  const [statementLines, matches, ledgerEntries] = await Promise.all([
    db.select().from(bankStatementLines).where(eq(bankStatementLines.reconciliationId, reconciliationId)).orderBy(asc(bankStatementLines.transactionDate), asc(bankStatementLines.id)),
    db.select().from(bankReconciliationMatches).where(eq(bankReconciliationMatches.reconciliationId, reconciliationId)),
    db.select().from(generalLedgerEntries).where(and(
      eq(generalLedgerEntries.accountId, reconciliation.bankAccountId),
      gte(generalLedgerEntries.entryDate, bankReconciliationDateTime(reconciliation.statementStartDate)),
      lte(generalLedgerEntries.entryDate, bankReconciliationDateTime(reconciliation.statementEndDate, true)),
    )).orderBy(asc(generalLedgerEntries.entryDate), asc(generalLedgerEntries.id)),
  ]);

  const matchByLedgerEntry = new Map(matches.map((match) => [match.ledgerEntryId, match]));
  const matchByStatementLine = new Map<number, typeof matches>();
  for (const match of matches) {
    const existing = matchByStatementLine.get(match.statementLineId) ?? [];
    existing.push(match);
    matchByStatementLine.set(match.statementLineId, existing);
  }
  const controls = calculateReconciliationControls({
    openingStatementBalance: String(reconciliation.openingStatementBalance),
    closingStatementBalance: String(reconciliation.closingStatementBalance),
    statementLines: statementLines.map((line) => ({ id: line.id, direction: line.direction, amount: String(line.amount), status: line.status })),
    ledgerEntries: ledgerEntries.map((entry) => ({ id: entry.id, debit: String(entry.debit), credit: String(entry.credit), isReconciled: entry.isReconciled })),
  });

  return {
    reconciliation,
    statementLines: statementLines.map((line) => ({ ...line, matches: matchByStatementLine.get(line.id) ?? [] })),
    ledgerEntries: ledgerEntries.map((entry) => ({ ...entry, currentMatch: matchByLedgerEntry.get(entry.id) ?? null })),
    controls,
  };
}

export async function addBankStatementLine(input: BankStatementLineCreateInput) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const lineKey = createStatementLineKey(input);

	return await (db as any).transaction(async (tx: any) => {
		const reconciliation = await assertEditableBankReconciliation(tx, input.reconciliationId);
		await assertFinancialRangeOpenWithDatabase(tx, reconciliation.statementStartDate, reconciliation.statementEndDate);
		const duplicate = await tx.select({ id: bankStatementLines.id }).from(bankStatementLines).where(and(
      eq(bankStatementLines.reconciliationId, input.reconciliationId),
      eq(bankStatementLines.lineKey, lineKey),
    )).limit(1);
    if (duplicate[0]) throw new Error("This statement line is already captured in the selected reconciliation.");

    const result = await tx.insert(bankStatementLines).values({
      reconciliationId: input.reconciliationId,
      lineKey,
      transactionDate: input.transactionDate,
      valueDate: input.valueDate || null,
      description: input.description.trim(),
      reference: input.reference?.trim() || null,
      direction: input.direction,
      amount: input.amount,
      runningBalance: input.runningBalance || null,
      createdBy: input.createdBy,
    });
    await tx.update(bankReconciliations).set({ status: "in_progress" }).where(eq(bankReconciliations.id, input.reconciliationId));
    return { id: Number(result[0]?.insertId ?? result.insertId ?? 0), lineKey };
  });
}

export async function deleteUnmatchedBankStatementLine(reconciliationId: number, statementLineId: number) {
  const db = await getDb();
	if (!db) throw new Error("Database not available");
	return await (db as any).transaction(async (tx: any) => {
		const reconciliation = await assertEditableBankReconciliation(tx, reconciliationId);
		await assertFinancialRangeOpenWithDatabase(tx, reconciliation.statementStartDate, reconciliation.statementEndDate);
		const rows = await tx.select().from(bankStatementLines).where(and(
      eq(bankStatementLines.id, statementLineId),
      eq(bankStatementLines.reconciliationId, reconciliationId),
    )).limit(1);
    const line = rows[0];
    if (!line) throw new Error("Bank statement line not found.");
    if (line.status === "matched") throw new Error("Unmatch this statement line before deleting it.");
    await tx.delete(bankStatementLines).where(eq(bankStatementLines.id, statementLineId));
    return { success: true };
  });
}

export async function matchBankStatementLine(input: { reconciliationId: number; statementLineId: number; ledgerEntryIds: number[]; matchedBy: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const distinctLedgerEntryIds = Array.from(new Set(input.ledgerEntryIds));
  if (distinctLedgerEntryIds.length === 0) throw new Error("Select at least one Bank GL entry to match.");

	return await (db as any).transaction(async (tx: any) => {
		const reconciliation = await assertEditableBankReconciliation(tx, input.reconciliationId);
		await assertFinancialRangeOpenWithDatabase(tx, reconciliation.statementStartDate, reconciliation.statementEndDate);
		const statementRows = await tx.select().from(bankStatementLines).where(and(
      eq(bankStatementLines.id, input.statementLineId),
      eq(bankStatementLines.reconciliationId, input.reconciliationId),
    )).limit(1);
    const statementLine = statementRows[0];
    if (!statementLine) throw new Error("Bank statement line not found.");
    if (statementLine.status === "matched") throw new Error("This bank statement line is already matched.");

    const ledgerEntries = await tx.select().from(generalLedgerEntries).where(and(
      eq(generalLedgerEntries.accountId, reconciliation.bankAccountId),
      inArray(generalLedgerEntries.id, distinctLedgerEntryIds),
    ));
    if (ledgerEntries.length !== distinctLedgerEntryIds.length) throw new Error("Every selected entry must be an eligible Bank GL entry.");
    if (ledgerEntries.some((entry: any) => entry.isReconciled)) throw new Error("One or more selected Bank GL entries have already been reconciled.");

    const validation = validateBankStatementMatch(statementLine, ledgerEntries);
    if (!validation.ok) throw new Error(validation.error);

    const existingMatches = await tx.select({ ledgerEntryId: bankReconciliationMatches.ledgerEntryId })
      .from(bankReconciliationMatches).where(inArray(bankReconciliationMatches.ledgerEntryId, distinctLedgerEntryIds));
    if (existingMatches.length > 0) throw new Error("One or more selected Bank GL entries are already linked to a reconciliation.");

    await tx.insert(bankReconciliationMatches).values(ledgerEntries.map((entry: any) => ({
      reconciliationId: input.reconciliationId,
      statementLineId: input.statementLineId,
      ledgerEntryId: entry.id,
      matchedAmount: (() => {
        const cents = ledgerSignedAmount(entry);
        return `${Math.trunc(Math.abs(cents) / 100)}.${(Math.abs(cents) % 100).toString().padStart(2, "0")}`;
      })(),
      matchedBy: input.matchedBy,
    })));
    await tx.update(bankStatementLines).set({ status: "matched" }).where(eq(bankStatementLines.id, input.statementLineId));
    await tx.update(generalLedgerEntries).set({ isReconciled: 1 }).where(inArray(generalLedgerEntries.id, distinctLedgerEntryIds));
    await tx.update(bankReconciliations).set({ status: "in_progress" }).where(eq(bankReconciliations.id, input.reconciliationId));
    return { success: true, matchedAmount: validation.matchedAmount };
  });
}

export async function unmatchBankStatementLine(reconciliationId: number, statementLineId: number) {
  const db = await getDb();
	if (!db) throw new Error("Database not available");
	return await (db as any).transaction(async (tx: any) => {
		const reconciliation = await assertEditableBankReconciliation(tx, reconciliationId);
		await assertFinancialRangeOpenWithDatabase(tx, reconciliation.statementStartDate, reconciliation.statementEndDate);
		const matches = await tx.select().from(bankReconciliationMatches).where(and(
      eq(bankReconciliationMatches.reconciliationId, reconciliationId),
      eq(bankReconciliationMatches.statementLineId, statementLineId),
    ));
    if (matches.length === 0) throw new Error("This statement line does not have a reconciliation match.");
    const ledgerEntryIds = matches.map((match: any) => match.ledgerEntryId);
    await tx.delete(bankReconciliationMatches).where(and(
      eq(bankReconciliationMatches.reconciliationId, reconciliationId),
      eq(bankReconciliationMatches.statementLineId, statementLineId),
    ));
    await tx.update(bankStatementLines).set({ status: "unmatched" }).where(eq(bankStatementLines.id, statementLineId));
    await tx.update(generalLedgerEntries).set({ isReconciled: 0 }).where(inArray(generalLedgerEntries.id, ledgerEntryIds));
    return { success: true };
  });
}

export async function completeBankReconciliation(reconciliationId: number, completedBy: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await (db as any).transaction(async (tx: any) => {
    const reconciliation = await assertEditableBankReconciliation(tx, reconciliationId);
    const [statementLines, ledgerEntries] = await Promise.all([
      tx.select().from(bankStatementLines).where(eq(bankStatementLines.reconciliationId, reconciliationId)),
      tx.select().from(generalLedgerEntries).where(and(
        eq(generalLedgerEntries.accountId, reconciliation.bankAccountId),
        gte(generalLedgerEntries.entryDate, bankReconciliationDateTime(reconciliation.statementStartDate)),
        lte(generalLedgerEntries.entryDate, bankReconciliationDateTime(reconciliation.statementEndDate, true)),
      )),
    ]);
    const controls = calculateReconciliationControls({
      openingStatementBalance: String(reconciliation.openingStatementBalance),
      closingStatementBalance: String(reconciliation.closingStatementBalance),
      statementLines: statementLines.map((line: any) => ({ id: line.id, direction: line.direction, amount: String(line.amount), status: line.status })),
      ledgerEntries: ledgerEntries.map((entry: any) => ({ id: entry.id, debit: String(entry.debit), credit: String(entry.credit), isReconciled: entry.isReconciled })),
    });
    if (!controls.canComplete) {
      throw new Error(`Reconciliation cannot be completed: statement difference ${controls.statementBalanceDifference}; ${controls.unmatchedStatementLineIds.length} unmatched statement line(s); ${controls.unmatchedLedgerEntryIds.length} unmatched Bank GL line(s).`);
    }

    await tx.update(bankReconciliations).set({
      status: "completed",
      completedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
      completedBy,
    }).where(eq(bankReconciliations.id, reconciliationId));
    return { success: true, controls };
	});
}

// ============================================================================
// FINANCIAL ACCOUNTING: PERIOD CLOSE AND FINANCIAL CONTROLS
// ============================================================================

export function mysqlTimestamp(date = new Date()) {
	return date.toISOString().slice(0, 19).replace("T", " ");
}

export function currencyDecimal(value: number) {
	if (!Number.isFinite(value)) {
		throw new Error("Sales Order monetary values must be finite.");
	}
	const floatingPointAllowance = Number.EPSILON * Math.max(1, Math.abs(value));
	return (Math.round((value + floatingPointAllowance) * 100) / 100).toFixed(2);
}

export function resolveInvoiceVatRate(value: unknown, fallback = 15) {
	if (value === null || value === undefined || value === "") return fallback;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

export function getUniformInvoiceVatPercentage(items: Array<{ taxRate?: unknown }>) {
	if (items.length === 0) return "15.00";
	const rates = new Set(items.map((item) => resolveInvoiceVatRate(item.taxRate).toFixed(2)));
	return rates.size === 1 ? [...rates][0] : null;
}

function financialTimestamp() {
	return mysqlTimestamp();
}

function financialBusinessDate(value: Date | string) {
	if (value instanceof Date) return value.toISOString().slice(0, 10);
	return value.slice(0, 10);
}

async function findClosedFinancialPeriod(database: any, date: Date | string) {
	const businessDate = financialBusinessDate(date);
	const rows = await database.select({
		id: financialPeriods.id,
		periodName: financialPeriods.periodName,
		startDate: financialPeriods.startDate,
		endDate: financialPeriods.endDate,
	}).from(financialPeriods).where(and(
		eq(financialPeriods.status, "closed"),
		lte(financialPeriods.startDate, businessDate),
		gte(financialPeriods.endDate, businessDate),
	)).limit(1);
	return rows[0] ?? null;
}

export async function assertFinancialDateOpen(date: Date | string) {
	const db = await getDb();
	if (!db) throw new Error("Database not available");
	const closedPeriod = await findClosedFinancialPeriod(db, date);
	if (closedPeriod) {
		throw new Error(`Financial period ${closedPeriod.periodName} (${closedPeriod.startDate} to ${closedPeriod.endDate}) is closed. Reopen the period with an audit reason before posting.`);
	}
}

async function assertFinancialRangeOpenWithDatabase(database: any, startDate: string, endDate: string) {
	const rows = await database.select({
		periodName: financialPeriods.periodName,
		startDate: financialPeriods.startDate,
		endDate: financialPeriods.endDate,
	}).from(financialPeriods).where(and(
		eq(financialPeriods.status, "closed"),
		lte(financialPeriods.startDate, endDate.slice(0, 10)),
		gte(financialPeriods.endDate, startDate.slice(0, 10)),
	)).limit(1);
	if (rows[0]) throw new Error(`Financial period ${rows[0].periodName} (${rows[0].startDate} to ${rows[0].endDate}) is closed. Reopen it with an audit reason before changing Bank Reconciliation evidence.`);
}

async function getFinancialPeriodById(database: any, periodId: number) {
	const rows = await database.select().from(financialPeriods).where(eq(financialPeriods.id, periodId)).limit(1);
	if (!rows[0]) throw new Error("Financial period not found.");
	return rows[0];
}

async function getPeriodCloseWorkspaceWithDatabase(database: any, periodId: number) {
	const period = await getFinancialPeriodById(database, periodId);
	const [reviews, actions, bankRows, vatRows, trialBalance] = await Promise.all([
		database.select().from(financialControlReviews).where(eq(financialControlReviews.periodId, periodId)).orderBy(asc(financialControlReviews.reviewType)),
		database.select().from(financialPeriodActions).where(eq(financialPeriodActions.periodId, periodId)).orderBy(desc(financialPeriodActions.actionAt), desc(financialPeriodActions.id)),
		database.select({
			id: bankReconciliations.id,
			reconciliationNumber: bankReconciliations.reconciliationNumber,
			status: bankReconciliations.status,
			statementStartDate: bankReconciliations.statementStartDate,
			statementEndDate: bankReconciliations.statementEndDate,
		}).from(bankReconciliations).where(and(
			lte(bankReconciliations.statementStartDate, period.endDate),
			gte(bankReconciliations.statementEndDate, period.startDate),
		)),
		database.select({
			accountNumber: chartOfAccounts.accountNumber,
			debit: generalLedgerEntries.debit,
			credit: generalLedgerEntries.credit,
		}).from(generalLedgerEntries)
			.innerJoin(journalEntries, eq(generalLedgerEntries.journalEntryId, journalEntries.id))
			.innerJoin(chartOfAccounts, eq(generalLedgerEntries.accountId, chartOfAccounts.id))
			.where(and(
				eq(journalEntries.status, "posted"),
				inArray(chartOfAccounts.accountNumber, ["1300", "2100"]),
				gte(generalLedgerEntries.entryDate, periodStart(period.startDate)),
				lte(generalLedgerEntries.entryDate, periodEnd(period.endDate)),
			)),
		getTrialBalanceReport({ asOfDate: period.endDate }),
	]);

	const signed = (positive: unknown, negative: unknown) => {
		const toCents = (value: unknown) => {
			const normalized = String(value ?? "0");
			const [whole, fraction = ""] = normalized.split(".");
			return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
		};
		const cents = toCents(positive) - toCents(negative);
		return `${cents < 0 ? "-" : ""}${Math.trunc(Math.abs(cents) / 100)}.${(Math.abs(cents) % 100).toString().padStart(2, "0")}`;
	};
	const vatSummary = calculateVatSummary({
		outputVat: vatRows.filter((row: any) => row.accountNumber === "2100").map((row: any) => signed(row.credit, row.debit)),
		inputVat: vatRows.filter((row: any) => row.accountNumber === "1300").map((row: any) => signed(row.debit, row.credit)),
	});
	const readiness = evaluatePeriodCloseReadiness({
		period,
		requiredReviews: reviews.map((review: any) => ({ reviewType: review.reviewType, reviewStatus: review.reviewStatus })),
		bankReconciliations: bankRows,
		trialBalanceDifference: Number(trialBalance.difference).toFixed(2),
	});
	return { period, reviews, actions, bankReconciliations: bankRows, vatSummary, trialBalance, readiness };
}

export async function createFinancialPeriod(input: { periodName: string; startDate: string; endDate: string; notes?: string; createdBy: number }) {
	assertIsoPeriod(input.startDate, input.endDate);
	const db = await getDb();
	if (!db) throw new Error("Database not available");
	const overlapping = await db.select({ id: financialPeriods.id, periodName: financialPeriods.periodName })
		.from(financialPeriods).where(and(
			lte(financialPeriods.startDate, input.endDate),
			gte(financialPeriods.endDate, input.startDate),
		)).limit(1);
	if (overlapping[0]) throw new Error(`This period overlaps existing period ${overlapping[0].periodName}. Overlapping financial periods are not allowed.`);

	return await (db as any).transaction(async (tx: any) => {
		const result = await tx.insert(financialPeriods).values({
			periodName: input.periodName.trim(),
			startDate: input.startDate,
			endDate: input.endDate,
			notes: input.notes?.trim() || null,
			createdBy: input.createdBy,
		});
		const periodId = Number(result[0]?.insertId ?? result.insertId ?? 0);
		if (!periodId) throw new Error("Financial period could not be created.");
		await tx.insert(financialControlReviews).values([
			{ periodId, reviewType: "bank_reconciliation", reviewStatus: "pending" },
			{ periodId, reviewType: "vat_summary", reviewStatus: "pending" },
			{ periodId, reviewType: "trial_balance", reviewStatus: "pending" },
			{ periodId, reviewType: "financial_statements", reviewStatus: "pending" },
		]);
		await tx.insert(financialPeriodActions).values({ periodId, actionType: "period_created", actionBy: input.createdBy, reason: "Financial period created" });
		return { id: periodId, periodName: input.periodName.trim() };
	});
}

export async function listFinancialPeriods() {
	const db = await getDb();
	if (!db) return [];
	return await db.select().from(financialPeriods).orderBy(desc(financialPeriods.endDate), desc(financialPeriods.id));
}

export async function getFinancialPeriodWorkspace(periodId: number) {
	const db = await getDb();
	if (!db) return null;
	return await getPeriodCloseWorkspaceWithDatabase(db, periodId);
}

export async function recordFinancialControlReview(input: { periodId: number; reviewType: CloseReviewType; reviewStatus: CloseReviewStatus; notes?: string; reviewedBy: number }) {
	const db = await getDb();
	if (!db) throw new Error("Database not available");
	return await (db as any).transaction(async (tx: any) => {
		const period = await getFinancialPeriodById(tx, input.periodId);
		if (period.status === "closed") throw new Error("A closed financial period cannot be changed. Reopen it with an audit reason first.");
		await tx.update(financialControlReviews).set({
			reviewStatus: input.reviewStatus,
			notes: input.notes?.trim() || null,
			reviewedAt: financialTimestamp(),
			reviewedBy: input.reviewedBy,
		}).where(and(
			eq(financialControlReviews.periodId, input.periodId),
			eq(financialControlReviews.reviewType, input.reviewType),
		));
		await tx.insert(financialPeriodActions).values({
			periodId: input.periodId,
			actionType: input.reviewStatus === "approved" ? "review_approved" : "review_exception",
			reason: input.notes?.trim() || null,
			referenceType: "financial_control_review",
			actionBy: input.reviewedBy,
		});
		return { success: true };
	});
}

export async function closeFinancialPeriod(periodId: number, closedBy: number) {
	const db = await getDb();
	if (!db) throw new Error("Database not available");
	const workspace = await getPeriodCloseWorkspaceWithDatabase(db, periodId);
	if (workspace.period.status === "closed") throw new Error("This financial period is already closed.");
	if (!workspace.readiness.canClose) {
		throw new Error(`Period cannot be closed: ${workspace.readiness.missingReviewTypes.length} review(s) pending; ${workspace.readiness.exceptionReviewTypes.length} review exception(s); ${workspace.readiness.incompleteBankReconciliationIds.length} incomplete Bank reconciliation(s); trial-balance difference ${workspace.trialBalance.difference}.`);
	}
	return await (db as any).transaction(async (tx: any) => {
		await tx.update(financialPeriods).set({ status: "closed", closedAt: financialTimestamp(), closedBy, lastReadinessCheckAt: financialTimestamp() }).where(eq(financialPeriods.id, periodId));
		await tx.insert(financialPeriodActions).values({ periodId, actionType: "period_closed", actionBy: closedBy, reason: "All close readiness controls approved" });
		return { success: true };
	});
}

export async function reopenFinancialPeriod(input: { periodId: number; reason: string; reopenedBy: number }) {
	const db = await getDb();
	if (!db) throw new Error("Database not available");
	const reason = input.reason.trim();
	if (reason.length < 10) throw new Error("Provide a reopen reason of at least 10 characters for the audit record.");
	return await (db as any).transaction(async (tx: any) => {
		const period = await getFinancialPeriodById(tx, input.periodId);
		if (period.status !== "closed") throw new Error("Only a closed financial period can be reopened.");
		await tx.update(financialPeriods).set({ status: "open", reopenedAt: financialTimestamp(), reopenedBy: input.reopenedBy, reopenReason: reason }).where(eq(financialPeriods.id, input.periodId));
		await tx.insert(financialPeriodActions).values({ periodId: input.periodId, actionType: "period_reopened", actionBy: input.reopenedBy, reason });
		return { success: true };
	});
}

export async function listReversibleJournals(periodId: number) {
	const db = await getDb();
	if (!db) return [];
	const period = await getFinancialPeriodById(db, periodId);
	return await db.select({
		id: journalEntries.id,
		journalNumber: journalEntries.journalNumber,
		entryDate: journalEntries.entryDate,
		description: journalEntries.description,
		totalDebit: journalEntries.totalDebit,
		totalCredit: journalEntries.totalCredit,
		status: journalEntries.status,
	}).from(journalEntries).where(and(
		eq(journalEntries.sourceType, "manual_journal"),
		eq(journalEntries.status, "posted"),
		gte(journalEntries.entryDate, periodStart(period.startDate)),
		lte(journalEntries.entryDate, periodEnd(period.endDate)),
	)).orderBy(desc(journalEntries.entryDate), desc(journalEntries.id));
}

export async function reverseManualJournal(input: { periodId: number; journalEntryId: number; reversalDate: string; reason: string; createdBy: number }) {
	assertIsoPeriod(input.reversalDate, input.reversalDate);
	const db = await getDb();
	if (!db) throw new Error("Database not available");
	const reason = input.reason.trim();
	if (reason.length < 10) throw new Error("Provide a reversal reason of at least 10 characters for the audit record.");
	await assertFinancialDateOpen(`${input.reversalDate} 00:00:00`);
	return await (db as any).transaction(async (tx: any) => {
		const period = await getFinancialPeriodById(tx, input.periodId);
		const sourceRows = await tx.select().from(journalEntries).where(eq(journalEntries.id, input.journalEntryId)).limit(1);
		const source = sourceRows[0];
		if (!source || source.sourceType !== "manual_journal" || source.status !== "posted") {
			throw new Error("Only an unreversed manual journal can be reversed through this control.");
		}
		if (!isDateInsidePeriod(source.entryDate, period)) throw new Error("The selected journal is not inside this financial period.");
		const originalLines = await tx.select({ accountId: generalLedgerEntries.accountId, debit: generalLedgerEntries.debit, credit: generalLedgerEntries.credit, description: generalLedgerEntries.description })
			.from(generalLedgerEntries).where(eq(generalLedgerEntries.journalEntryId, input.journalEntryId)).orderBy(asc(generalLedgerEntries.id));
		const reversalLines = buildReversalLines(originalLines.map((line: any) => ({ ...line, debit: String(line.debit), credit: String(line.credit) })));
		const validation = validateBalancedJournal(reversalLines);
		if (!validation.ok) throw new Error(validation.error);
		const journalNumber = buildReversalJournalNumber(source.journalNumber);
		const entryDate = `${input.reversalDate} 00:00:00`;
		const created = await tx.insert(journalEntries).values({
			journalNumber,
			entryDate,
			description: `Reversal of ${source.journalNumber}: ${reason}`.slice(0, 500),
			sourceType: "journal_reversal",
			sourceId: source.id,
			status: "posted",
			totalDebit: validation.totalDebit,
			totalCredit: validation.totalCredit,
			reversalOfJournalEntryId: source.id,
			createdBy: input.createdBy,
		});
		const reversalJournalEntryId = Number(created[0]?.insertId ?? created.insertId ?? 0);
		if (!reversalJournalEntryId) throw new Error("Reversal journal header could not be created.");
		await tx.insert(generalLedgerEntries).values(validation.lines.map((line) => ({
			entryNumber: journalNumber, entryDate, journalEntryId: reversalJournalEntryId, accountId: line.accountId,
			debit: line.debit, credit: line.credit, description: line.description, referenceType: "journal_reversal", referenceId: source.id, createdBy: input.createdBy,
		})));
		await tx.update(journalEntries).set({ status: "reversed" }).where(eq(journalEntries.id, source.id));
		await tx.insert(financialPeriodActions).values({ periodId: input.periodId, actionType: "journal_reversed", reason, referenceType: "journal_entry", referenceId: source.id, actionBy: input.createdBy });
		return { id: reversalJournalEntryId, journalNumber };
	});
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

export async function updateHealthRecord(id: number, data: Partial<typeof healthRecords.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.update(healthRecords).set(data).where(eq(healthRecords.id, id));
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

// Advanced Growth Metrics Calculation
export async function getAdvancedGrowthMetrics(flockId: number) {
  const db = await getDb();
  if (!db) return null;

  const flock = await getFlockById(flockId);
  if (!flock) return null;

  const dailyRecords = await getFlockDailyRecords(flockId);
  if (!dailyRecords || dailyRecords.length === 0) return null;

  // Filter records with weight data and sort by day
  const weightRecords = dailyRecords
    .filter(r => r.averageWeight && parseFloat(r.averageWeight.toString()) > 0)
    .sort((a, b) => a.dayNumber - b.dayNumber);

  if (weightRecords.length === 0) return null;

  // Calculate Daily Weight Gain (ADG)
  const adgData = [];
  for (let i = 1; i < weightRecords.length; i++) {
    const prevWeight = parseFloat(weightRecords[i - 1].averageWeight!.toString());
    const currWeight = parseFloat(weightRecords[i].averageWeight!.toString());
    const dayDiff = weightRecords[i].dayNumber - weightRecords[i - 1].dayNumber;
    const dailyGain = dayDiff > 0 ? ((currWeight - prevWeight) * 1000) / dayDiff : 0; // Convert to grams
    adgData.push({
      day: weightRecords[i].dayNumber,
      dailyGain: parseFloat(dailyGain.toFixed(2)),
      weight: currWeight
    });
  }

  const avgDailyGain = adgData.length > 0
    ? adgData.reduce((sum, d) => sum + d.dailyGain, 0) / adgData.length
    : 0;

  // Calculate Uniformity Index (Coefficient of Variation from weight samples)
  let uniformityIndex = null;
  const latestRecord = weightRecords[weightRecords.length - 1];
  if (latestRecord.weightSamples) {
    const samples = latestRecord.weightSamples
      .split(',')
      .map(w => parseFloat(w.trim()))
      .filter(w => !isNaN(w) && w > 0);
    
    if (samples.length >= 3) {
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
      const variance = samples.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / samples.length;
      const stdDev = Math.sqrt(variance);
      const cv = (stdDev / mean) * 100;
      uniformityIndex = parseFloat((100 - cv).toFixed(2)); // Higher is better
    }
  }

  // Calculate Projected Final Weight
  const latestWeight = parseFloat(latestRecord.averageWeight!.toString());
  const currentDay = latestRecord.dayNumber;
  const targetDay = flock.growingPeriod || 42;
  const daysRemaining = targetDay - currentDay;
  const projectedFinalWeight = daysRemaining > 0
    ? latestWeight + (avgDailyGain / 1000) * daysRemaining
    : latestWeight;

  // Calculate European Production Index (EPI)
  // EPI = (Livability × Live Weight in kg × 100) / (Age in days × FCR)
  const totalMortality = dailyRecords.reduce((sum, r) => sum + (r.mortality || 0), 0);
  const livability = ((flock.initialCount - totalMortality) / flock.initialCount) * 100;
  const totalFeedConsumed = dailyRecords.reduce((sum, r) => 
    sum + (r.feedConsumed ? parseFloat(r.feedConsumed.toString()) : 0), 0
  );
  const currentCount = flock.initialCount - totalMortality;
  const totalWeight = currentCount * latestWeight;
  const fcr = totalWeight > 0 ? totalFeedConsumed / totalWeight : 0;
  const epi = fcr > 0 && currentDay > 0
    ? (livability * latestWeight * 100) / (currentDay * fcr)
    : 0;

  return {
    avgDailyGain: parseFloat(avgDailyGain.toFixed(2)),
    adgData,
    uniformityIndex,
    projectedFinalWeight: parseFloat(projectedFinalWeight.toFixed(3)),
    epi: parseFloat(epi.toFixed(2)),
    livability: parseFloat(livability.toFixed(2)),
    currentDay,
    latestWeight
  };
}

// Feed Efficiency Metrics Calculation
export async function getFeedEfficiencyMetrics(flockId: number) {
  const db = await getDb();
  if (!db) return null;

  const flock = await getFlockById(flockId);
  if (!flock) return null;

  const dailyRecords = await getFlockDailyRecords(flockId);
  if (!dailyRecords || dailyRecords.length === 0) return null;

  const totalMortality = dailyRecords.reduce((sum, r) => sum + (r.mortality || 0), 0);
  const currentCount = flock.initialCount - totalMortality;

  // Calculate daily feed intake per bird
  const feedIntakeData = dailyRecords
    .filter(r => r.feedConsumed && parseFloat(r.feedConsumed.toString()) > 0)
    .map(r => {
      const birdCount = flock.initialCount - dailyRecords
        .filter(dr => dr.dayNumber <= r.dayNumber)
        .reduce((sum, dr) => sum + (dr.mortality || 0), 0);
      const feedPerBird = birdCount > 0
        ? (parseFloat(r.feedConsumed!.toString()) / birdCount) * 1000 // Convert to grams
        : 0;
      return {
        day: r.dayNumber,
        feedPerBird: parseFloat(feedPerBird.toFixed(2)),
        feedType: r.feedType || 'unknown'
      };
    });

  const avgFeedPerBird = feedIntakeData.length > 0
    ? feedIntakeData.reduce((sum, d) => sum + d.feedPerBird, 0) / feedIntakeData.length
    : 0;

  // Phase order for transition-weight lookups
  const phaseOrder = ['starter', 'grower', 'finisher'];

  // Calculate feed type performance
  // Transition-day rule:
  //   - Phase START weight = weight recorded on the first day of THIS phase (transition day
  //     from the previous phase), OR the last non-zero weight before the phase if none exists.
  //   - Phase END weight   = weight recorded on the first day of the NEXT phase (transition
  //     day into the following phase), OR the last non-zero weight within this phase if there
  //     is no next phase / no weight on the next phase's first day.
  //
  // This ensures the same transition-day weight (e.g. Day 19 when switching starter→grower)
  // is used as both the end weight of the preceding phase and the start weight of the next.
  const feedTypePerformance = phaseOrder.map((type, phaseIdx) => {
    const typeRecords = dailyRecords.filter(r => r.feedType === type);
    if (typeRecords.length === 0) return null;

    const totalFeed = typeRecords.reduce((sum, r) =>
      sum + (r.feedConsumed ? parseFloat(r.feedConsumed.toString()) : 0), 0
    );
    const startDay = Math.min(...typeRecords.map(r => r.dayNumber));
    const endDay   = Math.max(...typeRecords.map(r => r.dayNumber));

    // START weight: first non-zero weight on or before startDay
    const startWeightRecord = dailyRecords
      .filter(r => r.dayNumber <= startDay && r.averageWeight && parseFloat(r.averageWeight.toString()) > 0)
      .sort((a, b) => b.dayNumber - a.dayNumber)[0];

    // END weight: use the first day of the NEXT phase as the transition boundary.
    // If the next phase exists and has a weight on its first day, use that.
    // Otherwise fall back to the last non-zero weight within this phase.
    const nextPhase = phaseOrder[phaseIdx + 1];
    const nextPhaseRecords = nextPhase ? dailyRecords.filter(r => r.feedType === nextPhase) : [];
    const nextPhaseStartDay = nextPhaseRecords.length > 0
      ? Math.min(...nextPhaseRecords.map(r => r.dayNumber))
      : null;
    const nextPhaseStartWeight = nextPhaseStartDay !== null
      ? dailyRecords
          .filter(r => r.dayNumber === nextPhaseStartDay && r.averageWeight && parseFloat(r.averageWeight.toString()) > 0)
          .sort((a, b) => b.dayNumber - a.dayNumber)[0]
      : null;

    // Fall back to last non-zero weight within this phase if no next-phase transition weight
    const endWeightRecord = nextPhaseStartWeight
      ?? dailyRecords
          .filter(r => r.dayNumber <= endDay && r.averageWeight && parseFloat(r.averageWeight.toString()) > 0)
          .sort((a, b) => b.dayNumber - a.dayNumber)[0];

    const startWeightVal = startWeightRecord ? parseFloat(startWeightRecord.averageWeight!.toString()) : 0;
    const endWeightVal   = endWeightRecord   ? parseFloat(endWeightRecord.averageWeight!.toString())   : 0;
    const weightGain = startWeightVal > 0 && endWeightVal > 0
      ? endWeightVal - startWeightVal
      : 0;

    const phaseFCR = weightGain > 0 && currentCount > 0
      ? totalFeed / (currentCount * weightGain)
      : 0;

    return {
      feedType: type,
      totalFeed: parseFloat(totalFeed.toFixed(2)),
      days: endDay - startDay + 1,
      weightGain: parseFloat((weightGain * 1000).toFixed(2)), // Convert to grams
      fcr: parseFloat(phaseFCR.toFixed(3))
    };
  }).filter(Boolean);

  // Calculate water-to-feed ratio
  const waterFeedRatioData = dailyRecords
    .filter(r => r.waterConsumed && r.feedConsumed && 
      parseFloat(r.waterConsumed.toString()) > 0 && parseFloat(r.feedConsumed.toString()) > 0)
    .map(r => ({
      day: r.dayNumber,
      ratio: parseFloat((parseFloat(r.waterConsumed!.toString()) / parseFloat(r.feedConsumed!.toString())).toFixed(2))
    }));

  const avgWaterFeedRatio = waterFeedRatioData.length > 0
    ? waterFeedRatioData.reduce((sum, d) => sum + d.ratio, 0) / waterFeedRatioData.length
    : 0;

  return {
    avgFeedPerBird: parseFloat(avgFeedPerBird.toFixed(2)),
    feedIntakeData,
    feedTypePerformance,
    avgWaterFeedRatio: parseFloat(avgWaterFeedRatio.toFixed(2)),
    waterFeedRatioData
  };
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

  // Get latest weight sample (find the most recent record with a non-zero weight)
  let averageWeight = 0;
  for (let i = 0; i < dailyRecords.length; i++) {
    const record = dailyRecords[i];
    if (record.averageWeight && parseFloat(record.averageWeight.toString()) > 0) {
      averageWeight = parseFloat(record.averageWeight.toString());
    }
  }

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

  const targetWeight = flock.targetSlaughterWeight ? parseFloat(flock.targetSlaughterWeight) : 0;
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
export function getTargetGrowthCurve(startDay: number = 0, endDay: number = 42, breed: BreedType = 'ross_308'): Array<{ day: number; targetWeight: number }> {
  const curve: Array<{ day: number; targetWeight: number }> = [];
  
  for (let day = startDay; day <= endDay; day++) {
    curve.push({
      day,
      targetWeight: getTargetWeight(day, breed),
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

export async function listAllRemindersWithFlockInfo() {
  const db = await getDb();
  if (!db) return [];

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
      flockNumber: flocks.flockNumber,
      houseName: houses.name,
    })
    .from(reminders)
    .leftJoin(flocks, eq(reminders.flockId, flocks.id))
    .leftJoin(houses, eq(reminders.houseId, houses.id))
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
  actionNotes?: string,
  completedAt?: Date
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: any = { status };
  if (completedBy) {
    updateData.completedBy = completedBy;
    // Use provided completedAt timestamp or generate current time
    const timestamp = completedAt || new Date();
    updateData.completedAt = timestamp.toISOString().slice(0, 19).replace('T', ' ');
  }
  if (actionNotes) {
    updateData.actionNotes = actionNotes;
  }

  try {
    console.log('Updating reminder with data:', { id, updateData, completedBy, completedAt });
    
    // Verify user exists if completedBy is provided
    if (completedBy && db.query) {
      try {
        const user = await db.query.users.findFirst({
          where: eq(users.id, completedBy),
        });
        if (!user) {
          console.error('User not found for completedBy:', { completedBy });
          throw new Error(`User with ID ${completedBy} not found`);
        }
        console.log('User verified for completedBy:', { userId: completedBy, userName: user.name });
      } catch (queryError) {
        console.warn('Could not verify user existence:', queryError);
        // Continue anyway - the foreign key constraint will catch it if user doesn't exist
      }
    }
    
    // Verify reminder exists if db.query is available
    if (db.query) {
      try {
        const reminder = await db.query.reminders.findFirst({
          where: eq(reminders.id, id),
        });
        if (!reminder) {
          throw new Error(`Reminder with ID ${id} not found`);
        }
        console.log('Reminder found:', { id, currentStatus: reminder.status });
      } catch (queryError) {
        console.warn('Could not verify reminder existence:', queryError);
        // Continue anyway - the update will fail if reminder doesn't exist
      }
    }
    
    await db.update(reminders).set(updateData).where(eq(reminders.id, id));
    console.log('Reminder updated successfully:', { id, newStatus: updateData.status });
    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorCode = (error as any)?.code || 'UNKNOWN';
    const errorSql = (error as any)?.sql || 'N/A';
    console.error('Error updating reminder:', { 
      id, 
      updateData, 
      error: errorMsg, 
      errorCode,
      errorSql,
      fullError: error 
    });
    throw new Error(`Failed to update reminder: ${errorMsg}`);
  }
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

export async function getFlockActivityLogs(flockId: number) {
  const db = await getDb();
  if (!db) return [];

  const logs = await db
    .select({
      id: userActivityLogs.id,
      userId: userActivityLogs.userId,
      action: userActivityLogs.action,
      entityType: userActivityLogs.entityType,
      entityId: userActivityLogs.entityId,
      details: userActivityLogs.details,
      createdAt: userActivityLogs.createdAt,
      userName: users.name,
    })
    .from(userActivityLogs)
    .leftJoin(users, eq(userActivityLogs.userId, users.id))
    .where(
      and(
        eq(userActivityLogs.entityType, "flock"),
        eq(userActivityLogs.entityId, flockId)
      )
    )
    .orderBy(desc(userActivityLogs.createdAt));

  return logs;
}

export async function getAllActivityLogs() {
  const db = await getDb();
  if (!db) return [];

  const logs = await db
    .select({
      id: userActivityLogs.id,
      userId: userActivityLogs.userId,
      action: userActivityLogs.action,
      entityType: userActivityLogs.entityType,
      entityId: userActivityLogs.entityId,
      details: userActivityLogs.details,
      createdAt: userActivityLogs.createdAt,
      userName: users.name,
    })
    .from(userActivityLogs)
    .leftJoin(users, eq(userActivityLogs.userId, users.id))
    .orderBy(desc(userActivityLogs.createdAt))
    .limit(1000); // Limit to last 1000 logs for performance

  return logs;
}

export async function createInvoice(data: {
  invoiceNumber: string;
  customerId: number;
  catchSessionId?: number;
  processorId?: number;
  invoiceDate: Date;
  dueDate: Date;
  pricePerKgExcl: number;
  totalBirds: number;
  totalWeight: number;
  vatPercentage: number;
  createdBy?: number;
  // Optional pre-computed totals (from line items); if provided, skip weight × price calculation
  exclusiveTotal?: number;
  vatAmount?: number;
  inclusiveTotal?: number;
}): Promise<{ insertId: number }> {
  const db = await getDb();

  // Use pre-computed totals if provided, otherwise calculate from weight × price
  const exclusiveTotal = data.exclusiveTotal ?? (data.totalWeight * data.pricePerKgExcl);
  const vatAmount = data.vatAmount ?? (exclusiveTotal * (data.vatPercentage / 100));
  const inclusiveTotal = data.inclusiveTotal ?? (exclusiveTotal + vatAmount);

  const result = await db.insert(invoices).values({
    invoiceNumber: data.invoiceNumber,
    customerId: data.customerId,
    invoiceDate: data.invoiceDate instanceof Date ? data.invoiceDate.toISOString().slice(0, 19).replace('T', ' ') : data.invoiceDate,
    dueDate: data.dueDate instanceof Date ? data.dueDate.toISOString().slice(0, 19).replace('T', ' ') : data.dueDate,
    subtotal: exclusiveTotal.toFixed(2),
    taxAmount: vatAmount.toFixed(2),
    totalAmount: inclusiveTotal.toFixed(2),
    paidAmount: '0.00',
    balanceDue: inclusiveTotal.toFixed(2),
    status: "draft",
    createdBy: data.createdBy,
    catchSessionId: data.catchSessionId,
    processorId: data.processorId,
    pricePerKgExcl: data.pricePerKgExcl,
    totalBirds: data.totalBirds,
    totalWeight: data.totalWeight,
    exclusiveTotal,
    vatAmount,
    inclusiveTotal,
    vatPercentage: data.vatPercentage,
  });

  return { insertId: Number(result.insertId) };
}


export async function getInvoiceByNumber(invoiceNumber: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(invoices).where(eq(invoices.invoiceNumber, invoiceNumber)).limit(1);
  return result[0] ? normalizeLegacyInvoiceRecord(result[0]) : null;
}

async function getPaymentPostingByIdempotencyKey(dbConn: any, idempotencyKey: string) {
	const rows = await dbConn.select({
		paymentId: customerInvoicePayments.id,
		invoiceId: customerInvoicePayments.invoiceId,
		amount: customerInvoicePayments.amount,
		paymentDate: customerInvoicePayments.paymentDate,
		journalNumber: journalEntries.journalNumber,
	})
		.from(customerInvoicePayments)
		.leftJoin(accountingSourcePostings, and(
			eq(accountingSourcePostings.sourceType, "customer_invoice_payment"),
			eq(accountingSourcePostings.sourceId, customerInvoicePayments.id),
		))
		.leftJoin(journalEntries, eq(accountingSourcePostings.journalEntryId, journalEntries.id))
		.where(eq(customerInvoicePayments.idempotencyKey, idempotencyKey))
		.limit(1);
	return rows[0] ?? null;
}

export async function recordInvoicePayment(invoiceId: number, data: {
	amount: number;
	paymentMethod: string;
	paymentDate: string;
	paymentReference?: string;
	idempotencyKey: string;
	createdBy: number;
}) {
	const db = await getDb();
	if (!db) throw new Error("Database not available");

	const payment = parseRandAmount(data.amount, "Customer payment amount");
	const idempotencyKey = data.idempotencyKey.trim();
	if (idempotencyKey.length < 8 || idempotencyKey.length > 100) {
		throw new Error("A valid payment idempotency key is required.");
	}

	const existing = await getPaymentPostingByIdempotencyKey(db, idempotencyKey);
	if (existing) {
		if (existing.invoiceId !== invoiceId) throw new Error("This payment request key belongs to a different invoice.");
		return {
			success: true,
			paymentId: existing.paymentId,
			journalNumber: existing.journalNumber,
			alreadyPosted: true,
			newStatus: null,
			newPaid: null,
			newBalance: null,
		};
	}

	const invoiceRows = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
	const invoice = invoiceRows[0];
	if (!invoice) throw new Error("Invoice not found");
	await assertFinancialDateOpen(data.paymentDate);
	if (normalizeLegacyInvoiceAmounts(invoice).hasLegacyHundredfoldHeader) {
		throw new Error("This invoice has a legacy 100× header amount mismatch. Run migration 0049 before recording another payment.");
	}
	if (!["sent", "partial", "overdue"].includes(invoice.status)) {
		throw new Error("Only sent, partially paid, or overdue invoices can receive a customer payment.");
	}

	resolveCustomerPaymentOutcome({ amount: payment.normalized, balanceDue: invoice.balanceDue });

	const invoicePosting = await db.select({ journalEntryId: accountingSourcePostings.journalEntryId })
		.from(accountingSourcePostings)
		.where(and(
			eq(accountingSourcePostings.sourceType, "customer_invoice"),
			eq(accountingSourcePostings.sourceId, invoiceId),
		))
		.limit(1);
	if (!invoicePosting[0]) {
		throw new Error("The customer invoice must be posted to Trade Receivables before recording a payment.");
	}

	const requiredAccountNumbers = [
		CUSTOMER_PAYMENT_POSTING_ACCOUNTS.bank,
		CUSTOMER_PAYMENT_POSTING_ACCOUNTS.tradeReceivables,
	];
	const accounts = await db.select({
		id: chartOfAccounts.id,
		accountNumber: chartOfAccounts.accountNumber,
		isActive: chartOfAccounts.isActive,
		isPostingAccount: chartOfAccounts.isPostingAccount,
	})
		.from(chartOfAccounts)
		.where(inArray(chartOfAccounts.accountNumber, requiredAccountNumbers));
	const accountsByNumber = new Map(accounts.map((account) => [account.accountNumber, account]));
	for (const accountNumber of requiredAccountNumbers) {
		const account = accountsByNumber.get(accountNumber);
		if (!account || !account.isActive || !account.isPostingAccount) {
			throw new Error(`Required posting account ${accountNumber} is missing, inactive, or not postable. Seed or correct the chart of accounts before recording this payment.`);
		}
	}

	const journalLines = buildCustomerPaymentPosting({
		invoiceNumber: invoice.invoiceNumber,
		amount: payment.normalized,
		accountIds: {
			bank: accountsByNumber.get(CUSTOMER_PAYMENT_POSTING_ACCOUNTS.bank)!.id,
			tradeReceivables: accountsByNumber.get(CUSTOMER_PAYMENT_POSTING_ACCOUNTS.tradeReceivables)!.id,
		},
	});
	const validation = validateBalancedJournal(journalLines);
	if (!validation.ok) throw new Error(validation.error);

	return await (db as any).transaction(async (tx: any) => {
		const retry = await getPaymentPostingByIdempotencyKey(tx, idempotencyKey);
		if (retry) {
			if (retry.invoiceId !== invoiceId) throw new Error("This payment request key belongs to a different invoice.");
			return {
				success: true,
				paymentId: retry.paymentId,
				journalNumber: retry.journalNumber,
				alreadyPosted: true,
				newStatus: null,
				newPaid: null,
				newBalance: null,
			};
		}

		const updated = await tx.update(invoices).set({
			paidAmount: sql`CAST(${invoices.paidAmount} + ${payment.normalized} AS DECIMAL(15,2))`,
			balanceDue: sql`GREATEST(CAST(${invoices.balanceDue} AS DECIMAL(15,2)) - CAST(${payment.normalized} AS DECIMAL(15,2)), 0.00)`,
			status: sql`CASE WHEN CAST(${invoices.balanceDue} AS DECIMAL(15,2)) <= CAST(${payment.normalized} AS DECIMAL(15,2)) THEN 'paid' ELSE 'partial' END`,
			paymentMethod: data.paymentMethod,
			paymentDate: data.paymentDate,
			updatedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
		}).where(and(
			eq(invoices.id, invoiceId),
			sql`${invoices.balanceDue} >= ${payment.normalized}`,
		));
		const rowsAffected = Number((updated as any).rowsAffected ?? (updated as any)[0]?.affectedRows ?? 0);
		if (rowsAffected !== 1) {
			throw new Error("Payment amount cannot exceed the current outstanding invoice balance.");
		}

		const createdPayment = await tx.insert(customerInvoicePayments).values({
			invoiceId,
			amount: payment.normalized,
			paymentMethod: data.paymentMethod,
			paymentDate: data.paymentDate,
			paymentReference: data.paymentReference?.trim() || null,
			idempotencyKey,
			createdBy: data.createdBy,
		});
		const paymentId = Number(createdPayment[0]?.insertId ?? createdPayment.insertId ?? 0);
		if (!paymentId) throw new Error("Customer payment receipt could not be created.");

		const journalNumber = getCustomerPaymentJournalNumber(paymentId);
		const sourceDescription = `Customer payment for ${invoice.invoiceNumber}`;
		const createdJournal = await tx.insert(journalEntries).values({
			journalNumber,
			entryDate: data.paymentDate,
			description: sourceDescription,
			sourceType: "customer_invoice_payment",
			sourceId: paymentId,
			totalDebit: validation.totalDebit,
			totalCredit: validation.totalCredit,
			createdBy: data.createdBy,
		});
		const journalEntryId = Number(createdJournal[0]?.insertId ?? createdJournal.insertId ?? 0);
		if (!journalEntryId) throw new Error("Customer payment journal header could not be created.");

		await tx.insert(generalLedgerEntries).values(validation.lines.map((line) => ({
			entryNumber: journalNumber,
			entryDate: data.paymentDate,
			journalEntryId,
			accountId: line.accountId,
			debit: line.debit,
			credit: line.credit,
			description: line.description || sourceDescription,
			referenceType: "customer_invoice_payment",
			referenceId: paymentId,
			createdBy: data.createdBy,
		})));

		await tx.insert(accountingSourcePostings).values({
			sourceType: "customer_invoice_payment",
			sourceId: paymentId,
			journalEntryId,
			createdBy: data.createdBy,
		});

		const updatedInvoiceRows = await tx.select({
			status: invoices.status,
			paidAmount: invoices.paidAmount,
			balanceDue: invoices.balanceDue,
		}).from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
		const updatedInvoice = updatedInvoiceRows[0];
		if (!updatedInvoice) throw new Error("Invoice could not be reloaded after payment posting.");

		return {
			success: true,
			paymentId,
			journalNumber,
			alreadyPosted: false,
			newStatus: updatedInvoice.status,
			newPaid: updatedInvoice.paidAmount,
			newBalance: updatedInvoice.balanceDue,
		};
	});
}

export async function cancelInvoice(invoiceId: number) {
  const db = await getDb();
  if (!db) return null;
  await db.update(invoices)
    .set({ status: 'cancelled', updatedAt: new Date().toISOString().slice(0, 19).replace('T', ' ') })
    .where(eq(invoices.id, invoiceId));
  return { success: true };
}

export async function getCatchSessionById(catchSessionId: number) {
  const db = await getDb();
  const result = await db
    .select()
    .from(catchSessions)
    .where(eq(catchSessions.id, catchSessionId))
    .limit(1);
  
  return result[0] || null;
}


// ============================================================================
// COMPANY SETTINGS
// ============================================================================

export async function getCompanySettings() {
  const db = await getDb();
  const result = await db.query.companySettings.findFirst();
  return result || null;
}

export async function updateCompanySettings(data: any, userId: number) {
  const db = await getDb();
  const existing = await db.query.companySettings.findFirst();
  
  // Build explicit update payload from known schema fields
  const updatePayload: any = {};
  
  // Only include fields that are defined in the schema
  if (data.companyName !== undefined) updatePayload.companyName = data.companyName;
  if (data.vatNumber !== undefined) updatePayload.vatNumber = data.vatNumber;
  if (data.registrationNumber !== undefined) updatePayload.registrationNumber = data.registrationNumber;
  if (data.address !== undefined) updatePayload.address = data.address;
  if (data.phone !== undefined) updatePayload.phone = data.phone;
  if (data.email !== undefined) updatePayload.email = data.email;
  if (data.website !== undefined) updatePayload.website = data.website;
  if (data.bankName !== undefined) updatePayload.bankName = data.bankName;
  if (data.branchCode !== undefined) updatePayload.branchCode = data.branchCode;
  if (data.accountName !== undefined) updatePayload.accountName = data.accountName;
  if (data.accountNumber !== undefined) updatePayload.accountNumber = data.accountNumber;
  if (data.accountReference !== undefined) updatePayload.accountReference = data.accountReference;
  if (data.logoUrl !== undefined) updatePayload.logoUrl = data.logoUrl;
  if (data.timezone !== undefined) updatePayload.timezone = data.timezone;
  
  if (existing) {
    return await db
      .update(companySettings)
      .set(updatePayload)
      .where(eq(companySettings.id, existing.id));
  } else {
    return await db.insert(companySettings).values({
      ...updatePayload,
      createdBy: userId,
    });
  }
}


// ============================================================================
// SCHEDULED TASKS: INVOICE STATUS MANAGEMENT
// ============================================================================

/**
 * Flag invoices as overdue if:
 * - Status is 'sent' or 'partial' (not yet fully paid)
 * - Due date has passed (dueDate < now)
 * Returns count of updated invoices
 */
export async function flagOverdueInvoices(now: Date): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  
  const result = await db.update(invoices)
    .set({ 
      status: 'overdue',
      updatedAt: new Date().toISOString().slice(0, 19).replace('T', ' ')
    })
    .where(
      and(
        inArray(invoices.status, ['sent', 'partial']),
        lt(invoices.dueDate, now.toISOString().slice(0, 19).replace('T', ' '))
      )
    );
  
  return result.rowsAffected || 0;
}

/**
 * Revert invoices from 'overdue' back to 'paid' if:
 * - Status is 'overdue'
 * - paidAmount >= inclusiveTotal (fully paid)
 * Returns count of updated invoices
 */
export async function revertPaidFromOverdue(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  
  // Fetch all overdue invoices
  const overdueInvoices = await db
    .select()
    .from(invoices)
    .where(eq(invoices.status, 'overdue'));
  
  let count = 0;
  for (const invoice of overdueInvoices) {
    const paidAmount = parseFloat(String(invoice.paidAmount || 0));
    const inclusiveTotal = parseFloat(String(invoice.inclusiveTotal || 0));
    
    if (paidAmount >= inclusiveTotal) {
      await db.update(invoices)
        .set({ 
          status: 'paid',
          updatedAt: new Date().toISOString().slice(0, 19).replace('T', ' ')
        })
        .where(eq(invoices.id, invoice.id));
      count++;
    }
  }
  
  return count;
}


// ============================================================================
// FINANCIAL MANAGEMENT: EXPENSE TRACKING
// ============================================================================

function periodStart(date: string) {
  return `${date.slice(0, 10)} 00:00:00`;
}

function periodEnd(date: string) {
  return `${date.slice(0, 10)} 23:59:59`;
}

export async function getProfitAndLossReport(input: { startDate: string; endDate: string }) {
  const db = await getDb();
  if (!db) {
    return calculateProfitAndLossReport({
      ...input,
      invoices: [],
      expenses: [],
      millInvoices: [],
    });
  }

  const [invoiceRows, expenseRows, millInvoiceRows] = await Promise.all([
    db.select({
      id: invoices.id,
      invoiceDate: invoices.invoiceDate,
      status: invoices.status,
      subtotal: invoices.subtotal,
      exclusiveTotal: invoices.exclusiveTotal,
    })
      .from(invoices)
      .where(and(gte(invoices.invoiceDate, periodStart(input.startDate)), lte(invoices.invoiceDate, periodEnd(input.endDate)))),
    db.select({
      id: expenses.id,
      expenseDate: expenses.expenseDate,
      status: expenses.status,
      categoryName: expenseCategories.name,
      amount: expenses.amount,
    })
      .from(expenses)
      .innerJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
      .where(and(gte(expenses.expenseDate, periodStart(input.startDate)), lte(expenses.expenseDate, periodEnd(input.endDate)))),
    db.select({
      id: millInvoices.id,
      invoiceDate: millInvoices.invoiceDate,
      status: millInvoices.status,
      amountExcl: millInvoices.amountExcl,
    })
      .from(millInvoices)
      .where(and(gte(millInvoices.invoiceDate, input.startDate), lte(millInvoices.invoiceDate, input.endDate))),
  ]);

  return calculateProfitAndLossReport({
    ...input,
    invoices: invoiceRows,
    expenses: expenseRows,
    millInvoices: millInvoiceRows,
  });
}

export async function getAgedReceivablesReport(input: { asOfDate: string }) {
  const db = await getDb();
  if (!db) return calculateAgedReceivablesReport({ ...input, invoices: [] });

  const rows = await db.select({
    id: invoices.id,
    invoiceNumber: invoices.invoiceNumber,
    customerName: customers.name,
    invoiceDate: invoices.invoiceDate,
    dueDate: invoices.dueDate,
    status: invoices.status,
    balanceDue: invoices.balanceDue,
    inclusiveTotal: invoices.inclusiveTotal,
    paidAmount: invoices.paidAmount,
  })
    .from(invoices)
    .leftJoin(customers, eq(invoices.customerId, customers.id))
    .where(lte(invoices.invoiceDate, periodEnd(input.asOfDate)));

	return calculateAgedReceivablesReport({ ...input, invoices: rows });
}

export async function getAgedPayablesReport(input: { asOfDate: string }) {
	const db = await getDb();
	if (!db) return calculateAgedPayablesReport({ ...input, invoices: [] });

	const rows = await db.select({
		id: millInvoices.id,
		invoiceNumber: millInvoices.invoiceNumber,
		supplierName: suppliers.name,
		invoiceDate: millInvoices.invoiceDate,
		dueDate: millInvoices.dueDate,
		status: millInvoices.status,
		balanceDue: millInvoices.balanceDue,
	})
		.from(millInvoices)
		.innerJoin(accountingSourcePostings, and(
			eq(accountingSourcePostings.sourceType, "supplier_mill_invoice"),
			eq(accountingSourcePostings.sourceId, millInvoices.id),
		))
		.leftJoin(suppliers, eq(millInvoices.supplierId, suppliers.id))
		.where(lte(millInvoices.invoiceDate, input.asOfDate));

	return calculateAgedPayablesReport({ ...input, invoices: rows });
}

export async function getCashFlowStatementReport(input: { startDate: string; endDate: string }) {
  const db = await getDb();
  if (!db) return calculateCashFlowStatement({ ...input, receipts: [], payments: [] });

		const [customerInvoicePaymentRows, historicalInvoicePaymentRows, standalonePaymentRows, expensePaymentRows, supplierPaymentRows, legacyMillPaymentRows] = await Promise.all([
		db.select({
			id: customerInvoicePayments.id,
			date: customerInvoicePayments.paymentDate,
			amount: customerInvoicePayments.amount,
			invoiceNumber: invoices.invoiceNumber,
		})
			.from(customerInvoicePayments)
			.innerJoin(invoices, eq(customerInvoicePayments.invoiceId, invoices.id))
			.where(and(gte(customerInvoicePayments.paymentDate, periodStart(input.startDate)), lte(customerInvoicePayments.paymentDate, periodEnd(input.endDate)))),
		db.select({
			id: invoices.id,
			date: invoices.paymentDate,
      amount: invoices.paidAmount,
      invoiceNumber: invoices.invoiceNumber,
    })
		.from(invoices)
		.leftJoin(customerInvoicePayments, eq(customerInvoicePayments.invoiceId, invoices.id))
		.where(and(gte(invoices.paymentDate, periodStart(input.startDate)), lte(invoices.paymentDate, periodEnd(input.endDate)), inArray(invoices.status, ['paid', 'partial']), isNull(customerInvoicePayments.id))),
    db.select({
      id: payments.id,
      date: payments.paymentDate,
      amount: payments.amount,
      paymentNumber: payments.paymentNumber,
    })
      .from(payments)
      .where(and(gte(payments.paymentDate, periodStart(input.startDate)), lte(payments.paymentDate, periodEnd(input.endDate)))),
    db.select({
      id: expenses.id,
      date: expenses.paymentDate,
      amount: expenses.totalAmount,
      description: expenses.description,
      categoryName: expenseCategories.name,
    })
      .from(expenses)
      .innerJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
      .where(and(gte(expenses.paymentDate, periodStart(input.startDate)), lte(expenses.paymentDate, periodEnd(input.endDate)), eq(expenses.status, 'paid'))),
			db.select({
				id: supplierInvoicePayments.id,
				date: supplierInvoicePayments.paymentDate,
				amount: supplierInvoicePayments.amount,
				invoiceNumber: millInvoices.invoiceNumber,
			})
				.from(supplierInvoicePayments)
				.innerJoin(millInvoices, eq(supplierInvoicePayments.millInvoiceId, millInvoices.id))
				.where(and(gte(supplierInvoicePayments.paymentDate, periodStart(input.startDate)), lte(supplierInvoicePayments.paymentDate, periodEnd(input.endDate)))),
	    db.select({
	      id: millInvoices.id,
      date: millInvoices.paidDate,
      paidAmount: millInvoices.paidAmount,
      amountIncl: millInvoices.amountIncl,
      invoiceNumber: millInvoices.invoiceNumber,
    })
	    .from(millInvoices)
			.leftJoin(supplierInvoicePayments, eq(supplierInvoicePayments.millInvoiceId, millInvoices.id))
	    .where(and(gte(millInvoices.paidDate, input.startDate), lte(millInvoices.paidDate, input.endDate), eq(millInvoices.status, 'paid'), isNull(supplierInvoicePayments.id))),
  ]);

	return calculateCashFlowStatement({
		...input,
		receipts: [
			...customerInvoicePaymentRows.map((row) => ({
				id: `customer-invoice-payment-${row.id}`,
			date: row.date,
			amount: Number(row.amount),
			description: `Invoice payment — ${row.invoiceNumber}`,
			source: 'Invoice payment' as const,
		})),
		...historicalInvoicePaymentRows.map((row) => ({
			id: `invoice-${row.id}`,
			date: row.date!,
        amount: Number(row.amount),
        description: `Invoice payment — ${row.invoiceNumber}`,
        source: 'Invoice payment' as const,
      })),
      ...standalonePaymentRows.map((row) => ({
        id: `payment-${row.id}`,
        date: row.date,
        amount: Number(row.amount) / 100,
        description: `Standalone payment — ${row.paymentNumber}`,
        source: 'Standalone payment' as const,
      })),
    ],
    payments: [
      ...expensePaymentRows.map((row) => ({
        id: `expense-${row.id}`,
        date: row.date!,
        amount: Number(row.amount) / 100,
        description: `${row.categoryName}: ${row.description}`,
        source: 'Expense payment' as const,
      })),
				...supplierPaymentRows.map((row) => ({
					id: `supplier-invoice-payment-${row.id}`,
					date: row.date,
					amount: Number(row.amount),
					description: `Supplier invoice payment — ${row.invoiceNumber}`,
					source: 'Mill invoice payment' as const,
				})),
	      ...legacyMillPaymentRows.map((row) => ({
        id: `mill-${row.id}`,
        date: row.date!,
        amount: Number(row.paidAmount ?? row.amountIncl),
        description: `Mill invoice payment — ${row.invoiceNumber}`,
        source: 'Mill invoice payment' as const,
      })),
    ],
	});
}

async function getLedgerReportInputs(asOfDate: string) {
  const db = await getDb();
  if (!db) return { accounts: [], ledgerLines: [] };

  const [accounts, ledgerLines] = await Promise.all([
    db.select({
      id: chartOfAccounts.id,
      accountNumber: chartOfAccounts.accountNumber,
      accountName: chartOfAccounts.accountName,
      accountType: chartOfAccounts.accountType,
      accountSubtype: chartOfAccounts.accountSubtype,
      normalBalance: chartOfAccounts.normalBalance,
    })
      .from(chartOfAccounts)
      .where(eq(chartOfAccounts.isActive, 1)),
    db.select({
      accountId: generalLedgerEntries.accountId,
      debit: generalLedgerEntries.debit,
      credit: generalLedgerEntries.credit,
    })
      .from(generalLedgerEntries)
      .innerJoin(journalEntries, eq(generalLedgerEntries.journalEntryId, journalEntries.id))
      .where(and(
        eq(journalEntries.status, "posted"),
        lte(generalLedgerEntries.entryDate, periodEnd(asOfDate)),
      )),
  ]);

  return { accounts, ledgerLines };
}

export async function getTrialBalanceReport(input: { asOfDate: string }) {
  const { accounts, ledgerLines } = await getLedgerReportInputs(input.asOfDate);
  return calculateTrialBalanceReport({ ...input, accounts, ledgerLines });
}

export async function getBalanceSheetReport(input: { asOfDate: string }) {
  const { accounts, ledgerLines } = await getLedgerReportInputs(input.asOfDate);
  return calculateBalanceSheetReport({ ...input, accounts, ledgerLines });
}

export async function getExpenseCategories() {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(expenseCategories)
    .where(eq(expenseCategories.isActive, 1))
    .orderBy(expenseCategories.name);
}

export async function createExpense(data: {
  categoryId: number;
  houseId?: number;
  flockId?: number;
  description: string;
  amount: number;
  vatPercentage?: number;
  expenseDate: string;
  paymentMethod?: string;
  reference?: string;
  notes?: string;
  createdBy?: number;
}) {
  const db = await getDb();
  if (!db) return null;
  const vatPct = data.vatPercentage || 15;
  const vatAmount = Math.round(data.amount * (vatPct / 100));
  const totalAmount = data.amount + vatAmount;
  return await db.insert(expenses).values({
    categoryId: data.categoryId,
    houseId: data.houseId,
    flockId: data.flockId,
    description: data.description,
    amount: data.amount,
    vatAmount,
    totalAmount,
    vatPercentage: vatPct.toString(),
    expenseDate: data.expenseDate,
    paymentMethod: data.paymentMethod,
    reference: data.reference,
    notes: data.notes,
    createdBy: data.createdBy,
    status: 'pending',
  });
}

export async function listExpenses(filters?: {
  categoryId?: number;
  houseId?: number;
  flockId?: number;
  status?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return { expenses: [], total: 0 };
  const conditions: any[] = [];
  if (filters?.categoryId) conditions.push(eq(expenses.categoryId, filters.categoryId));
  if (filters?.houseId) conditions.push(eq(expenses.houseId, filters.houseId));
  if (filters?.flockId) conditions.push(eq(expenses.flockId, filters.flockId));
  if (filters?.status) conditions.push(eq(expenses.status, filters.status as any));
  if (filters?.startDate) conditions.push(gte(expenses.expenseDate, filters.startDate));
  if (filters?.endDate) conditions.push(lte(expenses.expenseDate, filters.endDate));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const result = await db.select().from(expenses)
    .where(whereClause)
    .orderBy(desc(expenses.expenseDate))
    .limit(filters?.limit || 100)
    .offset(filters?.offset || 0);
  return { expenses: result, total: result.length };
}

export async function updateExpenseStatus(expenseId: number, status: 'pending' | 'paid' | 'overdue' | 'cancelled', paymentDate?: string) {
  const db = await getDb();
  if (!db) return null;
  const updateData: any = {
    status,
    updatedAt: new Date().toISOString().slice(0, 19).replace('T', ' ')
  };
  if (paymentDate && status === 'paid') updateData.paymentDate = paymentDate;
  return await db.update(expenses).set(updateData).where(eq(expenses.id, expenseId));
}

export async function getExpenseSummary(startDate?: string, endDate?: string) {
  const db = await getDb();
  if (!db) return { totalExpenses: 0, totalByCategory: [] };
  const conditions: any[] = [];
  if (startDate) conditions.push(gte(expenses.expenseDate, startDate));
  if (endDate) conditions.push(lte(expenses.expenseDate, endDate));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const result = await db.select({
    categoryName: expenseCategories.name,
    totalAmount: sql<number>`SUM(${expenses.totalAmount})`,
    count: sql<number>`COUNT(*)`,
  })
    .from(expenses)
    .innerJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
    .where(whereClause)
    .groupBy(expenses.categoryId);
  const totalExpenses = result.reduce((sum, row) => sum + (row.totalAmount || 0), 0);
  return { totalExpenses, totalByCategory: result };
}

// ============================================================================
// FINANCIAL MANAGEMENT: CASH FLOW FORECASTING
// ============================================================================

export async function createCashFlowForecast(data: {
  startDate: string;
  endDate: string;
  notes?: string;
  createdBy?: number;
}) {
  const db = await getDb();
  if (!db) return null;
  return await db.insert(cashFlowForecasts).values({
    forecastDate: new Date().toISOString().slice(0, 19).replace('T', ' '),
    startDate: data.startDate,
    endDate: data.endDate,
    notes: data.notes,
    createdBy: data.createdBy,
  });
}

export async function addCashFlowItem(data: {
  forecastId: number;
  itemDate: string;
  itemType: 'income' | 'expense';
  category: string;
  description: string;
  amount: number;
  houseId?: number;
  flockId?: number;
  relatedExpenseId?: number;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) return null;
  return await db.insert(cashFlowItems).values({
    forecastId: data.forecastId,
    itemDate: data.itemDate,
    itemType: data.itemType,
    category: data.category,
    description: data.description,
    amount: data.amount,
    houseId: data.houseId,
    flockId: data.flockId,
    relatedExpenseId: data.relatedExpenseId,
    notes: data.notes,
  });
}

export async function getCashFlowForecast(forecastId: number) {
  const db = await getDb();
  if (!db) return null;
  const forecast = await db.select().from(cashFlowForecasts).where(eq(cashFlowForecasts.id, forecastId)).limit(1);
  if (!forecast.length) return null;
  const items = await db.select().from(cashFlowItems).where(eq(cashFlowItems.forecastId, forecastId)).orderBy(cashFlowItems.itemDate);
  return { forecast: forecast[0], items };
}

export async function calculateCashFlowSummary(forecastId: number) {
  const db = await getDb();
  if (!db) return { totalIncome: 0, totalExpense: 0, netCashFlow: 0, dailyBalance: [] };
  const items = await db.select().from(cashFlowItems).where(eq(cashFlowItems.forecastId, forecastId)).orderBy(cashFlowItems.itemDate);
  let totalIncome = 0;
  let totalExpense = 0;
  let runningBalance = 0;
  const dailyBalance: Array<{ date: string; balance: number; income: number; expense: number }> = [];
  let currentDate = '';
  let dayIncome = 0;
  let dayExpense = 0;
  for (const item of items) {
    const itemDate = item.itemDate.split(' ')[0];
    if (currentDate && itemDate !== currentDate) {
      runningBalance = runningBalance + dayIncome - dayExpense;
      dailyBalance.push({ date: currentDate, balance: runningBalance, income: dayIncome, expense: dayExpense });
      dayIncome = 0;
      dayExpense = 0;
    }
    currentDate = itemDate;
    if (item.itemType === 'income') { totalIncome += item.amount; dayIncome += item.amount; }
    else { totalExpense += item.amount; dayExpense += item.amount; }
  }
  if (currentDate) {
    runningBalance = runningBalance + dayIncome - dayExpense;
    dailyBalance.push({ date: currentDate, balance: runningBalance, income: dayIncome, expense: dayExpense });
  }
  return { totalIncome, totalExpense, netCashFlow: totalIncome - totalExpense, dailyBalance };
}

export async function listCashFlowForecasts(limit = 10, offset = 0) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(cashFlowForecasts).orderBy(desc(cashFlowForecasts.forecastDate)).limit(limit).offset(offset);
}


// ============================================================================
// FEED MANAGEMENT — FORMULATIONS
// ============================================================================

export async function createFeedFormulation(data: {
  name: string;
  feedRange: 'premium' | 'value' | 'econo';
  feedStage: 'starter' | 'grower' | 'finisher';
  version?: number;
  description?: string;
  ingredients: string;
  proteinPercentage?: string;
  energyContent?: string;
  crudeProtein?: string;
  crudeFiber?: string;
  calcium?: string;
  phosphorus?: string;
  macroKgPerTon?: string;
  soyaOilKgPerTon?: string;
  probioticKgPerTon?: string;
  allocationKgPerBird?: string;
  effectiveDate?: string;
  isActive?: number;
  createdBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const result = await db.insert(feedFormulations).values({
    name: data.name,
    feedRange: data.feedRange,
    feedStage: data.feedStage,
    version: data.version ?? 1,
    description: data.description,
    ingredients: data.ingredients,
    proteinPercentage: data.proteinPercentage,
    energyContent: data.energyContent,
    crudeProtein: data.crudeProtein,
    crudeFiber: data.crudeFiber,
    calcium: data.calcium,
    phosphorus: data.phosphorus,
    macroKgPerTon: data.macroKgPerTon,
    soyaOilKgPerTon: data.soyaOilKgPerTon,
    probioticKgPerTon: data.probioticKgPerTon,
    allocationKgPerBird: data.allocationKgPerBird,
    effectiveDate: data.effectiveDate,
    isActive: data.isActive ?? 1,
    createdBy: data.createdBy,
  });
  return Number((result as any)[0]?.insertId ?? (result as any).insertId ?? 0);
}

export async function deactivateFeedFormulation(id: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.update(feedFormulations).set({ isActive: 0 }).where(eq(feedFormulations.id, id));
}

// ============================================================================
// FEED MANAGEMENT — MILL COSTS
// ============================================================================

export async function listMillCosts(filters?: {
  feedRange?: 'premium' | 'value' | 'econo';
  feedType?: 'starter' | 'grower' | 'finisher';
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions: ReturnType<typeof eq>[] = [];
  if (filters?.feedRange) conditions.push(eq(millCosts.feedRange, filters.feedRange));
  if (filters?.feedType) conditions.push(eq(millCosts.feedType, filters.feedType));
  const query = db.select().from(millCosts).orderBy(desc(millCosts.effectiveDate));
  if (conditions.length > 0) {
    return await query.where(and(...conditions));
  }
  return await query;
}

export async function getMillCost(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(millCosts).where(eq(millCosts.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getEffectiveMillCost(input: {
  feedRange: 'premium' | 'value' | 'econo';
  feedType: 'starter' | 'grower' | 'finisher';
  asOfDate: string;
}) {
  const rows = await listMillCosts({ feedRange: input.feedRange, feedType: input.feedType });
  return selectEffectiveDatedRecord(rows, input.asOfDate);
}

export async function createMillCost(data: {
  feedRange: 'premium' | 'value' | 'econo';
  feedType: 'starter' | 'grower' | 'finisher';
  costPerTon: string;
  effectiveDate: string;
  notes?: string;
  createdBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const result = await db.insert(millCosts).values({
    feedRange: data.feedRange,
    feedType: data.feedType,
    costPerTon: data.costPerTon,
    effectiveDate: data.effectiveDate,
    notes: data.notes,
    createdBy: data.createdBy,
  });
  return Number((result as any)[0]?.insertId ?? (result as any).insertId ?? 0);
}

export async function updateMillCost(id: number, data: {
  costPerTon?: string;
  effectiveDate?: string;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const updateData: Record<string, unknown> = {};
  if (data.costPerTon !== undefined) updateData.costPerTon = data.costPerTon;
  if (data.effectiveDate !== undefined) updateData.effectiveDate = data.effectiveDate;
  if (data.notes !== undefined) updateData.notes = data.notes;
  await db.update(millCosts).set(updateData).where(eq(millCosts.id, id));
}

export async function deleteMillCost(id: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.delete(millCosts).where(eq(millCosts.id, id));
}

// ============================================================================
// FEED MANAGEMENT — CUSTOMER FEED PRICES
// ============================================================================

export async function listCustomerFeedPrices(filters?: {
  customerId?: number;
  feedRange?: 'premium' | 'value' | 'econo';
  feedType?: 'starter' | 'grower' | 'finisher';
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions: ReturnType<typeof eq>[] = [];
  if (filters?.customerId) conditions.push(eq(customerFeedPrices.customerId, filters.customerId));
  if (filters?.feedRange) conditions.push(eq(customerFeedPrices.feedRange, filters.feedRange));
  if (filters?.feedType) conditions.push(eq(customerFeedPrices.feedType, filters.feedType));
  // Join with customers to get customer name
  const query = db
    .select({
      id: customerFeedPrices.id,
      customerId: customerFeedPrices.customerId,
      customerName: customers.name,
      feedRange: customerFeedPrices.feedRange,
      feedType: customerFeedPrices.feedType,
      pricePerTon: customerFeedPrices.pricePerTon,
      effectiveDate: customerFeedPrices.effectiveDate,
      notes: customerFeedPrices.notes,
      createdAt: customerFeedPrices.createdAt,
    })
    .from(customerFeedPrices)
    .leftJoin(customers, eq(customerFeedPrices.customerId, customers.id))
    .orderBy(desc(customerFeedPrices.effectiveDate));
  if (conditions.length > 0) {
    return await query.where(and(...conditions));
  }
  return await query;
}

export async function getCustomerFeedPrice(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(customerFeedPrices).where(eq(customerFeedPrices.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getEffectiveCustomerFeedPrice(input: {
  customerId: number;
  feedRange: 'premium' | 'value' | 'econo';
  feedType: 'starter' | 'grower' | 'finisher';
  asOfDate: string;
}) {
  const rows = await listCustomerFeedPrices({
    customerId: input.customerId,
    feedRange: input.feedRange,
    feedType: input.feedType,
  });
  return selectEffectiveDatedRecord(rows, input.asOfDate);
}

export async function createCustomerFeedPrice(data: {
  customerId: number;
  feedRange: 'premium' | 'value' | 'econo';
  feedType: 'starter' | 'grower' | 'finisher';
  pricePerTon: string;
  effectiveDate: string;
  notes?: string;
  createdBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const result = await db.insert(customerFeedPrices).values({
    customerId: data.customerId,
    feedRange: data.feedRange,
    feedType: data.feedType,
    pricePerTon: data.pricePerTon,
    effectiveDate: data.effectiveDate,
    notes: data.notes,
    createdBy: data.createdBy,
  });
  return Number((result as any)[0]?.insertId ?? (result as any).insertId ?? 0);
}

export async function updateCustomerFeedPrice(id: number, data: {
  pricePerTon?: string;
  effectiveDate?: string;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const updateData: Record<string, unknown> = {};
  if (data.pricePerTon !== undefined) updateData.pricePerTon = data.pricePerTon;
  if (data.effectiveDate !== undefined) updateData.effectiveDate = data.effectiveDate;
  if (data.notes !== undefined) updateData.notes = data.notes;
  await db.update(customerFeedPrices).set(updateData).where(eq(customerFeedPrices.id, id));
}

export async function deleteCustomerFeedPrice(id: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.delete(customerFeedPrices).where(eq(customerFeedPrices.id, id));
}

// ============================================================================
// FEED ORDER PLANNING
// ============================================================================

function generateOrderNumber(prefix: string): string {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `${prefix}-${y}${m}${d}-${rand}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---- Feed Orders ----

export async function listFeedOrders(filters?: {
  customerId?: number;
  flockId?: number;
  status?: string;
  feedRange?: string;
  feedStage?: string;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters?.customerId) conditions.push(eq(feedOrders.customerId, filters.customerId));
  if (filters?.flockId) conditions.push(eq(feedOrders.flockId, filters.flockId));
  if (filters?.status) conditions.push(eq(feedOrders.status, filters.status as any));
  if (filters?.feedRange) conditions.push(eq(feedOrders.feedRange, filters.feedRange as any));
  if (filters?.feedStage) conditions.push(eq(feedOrders.feedStage, filters.feedStage as any));

  const rows = await db
    .select({
      order: feedOrders,
      customerName: customers.name,
      customerCompany: customers.companyName,
    })
    .from(feedOrders)
    .leftJoin(customers, eq(feedOrders.customerId, customers.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(feedOrders.createdAt));

  return rows;
}

export async function getFeedOrderById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select({
      order: feedOrders,
      customerName: customers.name,
      customerCompany: customers.companyName,
    })
    .from(feedOrders)
    .leftJoin(customers, eq(feedOrders.customerId, customers.id))
    .where(eq(feedOrders.id, id))
    .limit(1);

  if (rows.length === 0) return null;

  // Load deliveries
  const deliveries = await db
    .select()
    .from(feedOrderDeliveries)
    .where(eq(feedOrderDeliveries.feedOrderId, id))
    .orderBy(asc(feedOrderDeliveries.deliveryDate));

  // Load additive POs
  const additivePOs = await db
    .select({
      po: additivePurchaseOrders,
      supplierName: suppliers.name,
    })
    .from(additivePurchaseOrders)
    .leftJoin(suppliers, eq(additivePurchaseOrders.supplierId, suppliers.id))
    .where(eq(additivePurchaseOrders.feedOrderId, id))
    .orderBy(asc(additivePurchaseOrders.additiveType));

  return { ...rows[0], deliveries, additivePOs };
}

export async function createFeedOrder(data: {
  customerId: number;
  flockId?: number;
  feedRange: 'premium' | 'value' | 'econo';
  feedStage: 'starter' | 'grower' | 'finisher';
  formulationId?: number;
  quantityTons: string;
  birdCount?: number;
  allocationKgPerBird?: string;
  transportMode: 'afgro_delivers' | 'customer_collects';
  transportCostPerTon?: string;
  orderDate: string;
  requiredByDate: string;
  pricePerTon?: string;
  notes?: string;
  createdBy: number;
  // Additive inclusion rates from formulation (kg per ton)
  macroKgPerTon?: string;
  soyaOilKgPerTon?: string;
  probioticKgPerTon?: string;
  // Supplier IDs for additive POs
  macroSupplierId?: number;
  soyaOilSupplierId?: number;
  probioticSupplierId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const orderNumber = generateOrderNumber('FO');
  const qtyTons = parseFloat(data.quantityTons);

  // Calculate transport cost total
  const transportCostPerTon = parseFloat(data.transportCostPerTon || '0');
  const transportCostTotal = (transportCostPerTon * qtyTons).toFixed(2);

  // Lead time deadlines
  const macroOrderDeadline = addDays(data.orderDate, -14);
  const millProductionDeadline = addDays(data.orderDate, -7);
  const millInvoiceDueDate = addDays(data.orderDate, 14);

  const result = await db.insert(feedOrders).values({
    orderNumber,
    customerId: data.customerId,
    flockId: data.flockId,
    feedRange: data.feedRange,
    feedStage: data.feedStage,
    formulationId: data.formulationId,
    quantityTons: data.quantityTons,
    birdCount: data.birdCount,
    allocationKgPerBird: data.allocationKgPerBird,
    transportMode: data.transportMode,
    transportCostPerTon: data.transportCostPerTon || '0',
    transportCostTotal,
    orderDate: data.orderDate,
    requiredByDate: data.requiredByDate,
    macroOrderDeadline,
    millProductionDeadline,
    millInvoiceDueDate,
    pricePerTon: data.pricePerTon,
    notes: data.notes,
    createdBy: data.createdBy,
    status: 'draft',
  });

  const orderId = result[0].insertId;

  // Auto-generate additive purchase orders
  const additiveDefs: Array<{
    type: 'macro' | 'soya_oil' | 'probiotic';
    kgPerTon: number;
    leadDays: number;
    supplierId?: number;
    isCritical: number;
  }> = [
    {
      type: 'macro',
      kgPerTon: parseFloat(data.macroKgPerTon || '0'),
      leadDays: 14,
      supplierId: data.macroSupplierId,
      isCritical: 1,
    },
    {
      type: 'soya_oil',
      kgPerTon: parseFloat(data.soyaOilKgPerTon || '0'),
      leadDays: 7,
      supplierId: data.soyaOilSupplierId,
      isCritical: 0,
    },
    {
      type: 'probiotic',
      kgPerTon: parseFloat(data.probioticKgPerTon || '0'),
      leadDays: 7,
      supplierId: data.probioticSupplierId,
      isCritical: 0,
    },
  ];

  for (const additive of additiveDefs) {
    if (additive.kgPerTon <= 0) continue;
    const quantityKg = (additive.kgPerTon * qtyTons).toFixed(3);
    const orderDeadlineDate = addDays(data.orderDate, -additive.leadDays);
    const poNumber = generateOrderNumber(`APO-${additive.type.toUpperCase().slice(0, 3)}`);

    await db.insert(additivePurchaseOrders).values({
      poNumber,
      feedOrderId: orderId,
      supplierId: additive.supplierId,
      additiveType: additive.type,
      quantityKg,
      leadTimeDays: additive.leadDays,
      orderDeadlineDate,
      isCriticalPath: additive.isCritical,
      status: 'pending',
      createdBy: data.createdBy,
    });
  }

  return orderId;
}

export async function updateFeedOrderStatus(
  id: number,
  status: 'draft' | 'submitted_to_mill' | 'in_production' | 'ready_for_collection' | 'partially_delivered' | 'delivered' | 'invoiced' | 'cancelled'
) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.update(feedOrders).set({ status }).where(eq(feedOrders.id, id));
}

export async function updateFeedOrderMillInvoice(id: number, data: {
  millInvoiceNumber: string;
  millInvoiceDate: string;
  millInvoiceAmountExcl: string;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const dueDate = addDays(data.millInvoiceDate, 14);
  await db.update(feedOrders).set({
    millInvoiceNumber: data.millInvoiceNumber,
    millInvoiceDate: data.millInvoiceDate,
    millInvoiceAmountExcl: data.millInvoiceAmountExcl,
    millInvoiceDueDate: dueDate,
    status: 'in_production',
  }).where(eq(feedOrders.id, id));
}

export async function markMillInvoicePaid(id: number, paidDate: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.update(feedOrders).set({ millInvoicePaid: 1, millInvoicePaidDate: paidDate }).where(eq(feedOrders.id, id));
}

// ---- Feed Order Deliveries ----

export async function createFeedOrderDelivery(data: {
  feedOrderId: number;
  deliveryDate: string;
  quantityTons: string;
  driverName?: string;
  vehicleReg?: string;
  deliveryNoteNumber?: string;
  receivedBy?: string;
  notes?: string;
  createdBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const deliveryNumber = generateOrderNumber('DEL');

  const result = await db.insert(feedOrderDeliveries).values({
    feedOrderId: data.feedOrderId,
    deliveryNumber,
    deliveryDate: data.deliveryDate,
    quantityTons: data.quantityTons,
    driverName: data.driverName,
    vehicleReg: data.vehicleReg,
    deliveryNoteNumber: data.deliveryNoteNumber,
    receivedBy: data.receivedBy,
    notes: data.notes,
    status: 'scheduled',
    createdBy: data.createdBy,
  });

  // Update parent order status to partially_delivered if not all delivered
  const order = await db.select().from(feedOrders).where(eq(feedOrders.id, data.feedOrderId)).limit(1);
  if (order.length > 0 && order[0].status !== 'delivered') {
    const allDeliveries = await db.select().from(feedOrderDeliveries).where(eq(feedOrderDeliveries.feedOrderId, data.feedOrderId));
    const totalDelivered = allDeliveries.reduce((sum, d) => sum + parseFloat(d.quantityTons), 0);
    const ordered = parseFloat(order[0].quantityTons);
    const newStatus = totalDelivered >= ordered ? 'delivered' : 'partially_delivered';
    await db.update(feedOrders).set({ status: newStatus as any }).where(eq(feedOrders.id, data.feedOrderId));
  }

  return result[0].insertId;
}

export async function listFeedOrderDeliveries(feedOrderId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(feedOrderDeliveries)
    .where(eq(feedOrderDeliveries.feedOrderId, feedOrderId))
    .orderBy(asc(feedOrderDeliveries.deliveryDate));
}

export async function updateDeliveryStatus(
  id: number,
  status: 'scheduled' | 'in_transit' | 'delivered' | 'invoiced',
  customerInvoiceId?: number
) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const updateData: any = { status };
  if (customerInvoiceId) updateData.customerInvoiceId = customerInvoiceId;
  await db.update(feedOrderDeliveries).set(updateData).where(eq(feedOrderDeliveries.id, id));
}

// ---- Additive Purchase Orders ----

export async function listAdditivePOs(filters?: {
  feedOrderId?: number;
  status?: string;
  additiveType?: string;
  overdueOnly?: boolean;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters?.feedOrderId) conditions.push(eq(additivePurchaseOrders.feedOrderId, filters.feedOrderId));
  if (filters?.status) conditions.push(eq(additivePurchaseOrders.status, filters.status as any));
  if (filters?.additiveType) conditions.push(eq(additivePurchaseOrders.additiveType, filters.additiveType as any));
  if (filters?.overdueOnly) {
    const today = new Date().toISOString().slice(0, 10);
    conditions.push(lte(additivePurchaseOrders.orderDeadlineDate, today));
    conditions.push(eq(additivePurchaseOrders.status, 'pending'));
  }

  return await db
    .select({
      po: additivePurchaseOrders,
      supplierName: suppliers.name,
      orderNumber: feedOrders.orderNumber,
      feedRange: feedOrders.feedRange,
      feedStage: feedOrders.feedStage,
    })
    .from(additivePurchaseOrders)
    .leftJoin(suppliers, eq(additivePurchaseOrders.supplierId, suppliers.id))
    .leftJoin(feedOrders, eq(additivePurchaseOrders.feedOrderId, feedOrders.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(additivePurchaseOrders.orderDeadlineDate));
}

export async function updateAdditivePO(id: number, data: {
  status?: 'pending' | 'ordered' | 'confirmed' | 'delivered' | 'cancelled';
  supplierId?: number;
  unitPricePerKg?: string;
  totalAmountExcl?: string;
  vatAmount?: string;
  totalAmountIncl?: string;
  orderPlacedDate?: string;
  expectedDeliveryDate?: string;
  actualDeliveryDate?: string;
  supplierInvoiceNumber?: string;
  supplierInvoiceDate?: string;
  supplierInvoicePaid?: number;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.update(additivePurchaseOrders).set(data as any).where(eq(additivePurchaseOrders.id, id));
}

// ---- Feed Order Alerts (for dashboard) ----

export async function getFeedOrderAlerts() {
  const db = await getDb();
  if (!db) return [];

  const today = new Date().toISOString().slice(0, 10);
  const alertWindow = addDays(today, 14); // look 14 days ahead

  // Active flocks approaching feed stage transitions
  const activeFlocks = await db
    .select()
    .from(flocks)
    .where(and(
      eq(flocks.status, 'active'),
    ));

  const alerts: Array<{
    type: 'feed_stage_transition' | 'additive_po_overdue' | 'additive_po_due_soon' | 'mill_invoice_due';
    severity: 'critical' | 'warning' | 'info';
    flockId?: number;
    flockNumber?: string;
    message: string;
    dueDate?: string;
    feedOrderId?: number;
    additivePOId?: number;
  }> = [];

  for (const flock of activeFlocks) {
    if (!flock.placementDate) continue;
    const placedDate = new Date(flock.placementDate);
    const todayDate = new Date(today);
    const currentDay = Math.floor((todayDate.getTime() - placedDate.getTime()) / (1000 * 60 * 60 * 24));

    // Check if approaching grower stage (need to order grower feed)
    if (flock.growerFromDay !== null && flock.growerFromDay !== undefined) {
      const daysUntilGrower = flock.growerFromDay - currentDay;
      if (daysUntilGrower > 0 && daysUntilGrower <= 14) {
        const severity = daysUntilGrower <= 7 ? 'critical' : 'warning';
        alerts.push({
          type: 'feed_stage_transition',
          severity,
          flockId: flock.id,
          flockNumber: flock.flockNumber,
          message: `Flock ${flock.flockNumber}: Grower feed needed in ${daysUntilGrower} day(s) (Day ${flock.growerFromDay}). Order grower feed now.`,
          dueDate: addDays(today, daysUntilGrower),
        });
      }
    }

    // Check if approaching finisher stage
    if (flock.finisherFromDay !== null && flock.finisherFromDay !== undefined) {
      const daysUntilFinisher = flock.finisherFromDay - currentDay;
      if (daysUntilFinisher > 0 && daysUntilFinisher <= 14) {
        const severity = daysUntilFinisher <= 7 ? 'critical' : 'warning';
        alerts.push({
          type: 'feed_stage_transition',
          severity,
          flockId: flock.id,
          flockNumber: flock.flockNumber,
          message: `Flock ${flock.flockNumber}: Finisher feed needed in ${daysUntilFinisher} day(s) (Day ${flock.finisherFromDay}). Order finisher feed now.`,
          dueDate: addDays(today, daysUntilFinisher),
        });
      }
    }
  }

  // Overdue additive POs
  const overduePOs = await db
    .select({
      po: additivePurchaseOrders,
      orderNumber: feedOrders.orderNumber,
    })
    .from(additivePurchaseOrders)
    .leftJoin(feedOrders, eq(additivePurchaseOrders.feedOrderId, feedOrders.id))
    .where(and(
      eq(additivePurchaseOrders.status, 'pending'),
      lte(additivePurchaseOrders.orderDeadlineDate, today),
    ));

  for (const { po, orderNumber } of overduePOs) {
    alerts.push({
      type: 'additive_po_overdue',
      severity: 'critical',
      message: `OVERDUE: ${po.additiveType.toUpperCase()} additive PO for order ${orderNumber} was due ${po.orderDeadlineDate}. Place order immediately.`,
      dueDate: po.orderDeadlineDate,
      feedOrderId: po.feedOrderId,
      additivePOId: po.id,
    });
  }

  // Additive POs due within 3 days
  const dueSoonDate = addDays(today, 3);
  const dueSoonPOs = await db
    .select({
      po: additivePurchaseOrders,
      orderNumber: feedOrders.orderNumber,
    })
    .from(additivePurchaseOrders)
    .leftJoin(feedOrders, eq(additivePurchaseOrders.feedOrderId, feedOrders.id))
    .where(and(
      eq(additivePurchaseOrders.status, 'pending'),
      gte(additivePurchaseOrders.orderDeadlineDate, today),
      lte(additivePurchaseOrders.orderDeadlineDate, dueSoonDate),
    ));

  for (const { po, orderNumber } of dueSoonPOs) {
    alerts.push({
      type: 'additive_po_due_soon',
      severity: 'warning',
      message: `${po.additiveType.toUpperCase()} additive PO for order ${orderNumber} must be placed by ${po.orderDeadlineDate}.`,
      dueDate: po.orderDeadlineDate,
      feedOrderId: po.feedOrderId,
      additivePOId: po.id,
    });
  }

  // Mill invoices due within 3 days
  const dueSoonMillInvoices = await db
    .select()
    .from(feedOrders)
    .where(and(
      eq(feedOrders.millInvoicePaid, 0),
      isNotNull(feedOrders.millInvoiceDueDate),
      lte(feedOrders.millInvoiceDueDate, dueSoonDate),
      gte(feedOrders.millInvoiceDueDate, today),
    ));

  for (const order of dueSoonMillInvoices) {
    alerts.push({
      type: 'mill_invoice_due',
      severity: 'warning',
      message: `Mill invoice ${order.millInvoiceNumber} for order ${order.orderNumber} is due on ${order.millInvoiceDueDate}.`,
      dueDate: order.millInvoiceDueDate ?? undefined,
      feedOrderId: order.id,
    });
  }

  // Sort: critical first, then by dueDate
  alerts.sort((a, b) => {
    if (a.severity === 'critical' && b.severity !== 'critical') return -1;
    if (a.severity !== 'critical' && b.severity === 'critical') return 1;
    return (a.dueDate || '').localeCompare(b.dueDate || '');
  });

  return alerts;
}

// ============================================================================
// ADDITIVE INVENTORY MAPPINGS
// ============================================================================

export async function getAdditiveMappings() {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select({
      id: additiveInventoryMappings.id,
      additiveType: additiveInventoryMappings.additiveType,
      inventoryItemId: additiveInventoryMappings.inventoryItemId,
      notes: additiveInventoryMappings.notes,
      updatedAt: additiveInventoryMappings.updatedAt,
      itemName: inventoryItems.name,
      itemNumber: inventoryItems.itemNumber,
      unit: inventoryItems.unit,
      currentStock: inventoryItems.currentStock,
    })
    .from(additiveInventoryMappings)
    .leftJoin(inventoryItems, eq(additiveInventoryMappings.inventoryItemId, inventoryItems.id));
}

export async function setAdditiveMapping(
  additiveType: 'macro' | 'soya_oil' | 'probiotic',
  inventoryItemId: number,
  notes: string | undefined,
  updatedBy: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Upsert: if mapping exists for this additiveType, update it; otherwise insert
  const existing = await db
    .select({ id: additiveInventoryMappings.id })
    .from(additiveInventoryMappings)
    .where(eq(additiveInventoryMappings.additiveType, additiveType))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(additiveInventoryMappings)
      .set({ inventoryItemId, notes, updatedBy })
      .where(eq(additiveInventoryMappings.additiveType, additiveType));
  } else {
    await db.insert(additiveInventoryMappings).values({
      additiveType,
      inventoryItemId,
      notes,
      updatedBy,
    });
  }
  return true;
}

/** Returns available stock (on-hand across all locations) for a given inventory item */
export async function getInventoryItemStock(inventoryItemId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ qty: inventoryStock.quantity })
    .from(inventoryStock)
    .where(eq(inventoryStock.itemId, inventoryItemId));
  return rows.reduce((sum, r) => sum + parseFloat(r.qty ?? '0'), 0);
}

/**
 * Check additive stock for a feed order before creation.
 * Returns for each additive: required kg, on-hand kg, reserved kg (pending orders),
 * available kg, shortfall kg, and whether a PO will be needed.
 */
export async function checkAdditiveStockForOrder(params: {
  macroKgPerTon?: number;
  soyaOilKgPerTon?: number;
  probioticKgPerTon?: number;
  quantityTons: number;
}) {
  const db = await getDb();
  if (!db) return null;

  const mappings = await getAdditiveMappings();
  const mappingByType = Object.fromEntries(mappings.map(m => [m.additiveType, m]));

  const results: Record<string, {
    additiveType: string;
    inventoryItemId: number | null;
    itemName: string | null;
    unit: string | null;
    requiredKg: number;
    onHandKg: number;
    reservedKg: number;
    availableKg: number;
    shortfallKg: number;
    willGeneratePO: boolean;
    poQuantityKg: number;
  }> = {};

  const additives = [
    { type: 'macro', kgPerTon: params.macroKgPerTon ?? 0 },
    { type: 'soya_oil', kgPerTon: params.soyaOilKgPerTon ?? 0 },
    { type: 'probiotic', kgPerTon: params.probioticKgPerTon ?? 0 },
  ] as const;

  for (const additive of additives) {
    const requiredKg = additive.kgPerTon * params.quantityTons;
    const mapping = mappingByType[additive.type];

    if (!mapping || !mapping.inventoryItemId) {
      results[additive.type] = {
        additiveType: additive.type,
        inventoryItemId: null,
        itemName: null,
        unit: null,
        requiredKg,
        onHandKg: 0,
        reservedKg: 0,
        availableKg: 0,
        shortfallKg: requiredKg,
        willGeneratePO: requiredKg > 0,
        poQuantityKg: requiredKg,
      };
      continue;
    }

    // Sum all stock across locations
    const stockRows = await db
      .select({ qty: inventoryStock.quantity })
      .from(inventoryStock)
      .where(eq(inventoryStock.itemId, mapping.inventoryItemId));
    const onHandKg = stockRows.reduce((sum, r) => sum + parseFloat(r.qty ?? '0'), 0);

    // Sum reserved stock from pending/ordered additive POs for this item
    const reservedRows = await db
      .select({ qty: additivePurchaseOrders.quantityKg })
      .from(additivePurchaseOrders)
      .where(
        and(
          eq(additivePurchaseOrders.additiveType, additive.type),
          // Only count POs that haven't been delivered/cancelled
          inArray(additivePurchaseOrders.status, ['pending', 'ordered', 'confirmed'])
        )
      );
    // Reserved = stock already committed to existing pending orders
    // We track this via inventory_transactions with referenceType='feed_order'
    const reservedTxRows = await db
      .select({ qty: inventoryTransactions.quantity })
      .from(inventoryTransactions)
      .where(
        and(
          eq(inventoryTransactions.itemId, mapping.inventoryItemId),
          eq(inventoryTransactions.transactionType, 'issue'),
          eq(inventoryTransactions.referenceType, 'feed_order')
        )
      );
    const reservedKg = reservedTxRows.reduce((sum, r) => sum + Math.abs(parseFloat(r.qty ?? '0')), 0);
    const availableKg = Math.max(0, onHandKg - reservedKg);
    const shortfallKg = Math.max(0, requiredKg - availableKg);

    results[additive.type] = {
      additiveType: additive.type,
      inventoryItemId: mapping.inventoryItemId,
      itemName: mapping.itemName ?? null,
      unit: mapping.unit ?? null,
      requiredKg,
      onHandKg,
      reservedKg,
      availableKg,
      shortfallKg,
      willGeneratePO: shortfallKg > 0,
      poQuantityKg: shortfallKg,
    };
  }

  return results;
}

/**
 * Reserve available additive stock against a feed order.
 * Creates inventory 'issue' transactions for the available quantity (up to required).
 * Returns the quantity actually reserved for each additive.
 */
export async function reserveAdditiveStock(params: {
  feedOrderId: number;
  feedOrderNumber: string;
  macroKgPerTon?: number;
  soyaOilKgPerTon?: number;
  probioticKgPerTon?: number;
  quantityTons: number;
  createdBy: number;
}) {
  const db = await getDb();
  if (!db) return;

  const mappings = await getAdditiveMappings();
  const mappingByType = Object.fromEntries(mappings.map(m => [m.additiveType, m]));

  const additives = [
    { type: 'macro' as const, kgPerTon: params.macroKgPerTon ?? 0 },
    { type: 'soya_oil' as const, kgPerTon: params.soyaOilKgPerTon ?? 0 },
    { type: 'probiotic' as const, kgPerTon: params.probioticKgPerTon ?? 0 },
  ];

  for (const additive of additives) {
    const requiredKg = additive.kgPerTon * params.quantityTons;
    if (requiredKg <= 0) continue;

    const mapping = mappingByType[additive.type];
    if (!mapping || !mapping.inventoryItemId) continue;

    // Get available stock
    const stockRows = await db
      .select({ id: inventoryStock.id, locationId: inventoryStock.locationId, qty: inventoryStock.quantity })
      .from(inventoryStock)
      .where(and(eq(inventoryStock.itemId, mapping.inventoryItemId), sql`${inventoryStock.quantity} > 0`));

    let remaining = requiredKg;
    for (const stockRow of stockRows) {
      if (remaining <= 0) break;
      const available = parseFloat(stockRow.qty ?? '0');
      const toReserve = Math.min(remaining, available);
      if (toReserve <= 0) continue;

      // Create issue transaction to reserve stock
      await db.insert(inventoryTransactions).values({
        itemId: mapping.inventoryItemId,
        locationId: stockRow.locationId,
        transactionType: 'issue',
        quantity: String(-toReserve), // negative = stock leaving
        referenceType: 'feed_order',
        referenceId: params.feedOrderId,
        notes: `Reserved for feed order ${params.feedOrderNumber}`,
        transactionDate: new Date().toISOString().slice(0, 19).replace('T', ' '),
        createdBy: params.createdBy,
      });

      // Reduce stock level
      await db
        .update(inventoryStock)
        .set({ quantity: String(available - toReserve) })
        .where(eq(inventoryStock.id, stockRow.id));

      // Update currentStock on inventory item
      await db
        .update(inventoryItems)
        .set({ currentStock: sql`${inventoryItems.currentStock} - ${toReserve}` })
        .where(eq(inventoryItems.id, mapping.inventoryItemId));

      remaining -= toReserve;
    }
  }
}

// ============================================================================
// MILL INVOICES
// ============================================================================

export async function listMillInvoices(filters?: {
  status?: string;
  feedOrderId?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters?.status) conditions.push(eq(millInvoices.status, filters.status as any));
  if (filters?.feedOrderId) conditions.push(eq(millInvoices.feedOrderId, filters.feedOrderId));

  const rows = await db
	  .select({
	    id: millInvoices.id,
	    feedOrderId: millInvoices.feedOrderId,
			supplierId: millInvoices.supplierId,
      invoiceNumber: millInvoices.invoiceNumber,
      invoiceDate: millInvoices.invoiceDate,
      dueDate: millInvoices.dueDate,
      amountExcl: millInvoices.amountExcl,
      vatAmount: millInvoices.vatAmount,
      amountIncl: millInvoices.amountIncl,
      status: millInvoices.status,
	    paidDate: millInvoices.paidDate,
	    paidAmount: millInvoices.paidAmount,
			balanceDue: millInvoices.balanceDue,
      paymentReference: millInvoices.paymentReference,
      notes: millInvoices.notes,
      createdAt: millInvoices.createdAt,
      // Join feed order for context
      orderNumber: feedOrders.orderNumber,
      feedRange: feedOrders.feedRange,
      feedStage: feedOrders.feedStage,
	    quantityTons: feedOrders.quantityTons,
	    customerName: customers.name,
			supplierName: suppliers.name,
	  })
	  .from(millInvoices)
	  .leftJoin(feedOrders, eq(millInvoices.feedOrderId, feedOrders.id))
	  .leftJoin(customers, eq(feedOrders.customerId, customers.id))
		.leftJoin(suppliers, eq(millInvoices.supplierId, suppliers.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(millInvoices.invoiceDate));

  return rows;
}

export async function getMillInvoiceById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const rows = await db
    .select()
    .from(millInvoices)
    .where(eq(millInvoices.id, id))
    .limit(1);

  return rows[0] ?? undefined;
}

function millInvoiceEntryDate(invoiceDate: string) {
  const date = invoiceDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Supplier invoice date must use YYYY-MM-DD format.");
  return `${date} 12:00:00`;
}

export async function postMillInvoiceToPayables(millInvoiceId: number, createdBy: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
	const invoice = await getMillInvoiceById(millInvoiceId);
	if (!invoice) throw new Error("Mill invoice not found.");
	if (invoice.status === "disputed") throw new Error("A disputed mill invoice cannot be posted to Trade Payables.");
	await assertFinancialDateOpen(millInvoiceEntryDate(invoice.invoiceDate));

  const requiredAccountNumbers = [
    SUPPLIER_PAYABLE_POSTING_ACCOUNTS.feedAndProductionInventory,
    SUPPLIER_PAYABLE_POSTING_ACCOUNTS.vatInput,
    SUPPLIER_PAYABLE_POSTING_ACCOUNTS.tradePayables,
  ];
  const accounts = await db.select({ id: chartOfAccounts.id, accountNumber: chartOfAccounts.accountNumber, isActive: chartOfAccounts.isActive, isPostingAccount: chartOfAccounts.isPostingAccount })
    .from(chartOfAccounts).where(inArray(chartOfAccounts.accountNumber, requiredAccountNumbers));
  const accountsByNumber = new Map(accounts.map((account) => [account.accountNumber, account]));
  for (const accountNumber of requiredAccountNumbers) {
    const account = accountsByNumber.get(accountNumber);
    if (!account || !account.isActive || !account.isPostingAccount) throw new Error(`Required posting account ${accountNumber} is missing, inactive, or not postable. Seed or correct the chart of accounts before posting this supplier invoice.`);
  }

  const sourceDescription = `Supplier mill invoice ${invoice.invoiceNumber}`;
  const journalLines = buildSupplierInvoicePosting({
    invoiceNumber: invoice.invoiceNumber,
    amountExcl: invoice.amountExcl,
    vatAmount: invoice.vatAmount,
    amountIncl: invoice.amountIncl,
    accountIds: {
      inventory: accountsByNumber.get(SUPPLIER_PAYABLE_POSTING_ACCOUNTS.feedAndProductionInventory)!.id,
      vatInput: accountsByNumber.get(SUPPLIER_PAYABLE_POSTING_ACCOUNTS.vatInput)!.id,
      tradePayables: accountsByNumber.get(SUPPLIER_PAYABLE_POSTING_ACCOUNTS.tradePayables)!.id,
    },
  });
  const validation = validateBalancedJournal(journalLines);
  if (!validation.ok) throw new Error(validation.error);

  return await (db as any).transaction(async (tx: any) => {
    const existing = await tx.select({ journalEntryId: accountingSourcePostings.journalEntryId, journalNumber: journalEntries.journalNumber })
      .from(accountingSourcePostings)
      .innerJoin(journalEntries, eq(accountingSourcePostings.journalEntryId, journalEntries.id))
      .where(and(eq(accountingSourcePostings.sourceType, "supplier_mill_invoice"), eq(accountingSourcePostings.sourceId, millInvoiceId)))
      .limit(1);
    if (existing[0]) return { id: existing[0].journalEntryId, journalNumber: existing[0].journalNumber, alreadyPosted: true };

    const entryDate = millInvoiceEntryDate(invoice.invoiceDate);
    const journalNumber = getSupplierInvoiceJournalNumber(millInvoiceId);
    const createdJournal = await tx.insert(journalEntries).values({ journalNumber, entryDate, description: sourceDescription, sourceType: "supplier_mill_invoice", sourceId: millInvoiceId, totalDebit: validation.totalDebit, totalCredit: validation.totalCredit, createdBy });
    const journalEntryId = Number(createdJournal[0]?.insertId ?? createdJournal.insertId ?? 0);
    if (!journalEntryId) throw new Error("Supplier invoice journal header could not be created.");
    await tx.insert(generalLedgerEntries).values(journalLines.map((line) => ({ entryNumber: journalNumber, entryDate, journalEntryId, accountId: line.accountId, debit: line.debit, credit: line.credit, description: line.description || sourceDescription, referenceType: "supplier_mill_invoice", referenceId: millInvoiceId, createdBy })));
    await tx.insert(accountingSourcePostings).values({ sourceType: "supplier_mill_invoice", sourceId: millInvoiceId, journalEntryId, createdBy });
    return { id: journalEntryId, journalNumber, alreadyPosted: false };
  });
}

export async function createMillInvoice(data: {
  feedOrderId: number;
  supplierId?: number;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amountExcl: number;
  vatAmount?: number;
  amountIncl: number;
  notes?: string;
  createdBy?: number;
}) {
	const db = await getDb();
	if (!db) throw new Error("Database not available");
	if (!data.createdBy) throw new Error("An authenticated user is required to post a supplier invoice.");
	await assertFinancialDateOpen(millInvoiceEntryDate(data.invoiceDate));

  const created = await db.insert(millInvoices).values({
    feedOrderId: data.feedOrderId,
    supplierId: data.supplierId,
    invoiceNumber: data.invoiceNumber,
    invoiceDate: data.invoiceDate,
    dueDate: data.dueDate,
    amountExcl: String(data.amountExcl),
    vatAmount: String(data.vatAmount ?? 0),
    amountIncl: String(data.amountIncl),
    balanceDue: String(data.amountIncl),
    status: 'outstanding',
    notes: data.notes,
    createdBy: data.createdBy,
  });
  const millInvoiceId = Number((created as any)[0]?.insertId ?? (created as any).insertId ?? 0);
  if (!millInvoiceId) throw new Error("Mill invoice could not be created.");

  const posting = await postMillInvoiceToPayables(millInvoiceId, data.createdBy);
  await db.update(feedOrders).set({
    millInvoiceNumber: data.invoiceNumber,
    millInvoiceDate: data.invoiceDate,
    millInvoiceAmountExcl: String(data.amountExcl),
    millInvoiceDueDate: data.dueDate,
    millInvoicePaid: 0,
  }).where(eq(feedOrders.id, data.feedOrderId));

  return { id: millInvoiceId, journalNumber: posting.journalNumber, alreadyPosted: posting.alreadyPosted };
}

export async function recordMillInvoicePayment(id: number, data: {
  paidDate: string;
  paidAmount: number | string;
  paymentMethod: string;
  paymentReference?: string;
  idempotencyKey: string;
  createdBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!data.idempotencyKey.trim()) throw new Error("A supplier payment request key is required.");

	const invoice = await getMillInvoiceById(id);
	if (!invoice) throw new Error("Mill invoice not found.");
	await assertFinancialDateOpen(data.paidDate);
	if (!await getMillInvoicePosting(id)) throw new Error("The supplier invoice must be posted to Trade Payables before recording a payment.");
  const { payment } = validateSupplierPaymentAgainstBalance({ amount: data.paidAmount, balanceDue: invoice.balanceDue });
  const requiredAccountNumbers = [SUPPLIER_PAYABLE_POSTING_ACCOUNTS.bank, SUPPLIER_PAYABLE_POSTING_ACCOUNTS.tradePayables];
  const accounts = await db.select({ id: chartOfAccounts.id, accountNumber: chartOfAccounts.accountNumber, isActive: chartOfAccounts.isActive, isPostingAccount: chartOfAccounts.isPostingAccount })
    .from(chartOfAccounts).where(inArray(chartOfAccounts.accountNumber, requiredAccountNumbers));
  const accountsByNumber = new Map(accounts.map((account) => [account.accountNumber, account]));
  for (const accountNumber of requiredAccountNumbers) {
    const account = accountsByNumber.get(accountNumber);
    if (!account || !account.isActive || !account.isPostingAccount) throw new Error(`Required posting account ${accountNumber} is missing, inactive, or not postable. Seed or correct the chart of accounts before recording this supplier payment.`);
  }
  const journalLines = buildSupplierPaymentPosting({
    invoiceNumber: invoice.invoiceNumber,
    amount: payment.normalized,
    accountIds: {
      bank: accountsByNumber.get(SUPPLIER_PAYABLE_POSTING_ACCOUNTS.bank)!.id,
      tradePayables: accountsByNumber.get(SUPPLIER_PAYABLE_POSTING_ACCOUNTS.tradePayables)!.id,
    },
  });
  const validation = validateBalancedJournal(journalLines);
  if (!validation.ok) throw new Error(validation.error);

  return await (db as any).transaction(async (tx: any) => {
    const retry = await tx.select({ paymentId: supplierInvoicePayments.id, millInvoiceId: supplierInvoicePayments.millInvoiceId, journalNumber: journalEntries.journalNumber })
      .from(supplierInvoicePayments)
      .leftJoin(accountingSourcePostings, and(eq(accountingSourcePostings.sourceType, "supplier_mill_invoice_payment"), eq(accountingSourcePostings.sourceId, supplierInvoicePayments.id)))
      .leftJoin(journalEntries, eq(accountingSourcePostings.journalEntryId, journalEntries.id))
      .where(eq(supplierInvoicePayments.idempotencyKey, data.idempotencyKey.trim())).limit(1);
    if (retry[0]) {
      if (retry[0].millInvoiceId !== id) throw new Error("This supplier payment request key belongs to a different mill invoice.");
      return { success: true, paymentId: retry[0].paymentId, journalNumber: retry[0].journalNumber, alreadyPosted: true };
    }

    const updated = await tx.update(millInvoices).set({
      paidAmount: sql`CAST(COALESCE(${millInvoices.paidAmount}, 0.00) + ${payment.normalized} AS DECIMAL(12,2))`,
      balanceDue: sql`GREATEST(CAST(${millInvoices.balanceDue} AS DECIMAL(12,2)) - CAST(${payment.normalized} AS DECIMAL(12,2)), 0.00)`,
      status: sql`CASE WHEN CAST(${millInvoices.balanceDue} AS DECIMAL(12,2)) <= CAST(${payment.normalized} AS DECIMAL(12,2)) THEN 'paid' ELSE 'partial' END`,
      paidDate: data.paidDate,
      paymentReference: data.paymentReference?.trim() || null,
    }).where(and(eq(millInvoices.id, id), sql`${millInvoices.balanceDue} >= ${payment.normalized}`));
    const rowsAffected = Number((updated as any).rowsAffected ?? (updated as any)[0]?.affectedRows ?? 0);
    if (rowsAffected !== 1) throw new Error("Payment amount cannot exceed the current outstanding supplier invoice balance.");

    const paymentDate = `${data.paidDate.slice(0, 10)} 12:00:00`;
    const createdPayment = await tx.insert(supplierInvoicePayments).values({
      millInvoiceId: id,
      amount: payment.normalized,
      paymentMethod: data.paymentMethod,
      paymentDate,
      paymentReference: data.paymentReference?.trim() || null,
      idempotencyKey: data.idempotencyKey.trim(),
      createdBy: data.createdBy,
    });
    const paymentId = Number(createdPayment[0]?.insertId ?? createdPayment.insertId ?? 0);
    if (!paymentId) throw new Error("Supplier payment receipt could not be created.");
    const journalNumber = getSupplierPaymentJournalNumber(paymentId);
    const sourceDescription = `Supplier payment for ${invoice.invoiceNumber}`;
    const createdJournal = await tx.insert(journalEntries).values({ journalNumber, entryDate: paymentDate, description: sourceDescription, sourceType: "supplier_mill_invoice_payment", sourceId: paymentId, totalDebit: validation.totalDebit, totalCredit: validation.totalCredit, createdBy: data.createdBy });
    const journalEntryId = Number(createdJournal[0]?.insertId ?? createdJournal.insertId ?? 0);
    if (!journalEntryId) throw new Error("Supplier payment journal header could not be created.");
    await tx.insert(generalLedgerEntries).values(journalLines.map((line) => ({ entryNumber: journalNumber, entryDate: paymentDate, journalEntryId, accountId: line.accountId, debit: line.debit, credit: line.credit, description: line.description || sourceDescription, referenceType: "supplier_mill_invoice_payment", referenceId: paymentId, createdBy: data.createdBy })));
    await tx.insert(accountingSourcePostings).values({ sourceType: "supplier_mill_invoice_payment", sourceId: paymentId, journalEntryId, createdBy: data.createdBy });
    const updatedInvoice = (await tx.select({ status: millInvoices.status }).from(millInvoices).where(eq(millInvoices.id, id)).limit(1))[0];
    await tx.update(feedOrders).set({ millInvoicePaid: updatedInvoice?.status === "paid" ? 1 : 0, millInvoicePaidDate: updatedInvoice?.status === "paid" ? data.paidDate : null }).where(eq(feedOrders.id, invoice.feedOrderId));
    return { success: true, paymentId, journalNumber, alreadyPosted: false };
  });
}

export async function getMillInvoiceAgingSummary() {
  const db = await getDb();
  if (!db) return { outstanding: 0, overdue: 0, paid: 0, totalOutstandingAmount: 0, totalOverdueAmount: 0 };

  const today = new Date().toISOString().slice(0, 10);

  const rows = await db
    .select({
      status: millInvoices.status,
      dueDate: millInvoices.dueDate,
      amountIncl: millInvoices.amountIncl,
    })
    .from(millInvoices);

  let outstanding = 0, overdue = 0, paid = 0;
  let totalOutstandingAmount = 0, totalOverdueAmount = 0;

  for (const row of rows) {
    const amount = parseFloat(String(row.amountIncl) || '0');
    if (row.status === 'paid') {
      paid++;
    } else if (row.dueDate && row.dueDate < today) {
      overdue++;
      totalOverdueAmount += amount;
    } else {
      outstanding++;
      totalOutstandingAmount += amount;
    }
  }

  return { outstanding, overdue, paid, totalOutstandingAmount, totalOverdueAmount };
}

// ============================================================================
// FEED DELIVERY INVOICES (customer invoices linked to feed_order_deliveries)
// ============================================================================

export async function createFeedDeliveryInvoice(data: {
  customerId: number;
  deliveryId?: number;
  feedOrderId: number;
  invoiceDate: string;
  dueDate: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    discountPercent?: number;
    vatPercent?: number;
  }>;
  notes?: string;
  createdBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const invoiceNumber = `FEED-${Date.now()}`;
  const vatPct = 15;

  let exclusiveTotal = 0;
  let vatAmount = 0;

  for (const item of data.lineItems) {
    const subtotal = item.quantity * item.unitPrice;
    const discount = subtotal * ((item.discountPercent ?? 0) / 100);
    const excl = subtotal - discount;
    const vat = excl * ((item.vatPercent ?? vatPct) / 100);
    exclusiveTotal += excl;
    vatAmount += vat;
  }
  const inclusiveTotal = exclusiveTotal + vatAmount;

  const invDate = new Date(data.invoiceDate);
  const dueDate = new Date(data.dueDate);

  await db.insert(invoices).values({
    invoiceNumber,
    customerId: data.customerId,
    invoiceDate: invDate,
    dueDate: dueDate,
    subtotal: exclusiveTotal.toFixed(2),
    taxAmount: vatAmount.toFixed(2),
    totalAmount: inclusiveTotal.toFixed(2),
    paidAmount: '0.00',
    balanceDue: inclusiveTotal.toFixed(2),
    status: 'draft',
    notes: data.notes,
    createdBy: data.createdBy,
    exclusiveTotal: String(exclusiveTotal.toFixed(2)),
    vatAmount: String(vatAmount.toFixed(2)),
    inclusiveTotal: String(inclusiveTotal.toFixed(2)),
    vatPercentage: String(vatPct),
    feedOrderId: data.feedOrderId,
  });

  // Retrieve the saved invoice
  const saved = await db.select().from(invoices).where(eq(invoices.invoiceNumber, invoiceNumber)).limit(1);
  const invoiceId = saved[0]?.id;

  if (invoiceId) {
    // Save line items
    for (const item of data.lineItems) {
      const subtotal = item.quantity * item.unitPrice;
      const discount = subtotal * ((item.discountPercent ?? 0) / 100);
      const excl = subtotal - discount;
      const vat = excl * ((item.vatPercent ?? vatPct) / 100);
      await db.insert(invoiceLineItems).values({
        invoiceId,
        description: item.description,
        quantity: String(item.quantity),
        pricePerUnit: String(item.unitPrice),
        discount: String(item.discountPercent ?? 0),
        discountAmount: String((subtotal * ((item.discountPercent ?? 0) / 100)).toFixed(2)),
        vatPercentage: String(item.vatPercent ?? vatPct),
        amount: String((excl + vat).toFixed(2)),
      });
    }

    // Link the invoice to the delivery if one was provided
    if (data.deliveryId) {
      await db.update(feedOrderDeliveries).set({
        customerInvoiceId: invoiceId,
        status: 'invoiced',
      }).where(eq(feedOrderDeliveries.id, data.deliveryId));
    }
  }

  return { invoiceId, invoiceNumber };
}

export async function listFeedDeliveryInvoices(filters?: {
  customerId?: number;
  feedOrderId?: number;
  status?: string;
}) {
  const db = await getDb();
  if (!db) return [];

  // Feed delivery invoices are identified by invoiceNumber starting with 'FEED-'
  const conditions = [like(invoices.invoiceNumber, 'FEED-%')];
  if (filters?.customerId) conditions.push(eq(invoices.customerId, filters.customerId));
  if (filters?.feedOrderId) conditions.push(eq(invoices.feedOrderId, filters.feedOrderId));
  if (filters?.status) conditions.push(eq(invoices.status, filters.status as any));

  const rows = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      customerId: invoices.customerId,
      customerName: customers.name,
      invoiceDate: invoices.invoiceDate,
      dueDate: invoices.dueDate,
      exclusiveTotal: invoices.exclusiveTotal,
      vatAmount: invoices.vatAmount,
      inclusiveTotal: invoices.inclusiveTotal,
      paidAmount: invoices.paidAmount,
      balanceDue: invoices.balanceDue,
      status: invoices.status,
      feedOrderId: invoices.feedOrderId,
      notes: invoices.notes,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .leftJoin(customers, eq(invoices.customerId, customers.id))
    .where(and(...conditions))
    .orderBy(desc(invoices.invoiceDate));

  return rows;
}

export async function getCustomerInvoiceAgingSummary() {
  const db = await getDb();
  if (!db) return { draft: 0, sent: 0, overdue: 0, paid: 0, totalOutstanding: 0, totalOverdue: 0 };

  const today = new Date();

  const rows = await db
    .select({
      status: invoices.status,
      dueDate: invoices.dueDate,
      balanceDue: invoices.balanceDue,
      inclusiveTotal: invoices.inclusiveTotal,
    })
    .from(invoices);

  let draft = 0, sent = 0, overdue = 0, paid = 0;
  let totalOutstanding = 0, totalOverdue = 0;

  for (const row of rows) {
    const balance = parseFloat(String(row.balanceDue) || '0');
    const due = row.dueDate ? new Date(row.dueDate) : null;
    if (row.status === 'paid') {
      paid++;
    } else if (row.status === 'cancelled') {
      // skip
    } else if (due && due < today && (row.status as string) !== 'paid') {
      overdue++;
      totalOverdue += balance;
    } else if (row.status === 'draft') {
      draft++;
      totalOutstanding += balance;
    } else {
      sent++;
      totalOutstanding += balance;
    }
  }

  return { draft, sent, overdue, paid, totalOutstanding, totalOverdue };
}


// ============================================================================
// SALES ORDERS
// ============================================================================

export async function getNextSalesOrderNumber(): Promise<string> {
  const db = await getDb();
  if (!db) return "SO-001";
  const [last] = await db
    .select({ orderNumber: salesOrders.orderNumber })
    .from(salesOrders)
    .orderBy(desc(salesOrders.id))
    .limit(1);
  if (!last) return "SO-001";
  const match = last.orderNumber.match(/SO-(\d+)$/);
  if (!match) return "SO-001";
  const next = parseInt(match[1], 10) + 1;
  return `SO-${String(next).padStart(3, "0")}`;
}

export async function listSalesOrders(filters?: {
  customerId?: number;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions: ReturnType<typeof eq>[] = [];
  if (filters?.customerId) conditions.push(eq(salesOrders.customerId, filters.customerId));
  if (filters?.status) conditions.push(eq(salesOrders.status, filters.status as any));
  if (filters?.dateFrom) conditions.push(gte(salesOrders.orderDate, filters.dateFrom));
  if (filters?.dateTo) conditions.push(lte(salesOrders.orderDate, filters.dateTo));

  return db
    .select({
      id: salesOrders.id,
      orderNumber: salesOrders.orderNumber,
      customerId: salesOrders.customerId,
      customerName: customers.name,
      customerCompany: customers.companyName,
      orderDate: salesOrders.orderDate,
      deliveryDate: salesOrders.deliveryDate,
      status: salesOrders.status,
      subtotal: salesOrders.subtotal,
      taxAmount: salesOrders.taxAmount,
      totalAmount: salesOrders.totalAmount,
      notes: salesOrders.notes,
      createdAt: salesOrders.createdAt,
      updatedAt: salesOrders.updatedAt,
      createdBy: salesOrders.createdBy,
    })
    .from(salesOrders)
    .leftJoin(customers, eq(salesOrders.customerId, customers.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(salesOrders.createdAt));
}

export async function getSalesOrderById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select({
      id: salesOrders.id,
      orderNumber: salesOrders.orderNumber,
      customerId: salesOrders.customerId,
      customerName: customers.name,
      customerCompany: customers.companyName,
      orderDate: salesOrders.orderDate,
      deliveryDate: salesOrders.deliveryDate,
      deliveryAddressId: salesOrders.deliveryAddressId,
      status: salesOrders.status,
      subtotal: salesOrders.subtotal,
      taxAmount: salesOrders.taxAmount,
      totalAmount: salesOrders.totalAmount,
      notes: salesOrders.notes,
      createdAt: salesOrders.createdAt,
      updatedAt: salesOrders.updatedAt,
      createdBy: salesOrders.createdBy,
    })
    .from(salesOrders)
    .leftJoin(customers, eq(salesOrders.customerId, customers.id))
    .where(eq(salesOrders.id, id));
  return row;
}

export async function getSalesOrderItems(orderId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(salesOrderItems)
    .where(eq(salesOrderItems.orderId, orderId))
    .orderBy(asc(salesOrderItems.id));
}

export async function createSalesOrder(data: {
  orderNumber: string;
  customerId: number;
  orderDate: string;
  deliveryDate?: string | null;
  deliveryAddressId?: number | null;
  status?: "draft" | "confirmed" | "processing" | "delivered" | "cancelled";
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  notes?: string | null;
  createdBy?: number | null;
  items: Array<{
    itemType: "live_birds" | "feed" | "other";
    description: string;
    flockId?: number | null;
    feedBatchId?: number | null;
    quantity: number;
    unit: string;
    unitPrice: number;
    subtotal: number;
    taxRate?: number;
    taxAmount: number;
    totalAmount: number;
  }>;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { items, subtotal, taxAmount, totalAmount, ...orderData } = data;
  const result = await db.insert(salesOrders).values({
    ...orderData,
    subtotal: currencyDecimal(subtotal),
    taxAmount: currencyDecimal(taxAmount),
    totalAmount: currencyDecimal(totalAmount),
    status: orderData.status ?? "draft",
  });
  const insertId = Number((result as any)[0]?.insertId ?? (result as any).insertId ?? 0);
  if (insertId && items.length > 0) {
    await db.insert(salesOrderItems).values(
      items.map((item) => ({
        orderId: insertId,
        itemType: item.itemType,
        description: item.description,
        flockId: item.flockId ?? null,
        feedBatchId: item.feedBatchId ?? null,
        quantity: String(item.quantity),
        unit: item.unit,
        unitPrice: currencyDecimal(item.unitPrice),
        subtotal: currencyDecimal(item.subtotal),
        taxRate: String(item.taxRate ?? 15),
        taxAmount: currencyDecimal(item.taxAmount),
        totalAmount: currencyDecimal(item.totalAmount),
      }))
    );
  }
  return { insertId };
}

export async function updateSalesOrder(
  id: number,
  data: {
    customerId?: number;
    orderDate?: string;
    deliveryDate?: string | null;
    deliveryAddressId?: number | null;
    status?: "draft" | "confirmed" | "processing" | "delivered" | "cancelled";
    subtotal?: number;
    taxAmount?: number;
    totalAmount?: number;
    notes?: string | null;
  }
) {
  const db = await getDb();
  if (!db) return undefined;
  const { subtotal, taxAmount, totalAmount, ...orderData } = data;
  await db.update(salesOrders).set({
    ...orderData,
    ...(subtotal === undefined ? {} : { subtotal: currencyDecimal(subtotal) }),
    ...(taxAmount === undefined ? {} : { taxAmount: currencyDecimal(taxAmount) }),
    ...(totalAmount === undefined ? {} : { totalAmount: currencyDecimal(totalAmount) }),
    updatedAt: mysqlTimestamp(),
  }).where(eq(salesOrders.id, id));
  return getSalesOrderById(id);
}

export async function updateSalesOrderStatus(
  id: number,
  status: "draft" | "confirmed" | "processing" | "delivered" | "cancelled"
) {
  const db = await getDb();
  if (!db) return undefined;
  await db.update(salesOrders).set({ status, updatedAt: mysqlTimestamp() }).where(eq(salesOrders.id, id));
  return getSalesOrderById(id);
}

export async function cancelSalesOrder(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  await db.update(salesOrders).set({ status: "cancelled", updatedAt: mysqlTimestamp() }).where(eq(salesOrders.id, id));
  return getSalesOrderById(id);
}

export async function replaceSalesOrderItems(
  orderId: number,
  items: Array<{
    itemType: "live_birds" | "feed" | "other";
    description: string;
    flockId?: number | null;
    feedBatchId?: number | null;
    quantity: number;
    unit: string;
    unitPrice: number;
    subtotal: number;
    taxRate?: number;
    taxAmount: number;
    totalAmount: number;
  }>
) {
  const db = await getDb();
  if (!db) return;
  await db.delete(salesOrderItems).where(eq(salesOrderItems.orderId, orderId));
  if (items.length > 0) {
    await db.insert(salesOrderItems).values(
      items.map((item) => ({
        orderId,
        itemType: item.itemType,
        description: item.description,
        flockId: item.flockId ?? null,
        feedBatchId: item.feedBatchId ?? null,
        quantity: String(item.quantity),
        unit: item.unit,
        unitPrice: currencyDecimal(item.unitPrice),
        subtotal: currencyDecimal(item.subtotal),
        taxRate: String(item.taxRate ?? 15),
        taxAmount: currencyDecimal(item.taxAmount),
        totalAmount: currencyDecimal(item.totalAmount),
      }))
    );
  }
}

export async function getSalesOrderStats() {
  const db = await getDb();
  if (!db) return { total: 0, draft: 0, confirmed: 0, processing: 0, delivered: 0, cancelled: 0, totalValue: 0 };
  const rows = await db.select({ status: salesOrders.status, totalAmount: salesOrders.totalAmount }).from(salesOrders);
  const stats = { total: rows.length, draft: 0, confirmed: 0, processing: 0, delivered: 0, cancelled: 0, totalValue: 0 };
  for (const r of rows) {
    const amt = Number(r.totalAmount) || 0;
    if (r.status !== "cancelled") stats.totalValue += amt;
    if (r.status === "draft") stats.draft++;
    else if (r.status === "confirmed") stats.confirmed++;
    else if (r.status === "processing") stats.processing++;
    else if (r.status === "delivered") stats.delivered++;
    else if (r.status === "cancelled") stats.cancelled++;
    stats.total++;
  }
  return stats;
}

// ============================================================================
// INVOICE GENERATION FROM SALES ORDERS
// ============================================================================

/**
 * Check if an invoice already exists for a given sales order.
 */
export async function getInvoiceByOrderId(orderId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(invoices)
    .where(eq(invoices.orderId, orderId))
    .limit(1);
  return result[0] || null;
}

/**
 * Generate a new sequential invoice number in the format INV-YYYYMM-NNN.
 */
export async function getNextInvoiceNumber(): Promise<string> {
  const db = await getDb();
  if (!db) return `INV-${Date.now()}`;
  const now = new Date();
  const prefix = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;
  const rows = await db
    .select({ invoiceNumber: invoices.invoiceNumber })
    .from(invoices)
    .where(like(invoices.invoiceNumber, `${prefix}%`))
    .orderBy(desc(invoices.invoiceNumber))
    .limit(1);
  if (rows.length === 0) return `${prefix}001`;
  const last = rows[0].invoiceNumber;
  const seq = parseInt(last.split('-').pop() || '0', 10);
  return `${prefix}${String(seq + 1).padStart(3, '0')}`;
}

/**
 * Create a draft invoice from a sales order, copying all line items.
 * Throws if an invoice already exists for this order.
 */
export async function createInvoiceFromSalesOrder(data: {
  orderId: number;
  invoiceDate: string;
  dueDate: string;
  notes?: string | null;
  createdBy?: number;
}): Promise<{ invoiceId: number; invoiceNumber: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Guard: prevent duplicate invoices for the same order
  const existing = await getInvoiceByOrderId(data.orderId);
  if (existing) {
    throw new Error(`Invoice ${existing.invoiceNumber} already exists for this order`);
  }

  // Load the sales order and its items
  const order = await getSalesOrderById(data.orderId);
  if (!order) throw new Error("Sales order not found");

  const items = await getSalesOrderItems(data.orderId);

  const subtotal = Number(order.subtotal) || 0;
  const taxAmount = Number(order.taxAmount) || 0;
  const totalAmount = Number(order.totalAmount) || 0;

  const invoiceNumber = await getNextInvoiceNumber();

  // Insert the invoice header
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoiceInsertValues: any = {
    invoiceNumber,
    customerId: order.customerId,
    orderId: data.orderId,
    invoiceDate: data.invoiceDate,
    dueDate: data.dueDate,
    subtotal: subtotal.toFixed(2),
    taxAmount: taxAmount.toFixed(2),
    totalAmount: totalAmount.toFixed(2),
    paidAmount: '0.00',
    balanceDue: totalAmount.toFixed(2),
    exclusiveTotal: subtotal,
    vatAmount: taxAmount,
    inclusiveTotal: totalAmount,
    vatPercentage: getUniformInvoiceVatPercentage(items),
    status: 'draft',
    notes: data.notes ?? null,
    createdBy: data.createdBy,
  };
  const result = await db.insert(invoices).values(invoiceInsertValues);

  const invoiceId = Number((result as any)[0]?.insertId ?? (result as any).insertId ?? 0);

  // Copy line items from the sales order into invoice_items
  if (items.length > 0) {
    await db.insert(invoiceItems).values(
      items.map((item) => {
        const qty = Number(item.quantity) || 0;
        const price = Number(item.unitPrice) || 0;
        const taxRate = resolveInvoiceVatRate(item.taxRate);
        const sub = qty * price;
        const tax = sub * (taxRate / 100);
        const total = sub + tax;
        return {
          invoiceId,
          description: item.description,
          quantity: qty.toFixed(2),
          unit: item.unit || 'each',
          unitPrice: Math.round(price * 100),
          subtotal: Math.round(sub * 100),
          taxRate: taxRate.toFixed(2),
          taxAmount: Math.round(tax * 100),
          totalAmount: Math.round(total * 100),
        };
      })
    );
  }

  return { invoiceId, invoiceNumber };
}

// ============================================================================
// SUPPLIER PURCHASE ORDERS
// ============================================================================

type PurchaseOrderLineData = PurchaseOrderLineInput & {
  unit: string;
  scheduleId?: number | null;
};

function formatPurchaseOrderNumber(nextSequence: number) {
  return `PO-${String(nextSequence).padStart(4, "0")}`;
}

export async function getNextPurchaseOrderNumber() {
  const db = await getDb();
  if (!db) return formatPurchaseOrderNumber(1);
  const rows = await db.select({ orderNumber: procurementOrders.orderNumber }).from(procurementOrders);
  const highestSequence = rows.reduce((highest, row) => {
    const match = /^PO-(\d+)$/.exec(row.orderNumber ?? "");
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return formatPurchaseOrderNumber(highestSequence + 1);
}

export async function listPurchaseOrders(filters?: { supplierId?: number; status?: PurchaseOrderStatus }) {
  const db = await getDb();
  if (!db) return [];
  const conditions: ReturnType<typeof eq>[] = [];
  if (filters?.supplierId) conditions.push(eq(procurementOrders.supplierId, filters.supplierId));
  if (filters?.status) conditions.push(eq(procurementOrders.status, filters.status));
  const query = db
    .select({
      id: procurementOrders.id,
      orderNumber: procurementOrders.orderNumber,
      supplierId: procurementOrders.supplierId,
      supplierName: suppliers.name,
      orderDate: procurementOrders.orderDate,
      expectedDeliveryDate: procurementOrders.expectedDeliveryDate,
      actualDeliveryDate: procurementOrders.actualDeliveryDate,
      totalAmount: procurementOrders.totalAmount,
      status: procurementOrders.status,
      sentVia: procurementOrders.sentVia,
      sentAt: procurementOrders.sentAt,
      confirmedAt: procurementOrders.confirmedAt,
      notes: procurementOrders.notes,
      createdAt: procurementOrders.createdAt,
    })
    .from(procurementOrders)
    .leftJoin(suppliers, eq(procurementOrders.supplierId, suppliers.id))
    .orderBy(desc(procurementOrders.orderDate), desc(procurementOrders.id));
  return conditions.length ? await query.where(and(...conditions)) : await query;
}

export async function getPurchaseOrderById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({
      id: procurementOrders.id,
      orderNumber: procurementOrders.orderNumber,
      supplierId: procurementOrders.supplierId,
      supplierName: suppliers.name,
      supplierEmail: suppliers.email,
      supplierPhone: suppliers.phone,
      orderDate: procurementOrders.orderDate,
      expectedDeliveryDate: procurementOrders.expectedDeliveryDate,
      actualDeliveryDate: procurementOrders.actualDeliveryDate,
      totalAmount: procurementOrders.totalAmount,
      status: procurementOrders.status,
      sentVia: procurementOrders.sentVia,
      sentAt: procurementOrders.sentAt,
      confirmedAt: procurementOrders.confirmedAt,
      notes: procurementOrders.notes,
      createdAt: procurementOrders.createdAt,
    })
    .from(procurementOrders)
    .leftJoin(suppliers, eq(procurementOrders.supplierId, suppliers.id))
    .where(eq(procurementOrders.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getPurchaseOrderItems(orderId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(procurementOrderItems)
    .where(eq(procurementOrderItems.orderId, orderId))
    .orderBy(asc(procurementOrderItems.id));
}

function validatePurchaseOrderItems(items: PurchaseOrderLineData[]) {
  if (!items.length) throw new Error("A purchase order requires at least one line item");
  for (const item of items) {
    if (!item.description.trim()) throw new Error("Each line item needs a description");
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) throw new Error("Line quantity must be greater than zero");
    if (!Number.isInteger(item.unitPriceCents) || item.unitPriceCents < 0) throw new Error("Line unit price is invalid");
  }
}

export async function createPurchaseOrder(data: {
  supplierId: number;
  orderDate: string;
  expectedDeliveryDate?: string | null;
  notes?: string | null;
  createdBy: number;
  items: PurchaseOrderLineData[];
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  validatePurchaseOrderItems(data.items);
  const supplier = await db.select({ id: suppliers.id, isActive: suppliers.isActive }).from(suppliers).where(eq(suppliers.id, data.supplierId)).limit(1);
  if (!supplier[0]) throw new Error("Supplier not found");
  if (!supplier[0].isActive) throw new Error("Inactive suppliers cannot receive new purchase orders");

  const orderNumber = await getNextPurchaseOrderNumber();
  const totalAmount = calculatePurchaseOrderTotal(data.items);
  const created = await db.insert(procurementOrders).values({
    orderNumber,
    supplierId: data.supplierId,
    orderDate: data.orderDate,
    expectedDeliveryDate: data.expectedDeliveryDate ?? null,
    totalAmount,
    status: "draft",
    notes: data.notes ?? null,
    createdBy: data.createdBy,
  });
  const orderId = Number((created as any)[0]?.insertId ?? (created as any).insertId ?? 0);
  await db.insert(procurementOrderItems).values(data.items.map((item) => ({
    orderId,
    scheduleId: item.scheduleId ?? null,
    description: item.description.trim(),
    quantity: item.quantity.toFixed(2),
    unit: item.unit.trim() || "each",
    unitPrice: item.unitPriceCents,
    totalAmount: calculatePurchaseOrderLineTotal(item),
  })));
  return { id: orderId, orderNumber };
}

export async function updatePurchaseOrder(id: number, data: {
  expectedDeliveryDate?: string | null;
  notes?: string | null;
  items: PurchaseOrderLineData[];
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const order = await getPurchaseOrderById(id);
  if (!order) throw new Error("Purchase order not found");
  if (order.status !== "draft") throw new Error("Only draft purchase orders can be edited");
  validatePurchaseOrderItems(data.items);
  await db.update(procurementOrders).set({
    expectedDeliveryDate: data.expectedDeliveryDate ?? null,
    notes: data.notes ?? null,
    totalAmount: calculatePurchaseOrderTotal(data.items),
  }).where(eq(procurementOrders.id, id));
  await db.delete(procurementOrderItems).where(eq(procurementOrderItems.orderId, id));
  await db.insert(procurementOrderItems).values(data.items.map((item) => ({
    orderId: id,
    scheduleId: item.scheduleId ?? null,
    description: item.description.trim(),
    quantity: item.quantity.toFixed(2),
    unit: item.unit.trim() || "each",
    unitPrice: item.unitPriceCents,
    totalAmount: calculatePurchaseOrderLineTotal(item),
  })));
}

export async function transitionPurchaseOrder(id: number, targetStatus: PurchaseOrderStatus, options?: {
  sentVia?: "email" | "whatsapp" | "phone" | "manual";
  actualDeliveryDate?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const order = await getPurchaseOrderById(id);
  if (!order) throw new Error("Purchase order not found");
  if (!canTransitionPurchaseOrder(order.status as PurchaseOrderStatus, targetStatus)) {
    throw new Error(`Cannot change a ${order.status} purchase order to ${targetStatus}`);
  }
  const update: Record<string, unknown> = { status: targetStatus };
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  if (targetStatus === "sent") {
    update.sentAt = now;
    update.sentVia = options?.sentVia ?? "manual";
  }
  if (targetStatus === "confirmed") update.confirmedAt = now;
  if (targetStatus === "delivered") update.actualDeliveryDate = options?.actualDeliveryDate ?? now;
  await db.update(procurementOrders).set(update).where(eq(procurementOrders.id, id));
}

export async function deletePurchaseOrder(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const order = await getPurchaseOrderById(id);
  if (!order) throw new Error("Purchase order not found");
  if (order.status !== "draft") throw new Error("Only draft purchase orders can be deleted");
  await db.delete(procurementOrderItems).where(eq(procurementOrderItems.orderId, id));
  await db.delete(procurementOrders).where(eq(procurementOrders.id, id));
}

// ============================================================================
// HEALTH MANAGEMENT — PRE-TRANSPORT PROTOCOLS
// ============================================================================

export async function listPreTransportProtocols(flockId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select({
      id: preTransportProtocols.id,
      flockId: preTransportProtocols.flockId,
      collectionDate: preTransportProtocols.collectionDate,
      collectionTime: preTransportProtocols.collectionTime,
      travelDurationHours: preTransportProtocols.travelDurationHours,
      feedWithdrawalHours: preTransportProtocols.feedWithdrawalHours,
      stressPackId: preTransportProtocols.stressPackId,
      stressPackName: stressPacks.name,
      dosageStrength: preTransportProtocols.dosageStrength,
      status: preTransportProtocols.status,
      notes: preTransportProtocols.notes,
      createdAt: preTransportProtocols.createdAt,
    })
    .from(preTransportProtocols)
    .leftJoin(stressPacks, eq(preTransportProtocols.stressPackId, stressPacks.id))
    .where(eq(preTransportProtocols.flockId, flockId))
    .orderBy(desc(preTransportProtocols.collectionDate), desc(preTransportProtocols.id));
}

export async function createPreTransportProtocol(data: {
  flockId: number;
  collectionDate: string;
  collectionTime: string;
  travelDurationHours: string;
  feedWithdrawalHours: number;
  stressPackId?: number | null;
  dosageStrength?: "single" | "double" | "triple";
  notes?: string | null;
  createdBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const flock = await getFlockById(data.flockId);
  if (!flock) throw new Error("Flock not found");
  const schedule = calculatePreTransportSchedule(data);
  const created = await db.insert(preTransportProtocols).values({
    flockId: data.flockId,
    collectionDate: data.collectionDate,
    collectionTime: data.collectionTime,
    travelDurationHours: data.travelDurationHours,
    feedWithdrawalHours: data.feedWithdrawalHours,
    stressPackId: data.stressPackId ?? null,
    dosageStrength: data.dosageStrength ?? "single",
    notes: data.notes ?? null,
    createdBy: data.createdBy,
  });
  const protocolId = Number((created as any)[0]?.insertId ?? (created as any).insertId ?? 0);
  await db.insert(reminders).values([
    {
      flockId: data.flockId,
      houseId: flock.houseId,
      reminderType: "milestone",
      title: "Begin pre-transport stress support",
      description: data.stressPackId ? "Begin the assigned stress-pack support period before collection." : "Review pre-transport stress-support requirements before collection.",
      dueDate: schedule.stressSupportAt,
      priority: "high",
      preTransportProtocolId: protocolId,
    },
    {
      flockId: data.flockId,
      houseId: flock.houseId,
      reminderType: "milestone",
      title: "Begin feed withdrawal",
      description: `Begin the ${data.feedWithdrawalHours}-hour feed-withdrawal period for planned collection.`,
      dueDate: schedule.feedWithdrawalAt,
      priority: "urgent",
      preTransportProtocolId: protocolId,
    },
    {
      flockId: data.flockId,
      houseId: flock.houseId,
      reminderType: "milestone",
      title: "Collection and transport preparation",
      description: `Prepare flock for collection at ${data.collectionTime}; planned transport duration is ${data.travelDurationHours} hours.`,
      dueDate: schedule.collectionAt,
      priority: "urgent",
      preTransportProtocolId: protocolId,
    },
  ]);
  return { id: protocolId, schedule };
}

export async function updatePreTransportProtocolStatus(id: number, status: "completed" | "cancelled") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(preTransportProtocols).set({ status }).where(eq(preTransportProtocols.id, id));
  if (status === "cancelled") {
    await db.update(reminders).set({ status: "dismissed", actionNotes: "Pre-transport protocol cancelled" })
      .where(and(eq(reminders.preTransportProtocolId, id), eq(reminders.status, "pending")));
  }
}
