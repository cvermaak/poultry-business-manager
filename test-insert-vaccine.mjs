import mysql from 'mysql2/promise';

const connection = await mysql.createConnection(process.env.DATABASE_URL);

try {
  const [result] = await connection.query(`
    INSERT INTO vaccines (name, brand, disease_type, vaccine_type, application_method) 
    VALUES ('Test Vaccine', 'Test Brand', 'other', 'live', 'drinking_water')
  `);
  console.log('Insert successful:', result);
  
  // Clean up
  await connection.query('DELETE FROM vaccines WHERE name = ?', ['Test Vaccine']);
  console.log('Cleanup successful');
} catch (error) {
  console.error('ERROR:', error.message);
  console.error('SQL State:', error.sqlState);
}

await connection.end();
