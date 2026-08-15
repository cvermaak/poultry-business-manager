-- -----------------------------------------------------------------------------
-- MIGRATION 0049: Repair legacy invoice header amounts stored as cents
-- -----------------------------------------------------------------------------
-- Older rows can retain cents in subtotal/taxAmount/totalAmount/balanceDue,
-- even though exclusiveTotal/vatAmount/inclusiveTotal and the posted General
-- Ledger are already decimal-rand values. The strict 100× checks make this
-- repeatable migration safe for ordinary decimal-rand invoices.

UPDATE `invoices`
SET
  `subtotal` = CAST(`exclusiveTotal` AS DECIMAL(15,2)),
  `taxAmount` = CAST(`vatAmount` AS DECIMAL(15,2)),
  `totalAmount` = CAST(`inclusiveTotal` AS DECIMAL(15,2)),
  `paidAmount` = CASE
    WHEN ABS(CAST(`paidAmount` AS DECIMAL(15,2)) - CAST(`inclusiveTotal` AS DECIMAL(15,2)) * 100) <= 0.01
      THEN CAST(`inclusiveTotal` AS DECIMAL(15,2))
    ELSE CAST(`paidAmount` AS DECIMAL(15,2))
  END,
  `balanceDue` = GREATEST(
    CAST(`inclusiveTotal` AS DECIMAL(15,2)) - CASE
      WHEN ABS(CAST(`paidAmount` AS DECIMAL(15,2)) - CAST(`inclusiveTotal` AS DECIMAL(15,2)) * 100) <= 0.01
        THEN CAST(`inclusiveTotal` AS DECIMAL(15,2))
      ELSE CAST(`paidAmount` AS DECIMAL(15,2))
    END,
    0.00
  ),
  `status` = CASE
    WHEN `status` IN ('sent', 'partial', 'overdue')
         AND GREATEST(
           CAST(`inclusiveTotal` AS DECIMAL(15,2)) - CASE
             WHEN ABS(CAST(`paidAmount` AS DECIMAL(15,2)) - CAST(`inclusiveTotal` AS DECIMAL(15,2)) * 100) <= 0.01
               THEN CAST(`inclusiveTotal` AS DECIMAL(15,2))
             ELSE CAST(`paidAmount` AS DECIMAL(15,2))
           END,
           0.00
         ) = 0.00
      THEN 'paid'
    WHEN `status` IN ('sent', 'partial')
         AND CAST(`paidAmount` AS DECIMAL(15,2)) > 0.00
      THEN 'partial'
    ELSE `status`
  END,
  `updatedAt` = CURRENT_TIMESTAMP
WHERE CAST(`inclusiveTotal` AS DECIMAL(15,2)) > 0.00
  AND (
    ABS(CAST(`subtotal` AS DECIMAL(15,2)) - CAST(`exclusiveTotal` AS DECIMAL(15,2)) * 100) <= 0.01
    OR ABS(CAST(`taxAmount` AS DECIMAL(15,2)) - CAST(`vatAmount` AS DECIMAL(15,2)) * 100) <= 0.01
    OR ABS(CAST(`totalAmount` AS DECIMAL(15,2)) - CAST(`inclusiveTotal` AS DECIMAL(15,2)) * 100) <= 0.01
  );
