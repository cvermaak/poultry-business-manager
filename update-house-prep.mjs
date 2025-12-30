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
  
  // Find and update House Preparation category
  const housePreparationIndex = config.findIndex(c => c.category === 'house_preparation' || c.name === 'House Preparation');
  
  // New House Preparation based on user's actual protocol
  const updatedHousePreparation = {
    category: 'house_preparation',
    name: 'House Preparation',
    enabled: true,
    reminders: [
      {
        dayOffset: -7,
        name: 'Day -7: Sanitize House',
        description: 'Thoroughly clean and sanitize the entire chicken house. Remove all old litter, wash walls, floors, and equipment. Apply disinfectant and allow proper drying time.',
        priority: 'urgent'
      },
      {
        dayOffset: -5,
        name: 'Day -5: Flush Water System',
        description: 'Flush header tank and all water lines including nipple drinker lines. Replace mini floater reservoir. Ensure clean water supply is ready.',
        priority: 'high'
      },
      {
        dayOffset: -3,
        name: 'Day -3: Prepare Brooder Area',
        description: 'Start preparing the brooder area. Place fresh bedding material. Lay down chick paper for first week feeding. Position empty fountains in brooder area.',
        priority: 'high'
      },
      {
        dayOffset: -1,
        name: 'Day -1: Pre-heat House',
        description: 'Pre-heat chicken house to 32-35°C at chick level. Monitor temperature uniformity across the brooder area. Ensure heating equipment is working properly.',
        priority: 'urgent'
      },
      {
        dayOffset: 0,
        name: 'Day 0: Fill Feed Lines',
        description: 'Ensure all feed lines are full and feed is available at all feeding points. Check feed quality and ensure no contamination.',
        priority: 'urgent'
      },
      {
        dayOffset: 0,
        name: 'Day 0: Prepare Stress-Pack Water',
        description: 'Place stress-pack mixture in header tank. Fill fountains with stress-pack water. Ensure chicks have immediate access to medicated water upon arrival.',
        priority: 'urgent'
      },
      {
        dayOffset: 0,
        name: 'Day 0: Final Inspection Before Placement',
        description: 'Final walkthrough before chick arrival. Verify temperature (32-35°C), water availability, feed access, lighting, ventilation, and biosecurity measures. Confirm all equipment is operational.',
        priority: 'urgent'
      }
    ]
  };
  
  if (housePreparationIndex >= 0) {
    // Update existing category
    config[housePreparationIndex] = updatedHousePreparation;
    console.log('Updated existing House Preparation category');
  } else {
    // Add at the beginning if not found
    config.unshift(updatedHousePreparation);
    console.log('Added House Preparation category at the beginning');
  }
  
  // Update the database
  await conn.execute(
    'UPDATE reminder_templates SET bundle_config = ? WHERE id = 240001',
    [JSON.stringify(config)]
  );
  
  console.log('House Preparation updated successfully!');
  console.log('Total reminders in House Preparation:', updatedHousePreparation.reminders.length);
  console.log('Reminders:');
  updatedHousePreparation.reminders.forEach(r => {
    console.log(`  Day ${r.dayOffset}: ${r.name} (${r.priority})`);
  });
  
  await conn.end();
}

main().catch(console.error);
