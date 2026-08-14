export const VACCINE_DISEASE_TYPES = [
  "newcastle_disease",
  "infectious_bronchitis",
  "gumboro",
  "mareks",
  "coccidiosis",
  "fowl_pox",
  "other",
] as const;

export const VACCINE_TYPES = ["live", "inactivated", "recombinant", "vector"] as const;
export const VACCINE_APPLICATION_METHODS = ["drinking_water", "spray", "eye_drop", "injection", "wing_web"] as const;
export const STRESS_PACK_DOSAGE_STRENGTHS = ["single", "double", "triple"] as const;

export type VaccineDiseaseType = (typeof VACCINE_DISEASE_TYPES)[number];
export type VaccineType = (typeof VACCINE_TYPES)[number];
export type VaccineApplicationMethod = (typeof VACCINE_APPLICATION_METHODS)[number];
export type StressPackDosageStrength = (typeof STRESS_PACK_DOSAGE_STRENGTHS)[number];

type FormResult<T> = { ok: true; data: T } | { ok: false; error: string };

function fieldText(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(formData: FormData, field: string): string | undefined {
  return fieldText(formData, field) || undefined;
}

function optionalInteger(formData: FormData, field: string, label: string, minimum: number): number | undefined | string {
  const value = fieldText(formData, field);
  if (!value) return undefined;

  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < minimum) {
    return `${label} must be a whole number of at least ${minimum}.`;
  }

  return numberValue;
}

export function buildVaccineCreateInput(
  formData: FormData,
  selections: {
    diseaseType: VaccineDiseaseType | "";
    vaccineType: VaccineType;
    applicationMethod: VaccineApplicationMethod | "";
  },
): FormResult<{
  name: string;
  brand: string;
  manufacturer?: string;
  diseaseType: VaccineDiseaseType;
  vaccineType: VaccineType;
  applicationMethod: VaccineApplicationMethod;
  dosagePerBird?: string;
  boosterIntervalDays?: number;
  instructions?: string;
  withdrawalPeriodDays?: number;
  storageTemperature?: string;
  shelfLifeDays?: number;
}> {
  const name = fieldText(formData, "name");
  const brand = fieldText(formData, "brand");

  if (!name || !brand) return { ok: false, error: "Vaccine name and brand are required." };
  if (!selections.diseaseType) return { ok: false, error: "Select a disease type." };
  if (!selections.applicationMethod) return { ok: false, error: "Select an application method." };

  const boosterIntervalDays = optionalInteger(formData, "boosterIntervalDays", "Booster interval", 1);
  if (typeof boosterIntervalDays === "string") return { ok: false, error: boosterIntervalDays };
  const withdrawalPeriodDays = optionalInteger(formData, "withdrawalPeriodDays", "Withdrawal period", 0);
  if (typeof withdrawalPeriodDays === "string") return { ok: false, error: withdrawalPeriodDays };
  const shelfLifeDays = optionalInteger(formData, "shelfLifeDays", "Shelf life", 1);
  if (typeof shelfLifeDays === "string") return { ok: false, error: shelfLifeDays };

  return {
    ok: true,
    data: {
      name,
      brand,
      manufacturer: optionalText(formData, "manufacturer"),
      diseaseType: selections.diseaseType,
      vaccineType: selections.vaccineType,
      applicationMethod: selections.applicationMethod,
      dosagePerBird: optionalText(formData, "dosagePerBird"),
      boosterIntervalDays,
      instructions: optionalText(formData, "instructions"),
      withdrawalPeriodDays,
      storageTemperature: optionalText(formData, "storageTemperature"),
      shelfLifeDays,
    },
  };
}

export function buildStressPackCreateInput(
  formData: FormData,
  dosageStrength: StressPackDosageStrength,
): FormResult<{
  name: string;
  brand: string;
  dosageStrength: StressPackDosageStrength;
  recommendedDurationDays: number;
  instructions?: string;
  costPerKg?: string;
  activeIngredients?: string;
}> {
  const name = fieldText(formData, "name");
  const brand = fieldText(formData, "brand");
  if (!name || !brand) return { ok: false, error: "Stress pack name and brand are required." };

  const recommendedDurationDays = optionalInteger(formData, "recommendedDurationDays", "Recommended duration", 1);
  if (recommendedDurationDays === undefined) return { ok: false, error: "Recommended duration is required." };
  if (typeof recommendedDurationDays === "string") return { ok: false, error: recommendedDurationDays };

  const costPerKg = optionalText(formData, "costPerKg");
  if (costPerKg && !/^\d+(\.\d{1,2})?$/.test(costPerKg)) {
    return { ok: false, error: "Cost per kg must be a non-negative amount with up to two decimal places." };
  }

  return {
    ok: true,
    data: {
      name,
      brand,
      dosageStrength,
      recommendedDurationDays,
      instructions: optionalText(formData, "instructions"),
      costPerKg,
      activeIngredients: optionalText(formData, "activeIngredients"),
    },
  };
}
