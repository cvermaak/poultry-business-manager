ALTER TABLE `houses` ADD `breed` enum('ross_308','cobb_500','arbor_acres') DEFAULT 'ross_308' NOT NULL;--> statement-breakpoint
ALTER TABLE `houses` ADD `farmName` varchar(100);--> statement-breakpoint
ALTER TABLE `houses` ADD `physicalAddress` text;--> statement-breakpoint
ALTER TABLE `houses` ADD `gpsLatitude` decimal(10,7);--> statement-breakpoint
ALTER TABLE `houses` ADD `gpsLongitude` decimal(10,7);--> statement-breakpoint
ALTER TABLE `houses` ADD `province` varchar(50);--> statement-breakpoint
ALTER TABLE `houses` ADD `district` varchar(50);