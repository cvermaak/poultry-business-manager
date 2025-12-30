import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

const connection = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(connection);

const [rows] = await connection.execute("SELECT id, name, is_bundle, bundle_config FROM reminder_templates WHERE is_bundle = 1 LIMIT 1");
console.log("Bundle template:", JSON.stringify(rows[0], null, 2));

// Check a sample of the bundle_config
if (rows[0]?.bundle_config) {
  const config = JSON.parse(rows[0].bundle_config);
  console.log("\nFirst category:", config[0]?.name);
  console.log("First reminder in first category:", JSON.stringify(config[0]?.reminders?.[0], null, 2));
}

await connection.end();
