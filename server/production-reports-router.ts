import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "./_core/trpc";
import { financialProtectedProcedure as protectedProcedure } from "./financial-data-procedure";
import { canReadProductionReports, type ResolvedFlockPerformanceFilters } from "../shared/production-reports";
import { isProductionDate, productionToday } from "../shared/production-report-dates";
import { readProductionReportSource } from "./production-reports-db";
import { buildFlockPerformanceReport } from "./production-report-engine";
import { readMortalityReportSource } from "./mortality-report-db";
import { buildMortalityReport } from "./mortality-report-engine";
import { readHarvestReportSource } from "./harvest-report-db";
import { buildHarvestReport } from "./harvest-report-engine";
import { readFeedReportSource } from "./feed-report-db";
import { buildFeedPerformanceReport } from "./feed-report-engine";

const reportProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!canReadProductionReports(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Production Reports are available to administrators, farm managers and accountants." });
  }
  return next({ ctx });
});
const operationalDate = z.string().refine(isProductionDate, "Use a valid calendar date (YYYY-MM-DD).");
export const flockPerformanceInput = z.object({
  startDate: operationalDate.optional(), endDate: operationalDate.optional(),
  houseId: z.number().int().positive().optional(), flockId: z.number().int().positive().optional(),
}).strict().refine(v => !v.startDate || !v.endDate || v.startDate <= v.endDate, {
  message: "Start date must not be after end date.", path: ["startDate"],
});

export const productionReportsRouter = router({
  options: reportProcedure.query(async () => {
    const { source, timezone } = await readProductionReportSource(false);
    return {
      timezone, today: productionToday(timezone),
      houses: source.houses.slice().sort((a, b) => a.name.localeCompare(b.name)),
      flocks: source.flocks.map(({ id, flockNumber, houseId, placementDate, status }) => ({ id, flockNumber, houseId, placementDate, status }))
        .sort((a, b) => a.flockNumber.localeCompare(b.flockNumber)),
    };
  }),
  flockPerformance: reportProcedure.input(flockPerformanceInput).query(async ({ input }) => {
    const { source, timezone } = await readProductionReportSource();
    const filters: ResolvedFlockPerformanceFilters = {
      startDate: input.startDate ?? null, endDate: input.endDate ?? productionToday(timezone),
      houseId: input.houseId ?? null, flockId: input.flockId ?? null,
    };
    if (filters.startDate && filters.startDate > filters.endDate) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Start date must not be after end date." });
    }
    if (filters.houseId !== null && !source.houses.some(h => h.id === filters.houseId)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Selected house is unavailable. Refresh the filters." });
    }
    if (filters.flockId !== null) {
      const flock = source.flocks.find(f => f.id === filters.flockId);
      if (!flock || (filters.houseId !== null && flock.houseId !== filters.houseId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selected flock does not belong to the selected house or is unavailable." });
      }
    }
    return buildFlockPerformanceReport(source, filters, timezone, new Date().toISOString());
  }),
  mortality: reportProcedure.input(flockPerformanceInput).query(async ({ input }) => {
    const { source, timezone } = await readMortalityReportSource();
    const filters: ResolvedFlockPerformanceFilters = {
      startDate: input.startDate ?? null, endDate: input.endDate ?? productionToday(timezone),
      houseId: input.houseId ?? null, flockId: input.flockId ?? null,
    };
    if (filters.startDate && filters.startDate > filters.endDate) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Start date must not be after end date." });
    }
    if (filters.houseId !== null && !source.houses.some(h => h.id === filters.houseId)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Selected house is unavailable. Refresh the filters." });
    }
    if (filters.flockId !== null) {
      const flock = source.flocks.find(f => f.id === filters.flockId);
      if (!flock || (filters.houseId !== null && flock.houseId !== filters.houseId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selected flock does not belong to the selected house or is unavailable." });
      }
    }
    return buildMortalityReport(source, filters, timezone, new Date().toISOString());
  }),
  harvestResults: reportProcedure.input(flockPerformanceInput).query(async ({ input }) => {
    const { source, timezone } = await readHarvestReportSource();
    const filters: ResolvedFlockPerformanceFilters = {
      startDate: input.startDate ?? null, endDate: input.endDate ?? productionToday(timezone),
      houseId: input.houseId ?? null, flockId: input.flockId ?? null,
    };
    if (filters.startDate && filters.startDate > filters.endDate) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Start date must not be after end date." });
    }
    if (filters.houseId !== null && !source.houses.some(h => h.id === filters.houseId)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Selected house is unavailable. Refresh the filters." });
    }
    if (filters.flockId !== null) {
      const flock = source.flocks.find(f => f.id === filters.flockId);
      if (!flock || (filters.houseId !== null && flock.houseId !== filters.houseId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selected flock does not belong to the selected house or is unavailable." });
      }
    }
    return buildHarvestReport(source, filters, timezone, new Date().toISOString());
  }),
  feedPerformance: reportProcedure.input(flockPerformanceInput).query(async ({ input }) => {
    const { source, timezone } = await readFeedReportSource();
    const filters: ResolvedFlockPerformanceFilters = {
      startDate: input.startDate ?? null, endDate: input.endDate ?? productionToday(timezone),
      houseId: input.houseId ?? null, flockId: input.flockId ?? null,
    };
    if (filters.startDate && filters.startDate > filters.endDate) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Start date must not be after end date." });
    }
    if (filters.houseId !== null && !source.houses.some(h => h.id === filters.houseId)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Selected house is unavailable. Refresh the filters." });
    }
    if (filters.flockId !== null) {
      const flock = source.flocks.find(f => f.id === filters.flockId);
      if (!flock || (filters.houseId !== null && flock.houseId !== filters.houseId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selected flock does not belong to the selected house or is unavailable." });
      }
    }
    return buildFeedPerformanceReport(source, filters, timezone, new Date().toISOString());
  }),
});
