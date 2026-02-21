// shared/sku-constants.ts

/**
 * SKU Format: {PRIMARY_CLASS}-{SUB_TYPE}-{FORM}-{SEQUENTIAL}
 * Example: FD-ST-P-001 = Feed, Starter, Pellet, #1
 */

export const PRIMARY_CLASSES = {
  FD: { code: 'FD', label: 'Feed', description: 'Feed products' },
  RM: { code: 'RM', label: 'Raw Materials', description: 'Raw materials for feed production' },
  MD: { code: 'MD', label: 'Medication', description: 'Medications and treatments' },
  VX: { code: 'VX', label: 'Vaccine', description: 'Vaccines' },
  DS: { code: 'DS', label: 'Disinfectant', description: 'Disinfectants and sanitizers' },
  BD: { code: 'BD', label: 'Birds', description: 'Live birds' },
  LT: { code: 'LT', label: 'Litter/Bedding', description: 'Litter and bedding materials' },
  PK: { code: 'PK', label: 'Packaging', description: 'Packaging materials' },
  EQ: { code: 'EQ', label: 'Equipment', description: 'Equipment and machinery' },
  SP: { code: 'SP', label: 'Spare Parts', description: 'Spare parts' },
  CL: { code: 'CL', label: 'Cleaning Supplies', description: 'Cleaning supplies' },
  AD: { code: 'AD', label: 'Additives', description: 'Feed additives and supplements' },
  VT: { code: 'VT', label: 'Veterinary Consumables', description: 'Veterinary consumables' },
  UT: { code: 'UT', label: 'Utilities Consumables', description: 'Utilities consumables' },
} as const;

export const SUB_TYPES: Record<string, { code: string; label: string }[]> = {
  FD: [
    { code: 'ST', label: 'Starter' },
    { code: 'GR', label: 'Grower' },
    { code: 'FN', label: 'Finisher' },
    { code: 'PR', label: 'Pre-starter' },
    { code: 'LY', label: 'Layer Mash' },
    { code: 'BR', label: 'Breeder' },
    { code: 'CR', label: 'Crumble' },
    { code: 'WS', label: 'Wheat/Straight' },
  ],
  RM: [
    { code: 'GR', label: 'Grain' },
    { code: 'PR', label: 'Protein Source' },
    { code: 'MN', label: 'Mineral' },
    { code: 'VT', label: 'Vitamin' },
    { code: 'EN', label: 'Energy Source' },
  ],
  MD: [
    { code: 'AB', label: 'Antibiotic' },
    { code: 'AC', label: 'Anticoccidial' },
    { code: 'AH', label: 'Anthelmintic' },
    { code: 'AS', label: 'Antiseptic' },
    { code: 'OT', label: 'Other' },
  ],
  VX: [
    { code: 'ND', label: 'Newcastle Disease' },
    { code: 'IB', label: 'Infectious Bronchitis' },
    { code: 'GB', label: 'Gumboro' },
    { code: 'FP', label: 'Fowl Pox' },
    { code: 'OT', label: 'Other' },
  ],
  DS: [
    { code: 'VI', label: 'Virucidal' },
    { code: 'BC', label: 'Bactericidal' },
    { code: 'FG', label: 'Fungicidal' },
    { code: 'GP', label: 'General Purpose' },
  ],
  BD: [
    { code: 'DC', label: 'Day-old Chicks' },
    { code: 'PL', label: 'Pullets' },
    { code: 'LY', label: 'Layers' },
    { code: 'BR', label: 'Broilers' },
    { code: 'BD', label: 'Breeders' },
  ],
  LT: [
    { code: 'WS', label: 'Wood Shavings' },
    { code: 'ST', label: 'Straw' },
    { code: 'SH', label: 'Sawdust/Husks' },
    { code: 'OT', label: 'Other' },
  ],
  PK: [
    { code: 'BG', label: 'Bags' },
    { code: 'CT', label: 'Cartons' },
    { code: 'TR', label: 'Trays' },
    { code: 'CR', label: 'Crates' },
    { code: 'LB', label: 'Labels' },
  ],
  EQ: [
    { code: 'FD', label: 'Feeders' },
    { code: 'DR', label: 'Drinkers' },
    { code: 'HT', label: 'Heaters' },
    { code: 'VN', label: 'Ventilation' },
    { code: 'LG', label: 'Lighting' },
    { code: 'OT', label: 'Other' },
  ],
  SP: [
    { code: 'ME', label: 'Mechanical' },
    { code: 'EL', label: 'Electrical' },
    { code: 'PL', label: 'Plumbing' },
    { code: 'OT', label: 'Other' },
  ],
  CL: [
    { code: 'DT', label: 'Detergent' },
    { code: 'BR', label: 'Brushes/Brooms' },
    { code: 'MO', label: 'Mops' },
    { code: 'OT', label: 'Other' },
  ],
  AD: [
    { code: 'EN', label: 'Enzyme' },
    { code: 'PB', label: 'Probiotic' },
    { code: 'AC', label: 'Acidifier' },
    { code: 'GR', label: 'Growth Promoter' },
    { code: 'OT', label: 'Other' },
  ],
  VT: [
    { code: 'SY', label: 'Syringes' },
    { code: 'ND', label: 'Needles' },
    { code: 'GL', label: 'Gloves' },
    { code: 'BD', label: 'Bandages' },
    { code: 'OT', label: 'Other' },
  ],
  UT: [
    { code: 'GS', label: 'Gas' },
    { code: 'EL', label: 'Electricity' },
    { code: 'WT', label: 'Water' },
    { code: 'OT', label: 'Other' },
  ],
};

export const FORMS = [
  { code: 'P', label: 'Pellet' },
  { code: 'C', label: 'Crumble' },
  { code: 'M', label: 'Mash' },
  { code: 'L', label: 'Liquid' },
  { code: 'S', label: 'Soluble Powder' },
  { code: 'G', label: 'Granule' },
  { code: 'D', label: 'Dust/Powder' },
  { code: 'INJ', label: 'Injectable' },
] as const;

export function formatSKU(
  primaryClass: string,
  subType: string,
  form: string,
  sequential: number
): string {
  const seqStr = sequential.toString().padStart(3, '0');
  return `${primaryClass}-${subType}-${form}-${seqStr}`;
}

export function parseSKU(sku: string): {
  primaryClass: string;
  subType: string;
  form: string;
  sequential: number;
} | null {
  const parts = sku.split('-');
  if (parts.length !== 4) return null;

  const [primaryClass, subType, form, seqStr] = parts;
  const sequential = parseInt(seqStr, 10);

  if (isNaN(sequential)) return null;

  return { primaryClass, subType, form, sequential };
}