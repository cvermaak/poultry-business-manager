CREATE TABLE `chart_of_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountNumber` varchar(50) NOT NULL,
	`accountName` varchar(200) NOT NULL,
	`accountType` enum('asset','liability','equity','revenue','expense') NOT NULL,
	`accountSubtype` varchar(100),
	`parentAccountId` int,
	`isActive` boolean NOT NULL DEFAULT true,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chart_of_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `chart_of_accounts_accountNumber_unique` UNIQUE(`accountNumber`)
);
--> statement-breakpoint
CREATE TABLE `customer_addresses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`addressType` enum('billing','delivery','both') NOT NULL DEFAULT 'both',
	`addressLine1` varchar(200) NOT NULL,
	`addressLine2` varchar(200),
	`city` varchar(100),
	`province` varchar(100),
	`postalCode` varchar(20),
	`country` varchar(100) DEFAULT 'South Africa',
	`isDefault` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customer_addresses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerNumber` varchar(50) NOT NULL,
	`name` varchar(200) NOT NULL,
	`contactPerson` varchar(200),
	`email` varchar(320),
	`phone` varchar(50),
	`whatsapp` varchar(50),
	`segment` enum('wholesale','retail','contract') NOT NULL DEFAULT 'retail',
	`creditLimit` int DEFAULT 0,
	`paymentTerms` varchar(100) DEFAULT 'cash',
	`taxNumber` varchar(100),
	`isActive` boolean NOT NULL DEFAULT true,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdBy` int,
	CONSTRAINT `customers_id` PRIMARY KEY(`id`),
	CONSTRAINT `customers_customerNumber_unique` UNIQUE(`customerNumber`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(500) NOT NULL,
	`description` text,
	`category` enum('contract','certificate','lab_report','invoice','compliance','vaccination_record','biosecurity','financial_statement','other') NOT NULL,
	`fileKey` varchar(500) NOT NULL,
	`fileUrl` varchar(1000) NOT NULL,
	`fileName` varchar(500) NOT NULL,
	`fileSize` int,
	`mimeType` varchar(100),
	`tags` text,
	`relatedEntityType` varchar(50),
	`relatedEntityId` int,
	`expiryDate` timestamp,
	`status` enum('active','archived','expired') NOT NULL DEFAULT 'active',
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	`uploadedBy` int,
	CONSTRAINT `documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `feed_batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batchNumber` varchar(100) NOT NULL,
	`formulationId` int NOT NULL,
	`productionDate` timestamp NOT NULL,
	`quantity` decimal(10,2) NOT NULL,
	`rawMaterialCost` int NOT NULL,
	`laborCost` int DEFAULT 0,
	`overheadCost` int DEFAULT 0,
	`totalCost` int NOT NULL,
	`costPerTon` int NOT NULL,
	`qualityStatus` enum('pending','in_progress','passed','failed') NOT NULL DEFAULT 'pending',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdBy` int,
	CONSTRAINT `feed_batches_id` PRIMARY KEY(`id`),
	CONSTRAINT `feed_batches_batchNumber_unique` UNIQUE(`batchNumber`)
);
--> statement-breakpoint
CREATE TABLE `feed_formulations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`feedRange` enum('premium','value','econo') NOT NULL,
	`feedStage` enum('starter','grower','finisher') NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`description` text,
	`ingredients` text NOT NULL,
	`proteinPercentage` decimal(5,2),
	`energyContent` decimal(10,2),
	`crudeProtein` decimal(5,2),
	`crudeFiber` decimal(5,2),
	`calcium` decimal(5,2),
	`phosphorus` decimal(5,2),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdBy` int,
	CONSTRAINT `feed_formulations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `flock_daily_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`flockId` int NOT NULL,
	`recordDate` timestamp NOT NULL,
	`dayNumber` int NOT NULL,
	`mortality` int NOT NULL DEFAULT 0,
	`feedConsumed` decimal(10,2) DEFAULT '0',
	`feedType` enum('starter','grower','finisher'),
	`waterConsumed` decimal(10,2),
	`averageWeight` decimal(10,3),
	`weightSamples` text,
	`temperature` decimal(5,2),
	`humidity` decimal(5,2),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`recordedBy` int,
	CONSTRAINT `flock_daily_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `flocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`flockNumber` varchar(50) NOT NULL,
	`houseId` int NOT NULL,
	`placementDate` timestamp NOT NULL,
	`initialCount` int NOT NULL,
	`currentCount` int NOT NULL,
	`targetSlaughterWeight` decimal(10,2) DEFAULT '1.70',
	`growingPeriod` int DEFAULT 42,
	`status` enum('planned','active','completed','cancelled') NOT NULL DEFAULT 'planned',
	`collectionDate` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdBy` int,
	CONSTRAINT `flocks_id` PRIMARY KEY(`id`),
	CONSTRAINT `flocks_flockNumber_unique` UNIQUE(`flockNumber`)
);
--> statement-breakpoint
CREATE TABLE `general_ledger_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entryNumber` varchar(50) NOT NULL,
	`entryDate` timestamp NOT NULL,
	`accountId` int NOT NULL,
	`debit` int NOT NULL DEFAULT 0,
	`credit` int NOT NULL DEFAULT 0,
	`description` varchar(500) NOT NULL,
	`referenceType` varchar(50),
	`referenceId` int,
	`isReconciled` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`createdBy` int,
	CONSTRAINT `general_ledger_entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `general_ledger_entries_entryNumber_unique` UNIQUE(`entryNumber`)
);
--> statement-breakpoint
CREATE TABLE `health_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`flockId` int NOT NULL,
	`recordDate` timestamp NOT NULL,
	`recordType` enum('observation','treatment','veterinary_visit','medication','other') NOT NULL,
	`description` text NOT NULL,
	`affectedBirds` int,
	`treatment` text,
	`medication` varchar(200),
	`dosage` varchar(100),
	`veterinarianName` varchar(200),
	`cost` int,
	`followUpRequired` boolean DEFAULT false,
	`followUpDate` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`recordedBy` int,
	CONSTRAINT `health_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `houses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`houseNumber` varchar(50),
	`length` decimal(10,2) NOT NULL,
	`width` decimal(10,2) NOT NULL,
	`floorArea` decimal(10,2) NOT NULL,
	`capacity` int NOT NULL,
	`houseType` enum('open_sided','closed','semi_closed') NOT NULL DEFAULT 'closed',
	`beddingType` varchar(50) DEFAULT 'pine_shavings',
	`beddingDepth` int DEFAULT 30,
	`numberOfFeeders` int,
	`numberOfDrinkers` int,
	`heatingType` varchar(50),
	`ventilationType` varchar(50),
	`notes` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdBy` int,
	CONSTRAINT `houses_id` PRIMARY KEY(`id`),
	CONSTRAINT `houses_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`itemNumber` varchar(50) NOT NULL,
	`name` varchar(200) NOT NULL,
	`category` enum('live_birds','feed','raw_materials','supplies','equipment') NOT NULL,
	`unit` varchar(50) NOT NULL,
	`currentStock` decimal(10,2) NOT NULL DEFAULT '0',
	`reorderPoint` decimal(10,2),
	`unitCost` int,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inventory_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `inventory_items_itemNumber_unique` UNIQUE(`itemNumber`)
);
--> statement-breakpoint
CREATE TABLE `inventory_locations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`locationType` enum('house','warehouse','silo','cold_storage','other') NOT NULL,
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inventory_locations_id` PRIMARY KEY(`id`),
	CONSTRAINT `inventory_locations_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `inventory_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`itemId` int NOT NULL,
	`locationId` int,
	`transactionType` enum('receipt','issue','transfer','adjustment') NOT NULL,
	`quantity` decimal(10,2) NOT NULL,
	`unitCost` int,
	`totalCost` int,
	`referenceType` varchar(50),
	`referenceId` int,
	`notes` text,
	`transactionDate` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`createdBy` int,
	CONSTRAINT `inventory_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoice_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceId` int NOT NULL,
	`description` varchar(500) NOT NULL,
	`quantity` decimal(10,2) NOT NULL,
	`unit` varchar(50) NOT NULL,
	`unitPrice` int NOT NULL,
	`subtotal` int NOT NULL,
	`taxRate` decimal(5,2) DEFAULT '15.00',
	`taxAmount` int NOT NULL,
	`totalAmount` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invoice_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceNumber` varchar(50) NOT NULL,
	`customerId` int NOT NULL,
	`orderId` int,
	`invoiceDate` timestamp NOT NULL,
	`dueDate` timestamp NOT NULL,
	`subtotal` int NOT NULL,
	`taxAmount` int NOT NULL,
	`totalAmount` int NOT NULL,
	`paidAmount` int NOT NULL DEFAULT 0,
	`balanceDue` int NOT NULL,
	`status` enum('draft','sent','paid','partial','overdue','cancelled') NOT NULL DEFAULT 'draft',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdBy` int,
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `invoices_invoiceNumber_unique` UNIQUE(`invoiceNumber`)
);
--> statement-breakpoint
CREATE TABLE `item_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`category` varchar(100) NOT NULL,
	`calculationType` enum('area_based','bird_count_based','worker_based','fixed','custom') NOT NULL,
	`formula` text,
	`bufferPercentage` decimal(5,2) DEFAULT '10.00',
	`unit` varchar(50) NOT NULL,
	`conversionFactor` decimal(10,4),
	`orderTriggerDays` int NOT NULL,
	`deliveryLeadDays` int DEFAULT 0,
	`defaultSupplierId` int,
	`estimatedUnitCost` int,
	`isActive` boolean NOT NULL DEFAULT true,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `item_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mortality_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`flockId` int NOT NULL,
	`recordDate` timestamp NOT NULL,
	`count` int NOT NULL,
	`cause` varchar(200),
	`ageAtDeath` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`recordedBy` int,
	CONSTRAINT `mortality_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payment_allocations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`paymentId` int NOT NULL,
	`invoiceId` int NOT NULL,
	`amount` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payment_allocations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`paymentNumber` varchar(50) NOT NULL,
	`customerId` int NOT NULL,
	`paymentDate` timestamp NOT NULL,
	`amount` int NOT NULL,
	`paymentMethod` varchar(100) NOT NULL,
	`referenceNumber` varchar(200),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`recordedBy` int,
	CONSTRAINT `payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `payments_paymentNumber_unique` UNIQUE(`paymentNumber`)
);
--> statement-breakpoint
CREATE TABLE `procurement_order_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`scheduleId` int,
	`description` varchar(500) NOT NULL,
	`quantity` decimal(10,2) NOT NULL,
	`unit` varchar(50) NOT NULL,
	`unitPrice` int,
	`totalAmount` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `procurement_order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `procurement_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderNumber` varchar(50) NOT NULL,
	`supplierId` int NOT NULL,
	`orderDate` timestamp NOT NULL,
	`expectedDeliveryDate` timestamp,
	`actualDeliveryDate` timestamp,
	`totalAmount` int,
	`status` enum('draft','sent','confirmed','delivered','cancelled') NOT NULL DEFAULT 'draft',
	`sentVia` enum('email','whatsapp','phone','manual'),
	`sentAt` timestamp,
	`confirmedAt` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdBy` int,
	CONSTRAINT `procurement_orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `procurement_orders_orderNumber_unique` UNIQUE(`orderNumber`)
);
--> statement-breakpoint
CREATE TABLE `procurement_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`flockId` int NOT NULL,
	`itemTemplateId` int NOT NULL,
	`supplierId` int NOT NULL,
	`calculatedQuantity` decimal(10,2) NOT NULL,
	`adjustedQuantity` decimal(10,2),
	`finalQuantity` decimal(10,2) NOT NULL,
	`unit` varchar(50) NOT NULL,
	`estimatedCost` int,
	`scheduledOrderDate` timestamp NOT NULL,
	`scheduledDeliveryDate` timestamp,
	`actualOrderDate` timestamp,
	`actualDeliveryDate` timestamp,
	`status` enum('pending','ordered','confirmed','delivered','cancelled') NOT NULL DEFAULT 'pending',
	`orderReference` varchar(200),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `procurement_schedules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quality_control_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batchId` int NOT NULL,
	`testDate` timestamp NOT NULL,
	`testType` varchar(100) NOT NULL,
	`parameter` varchar(100) NOT NULL,
	`measuredValue` decimal(10,3),
	`targetValue` decimal(10,3),
	`tolerance` decimal(10,3),
	`result` enum('pass','fail','pending') NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`testedBy` int,
	CONSTRAINT `quality_control_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `raw_material_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rawMaterialId` int NOT NULL,
	`transactionType` enum('purchase','usage','adjustment','return') NOT NULL,
	`quantity` decimal(10,2) NOT NULL,
	`unitCost` int,
	`totalCost` int,
	`referenceType` varchar(50),
	`referenceId` int,
	`notes` text,
	`transactionDate` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`createdBy` int,
	CONSTRAINT `raw_material_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `raw_materials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`category` varchar(100),
	`unit` varchar(50) NOT NULL,
	`currentStock` decimal(10,2) NOT NULL DEFAULT '0',
	`reorderPoint` decimal(10,2),
	`reorderQuantity` decimal(10,2),
	`unitCost` int,
	`supplierId` int,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `raw_materials_id` PRIMARY KEY(`id`),
	CONSTRAINT `raw_materials_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `sales_order_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`itemType` enum('live_birds','feed','other') NOT NULL,
	`description` varchar(500) NOT NULL,
	`flockId` int,
	`feedBatchId` int,
	`quantity` decimal(10,2) NOT NULL,
	`unit` varchar(50) NOT NULL,
	`unitPrice` int NOT NULL,
	`subtotal` int NOT NULL,
	`taxRate` decimal(5,2) DEFAULT '15.00',
	`taxAmount` int NOT NULL,
	`totalAmount` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sales_order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sales_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderNumber` varchar(50) NOT NULL,
	`customerId` int NOT NULL,
	`orderDate` timestamp NOT NULL,
	`deliveryDate` timestamp,
	`deliveryAddressId` int,
	`status` enum('draft','confirmed','processing','delivered','cancelled') NOT NULL DEFAULT 'draft',
	`subtotal` int NOT NULL,
	`taxAmount` int NOT NULL,
	`totalAmount` int NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdBy` int,
	CONSTRAINT `sales_orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `sales_orders_orderNumber_unique` UNIQUE(`orderNumber`)
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplierNumber` varchar(50) NOT NULL,
	`name` varchar(200) NOT NULL,
	`contactPerson` varchar(200),
	`email` varchar(320),
	`phone` varchar(50),
	`whatsapp` varchar(50),
	`preferredContactMethod` enum('email','whatsapp','phone','both') DEFAULT 'email',
	`category` varchar(100),
	`paymentTerms` varchar(100) DEFAULT 'cash',
	`taxNumber` varchar(100),
	`bankName` varchar(200),
	`bankAccountNumber` varchar(100),
	`isActive` boolean NOT NULL DEFAULT true,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `suppliers_id` PRIMARY KEY(`id`),
	CONSTRAINT `suppliers_supplierNumber_unique` UNIQUE(`supplierNumber`)
);
--> statement-breakpoint
CREATE TABLE `user_activity_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`action` varchar(100) NOT NULL,
	`entityType` varchar(50),
	`entityId` int,
	`details` text,
	`ipAddress` varchar(45),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_activity_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vaccination_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`flockId` int NOT NULL,
	`vaccineName` varchar(200) NOT NULL,
	`scheduledDate` timestamp NOT NULL,
	`scheduledDayNumber` int NOT NULL,
	`administeredDate` timestamp,
	`dosage` varchar(100),
	`administrationMethod` varchar(100),
	`batchNumber` varchar(100),
	`status` enum('scheduled','completed','skipped','overdue') NOT NULL DEFAULT 'scheduled',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`administeredBy` int,
	CONSTRAINT `vaccination_schedules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('admin','farm_manager','accountant','sales_staff','production_worker') NOT NULL DEFAULT 'production_worker';--> statement-breakpoint
