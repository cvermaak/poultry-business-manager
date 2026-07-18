-- =============================================================================
-- AFGRO Poultry Manager — Railway Incremental SQL Migration
-- Covers changes since: Additive Inventory Integration (commit 70464b4)
-- Includes: Invoicing Extension, Invoice Decimal Columns, Feed Order Invoice Link,
--           Units of Measure (UoM) system
-- Apply these statements in order on your Railway MySQL database.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- MIGRATION 0006: mill_invoices table (Invoicing Extension Module)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `mill_invoices` (
  `id` int AUTO_INCREMENT NOT NULL,
  `feed_order_id` int NOT NULL,
  `invoiceNumber` varchar(100) NOT NULL,
  `invoiceDate` varchar(20) NOT NULL,
  `dueDate` varchar(20) NOT NULL,
  `amountExcl` decimal(12,2) NOT NULL,
  `vatAmount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `amountIncl` decimal(12,2) NOT NULL,
  `mill_invoice_status` enum('outstanding','paid','overdue','disputed') NOT NULL DEFAULT 'outstanding',
  `paidDate` varchar(20),
  `paidAmount` decimal(12,2),
  `paymentReference` varchar(200),
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_by` int,
  CONSTRAINT `mill_invoices_id` PRIMARY KEY(`id`)
);

-- Add FK constraints only if they don't already exist
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'mill_invoices'
  AND CONSTRAINT_NAME = 'mill_invoices_feed_order_id_feed_orders_id_fk');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE `mill_invoices` ADD CONSTRAINT `mill_invoices_feed_order_id_feed_orders_id_fk` FOREIGN KEY (`feed_order_id`) REFERENCES `feed_orders`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists2 = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'mill_invoices'
  AND CONSTRAINT_NAME = 'mill_invoices_created_by_users_id_fk');
SET @sql2 = IF(@fk_exists2 = 0,
  'ALTER TABLE `mill_invoices` ADD CONSTRAINT `mill_invoices_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
  'SELECT 1');
PREPARE stmt2 FROM @sql2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

CREATE INDEX IF NOT EXISTS `mill_invoices_number_unique` ON `mill_invoices` (`invoiceNumber`);
CREATE INDEX IF NOT EXISTS `idx_mill_invoices_feed_order` ON `mill_invoices` (`feed_order_id`);
CREATE INDEX IF NOT EXISTS `idx_mill_invoices_status` ON `mill_invoices` (`mill_invoice_status`);
CREATE INDEX IF NOT EXISTS `idx_mill_invoices_due_date` ON `mill_invoices` (`dueDate`);


-- -----------------------------------------------------------------------------
-- MIGRATION 0007: invoices table — change monetary columns to decimal(15,2)
-- (safe to run if already decimal — MySQL will no-op if type is already correct)
-- -----------------------------------------------------------------------------
ALTER TABLE `invoices`
  MODIFY COLUMN `subtotal` decimal(15,2) NOT NULL,
  MODIFY COLUMN `taxAmount` decimal(15,2) NOT NULL,
  MODIFY COLUMN `totalAmount` decimal(15,2) NOT NULL,
  MODIFY COLUMN `paidAmount` decimal(15,2) NOT NULL DEFAULT '0.00',
  MODIFY COLUMN `balanceDue` decimal(15,2) NOT NULL;


-- -----------------------------------------------------------------------------
-- MIGRATION 0008: invoices table — add feed_order_id column
-- -----------------------------------------------------------------------------
ALTER TABLE `invoices`
  ADD COLUMN IF NOT EXISTS `feed_order_id` int NULL;

-- Add FK only if not already present
SET @fk_inv = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices'
  AND CONSTRAINT_NAME = 'invoices_feed_order_id_feed_orders_id_fk');
SET @sql_inv = IF(@fk_inv = 0,
  'ALTER TABLE `invoices` ADD CONSTRAINT `invoices_feed_order_id_feed_orders_id_fk` FOREIGN KEY (`feed_order_id`) REFERENCES `feed_orders`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
  'SELECT 1');
PREPARE stmt_inv FROM @sql_inv; EXECUTE stmt_inv; DEALLOCATE PREPARE stmt_inv;


-- -----------------------------------------------------------------------------
-- MIGRATION 0009: Units of Measure — new tables + columns on inventory tables
-- -----------------------------------------------------------------------------

-- unit_of_measures table
CREATE TABLE IF NOT EXISTS `unit_of_measures` (
  `code` varchar(20) NOT NULL,
  `name` varchar(100) NOT NULL,
  `symbol` varchar(20) NOT NULL,
  `uom_type` enum('weight','volume','count','packaging','other') NOT NULL DEFAULT 'other',
  `base_uom_code` varchar(20),
  `conversion_factor` decimal(18,8) NOT NULL DEFAULT '1.00000000',
  `is_base` tinyint NOT NULL DEFAULT 0,
  `is_active` tinyint NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `unit_of_measures_code` PRIMARY KEY(`code`)
);

