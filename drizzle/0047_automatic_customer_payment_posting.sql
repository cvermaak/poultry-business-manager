-- -----------------------------------------------------------------------------
-- MIGRATION 0047: customer invoice payment receipts for automatic GL posting
-- -----------------------------------------------------------------------------
-- This migration is intentionally Railway-safe and repeatable. It does not alter
-- the legacy generic payments/payment_allocations tables, whose integer amounts
-- have historical cents semantics. New customer-invoice receipts use decimals in
-- rands, matching invoices and the General Ledger.

SET @customer_invoice_payments_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'customer_invoice_payments'
);

SET @sql = IF(
  @customer_invoice_payments_exists = 0,
  'CREATE TABLE `customer_invoice_payments` (
    `id` int AUTO_INCREMENT NOT NULL,
    `invoice_id` int NOT NULL,
    `amount` decimal(15,2) NOT NULL,
    `payment_method` varchar(50) NOT NULL,
    `payment_date` timestamp NOT NULL,
    `payment_reference` varchar(200),
    `idempotency_key` varchar(100) NOT NULL,
    `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `created_by` int,
    CONSTRAINT `customer_invoice_payments_id` PRIMARY KEY (`id`),
    CONSTRAINT `cip_invoice_fk` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `cip_created_by_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT `uq_cip_idempotency_key` UNIQUE (`idempotency_key`),
    KEY `idx_cip_invoice_id` (`invoice_id`),
    KEY `idx_cip_payment_date` (`payment_date`)
  )',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
