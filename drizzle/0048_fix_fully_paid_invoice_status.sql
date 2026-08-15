-- -----------------------------------------------------------------------------
-- MIGRATION 0048: Correct invoices whose balance is zero but status is partial
-- -----------------------------------------------------------------------------
-- This repeatable data repair is intentionally idempotent. It only updates
-- non-cancelled invoices whose stored balance is zero or less.

UPDATE `invoices`
SET
  `status` = 'paid',
  `updatedAt` = CURRENT_TIMESTAMP
WHERE `status` IN ('sent', 'partial', 'overdue')
  AND CAST(`balanceDue` AS DECIMAL(15,2)) <= 0.00;
