CREATE TABLE `reminder_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`description` text,
	`reminderType` enum('vaccination','feed_transition','house_preparation','environmental_check','routine_task','milestone','biosecurity','performance_alert') NOT NULL,
	`priority` enum('urgent','high','medium','low') NOT NULL DEFAULT 'medium',
	`day_offset` int NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reminder_templates_id` PRIMARY KEY(`id`)
);
