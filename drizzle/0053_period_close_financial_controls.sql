-- -----------------------------------------------------------------------------
-- FINANCIAL ACCOUNTING PHASE 6: PERIOD CLOSE AND FINANCIAL CONTROLS
-- Railway/MySQL-compatible, repeatable migration.
-- Monetary amounts are decimal(15,2) rands; period dates are ISO calendar dates.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `financial_periods` (
  `id` int AUTO_INCREMENT NOT NULL,
  `periodName` varchar(100) NOT NULL,
  `startDate` varchar(10) NOT NULL,
  `endDate` varchar(10) NOT NULL,
  `status` enum('open','closed') NOT NULL DEFAULT 'open',
  `notes` text,
  `lastReadinessCheckAt` timestamp NULL,
  `closedAt` timestamp NULL,
  `closedBy` int NULL,
  `reopenedAt` timestamp NULL,
  `reopenedBy` int NULL,
  `reopenReason` varchar(1000) NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `createdBy` int NOT NULL,
  CONSTRAINT `financial_periods_id` PRIMARY KEY(`id`),
  CONSTRAINT `financial_periods_closed_by_users_id_fk` FOREIGN KEY (`closedBy`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `financial_periods_reopened_by_users_id_fk` FOREIGN KEY (`reopenedBy`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `financial_periods_created_by_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `uq_financial_periods_dates` UNIQUE(`startDate`, `endDate`)
);

CREATE TABLE IF NOT EXISTS `financial_control_reviews` (
  `id` int AUTO_INCREMENT NOT NULL,
  `periodId` int NOT NULL,
  `reviewType` enum('bank_reconciliation','vat_summary','trial_balance','financial_statements') NOT NULL,
  `reviewStatus` enum('pending','approved','exception') NOT NULL DEFAULT 'pending',
  `notes` varchar(4000) NULL,
  `reviewedAt` timestamp NULL,
  `reviewedBy` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `financial_control_reviews_id` PRIMARY KEY(`id`),
  CONSTRAINT `fcr_period_fk` FOREIGN KEY (`periodId`) REFERENCES `financial_periods`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `fcr_reviewed_by_fk` FOREIGN KEY (`reviewedBy`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `uq_financial_control_reviews_period_type` UNIQUE(`periodId`, `reviewType`)
);

CREATE TABLE IF NOT EXISTS `financial_period_actions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `periodId` int NOT NULL,
  `actionType` enum('period_created','review_approved','review_exception','period_closed','period_reopened','journal_reversed') NOT NULL,
  `reason` varchar(4000) NULL,
  `referenceType` varchar(50) NULL,
  `referenceId` int NULL,
  `actionAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actionBy` int NOT NULL,
  CONSTRAINT `financial_period_actions_id` PRIMARY KEY(`id`),
  CONSTRAINT `fpa_period_fk` FOREIGN KEY (`periodId`) REFERENCES `financial_periods`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `fpa_action_by_fk` FOREIGN KEY (`actionBy`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
);

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'financial_periods' AND INDEX_NAME = 'idx_financial_periods_status');
SET @sql = IF(@idx_exists = 0,
  'CREATE INDEX `idx_financial_periods_status` ON `financial_periods` (`status`, `startDate`, `endDate`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'financial_control_reviews' AND INDEX_NAME = 'idx_financial_control_reviews_period_status');
SET @sql = IF(@idx_exists = 0,
  'CREATE INDEX `idx_financial_control_reviews_period_status` ON `financial_control_reviews` (`periodId`, `reviewStatus`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'financial_period_actions' AND INDEX_NAME = 'idx_financial_period_actions_period');
SET @sql = IF(@idx_exists = 0,
  'CREATE INDEX `idx_financial_period_actions_period` ON `financial_period_actions` (`periodId`, `actionAt`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
