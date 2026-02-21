/**
 * SKU Generation Constants
 * Structured SKU format: {PRIMARY_CLASS}-{SUB_TYPE}-{FORM}-{SEQ}
 * Example: FD-ST-P-001 = Feed, Starter, Pellet, #1
 */

// Primary Class (What operational cost bucket it belongs to)
export const PRIMARY_CLASSES = {
  FD: { code: 'FD', label: 'Feed', description: 'FCR + production cost' },
  RM: { code: 'RM', label: 'Raw Materials', description: 'Feed mill costing' },
  MD: { code: 'MD', label: 'Medication', description: 'Health cost/bird' },
  VX: { code: 'VX', label: 'Vaccine', description: 'Biosecurity cost' },
  DS: { code: 'DS', label: 'Disinfectant', description: 'Biosecurity' },
  BD: { code: 'BD', label: 'Birds (chicks/pullets)', description: 'Placement cost' },
  LT: { code: 'LT', label: 'Litter/Bedding', description: 'House prep cost' },
  PK: { code: 'PK', label: 'Packaging', description: 'Egg or processed output' },
  EQ: { code: 'EQ', label: 'Equipment', description: 'Capex/asset' },
  SP: { code: 'SP', label: 'Spare Parts', description: 'Maintenance cost' },
  CL: { code: 'CL', label: 'Cleaning Supplies', description: 'Hygiene' },
  AD: { code: 'AD', label: 'Additives', description: 'Nutrition efficiency (enzymes, toxin binders)' },
  VT: { code: 'VT', label: 'Veterinary Consumables', description: 'Syringes, needles' },
  UT: { code: 'UT', label: 'Utilities Consumables', description: 'Coal, gas, diesel' },
} as const;

// Sub-Type mappings by Primary Class
export const SUB_TYPES = {
  FD: { // Feed
    ST: 'Starter',
    GR: 'Grower',
    FN: 'Finisher',
    PR: 'Pre-starter',
    LY: 'Layer Mash',
    BR: 'Breeder',
    CR: 'Crumble',
    WS: 'Wheat/Straight',
  },
  MD: { // Medication
    AB: 'Antibiotic',
    CC: 'Coccidiostat',
    VT: 'Vitamin',
    EL: 'Electrolyte',
    DP: 'Dewormer',
  },
  VX: { // Vaccine
    ND: 'Newcastle',
    IB: 'Infectious Bronchitis',
    IBD: 'Gumboro',
    MG: 'Mycoplasma',
    AI: 'Avian Influenza',
  },
  BD: { // Birds
    BR: 'Broiler Chicks',
    PL: 'Pullets',
    LY: 'Layers',
  },
  // Other primary classes use generic sub-types or none
  RM: { GN: 'General' },
  DS: { GN: 'General' },
  LT: { GN: 'General' },
  PK: { GN: 'General' },
  EQ: { GN: 'General' },
  SP: { GN: 'General' },
  CL: { GN: 'General' },
  AD: { GN: 'General' },
  VT: { GN: 'General' },
  UT: { GN: 'General' },
} as const;

// Physical Form
export const FORMS = {
  P: 'Pellet',
  C: 'Crumble',
  M: 'Mash',
  L: 'Liquid',
  S: 'Soluble Powder',
  G: 'Granule',
  D: 'Dust/Powder',
  INJ: 'Injectable',
} as const;

// Type exports
export type PrimaryClassCode = keyof typeof PRIMARY_CLASSES;
export type SubTypeCode = string; // Dynamic based on primary class
export type FormCode = keyof typeof FORMS;

// Helper to get sub-types for a primary class
export function getSubTypesForClass(primaryClass: PrimaryClassCode): Record<string, string> {
  return SUB_TYPES[primaryClass] || {};
}

// Helper to validate SKU components
export function isValidSKUComponents(
  primaryClass: string,
  subType: string,
  form: string
): boolean {
  if (!(primaryClass in PRIMARY_CLASSES)) return false;
  if (!(form in FORMS)) return false;
  
  const validSubTypes = getSubTypesForClass(primaryClass as PrimaryClassCode);
  if (Object.keys(validSubTypes).length > 0 && !(subType in validSubTypes)) {
    return false;
  }
  
  return true;
}

// Helper to format SKU
export function formatSKU(
  primaryClass: string,
  subType: string,
  form: string,
  sequentialNumber: number
): string {
  const seq = sequentialNumber.toString().padStart(3, '0');
  return `${primaryClass}-${subType}-${form}-${seq}`;
}
