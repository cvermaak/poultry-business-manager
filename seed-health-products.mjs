import { drizzle } from "drizzle-orm/mysql2";
import { vaccines, stressPacks } from "./drizzle/schema.ts";
import "dotenv/config";

const db = drizzle(process.env.DATABASE_URL);

const commonVaccines = [
  // Newcastle Disease (ND) Vaccines
  {
    name: "Hitchner B1",
    brand: "Hitchner B1",
    manufacturer: "Various",
    vaccineType: "newcastle_disease",
    applicationMethod: "drinking_water",
    dosagePerBird: "1 dose",
    instructions: "Administer in cool, chlorine-free water. Use within 2 hours of mixing. Ensure all birds drink. Typical schedule: Day 7-10 and Day 18-21.",
    withdrawalPeriod: 0,
    boosterIntervalDays: 14,
    storageTemperature: "2-8°C",
    shelfLifeDays: 730,
  },
  {
    name: "LaSota",
    brand: "LaSota",
    manufacturer: "Various",
    vaccineType: "newcastle_disease",
    applicationMethod: "drinking_water",
    dosagePerBird: "1 dose",
    instructions: "Administer in drinking water or by spray. More virulent than B1, use for booster doses. Typical schedule: Day 14-21 as booster.",
    withdrawalPeriod: 0,
    boosterIntervalDays: null,
    storageTemperature: "2-8°C",
    shelfLifeDays: 730,
  },
  {
    name: "Clone 30",
    brand: "Clone 30",
    manufacturer: "Various",
    vaccineType: "newcastle_disease",
    applicationMethod: "drinking_water",
    dosagePerBird: "1 dose",
    instructions: "Intermediate strain between B1 and LaSota. Good for primary vaccination. Use chlorine-free water.",
    withdrawalPeriod: 0,
    boosterIntervalDays: 14,
    storageTemperature: "2-8°C",
    shelfLifeDays: 730,
  },

  // Infectious Bronchitis (IB) Vaccines
  {
    name: "H120",
    brand: "H120",
    manufacturer: "MSD Animal Health / Zoetis",
    vaccineType: "infectious_bronchitis",
    applicationMethod: "drinking_water",
    dosagePerBird: "1 dose",
    instructions: "Mild strain suitable for day-old chicks. Often combined with ND vaccine. Use chlorine-free water. Typical schedule: Day 1 or Day 7-10.",
    withdrawalPeriod: 0,
    boosterIntervalDays: 14,
    storageTemperature: "2-8°C",
    shelfLifeDays: 730,
  },
  {
    name: "Ma5",
    brand: "Ma5",
    manufacturer: "Ceva",
    vaccineType: "infectious_bronchitis",
    applicationMethod: "spray",
    dosagePerBird: "1 dose",
    instructions: "Intermediate strain. Can be used from day 1. Provides broader protection. Apply via coarse spray.",
    withdrawalPeriod: 0,
    boosterIntervalDays: 21,
    storageTemperature: "2-8°C",
    shelfLifeDays: 730,
  },
  {
    name: "4/91",
    brand: "4/91",
    manufacturer: "Various",
    vaccineType: "infectious_bronchitis",
    applicationMethod: "drinking_water",
    dosagePerBird: "1 dose",
    instructions: "Variant strain for broader protection. Use as booster after H120 or Ma5. Typical schedule: Day 14-21.",
    withdrawalPeriod: 0,
    boosterIntervalDays: null,
    storageTemperature: "2-8°C",
    shelfLifeDays: 730,
  },

  // Gumboro (IBD) Vaccines
  {
    name: "Gumboro Intermediate",
    brand: "Bursine 2",
    manufacturer: "Zoetis / Ceva",
    vaccineType: "gumboro",
    applicationMethod: "drinking_water",
    dosagePerBird: "1 dose",
    instructions: "Intermediate strain for broilers. Administer Day 10-14. Use chlorine-free water. Critical for immune development.",
    withdrawalPeriod: 0,
    boosterIntervalDays: 7,
    storageTemperature: "2-8°C",
    shelfLifeDays: 730,
  },
  {
    name: "Gumboro Intermediate Plus",
    brand: "Bursine Plus",
    manufacturer: "Ceva",
    vaccineType: "gumboro",
    applicationMethod: "drinking_water",
    dosagePerBird: "1 dose",
    instructions: "Stronger intermediate strain. Use in areas with high Gumboro challenge. Day 14-18 recommended.",
    withdrawalPeriod: 0,
    boosterIntervalDays: null,
    storageTemperature: "2-8°C",
    shelfLifeDays: 730,
  },

  // Marek's Disease
  {
    name: "HVT",
    brand: "Rispens HVT",
    manufacturer: "Ceva / MSD",
    vaccineType: "mareks_disease",
    applicationMethod: "injection",
    dosagePerBird: "0.2ml",
    instructions: "Administer subcutaneously at hatchery (day-old). Critical for Marek's protection. Single dose provides lifetime immunity.",
    withdrawalPeriod: 0,
    boosterIntervalDays: null,
    storageTemperature: "-196°C (liquid nitrogen)",
    shelfLifeDays: 365,
  },

  // Fowl Pox
  {
    name: "Fowl Pox Vaccine",
    brand: "Poxine",
    manufacturer: "Bioproperties / Onderstepoort",
    vaccineType: "fowl_pox",
    applicationMethod: "wing_web",
    dosagePerBird: "1 prick",
    instructions: "Apply via wing-web stab method. Use double-needle applicator. Check for 'take' reaction after 7 days. Typical schedule: Day 7-14.",
    withdrawalPeriod: 0,
    boosterIntervalDays: null,
    storageTemperature: "2-8°C",
    shelfLifeDays: 730,
  },

  // Coccidiosis
  {
    name: "Coccivac",
    brand: "Coccivac-B52",
    manufacturer: "MSD Animal Health",
    vaccineType: "coccidiosis",
    applicationMethod: "spray",
    dosagePerBird: "1 dose",
    instructions: "Live oocyst vaccine. Spray at hatchery or in drinking water Day 1-5. Provides immunity through controlled exposure.",
    withdrawalPeriod: 0,
    boosterIntervalDays: null,
    storageTemperature: "2-8°C",
    shelfLifeDays: 180,
  },
];

