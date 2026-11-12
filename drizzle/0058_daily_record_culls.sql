-- Daily cull capture: adds culls and cullReason to flock_daily_records.
-- Guarded, safe to run once per environment (no-op where columns exist).

SET @culls_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'flock_daily_records' AND column_name = 'culls');
SET @culls_sql = IF(@culls_exists = 0,
  'ALTER TABLE `flock_daily_records` ADD COLUMN `culls` int NULL', 'SELECT 1');
PREPARE stmt FROM @culls_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @cull_reason_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'flock_daily_records' AND column_name = 'cullReason');
SET @cull_reason_sql = IF(@cull_reason_exists = 0,
  'ALTER TABLE `flock_daily_records` ADD COLUMN `cullReason` text NULL', 'SELECT 1');
PREPARE stmt FROM @cull_reason_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
