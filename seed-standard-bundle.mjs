import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;

async function main() {
  const connection = await mysql.createConnection(DATABASE_URL);
  const db = drizzle(connection);
  
  // First, clean up test templates
  console.log("Cleaning up test templates...");
  await connection.execute(`
    DELETE FROM reminder_templates 
    WHERE name LIKE 'Test%' OR name LIKE 'Bundle Test%'
  `);
  
  // Define the comprehensive Standard Broiler Cycle bundle configuration
  const bundleConfig = [
    {
      category: "vaccination",
      enabled: true,
      reminders: [
        { name: "Day 1 - Marek's Disease Vaccination", dayOffset: 0, priority: "urgent", description: "Administer Marek's disease vaccine to day-old chicks" },
        { name: "Day 7 - Newcastle Disease (First Dose)", dayOffset: 7, priority: "high", description: "First dose of Newcastle disease vaccine via drinking water" },
        { name: "Day 14 - Gumboro Disease Vaccination", dayOffset: 14, priority: "high", description: "Administer Infectious Bursal Disease (Gumboro) vaccine" },
        { name: "Day 21 - Newcastle Disease (Booster)", dayOffset: 21, priority: "high", description: "Booster dose of Newcastle disease vaccine" }
      ]
    },
    {
      category: "feed_transition",
      enabled: true,
      reminders: [
        { name: "Day 0 - Start Starter Feed", dayOffset: 0, priority: "high", description: "Begin with starter feed (high protein 22-24%)" },
        { name: "Day 10 - Prepare Grower Feed Transition", dayOffset: 10, priority: "medium", description: "Prepare for transition to grower feed, start mixing" },
        { name: "Day 14 - Complete Grower Feed Transition", dayOffset: 14, priority: "high", description: "Complete transition to grower feed (20% protein)" },
        { name: "Day 28 - Transition to Finisher Feed", dayOffset: 28, priority: "high", description: "Begin finisher feed (18% protein) for market preparation" }
      ]
    },
    {
      category: "environmental_check",
      enabled: true,
      reminders: [
        { name: "Day 1 - Initial Brooding Temperature Check", dayOffset: 0, priority: "urgent", description: "Verify brooding temperature at 32-35°C, check heat source" },
        { name: "Day 7 - Reduce Temperature to 29-32°C", dayOffset: 7, priority: "high", description: "Gradually reduce temperature, check ventilation" },
        { name: "Day 14 - Temperature Adjustment to 26-29°C", dayOffset: 14, priority: "medium", description: "Continue temperature reduction, monitor bird behavior" },
        { name: "Day 21 - Final Temperature Setting 21-24°C", dayOffset: 21, priority: "medium", description: "Set final growing temperature, optimize ventilation" }
      ]
    },
    {
      category: "biosecurity",
      enabled: true,
      reminders: [
        { name: "Day 0 - Pre-Placement Biosecurity Check", dayOffset: 0, priority: "urgent", description: "Verify house disinfection, footbaths ready, visitor log in place" },
        { name: "Day 7 - Weekly Biosecurity Audit", dayOffset: 7, priority: "medium", description: "Check footbath effectiveness, equipment sanitization, pest control" },
        { name: "Day 14 - Mid-Cycle Biosecurity Review", dayOffset: 14, priority: "medium", description: "Review visitor logs, check perimeter security, rodent control" },
        { name: "Day 28 - Pre-Harvest Biosecurity Protocol", dayOffset: 28, priority: "high", description: "Prepare for catching crew, verify transport biosecurity" }
      ]
    },
    {
      category: "milestone",
      enabled: true,
      reminders: [
        { name: "Day 7 - First Week Weight Check", dayOffset: 7, priority: "high", description: "Sample weight check - target 170-180g, assess uniformity" },
        { name: "Day 14 - Two Week Performance Review", dayOffset: 14, priority: "high", description: "Weight check target 450-500g, calculate FCR, mortality review" },
        { name: "Day 21 - Three Week Assessment", dayOffset: 21, priority: "high", description: "Weight target 900-1000g, FCR should be ~1.4, assess flock health" },
        { name: "Day 35 - Pre-Market Evaluation", dayOffset: 35, priority: "urgent", description: "Final weight assessment, FCR calculation, market readiness check" }
      ]
    },
    {
      category: "performance_alert",
      enabled: true,
      reminders: [
        { name: "Day 3 - Early Mortality Check", dayOffset: 3, priority: "urgent", description: "Review first 72-hour mortality - should be <1%, investigate if higher" },
        { name: "Day 10 - Growth Rate Assessment", dayOffset: 10, priority: "high", description: "Compare growth to standards, adjust feed if underperforming" },
        { name: "Day 21 - Mid-Cycle Performance Review", dayOffset: 21, priority: "high", description: "Cumulative mortality should be <3%, FCR on target, uniformity >85%" },
        { name: "Day 30 - Final Performance Projection", dayOffset: 30, priority: "high", description: "Project final weights, calculate expected yield, plan harvest date" }
      ]
    }
  ];
  
  // Insert the Standard Broiler Cycle bundle template
  console.log("Creating Standard Broiler Cycle bundle template...");
  await connection.execute(`
    INSERT INTO reminder_templates 
    (name, description, reminderType, priority, day_offset, is_bundle, bundle_config, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    "Standard Broiler Cycle (42 Days)",
    "Comprehensive reminder bundle for a standard 42-day broiler production cycle. Includes vaccinations, feed transitions, environmental checks, biosecurity protocols, milestones, and performance alerts. Copy and customize for your specific needs.",
    "routine_task",
    "medium",
    0,
    true,
    JSON.stringify(bundleConfig),
    true
  ]);
  
  console.log("\n✅ Standard Broiler Cycle bundle created successfully!");
  console.log("   - 6 categories");
  console.log("   - 24 reminders total (4 per category)");
  console.log("\nCategories:");
  for (const cat of bundleConfig) {
    console.log(`   - ${cat.category}: ${cat.reminders.length} reminders`);
  }
  
  await connection.end();
}

main().catch(console.error);
