CREATE TABLE `health_protocol_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`vaccination_schedules` json,
	`stress_pack_schedules` json,
	`is_default` boolean DEFAULT false,
	`is_active` boolean DEFAULT true,
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `health_protocol_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `health_protocol_templates` ADD CONSTRAINT `health_protocol_templates_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;