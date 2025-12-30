import { getDb } from "./db";
import { flockVaccinationSchedules, flockStressPackSchedules, vaccines } from "../drizzle/schema";
import { eq } from "drizzle-orm";

/**
 * Create vaccination schedules for a flock based on protocol
 */
export async function createVaccinationSchedulesForFlock(
  flockId: number,
  protocol: "standard" | "premium" | "none"
) {
  if (protocol === "none") return [];

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get all vaccines
  const allVaccines = await db.select().from(vaccines);

  // Define vaccination protocols
  const protocols = {
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
  };

  const scheduleTemplate = protocols[protocol];
  const schedulesToCreate = [];

  for (const item of scheduleTemplate) {
    // Find matching vaccine by disease type
    const vaccine = allVaccines.find((v) => v.diseaseType === item.diseaseType);
    if (vaccine) {
      schedulesToCreate.push({
        flockId,
        vaccineId: vaccine.id,
        scheduledDay: item.day,
        status: "scheduled" as const,
      });
    }
  }

  // Insert all schedules
  if (schedulesToCreate.length > 0) {
    await db.insert(flockVaccinationSchedules).values(schedulesToCreate);
  }

  return schedulesToCreate;
}

/**
 * Create stress pack schedules for a flock
 */
export async function createStressPackSchedulesForFlock(
  flockId: number,
  schedules: Array<{
    stressPackId: number;
    startDay: number;
    endDay: number;
    dosageStrength: "single" | "double" | "triple";
  }>
) {
  if (schedules.length === 0) return [];

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const schedulesToCreate = schedules.map((schedule) => ({
    flockId,
    stressPackId: schedule.stressPackId,
    startDay: schedule.startDay,
    endDay: schedule.endDay,
    dosageStrength: schedule.dosageStrength,
    status: "scheduled" as const,
  }));

  await db.insert(flockStressPackSchedules).values(schedulesToCreate);
  return schedulesToCreate;
}

/**
 * Create a single vaccination schedule for a flock
 */
export async function createFlockVaccinationSchedule(data: {
  flockId: number;
  vaccineId: number;
  scheduledDay: number;
  status: "scheduled" | "completed" | "missed" | "rescheduled";
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(flockVaccinationSchedules).values(data);
  return data;
}

/**
 * Get vaccination schedules for a flock
 */
export async function getFlockVaccinationSchedules(flockId: number) {
  const db = await getDb();
  if (!db) return [];

  const schedules = await db
    .select()
    .from(flockVaccinationSchedules)
    .where(eq(flockVaccinationSchedules.flockId, flockId));

  // Enrich with vaccine details
  const enriched = await Promise.all(
    schedules.map(async (schedule) => {
      const vaccineResult = await db
        .select()
        .from(vaccines)
        .where(eq(vaccines.id, schedule.vaccineId))
        .limit(1);
      return {
        ...schedule,
        vaccine: vaccineResult[0] || null,
      };
    })
  );

  return enriched;
}

/**
 * Get stress pack schedules for a flock
 */
export async function getFlockStressPackSchedules(flockId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(flockStressPackSchedules)
    .where(eq(flockStressPackSchedules.flockId, flockId));
}
