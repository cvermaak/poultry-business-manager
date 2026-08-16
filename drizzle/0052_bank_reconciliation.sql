-- -----------------------------------------------------------------------------
-- FINANCIAL ACCOUNTING PHASE 5: BANK RECONCILIATION
-- Railway / MySQL safe: tables are created idempotently. Indexes and foreign
-- keys are declared inside CREATE TABLE so no unsupported IF NOT EXISTS index
-- syntax is used.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `bank_reconciliations` (
  `id` int AUTO_INCREMENT NOT NULL,
  `reconciliationNumber` varchar(50) NOT NULL,
  `bank_account_id` int NOT NULL,
  `statementStartDate` varchar(10) NOT NULL,
  `statementEndDate` varchar(10) NOT NULL,
  `openingStatementBalance` decimal(15,2) NOT NULL,
  `closingStatementBalance` decimal(15,2) NOT NULL,
  `status` enum('draft','in_progress','completed') NOT NULL DEFAULT 'draft',
  `notes` text,
  `completedAt` timestamp NULL,
  `completed_by` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_by` int NOT NULL,
  CONSTRAINT `bank_reconciliations_id` PRIMARY KEY (`id`),
  CONSTRAINT `uq_bank_reconciliations_number` UNIQUE (`reconciliationNumber`),
  CONSTRAINT `uq_bank_reconciliations_account_period` UNIQUE (`bank_account_id`,`statementStartDate`,`statementEndDate`),
  KEY `idx_bank_reconciliations_status` (`status`),
  CONSTRAINT `bank_reconciliations_account_fk` FOREIGN KEY (`bank_account_id`) REFERENCES `chart_of_accounts` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `bank_reconciliations_completed_by_fk` FOREIGN KEY (`completed_by`) REFERENCES `users` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `bank_reconciliations_created_by_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE TABLE IF NOT EXISTS `bank_statement_lines` (
  `id` int AUTO_INCREMENT NOT NULL,
  `reconciliation_id` int NOT NULL,
  `lineKey` varchar(100) NOT NULL,
  `transactionDate` varchar(10) NOT NULL,
  `valueDate` varchar(10),
  `description` varchar(500) NOT NULL,
  `reference` varchar(200),
  `direction` enum('inflow','outflow') NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `runningBalance` decimal(15,2),
  `status` enum('unmatched','matched') NOT NULL DEFAULT 'unmatched',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` int NOT NULL,
  CONSTRAINT `bank_statement_lines_id` PRIMARY KEY (`id`),
  CONSTRAINT `uq_bank_statement_lines_reconciliation_key` UNIQUE (`reconciliation_id`,`lineKey`),
  KEY `idx_bank_statement_lines_reconciliation_status` (`reconciliation_id`,`status`),
  KEY `idx_bank_statement_lines_date` (`transactionDate`),
  CONSTRAINT `bank_statement_lines_reconciliation_fk` FOREIGN KEY (`reconciliation_id`) REFERENCES `bank_reconciliations` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `bank_statement_lines_created_by_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE TABLE IF NOT EXISTS `bank_reconciliation_matches` (
  `id` int AUTO_INCREMENT NOT NULL,
  `reconciliation_id` int NOT NULL,
  `statement_line_id` int NOT NULL,
  `ledger_entry_id` int NOT NULL,
  `matchedAmount` decimal(15,2) NOT NULL,
  `matchedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `matched_by` int NOT NULL,
  CONSTRAINT `bank_reconciliation_matches_id` PRIMARY KEY (`id`),
  CONSTRAINT `uq_bank_reconciliation_match_pair` UNIQUE (`statement_line_id`,`ledger_entry_id`),
  CONSTRAINT `uq_bank_reconciliation_match_ledger_entry` UNIQUE (`ledger_entry_id`),
  KEY `idx_bank_reconciliation_matches_reconciliation` (`reconciliation_id`),
  CONSTRAINT `bank_reconciliation_matches_reconciliation_fk` FOREIGN KEY (`reconciliation_id`) REFERENCES `bank_reconciliations` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `bank_reconciliation_matches_statement_line_fk` FOREIGN KEY (`statement_line_id`) REFERENCES `bank_statement_lines` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `bank_reconciliation_matches_ledger_entry_fk` FOREIGN KEY (`ledger_entry_id`) REFERENCES `general_ledger_entries` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `bank_reconciliation_matches_matched_by_fk` FOREIGN KEY (`matched_by`) REFERENCES `users` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
);
