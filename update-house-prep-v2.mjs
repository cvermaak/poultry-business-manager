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
  
  // Find House Preparation category
  const housePreparationIndex = config.findIndex(c => c.category === 'house_preparation' || c.name === 'House Preparation');
  
  // Enhanced House Preparation based on user's protocol + industry best practices
  const updatedHousePreparation = {
    category: 'house_preparation',
    name: 'House Preparation',
    enabled: true,
    reminders: [
      {
        dayOffset: -7,
        name: 'Day -7: Sanitize House',
        description: 'Complete house sanitation: Remove all old litter and organic matter. Wash walls, floors, and all equipment with detergent. Apply approved disinfectant (e.g., quaternary ammonium or glutaraldehyde-based) ensuring proper contact time per manufacturer instructions. Allow house to dry completely. This 7-day downtime between flocks is critical for breaking disease cycles.',
        priority: 'urgent'
      },
      {
        dayOffset: -5,
        name: 'Day -5: Flush Water System',
        description: 'Flush header tank and all water lines including nipple drinker lines with high-level chlorine solution (140 ppm). Allow 24-hour contact time, then flush thoroughly with clean fresh water. Replace mini floater reservoir and any worn nipples or seals. Test water flow at multiple points to ensure adequate pressure and no blockages.',
        priority: 'high'
      },
      {
        dayOffset: -3,
        name: 'Day -3: Prepare Brooder Area',
        description: 'Set up brooder area: Spread fresh, dry bedding material (wood shavings or rice hulls) to 5-10cm depth. Lay chick paper covering at least 50% of the brooding area for easy feed access during first week. Position empty fountains (14-16 per 1,000 chicks) in brooding area. Ensure nipple drinkers are set at chick eye level. Check litter moisture (target 20-25%).',
        priority: 'high'
      },
      {
        dayOffset: -1,
        name: 'Day -1: Pre-heat House',
        description: 'Pre-heat chicken house to 32-35°C (90-95°F) at chick level. With forced air heating, verify floor temperature reaches at least 32°C. Target relative humidity of 30-50%. Monitor temperature uniformity across the entire brooding area using multiple thermometers. Check all heating equipment is functioning properly. Verify ventilation minimum settings.',
        priority: 'urgent'
      },
      {
        dayOffset: 0,
        name: 'Day 0: Fill Feed Lines',
        description: 'Ensure all feed lines are completely full and feed is visible at all feeding points. For first 7-10 days, provide supplemental feeders (paper, trays, or lids) at a rate of one tray per 50 chicks. Place automatic feeders on floor level for easy chick access. Verify feed quality - no mold, contamination, or off-odors.',
        priority: 'urgent'
      },
      {
        dayOffset: 0,
        name: 'Day 0: Prepare Stress-Pack Water',
        description: 'Mix stress-pack (electrolytes/vitamins) in header tank according to manufacturer dosage. Fill all fountains with stress-pack water before chick arrival. Ensure water temperature is lukewarm (20-25°C) - not cold. Chicks must have immediate access to medicated water upon placement to combat transport stress and encourage early hydration.',
        priority: 'urgent'
      },
      {
        dayOffset: 0,
        name: 'Day 0: Final Inspection Before Placement',
        description: 'Complete final walkthrough checklist: Temperature 32-35°C at chick level, humidity 30-50%, all drinkers functioning with water at eye level, feed accessible on paper/trays, lighting at 30-40 lux, ventilation providing fresh air without drafts, biosecurity measures in place (footbaths active, visitor log ready). Record all readings. Prepare chick receiving area.',
        priority: 'urgent'
      }
    ]
  };
  
  if (housePreparationIndex >= 0) {
    config[housePreparationIndex] = updatedHousePreparation;
    console.log('Updated existing House Preparation category');
  } else {
    config.unshift(updatedHousePreparation);
    console.log('Added House Preparation category at the beginning');
  }
  
  // Update the database
  await conn.execute(
    'UPDATE reminder_templates SET bundle_config = ? WHERE id = 240001',
    [JSON.stringify(config)]
  );
  
  console.log('House Preparation updated with enhanced descriptions!');
  console.log('Total reminders:', updatedHousePreparation.reminders.length);
  console.log('\nReminders:');
  updatedHousePreparation.reminders.forEach(r => {
    console.log(`  Day ${r.dayOffset}: ${r.name} (${r.priority})`);
  });
  
  await conn.end();
}

main().catch(console.error);
