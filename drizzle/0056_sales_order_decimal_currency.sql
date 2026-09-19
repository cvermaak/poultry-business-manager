-- =============================================================================
-- Railway development: preserve cents in Sales Order monetary fields.
--
-- This is non-destructive. Existing whole-rand integer values become values with
-- a .00 scale; no order, customer, invoice, or line-item rows are deleted.
-- Run once after deploying the matching source files.
-- =============================================================================

ALTER TABLE `sales_order_items` MODIFY COLUMN `unitPrice` DECIMAL(15,2) NOT NULL;
ALTER TABLE `sales_order_items` MODIFY COLUMN `subtotal` DECIMAL(15,2) NOT NULL;
ALTER TABLE `sales_order_items` MODIFY COLUMN `taxAmount` DECIMAL(15,2) NOT NULL;
ALTER TABLE `sales_order_items` MODIFY COLUMN `totalAmount` DECIMAL(15,2) NOT NULL;

ALTER TABLE `sales_orders` MODIFY COLUMN `subtotal` DECIMAL(15,2) NOT NULL;
ALTER TABLE `sales_orders` MODIFY COLUMN `taxAmount` DECIMAL(15,2) NOT NULL;
ALTER TABLE `sales_orders` MODIFY COLUMN `totalAmount` DECIMAL(15,2) NOT NULL;
