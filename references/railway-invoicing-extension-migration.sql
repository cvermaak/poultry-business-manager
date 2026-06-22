-- Invoicing Extension Module Migration
-- Run this on your Railway MySQL database

-- 1. Add invoiceType discriminator to existing invoices table
ALTER TABLE `invoices`
  ADD COLUMN IF NOT EXISTS `invoiceType`      VARCHAR(50) NOT NULL DEFAULT 'catch_sale',
  ADD COLUMN IF NOT EXISTS `feedOrderId`      INT NULL,
  ADD COLUMN IF NOT EXISTS `feedDeliveryId`   INT NULL;

-- 2. Create mill_invoices table
CREATE TABLE IF NOT EXISTS `mill_invoices` (
  `id`               INT            NOT NULL AUTO_INCREMENT,
  `invoiceNumber`    VARCHAR(100)   NOT NULL,
  `millName`         VARCHAR(255)   NOT NULL DEFAULT 'The Mill',
  `feedOrderId`      INT            NULL,
  `invoiceDate`      BIGINT         NOT NULL,
  `dueDate`          BIGINT         NOT NULL,
  `totalAmount`      DECIMAL(12,2)  NOT NULL DEFAULT 0,
  `vatAmount`        DECIMAL(12,2)  NOT NULL DEFAULT 0,
  `status`           VARCHAR(50)    NOT NULL DEFAULT 'unpaid',
  `paidDate`         BIGINT         NULL,
  `paidAmount`       DECIMAL(12,2)  NULL,
  `paymentReference` VARCHAR(255)   NULL,
  `notes`            TEXT           NULL,
  `createdAt`        BIGINT         NOT NULL DEFAULT (UNIX_TIMESTAMP() * 1000),
  `updatedAt`        BIGINT         NOT NULL DEFAULT (UNIX_TIMESTAMP() * 1000),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_mill_invoice_number` (`invoiceNumber`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
