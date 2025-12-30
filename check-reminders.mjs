import mysql from 'mysql2/promise';

const connection = await mysql.createConnection(process.env.DATABASE_URL);

const [reminders] = await connection.query(`
SELECT r.id, r.title, r.flockId, r.status, r.dueDate, f.flockNumber
FROM reminders r 
LEFT JOIN flocks f ON r.flockId = f.id 
WHERE r.status = 'pending'
ORDER BY r.dueDate
LIMIT 30
`);

console.log('Pending reminders:');
reminders.forEach(r => {
  console.log(`  ID: ${r.id}, Title: ${r.title}, FlockId: ${r.flockId}, FlockNumber: ${r.flockNumber || 'NULL (orphaned)'}, Due: ${r.dueDate}`);
});

// Check for orphaned reminders (flockId set but flock doesn't exist)
const [orphaned] = await connection.query(`
SELECT COUNT(*) as cnt FROM reminders r 
LEFT JOIN flocks f ON r.flockId = f.id 
WHERE r.flockId IS NOT NULL AND f.id IS NULL
`);
console.log('\nOrphaned reminders (flockId set but flock deleted):', orphaned[0].cnt);

await connection.end();
