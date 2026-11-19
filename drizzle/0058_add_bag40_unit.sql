-- Add "Bag (40 kg)" packaging unit: 1 bag40 = 40 kg (base unit: kg).
INSERT INTO `unit_of_measures` (`code`, `name`, `symbol`, `uom_type`, `base_uom_code`, `conversion_factor`, `is_base`, `is_active`)
VALUES ('bag40', 'Bag (40 kg)', 'bag40', 'packaging', 'kg', 40.00000000, 0, 1)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `base_uom_code` = 'kg', `conversion_factor` = 40.00000000, `is_active` = 1;
