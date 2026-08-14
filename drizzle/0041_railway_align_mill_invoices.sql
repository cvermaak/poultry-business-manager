-- Railway development schema alignment for the canonical AFGRO mill_invoices table.
-- This migration intentionally replaces the legacy table. Run it only after confirming
-- the target environment has no mill-invoice data that must be retained.

DROP TABLE IF EXISTS `mill_invoices`;

CREATE TABLE `mill_invoices` (
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
  CONSTRAINT `mill_invoices_id` PRIMARY KEY (`id`),
  CONSTRAINT `mill_invoices_feed_order_id_feed_orders_id_fk`
    FOREIGN KEY (`feed_order_id`) REFERENCES `feed_orders`(`id`)
    ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `mill_invoices_created_by_users_id_fk`
    FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
    ON DELETE NO ACTION ON UPDATE NO ACTION,
  INDEX `mill_invoices_number_unique` (`invoiceNumber`),
  INDEX `idx_mill_invoices_feed_order` (`feed_order_id`),
  INDEX `idx_mill_invoices_status` (`mill_invoice_status`),
  INDEX `idx_mill_invoices_due_date` (`dueDate`)
);
