ALTER TABLE `invoices` MODIFY COLUMN `subtotal` decimal(15,2) NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` MODIFY COLUMN `taxAmount` decimal(15,2) NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` MODIFY COLUMN `totalAmount` decimal(15,2) NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` MODIFY COLUMN `paidAmount` decimal(15,2) NOT NULL DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE `invoices` MODIFY COLUMN `balanceDue` decimal(15,2) NOT NULL;