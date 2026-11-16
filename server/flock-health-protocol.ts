// Existing business vaccination protocol definitions shared by both creation paths.
export const VACCINATION_PROTOCOLS = {
    standard: [
      { diseaseType: "newcastle_disease", day: 1, name: "ND LaSota" },
      { diseaseType: "newcastle_disease", day: 7, name: "ND Hitchner B1" },
      { diseaseType: "newcastle_disease", day: 21, name: "ND LaSota" },
      { diseaseType: "infectious_bronchitis", day: 1, name: "IB H120" },
      { diseaseType: "infectious_bronchitis", day: 14, name: "IB H120" },
      { diseaseType: "gumboro", day: 14, name: "Gumboro Intermediate" },
      { diseaseType: "gumboro", day: 28, name: "Gumboro Intermediate" },
    ],
    premium: [
      { diseaseType: "newcastle_disease", day: 1, name: "ND LaSota" },
      { diseaseType: "newcastle_disease", day: 7, name: "ND Hitchner B1" },
      { diseaseType: "newcastle_disease", day: 21, name: "ND LaSota" },
      { diseaseType: "infectious_bronchitis", day: 1, name: "IB H120" },
      { diseaseType: "infectious_bronchitis", day: 14, name: "IB H120" },
      { diseaseType: "gumboro", day: 14, name: "Gumboro Intermediate" },
      { diseaseType: "gumboro", day: 28, name: "Gumboro Intermediate" },
      { diseaseType: "fowl_pox", day: 7, name: "Fowl Pox" },
      { diseaseType: "coccidiosis", day: 1, name: "Coccidiosis" },
    ],
  } as const;
