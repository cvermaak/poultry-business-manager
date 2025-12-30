import mysql from 'mysql2/promise';

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // Get the current bundle config
  const [rows] = await conn.execute('SELECT id, bundle_config FROM reminder_templates WHERE id = 240001');
  if (!rows[0]) {
    console.log('Bundle not found');
    await conn.end();
    return;
  }
  
  const config = typeof rows[0].bundle_config === 'string' ? JSON.parse(rows[0].bundle_config) : rows[0].bundle_config;
  
  // Check if House Preparation already exists
  const existingIndex = config.findIndex(c => c.category === 'house_preparation' || c.name === 'House Preparation');
  if (existingIndex >= 0) {
    console.log('House Preparation category already exists, skipping...');
    await conn.end();
    return;
  }
  
  // Add House Preparation category at the beginning
  const housePreparation = {
    category: 'house_preparation',
    name: 'House Preparation',
    enabled: true,
    reminders: [
      {
        dayOffset: -7,
        name: 'Day -7: Clean and Disinfect House',
        description: 'Thoroughly clean and disinfect the entire house. Remove all old litter, wash walls and floors, apply disinfectant. Allow proper drying time.',
        priority: 'urgent'
      },
      {
        dayOffset: -5,
        name: 'Day -5: Check Heating and Ventilation Systems',
        description: 'Test all heaters, fans, and ventilation equipment. Repair or replace any faulty components. Verify thermostats and controllers are working.',
        priority: 'high'
      },
      {
        dayOffset: -3,
        name: 'Day -3: Spread Bedding/Litter',
        description: 'Spread fresh, dry bedding material (wood shavings, rice hulls, or straw) to a depth of 5-10cm. Ensure even distribution throughout the house.',
        priority: 'high'
      },
      {
        dayOffset: -2,
        name: 'Day -2: Pre-heat House to Brooding Temperature',
        description: 'Start heating the house to achieve 32-35°C at chick level. Monitor temperature uniformity across the house. Check humidity levels.',
        priority: 'urgent'
      },
      {
        dayOffset: -1,
        name: 'Day -1: Final Inspection and Equipment Check',
        description: 'Final walkthrough: verify feeders, drinkers, lighting, temperature, and biosecurity measures. Prepare chick arrival area. Stock supplies.',
        priority: 'urgent'
      }
    ]
  };
  
  // Insert at the beginning of the array
  config.unshift(housePreparation);
  
  // Update the database
  await conn.execute(
    'UPDATE reminder_templates SET bundle_config = ? WHERE id = 240001',
    [JSON.stringify(config)]
  );
  
  console.log('House Preparation category added successfully!');
  console.log('Total categories now:', config.length);
  console.log('Categories:', config.map(c => c.category || c.name).join(', '));
  
  await conn.end();
}

main().catch(console.error);
