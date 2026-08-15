-- -----------------------------------------------------------------------------
-- MIGRATION 0051: Supplier Management Railway compatibility
-- -----------------------------------------------------------------------------
-- This migration is repeatable on Railway MySQL. It avoids unsupported
-- ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS syntax by using
-- information_schema checks and prepared statements.
--
-- It is intentionally safe for the Railway development environment where a
-- legacy supplier table may exist but the current Supplier Management UI,
-- backend procedures, and complete supplier columns were not deployed.

CREATE TABLE IF NOT EXISTS `suppliers` (
  `id` int AUTO_INCREMENT NOT NULL,
  `supplierNumber` varchar(50) NOT NULL,
  `name` varchar(200) NOT NULL,
  `contactPerson` varchar(200),
  `email` varchar(320),
  `phone` varchar(50),
  `whatsapp` varchar(50),
  `preferredContactMethod` enum('email','whatsapp','phone','both') DEFAULT 'email',
  `category` varchar(100),
  `paymentTerms` varchar(100) DEFAULT 'cash',
  `taxNumber` varchar(100),
  `bankName` varchar(200),
  `bankAccountNumber` varchar(100),
  `isActive` tinyint NOT NULL DEFAULT 1,
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `suppliers_id` PRIMARY KEY (`id`)
);

-- Add current Supplier Management columns to a legacy supplier table when absent.
SET @supplier_column_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'suppliers' AND COLUMN_NAME = 'supplierNumber');
SET @supplier_sql = IF(@supplier_column_exists = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `supplierNumber` varchar(50) NULL',
  'SELECT 1');
PREPARE supplier_stmt FROM @supplier_sql;
EXECUTE supplier_stmt;
DEALLOCATE PREPARE supplier_stmt;

SET @supplier_column_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'suppliers' AND COLUMN_NAME = 'name');
SET @supplier_sql = IF(@supplier_column_exists = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `name` varchar(200) NOT NULL DEFAULT ''Unnamed Supplier''',
  'SELECT 1');
PREPARE supplier_stmt FROM @supplier_sql;
EXECUTE supplier_stmt;
DEALLOCATE PREPARE supplier_stmt;

SET @supplier_column_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'suppliers' AND COLUMN_NAME = 'contactPerson');
SET @supplier_sql = IF(@supplier_column_exists = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `contactPerson` varchar(200) NULL',
  'SELECT 1');
PREPARE supplier_stmt FROM @supplier_sql;
EXECUTE supplier_stmt;
DEALLOCATE PREPARE supplier_stmt;

SET @supplier_column_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'suppliers' AND COLUMN_NAME = 'email');
SET @supplier_sql = IF(@supplier_column_exists = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `email` varchar(320) NULL',
  'SELECT 1');
PREPARE supplier_stmt FROM @supplier_sql;
EXECUTE supplier_stmt;
DEALLOCATE PREPARE supplier_stmt;

SET @supplier_column_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'suppliers' AND COLUMN_NAME = 'phone');
SET @supplier_sql = IF(@supplier_column_exists = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `phone` varchar(50) NULL',
  'SELECT 1');
PREPARE supplier_stmt FROM @supplier_sql;
EXECUTE supplier_stmt;
DEALLOCATE PREPARE supplier_stmt;

SET @supplier_column_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'suppliers' AND COLUMN_NAME = 'whatsapp');
SET @supplier_sql = IF(@supplier_column_exists = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `whatsapp` varchar(50) NULL',
  'SELECT 1');
PREPARE supplier_stmt FROM @supplier_sql;
EXECUTE supplier_stmt;
DEALLOCATE PREPARE supplier_stmt;

SET @supplier_column_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'suppliers' AND COLUMN_NAME = 'preferredContactMethod');
SET @supplier_sql = IF(@supplier_column_exists = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `preferredContactMethod` enum(''email'',''whatsapp'',''phone'',''both'') NULL DEFAULT ''email''',
  'SELECT 1');
PREPARE supplier_stmt FROM @supplier_sql;
EXECUTE supplier_stmt;
DEALLOCATE PREPARE supplier_stmt;

SET @supplier_column_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'suppliers' AND COLUMN_NAME = 'category');
SET @supplier_sql = IF(@supplier_column_exists = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `category` varchar(100) NULL',
  'SELECT 1');
PREPARE supplier_stmt FROM @supplier_sql;
EXECUTE supplier_stmt;
DEALLOCATE PREPARE supplier_stmt;

