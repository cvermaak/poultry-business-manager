CREATE TABLE `company_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyName` varchar(255) NOT NULL,
	`vatNumber` varchar(50) NOT NULL,
	`registrationNumber` varchar(50),
	`address` text NOT NULL,
	`phone` varchar(20),
	`email` varchar(100),
	`website` varchar(255),
	`bankName` varchar(100),
	`branchCode` varchar(20),
	`accountName` varchar(100),
	`accountNumber` varchar(50),
	`accountReference` varchar(100),
	`logoUrl` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdBy` int
);
--> statement-breakpoint
CREATE TABLE `invoice_line_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceId` int NOT NULL,
	`description` varchar(500) NOT NULL,
	`quantity` decimal(10,2) NOT NULL,
	`pricePerUnit` decimal(10,2) NOT NULL,
	`discount` decimal(5,2) NOT NULL DEFAULT '0.00',
	`discountAmount` decimal(10,2) NOT NULL DEFAULT '0.00',
	`vatPercentage` decimal(5,2) NOT NULL DEFAULT '15.00',
	`amount` decimal(15,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
ALTER TABLE `invoice_items` DROP FOREIGN KEY `invoice_items_catchSessionId_catch_sessions_id_fk`;
--> statement-breakpoint
DROP INDEX `idx_customers_vat_number` ON `customers`;--> statement-breakpoint
DROP INDEX `idx_invoice_items_catch_session_id` ON `invoice_items`;--> statement-breakpoint
DROP INDEX `idx_invoices_catch_session_id` ON `invoices`;--> statement-breakpoint
DROP INDEX `idx_invoices_processor_id` ON `invoices`;--> statement-breakpoint
ALTER TABLE `catch_batches` MODIFY COLUMN `recordedAt` timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE `catch_crates` MODIFY COLUMN `recordedAt` timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` MODIFY COLUMN `companyName` varchar(200);--> statement-breakpoint
ALTER TABLE `customers` MODIFY COLUMN `vatNumber` varchar(100);--> statement-breakpoint
ALTER TABLE `invoices` MODIFY COLUMN `totalWeight` decimal(10,2);--> statement-breakpoint
ALTER TABLE `invoices` MODIFY COLUMN `exclusiveTotal` decimal(15,2);--> statement-breakpoint
ALTER TABLE `invoices` MODIFY COLUMN `vatAmount` decimal(15,2);--> statement-breakpoint
ALTER TABLE `invoices` MODIFY COLUMN `inclusiveTotal` decimal(15,2);--> statement-breakpoint
ALTER TABLE `company_settings` ADD CONSTRAINT `company_settings_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_line_items` ADD CONSTRAINT `invoice_line_items_invoiceId_invoices_id_fk` FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_company_settings_id` ON `company_settings` (`id`);--> statement-breakpoint
CREATE INDEX `idx_invoice_line_items_invoice_id` ON `invoice_line_items` (`invoiceId`);--> statement-breakpoint
ALTER TABLE `customers` DROP COLUMN `registrationNumber`;--> statement-breakpoint
ALTER TABLE `customers` DROP COLUMN `postalAddress`;--> statement-breakpoint
ALTER TABLE `customers` DROP COLUMN `physicalAddress`;--> statement-breakpoint
ALTER TABLE `invoice_items` DROP COLUMN `catchSessionId`;--> statement-breakpoint
ALTER TABLE `invoice_items` DROP COLUMN `pricePerKgExcl`;