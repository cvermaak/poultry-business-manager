-- ============================================================================
-- Feed Management Module — Railway SQL Migration
-- Run this script on your Railway MySQL database to add the Feed Management
-- tables and the new allocation columns on the flocks table.
-- ============================================================================

-- 1. Feed Formulations table
CREATE TABLE IF NOT EXISTS `feed_formulations` (
  `id`                    INT           NOT NULL AUTO_INCREMENT,
  `name`                  VARCHAR(200)  NOT NULL,
  `feedRange`             ENUM('premium','value','econo') NOT NULL,
  `feedStage`             ENUM('starter','grower','finisher') NOT NULL,
  `version`               INT           NOT NULL DEFAULT 1,
  `description`           TEXT,
  `ingredients`           TEXT          NOT NULL,
  `proteinPercentage`     DECIMAL(5,2),
  `energyContent`         DECIMAL(10,2),
  `crudeProtein`          DECIMAL(5,2),
  `crudeFiber`            DECIMAL(5,2),
  `calcium`               DECIMAL(5,2),
  `phosphorus`            DECIMAL(5,2),
  `macroKgPerTon`         DECIMAL(8,3),
  `soyaOilKgPerTon`       DECIMAL(8,3),
  `probioticKgPerTon`     DECIMAL(8,3),
  `allocationKgPerBird`   DECIMAL(6,3),
  `effectiveDate`         VARCHAR(20),
  `isActive`              TINYINT       NOT NULL DEFAULT 1,
  `createdAt`             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `createdBy`             INT,
  PRIMARY KEY (`id`),
  INDEX `idx_feed_formulations_range_stage` (`feedRange`, `feedStage`),
  CONSTRAINT `fk_feed_formulations_user` FOREIGN KEY (`createdBy`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Mill Costs table
CREATE TABLE IF NOT EXISTS `mill_costs` (
  `id`            INT           NOT NULL AUTO_INCREMENT,
  `feedRange`     ENUM('premium','value','econo') NOT NULL,
  `feedType`      ENUM('starter','grower','finisher') NOT NULL,
  `costPerTon`    DECIMAL(10,2) NOT NULL,
  `effectiveDate` VARCHAR(20)   NOT NULL,
  `notes`         TEXT,
  `createdAt`     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `createdBy`     INT,
  PRIMARY KEY (`id`),
  INDEX `idx_mill_costs_range_type` (`feedRange`, `feedType`),
  INDEX `idx_mill_costs_effective_date` (`effectiveDate`),
  CONSTRAINT `fk_mill_costs_user` FOREIGN KEY (`createdBy`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Customer Feed Prices table
CREATE TABLE IF NOT EXISTS `customer_feed_prices` (
  `id`            INT           NOT NULL AUTO_INCREMENT,
  `customerId`    INT           NOT NULL,
  `feedRange`     ENUM('premium','value','econo') NOT NULL,
  `feedType`      ENUM('starter','grower','finisher') NOT NULL,
  `pricePerTon`   DECIMAL(10,2) NOT NULL,
  `effectiveDate` VARCHAR(20)   NOT NULL,
  `notes`         TEXT,
  `createdAt`     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `createdBy`     INT,
  PRIMARY KEY (`id`),
  INDEX `idx_customer_feed_prices_customer` (`customerId`),
  INDEX `idx_customer_feed_prices_range_type` (`feedRange`, `feedType`),
  INDEX `idx_customer_feed_prices_effective_date` (`effectiveDate`),
  CONSTRAINT `fk_customer_feed_prices_customer` FOREIGN KEY (`customerId`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_customer_feed_prices_user` FOREIGN KEY (`createdBy`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Add allocation kg/bird columns to flocks table (if not already present)
ALTER TABLE `flocks`
  ADD COLUMN IF NOT EXISTS `starterAllocationKgPerBird`  DECIMAL(6,3) DEFAULT 0.900,
  ADD COLUMN IF NOT EXISTS `growerAllocationKgPerBird`   DECIMAL(6,3) DEFAULT 1.750,
  ADD COLUMN IF NOT EXISTS `finisherAllocationKgPerBird` DECIMAL(6,3) DEFAULT 0.350;
