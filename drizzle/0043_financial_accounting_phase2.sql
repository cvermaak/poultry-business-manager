-- -----------------------------------------------------------------------------
-- FINANCIAL ACCOUNTING PHASE 2
-- Chart of accounts controls, journal headers, and decimal general-ledger lines.
-- This migration is Railway-safe: it avoids unsupported IF NOT EXISTS DDL.
-- -----------------------------------------------------------------------------

-- Create journal headers if the table does not already exist.
SET @journal_entries_exists = (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'journal_entries'
);
SET @sql = IF(@journal_entries_exists = 0,
  'CREATE TABLE `journal_entries` (
    `id` int AUTO_INCREMENT NOT NULL,
    `journalNumber` varchar(50) NOT NULL,
    `entryDate` timestamp NOT NULL,
    `description` varchar(500) NOT NULL,
    `sourceType` varchar(50),
    `sourceId` int,
    `status` enum(''posted'',''reversed'') NOT NULL DEFAULT ''posted'',
    `totalDebit` decimal(15,2) NOT NULL,
    `totalCredit` decimal(15,2) NOT NULL,
    `reversal_of_journal_entry_id` int,
    `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `createdBy` int,
    CONSTRAINT `journal_entries_id` PRIMARY KEY (`id`),
    CONSTRAINT `journal_entries_journalNumber_unique` UNIQUE (`journalNumber`)
  )',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- An interrupted prior execution may have created journal_entries without a primary key.
SET @journal_primary_key_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'journal_entries' AND CONSTRAINT_TYPE = 'PRIMARY KEY'
);
SET @sql = IF(@journal_primary_key_exists = 0,
  'ALTER TABLE `journal_entries` ADD CONSTRAINT `journal_entries_id` PRIMARY KEY (`id`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add account-control columns only when absent.
SET @normal_balance_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chart_of_accounts' AND COLUMN_NAME = 'normal_balance'
);
SET @sql = IF(@normal_balance_exists = 0,
  'ALTER TABLE `chart_of_accounts` ADD COLUMN `normal_balance` enum(''debit'',''credit'') NOT NULL DEFAULT ''debit''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @posting_account_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chart_of_accounts' AND COLUMN_NAME = 'is_posting_account'
);
SET @sql = IF(@posting_account_exists = 0,
  'ALTER TABLE `chart_of_accounts` ADD COLUMN `is_posting_account` tinyint NOT NULL DEFAULT 1',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @chart_created_by_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chart_of_accounts' AND COLUMN_NAME = 'createdBy'
);
SET @sql = IF(@chart_created_by_exists = 0,
  'ALTER TABLE `chart_of_accounts` ADD COLUMN `createdBy` int NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Store ledger values as rand decimals, consistent with invoice monetary columns.
ALTER TABLE `general_ledger_entries`
  MODIFY COLUMN `debit` decimal(15,2) NOT NULL DEFAULT '0.00',
  MODIFY COLUMN `credit` decimal(15,2) NOT NULL DEFAULT '0.00';

SET @journal_entry_id_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'general_ledger_entries' AND COLUMN_NAME = 'journal_entry_id'
);
SET @sql = IF(@journal_entry_id_exists = 0,
  'ALTER TABLE `general_ledger_entries` ADD COLUMN `journal_entry_id` int NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add indexes only when the equivalent named index is absent.
SET @account_code_unique_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chart_of_accounts'
    AND INDEX_NAME = 'uq_chart_of_accounts_account_number'
);
SET @account_code_duplicates = (
  SELECT COUNT(*) FROM (
    SELECT `accountNumber` FROM `chart_of_accounts`
    GROUP BY `accountNumber` HAVING COUNT(*) > 1
  ) AS duplicate_account_numbers
);
SET @sql = IF(@account_code_unique_exists = 0 AND @account_code_duplicates = 0,
  'CREATE UNIQUE INDEX `uq_chart_of_accounts_account_number` ON `chart_of_accounts` (`accountNumber`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @journal_entry_date_index_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'journal_entries' AND INDEX_NAME = 'idx_journal_entries_entry_date'
);
SET @sql = IF(@journal_entry_date_index_exists = 0,
  'CREATE INDEX `idx_journal_entries_entry_date` ON `journal_entries` (`entryDate`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @journal_source_index_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'journal_entries' AND INDEX_NAME = 'idx_journal_entries_source'
);
SET @sql = IF(@journal_source_index_exists = 0,
  'CREATE INDEX `idx_journal_entries_source` ON `journal_entries` (`sourceType`, `sourceId`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ledger_journal_index_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'general_ledger_entries' AND INDEX_NAME = 'idx_general_ledger_entries_journal_entry_id'
);
SET @sql = IF(@ledger_journal_index_exists = 0,
  'CREATE INDEX `idx_general_ledger_entries_journal_entry_id` ON `general_ledger_entries` (`journal_entry_id`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add each foreign key only if no equivalent relationship already exists.
SET @chart_created_by_fk_exists = (
  SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chart_of_accounts'
    AND COLUMN_NAME = 'createdBy' AND REFERENCED_TABLE_NAME = 'users' AND REFERENCED_COLUMN_NAME = 'id'
);
SET @sql = IF(@chart_created_by_fk_exists = 0,
  'ALTER TABLE `chart_of_accounts` ADD CONSTRAINT `chart_of_accounts_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @journal_created_by_fk_exists = (
  SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'journal_entries'
    AND COLUMN_NAME = 'createdBy' AND REFERENCED_TABLE_NAME = 'users' AND REFERENCED_COLUMN_NAME = 'id'
);
SET @sql = IF(@journal_created_by_fk_exists = 0,
  'ALTER TABLE `journal_entries` ADD CONSTRAINT `journal_entries_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ledger_journal_fk_exists = (
  SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'general_ledger_entries'
    AND COLUMN_NAME = 'journal_entry_id' AND REFERENCED_TABLE_NAME = 'journal_entries' AND REFERENCED_COLUMN_NAME = 'id'
);
SET @sql = IF(@ledger_journal_fk_exists = 0,
  'ALTER TABLE `general_ledger_entries` ADD CONSTRAINT `general_ledger_entries_journal_entry_id_journal_entries_id_fk` FOREIGN KEY (`journal_entry_id`) REFERENCES `journal_entries` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
