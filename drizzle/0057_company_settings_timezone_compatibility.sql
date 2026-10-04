-- =============================================================================
-- Company Settings timezone compatibility
--
-- The Company Settings UI persists a timezone on every save. Older environments
-- created from migration 0026 do not have this column. This guarded migration
-- is safe to run once on each environment and is a no-op where it already exists.
-- =============================================================================

SET @company_settings_timezone_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'company_settings'
    AND column_name = 'timezone'
);

SET @company_settings_timezone_sql = IF(
  @company_settings_timezone_exists = 0,
  'ALTER TABLE `company_settings` ADD COLUMN `timezone` varchar(100) NOT NULL DEFAULT ''UTC'' AFTER `logoUrl`',
  'SELECT 1'
);

PREPARE company_settings_timezone_statement FROM @company_settings_timezone_sql;
EXECUTE company_settings_timezone_statement;
DEALLOCATE PREPARE company_settings_timezone_statement;
