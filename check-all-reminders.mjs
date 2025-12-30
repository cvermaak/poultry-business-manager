import mysql from 'mysql2/promise';

const connection = await mysql.createConnection(process.env.DATABASE_URL);

const [reminders] = await connection.query(`
SELECT id, title, flockId, status, dueDate FROM reminders ORDER BY id DESC LIMIT 30
`);

console.log('All reminders in database:');
if (reminders.length === 0) {
  console.log('  No reminders found');
} else {
  reminders.forEach(r => {
    console.log(`  ID: ${r.id}, Title: ${r.title}, FlockId: ${r.flockId}, Status: ${r.status}`);
  });
}

await connection.end();
