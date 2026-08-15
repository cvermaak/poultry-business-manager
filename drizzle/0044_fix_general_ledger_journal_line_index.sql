-- -----------------------------------------------------------------------------
-- MIGRATION 0044: Allow multiple general-ledger lines in one balanced journal
-- -----------------------------------------------------------------------------
-- A journal header has one unique journal number. Individual ledger lines share
-- that journal number, so general_ledger_entries.entryNumber must be indexed but
-- must not be unique.

SET @unique_entry_number_index_exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'general_ledger_entries'
    AND INDEX_NAME = 'general_ledger_entries_entryNumber_unique'
    AND NON_UNIQUE = 0
);
SET @sql = IF(
  @unique_entry_number_index_exists > 0,
  'ALTER TABLE `general_ledger_entries` DROP INDEX `general_ledger_entries_entryNumber_unique`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @entry_number_index_exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'general_ledger_entries'
    AND INDEX_NAME = 'idx_general_ledger_entries_entry_number'
);
SET @sql = IF(
  @entry_number_index_exists = 0,
  'CREATE INDEX `idx_general_ledger_entries_entry_number` ON `general_ledger_entries` (`entryNumber`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
