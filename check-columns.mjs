import mysql from 'mysql2/promise';

const connection = await mysql.createConnection(process.env.DATABASE_URL);

const [columns] = await connection.query('DESCRIBE flock_vaccination_schedules');
console.log('flock_vaccination_schedules columns:');
columns.forEach(c => console.log(`  ${c.Field} (${c.Type})`));

const [columns2] = await connection.query('DESCRIBE flock_stress_pack_schedules');
console.log('\nflock_stress_pack_schedules columns:');
columns2.forEach(c => console.log(`  ${c.Field} (${c.Type})`));

await connection.end();
