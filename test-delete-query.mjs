import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { flockVaccinationSchedules, flockStressPackSchedules } from './drizzle/schema.ts';
import { eq } from 'drizzle-orm';

const connection = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(connection, { logger: true });

const flockId = 999999; // Non-existent flock for testing

try {
  console.log('Testing delete from flockVaccinationSchedules...');
  await db.delete(flockVaccinationSchedules).where(eq(flockVaccinationSchedules.flockId, flockId));
  console.log('Success!');
} catch (error) {
  console.error('Error:', error.message);
}

await connection.end();
