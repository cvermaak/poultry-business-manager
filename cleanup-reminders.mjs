import mysql from 'mysql2/promise';

const connection = await mysql.createConnection(process.env.DATABASE_URL);

// Delete test reminders with null flockId
const [result] = await connection.query(`
DELETE FROM reminders WHERE flockId IS NULL AND title LIKE 'Test%'
`);
console.log('Deleted test reminders:', result.affectedRows);

// Also delete the Critical FCR Alert test reminder
const [result2] = await connection.query(`
DELETE FROM reminders WHERE flockId IS NULL AND title = 'Critical FCR Alert'
`);
console.log('Deleted Critical FCR Alert reminders:', result2.affectedRows);

// Check remaining pending reminders
const [remaining] = await connection.query(`
SELECT COUNT(*) as cnt FROM reminders WHERE status = 'pending'
`);
console.log('Remaining pending reminders:', remaining[0].cnt);

await connection.end();
