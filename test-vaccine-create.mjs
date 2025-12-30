import mysql from 'mysql2/promise';

const connection = await mysql.createConnection(process.env.DATABASE_URL);

// Check the vaccines table structure
const [columns] = await connection.query('DESCRIBE vaccines');
console.log('Vaccines table columns:');
columns.forEach(c => console.log(`  ${c.Field} (${c.Type}) ${c.Null === 'NO' ? 'NOT NULL' : 'NULL'} ${c.Default ? `DEFAULT ${c.Default}` : ''}`));

await connection.end();
