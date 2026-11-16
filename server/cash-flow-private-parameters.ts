/** Existing private forecast configuration. Only returned by the guarded Cash Flow API. */
// Pre-built forecast from the operational parameters
export const OPERATIONAL_PARAMS = {
  chicksPerHouse: 15000,
  chickCostPerChick: 826, // R8.26 in cents
  houseCleaning: 391304,
  chickVaccine: 450000,
  coal: 784000,
  bedding: 560000,
  feedDelivery: 1028100,
  feedStarter: 9865260,
  feedGrower: 11915280,
  feedFinisher: 6999408,
  rental: 1739130,
  labourMonthly: 3645440,
  powerMonthly: 680000,
};

// Client payment schedule (in cents)
export const CLIENT_PAYMENT_SCHEDULE = [
  { date: "2026-02-09", amount: 150000000, description: "Advance - Cycle 1 Houses 1 & 2" },
  { date: "2026-03-09", amount: 118800000, description: "Advance - Cycle 1 Houses 5 & 6" },
  { date: "2026-04-06", amount: 118800000, description: "Advance - Cycle 2 Houses 3 & 4" },
  { date: "2026-05-04", amount: 118800000, description: "Advance - Cycle 3 Houses 1 & 2" },
  { date: "2026-06-01", amount: 118800000, description: "Advance - Cycle 3 Houses 5 & 6" },
  { date: "2026-06-29", amount: 118800000, description: "Advance - Cycle 4 Houses 3 & 4" },
  { date: "2026-07-27", amount: 118800000, description: "Advance - Cycle 5 Houses 1 & 2" },
  { date: "2026-08-24", amount: 118800000, description: "Advance - Cycle 5 Houses 5 & 6" },
  { date: "2026-09-21", amount: 118800000, description: "Advance - Cycle 6 Houses 3 & 4" },
  { date: "2026-10-19", amount: 118800000, description: "Advance - Cycle 7 Houses 1 & 2" },
  { date: "2026-11-16", amount: 118800000, description: "Advance - Cycle 7 Houses 5 & 6" },
  { date: "2026-12-14", amount: 118800000, description: "Advance - Cycle 8 Houses 3 & 4" },
];
