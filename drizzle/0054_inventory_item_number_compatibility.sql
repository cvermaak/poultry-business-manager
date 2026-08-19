-- -----------------------------------------------------------------------------
-- MIGRATION 0054: inventory_items itemNumber compatibility
-- -----------------------------------------------------------------------------
-- Current feed-order additive reservation joins inventory_items.itemNumber.
-- Some legacy development/Railway schemas predate that canonical column.
-- This migration is intentionally repeatable on MySQL variants that do not
-- support ADD COLUMN IF NOT EXISTS or CREATE INDEX IF NOT EXISTS.

SET @item_number_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inventory_items'
    AND COLUMN_NAME = 'itemNumber'
);

SET @sql = IF(
  @item_number_column_exists = 0,
  'ALTER TABLE `inventory_items` ADD COLUMN `itemNumber` varchar(50) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Give legacy rows a stable, unique fallback item number before enforcing
-- the current non-null application contract.
UPDATE `inventory_items`
SET `itemNumber` = CONCAT('LEGACY-', `id`)
WHERE `itemNumber` IS NULL OR TRIM(`itemNumber`) = '';

ALTER TABLE `inventory_items`
  MODIFY COLUMN `itemNumber` varchar(50) NOT NULL;

SET @item_number_index_exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inventory_items'
    AND INDEX_NAME = 'inventory_items_itemNumber_unique'
);

SET @sql = IF(
  @item_number_index_exists = 0,
  'CREATE INDEX `inventory_items_itemNumber_unique` ON `inventory_items` (`itemNumber`)',
  'SELECT 1'
);
PREPARE stmt_index FROM @sql;
EXECUTE stmt_index;
DEALLOCATE PREPARE stmt_index;
