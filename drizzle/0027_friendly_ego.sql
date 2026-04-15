ALTER TABLE `invoices` MODIFY COLUMN `totalWeight` decimal(10,3);--> statement-breakpoint
ALTER TABLE `invoices` ADD `overallDiscountPercent` decimal(5,2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE `invoices` ADD `paymentMethod` varchar(50);--> statement-breakpoint
ALTER TABLE `invoices` ADD `paymentDate` timestamp;