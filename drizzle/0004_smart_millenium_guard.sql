CREATE TABLE `reminders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`flockId` int,
	`houseId` int,
	`reminderType` enum('vaccination','feed_transition','house_preparation','environmental_check','routine_task','milestone','biosecurity','performance_alert') NOT NULL,
	`title` varchar(200) NOT NULL,
	`description` text,
	`dueDate` timestamp NOT NULL,
	`priority` enum('urgent','high','medium','low') NOT NULL DEFAULT 'medium',
	`status` enum('pending','completed','dismissed') NOT NULL DEFAULT 'pending',
	`completedAt` timestamp,
	`completedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reminders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `reminders` ADD CONSTRAINT `reminders_flockId_flocks_id_fk` FOREIGN KEY (`flockId`) REFERENCES `flocks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reminders` ADD CONSTRAINT `reminders_houseId_houses_id_fk` FOREIGN KEY (`houseId`) REFERENCES `houses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reminders` ADD CONSTRAINT `reminders_completedBy_users_id_fk` FOREIGN KEY (`completedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_reminders_flock_id` ON `reminders` (`flockId`);--> statement-breakpoint
CREATE INDEX `idx_reminders_house_id` ON `reminders` (`houseId`);--> statement-breakpoint
CREATE INDEX `idx_reminders_due_date` ON `reminders` (`dueDate`);--> statement-breakpoint
CREATE INDEX `idx_reminders_status` ON `reminders` (`status`);