CREATE INDEX IF NOT EXISTS `idx_uom_type` ON `unit_of_measures` (`uom_type`);
CREATE INDEX IF NOT EXISTS `idx_uom_is_active` ON `unit_of_measures` (`is_active`);

-- item_unit_conversions table
CREATE TABLE IF NOT EXISTS `item_unit_conversions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `item_id` int NOT NULL,
  `from_uom_code` varchar(20) NOT NULL,
  `to_uom_code` varchar(20) NOT NULL,
  `conversion_factor` decimal(18,8) NOT NULL,
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `item_unit_conversions_id` PRIMARY KEY(`id`)
);

-- Add FK only if not already present
SET @fk_iuc = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'item_unit_conversions'
  AND CONSTRAINT_NAME = 'item_unit_conversions_item_id_inventory_items_id_fk');
SET @sql_iuc = IF(@fk_iuc = 0,
  'ALTER TABLE `item_unit_conversions` ADD CONSTRAINT `item_unit_conversions_item_id_inventory_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
  'SELECT 1');
PREPARE stmt_iuc FROM @sql_iuc; EXECUTE stmt_iuc; DEALLOCATE PREPARE stmt_iuc;

CREATE INDEX IF NOT EXISTS `idx_iuc_item_id` ON `item_unit_conversions` (`item_id`);
CREATE INDEX IF NOT EXISTS `idx_iuc_from_to` ON `item_unit_conversions` (`from_uom_code`, `to_uom_code`);

-- Add UoM columns to inventory_items (safe — uses IF NOT EXISTS pattern via column check)
ALTER TABLE `inventory_items`
  ADD COLUMN IF NOT EXISTS `base_uom_code` varchar(20) NULL,
  ADD COLUMN IF NOT EXISTS `purchase_uom_code` varchar(20) NULL,
  ADD COLUMN IF NOT EXISTS `issue_uom_code` varchar(20) NULL;

-- Add UoM columns to inventory_transactions
ALTER TABLE `inventory_transactions`
  ADD COLUMN IF NOT EXISTS `uom_code` varchar(20) NULL,
  ADD COLUMN IF NOT EXISTS `quantity_in_base_unit` decimal(10,4) NULL;


-- -----------------------------------------------------------------------------
-- MIGRATION 0010: Fix timestamp defaults (already handled above with CURRENT_TIMESTAMP)
-- No additional SQL needed — CURRENT_TIMESTAMP is the correct default.
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- SEED: Standard Units of Measure (18 units)
-- Uses INSERT IGNORE so safe to run multiple times.
-- -----------------------------------------------------------------------------
INSERT IGNORE INTO `unit_of_measures` (`code`, `name`, `symbol`, `uom_type`, `base_uom_code`, `conversion_factor`, `is_base`, `is_active`) VALUES
-- Weight (base: kg)
('kg',    'Kilogram',          'kg',   'weight',    'kg',   1.00000000, 1, 1),
('g',     'Gram',              'g',    'weight',    'kg',   0.00100000, 0, 1),
('mg',    'Milligram',         'mg',   'weight',    'kg',   0.00000100, 0, 1),
('ton',   'Metric Ton',        't',    'weight',    'kg',   1000.00000000, 0, 1),
('lb',    'Pound',             'lb',   'weight',    'kg',   0.45359237, 0, 1),
-- Volume (base: litre)
('l',     'Litre',             'L',    'volume',    'l',    1.00000000, 1, 1),
('ml',    'Millilitre',        'mL',   'volume',    'l',    0.00100000, 0, 1),
('cl',    'Centilitre',        'cL',   'volume',    'l',    0.01000000, 0, 1),
-- Count (base: each)
('ea',    'Each',              'ea',   'count',     'ea',   1.00000000, 1, 1),
('doz',   'Dozen',             'doz',  'count',     'ea',   12.00000000, 0, 1),
('pair',  'Pair',              'pr',   'count',     'ea',   2.00000000, 0, 1),
-- Packaging
('bag50', 'Bag (50 kg)',        'bag50','packaging', 'kg',   50.00000000, 0, 1),
('bag25', 'Bag (25 kg)',        'bag25','packaging', 'kg',   25.00000000, 0, 1),
('bag10', 'Bag (10 kg)',        'bag10','packaging', 'kg',   10.00000000, 0, 1),
('bag5',  'Bag (5 kg)',         'bag5', 'packaging', 'kg',   5.00000000,  0, 1),
('crate', 'Crate',              'crt',  'packaging', 'ea',   1.00000000,  0, 1),
('pallet','Pallet',             'plt',  'packaging', 'ea',   1.00000000,  0, 1),
('drum',  'Drum (200 L)',       'drum', 'packaging', 'l',    200.00000000, 0, 1);


-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
-- After applying, verify with:
--   SELECT * FROM unit_of_measures;
--   SHOW COLUMNS FROM inventory_items LIKE '%uom%';
--   SHOW COLUMNS FROM inventory_transactions LIKE '%uom%';
--   SHOW COLUMNS FROM invoices LIKE 'feed_order_id';
--   DESCRIBE mill_invoices;
-- =============================================================================
