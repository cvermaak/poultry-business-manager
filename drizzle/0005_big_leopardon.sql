CREATE TABLE `flock_stress_pack_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`flock_id` int NOT NULL,
	`stress_pack_id` int NOT NULL,
	`start_day` int NOT NULL,
	`end_day` int NOT NULL,
	`dosage_strength` enum('single','double','triple') DEFAULT 'single',
	`status` enum('scheduled','active','completed','cancelled') DEFAULT 'scheduled',
	`quantity_used` varchar(100),
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `flock_stress_pack_schedules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `flock_vaccination_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`flock_id` int NOT NULL,
	`vaccine_id` int NOT NULL,
	`scheduled_day` int NOT NULL,
	`status` enum('scheduled','completed','missed','rescheduled') DEFAULT 'scheduled',
	`actual_date` timestamp,
	`dosage_used` varchar(100),
	`notes` text,
	`administered_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `flock_vaccination_schedules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stress_packs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`brand` varchar(255) NOT NULL,
	`manufacturer` varchar(255),
	`dosage_strength` enum('single','double','triple') DEFAULT 'single',
	`dosage_per_liter` varchar(100),
	`recommended_duration_days` int,
	`instructions` text,
	`cost_per_kg` varchar(20),
	`is_active` boolean DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stress_packs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vaccines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`brand` varchar(255) NOT NULL,
	`manufacturer` varchar(255),
	`disease_type` enum('newcastle_disease','infectious_bronchitis','gumboro','mareks','coccidiosis','fowl_pox','other') NOT NULL,
	`application_method` enum('drinking_water','spray','eye_drop','injection','wing_web') NOT NULL,
	`dosage_per_bird` varchar(100),
	`booster_interval_days` int,
	`instructions` text,
	`withdrawal_period_days` int DEFAULT 0,
	`is_active` boolean DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vaccines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `flocks` ADD `destinationName` varchar(255);--> statement-breakpoint
ALTER TABLE `flocks` ADD `destinationAddress` text;--> statement-breakpoint
ALTER TABLE `flocks` ADD `destinationGpsLat` varchar(50);--> statement-breakpoint
ALTER TABLE `flocks` ADD `destinationGpsLng` varchar(50);--> statement-breakpoint
ALTER TABLE `flocks` ADD `travelDurationHours` decimal(5,2);--> statement-breakpoint
ALTER TABLE `flocks` ADD `feedWithdrawalHours` int;