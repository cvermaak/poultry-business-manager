import mysql from 'mysql2/promise';

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // Get all bundle templates
  const [rows] = await conn.execute('SELECT id, name, bundle_config FROM reminder_templates WHERE is_bundle = 1');
  
  for (const row of rows) {
    let config = row.bundle_config;
    // Handle if config is a string
    if (typeof config === 'string') {
      config = JSON.parse(config);
    }
    
    // Config is an array of category objects (not { categories: [...] })
    if (!Array.isArray(config)) {
      console.log(`Skipping template ${row.id}: config is not an array`);
      continue;
    }
    
    let updated = false;
    
    for (const category of config) {
      if (!category.reminders || !Array.isArray(category.reminders)) {
        continue;
      }
      
      for (const reminder of category.reminders) {
        const dayOffset = reminder.dayOffset;
        const oldName = reminder.name;
        
        // Check if name starts with "Day X" pattern
        const dayMatch = oldName.match(/^Day\s+(-?\d+)/i);
        if (dayMatch) {
          const nameDay = parseInt(dayMatch[1]);
          // If the day in the name doesn't match the dayOffset, fix it
          if (nameDay !== dayOffset) {
            // Replace "Day X" with "Day {dayOffset}"
            const newName = oldName.replace(/^Day\s+(-?\d+)/i, `Day ${dayOffset}`);
            console.log(`Fixing: "${oldName}" -> "${newName}" (dayOffset: ${dayOffset})`);
            reminder.name = newName;
            updated = true;
          }
        }
      }
    }
    
    if (updated) {
      // Update the bundle_config in database
      await conn.execute(
        'UPDATE reminder_templates SET bundle_config = ? WHERE id = ?',
        [JSON.stringify(config), row.id]
      );
      console.log(`Updated template: ${row.name}`);
    } else {
      console.log(`No changes needed for template: ${row.name}`);
    }
  }
  
  await conn.end();
  console.log('Done!');
}

main().catch(console.error);
