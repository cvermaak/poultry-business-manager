-- -----------------------------------------------------------------------------
-- MIGRATION 0045: Idempotent source-document links for automatic accounting
-- -----------------------------------------------------------------------------
-- One source document may create one posted journal. This independent link table
-- keeps idempotency controls separate from generic manual-journal source fields.

CREATE TABLE IF NOT EXISTS `accounting_source_postings` (
  `id` int AUTO_INCREMENT NOT NULL,
  `sourceType` varchar(50) NOT NULL,
  `sourceId` int NOT NULL,
  `journal_entry_id` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdBy` int,
  CONSTRAINT `accounting_source_postings_id` PRIMARY KEY (`id`),
  CONSTRAINT `uq_accounting_source_postings_source` UNIQUE (`sourceType`, `sourceId`),
  CONSTRAINT `uq_accounting_source_postings_journal` UNIQUE (`journal_entry_id`)
);

SET @journal_fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'accounting_source_postings'
    AND REFERENCED_TABLE_NAME = 'journal_entries'
);
SET @sql = IF(
  @journal_fk_exists = 0,
  'ALTER TABLE `accounting_source_postings` ADD CONSTRAINT `asp_journal_entry_fk` FOREIGN KEY (`journal_entry_id`) REFERENCES `journal_entries` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @user_fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'accounting_source_postings'
    AND REFERENCED_TABLE_NAME = 'users'
);
SET @sql = IF(
  @user_fk_exists = 0,
  'ALTER TABLE `accounting_source_postings` ADD CONSTRAINT `asp_created_by_fk` FOREIGN KEY (`createdBy`) REFERENCES `users` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
