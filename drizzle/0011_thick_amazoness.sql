ALTER TABLE `flocks` ADD `statusChangedAt` timestamp;--> statement-breakpoint
ALTER TABLE `flocks` ADD `statusChangedBy` int;--> statement-breakpoint
ALTER TABLE `flocks` ADD `statusChangeReason` text;--> statement-breakpoint
ALTER TABLE `flocks` ADD `isManualStatusChange` tinyint DEFAULT 0;--> statement-breakpoint
ALTER TABLE `flocks` ADD CONSTRAINT `flocks_statusChangedBy_users_id_fk` FOREIGN KEY (`statusChangedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;