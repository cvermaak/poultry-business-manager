ALTER TABLE `reminder_templates` ADD `is_bundle` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `reminder_templates` ADD `bundle_config` json;