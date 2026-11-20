import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { eq } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { harvestRecords } from "../drizzle/schema";
import { getFlockAgeDays } from "../shared/flock-placement";
import { computeRossFlockMetrics } from "../shared/ross-flock-metrics";

// Compile only actual adapter declarations, injecting all reads. Never import server/db or appRouter.
const source = fs.readFileSync(path.join(import.meta.dirname, "db.ts"), "utf8");
const ast = ts.createSourceFile("db.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const names = ["getRossMetrics", "getAdvancedGrowthMetrics", "getFeedEfficiencyMetrics", "getFlockPerformanceMetrics"];
const declarations = ast.statements.filter(s => ts.isFunctionDeclaration(s) && s.name && names.includes(s.name.text));
if (declarations.length !== names.length) throw new Error("Actual metric adapter declarations changed; update the fixture explicitly.");
const compiled = ts.transpileModule(declarations.map(s => s.getText(ast).replace(/^export\s+/, "")).join("\n") +
  "\nexports.api = { getAdvancedGrowthMetrics, getFeedEfficiencyMetrics, getFlockPerformanceMetrics };", {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const dateFor = (day: number) => {
  const d = new Date("2026-10-09T00:00:00Z"); d.setUTCDate(d.getUTCDate() + day); return d.toISOString().slice(0, 10) + " 00:00:00";
};
const flock = { id: 7, flockNumber: "SYNTHETIC-ROSS", houseId: 2, placementDate: dateFor(0), initialCount: 1000,
  growingPeriod: 42, targetSlaughterWeight: "1.900", targetCatchingWeight: "2.000", targetDeliveredWeight: "1.900",
  starterFromDay: 0, starterToDay: 10, growerFromDay: 11, growerToDay: 24, finisherFromDay: 25, finisherToDay: 42 };
const records = () => Array.from({ length: 8 }, (_, day) => ({ id: day + 1, flockId: 7, dayNumber: day, recordDate: dateFor(day),
  mortality: 0, culls: 0, feedConsumed: day === 0 ? "0.000" : "10.000", waterConsumed: day === 0 ? "0.000" : "18.000",
  feedType: "starter", averageWeight: day === 0 ? "0.044" : day === 7 ? "0.213" : null, weightSamples: null }));
function fixture(options: { breed?: string | null; dbAvailable?: boolean; missingFlock?: boolean; failHarvest?: boolean;
  loads?: unknown[]; daily?: ReturnType<typeof records> } = {}) {
  const projections: string[][] = [];
  const predicates: unknown[] = [];
  const getFlockById = vi.fn(async () => options.missingFlock ? null : { ...flock });
  const getFlockDailyRecords = vi.fn(async () => structuredClone(options.daily ?? records()));
  const getHouseById = vi.fn(async () => options.breed === null ? null : { breed: options.breed ?? "ross_308" });
  const db = { select(projection: Record<string, unknown>) {
    projections.push(Object.keys(projection));
    return { from(table: unknown) {
      expect(table).toBe(harvestRecords);
      return { async where(predicate: unknown) {
        predicates.push(predicate);
        if (options.failHarvest) throw new Error("Synthetic harvest read failure");
        return structuredClone(options.loads ?? []);
      } };
    } };
  } };
  const exported: Record<string, any> = {};
  vm.runInNewContext(compiled, { exports: exported, Date, console, getDb: vi.fn(async () => options.dbAvailable === false ? null : db),
    getFlockById, getFlockDailyRecords, getHouseById, getDisplayTimezone: vi.fn(async () => "Africa/Johannesburg"),
    getFlockAgeDays, computeRossFlockMetrics, harvestRecords, eq }, { timeout: 1000 });
  return { api: exported.api, projections, predicates, getFlockById, getFlockDailyRecords, getHouseById };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-20T10:00:00Z")); });
afterEach(() => vi.useRealTimers());

describe("Actual read-only metric adapters", () => {
  it("returns corrected Ross summary fields and unchanged commercial target", async () => {
    const f = fixture(); const result = await f.api.getFlockPerformanceMetrics(7);
    expect(result.rossMetrics.breed).toBe("ross_308");
    expect(result.ageInDays).toBe(42);
    expect(result.averageWeight).toBe(.213);
    expect(result.fcr).toBeCloseTo(70 / (1000 * .213));
    expect(result.totalFeedConsumed).toBe(70);
    expect(result.currentCount).toBe(1000);
    expect(result.targetWeight).toBe(1.9);
    expect(result.rossMetrics.asOf.weightDay).toBe(7);
  });
  it("reads only the five permitted operational harvest columns by this flock identity", async () => {
    const f = fixture(); await f.api.getFlockPerformanceMetrics(7);
    expect(f.projections).toEqual([["id", "flockId", "harvestDate", "chickenCountLoaded", "totalLoadedWeightKg"]]);
    const query = new MySqlDialect().sqlToQuery(f.predicates[0] as any);
    expect(query.params).toEqual([7]);
    expect(query.sql).toContain("flockId");
  });
  it.each(["cobb_500", "arbor_acres"])("does not read harvests or replace %s legacy outputs", async breed => {
    const f = fixture({ breed }); const result = await f.api.getFlockPerformanceMetrics(7);
    expect(result.rossMetrics).toBeNull(); expect(f.projections).toEqual([]);
    expect(result.averageWeight).toBe(.213); expect(result.fcr).toBe(Number((70 / 213).toFixed(2)));
    expect(result.currentCount).toBe(1000);
  });
  it("does not silently assign an unknown house to Ross", async () => {
    const f = fixture({ breed: null }); const result = await f.api.getFlockPerformanceMetrics(7);
    expect(result.rossMetrics).toBeNull(); expect(f.projections).toEqual([]);
  });
  it("does not substitute empty harvests when the read fails", async () => {
    const f = fixture({ failHarvest: true });
    await expect(f.api.getFlockPerformanceMetrics(7)).rejects.toThrow("Synthetic harvest read failure");
  });
  it.each(["getFlockPerformanceMetrics", "getAdvancedGrowthMetrics", "getFeedEfficiencyMetrics"])("%s returns null without a database", async name => {
    expect(await fixture({ dbAvailable: false }).api[name](7)).toBeNull();
  });
  it("returns null for an absent flock", async () => {
    expect(await fixture({ missingFlock: true }).api.getFlockPerformanceMetrics(7)).toBeNull();
  });
  it("returns unavailable FCR rather than zero when feed coverage is incomplete", async () => {
    const daily = records().filter(row => row.dayNumber !== 3);
    const result = await fixture({ daily }).api.getFlockPerformanceMetrics(7);
    expect(result.fcr).toBeNull(); expect(result.totalFeedConsumed).toBeNull();
    expect(result.rossMetrics.summary.cumulativeFcr.reason).toContain("Day 3");
  });
  it("excludes later feed from an older same-date weighing endpoint", async () => {
    const daily = records(); daily.push({ ...daily[1], id: 9, dayNumber: 8, recordDate: dateFor(8), feedConsumed: "999.000" });
    const result = await fixture({ daily }).api.getFlockPerformanceMetrics(7);
    expect(result.totalFeedConsumed).toBe(70); expect(result.rossMetrics.asOf.recordDay).toBe(8);
    expect(result.rossMetrics.summary.fcrEndpointDay).toBe(7);
  });
  it("corrects the advanced endpoint using full-span observed ADG and direct uniformity", async () => {
    const daily = records(); daily[7].weightSamples = "0.2,0.2,0.2,0.3" as any;
    const result = await fixture({ daily }).api.getAdvancedGrowthMetrics(7);
    expect(result.avgDailyGain).toBeCloseTo((.213 - .044) * 1000 / 7);
    expect(result.uniformityIndex).toBe(0);
    expect(result.uniformityCvPct).toBeGreaterThan(0);
    expect(result.rossMetrics.uniformity.latest.sampleCount).toBe(4);
  });
  it("corrects feed/water endpoint ratio and exposes configured phase comparisons", async () => {
    const result = await fixture().api.getFeedEfficiencyMetrics(7);
    expect(result.avgWaterFeedRatio).toBeCloseTo(1.8);
    expect(result.rossMetrics.phases[0].configuredToDay).toBe(10);
    expect(result.rossMetrics.water.matchedRecordCount).toBe(8);
  });
  it("keeps the existing metric routes protected and introduces no new permission endpoint", () => {
    const routers = fs.readFileSync(path.join(import.meta.dirname, "routers.ts"), "utf8");
    for (const name of ["getPerformanceMetrics", "getAdvancedGrowthMetrics", "getFeedEfficiencyMetrics"])
      expect(routers).toMatch(new RegExp(`${name}: protectedProcedure`));
    expect(routers).not.toContain("getRossMetrics: ");
  });
});
