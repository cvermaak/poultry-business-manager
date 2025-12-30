ALTER TABLE `flocks` ADD `weightUnit` enum('grams','kg') DEFAULT 'kg' NOT NULL;--> statement-breakpoint
ALTER TABLE `flocks` ADD `starterFeedType` enum('premium','value','econo');--> statement-breakpoint
ALTER TABLE `flocks` ADD `starterFromDay` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `flocks` ADD `starterToDay` int;--> statement-breakpoint
ALTER TABLE `flocks` ADD `growerFeedType` enum('premium','value','econo');--> statement-breakpoint
ALTER TABLE `flocks` ADD `growerFromDay` int;--> statement-breakpoint
ALTER TABLE `flocks` ADD `growerToDay` int;--> statement-breakpoint
ALTER TABLE `flocks` ADD `finisherFeedType` enum('premium','value','econo');--> statement-breakpoint
ALTER TABLE `flocks` ADD `finisherFromDay` int;--> statement-breakpoint
ALTER TABLE `flocks` ADD `finisherToDay` int;