import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean, index, json, tinyint } from "drizzle-orm/mysql-core";

/**
 * POULTRY BUSINESS MANAGER - DATABASE SCHEMA
 * 
 * This schema supports comprehensive broiler chicken business management including:
 * - User management with role-based access control
 * - House configuration and flock management
 * - Feed manufacturing and raw material inventory
 * - Customer relationship management
 * - Sales, invoicing, and payment tracking
 * - Financial accounting (double-entry bookkeeping)
 * - Procurement automation and supplier management
 * - Inventory management across multiple locations
 * - Document storage and management
 * 
 * All monetary values are stored in cents (integer) to avoid floating-point precision issues
 * All timestamps are stored as MySQL timestamp type for consistency
 */

// ============================================================================
// USER MANAGEMENT
// ============================================================================

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).unique(), // Optional for email/password users
  username: varchar("username", { length: 50 }).unique(), // Unique username for login
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(), // Unique email for login
  passwordHash: varchar("passwordHash", { length: 255 }), // Bcrypt hash for email/password auth
  loginMethod: varchar("loginMethod", { length: 64 }).default("email").notNull(), // 'oauth' or 'email'
  role: mysqlEnum("role", ["admin", "farm_manager", "accountant", "sales_staff", "production_worker"]).default("production_worker").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  mustChangePassword: boolean("mustChangePassword").default(true).notNull(), // Force password change on first login
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn"),
  createdBy: int("createdBy"), // Admin who created this user
});

export const userActivityLogs = mysqlTable("user_activity_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entityType", { length: 50 }),
  entityId: int("entityId"),
  details: text("details"),
  ipAddress: varchar("ipAddress", { length: 45 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("idx_user_activity_logs_user_id").on(table.userId),
  createdAtIdx: index("idx_user_activity_logs_created_at").on(table.createdAt),
}));

// ============================================================================
// HOUSE CONFIGURATION
// ============================================================================

export const houses = mysqlTable("houses", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  houseNumber: varchar("houseNumber", { length: 50 }),
  // Physical specifications
  length: decimal("length", { precision: 10, scale: 2 }).notNull(), // meters
  width: decimal("width", { precision: 10, scale: 2 }).notNull(), // meters
  floorArea: decimal("floorArea", { precision: 10, scale: 2 }).notNull(), // calculated: length × width
  capacity: int("capacity").notNull(), // maximum bird count
  houseType: mysqlEnum("houseType", ["open_sided", "closed", "semi_closed"]).default("closed").notNull(),
  // Breed specification
  breed: mysqlEnum("breed", ["ross_308", "cobb_500", "arbor_acres"]).default("ross_308").notNull(),
  // Location information
  farmName: varchar("farmName", { length: 100 }),
  physicalAddress: text("physicalAddress"),
  gpsLatitude: decimal("gpsLatitude", { precision: 10, scale: 7 }),
  gpsLongitude: decimal("gpsLongitude", { precision: 10, scale: 7 }),
  province: varchar("province", { length: 50 }),
  district: varchar("district", { length: 50 }),
  // Bedding and equipment
  beddingType: varchar("beddingType", { length: 50 }).default("pine_shavings"),
  beddingDepth: int("beddingDepth").default(30), // millimeters
  numberOfFeeders: int("numberOfFeeders"),
  numberOfDrinkers: int("numberOfDrinkers"),
  heatingType: varchar("heatingType", { length: 50 }),
  ventilationType: varchar("ventilationType", { length: 50 }),
  notes: text("notes"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy").references(() => users.id),
});

// ============================================================================
// BROILER PRODUCTION MANAGEMENT
// ============================================================================

export const flocks = mysqlTable("flocks", {
  id: int("id").autoincrement().primaryKey(),
  flockNumber: varchar("flockNumber", { length: 50 }).notNull().unique(),
  houseId: int("houseId").notNull().references(() => houses.id),
  placementDate: timestamp("placementDate").notNull(),
  initialCount: int("initialCount").notNull(),
  currentCount: int("currentCount").notNull(),
  targetSlaughterWeight: decimal("targetSlaughterWeight", { precision: 10, scale: 2 }).default("1.70"), // kg
  growingPeriod: int("growingPeriod").default(42), // days
  weightUnit: mysqlEnum("weightUnit", ["grams", "kg"]).default("kg").notNull(),
  
  // Feed planning
  starterFeedType: mysqlEnum("starterFeedType", ["premium", "value", "econo"]),
  starterFromDay: int("starterFromDay").default(0),
  starterToDay: int("starterToDay"),
  growerFeedType: mysqlEnum("growerFeedType", ["premium", "value", "econo"]),
  growerFromDay: int("growerFromDay"),
  growerToDay: int("growerToDay"),
  finisherFeedType: mysqlEnum("finisherFeedType", ["premium", "value", "econo"]),
  finisherFromDay: int("finisherFromDay"),
  finisherToDay: int("finisherToDay"),
  
  status: mysqlEnum("status", ["planned", "active", "completed", "cancelled"]).default("planned").notNull(),
  
  // Status change audit trail
  statusChangedAt: timestamp("statusChangedAt"),
  statusChangedBy: int("statusChangedBy").references(() => users.id),
  statusChangeReason: text("statusChangeReason"),
  isManualStatusChange: tinyint("isManualStatusChange").default(0), // 0 = automatic, 1 = manual
  
  // Destination and travel planning
  destinationName: varchar("destinationName", { length: 255 }),
  destinationAddress: text("destinationAddress"),
  destinationGpsLat: varchar("destinationGpsLat", { length: 50 }),
  destinationGpsLng: varchar("destinationGpsLng", { length: 50 }),
  collectionDate: timestamp("collectionDate"),
  travelDurationHours: decimal("travelDurationHours", { precision: 5, scale: 2 }),
  feedWithdrawalHours: int("feedWithdrawalHours"),
  
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy").references(() => users.id),
}, (table) => ({
  houseIdIdx: index("idx_flocks_house_id").on(table.houseId),
  statusIdx: index("idx_flocks_status").on(table.status),
  placementDateIdx: index("idx_flocks_placement_date").on(table.placementDate),
}));

