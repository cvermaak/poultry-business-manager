-- Health workflow: stress-pack administration audit + per-flock pre-transport protocols.
-- Railway-compatible: no unsupported ADD COLUMN IF NOT EXISTS statements are used.

SET @has_administered_at := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'flock_stress_pack_schedules'
    AND COLUMN_NAME = 'administered_at'
);
SET @sql := IF(@has_administered_at = 0,
  'ALTER TABLE `flock_stress_pack_schedules` ADD COLUMN `administered_at` timestamp NULL',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_administered_by := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'flock_stress_pack_schedules'
    AND COLUMN_NAME = 'administered_by'
);
SET @sql := IF(@has_administered_by = 0,
  'ALTER TABLE `flock_stress_pack_schedules` ADD COLUMN `administered_by` int NULL',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @administered_by_fk_exists := (
  SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'flock_stress_pack_schedules'
    AND COLUMN_NAME = 'administered_by' AND REFERENCED_TABLE_NAME = 'users'
);
SET @sql := IF(@administered_by_fk_exists = 0,
  'ALTER TABLE `flock_stress_pack_schedules` ADD CONSTRAINT `stress_pack_admin_user_fk` FOREIGN KEY (`administered_by`) REFERENCES `users` (`id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `pre_transport_protocols` (
  `id` int AUTO_INCREMENT NOT NULL,
  `flock_id` int NOT NULL,
  `collection_date` varchar(20) NOT NULL,
  `collection_time` varchar(10) NOT NULL,
  `travel_duration_hours` decimal(5,2) NOT NULL DEFAULT '0.00',
  `feed_withdrawal_hours` int NOT NULL DEFAULT 8,
  `stress_pack_id` int NULL,
  `dosage_strength` enum('single','double','triple') DEFAULT 'single',
  `status` enum('planned','completed','cancelled') NOT NULL DEFAULT 'planned',
  `notes` text NULL,
  `created_by` int NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pre_transport_protocols_id` PRIMARY KEY (`id`),
  KEY `idx_pre_transport_protocols_flock_id` (`flock_id`),
  KEY `idx_pre_transport_protocols_collection_date` (`collection_date`),
  CONSTRAINT `pre_transport_protocols_flock_id_flocks_id_fk` FOREIGN KEY (`flock_id`) REFERENCES `flocks` (`id`),
  CONSTRAINT `pre_transport_protocols_stress_pack_id_stress_packs_id_fk` FOREIGN KEY (`stress_pack_id`) REFERENCES `stress_packs` (`id`),
  CONSTRAINT `pre_transport_protocols_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
);

SET @has_protocol_link := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reminders'
    AND COLUMN_NAME = 'pre_transport_protocol_id'
);
SET @sql := IF(@has_protocol_link = 0,
  'ALTER TABLE `reminders` ADD COLUMN `pre_transport_protocol_id` int NULL',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @protocol_fk_exists := (
  SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reminders'
    AND COLUMN_NAME = 'pre_transport_protocol_id' AND REFERENCED_TABLE_NAME = 'pre_transport_protocols'
);
SET @sql := IF(@protocol_fk_exists = 0,
  'ALTER TABLE `reminders` ADD CONSTRAINT `reminders_pre_transport_fk` FOREIGN KEY (`pre_transport_protocol_id`) REFERENCES `pre_transport_protocols` (`id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
