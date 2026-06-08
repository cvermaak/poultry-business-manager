import { relations } from "drizzle-orm/relations";
import { catchSessions, catchBatches, crateTypes, flocks, catchConfigurations, users, catchCrates, harvestRecords, customers, customerAddresses, documents, feedFormulations, feedBatches, flockDailyRecords, houses, chartOfAccounts, generalLedgerEntries, healthProtocolTemplates, healthRecords, inventoryItems, inventoryStock, inventoryLocations, inventoryTransactions, invoices, invoiceItems, invoiceLineItems, salesOrders, suppliers, itemTemplates, mortalityRecords, payments, paymentAllocations, processors, procurementOrders, procurementOrderItems, procurementSchedules, qualityControlRecords, rawMaterials, rawMaterialTransactions, reminders, reminderTemplates, salesOrderItems, userActivityLogs, vaccinationSchedules, companySettings } from "./schema";

export const catchBatchesRelations = relations(catchBatches, ({one}) => ({
	catchSession: one(catchSessions, {
		fields: [catchBatches.sessionId],
		references: [catchSessions.id]
	}),
	crateType: one(crateTypes, {
		fields: [catchBatches.crateTypeId],
		references: [crateTypes.id]
	}),
}));

export const catchSessionsRelations = relations(catchSessions, ({one, many}) => ({
	catchBatches: many(catchBatches),
	catchCrates: many(catchCrates),
	flock: one(flocks, {
		fields: [catchSessions.flockId],
		references: [flocks.id]
	}),
	harvestRecord: one(harvestRecords, {
		fields: [catchSessions.harvestRecordId],
		references: [harvestRecords.id]
	}),
	user: one(users, {
		fields: [catchSessions.createdBy],
		references: [users.id]
	}),
	crateType: one(crateTypes, {
		fields: [catchSessions.crateTypeId],
		references: [crateTypes.id]
	}),
}));

export const crateTypesRelations = relations(crateTypes, ({many}) => ({
	catchBatches: many(catchBatches),
	catchCrates: many(catchCrates),
	catchSessions: many(catchSessions),
}));

export const catchConfigurationsRelations = relations(catchConfigurations, ({one}) => ({
	flock: one(flocks, {
		fields: [catchConfigurations.flockId],
		references: [flocks.id]
	}),
	user: one(users, {
		fields: [catchConfigurations.createdBy],
		references: [users.id]
	}),
}));

export const flocksRelations = relations(flocks, ({one, many}) => ({
	catchConfigurations: many(catchConfigurations),
	catchSessions: many(catchSessions),
	flockDailyRecords: many(flockDailyRecords),
	house: one(houses, {
		fields: [flocks.houseId],
		references: [houses.id]
	}),
	user_createdBy: one(users, {
		fields: [flocks.createdBy],
		references: [users.id],
		relationName: "flocks_createdBy_users_id"
	}),
	user_statusChangedBy: one(users, {
		fields: [flocks.statusChangedBy],
		references: [users.id],
		relationName: "flocks_statusChangedBy_users_id"
	}),
	harvestRecords: many(harvestRecords),
	healthRecords: many(healthRecords),
	mortalityRecords: many(mortalityRecords),
	procurementSchedules: many(procurementSchedules),
	reminders: many(reminders),
	salesOrderItems: many(salesOrderItems),
	vaccinationSchedules: many(vaccinationSchedules),
}));

export const usersRelations = relations(users, ({many}) => ({
	catchConfigurations: many(catchConfigurations),
	catchSessions: many(catchSessions),
	customers: many(customers),
	documents: many(documents),
	feedBatches: many(feedBatches),
	feedFormulations: many(feedFormulations),
	flockDailyRecords: many(flockDailyRecords),
	flocks_createdBy: many(flocks, {
		relationName: "flocks_createdBy_users_id"
	}),
	flocks_statusChangedBy: many(flocks, {
		relationName: "flocks_statusChangedBy_users_id"
	}),
	generalLedgerEntries: many(generalLedgerEntries),
	harvestRecords: many(harvestRecords),
	healthProtocolTemplates: many(healthProtocolTemplates),
	healthRecords: many(healthRecords),
	houses: many(houses),
	inventoryStocks: many(inventoryStock),
	inventoryTransactions: many(inventoryTransactions),
	invoices: many(invoices),
	mortalityRecords: many(mortalityRecords),
	payments: many(payments),
	processors: many(processors),
	procurementOrders: many(procurementOrders),
	qualityControlRecords: many(qualityControlRecords),
	rawMaterialTransactions: many(rawMaterialTransactions),
	reminders: many(reminders),
	salesOrders: many(salesOrders),
	userActivityLogs: many(userActivityLogs),
	vaccinationSchedules: many(vaccinationSchedules),
}));