export const flockDailyRecords = mysqlTable("flock_daily_records", {
  id: int("id").autoincrement().primaryKey(),
  flockId: int("flockId").notNull().references(() => flocks.id),
  recordDate: timestamp("recordDate").notNull(),
  dayNumber: int("dayNumber").notNull(), // calculated from placement date
  mortality: int("mortality").default(0).notNull(),
  feedConsumed: decimal("feedConsumed", { precision: 10, scale: 2 }).default("0"), // kg
  feedType: mysqlEnum("feedType", ["starter", "grower", "finisher"]),
  waterConsumed: decimal("waterConsumed", { precision: 10, scale: 2 }), // liters
  averageWeight: decimal("averageWeight", { precision: 10, scale: 3 }), // kg, from weight samples
  weightSamples: text("weightSamples"), // JSON array of individual weights
  temperature: decimal("temperature", { precision: 5, scale: 2 }), // celsius
  humidity: decimal("humidity", { precision: 5, scale: 2 }), // percentage
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  recordedBy: int("recordedBy").references(() => users.id),
}, (table) => ({
  flockIdIdx: index("idx_flock_daily_records_flock_id").on(table.flockId),
  recordDateIdx: index("idx_flock_daily_records_record_date").on(table.recordDate),
}));

export const vaccinationSchedules = mysqlTable("vaccination_schedules", {
  id: int("id").autoincrement().primaryKey(),
  flockId: int("flockId").notNull().references(() => flocks.id),
  vaccineName: varchar("vaccineName", { length: 200 }).notNull(),
  scheduledDate: timestamp("scheduledDate").notNull(),
  scheduledDayNumber: int("scheduledDayNumber").notNull(),
  administeredDate: timestamp("administeredDate"),
  dosage: varchar("dosage", { length: 100 }),
  administrationMethod: varchar("administrationMethod", { length: 100 }),
  batchNumber: varchar("batchNumber", { length: 100 }),
  status: mysqlEnum("status", ["scheduled", "completed", "skipped", "overdue"]).default("scheduled").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  administeredBy: int("administeredBy").references(() => users.id),
}, (table) => ({
  flockIdIdx: index("idx_vaccination_schedules_flock_id").on(table.flockId),
  scheduledDateIdx: index("idx_vaccination_schedules_scheduled_date").on(table.scheduledDate),
}));

