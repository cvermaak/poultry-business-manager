-- -----------------------------------------------------------------------------
-- MIGRATION 0055: additive_inventory_mappings timestamp compatibility
-- -----------------------------------------------------------------------------
-- Legacy databases used created_at / updated_at while the current Drizzle
-- contract reads createdAt / updatedAt. Retain legacy fields and add canonical
-- fields with database defaults so existing and current application rows remain
-- readable without destructive column renames.

SET @created_at_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'additive_inventory_mappings'
    AND COLUMN_NAME = 'createdAt'
);

SET @sql = IF(
  @created_at_column_exists = 0,
  'ALTER TABLE `additive_inventory_mappings` ADD COLUMN `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP',
  'SELECT 1'
);
PREPARE stmt_created_at FROM @sql;
EXECUTE stmt_created_at;
DEALLOCATE PREPARE stmt_created_at;

SET @updated_at_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'additive_inventory_mappings'
    AND COLUMN_NAME = 'updatedAt'
);

SET @sql = IF(
  @updated_at_column_exists = 0,
  'ALTER TABLE `additive_inventory_mappings` ADD COLUMN `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'SELECT 1'
);
PREPARE stmt_updated_at FROM @sql;
EXECUTE stmt_updated_at;
DEALLOCATE PREPARE stmt_updated_at;