export const catchCratesRelations = relations(catchCrates, ({one}) => ({
	catchSession: one(catchSessions, {
		fields: [catchCrates.sessionId],
		references: [catchSessions.id]
	}),
	crateType: one(crateTypes, {
		fields: [catchCrates.crateTypeId],
		references: [crateTypes.id]
	}),
}));

export const harvestRecordsRelations = relations(harvestRecords, ({one, many}) => ({
	catchSessions: many(catchSessions),
	flock: one(flocks, {
		fields: [harvestRecords.flockId],
		references: [flocks.id]
	}),
	user: one(users, {
		fields: [harvestRecords.recordedBy],
		references: [users.id]
	}),
}));

export const customerAddressesRelations = relations(customerAddresses, ({one, many}) => ({
	customer: one(customers, {
		fields: [customerAddresses.customerId],
		references: [customers.id]
	}),
	salesOrders: many(salesOrders),
}));

export const customersRelations = relations(customers, ({one, many}) => ({
	customerAddresses: many(customerAddresses),
	user: one(users, {
		fields: [customers.createdBy],
		references: [users.id]
	}),
	invoices: many(invoices),
	payments: many(payments),
	salesOrders: many(salesOrders),
}));

export const documentsRelations = relations(documents, ({one}) => ({
	user: one(users, {
		fields: [documents.uploadedBy],
		references: [users.id]
	}),
}));

export const feedBatchesRelations = relations(feedBatches, ({one, many}) => ({
	feedFormulation: one(feedFormulations, {
		fields: [feedBatches.formulationId],
		references: [feedFormulations.id]
	}),
	user: one(users, {
		fields: [feedBatches.createdBy],
		references: [users.id]
	}),
	qualityControlRecords: many(qualityControlRecords),
	salesOrderItems: many(salesOrderItems),
}));

export const feedFormulationsRelations = relations(feedFormulations, ({one, many}) => ({
	feedBatches: many(feedBatches),
	user: one(users, {
		fields: [feedFormulations.createdBy],
		references: [users.id]
	}),
}));

export const flockDailyRecordsRelations = relations(flockDailyRecords, ({one}) => ({
	flock: one(flocks, {
		fields: [flockDailyRecords.flockId],
		references: [flocks.id]
	}),
	user: one(users, {
		fields: [flockDailyRecords.recordedBy],
		references: [users.id]
	}),
}));

export const housesRelations = relations(houses, ({one, many}) => ({
	flocks: many(flocks),
	user: one(users, {
		fields: [houses.createdBy],
		references: [users.id]
	}),
	reminders: many(reminders),
}));

export const generalLedgerEntriesRelations = relations(generalLedgerEntries, ({one}) => ({
	chartOfAccount: one(chartOfAccounts, {
		fields: [generalLedgerEntries.accountId],
		references: [chartOfAccounts.id]
	}),
	user: one(users, {
		fields: [generalLedgerEntries.createdBy],
		references: [users.id]
	}),
}));

export const chartOfAccountsRelations = relations(chartOfAccounts, ({many}) => ({
	generalLedgerEntries: many(generalLedgerEntries),
}));

export const healthProtocolTemplatesRelations = relations(healthProtocolTemplates, ({one}) => ({
	user: one(users, {
		fields: [healthProtocolTemplates.createdBy],
		references: [users.id]
	}),
}));

export const healthRecordsRelations = relations(healthRecords, ({one}) => ({
	flock: one(flocks, {
		fields: [healthRecords.flockId],
		references: [flocks.id]
	}),
	user: one(users, {
		fields: [healthRecords.recordedBy],
		references: [users.id]
	}),
}));

