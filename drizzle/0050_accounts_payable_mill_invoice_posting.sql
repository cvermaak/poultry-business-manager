-- -----------------------------------------------------------------------------
-- MIGRATION 0050: Accounts Payable for supplier/mill invoices
-- Railway-safe: all conditional column and index DDL uses information-schema checks.
-- -----------------------------------------------------------------------------

-- Add supplier and outstanding-balance fields only when they do not exist.
SET @has_supplier_id = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mill_invoices' AND COLUMN_NAME = 'supplier_id'
);
SET @sql = IF(@has_supplier_id = 0,
  'ALTER TABLE `mill_invoices` ADD COLUMN `supplier_id` int NULL AFTER `feed_order_id`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_balance_due = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mill_invoices' AND COLUMN_NAME = 'balance_due'
);
SET @sql = IF(@has_balance_due = 0,
  'ALTER TABLE `mill_invoices` ADD COLUMN `balance_due` decimal(12,2) NOT NULL DEFAULT ''0.00'' AFTER `paidAmount`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Extend the canonical status set without altering existing values.
ALTER TABLE `mill_invoices`
  MODIFY COLUMN `mill_invoice_status` enum('outstanding','partial','paid','overdue','disputed') NOT NULL DEFAULT 'outstanding';

-- Backfill a true remaining balance. This is repeatable and never changes invoice totals.
UPDATE `mill_invoices`
SET `balance_due` = CASE
  WHEN `mill_invoice_status` = 'paid' THEN 0.00
  ELSE GREATEST(`amountIncl` - COALESCE(`paidAmount`, 0.00), 0.00)
END;

-- Create auditable supplier payment receipts if absent.
CREATE TABLE IF NOT EXISTS `supplier_invoice_payments` (
  `id` int AUTO_INCREMENT NOT NULL,
  `mill_invoice_id` int NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `payment_method` varchar(50) NOT NULL,
  `payment_date` timestamp NOT NULL,
  `payment_reference` varchar(200),
  `idempotency_key` varchar(100) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` int,
  CONSTRAINT `supplier_invoice_payments_id` PRIMARY KEY (`id`)
);

-- Add supplier foreign key only if the database does not already have it.
SET @has_supplier_fk = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'mill_invoices'
    AND CONSTRAINT_NAME = 'mi_supplier_fk'
);
SET @sql = IF(@has_supplier_fk = 0,
  'ALTER TABLE `mill_invoices` ADD CONSTRAINT `mi_supplier_fk` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_payment_invoice_fk = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_invoice_payments'
    AND CONSTRAINT_NAME = 'sip_mill_invoice_fk'
);
SET @sql = IF(@has_payment_invoice_fk = 0,
  'ALTER TABLE `supplier_invoice_payments` ADD CONSTRAINT `sip_mill_invoice_fk` FOREIGN KEY (`mill_invoice_id`) REFERENCES `mill_invoices`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_payment_user_fk = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_invoice_payments'
    AND CONSTRAINT_NAME = 'sip_created_by_fk'
);
SET @sql = IF(@has_payment_user_fk = 0,
  'ALTER TABLE `supplier_invoice_payments` ADD CONSTRAINT `sip_created_by_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Railway-compatible conditional indexes.
SET @has_mill_supplier_idx = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mill_invoices' AND INDEX_NAME = 'idx_mill_invoices_supplier'
);
SET @sql = IF(@has_mill_supplier_idx = 0,
  'CREATE INDEX `idx_mill_invoices_supplier` ON `mill_invoices` (`supplier_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_sip_key_idx = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_invoice_payments' AND INDEX_NAME = 'uq_sip_idempotency_key'
);
SET @sql = IF(@has_sip_key_idx = 0,
  'CREATE UNIQUE INDEX `uq_sip_idempotency_key` ON `supplier_invoice_payments` (`idempotency_key`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_sip_invoice_idx = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_invoice_payments' AND INDEX_NAME = 'idx_sip_mill_invoice_id'
);
SET @sql = IF(@has_sip_invoice_idx = 0,
  'CREATE INDEX `idx_sip_mill_invoice_id` ON `supplier_invoice_payments` (`mill_invoice_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_sip_date_idx = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_invoice_payments' AND INDEX_NAME = 'idx_sip_payment_date'
);
SET @sql = IF(@has_sip_date_idx = 0,
  'CREATE INDEX `idx_sip_payment_date` ON `supplier_invoice_payments` (`payment_date`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
