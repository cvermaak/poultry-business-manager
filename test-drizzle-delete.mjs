import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { flockVaccinationSchedules, flockStressPackSchedules } from './drizzle/schema.ts';
import { eq } from 'drizzle-orm';

const connection = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(connection);

// Check what the actual column name is in Drizzle
console.log('flockVaccinationSchedules.flockId column:', flockVaccinationSchedules.flockId.name);
console.log('flockStressPackSchedules.flockId column:', flockStressPackSchedules.flockId.name);

await connection.end();