export const inventoryStockRelations = relations(inventoryStock, ({one}) => ({
	inventoryItem: one(inventoryItems, {
		fields: [inventoryStock.itemId],
		references: [inventoryItems.id]
	}),
	inventoryLocation: one(inventoryLocations, {
		fields: [inventoryStock.locationId],
		references: [inventoryLocations.id]
	}),
	user: one(users, {
		fields: [inventoryStock.updatedBy],
		references: [users.id]
	}),
}));

export const inventoryItemsRelations = relations(inventoryItems, ({many}) => ({
	inventoryStocks: many(inventoryStock),
	inventoryTransactions: many(inventoryTransactions),
}));

export const inventoryLocationsRelations = relations(inventoryLocations, ({many}) => ({
	inventoryStocks: many(inventoryStock),
	inventoryTransactions: many(inventoryTransactions),
}));

export const inventoryTransactionsRelations = relations(inventoryTransactions, ({one}) => ({
	inventoryItem: one(inventoryItems, {
		fields: [inventoryTransactions.itemId],
		references: [inventoryItems.id]
	}),
	inventoryLocation: one(inventoryLocations, {
		fields: [inventoryTransactions.locationId],
		references: [inventoryLocations.id]
	}),
	user: one(users, {
		fields: [inventoryTransactions.createdBy],
		references: [users.id]
	}),
}));

export const invoiceItemsRelations = relations(invoiceItems, ({one}) => ({
	invoice: one(invoices, {
		fields: [invoiceItems.invoiceId],
		references: [invoices.id]
	}),
}));

export const invoicesRelations = relations(invoices, ({one, many}) => ({
	invoiceItems: many(invoiceItems),
	invoiceLineItems: many(invoiceLineItems),
	customer: one(customers, {
		fields: [invoices.customerId],
		references: [customers.id]
	}),
	salesOrder: one(salesOrders, {
		fields: [invoices.orderId],
		references: [salesOrders.id]
	}),
	user: one(users, {
		fields: [invoices.createdBy],
		references: [users.id]
	}),
	paymentAllocations: many(paymentAllocations),
}));

export const invoiceLineItemsRelations = relations(invoiceLineItems, ({one}) => ({
	invoice: one(invoices, {
		fields: [invoiceLineItems.invoiceId],
		references: [invoices.id]
	}),
}));

export const salesOrdersRelations = relations(salesOrders, ({one, many}) => ({
	invoices: many(invoices),
	salesOrderItems: many(salesOrderItems),
	customer: one(customers, {
		fields: [salesOrders.customerId],
		references: [customers.id]
	}),
	customerAddress: one(customerAddresses, {
		fields: [salesOrders.deliveryAddressId],
		references: [customerAddresses.id]
	}),
	user: one(users, {
		fields: [salesOrders.createdBy],
		references: [users.id]
	}),
}));

export const itemTemplatesRelations = relations(itemTemplates, ({one, many}) => ({
	supplier: one(suppliers, {
		fields: [itemTemplates.defaultSupplierId],
		references: [suppliers.id]
	}),
	procurementSchedules: many(procurementSchedules),
}));

export const suppliersRelations = relations(suppliers, ({many}) => ({
	itemTemplates: many(itemTemplates),
	procurementOrders: many(procurementOrders),
	procurementSchedules: many(procurementSchedules),
}));

export const mortalityRecordsRelations = relations(mortalityRecords, ({one}) => ({
	flock: one(flocks, {
		fields: [mortalityRecords.flockId],
		references: [flocks.id]
	}),
	user: one(users, {
		fields: [mortalityRecords.recordedBy],
		references: [users.id]
	}),
}));

export const paymentAllocationsRelations = relations(paymentAllocations, ({one}) => ({
	payment: one(payments, {
		fields: [paymentAllocations.paymentId],
		references: [payments.id]
	}),
	invoice: one(invoices, {
		fields: [paymentAllocations.invoiceId],
		references: [invoices.id]
	}),
}));

export const paymentsRelations = relations(payments, ({one, many}) => ({
	paymentAllocations: many(paymentAllocations),
	customer: one(customers, {
		fields: [payments.customerId],
		references: [customers.id]
	}),
	user: one(users, {
		fields: [payments.recordedBy],
		references: [users.id]
	}),
}));