SET @supplier_column_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'suppliers' AND COLUMN_NAME = 'paymentTerms');
SET @supplier_sql = IF(@supplier_column_exists = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `paymentTerms` varchar(100) NULL DEFAULT ''cash''',
  'SELECT 1');
PREPARE supplier_stmt FROM @supplier_sql;
EXECUTE supplier_stmt;
DEALLOCATE PREPARE supplier_stmt;

SET @supplier_column_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'suppliers' AND COLUMN_NAME = 'taxNumber');
SET @supplier_sql = IF(@supplier_column_exists = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `taxNumber` varchar(100) NULL',
  'SELECT 1');
PREPARE supplier_stmt FROM @supplier_sql;
EXECUTE supplier_stmt;
DEALLOCATE PREPARE supplier_stmt;

SET @supplier_column_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'suppliers' AND COLUMN_NAME = 'bankName');
SET @supplier_sql = IF(@supplier_column_exists = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `bankName` varchar(200) NULL',
  'SELECT 1');
PREPARE supplier_stmt FROM @supplier_sql;
EXECUTE supplier_stmt;
DEALLOCATE PREPARE supplier_stmt;

SET @supplier_column_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'suppliers' AND COLUMN_NAME = 'bankAccountNumber');
SET @supplier_sql = IF(@supplier_column_exists = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `bankAccountNumber` varchar(100) NULL',
  'SELECT 1');
PREPARE supplier_stmt FROM @supplier_sql;
EXECUTE supplier_stmt;
DEALLOCATE PREPARE supplier_stmt;

SET @supplier_column_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'suppliers' AND COLUMN_NAME = 'isActive');
SET @supplier_sql = IF(@supplier_column_exists = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `isActive` tinyint NOT NULL DEFAULT 1',
  'SELECT 1');
PREPARE supplier_stmt FROM @supplier_sql;
EXECUTE supplier_stmt;
DEALLOCATE PREPARE supplier_stmt;

SET @supplier_column_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'suppliers' AND COLUMN_NAME = 'notes');
SET @supplier_sql = IF(@supplier_column_exists = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `notes` text NULL',
  'SELECT 1');
PREPARE supplier_stmt FROM @supplier_sql;
EXECUTE supplier_stmt;
DEALLOCATE PREPARE supplier_stmt;

SET @supplier_column_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'suppliers' AND COLUMN_NAME = 'createdAt');
SET @supplier_sql = IF(@supplier_column_exists = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP',
  'SELECT 1');
PREPARE supplier_stmt FROM @supplier_sql;
EXECUTE supplier_stmt;
DEALLOCATE PREPARE supplier_stmt;

SET @supplier_column_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'suppliers' AND COLUMN_NAME = 'updatedAt');
SET @supplier_sql = IF(@supplier_column_exists = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'SELECT 1');
PREPARE supplier_stmt FROM @supplier_sql;
EXECUTE supplier_stmt;
DEALLOCATE PREPARE supplier_stmt;

-- Existing legacy rows must receive deterministic unique supplier numbers before
-- the canonical non-null column and unique index are enforced.
UPDATE `suppliers`
SET `supplierNumber` = CONCAT('SUP-LEGACY-', LPAD(`id`, 6, '0'))
WHERE `supplierNumber` IS NULL OR TRIM(`supplierNumber`) = '';

ALTER TABLE `suppliers` MODIFY COLUMN `supplierNumber` varchar(50) NOT NULL;

SET @supplier_unique_index_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'suppliers'
    AND COLUMN_NAME = 'supplierNumber' AND NON_UNIQUE = 0);
SET @supplier_sql = IF(@supplier_unique_index_exists = 0,
  'CREATE UNIQUE INDEX `uq_suppliers_supplier_number` ON `suppliers` (`supplierNumber`)',
  'SELECT 1');
PREPARE supplier_stmt FROM @supplier_sql;
EXECUTE supplier_stmt;
DEALLOCATE PREPARE supplier_stmt;

SET @supplier_active_index_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'suppliers'
    AND INDEX_NAME = 'idx_suppliers_active_name');
SET @supplier_sql = IF(@supplier_active_index_exists = 0,
  'CREATE INDEX `idx_suppliers_active_name` ON `suppliers` (`isActive`, `name`)',
  'SELECT 1');
PREPARE supplier_stmt FROM @supplier_sql;
EXECUTE supplier_stmt;
DEALLOCATE PREPARE supplier_stmt;