export const healthRecords = mysqlTable("health_records", {
  id: int("id").autoincrement().primaryKey(),
  flockId: int("flockId").notNull().references(() => flocks.id),
  recordDate: timestamp("recordDate").notNull(),
  recordType: mysqlEnum("recordType", ["observation", "treatment", "veterinary_visit", "medication", "other"]).notNull(),
  description: text("description").notNull(),
  affectedBirds: int("affectedBirds"),
  treatment: text("treatment"),
  medication: varchar("medication", { length: 200 }),
  dosage: varchar("dosage", { length: 100 }),
  veterinarianName: varchar("veterinarianName", { length: 200 }),
  cost: int("cost"), // cents
  followUpRequired: boolean("followUpRequired").default(false),
  followUpDate: timestamp("followUpDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  recordedBy: int("recordedBy").references(() => users.id),
}, (table) => ({
  flockIdIdx: index("idx_health_records_flock_id").on(table.flockId),
  recordDateIdx: index("idx_health_records_record_date").on(table.recordDate),
}));

export const mortalityRecords = mysqlTable("mortality_records", {
  id: int("id").autoincrement().primaryKey(),
  flockId: int("flockId").notNull().references(() => flocks.id),
  recordDate: timestamp("recordDate").notNull(),
  count: int("count").notNull(),
  cause: varchar("cause", { length: 200 }),
  ageAtDeath: int("ageAtDeath"), // days
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  recordedBy: int("recordedBy").references(() => users.id),
}, (table) => ({
  flockIdIdx: index("idx_mortality_records_flock_id").on(table.flockId),
  recordDateIdx: index("idx_mortality_records_record_date").on(table.recordDate),
}));

// ============================================================================
// FEED MANUFACTURING
// ============================================================================

export const feedFormulations = mysqlTable("feed_formulations", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  feedRange: mysqlEnum("feedRange", ["premium", "value", "econo"]).notNull(),
  feedStage: mysqlEnum("feedStage", ["starter", "grower", "finisher"]).notNull(),
  version: int("version").default(1).notNull(),
  description: text("description"),
  ingredients: text("ingredients").notNull(), // JSON array of {rawMaterialId, percentage, quantity}
  proteinPercentage: decimal("proteinPercentage", { precision: 5, scale: 2 }),
  energyContent: decimal("energyContent", { precision: 10, scale: 2 }), // ME (Metabolizable Energy)
  crudeProtein: decimal("crudeProtein", { precision: 5, scale: 2 }),
  crudeFiber: decimal("crudeFiber", { precision: 5, scale: 2 }),
  calcium: decimal("calcium", { precision: 5, scale: 2 }),
  phosphorus: decimal("phosphorus", { precision: 5, scale: 2 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy").references(() => users.id),
}, (table) => ({
  rangeStageIdx: index("idx_feed_formulations_range_stage").on(table.feedRange, table.feedStage),
}));

export const feedBatches = mysqlTable("feed_batches", {
  id: int("id").autoincrement().primaryKey(),
  batchNumber: varchar("batchNumber", { length: 100 }).notNull().unique(),
  formulationId: int("formulationId").notNull().references(() => feedFormulations.id),
  productionDate: timestamp("productionDate").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(), // tons
  rawMaterialCost: int("rawMaterialCost").notNull(), // cents
  laborCost: int("laborCost").default(0), // cents
  overheadCost: int("overheadCost").default(0), // cents
  totalCost: int("totalCost").notNull(), // cents
  costPerTon: int("costPerTon").notNull(), // cents
  qualityStatus: mysqlEnum("qualityStatus", ["pending", "in_progress", "passed", "failed"]).default("pending").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy").references(() => users.id),
}, (table) => ({
  productionDateIdx: index("idx_feed_batches_production_date").on(table.productionDate),
  formulationIdIdx: index("idx_feed_batches_formulation_id").on(table.formulationId),
}));

export const rawMaterials = mysqlTable("raw_materials", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull().unique(),
  category: varchar("category", { length: 100 }),
  unit: varchar("unit", { length: 50 }).notNull(), // kg, tons, liters
  currentStock: decimal("currentStock", { precision: 10, scale: 2 }).default("0").notNull(),
  reorderPoint: decimal("reorderPoint", { precision: 10, scale: 2 }),
  reorderQuantity: decimal("reorderQuantity", { precision: 10, scale: 2 }),
  unitCost: int("unitCost"), // cents per unit
  supplierId: int("supplierId"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const rawMaterialTransactions = mysqlTable("raw_material_transactions", {
  id: int("id").autoincrement().primaryKey(),
  rawMaterialId: int("rawMaterialId").notNull().references(() => rawMaterials.id),
  transactionType: mysqlEnum("transactionType", ["purchase", "usage", "adjustment", "return"]).notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unitCost: int("unitCost"), // cents per unit
  totalCost: int("totalCost"), // cents
  referenceType: varchar("referenceType", { length: 50 }), // feed_batch, procurement_order
  referenceId: int("referenceId"),
  notes: text("notes"),
  transactionDate: timestamp("transactionDate").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  createdBy: int("createdBy").references(() => users.id),
}, (table) => ({
  rawMaterialIdIdx: index("idx_raw_material_transactions_material_id").on(table.rawMaterialId),
  transactionDateIdx: index("idx_raw_material_transactions_date").on(table.transactionDate),
}));

export const qualityControlRecords = mysqlTable("quality_control_records", {
  id: int("id").autoincrement().primaryKey(),
  batchId: int("batchId").notNull().references(() => feedBatches.id),
  testDate: timestamp("testDate").notNull(),
  testType: varchar("testType", { length: 100 }).notNull(),
  parameter: varchar("parameter", { length: 100 }).notNull(),
  measuredValue: decimal("measuredValue", { precision: 10, scale: 3 }),
  targetValue: decimal("targetValue", { precision: 10, scale: 3 }),
  tolerance: decimal("tolerance", { precision: 10, scale: 3 }),
  result: mysqlEnum("result", ["pass", "fail", "pending"]).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  testedBy: int("testedBy").references(() => users.id),
}, (table) => ({
  batchIdIdx: index("idx_quality_control_records_batch_id").on(table.batchId),
}));

// ============================================================================
// CUSTOMER RELATIONSHIP MANAGEMENT
// ============================================================================

export const customers = mysqlTable("customers", {
  id: int("id").autoincrement().primaryKey(),
  customerNumber: varchar("customerNumber", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  contactPerson: varchar("contactPerson", { length: 200 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 50 }),
  whatsapp: varchar("whatsapp", { length: 50 }),
  segment: mysqlEnum("segment", ["wholesale", "retail", "contract"]).default("retail").notNull(),
  creditLimit: int("creditLimit").default(0), // cents
  paymentTerms: varchar("paymentTerms", { length: 100 }).default("cash"), // cash, net_7, net_15, net_30, net_60
  taxNumber: varchar("taxNumber", { length: 100 }),
  isActive: boolean("isActive").default(true).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy").references(() => users.id),
});

export const customerAddresses = mysqlTable("customer_addresses", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull().references(() => customers.id),
  addressType: mysqlEnum("addressType", ["billing", "delivery", "both"]).default("both").notNull(),
  addressLine1: varchar("addressLine1", { length: 200 }).notNull(),
  addressLine2: varchar("addressLine2", { length: 200 }),
  city: varchar("city", { length: 100 }),
  province: varchar("province", { length: 100 }),
  postalCode: varchar("postalCode", { length: 20 }),
  country: varchar("country", { length: 100 }).default("South Africa"),
  isDefault: boolean("isDefault").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  customerIdIdx: index("idx_customer_addresses_customer_id").on(table.customerId),
}));

// ============================================================================
// SALES & INVOICING
// ============================================================================

export const salesOrders = mysqlTable("sales_orders", {
  id: int("id").autoincrement().primaryKey(),
  orderNumber: varchar("orderNumber", { length: 50 }).notNull().unique(),
  customerId: int("customerId").notNull().references(() => customers.id),
  orderDate: timestamp("orderDate").notNull(),
  deliveryDate: timestamp("deliveryDate"),
  deliveryAddressId: int("deliveryAddressId").references(() => customerAddresses.id),
  status: mysqlEnum("status", ["draft", "confirmed", "processing", "delivered", "cancelled"]).default("draft").notNull(),
  subtotal: int("subtotal").notNull(), // cents
  taxAmount: int("taxAmount").notNull(), // cents
  totalAmount: int("totalAmount").notNull(), // cents
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy").references(() => users.id),
}, (table) => ({
  customerIdIdx: index("idx_sales_orders_customer_id").on(table.customerId),
  orderDateIdx: index("idx_sales_orders_order_date").on(table.orderDate),
  statusIdx: index("idx_sales_orders_status").on(table.status),
}));

export const salesOrderItems = mysqlTable("sales_order_items", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull().references(() => salesOrders.id),
  itemType: mysqlEnum("itemType", ["live_birds", "feed", "other"]).notNull(),
  description: varchar("description", { length: 500 }).notNull(),
  flockId: int("flockId").references(() => flocks.id),
  feedBatchId: int("feedBatchId").references(() => feedBatches.id),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unit: varchar("unit", { length: 50 }).notNull(),
  unitPrice: int("unitPrice").notNull(), // cents
  subtotal: int("subtotal").notNull(), // cents
  taxRate: decimal("taxRate", { precision: 5, scale: 2 }).default("15.00"), // percentage
  taxAmount: int("taxAmount").notNull(), // cents
  totalAmount: int("totalAmount").notNull(), // cents
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  orderIdIdx: index("idx_sales_order_items_order_id").on(table.orderId),
}));

export const invoices = mysqlTable("invoices", {
  id: int("id").autoincrement().primaryKey(),
  invoiceNumber: varchar("invoiceNumber", { length: 50 }).notNull().unique(),
  customerId: int("customerId").notNull().references(() => customers.id),
  orderId: int("orderId").references(() => salesOrders.id),
  invoiceDate: timestamp("invoiceDate").notNull(),
  dueDate: timestamp("dueDate").notNull(),
  subtotal: int("subtotal").notNull(), // cents
  taxAmount: int("taxAmount").notNull(), // cents
  totalAmount: int("totalAmount").notNull(), // cents
  paidAmount: int("paidAmount").default(0).notNull(), // cents
  balanceDue: int("balanceDue").notNull(), // cents
  status: mysqlEnum("status", ["draft", "sent", "paid", "partial", "overdue", "cancelled"]).default("draft").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy").references(() => users.id),
}, (table) => ({
  customerIdIdx: index("idx_invoices_customer_id").on(table.customerId),
  invoiceDateIdx: index("idx_invoices_invoice_date").on(table.invoiceDate),
  statusIdx: index("idx_invoices_status").on(table.status),
  dueDateIdx: index("idx_invoices_due_date").on(table.dueDate),
}));

export const invoiceItems = mysqlTable("invoice_items", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull().references(() => invoices.id),
  description: varchar("description", { length: 500 }).notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unit: varchar("unit", { length: 50 }).notNull(),
  unitPrice: int("unitPrice").notNull(), // cents
  subtotal: int("subtotal").notNull(), // cents
  taxRate: decimal("taxRate", { precision: 5, scale: 2 }).default("15.00"),
  taxAmount: int("taxAmount").notNull(), // cents
  totalAmount: int("totalAmount").notNull(), // cents
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  invoiceIdIdx: index("idx_invoice_items_invoice_id").on(table.invoiceId),
}));

