import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;

async function main() {
  const connection = await mysql.createConnection(DATABASE_URL);
  const db = drizzle(connection);
  
  const [rows] = await connection.execute(`
    SELECT id, name, reminderType, is_bundle, 
           CASE WHEN bundle_config IS NOT NULL THEN bundle_config ELSE NULL END as bundle_config
    FROM reminder_templates 
    WHERE is_active = 1 
    ORDER BY is_bundle DESC, reminderType, day_offset
  `);
  
  console.log("\n=== REMINDER TEMPLATES ===\n");
  
  let bundleCount = 0;
  let singleCount = 0;
  
  for (const row of rows) {
    if (row.is_bundle) {
      bundleCount++;
      console.log(`[BUNDLE] ${row.name}`);
      if (row.bundle_config) {
        try {
          const config = JSON.parse(row.bundle_config);
          console.log(`  Categories: ${config.length}`);
          let totalReminders = 0;
          for (const cat of config) {
            if (cat.enabled && cat.reminders) {
              console.log(`    - ${cat.category}: ${cat.reminders.length} reminders`);
              totalReminders += cat.reminders.length;
            }
          }
          console.log(`  Total reminders: ${totalReminders}`);
        } catch (e) {
          console.log(`  Config: ${row.bundle_config}`);
        }
      }
    } else {
      singleCount++;
      console.log(`[SINGLE] ${row.name} (${row.reminderType})`);
    }
  }
  
  console.log(`\n=== SUMMARY ===`);
  console.log(`Bundle templates: ${bundleCount}`);
  console.log(`Single templates: ${singleCount}`);
  console.log(`Total: ${bundleCount + singleCount}`);
  
  await connection.end();
}

main().catch(console.error);