const commonStressPacks = [
  {
    name: "Electrolyte Mix - Standard",
    brand: "Virbac Electrovet",
    manufacturer: "Virbac",
    activeIngredients: "Sodium chloride, Potassium chloride, Dextrose, Vitamin C",
    dosagePerLiter: "1g per liter",
    instructions: "Dissolve in clean drinking water. Use during heat stress, transport, vaccination, or any stressful period. Replace daily. Standard strength for routine stress management.",
    recommendedDuration: "3-5 days",
    withdrawalPeriod: 0,
  },
  {
    name: "Electrolyte Mix - Double Strength",
    brand: "Virbac Electrovet Forte",
    manufacturer: "Virbac",
    activeIngredients: "Sodium chloride, Potassium chloride, Dextrose, Vitamin C (concentrated)",
    dosagePerLiter: "2g per liter",
    instructions: "Double-strength formulation for severe stress situations. Use 3 days before long-distance transport. Helps maintain hydration and reduce weight loss. Replace daily.",
    recommendedDuration: "1-3 days",
    withdrawalPeriod: 0,
  },
  {
    name: "Vitamin & Mineral Supplement",
    brand: "Stress Pack Plus",
    manufacturer: "Afrivet",
    activeIngredients: "Vitamins A, D3, E, B-complex, Selenium, Zinc",
    dosagePerLiter: "1ml per liter",
    instructions: "Comprehensive vitamin supplement for immune support. Use during vaccination periods, disease outbreaks, or recovery. Administer for 5-7 days.",
    recommendedDuration: "5-7 days",
    withdrawalPeriod: 0,
  },
  {
    name: "Probiotic Supplement",
    brand: "Protexin",
    manufacturer: "Protexin",
    activeIngredients: "Lactobacillus acidophilus, Bifidobacterium, Enterococcus faecium",
    dosagePerLiter: "0.5g per liter",
    instructions: "Beneficial bacteria for gut health. Use after antibiotic treatment, during feed changes, or stress periods. Improves feed conversion and immunity.",
    recommendedDuration: "7-14 days",
    withdrawalPeriod: 0,
  },
  {
    name: "Glucose Energy Booster",
    brand: "Dextrose Powder",
    manufacturer: "Generic",
    activeIngredients: "Dextrose (Glucose)",
    dosagePerLiter: "50g per liter",
    instructions: "Quick energy source for weak or stressed birds. Use during placement (first 24-48 hours) or recovery from disease. Helps chicks start drinking.",
    recommendedDuration: "1-2 days",
    withdrawalPeriod: 0,
  },
  {
    name: "Amino Acid Complex",
    brand: "Aminovit",
    manufacturer: "Bayer / Elanco",
    activeIngredients: "Essential amino acids (Lysine, Methionine, Threonine), B-vitamins",
    dosagePerLiter: "1ml per liter",
    instructions: "Supports growth and recovery. Use during high-stress periods, post-vaccination, or when feed quality is compromised. Improves protein utilization.",
    recommendedDuration: "3-5 days",
    withdrawalPeriod: 0,
  },
];

async function seedHealthProducts() {
  console.log("🌱 Seeding vaccines...");
  
  try {
    for (const vaccine of commonVaccines) {
      await db.insert(vaccines).values(vaccine);
      console.log(`✓ Added vaccine: ${vaccine.name} (${vaccine.vaccineType})`);
    }
    
    console.log("\n🌱 Seeding stress packs...");
    
    for (const stressPack of commonStressPacks) {
      await db.insert(stressPacks).values(stressPack);
      console.log(`✓ Added stress pack: ${stressPack.name}`);
    }
    
    console.log("\n✅ Health products seeded successfully!");
    console.log(`   - ${commonVaccines.length} vaccines added`);
    console.log(`   - ${commonStressPacks.length} stress packs added`);
    
  } catch (error) {
    console.error("❌ Error seeding health products:", error);
    throw error;
  }
  
  process.exit(0);
}

seedHealthProducts();
