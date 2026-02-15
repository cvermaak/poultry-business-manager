import { mysqlTable, int, varchar, timestamp, decimal, mysqlEnum, text, index } from "drizzle-orm/mysql-core";
import { users } from "./schema";
import { flocks } from "./schema";

// ============================================================================
// SLAUGHTER TRACKING
// ============================================================================

export const slaughterBatches = mysqlTable("slaughter_batches", {
  id: int("id").autoincrement().primaryKey(),
  flockId: int("flockId").notNull().references(() => flocks.id),
  batchNumber: varchar("batchNumber", { length: 50 }).notNull(),
  startDate: timestamp("startDate").notNull(),
  endDate: timestamp("endDate"),
  totalBirdsSold: int("totalBirdsSold").default(0),
  status: mysqlEnum("status", ["in-progress", "completed", "at-slaughterhouse"]).default("in-progress").notNull(),
  transportTimeHours: decimal("transportTimeHours", { precision: 5, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy").references(() => users.id),
}, (table) => ({
  flockIdIdx: index("idx_sb_flock_id").on(table.flockId),
  statusIdx: index("idx_sb_status").on(table.status),
  startDateIdx: index("idx_sb_start_date").on(table.startDate),
}));

export const slaughterCatchRecords = mysqlTable("slaughter_catch_records", {
  id: int("id").autoincrement().primaryKey(),
  batchId: int("batchId").notNull().references(() => slaughterBatches.id, { onDelete: "cascade" }),
  catchDate: timestamp("catchDate").notNull(),
  dayNumber: int("dayNumber").notNull(),
  birdsCaught: int("birdsCaught").notNull(),
  averageWeightAtFarm: decimal("averageWeightAtFarm", { precision: 10, scale: 3 }).notNull(),
  feedRemovalHours: int("feedRemovalHours").notNull(),
  
  gutEvacuationPercent: decimal("gutEvacuationPercent", { precision: 5, scale: 2 }).notNull(),
  catchingHandlingPercent: decimal("catchingHandlingPercent", { precision: 5, scale: 2 }).notNull(),
  loadingHoldingPercent: decimal("loadingHoldingPercent", { precision: 5, scale: 2 }).notNull(),
  transportPercent: decimal("transportPercent", { precision: 5, scale: 2 }).notNull(),
  totalShrinkagePercent: decimal("totalShrinkagePercent", { precision: 5, scale: 2 }).notNull(),
  
  estimatedWeightAtSlaughterhouse: decimal("estimatedWeightAtSlaughterhouse", { precision: 10, scale: 3 }).notNull(),
  
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy").references(() => users.id),
}, (table) => ({
  batchIdIdx: index("idx_scr_batch_id").on(table.batchId),
  catchDateIdx: index("idx_scr_catch_date").on(table.catchDate),
}));

export const slaughterhouseRecords = mysqlTable("slaughterhouse_records", {
  id: int("id").autoincrement().primaryKey(),
  catchRecordId: int("catchRecordId").notNull().references(() => slaughterCatchRecords.id, { onDelete: "cascade" }),
  actualWeightAtSlaughterhouse: decimal("actualWeightAtSlaughterhouse", { precision: 10, scale: 3 }).notNull(),
  variance: decimal("variance", { precision: 10, scale: 3 }).notNull(),
  variancePercent: decimal("variancePercent", { precision: 5, scale: 2 }).notNull(),
  slaughterhouseReference: varchar("slaughterhouseReference", { length: 100 }),
  receivedDate: timestamp("receivedDate").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy").references(() => users.id),
}, (table) => ({
  catchRecordIdIdx: index("idx_shr_catch_id").on(table.catchRecordId),
  receivedDateIdx: index("idx_shr_received_date").on(table.receivedDate),
}));

// ============================================================================
// TYPE EXPORTS FOR SLAUGHTER TRACKING
// ============================================================================

export type SlaughterBatch = typeof slaughterBatches.$inferSelect;
export type InsertSlaughterBatch = typeof slaughterBatches.$inferInsert;

export type SlaughterCatchRecord = typeof slaughterCatchRecords.$inferSelect;
export type InsertSlaughterCatchRecord = typeof slaughterCatchRecords.$inferInsert;

export type SlaughterhouseRecord = typeof slaughterhouseRecords.$inferSelect;
export type InsertSlaughterhouseRecord = typeof slaughterhouseRecords.$inferInsert;