export const payments = mysqlTable("payments", {
  id: int("id").autoincrement().primaryKey(),
  paymentNumber: varchar("paymentNumber", { length: 50 }).notNull().unique(),
  customerId: int("customerId").notNull().references(() => customers.id),
  paymentDate: timestamp("paymentDate").notNull(),
  amount: int("amount").notNull(), // cents
  paymentMethod: varchar("paymentMethod", { length: 100 }).notNull(), // cash, bank_transfer, check, card
  referenceNumber: varchar("referenceNumber", { length: 200 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  recordedBy: int("recordedBy").references(() => users.id),
}, (table) => ({
  customerIdIdx: index("idx_payments_customer_id").on(table.customerId),
  paymentDateIdx: index("idx_payments_payment_date").on(table.paymentDate),
}));

export const paymentAllocations = mysqlTable("payment_allocations", {
  id: int("id").autoincrement().primaryKey(),
  paymentId: int("paymentId").notNull().references(() => payments.id),
  invoiceId: int("invoiceId").notNull().references(() => invoices.id),
  amount: int("amount").notNull(), // cents
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  paymentIdIdx: index("idx_payment_allocations_payment_id").on(table.paymentId),
  invoiceIdIdx: index("idx_payment_allocations_invoice_id").on(table.invoiceId),
}));

// ============================================================================
// PROCUREMENT & SUPPLIER MANAGEMENT
// ============================================================================

export const suppliers = mysqlTable("suppliers", {
  id: int("id").autoincrement().primaryKey(),
  supplierNumber: varchar("supplierNumber", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  contactPerson: varchar("contactPerson", { length: 200 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 50 }),
  whatsapp: varchar("whatsapp", { length: 50 }),
  preferredContactMethod: mysqlEnum("preferredContactMethod", ["email", "whatsapp", "phone", "both"]).default("email"),
  category: varchar("category", { length: 100 }), // chicks, feed_ingredients, cleaning, biosecurity, etc.
  paymentTerms: varchar("paymentTerms", { length: 100 }).default("cash"),
  taxNumber: varchar("taxNumber", { length: 100 }),
  bankName: varchar("bankName", { length: 200 }),
  bankAccountNumber: varchar("bankAccountNumber", { length: 100 }),
  isActive: boolean("isActive").default(true).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const itemTemplates = mysqlTable("item_templates", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(), // bedding, cleaning, vaccination, biosecurity, feed, chicks
  calculationType: mysqlEnum("calculationType", ["area_based", "bird_count_based", "worker_based", "fixed", "custom"]).notNull(),
  formula: text("formula"), // calculation formula using variables
  bufferPercentage: decimal("bufferPercentage", { precision: 5, scale: 2 }).default("10.00"),
  unit: varchar("unit", { length: 50 }).notNull(),
  conversionFactor: decimal("conversionFactor", { precision: 10, scale: 4 }), // e.g., cubic meters to bales
  orderTriggerDays: int("orderTriggerDays").notNull(), // days before placement
  deliveryLeadDays: int("deliveryLeadDays").default(0), // days between order and delivery
  defaultSupplierId: int("defaultSupplierId").references(() => suppliers.id),
  estimatedUnitCost: int("estimatedUnitCost"), // cents
  isActive: boolean("isActive").default(true).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const procurementSchedules = mysqlTable("procurement_schedules", {
  id: int("id").autoincrement().primaryKey(),
  flockId: int("flockId").notNull().references(() => flocks.id),
  itemTemplateId: int("itemTemplateId").notNull().references(() => itemTemplates.id),
  supplierId: int("supplierId").notNull().references(() => suppliers.id),
  calculatedQuantity: decimal("calculatedQuantity", { precision: 10, scale: 2 }).notNull(),
  adjustedQuantity: decimal("adjustedQuantity", { precision: 10, scale: 2 }), // manual override
  finalQuantity: decimal("finalQuantity", { precision: 10, scale: 2 }).notNull(),
  unit: varchar("unit", { length: 50 }).notNull(),
  estimatedCost: int("estimatedCost"), // cents
  scheduledOrderDate: timestamp("scheduledOrderDate").notNull(),
  scheduledDeliveryDate: timestamp("scheduledDeliveryDate"),
  actualOrderDate: timestamp("actualOrderDate"),
  actualDeliveryDate: timestamp("actualDeliveryDate"),
  status: mysqlEnum("status", ["pending", "ordered", "confirmed", "delivered", "cancelled"]).default("pending").notNull(),
  orderReference: varchar("orderReference", { length: 200 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  flockIdIdx: index("idx_procurement_schedules_flock_id").on(table.flockId),
  statusIdx: index("idx_procurement_schedules_status").on(table.status),
  scheduledOrderDateIdx: index("idx_procurement_schedules_order_date").on(table.scheduledOrderDate),
}));

export const procurementOrders = mysqlTable("procurement_orders", {
  id: int("id").autoincrement().primaryKey(),
  orderNumber: varchar("orderNumber", { length: 50 }).notNull().unique(),
  supplierId: int("supplierId").notNull().references(() => suppliers.id),
  orderDate: timestamp("orderDate").notNull(),
  expectedDeliveryDate: timestamp("expectedDeliveryDate"),
  actualDeliveryDate: timestamp("actualDeliveryDate"),
  totalAmount: int("totalAmount"), // cents
  status: mysqlEnum("status", ["draft", "sent", "confirmed", "delivered", "cancelled"]).default("draft").notNull(),
  sentVia: mysqlEnum("sentVia", ["email", "whatsapp", "phone", "manual"]),
  sentAt: timestamp("sentAt"),
  confirmedAt: timestamp("confirmedAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy").references(() => users.id),
}, (table) => ({
  supplierIdIdx: index("idx_procurement_orders_supplier_id").on(table.supplierId),
  orderDateIdx: index("idx_procurement_orders_order_date").on(table.orderDate),
}));

export const procurementOrderItems = mysqlTable("procurement_order_items", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull().references(() => procurementOrders.id),
  scheduleId: int("scheduleId").references(() => procurementSchedules.id),
  description: varchar("description", { length: 500 }).notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unit: varchar("unit", { length: 50 }).notNull(),
  unitPrice: int("unitPrice"), // cents
  totalAmount: int("totalAmount"), // cents
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  orderIdIdx: index("idx_procurement_order_items_order_id").on(table.orderId),
}));

// ============================================================================
// FINANCIAL ACCOUNTING
// ============================================================================

export const chartOfAccounts = mysqlTable("chart_of_accounts", {
  id: int("id").autoincrement().primaryKey(),
  accountNumber: varchar("accountNumber", { length: 50 }).notNull().unique(),
  accountName: varchar("accountName", { length: 200 }).notNull(),
  accountType: mysqlEnum("accountType", ["asset", "liability", "equity", "revenue", "expense"]).notNull(),
  accountSubtype: varchar("accountSubtype", { length: 100 }),
  parentAccountId: int("parentAccountId"),
  isActive: boolean("isActive").default(true).notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  accountTypeIdx: index("idx_chart_of_accounts_type").on(table.accountType),
}));

export const generalLedgerEntries = mysqlTable("general_ledger_entries", {
  id: int("id").autoincrement().primaryKey(),
  entryNumber: varchar("entryNumber", { length: 50 }).notNull().unique(),
  entryDate: timestamp("entryDate").notNull(),
  accountId: int("accountId").notNull().references(() => chartOfAccounts.id),
  debit: int("debit").default(0).notNull(), // cents
  credit: int("credit").default(0).notNull(), // cents
  description: varchar("description", { length: 500 }).notNull(),
  referenceType: varchar("referenceType", { length: 50 }), // invoice, payment, procurement_order, etc.
  referenceId: int("referenceId"),
  isReconciled: boolean("isReconciled").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  createdBy: int("createdBy").references(() => users.id),
}, (table) => ({
  accountIdIdx: index("idx_general_ledger_entries_account_id").on(table.accountId),
  entryDateIdx: index("idx_general_ledger_entries_entry_date").on(table.entryDate),
}));

// ============================================================================
// INVENTORY MANAGEMENT
// ============================================================================

export const inventoryItems = mysqlTable("inventory_items", {
  id: int("id").autoincrement().primaryKey(),
  itemNumber: varchar("itemNumber", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  category: mysqlEnum("category", ["live_birds", "feed", "raw_materials", "supplies", "equipment"]).notNull(),
  unit: varchar("unit", { length: 50 }).notNull(),
  currentStock: decimal("currentStock", { precision: 10, scale: 2 }).default("0").notNull(),
  reorderPoint: decimal("reorderPoint", { precision: 10, scale: 2 }),
  unitCost: int("unitCost"), // cents, average cost
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const inventoryLocations = mysqlTable("inventory_locations", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull().unique(),
  locationType: mysqlEnum("locationType", ["house", "warehouse", "silo", "cold_storage", "other"]).notNull(),
  description: text("description"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const inventoryTransactions = mysqlTable("inventory_transactions", {
  id: int("id").autoincrement().primaryKey(),
  itemId: int("itemId").notNull().references(() => inventoryItems.id),
  locationId: int("locationId").references(() => inventoryLocations.id),
  transactionType: mysqlEnum("transactionType", ["receipt", "issue", "transfer", "adjustment"]).notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unitCost: int("unitCost"), // cents
  totalCost: int("totalCost"), // cents
  referenceType: varchar("referenceType", { length: 50 }),
  referenceId: int("referenceId"),
  notes: text("notes"),
  transactionDate: timestamp("transactionDate").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  createdBy: int("createdBy").references(() => users.id),
}, (table) => ({
  itemIdIdx: index("idx_inventory_transactions_item_id").on(table.itemId),
  transactionDateIdx: index("idx_inventory_transactions_date").on(table.transactionDate),
}));

// ============================================================================
// DOCUMENT MANAGEMENT
// ============================================================================

export const documents = mysqlTable("documents", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  category: mysqlEnum("category", [
    "contract", "certificate", "lab_report", "invoice", "compliance",
    "vaccination_record", "biosecurity", "financial_statement", "other"
  ]).notNull(),
  fileKey: varchar("fileKey", { length: 500 }).notNull(), // S3 key
  fileUrl: varchar("fileUrl", { length: 1000 }).notNull(), // S3 URL
  fileName: varchar("fileName", { length: 500 }).notNull(),
  fileSize: int("fileSize"), // bytes
  mimeType: varchar("mimeType", { length: 100 }),
  tags: text("tags"), // JSON array
  relatedEntityType: varchar("relatedEntityType", { length: 50 }), // customer, flock, supplier, etc.
  relatedEntityId: int("relatedEntityId"),
  expiryDate: timestamp("expiryDate"),
  status: mysqlEnum("status", ["active", "archived", "expired"]).default("active").notNull(),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
  uploadedBy: int("uploadedBy").references(() => users.id),
}, (table) => ({
  categoryIdx: index("idx_documents_category").on(table.category),
  relatedEntityIdx: index("idx_documents_related_entity").on(table.relatedEntityType, table.relatedEntityId),
}));

// ============================================================================
// REMINDERS & ALERTS
// ============================================================================

export const reminders = mysqlTable("reminders", {
  id: int("id").autoincrement().primaryKey(),
  flockId: int("flockId").references(() => flocks.id),
  houseId: int("houseId").references(() => houses.id),
  reminderType: mysqlEnum("reminderType", [
    "vaccination",
    "feed_transition",
    "house_preparation",
    "environmental_check",
    "routine_task",
    "milestone",
    "biosecurity",
    "performance_alert",
    "house_light_timing"
  ]).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  dueDate: timestamp("dueDate").notNull(),
  priority: mysqlEnum("priority", ["urgent", "high", "medium", "low"]).default("medium").notNull(),
  status: mysqlEnum("status", ["pending", "completed", "dismissed"]).default("pending").notNull(),
  completedAt: timestamp("completedAt"),
  completedBy: int("completedBy").references(() => users.id),
  templateId: int("templateId").references(() => reminderTemplates.id),
  actionNotes: text("actionNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  flockIdIdx: index("idx_reminders_flock_id").on(table.flockId),
  houseIdIdx: index("idx_reminders_house_id").on(table.houseId),
  dueDateIdx: index("idx_reminders_due_date").on(table.dueDate),
  statusIdx: index("idx_reminders_status").on(table.status),
}));

/**
 * Reminder templates - reusable reminder definitions that can be applied to flocks
 */
export const reminderTemplates = mysqlTable("reminder_templates", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  reminderType: mysqlEnum("reminderType", [
    "vaccination",
    "feed_transition",
    "house_preparation",
    "environmental_check",
    "routine_task",
    "milestone",
    "biosecurity",
    "performance_alert",
    "house_light_timing"
  ]).notNull(),
  priority: mysqlEnum("priority", ["urgent", "high", "medium", "low"]).default("medium").notNull(),
  dayOffset: int("day_offset").notNull(), // Days relative to flock placement (0 = placement day, 7 = day 7, etc.)
  isBundle: boolean("is_bundle").default(false).notNull(), // True if this template generates multiple reminders
  bundleConfig: json("bundle_config"), // JSON array of sub-reminder configurations for bundle templates
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ============================================================================
// HEALTH MANAGEMENT
// ============================================================================

/**
 * Vaccine database - stores information about available vaccines
 */
export const vaccines = mysqlTable("vaccines", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  brand: varchar("brand", { length: 255 }).notNull(),
  manufacturer: varchar("manufacturer", { length: 255 }),
  diseaseType: mysqlEnum("disease_type", ["newcastle_disease", "infectious_bronchitis", "gumboro", "mareks", "coccidiosis", "fowl_pox", "other"]).notNull(),
  vaccineType: mysqlEnum("vaccine_type", ["live", "inactivated", "recombinant", "vector"]).notNull(),
  applicationMethod: mysqlEnum("application_method", ["drinking_water", "spray", "eye_drop", "injection", "wing_web"]).notNull(),
  dosagePerBird: varchar("dosage_per_bird", { length: 100 }),
  boosterIntervalDays: int("booster_interval_days"),
  instructions: text("instructions"),
  storageTemperature: varchar("storage_temperature", { length: 100 }),
  shelfLifeDays: int("shelf_life_days"),
  withdrawalPeriodDays: int("withdrawal_period_days").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * Stress pack database - stores information about stress pack products
 */
export const stressPacks = mysqlTable("stress_packs", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  brand: varchar("brand", { length: 255 }).notNull(),
  manufacturer: varchar("manufacturer", { length: 255 }),
  activeIngredients: text("active_ingredients"),
  dosageStrength: mysqlEnum("dosage_strength", ["single", "double", "triple"]).default("single"),
  dosagePerLiter: varchar("dosage_per_liter", { length: 100 }),
  recommendedDurationDays: int("recommended_duration_days"),
  instructions: text("instructions"),
  costPerKg: varchar("cost_per_kg", { length: 20 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * Flock vaccination schedules - tracks vaccination schedule for each flock
 */
export const flockVaccinationSchedules = mysqlTable("flock_vaccination_schedules", {
  id: int("id").autoincrement().primaryKey(),
  flockId: int("flock_id").notNull(),
  vaccineId: int("vaccine_id").notNull(),
  scheduledDay: int("scheduled_day").notNull(),
  status: mysqlEnum("status", ["scheduled", "completed", "missed", "rescheduled"]).default("scheduled"),
  actualDate: timestamp("actual_date"),
  dosageUsed: varchar("dosage_used", { length: 100 }),
  notes: text("notes"),
  administeredBy: int("administered_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * Flock stress pack schedules - tracks stress pack application for each flock
 */
export const flockStressPackSchedules = mysqlTable("flock_stress_pack_schedules", {
  id: int("id").autoincrement().primaryKey(),
  flockId: int("flock_id").notNull(),
  stressPackId: int("stress_pack_id").notNull(),
  startDay: int("start_day").notNull(),
  endDay: int("end_day").notNull(),
  dosageStrength: mysqlEnum("dosage_strength", ["single", "double", "triple"]).default("single"),
  status: mysqlEnum("status", ["scheduled", "active", "completed", "cancelled"]).default("scheduled"),
  quantityUsed: varchar("quantity_used", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * Health protocol templates - reusable vaccination and stress pack schedules
 * Stores a complete health protocol that can be applied to new flocks
 */
export const healthProtocolTemplates = mysqlTable("health_protocol_templates", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  // JSON array of vaccination schedules: [{ vaccineId: number, scheduledDay: number }]
  vaccinationSchedules: json("vaccination_schedules"),
  // JSON array of stress pack schedules: [{ stressPackId: number, startDay: number, endDay: number, dosageStrength: string }]
  stressPackSchedules: json("stress_pack_schedules"),
  isDefault: boolean("is_default").default(false),
  isActive: boolean("is_active").default(true),
  createdBy: int("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type House = typeof houses.$inferSelect;
export type InsertHouse = typeof houses.$inferInsert;

export type Flock = typeof flocks.$inferSelect;
export type InsertFlock = typeof flocks.$inferInsert;

export type FlockDailyRecord = typeof flockDailyRecords.$inferSelect;
export type InsertFlockDailyRecord = typeof flockDailyRecords.$inferInsert;

export type VaccinationSchedule = typeof vaccinationSchedules.$inferSelect;
export type InsertVaccinationSchedule = typeof vaccinationSchedules.$inferInsert;

export type HealthRecord = typeof healthRecords.$inferSelect;
export type InsertHealthRecord = typeof healthRecords.$inferInsert;

export type FeedFormulation = typeof feedFormulations.$inferSelect;
export type InsertFeedFormulation = typeof feedFormulations.$inferInsert;

export type FeedBatch = typeof feedBatches.$inferSelect;
export type InsertFeedBatch = typeof feedBatches.$inferInsert;

export type RawMaterial = typeof rawMaterials.$inferSelect;
export type InsertRawMaterial = typeof rawMaterials.$inferInsert;

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = typeof customers.$inferInsert;

export type SalesOrder = typeof salesOrders.$inferSelect;
export type InsertSalesOrder = typeof salesOrders.$inferInsert;

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = typeof invoices.$inferInsert;

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;

export type Supplier = typeof suppliers.$inferSelect;
export type InsertSupplier = typeof suppliers.$inferInsert;

export type ItemTemplate = typeof itemTemplates.$inferSelect;
export type InsertItemTemplate = typeof itemTemplates.$inferInsert;

export type ProcurementSchedule = typeof procurementSchedules.$inferSelect;
export type InsertProcurementSchedule = typeof procurementSchedules.$inferInsert;

export type ProcurementOrder = typeof procurementOrders.$inferSelect;
export type InsertProcurementOrder = typeof procurementOrders.$inferInsert;

export type ChartOfAccount = typeof chartOfAccounts.$inferSelect;
export type InsertChartOfAccount = typeof chartOfAccounts.$inferInsert;

export type GeneralLedgerEntry = typeof generalLedgerEntries.$inferSelect;
export type InsertGeneralLedgerEntry = typeof generalLedgerEntries.$inferInsert;

export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InsertInventoryItem = typeof inventoryItems.$inferInsert;

export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;

export type Reminder = typeof reminders.$inferSelect;
export type InsertReminder = typeof reminders.$inferInsert;

export type Vaccine = typeof vaccines.$inferSelect;
export type InsertVaccine = typeof vaccines.$inferInsert;

export type StressPack = typeof stressPacks.$inferSelect;
export type InsertStressPack = typeof stressPacks.$inferInsert;

export type FlockVaccinationSchedule = typeof flockVaccinationSchedules.$inferSelect;
export type InsertFlockVaccinationSchedule = typeof flockVaccinationSchedules.$inferInsert;

export type FlockStressPackSchedule = typeof flockStressPackSchedules.$inferSelect;
export type InsertFlockStressPackSchedule = typeof flockStressPackSchedules.$inferInsert;
