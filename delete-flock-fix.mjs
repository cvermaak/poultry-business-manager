import mysql from 'mysql2/promise';

const connection = await mysql.createConnection(process.env.DATABASE_URL);
const flockId = 810001;

console.log('Attempting to delete flock', flockId);

try {
  // Delete from all related tables first - using correct column names
  console.log('Deleting from flock_daily_records...');
  await connection.query('DELETE FROM flock_daily_records WHERE flockId = ?', [flockId]);
  
  console.log('Deleting from reminders...');
  await connection.query('DELETE FROM reminders WHERE flockId = ?', [flockId]);
  
  console.log('Deleting from flock_vaccination_schedules (flock_id)...');
  await connection.query('DELETE FROM flock_vaccination_schedules WHERE flock_id = ?', [flockId]);
  
  console.log('Deleting from flock_stress_pack_schedules (flock_id)...');
  await connection.query('DELETE FROM flock_stress_pack_schedules WHERE flock_id = ?', [flockId]);
  
  console.log('Deleting from vaccination_schedules...');
  await connection.query('DELETE FROM vaccination_schedules WHERE flockId = ?', [flockId]);
  
  console.log('Deleting from health_records...');
  await connection.query('DELETE FROM health_records WHERE flockId = ?', [flockId]);
  
  console.log('Deleting from mortality_records...');
  await connection.query('DELETE FROM mortality_records WHERE flockId = ?', [flockId]);
  
  console.log('Deleting from procurement_schedules...');
  await connection.query('DELETE FROM procurement_schedules WHERE flockId = ?', [flockId]);
  
  console.log('Updating sales_order_items to set flockId to null...');
  await connection.query('UPDATE sales_order_items SET flockId = NULL WHERE flockId = ?', [flockId]);
  
  console.log('Now deleting the flock...');
  await connection.query('DELETE FROM flocks WHERE id = ?', [flockId]);
  
  console.log('SUCCESS! Flock deleted.');
} catch (error) {
  console.error('ERROR:', error.message);
  console.error('SQL State:', error.sqlState);
  console.error('SQL:', error.sql);
}

await connection.end();
