-- -----------------------------------------------------------------------------
-- MIGRATION 0046: make customer-invoice General Ledger identifiers unambiguous
-- -----------------------------------------------------------------------------
-- Customer invoices retain their customer-facing invoice numbers. Their linked
-- General Ledger journals use GL-<invoice-id>, rather than INV-<invoice-id>.
-- The migration is repeatable: after a successful rename, the INV- condition
-- is no longer true. A pre-existing conflicting GL identifier is left untouched
-- for manual review rather than risking a unique-key collision.

UPDATE `journal_entries` AS `journal`
INNER JOIN `accounting_source_postings` AS `source`
  ON `source`.`journal_entry_id` = `journal`.`id`
LEFT JOIN `journal_entries` AS `conflict`
  ON `conflict`.`journalNumber` = CONCAT('GL-', `source`.`sourceId`)
  AND `conflict`.`id` <> `journal`.`id`
SET `journal`.`journalNumber` = CONCAT('GL-', `source`.`sourceId`)
WHERE `source`.`sourceType` = 'customer_invoice'
  AND `journal`.`journalNumber` = CONCAT('INV-', `source`.`sourceId`)
  AND `conflict`.`id` IS NULL;

UPDATE `general_ledger_entries` AS `ledger`
INNER JOIN `accounting_source_postings` AS `source`
  ON `source`.`journal_entry_id` = `ledger`.`journal_entry_id`
INNER JOIN `journal_entries` AS `journal`
  ON `journal`.`id` = `ledger`.`journal_entry_id`
SET `ledger`.`entryNumber` = `journal`.`journalNumber`
WHERE `source`.`sourceType` = 'customer_invoice'
  AND `journal`.`journalNumber` = CONCAT('GL-', `source`.`sourceId`)
  AND `ledger`.`entryNumber` = CONCAT('INV-', `source`.`sourceId`);
