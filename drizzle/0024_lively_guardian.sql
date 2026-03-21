CREATE TABLE `catch_batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`crateTypeId` int NOT NULL,
	`batchNumber` int NOT NULL,
	`numberOfCrates` int NOT NULL,
	`birdsPerCrate` int NOT NULL,
	`totalBirds` int NOT NULL,
	`totalGrossWeight` decimal(10,3) NOT NULL,
	`crateWeight` decimal(8,3) NOT NULL,
	`palletWeight` decimal(8,3),
	`totalNetWeight` decimal(10,3) NOT NULL,
	`averageBirdWeight` decimal(8,3) NOT NULL,
	`recordedAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `catch_configurations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`flockId` int NOT NULL,
	`targetDeliveredWeight` decimal(10,3) NOT NULL,
	`calculatedCatchingWeight` decimal(10,3) NOT NULL,
	`feedWithdrawalLossPercent` decimal(5,2) NOT NULL DEFAULT '4.00',
	`catchingLoadingLossPercent` decimal(5,2) NOT NULL DEFAULT '0.70',
	`transportLossPercentPerHour` decimal(5,2) NOT NULL DEFAULT '0.30',
	`lairageLossPercent` decimal(5,2) NOT NULL DEFAULT '0.20',
	`transportDurationHours` decimal(5,2) NOT NULL DEFAULT '2.00',
	`totalShrinkagePercent` decimal(5,2) NOT NULL,
	`plannedCatchDates` text,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdBy` int
);
--> statement-breakpoint
CREATE TABLE `catch_crates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`crateTypeId` int NOT NULL,
	`batchId` varchar(50),
	`crateNumber` int NOT NULL,
	`birdCount` int NOT NULL,
	`grossWeight` decimal(8,3) NOT NULL,
	`netWeight` decimal(8,3) NOT NULL,
	`averageBirdWeight` decimal(8,3) NOT NULL,
	`recordedAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `catch_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`flockId` int NOT NULL,
	`catchDate` timestamp NOT NULL,
	`catchTeam` varchar(200),
	`targetBirds` int,
	`targetWeight` decimal(10,3),
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`startTime` timestamp NOT NULL,
	`endTime` timestamp,
	`totalBirdsCaught` int NOT NULL DEFAULT 0,
	`totalNetWeight` decimal(10,3) NOT NULL DEFAULT '0.000',
	`totalCrates` int NOT NULL DEFAULT 0,
	`averageBirdWeight` decimal(8,3),
	`harvestRecordId` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdBy` int,
	`weighingMethod` enum('individual','digital_scale_stack','platform_scale') NOT NULL DEFAULT 'individual',
	`palletWeight` decimal(6,3),
	`crateTypeId` int,
	`transportDurationHours` decimal(4,1),
	`season` varchar(20),
	`plannedStandardDensity` int,
	`plannedStandardCrates` int,
	`plannedOddDensity` int,
	`plannedOddCrates` int,
	`plannedTotalBirds` int,
	`availableCrates` int
);
--> statement-breakpoint
CREATE TABLE `crate_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`length` decimal(6,2) NOT NULL,
	`width` decimal(6,2) NOT NULL,
	`height` decimal(6,2) NOT NULL,
	`tareWeight` decimal(6,3) NOT NULL,
	`isActive` tinyint NOT NULL DEFAULT 1,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `harvest_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`flockId` int NOT NULL,
	`harvestDate` timestamp NOT NULL,
	`harvestStartTime` timestamp NOT NULL,
	`harvestDurationMinutes` int,
	`feedWithdrawalStartTime` timestamp,
	`feedWithdrawalDurationHours` decimal(5,2),
	`destination` varchar(255),
	`chickenCountLoaded` int NOT NULL,
	`totalLoadedWeightKg` decimal(10,3) NOT NULL,
	`averageLoadedWeightKg` decimal(10,3),
	`totalCrates` int,
	`oddCrateCount` int,
	`oddCrateWeightKg` decimal(10,3),
	`transportDepartTime` timestamp,
	`transportArrivalTime` timestamp,
	`travelDurationHours` decimal(5,2),
	`chickenCountDelivered` int,
	`totalDeliveredWeightKg` decimal(10,3),
	`averageDeliveredWeightKg` decimal(10,3),
	`transportMortalities` int DEFAULT 0,
	`shrinkagePercentage` decimal(5,2),
	`pricePerKg` decimal(10,2),
	`totalRevenue` decimal(12,2),
	`paymentTerms` varchar(100),
	`invoiceReference` varchar(100),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`recordedBy` int
);
--> statement-breakpoint
CREATE TABLE `inventory_stock` (
	`id` int AUTO_INCREMENT NOT NULL,
	`itemId` int NOT NULL,
	`locationId` int NOT NULL,
	`quantity` decimal(10,2) NOT NULL DEFAULT '0',
	`lastUpdated` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`updatedBy` int
);
--> statement-breakpoint
CREATE TABLE `processors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`contactPerson` varchar(255),
	`email` varchar(320),
	`phone` varchar(50),
	`physicalAddress` text,
	`gpsLatitude` decimal(10,7),
	`gpsLongitude` decimal(10,7),
	`paymentTerms` varchar(100),
	`defaultPricePerKg` decimal(10,2),
	`averageTravelTimeHours` decimal(5,2),
	`operatingDays` varchar(100),
	`operatingHours` varchar(100),
	`notes` text,
	`isActive` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdBy` int
);
--> statement-breakpoint
ALTER TABLE `chart_of_accounts` DROP INDEX `chart_of_accounts_accountNumber_unique`;--> statement-breakpoint
ALTER TABLE `customers` DROP INDEX `customers_customerNumber_unique`;--> statement-breakpoint
ALTER TABLE `feed_batches` DROP INDEX `feed_batches_batchNumber_unique`;--> statement-breakpoint
ALTER TABLE `flocks` DROP INDEX `flocks_flockNumber_unique`;--> statement-breakpoint
ALTER TABLE `general_ledger_entries` DROP INDEX `general_ledger_entries_entryNumber_unique`;--> statement-breakpoint
ALTER TABLE `houses` DROP INDEX `houses_name_unique`;--> statement-breakpoint
ALTER TABLE `inventory_items` DROP INDEX `inventory_items_itemNumber_unique`;--> statement-breakpoint
ALTER TABLE `inventory_locations` DROP INDEX `inventory_locations_name_unique`;--> statement-breakpoint
ALTER TABLE `invoices` DROP INDEX `invoices_invoiceNumber_unique`;--> statement-breakpoint
ALTER TABLE `payments` DROP INDEX `payments_paymentNumber_unique`;--> statement-breakpoint
ALTER TABLE `procurement_orders` DROP INDEX `procurement_orders_orderNumber_unique`;--> statement-breakpoint
ALTER TABLE `raw_materials` DROP INDEX `raw_materials_name_unique`;--> statement-breakpoint
ALTER TABLE `sales_orders` DROP INDEX `sales_orders_orderNumber_unique`;--> statement-breakpoint
ALTER TABLE `suppliers` DROP INDEX `suppliers_supplierNumber_unique`;--> statement-breakpoint
ALTER TABLE `users` DROP INDEX `users_openId_unique`;--> statement-breakpoint
ALTER TABLE `users` DROP INDEX `users_username_unique`;--> statement-breakpoint
ALTER TABLE `users` DROP INDEX `users_email_unique`;--> statement-breakpoint
ALTER TABLE `chart_of_accounts` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `customer_addresses` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `customers` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `documents` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `feed_batches` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `feed_formulations` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `flock_daily_records` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `flock_stress_pack_schedules` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `flock_vaccination_schedules` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `flocks` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `general_ledger_entries` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `health_protocol_templates` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `health_records` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `houses` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `inventory_items` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `inventory_locations` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `inventory_transactions` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `invoice_items` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `invoices` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `item_templates` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `mortality_records` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `payment_allocations` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `payments` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `procurement_order_items` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `procurement_orders` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `procurement_schedules` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `quality_control_records` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `raw_material_transactions` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `raw_materials` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `reminder_templates` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `reminders` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `sales_order_items` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `sales_orders` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `stress_packs` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `suppliers` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `user_activity_logs` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `users` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `vaccination_schedules` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `vaccines` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `chart_of_accounts` MODIFY COLUMN `isActive` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `chart_of_accounts` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `customer_addresses` MODIFY COLUMN `isDefault` tinyint;--> statement-breakpoint
ALTER TABLE `customer_addresses` MODIFY COLUMN `isDefault` tinyint DEFAULT 0;--> statement-breakpoint
ALTER TABLE `customer_addresses` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `customers` MODIFY COLUMN `isActive` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `customers` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `documents` MODIFY COLUMN `uploadedAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `feed_batches` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `feed_formulations` MODIFY COLUMN `isActive` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `feed_formulations` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `flock_daily_records` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `flock_stress_pack_schedules` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `flock_vaccination_schedules` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `flocks` MODIFY COLUMN `status` enum('planned','active','harvesting','completed','cancelled') NOT NULL DEFAULT 'planned';--> statement-breakpoint
ALTER TABLE `flocks` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `general_ledger_entries` MODIFY COLUMN `isReconciled` tinyint;--> statement-breakpoint
ALTER TABLE `general_ledger_entries` MODIFY COLUMN `isReconciled` tinyint DEFAULT 0;--> statement-breakpoint
ALTER TABLE `general_ledger_entries` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `health_protocol_templates` MODIFY COLUMN `is_default` tinyint;--> statement-breakpoint
ALTER TABLE `health_protocol_templates` MODIFY COLUMN `is_default` tinyint DEFAULT 0;--> statement-breakpoint
ALTER TABLE `health_protocol_templates` MODIFY COLUMN `is_active` tinyint DEFAULT 1;--> statement-breakpoint
ALTER TABLE `health_protocol_templates` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `health_records` MODIFY COLUMN `followUpRequired` tinyint;--> statement-breakpoint
ALTER TABLE `health_records` MODIFY COLUMN `followUpRequired` tinyint DEFAULT 0;--> statement-breakpoint
ALTER TABLE `health_records` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `houses` MODIFY COLUMN `isActive` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `houses` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `inventory_items` MODIFY COLUMN `isActive` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `inventory_items` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `inventory_locations` MODIFY COLUMN `isActive` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `inventory_locations` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `inventory_transactions` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `invoice_items` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `invoices` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `item_templates` MODIFY COLUMN `isActive` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `item_templates` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `mortality_records` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `payment_allocations` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `payments` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `procurement_order_items` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `procurement_orders` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `procurement_schedules` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `quality_control_records` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `raw_material_transactions` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `raw_materials` MODIFY COLUMN `isActive` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `raw_materials` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `reminder_templates` MODIFY COLUMN `is_bundle` tinyint NOT NULL;--> statement-breakpoint
ALTER TABLE `reminder_templates` MODIFY COLUMN `is_bundle` tinyint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `reminder_templates` MODIFY COLUMN `is_active` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `reminder_templates` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `reminders` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `sales_order_items` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `sales_orders` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `stress_packs` MODIFY COLUMN `is_active` tinyint DEFAULT 1;--> statement-breakpoint
ALTER TABLE `stress_packs` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `suppliers` MODIFY COLUMN `isActive` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `suppliers` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `user_activity_logs` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('admin','farm_manager','accountant','sales_staff','production_worker','chicken_house_operator') NOT NULL DEFAULT 'production_worker';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `isActive` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `mustChangePassword` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `vaccination_schedules` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `vaccines` MODIFY COLUMN `is_active` tinyint DEFAULT 1;--> statement-breakpoint
ALTER TABLE `vaccines` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `flocks` ADD `targetDeliveredWeight` decimal(10,3);--> statement-breakpoint
ALTER TABLE `flocks` ADD `targetCatchingWeight` decimal(10,3);--> statement-breakpoint
ALTER TABLE `flocks` ADD `catchPlan` json;--> statement-breakpoint
ALTER TABLE `health_records` ADD `notes` text;--> statement-breakpoint
ALTER TABLE `houses` ADD `mortality_rate` decimal(5,2) DEFAULT '4.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `houses` ADD `target_slaughter_weight` decimal(5,2) DEFAULT '1.90' NOT NULL;--> statement-breakpoint
ALTER TABLE `houses` ADD `density_kg_per_sqm` decimal(5,2);--> statement-breakpoint
ALTER TABLE `inventory_items` ADD `primary_class` varchar(2);--> statement-breakpoint
ALTER TABLE `inventory_items` ADD `sub_type` varchar(2);--> statement-breakpoint
ALTER TABLE `inventory_items` ADD `form` varchar(3);--> statement-breakpoint
ALTER TABLE `inventory_items` ADD `long_description` text;--> statement-breakpoint
ALTER TABLE `inventory_items` ADD `item_status` enum('active','inactive','discontinued','obsolete') DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `inventory_items` ADD `item_type` enum('stocked_item','non_stocked','service','raw_material','finished_good','consumable') DEFAULT 'stocked_item' NOT NULL;--> statement-breakpoint
ALTER TABLE `inventory_items` ADD `barcode` varchar(100);--> statement-breakpoint
ALTER TABLE `inventory_items` ADD `manufacturer_part_number` varchar(100);--> statement-breakpoint
ALTER TABLE `inventory_items` ADD `internal_reference` varchar(100);--> statement-breakpoint
ALTER TABLE `inventory_items` ADD `supplier_part_number` varchar(100);--> statement-breakpoint
ALTER TABLE `inventory_items` ADD `brand` varchar(100);--> statement-breakpoint
ALTER TABLE `inventory_items` ADD `model` varchar(100);--> statement-breakpoint
ALTER TABLE `inventory_items` ADD `bagSizeKg` decimal(10,2);--> statement-breakpoint
ALTER TABLE `catch_batches` ADD CONSTRAINT `catch_batches_sessionId_catch_sessions_id_fk` FOREIGN KEY (`sessionId`) REFERENCES `catch_sessions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `catch_batches` ADD CONSTRAINT `catch_batches_crateTypeId_crate_types_id_fk` FOREIGN KEY (`crateTypeId`) REFERENCES `crate_types`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `catch_configurations` ADD CONSTRAINT `catch_configurations_flockId_flocks_id_fk` FOREIGN KEY (`flockId`) REFERENCES `flocks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `catch_configurations` ADD CONSTRAINT `catch_configurations_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `catch_crates` ADD CONSTRAINT `catch_crates_sessionId_catch_sessions_id_fk` FOREIGN KEY (`sessionId`) REFERENCES `catch_sessions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `catch_crates` ADD CONSTRAINT `catch_crates_crateTypeId_crate_types_id_fk` FOREIGN KEY (`crateTypeId`) REFERENCES `crate_types`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `catch_sessions` ADD CONSTRAINT `catch_sessions_flockId_flocks_id_fk` FOREIGN KEY (`flockId`) REFERENCES `flocks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `catch_sessions` ADD CONSTRAINT `catch_sessions_harvestRecordId_harvest_records_id_fk` FOREIGN KEY (`harvestRecordId`) REFERENCES `harvest_records`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `catch_sessions` ADD CONSTRAINT `catch_sessions_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `catch_sessions` ADD CONSTRAINT `catch_sessions_crateTypeId_crate_types_id_fk` FOREIGN KEY (`crateTypeId`) REFERENCES `crate_types`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `harvest_records` ADD CONSTRAINT `harvest_records_flockId_flocks_id_fk` FOREIGN KEY (`flockId`) REFERENCES `flocks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `harvest_records` ADD CONSTRAINT `harvest_records_recordedBy_users_id_fk` FOREIGN KEY (`recordedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_stock` ADD CONSTRAINT `inventory_stock_itemId_inventory_items_id_fk` FOREIGN KEY (`itemId`) REFERENCES `inventory_items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_stock` ADD CONSTRAINT `inventory_stock_locationId_inventory_locations_id_fk` FOREIGN KEY (`locationId`) REFERENCES `inventory_locations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_stock` ADD CONSTRAINT `inventory_stock_updatedBy_users_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `processors` ADD CONSTRAINT `processors_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_catch_batches_session_id` ON `catch_batches` (`sessionId`);--> statement-breakpoint
CREATE INDEX `idx_catch_batches_crate_type_id` ON `catch_batches` (`crateTypeId`);--> statement-breakpoint
CREATE INDEX `flockId` ON `catch_configurations` (`flockId`);--> statement-breakpoint
CREATE INDEX `idx_catch_config_flock_id` ON `catch_configurations` (`flockId`);--> statement-breakpoint
CREATE INDEX `idx_catch_crates_session_id` ON `catch_crates` (`sessionId`);--> statement-breakpoint
CREATE INDEX `idx_catch_crates_crate_type_id` ON `catch_crates` (`crateTypeId`);--> statement-breakpoint
CREATE INDEX `idx_catch_sessions_flock_id` ON `catch_sessions` (`flockId`);--> statement-breakpoint
CREATE INDEX `idx_catch_sessions_catch_date` ON `catch_sessions` (`catchDate`);--> statement-breakpoint
CREATE INDEX `idx_catch_sessions_status` ON `catch_sessions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_crate_types_name` ON `crate_types` (`name`);--> statement-breakpoint
CREATE INDEX `idx_harvest_records_flock_id` ON `harvest_records` (`flockId`);--> statement-breakpoint
CREATE INDEX `idx_harvest_records_harvest_date` ON `harvest_records` (`harvestDate`);--> statement-breakpoint
CREATE INDEX `unique_item_location` ON `inventory_stock` (`itemId`,`locationId`);--> statement-breakpoint
CREATE INDEX `idx_inventory_stock_item_location` ON `inventory_stock` (`itemId`,`locationId`);--> statement-breakpoint
CREATE INDEX `name` ON `processors` (`name`);--> statement-breakpoint
CREATE INDEX `chart_of_accounts_accountNumber_unique` ON `chart_of_accounts` (`accountNumber`);--> statement-breakpoint
CREATE INDEX `customers_customerNumber_unique` ON `customers` (`customerNumber`);--> statement-breakpoint
CREATE INDEX `feed_batches_batchNumber_unique` ON `feed_batches` (`batchNumber`);--> statement-breakpoint
CREATE INDEX `flocks_flockNumber_unique` ON `flocks` (`flockNumber`);--> statement-breakpoint
CREATE INDEX `general_ledger_entries_entryNumber_unique` ON `general_ledger_entries` (`entryNumber`);--> statement-breakpoint
CREATE INDEX `houses_name_unique` ON `houses` (`name`);--> statement-breakpoint
CREATE INDEX `inventory_items_itemNumber_unique` ON `inventory_items` (`itemNumber`);--> statement-breakpoint
CREATE INDEX `idx_inventory_items_barcode` ON `inventory_items` (`barcode`);--> statement-breakpoint
CREATE INDEX `idx_inventory_items_status` ON `inventory_items` (`item_status`);--> statement-breakpoint
CREATE INDEX `idx_inventory_items_type` ON `inventory_items` (`item_type`);--> statement-breakpoint
CREATE INDEX `idx_inventory_items_brand` ON `inventory_items` (`brand`);--> statement-breakpoint
CREATE INDEX `idx_inventory_items_mpn` ON `inventory_items` (`manufacturer_part_number`);--> statement-breakpoint
CREATE INDEX `inventory_locations_name_unique` ON `inventory_locations` (`name`);--> statement-breakpoint
CREATE INDEX `invoices_invoiceNumber_unique` ON `invoices` (`invoiceNumber`);--> statement-breakpoint
CREATE INDEX `payments_paymentNumber_unique` ON `payments` (`paymentNumber`);--> statement-breakpoint
CREATE INDEX `procurement_orders_orderNumber_unique` ON `procurement_orders` (`orderNumber`);--> statement-breakpoint
CREATE INDEX `raw_materials_name_unique` ON `raw_materials` (`name`);--> statement-breakpoint
CREATE INDEX `sales_orders_orderNumber_unique` ON `sales_orders` (`orderNumber`);--> statement-breakpoint
CREATE INDEX `suppliers_supplierNumber_unique` ON `suppliers` (`supplierNumber`);--> statement-breakpoint
CREATE INDEX `users_openId_unique` ON `users` (`openId`);--> statement-breakpoint
CREATE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE INDEX `users_email_unique` ON `users` (`email`);