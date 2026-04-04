ALTER TABLE `invoices` MODIFY COLUMN `exclusiveTotal` decimal(12,2);--> statement-breakpoint
ALTER TABLE `invoices` MODIFY COLUMN `vatAmount` decimal(12,2);--> statement-breakpoint
ALTER TABLE `invoices` MODIFY COLUMN `inclusiveTotal` decimal(12,2);