export const processorsRelations = relations(processors, ({one}) => ({
	user: one(users, {
		fields: [processors.createdBy],
		references: [users.id]
	}),
}));

export const procurementOrderItemsRelations = relations(procurementOrderItems, ({one}) => ({
	procurementOrder: one(procurementOrders, {
		fields: [procurementOrderItems.orderId],
		references: [procurementOrders.id]
	}),
	procurementSchedule: one(procurementSchedules, {
		fields: [procurementOrderItems.scheduleId],
		references: [procurementSchedules.id]
	}),
}));

export const procurementOrdersRelations = relations(procurementOrders, ({one, many}) => ({
	procurementOrderItems: many(procurementOrderItems),
	supplier: one(suppliers, {
		fields: [procurementOrders.supplierId],
		references: [suppliers.id]
	}),
	user: one(users, {
		fields: [procurementOrders.createdBy],
		references: [users.id]
	}),
}));

export const procurementSchedulesRelations = relations(procurementSchedules, ({one, many}) => ({
	procurementOrderItems: many(procurementOrderItems),
	flock: one(flocks, {
		fields: [procurementSchedules.flockId],
		references: [flocks.id]
	}),
	itemTemplate: one(itemTemplates, {
		fields: [procurementSchedules.itemTemplateId],
		references: [itemTemplates.id]
	}),
	supplier: one(suppliers, {
		fields: [procurementSchedules.supplierId],
		references: [suppliers.id]
	}),
}));

export const qualityControlRecordsRelations = relations(qualityControlRecords, ({one}) => ({
	feedBatch: one(feedBatches, {
		fields: [qualityControlRecords.batchId],
		references: [feedBatches.id]
	}),
	user: one(users, {
		fields: [qualityControlRecords.testedBy],
		references: [users.id]
	}),
}));

export const rawMaterialTransactionsRelations = relations(rawMaterialTransactions, ({one}) => ({
	rawMaterial: one(rawMaterials, {
		fields: [rawMaterialTransactions.rawMaterialId],
		references: [rawMaterials.id]
	}),
	user: one(users, {
		fields: [rawMaterialTransactions.createdBy],
		references: [users.id]
	}),
}));

export const rawMaterialsRelations = relations(rawMaterials, ({many}) => ({
	rawMaterialTransactions: many(rawMaterialTransactions),
}));

export const remindersRelations = relations(reminders, ({one}) => ({
	flock: one(flocks, {
		fields: [reminders.flockId],
		references: [flocks.id]
	}),
	house: one(houses, {
		fields: [reminders.houseId],
		references: [houses.id]
	}),
	user: one(users, {
		fields: [reminders.completedBy],
		references: [users.id]
	}),
	reminderTemplate: one(reminderTemplates, {
		fields: [reminders.templateId],
		references: [reminderTemplates.id]
	}),
}));

export const reminderTemplatesRelations = relations(reminderTemplates, ({many}) => ({
	reminders: many(reminders),
}));

export const salesOrderItemsRelations = relations(salesOrderItems, ({one}) => ({
	salesOrder: one(salesOrders, {
		fields: [salesOrderItems.orderId],
		references: [salesOrders.id]
	}),
	flock: one(flocks, {
		fields: [salesOrderItems.flockId],
		references: [flocks.id]
	}),
	feedBatch: one(feedBatches, {
		fields: [salesOrderItems.feedBatchId],
		references: [feedBatches.id]
	}),
}));

export const userActivityLogsRelations = relations(userActivityLogs, ({one}) => ({
	user: one(users, {
		fields: [userActivityLogs.userId],
		references: [users.id]
	}),
}));

export const vaccinationSchedulesRelations = relations(vaccinationSchedules, ({one}) => ({
	flock: one(flocks, {
		fields: [vaccinationSchedules.flockId],
		references: [flocks.id]
	}),
	user: one(users, {
		fields: [vaccinationSchedules.administeredBy],
		references: [users.id]
	}),
}));

export const companySettingsRelations = relations(companySettings, ({one}) => ({
	user: one(users, {
		fields: [companySettings.createdBy],
		references: [users.id]
	}),
}));
