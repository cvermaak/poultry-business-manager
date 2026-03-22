ALTER TABLE `customers` ADD `companyName` varchar(255);--> statement-breakpoint
ALTER TABLE `customers` ADD `vatNumber` varchar(50);--> statement-breakpoint
ALTER TABLE `customers` ADD `registrationNumber` varchar(100);--> statement-breakpoint
ALTER TABLE `customers` ADD `postalAddress` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `physicalAddress` text;--> statement-breakpoint
ALTER TABLE `invoice_items` ADD `catchSessionId` int;--> statement-breakpoint
ALTER TABLE `invoice_items` ADD `pricePerKgExcl` decimal(10,2);--> statement-breakpoint
ALTER TABLE `invoices` ADD `catchSessionId` int;--> statement-breakpoint
ALTER TABLE `invoices` ADD `processorId` int;--> statement-breakpoint
ALTER TABLE `invoices` ADD `pricePerKgExcl` decimal(10,2);--> statement-breakpoint
ALTER TABLE `invoices` ADD `totalBirds` int;--> statement-breakpoint
ALTER TABLE `invoices` ADD `totalWeight` decimal(10,3);--> statement-breakpoint
ALTER TABLE `invoices` ADD `vatPercentage` decimal(5,2) DEFAULT '15.00';--> statement-breakpoint
ALTER TABLE `invoices` ADD `exclusiveTotal` int;--> statement-breakpoint
ALTER TABLE `invoices` ADD `vatAmount` int;--> statement-breakpoint
ALTER TABLE `invoices` ADD `inclusiveTotal` int;--> statement-breakpoint
ALTER TABLE `invoice_items` ADD CONSTRAINT `invoice_items_catchSessionId_catch_sessions_id_fk` FOREIGN KEY (`catchSessionId`) REFERENCES `catch_sessions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_catchSessionId_catch_sessions_id_fk` FOREIGN KEY (`catchSessionId`) REFERENCES `catch_sessions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_processorId_processors_id_fk` FOREIGN KEY (`processorId`) REFERENCES `processors`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_customers_vat_number` ON `customers` (`vatNumber`);--> statement-breakpoint
CREATE INDEX `idx_invoice_items_catch_session_id` ON `invoice_items` (`catchSessionId`);--> statement-breakpoint
CREATE INDEX `idx_invoices_catch_session_id` ON `invoices` (`catchSessionId`);--> statement-breakpoint
CREATE INDEX `idx_invoices_processor_id` ON `invoices` (`processorId`);