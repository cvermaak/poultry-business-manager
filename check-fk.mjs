import mysql from 'mysql2/promise';

const connection = await mysql.createConnection(process.env.DATABASE_URL);

const [results] = await connection.query(`
SELECT 
    TABLE_NAME,
    COLUMN_NAME
FROM
    INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE
    REFERENCED_TABLE_NAME = 'flocks'
`);

console.log('Tables referencing flocks:');
results.forEach(r => console.log(`  ${r.TABLE_NAME}.${r.COLUMN_NAME}`));

// Check each table for records with flockId = 810001
const flockId = 810001;
for (const row of results) {
  const [count] = await connection.query(
    `SELECT COUNT(*) as cnt FROM \`${row.TABLE_NAME}\` WHERE \`${row.COLUMN_NAME}\` = ?`,
    [flockId]
  );
  if (count[0].cnt > 0) {
    console.log(`\n${row.TABLE_NAME}: ${count[0].cnt} records for flock ${flockId}`);
  }
}

await connection.end();
