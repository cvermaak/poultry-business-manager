import mysql from 'mysql2/promise';
import { config } from 'dotenv';
config();

const sqls = [
  `CREATE TABLE IF NOT EXISTS \`feed_orders\` (
    \`id\` INT NOT NULL AUTO_INCREMENT,
    \`orderNumber\` VARCHAR(50) NOT NULL,
    \`customerId\` INT NOT NULL,
    \`flockId\` INT,
    \`feedRange\` ENUM('premium','value','econo') NOT NULL,
    \`feedStage\` ENUM('starter','grower','finisher') NOT NULL,
    \`formulationId\` INT,
    \`quantityTons\` DECIMAL(10,3) NOT NULL,
    \`birdCount\` INT,
    \`allocationKgPerBird\` DECIMAL(6,3),
    \`transportMode\` ENUM('afgro_delivers','customer_collects') NOT NULL DEFAULT 'afgro_delivers',
    \`transportCostPerTon\` DECIMAL(10,2) DEFAULT 0.00,
    \`transportCostTotal\` DECIMAL(10,2) DEFAULT 0.00,
    \`orderDate\` VARCHAR(20) NOT NULL,
    \`requiredByDate\` VARCHAR(20) NOT NULL,
    \`macroOrderDeadline\` VARCHAR(20),
    \`millProductionDeadline\` VARCHAR(20),
    \`status\` ENUM('draft','submitted_to_mill','in_production','ready_for_collection','partially_delivered','delivered','invoiced','cancelled') NOT NULL DEFAULT 'draft',
    \`millInvoiceNumber\` VARCHAR(100),
    \`millInvoiceDate\` VARCHAR(20),
    \`millInvoiceAmountExcl\` DECIMAL(12,2),
    \`millInvoiceDueDate\` VARCHAR(20),
    \`millInvoicePaid\` TINYINT DEFAULT 0,
    \`millInvoicePaidDate\` VARCHAR(20),
    \`pricePerTon\` DECIMAL(10,2),
    \`notes\` TEXT,
    \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    \`createdBy\` INT,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`feed_orders_orderNumber_unique\` (\`orderNumber\`),
    INDEX \`idx_feed_orders_customer\` (\`customerId\`),
    INDEX \`idx_feed_orders_flock\` (\`flockId\`),
    INDEX \`idx_feed_orders_status\` (\`status\`),
    INDEX \`idx_feed_orders_required_by\` (\`requiredByDate\`),
    CONSTRAINT \`fk_feed_orders_customer\` FOREIGN KEY (\`customerId\`) REFERENCES \`customers\` (\`id\`),
    CONSTRAINT \`fk_feed_orders_flock\` FOREIGN KEY (\`flockId\`) REFERENCES \`flocks\` (\`id\`),
    CONSTRAINT \`fk_feed_orders_formulation\` FOREIGN KEY (\`formulationId\`) REFERENCES \`feed_formulations\` (\`id\`),
    CONSTRAINT \`fk_feed_orders_user\` FOREIGN KEY (\`createdBy\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS \`feed_order_deliveries\` (
    \`id\` INT NOT NULL AUTO_INCREMENT,
    \`feedOrderId\` INT NOT NULL,
    \`deliveryNumber\` VARCHAR(50) NOT NULL,
    \`deliveryDate\` VARCHAR(20) NOT NULL,
    \`quantityTons\` DECIMAL(10,3) NOT NULL,
    \`driverName\` VARCHAR(200),
    \`vehicleReg\` VARCHAR(50),
    \`deliveryNoteNumber\` VARCHAR(100),
    \`receivedBy\` VARCHAR(200),
    \`customerInvoiceId\` INT,
    \`status\` ENUM('scheduled','in_transit','delivered','invoiced') NOT NULL DEFAULT 'scheduled',
    \`notes\` TEXT,
    \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    \`createdBy\` INT,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`feed_order_deliveries_deliveryNumber_unique\` (\`deliveryNumber\`),
    INDEX \`idx_feed_order_deliveries_order\` (\`feedOrderId\`),
    INDEX \`idx_feed_order_deliveries_date\` (\`deliveryDate\`),
    CONSTRAINT \`fk_feed_order_deliveries_order\` FOREIGN KEY (\`feedOrderId\`) REFERENCES \`feed_orders\` (\`id\`) ON DELETE CASCADE,
    CONSTRAINT \`fk_feed_order_deliveries_user\` FOREIGN KEY (\`createdBy\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS \`additive_purchase_orders\` (
    \`id\` INT NOT NULL AUTO_INCREMENT,
    \`poNumber\` VARCHAR(50) NOT NULL,
    \`feedOrderId\` INT NOT NULL,
    \`supplierId\` INT,
    \`additiveType\` ENUM('macro','soya_oil','probiotic') NOT NULL,
    \`quantityKg\` DECIMAL(10,3) NOT NULL,
    \`unitPricePerKg\` DECIMAL(10,4),
    \`totalAmountExcl\` DECIMAL(12,2),
    \`vatAmount\` DECIMAL(12,2),
    \`totalAmountIncl\` DECIMAL(12,2),
    \`leadTimeDays\` INT NOT NULL,
    \`orderDeadlineDate\` VARCHAR(20) NOT NULL,
    \`orderPlacedDate\` VARCHAR(20),
    \`expectedDeliveryDate\` VARCHAR(20),
    \`actualDeliveryDate\` VARCHAR(20),
    \`isCriticalPath\` TINYINT NOT NULL DEFAULT 0,
    \`status\` ENUM('pending','ordered','confirmed','delivered','cancelled') NOT NULL DEFAULT 'pending',
    \`supplierInvoiceNumber\` VARCHAR(100),
    \`supplierInvoiceDate\` VARCHAR(20),
    \`supplierInvoicePaid\` TINYINT DEFAULT 0,
    \`notes\` TEXT,
    \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    \`createdBy\` INT,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`additive_purchase_orders_poNumber_unique\` (\`poNumber\`),
    INDEX \`idx_additive_pos_feed_order\` (\`feedOrderId\`),
    INDEX \`idx_additive_pos_supplier\` (\`supplierId\`),
    INDEX \`idx_additive_pos_additive_type\` (\`additiveType\`),
    INDEX \`idx_additive_pos_status\` (\`status\`),
    INDEX \`idx_additive_pos_deadline\` (\`orderDeadlineDate\`),
    CONSTRAINT \`fk_additive_pos_feed_order\` FOREIGN KEY (\`feedOrderId\`) REFERENCES \`feed_orders\` (\`id\`) ON DELETE CASCADE,
    CONSTRAINT \`fk_additive_pos_supplier\` FOREIGN KEY (\`supplierId\`) REFERENCES \`suppliers\` (\`id\`) ON DELETE SET NULL,
    CONSTRAINT \`fk_additive_pos_user\` FOREIGN KEY (\`createdBy\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
];

async function run() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  for (const sql of sqls) {
    const tableName = sql.match(/CREATE TABLE IF NOT EXISTS `(\w+)`/)[1];
    await conn.execute(sql);
    console.log(`✓ Table created/verified: ${tableName}`);
  }
  await conn.end();
  console.log('\nAll feed order planning tables created successfully.');
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
