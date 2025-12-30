import mysql from 'mysql2/promise';

/**
 * Seed Default Broiler Protocol Template
 * 
 * This script creates a comprehensive "Default Broiler Protocol" template bundle
 * that includes all standard reminders for broiler chicken production.
 */

const bundleConfig = [
  // House Preparation (3 reminders)
  {
    category: "house_preparation",
    enabled: true,
    reminders: [
      {
        title: "House Cleaning",
        description: "Clean and wash house thoroughly after previous flock removal",
        reminderType: "house_preparation",
        dayOffset: -7,
        priority: "high"
      },
      {
        title: "House Disinfection",
        description: "Disinfect house with approved disinfectant solution",
        reminderType: "house_preparation",
        dayOffset: -3,
        priority: "high"
      },
      {
        title: "Bedding Material Delivery",
        description: "Ensure pine shavings or bedding material is delivered and spread",
        reminderType: "house_preparation",
        dayOffset: -1,
        priority: "high"
      }
    ]
  },
  
  // Feed Transitions (2 reminders)
  {
    category: "feed_transition",
    enabled: true,
    reminders: [
      {
        title: "Feed Transition: Starter → Grower",
        description: "Change from starter to grower feed",
        reminderType: "feed_transition",
        dayOffset: 10,
        priority: "high"
      },
      {
        title: "Feed Transition: Grower → Finisher",
        description: "Change from grower to finisher feed",
        reminderType: "feed_transition",
        dayOffset: 24,
        priority: "high"
      }
    ]
  },
  
  // Weight Sampling (6 reminders)
  {
    category: "weight_sampling",
    enabled: true,
    reminders: [
      { title: "Weight Sampling - Day 7", description: "Conduct weight sampling for performance monitoring", reminderType: "routine_task", dayOffset: 7, priority: "medium" },
      { title: "Weight Sampling - Day 14", description: "Conduct weight sampling for performance monitoring", reminderType: "routine_task", dayOffset: 14, priority: "medium" },
      { title: "Weight Sampling - Day 21", description: "Conduct weight sampling for performance monitoring", reminderType: "routine_task", dayOffset: 21, priority: "medium" },
      { title: "Weight Sampling - Day 28", description: "Conduct weight sampling for performance monitoring", reminderType: "routine_task", dayOffset: 28, priority: "medium" },
      { title: "Weight Sampling - Day 35", description: "Conduct weight sampling for performance monitoring", reminderType: "routine_task", dayOffset: 35, priority: "medium" },
      { title: "Weight Sampling - Day 42", description: "Conduct weight sampling for performance monitoring", reminderType: "routine_task", dayOffset: 42, priority: "medium" }
    ]
  },
  
  // Biosecurity (weekly footbath changes)
  {
    category: "biosecurity",
    enabled: true,
    reminders: [
      { title: "Footbath Solution Change - Week 1", description: "Change footbath disinfectant solution", reminderType: "biosecurity", dayOffset: 7, priority: "medium" },
      { title: "Footbath Solution Change - Week 2", description: "Change footbath disinfectant solution", reminderType: "biosecurity", dayOffset: 14, priority: "medium" },
      { title: "Footbath Solution Change - Week 3", description: "Change footbath disinfectant solution", reminderType: "biosecurity", dayOffset: 21, priority: "medium" },
      { title: "Footbath Solution Change - Week 4", description: "Change footbath disinfectant solution", reminderType: "biosecurity", dayOffset: 28, priority: "medium" },
      { title: "Footbath Solution Change - Week 5", description: "Change footbath disinfectant solution", reminderType: "biosecurity", dayOffset: 35, priority: "medium" },
      { title: "Footbath Solution Change - Week 6", description: "Change footbath disinfectant solution", reminderType: "biosecurity", dayOffset: 42, priority: "medium" }
    ]
  },
  
  // Environmental Checks (weekly)
  {
    category: "environmental_check",
    enabled: true,
    reminders: [
      { title: "Environmental Check - Week 1", description: "Check temperature, humidity, and ventilation systems", reminderType: "environmental_check", dayOffset: 7, priority: "medium" },
      { title: "Environmental Check - Week 2", description: "Check temperature, humidity, and ventilation systems", reminderType: "environmental_check", dayOffset: 14, priority: "medium" },
      { title: "Environmental Check - Week 3", description: "Check temperature, humidity, and ventilation systems", reminderType: "environmental_check", dayOffset: 21, priority: "medium" },
      { title: "Environmental Check - Week 4", description: "Check temperature, humidity, and ventilation systems", reminderType: "environmental_check", dayOffset: 28, priority: "medium" },
      { title: "Environmental Check - Week 5", description: "Check temperature, humidity, and ventilation systems", reminderType: "environmental_check", dayOffset: 35, priority: "medium" },
      { title: "Environmental Check - Week 6", description: "Check temperature, humidity, and ventilation systems", reminderType: "environmental_check", dayOffset: 42, priority: "medium" }
    ]
  },
  
  // Milestones
  {
    category: "milestone",
    enabled: true,
    reminders: [
      {
        title: "Expected Slaughter Date",
        description: "Target slaughter date - coordinate with processing facility",
        reminderType: "milestone",
        dayOffset: 42,
        priority: "high"
      }
    ]
  }
];

async function seedDefaultProtocol() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  try {
    // Check if template already exists
    const [existing] = await conn.query(
      'SELECT id FROM reminder_templates WHERE name = "Default Broiler Protocol"'
    );
    
    if (existing.length > 0) {
      console.log('Default Broiler Protocol template already exists. Updating...');
      await conn.query(
        'UPDATE reminder_templates SET bundle_config = ?, is_bundle = true, updated_at = NOW() WHERE name = "Default Broiler Protocol"',
        [JSON.stringify(bundleConfig)]
      );
      console.log('✓ Updated Default Broiler Protocol template');
    } else {
      console.log('Creating Default Broiler Protocol template...');
      await conn.query(
        `INSERT INTO reminder_templates 
        (name, description, reminderType, priority, day_offset, is_bundle, bundle_config, is_active) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'Default Broiler Protocol',
          'Comprehensive reminder bundle including house preparation, feed transitions, weight sampling, biosecurity, environmental checks, and milestones',
          'routine_task',
          'medium',
          0,
          true,
          JSON.stringify(bundleConfig),
          true
        ]
      );
      console.log('✓ Created Default Broiler Protocol template');
    }
    
    console.log('\nBundle includes:');
    console.log('- House Preparation: 3 reminders');
    console.log('- Feed Transitions: 2 reminders');
    console.log('- Weight Sampling: 6 reminders');
    console.log('- Biosecurity: 6 reminders');
    console.log('- Environmental Checks: 6 reminders');
    console.log('- Milestones: 1 reminder');
    console.log('Total: 24 reminders');
    
  } catch (error) {
    console.error('Error seeding default protocol:', error);
    throw error;
  } finally {
    await conn.end();
  }
}

seedDefaultProtocol()
  .then(() => {
    console.log('\n✓ Seed completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Seed failed:', error);
    process.exit(1);
  });
