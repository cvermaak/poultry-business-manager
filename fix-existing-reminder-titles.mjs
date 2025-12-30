import mysql from 'mysql2/promise';

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // Get all flocks with their placement dates
  const [flocks] = await conn.execute('SELECT id, placementDate FROM flocks');
  const flockMap = new Map();
  for (const flock of flocks) {
    flockMap.set(flock.id, new Date(flock.placementDate));
  }
  
  // Get all reminders with "Day X" in title
  const [reminders] = await conn.execute("SELECT id, flockId, title, dueDate FROM reminders WHERE title REGEXP '^Day [0-9-]+'");
  
  let updateCount = 0;
  
  for (const reminder of reminders) {
    const placementDate = flockMap.get(reminder.flockId);
    if (!placementDate) {
      console.log(`Skipping reminder ${reminder.id}: no flock found`);
      continue;
    }
    
    // Calculate actual day number from placement date (Day 0 = placement day)
    const dueDate = new Date(reminder.dueDate);
    const placementUTC = Date.UTC(placementDate.getUTCFullYear(), placementDate.getUTCMonth(), placementDate.getUTCDate());
    const dueUTC = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
    const actualDay = Math.floor((dueUTC - placementUTC) / (1000 * 60 * 60 * 24));
    
    // Extract day number from title
    const dayMatch = reminder.title.match(/^Day\s+(-?\d+)/i);
    if (dayMatch) {
      const titleDay = parseInt(dayMatch[1]);
      
      // If title day doesn't match actual day, fix it
      if (titleDay !== actualDay) {
        const newTitle = reminder.title.replace(/^Day\s+(-?\d+)/i, `Day ${actualDay}`);
        console.log(`Fixing: "${reminder.title}" -> "${newTitle}" (actual day: ${actualDay})`);
        
        await conn.execute(
          'UPDATE reminders SET title = ? WHERE id = ?',
          [newTitle, reminder.id]
        );
        updateCount++;
      }
    }
  }
  
  await conn.end();
  console.log(`Done! Updated ${updateCount} reminders.`);
}

main().catch(console.error);