ALTER TABLE `users` ADD `isActive` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `customer_addresses` ADD CONSTRAINT `customer_addresses_customerId_customers_id_fk` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customers` ADD CONSTRAINT `customers_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `documents` ADD CONSTRAINT `documents_uploadedBy_users_id_fk` FOREIGN KEY (`uploadedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `feed_batches` ADD CONSTRAINT `feed_batches_formulationId_feed_formulations_id_fk` FOREIGN KEY (`formulationId`) REFERENCES `feed_formulations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `feed_batches` ADD CONSTRAINT `feed_batches_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `feed_formulations` ADD CONSTRAINT `feed_formulations_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `flock_daily_records` ADD CONSTRAINT `flock_daily_records_flockId_flocks_id_fk` FOREIGN KEY (`flockId`) REFERENCES `flocks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `flock_daily_records` ADD CONSTRAINT `flock_daily_records_recordedBy_users_id_fk` FOREIGN KEY (`recordedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `flocks` ADD CONSTRAINT `flocks_houseId_houses_id_fk` FOREIGN KEY (`houseId`) REFERENCES `houses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `flocks` ADD CONSTRAINT `flocks_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `general_ledger_entries` ADD CONSTRAINT `general_ledger_entries_accountId_chart_of_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `chart_of_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `general_ledger_entries` ADD CONSTRAINT `general_ledger_entries_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `health_records` ADD CONSTRAINT `health_records_flockId_flocks_id_fk` FOREIGN KEY (`flockId`) REFERENCES `flocks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `health_records` ADD CONSTRAINT `health_records_recordedBy_users_id_fk` FOREIGN KEY (`recordedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `houses` ADD CONSTRAINT `houses_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_transactions` ADD CONSTRAINT `inventory_transactions_itemId_inventory_items_id_fk` FOREIGN KEY (`itemId`) REFERENCES `inventory_items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_transactions` ADD CONSTRAINT `inventory_transactions_locationId_inventory_locations_id_fk` FOREIGN KEY (`locationId`) REFERENCES `inventory_locations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_transactions` ADD CONSTRAINT `inventory_transactions_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_items` ADD CONSTRAINT `invoice_items_invoiceId_invoices_id_fk` FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_customerId_customers_id_fk` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_orderId_sales_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `sales_orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_templates` ADD CONSTRAINT `item_templates_defaultSupplierId_suppliers_id_fk` FOREIGN KEY (`defaultSupplierId`) REFERENCES `suppliers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mortality_records` ADD CONSTRAINT `mortality_records_flockId_flocks_id_fk` FOREIGN KEY (`flockId`) REFERENCES `flocks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mortality_records` ADD CONSTRAINT `mortality_records_recordedBy_users_id_fk` FOREIGN KEY (`recordedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_allocations` ADD CONSTRAINT `payment_allocations_paymentId_payments_id_fk` FOREIGN KEY (`paymentId`) REFERENCES `payments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_allocations` ADD CONSTRAINT `payment_allocations_invoiceId_invoices_id_fk` FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_customerId_customers_id_fk` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_recordedBy_users_id_fk` FOREIGN KEY (`recordedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `procurement_order_items` ADD CONSTRAINT `procurement_order_items_orderId_procurement_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `procurement_orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `procurement_order_items` ADD CONSTRAINT `procurement_order_items_scheduleId_procurement_schedules_id_fk` FOREIGN KEY (`scheduleId`) REFERENCES `procurement_schedules`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `procurement_orders` ADD CONSTRAINT `procurement_orders_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `procurement_orders` ADD CONSTRAINT `procurement_orders_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `procurement_schedules` ADD CONSTRAINT `procurement_schedules_flockId_flocks_id_fk` FOREIGN KEY (`flockId`) REFERENCES `flocks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `procurement_schedules` ADD CONSTRAINT `procurement_schedules_itemTemplateId_item_templates_id_fk` FOREIGN KEY (`itemTemplateId`) REFERENCES `item_templates`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `procurement_schedules` ADD CONSTRAINT `procurement_schedules_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quality_control_records` ADD CONSTRAINT `quality_control_records_batchId_feed_batches_id_fk` FOREIGN KEY (`batchId`) REFERENCES `feed_batches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quality_control_records` ADD CONSTRAINT `quality_control_records_testedBy_users_id_fk` FOREIGN KEY (`testedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `raw_material_transactions` ADD CONSTRAINT `raw_material_transactions_rawMaterialId_raw_materials_id_fk` FOREIGN KEY (`rawMaterialId`) REFERENCES `raw_materials`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `raw_material_transactions` ADD CONSTRAINT `raw_material_transactions_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_order_items` ADD CONSTRAINT `sales_order_items_orderId_sales_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `sales_orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_order_items` ADD CONSTRAINT `sales_order_items_flockId_flocks_id_fk` FOREIGN KEY (`flockId`) REFERENCES `flocks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_order_items` ADD CONSTRAINT `sales_order_items_feedBatchId_feed_batches_id_fk` FOREIGN KEY (`feedBatchId`) REFERENCES `feed_batches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_orders` ADD CONSTRAINT `sales_orders_customerId_customers_id_fk` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_orders` ADD CONSTRAINT `sales_orders_deliveryAddressId_customer_addresses_id_fk` FOREIGN KEY (`deliveryAddressId`) REFERENCES `customer_addresses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_orders` ADD CONSTRAINT `sales_orders_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_activity_logs` ADD CONSTRAINT `user_activity_logs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vaccination_schedules` ADD CONSTRAINT `vaccination_schedules_flockId_flocks_id_fk` FOREIGN KEY (`flockId`) REFERENCES `flocks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vaccination_schedules` ADD CONSTRAINT `vaccination_schedules_administeredBy_users_id_fk` FOREIGN KEY (`administeredBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_chart_of_accounts_type` ON `chart_of_accounts` (`accountType`);--> statement-breakpoint
CREATE INDEX `idx_customer_addresses_customer_id` ON `customer_addresses` (`customerId`);--> statement-breakpoint
CREATE INDEX `idx_documents_category` ON `documents` (`category`);--> statement-breakpoint
CREATE INDEX `idx_documents_related_entity` ON `documents` (`relatedEntityType`,`relatedEntityId`);--> statement-breakpoint
CREATE INDEX `idx_feed_batches_production_date` ON `feed_batches` (`productionDate`);--> statement-breakpoint
CREATE INDEX `idx_feed_batches_formulation_id` ON `feed_batches` (`formulationId`);--> statement-breakpoint
CREATE INDEX `idx_feed_formulations_range_stage` ON `feed_formulations` (`feedRange`,`feedStage`);--> statement-breakpoint
CREATE INDEX `idx_flock_daily_records_flock_id` ON `flock_daily_records` (`flockId`);--> statement-breakpoint
CREATE INDEX `idx_flock_daily_records_record_date` ON `flock_daily_records` (`recordDate`);--> statement-breakpoint
CREATE INDEX `idx_flocks_house_id` ON `flocks` (`houseId`);--> statement-breakpoint
CREATE INDEX `idx_flocks_status` ON `flocks` (`status`);--> statement-breakpoint
CREATE INDEX `idx_flocks_placement_date` ON `flocks` (`placementDate`);--> statement-breakpoint
CREATE INDEX `idx_general_ledger_entries_account_id` ON `general_ledger_entries` (`accountId`);--> statement-breakpoint
CREATE INDEX `idx_general_ledger_entries_entry_date` ON `general_ledger_entries` (`entryDate`);--> statement-breakpoint
CREATE INDEX `idx_health_records_flock_id` ON `health_records` (`flockId`);--> statement-breakpoint
CREATE INDEX `idx_health_records_record_date` ON `health_records` (`recordDate`);--> statement-breakpoint
CREATE INDEX `idx_inventory_transactions_item_id` ON `inventory_transactions` (`itemId`);--> statement-breakpoint
CREATE INDEX `idx_inventory_transactions_date` ON `inventory_transactions` (`transactionDate`);--> statement-breakpoint
CREATE INDEX `idx_invoice_items_invoice_id` ON `invoice_items` (`invoiceId`);--> statement-breakpoint
CREATE INDEX `idx_invoices_customer_id` ON `invoices` (`customerId`);--> statement-breakpoint
CREATE INDEX `idx_invoices_invoice_date` ON `invoices` (`invoiceDate`);--> statement-breakpoint
CREATE INDEX `idx_invoices_status` ON `invoices` (`status`);--> statement-breakpoint
CREATE INDEX `idx_invoices_due_date` ON `invoices` (`dueDate`);--> statement-breakpoint
CREATE INDEX `idx_mortality_records_flock_id` ON `mortality_records` (`flockId`);--> statement-breakpoint
CREATE INDEX `idx_mortality_records_record_date` ON `mortality_records` (`recordDate`);--> statement-breakpoint
CREATE INDEX `idx_payment_allocations_payment_id` ON `payment_allocations` (`paymentId`);--> statement-breakpoint
CREATE INDEX `idx_payment_allocations_invoice_id` ON `payment_allocations` (`invoiceId`);--> statement-breakpoint
CREATE INDEX `idx_payments_customer_id` ON `payments` (`customerId`);--> statement-breakpoint
CREATE INDEX `idx_payments_payment_date` ON `payments` (`paymentDate`);--> statement-breakpoint
CREATE INDEX `idx_procurement_order_items_order_id` ON `procurement_order_items` (`orderId`);--> statement-breakpoint
CREATE INDEX `idx_procurement_orders_supplier_id` ON `procurement_orders` (`supplierId`);--> statement-breakpoint
CREATE INDEX `idx_procurement_orders_order_date` ON `procurement_orders` (`orderDate`);--> statement-breakpoint
CREATE INDEX `idx_procurement_schedules_flock_id` ON `procurement_schedules` (`flockId`);--> statement-breakpoint
CREATE INDEX `idx_procurement_schedules_status` ON `procurement_schedules` (`status`);--> statement-breakpoint
CREATE INDEX `idx_procurement_schedules_order_date` ON `procurement_schedules` (`scheduledOrderDate`);--> statement-breakpoint
CREATE INDEX `idx_quality_control_records_batch_id` ON `quality_control_records` (`batchId`);--> statement-breakpoint
CREATE INDEX `idx_raw_material_transactions_material_id` ON `raw_material_transactions` (`rawMaterialId`);--> statement-breakpoint
CREATE INDEX `idx_raw_material_transactions_date` ON `raw_material_transactions` (`transactionDate`);--> statement-breakpoint
CREATE INDEX `idx_sales_order_items_order_id` ON `sales_order_items` (`orderId`);--> statement-breakpoint
CREATE INDEX `idx_sales_orders_customer_id` ON `sales_orders` (`customerId`);--> statement-breakpoint
CREATE INDEX `idx_sales_orders_order_date` ON `sales_orders` (`orderDate`);--> statement-breakpoint
CREATE INDEX `idx_sales_orders_status` ON `sales_orders` (`status`);--> statement-breakpoint
CREATE INDEX `idx_user_activity_logs_user_id` ON `user_activity_logs` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_user_activity_logs_created_at` ON `user_activity_logs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_vaccination_schedules_flock_id` ON `vaccination_schedules` (`flockId`);--> statement-breakpoint
CREATE INDEX `idx_vaccination_schedules_scheduled_date` ON `vaccination_schedules` (`scheduledDate`);