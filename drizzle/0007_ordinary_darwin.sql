ALTER TABLE `stress_packs` ADD `active_ingredients` text;--> statement-breakpoint
ALTER TABLE `vaccines` ADD `vaccine_type` enum('live','inactivated','recombinant','vector') NOT NULL;--> statement-breakpoint
ALTER TABLE `vaccines` ADD `storage_temperature` varchar(100);--> statement-breakpoint
ALTER TABLE `vaccines` ADD `shelf_life_days` int;