import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { computeRossFlockMetrics, parseRossNonnegative, type ComputeRossFlockMetricsInput, type RossDailyRecordInput } from "../shared/ross-flock-metrics";
import { getRossObjective, derivedRossPhaseReference } from "../shared/ross308-reference";

const date = (day: number) => new Date(Date.UTC(2026, 10, 1 + day)).toISOString().slice(0, 10);
function fixture(lastDay = 14): ComputeRossFlockMetricsInput {
  return {
    houseBreed: "ross_308",
    flock: { id: 1, placementDate: date(0), initialCount: 1000, growingPeriod: 42,
      starterFromDay: 0, starterToDay: 7, growerFromDay: 8, growerToDay: 14,
      finisherFromDay: 15, finisherToDay: 42 },
    dailyRecords: Array.from({ length: lastDay + 1 }, (_, day) => ({ id: day + 1, flockId: 1,
      recordDate: date(day), dayNumber: day, mortality: 0, culls: 0,
      feedConsumed: day === 0 ? 0 : 10, waterConsumed: day === 0 ? 0 : 20,
      averageWeight: day === 0 ? 0.05 : day === 7 ? 0.25 : day === 14 ? 0.6 : null,
      feedType: day <= 7 ? "starter" : day <= 14 ? "grower" : "finisher", temperature: "27.5", humidity: "65" })),
    harvestLoads: { status: "available", records: [] },
    company: { timezone: "Africa/Johannesburg", now: new Date(`${date(lastDay)}T12:00:00Z`) },
  };
}
const row = (f: ComputeRossFlockMetricsInput, day: number) => f.dailyRecords.find(r => Number(r.dayNumber) === day)!;
const mutableRow = (f: ComputeRossFlockMetricsInput, day: number) => row(f, day) as RossDailyRecordInput;
const run = (f = fixture()) => computeRossFlockMetrics(f)!;
function harvest(f: ComputeRossFlockMetricsInput, day: number, count = 100, kg = 20) {
  f.harvestLoads = { status: "available", records: [{ id: 1, flockId: 1, harvestDate: date(day), chickenCountLoaded: count, totalLoadedWeightKg: kg }] };
}

describe("Ross strict data and calendar safeguards", () => {
  it.each(["12kg", "", "  ", "NaN", "Infinity", "-1", "1,000", NaN, Infinity, -1])("rejects unsafe numeric value %s", value => {
    expect(parseRossNonnegative(value)).toBeNull();
  });
  it("accepts explicit zero and whole numeric decimal tokens", () => {
    expect(parseRossNonnegative(null)).toBeNull();
    expect(parseRossNonnegative(undefined)).toBeNull();
    expect(parseRossNonnegative("0")).toBe(0);
    expect(parseRossNonnegative(" 1.25 ")).toBe(1.25);
    expect(parseRossNonnegative("1e2")).toBe(100);
  });
  it("does not run for other or unknown house breeds", () => {
    for (const houseBreed of ["cobb_500", "arbor_acres", "unknown", null, undefined])
      expect(computeRossFlockMetrics({ ...fixture(), houseBreed })).toBeNull();
  });
  it("rejects fractional and unsafe placed bird counts", () => {
    for (const initialCount of [1.5, Number.MAX_SAFE_INTEGER + 1, "1000birds", 0]) {
      const f = fixture(); f.flock.initialCount = initialCount;
      expect(run(f).birdBalances.latest.physicalRemaining).toBeNull();
    }
  });
  it("uses company-calendar day across UTC midnight", () => {
    const f = fixture(1); f.company.now = new Date(`${date(0)}T22:30:00Z`);
    expect(run(f).asOf.ageDays).toBe(1);
    f.company.timezone = "America/New_York";
    expect(run(f).asOf.ageDays).toBe(0);
    expect(run(f).asOf.recordDay).toBe(0);
  });
  it("keeps transported date prefixes as operational labels", () => {
    const f = fixture(); f.flock.placementDate = `${date(0)} 23:30:00`;
    mutableRow(f, 7).recordDate = `${date(7)}T23:30:00-08:00`;
    expect(run(f).asOf.ageDays).toBe(14);
    expect(run(f).growth.samples.find(s => s.day === 7)?.date).toBe(date(7));
  });
  it("withholds on invalid placement/timezone and future placement", () => {
    const f = fixture(); f.company.timezone = "Not/AZone";
    expect(run(f).summary.cumulativeFcr.value).toBeNull();
    f.company.timezone = "UTC"; f.flock.placementDate = "2026-02-30";
    expect(run(f).summary.averageWeightKg.value).toBeNull();
    f.flock.placementDate = date(20);
    expect(run(f).birdBalances.latest.physicalRemaining).toBeNull();
  });
  it("rejects supplied age disagreements", () => {
    const f = fixture(); f.company.ageDays = 13;
    expect(run(f).summary.cumulativeFcr.reason).toMatch(/age disagrees/);
  });
  it("fails closed on date/day-number mismatches", () => {
    const f = fixture(); mutableRow(f, 5).dayNumber = 6;
    expect(run(f).summary.cumulativeFcr.value).toBeNull();
    expect(run(f).dailyConsumption).toEqual([]);
  });
  it("fails closed on duplicate records and wrong-flock records", () => {
    const f = fixture(); f.dailyRecords = [...f.dailyRecords, { ...row(f, 7), id: 999 }];
    expect(run(f).summary.cumulativeFcr.reason).toMatch(/Duplicate/);
    f.dailyRecords = fixture().dailyRecords; mutableRow(f, 7).flockId = 2;
    expect(run(f).summary.cumulativeFcr.reason).toMatch(/mismatch/);
  });
  it("fails closed on malformed daily dates", () => {
    const f = fixture(); mutableRow(f, 3).recordDate = "not-a-date";
    expect(run(f).summary.cumulativeFcr.value).toBeNull();
  });
  it("ignores records before placement and in the future", () => {
    const f = fixture(); f.dailyRecords = [...f.dailyRecords,
      { ...row(f, 0), recordDate: date(-1), dayNumber: -1, feedConsumed: 99999 },
      { ...row(f, 14), recordDate: date(15), dayNumber: 15, feedConsumed: 99999, mortality: 900 }];
    expect(run(f).summary.fcrFeedKg.value).toBe(14 * 10);
    expect(run(f).birdBalances.latest.totalOnFarmLosses).toBe(0);
  });
});

describe("Ross date-aligned FCR and population balances", () => {
  it("calculates unthinned same-date FCR and provisional EPEF", () => {
    const m = run();
    expect(m.summary.cumulativeFcr.value).toBeCloseTo(14 * 10 / (1000 * 0.6), 10);
    expect(m.summary.epef.value).toBeCloseTo(100 * 0.6 * 100 / (14 * m.summary.cumulativeFcr.value!), 10);
    expect(m.summary.epefProvisional).toBe(true);
    expect(m.summary.weightObjective?.fcr).toBe(getRossObjective(14)?.fcr);
  });
  it("excludes feed and later losses after the measured endpoint but keeps latest consumption", () => {
    const f = fixture(16); mutableRow(f, 15).feedConsumed = 800; mutableRow(f, 16).mortality = 100;
    const m = run(f);
    expect(m.summary.fcrEndpointDay).toBe(14);
    expect(m.summary.fcrFeedKg.value).toBe(14 * 10);
    expect(m.birdBalances.fcrEndpoint.physicalRemaining).toBe(1000);
    expect(m.birdBalances.latest.physicalRemaining).toBe(900);
    expect(m.dailyConsumption.find(r => r.day === 15)?.feedKg.value).toBe(800);
  });
  it("requires uninterrupted feed coverage beginning at placement Day 0", () => {
    const f = fixture(); f.dailyRecords = f.dailyRecords.filter(r => r.dayNumber !== 0);
    expect(run(f).summary.cumulativeFcr.reason).toMatch(/Day 0/);
  });
  it("does not invent missing feed zeros", () => {
    const f = fixture(); mutableRow(f, 4).feedConsumed = null;
    expect(run(f).summary.cumulativeFcr.reason).toMatch(/invalid feed/);
  });
  it("rejects malformed and negative feed and loss counts", () => {
    const f = fixture(); mutableRow(f, 4).feedConsumed = "10kg";
    expect(run(f).summary.cumulativeFcr.value).toBeNull();
    mutableRow(f, 4).feedConsumed = 10; mutableRow(f, 4).mortality = -1;
    expect(run(f).summary.cumulativeFcr.value).toBeNull();
    mutableRow(f, 4).mortality = 1.5;
    expect(run(f).birdBalances.latest.physicalRemaining).toBeNull();
  });
  it("returns unavailable, not zero, for empty/early observations", () => {
    const f = fixture(0); const m = run(f);
    expect(m.summary.cumulativeFcr.value).toBeNull();
    expect(m.summary.epef.value).toBeNull();
    expect(m.growth.adgG.value).toBeNull();
    f.dailyRecords = [];
    expect(run(f).summary.averageWeightKg.value).toBeNull();
  });
  it("separates found-dead, culls, total losses and survival", () => {
    const f = fixture(); mutableRow(f, 5).mortality = 10; mutableRow(f, 5).culls = 3;
    const b = run(f).birdBalances.latest;
    expect(b.foundDead).toBe(7); expect(b.culls).toBe(3); expect(b.totalOnFarmLosses).toBe(10);
    expect(b.livabilityPct.value).toBeCloseTo(990 / 1000 * 100);
    expect(b.mortalityPct.value).toBeCloseTo(7 / 1000 * 100);
  });
  it("keeps historical NULL loss splits unknown even when total loss is known", () => {
    const f = fixture(); mutableRow(f, 5).mortality = 10; mutableRow(f, 5).culls = null;
    const b = run(f).birdBalances.latest;
    expect(b.physicalRemaining).toBe(990); expect(b.totalOnFarmLosses).toBe(10);
    expect(b.foundDead).toBeNull(); expect(b.culls).toBeNull(); expect(b.mortalityPct.value).toBeNull();
    expect(b.splitKnown).toBe(false); expect(b.splitReason).toMatch(/NULL/);
  });
  it("rejects culls exceeding total losses", () => {
    const f = fixture(); mutableRow(f, 2).mortality = 2; mutableRow(f, 2).culls = 3;
    expect(run(f).birdBalances.latest.totalOnFarmLosses).toBeNull();
  });
  it("reconciles loaded kilograms plus post-thinning measured remaining biomass", () => {
    const f = fixture(); harvest(f, 10, 100, 40);
    const m = run(f);
    expect(m.birdBalances.latest.physicalRemaining).toBe(900);
    expect(m.birdBalances.latest.survivingBirds).toBe(1000);
    expect(m.birdBalances.latest.livabilityPct.value).toBe(100);
    expect(m.summary.fcrOutputPlusRemainingKg.value).toBe(40 + 900 * 0.6);
    expect(m.summary.cumulativeFcr.value).toBeCloseTo(140 / (40 + 900 * 0.6));
    expect(m.summary.epef.value).toBeNull();
  });
  it("requires weight strictly AFTER removal, not on removal day", () => {
    const f = fixture(); harvest(f, 14);
    expect(run(f).summary.cumulativeFcr.reason).toMatch(/AFTER/);
  });
  it("withholds EPEF after later harvest while retaining historical preharvest FCR scope", () => {
    const f = fixture(16); harvest(f, 15);
    const m = run(f);
    expect(m.summary.fcrEndpointDay).toBe(14); expect(m.summary.cumulativeFcr.value).not.toBeNull();
    expect(m.summary.epef.value).toBeNull(); expect(m.birdBalances.latest.physicalRemaining).toBe(900);
  });
  it("calculates fully depleted FCR from all endpoint feed and actual loaded output", () => {
    const f = fixture(16); harvest(f, 16, 1000, 650);
    const m = run(f);
    expect(m.summary.fcrEndpointDay).toBe(16);
    expect(m.summary.cumulativeFcr.value).toBeCloseTo(16 * 10 / 650);
    expect(m.summary.fcrOutputPlusRemainingKg.value).toBe(650);
    expect(m.summary.epef.value).toBeNull();
  });
  it("handles multiple harvest loads without double counting inventory or mortality", () => {
    const f = fixture(); harvest(f, 10, 100, 30);
    if (f.harvestLoads.status === "available") f.harvestLoads.records = [...f.harvestLoads.records,
      { id: 2, flockId: 1, harvestDate: date(12), chickenCountLoaded: 200, totalLoadedWeightKg: 80 }];
    const m = run(f);
    expect(m.birdBalances.latest.harvestedBirds).toBe(300); expect(m.birdBalances.latest.physicalRemaining).toBe(700);
    expect(m.summary.fcrOutputPlusRemainingKg.value).toBe(110 + 700 * 0.6);
  });
  it("never treats unavailable harvest reads as zero loads", () => {
    const f = fixture(); f.harvestLoads = { status: "unavailable", reason: "read failed" };
    const m = run(f);
    expect(m.birdBalances.latest.harvestedBirds).toBeNull(); expect(m.birdBalances.latest.physicalRemaining).toBeNull();
    expect(m.summary.cumulativeFcr.reason).toMatch(/unavailable/); expect(m.summary.epef.value).toBeNull();
    expect(m.birdBalances.latest.livabilityPct.value).toBe(100);
  });
  it("rejects duplicate harvest IDs and unsafe loaded counts", () => {
    const f = fixture(); harvest(f, 10);
    if (f.harvestLoads.status === "available") f.harvestLoads.records = [...f.harvestLoads.records, ...f.harvestLoads.records];
    expect(run(f).summary.cumulativeFcr.value).toBeNull();
    harvest(f, 10, 100.5);
    expect(run(f).summary.cumulativeFcr.value).toBeNull();
  });
  it("rejects inconsistent or negative loaded mass and impossible inventories", () => {
    const f = fixture();
    for (const [count, kg] of [[100, 0], [0, 20], [100, -20], [1001, 200]]) {
      harvest(f, 10, count, kg); expect(run(f).summary.cumulativeFcr.value).toBeNull();
    }
  });
  it("ignores future harvest loads but rejects undated harvests", () => {
    const f = fixture(); harvest(f, 15, 1000, 700);
    expect(run(f).birdBalances.latest.harvestedBirds).toBe(0);
    if (f.harvestLoads.status === "available") f.harvestLoads.records = [{ ...f.harvestLoads.records[0], harvestDate: "bad" }];
    expect(run(f).summary.cumulativeFcr.value).toBeNull();
  });
});

describe("Ross observed growth and individual-weight measures", () => {
  it("uses first-to-last full-span ADG rather than unweighted mean intervals", () => {
    const f = fixture(); mutableRow(f, 7).dayNumber = 7; mutableRow(f, 7).averageWeight = null;
    mutableRow(f, 2).averageWeight = 0.2;
    const m = run(f);
    expect(m.growth.adgG.value).toBeCloseTo((0.6 - 0.05) * 1000 / 14);
    expect(m.growth.adgG.value).not.toBeCloseTo(m.growth.intervals.reduce((sum, r) => sum + r.adgG, 0) / m.growth.intervals.length);
    expect(m.growth.intervals[0].referenceAdgG).toBeCloseTo((getRossObjective(2)!.weightKg - getRossObjective(0)!.weightKg) * 1000 / 2);
  });
  it("one weighing cannot establish ADG or a projection", () => {
    const f = fixture(); mutableRow(f, 0).averageWeight = null; mutableRow(f, 7).averageWeight = null;
    expect(run(f).growth.adgG.value).toBeNull(); expect(run(f).summary.projectedWeightKg.value).toBeNull();
  });
  it("projects from observed nonnegative ADG with an explicit non-reference label", () => {
    const m = run();
    expect(m.summary.projectedWeightKg.value).toBeCloseTo(0.6 + m.growth.adgG.value! / 1000 * (42 - 14));
    expect(m.summary.projectionLabel).toMatch(/Linear/);
  });
  it("does not project negative observed growth", () => {
    const f = fixture(); mutableRow(f, 0).averageWeight = 0.8;
    expect(run(f).growth.adgG.value).toBeLessThan(0); expect(run(f).summary.projectedWeightKg.value).toBeNull();
  });
  it("does not extrapolate breeder objectives after day 56", () => {
    const f = fixture(60); mutableRow(f, 60).averageWeight = 4.5;
    const m = run(f);
    expect(m.summary.weightObjective).toBeNull(); expect(m.summary.weightDeviationPct.value).toBeNull();
    expect(m.growth.referenceAdgG.value).toBeNull(); expect(m.dailyConsumption.at(-1)?.reference).toBeNull();
  });
  it("fails closed on malformed/negative measured average weight", () => {
    const f = fixture(); mutableRow(f, 14).averageWeight = "0.6kg";
    expect(run(f).summary.averageWeightKg.value).toBeNull();
    mutableRow(f, 14).averageWeight = -0.6;
    expect(run(f).summary.averageWeightKg.value).toBeNull();
  });
  it("preserves numeric zero not-weighed sentinels without dropping valid Day-0/7 measurements", () => {
    const f = fixture(7); mutableRow(f, 1).averageWeight = 0; mutableRow(f, 2).averageWeight = "0.000";
    const m = run(f);
    expect(m.growth.samples.map(s => s.day)).toEqual([0, 7]);
    expect(m.growth.adgG.value).toBeCloseTo((0.25 - 0.05) * 1000 / 7);
    expect(m.summary.cumulativeFcr.value).toBeCloseTo(70 / (1000 * 0.25));
    expect(m.day7.weightMultiple.value).toBe(5);
  });
  it("computes sample SD with n−1 and direct within-10% uniformity", () => {
    const f = fixture(); mutableRow(f, 14).weightSamples = "0.9,1,1.1";
    const u = run(f).uniformity.latest!;
    expect(u.sampleSdKg.value).toBeCloseTo(Math.sqrt((0.1 ** 2 + 0.1 ** 2) / (3 - 1)));
    expect(u.cvPct.value).toBeCloseTo(10); expect(u.within10Pct.value).toBe(100);
    expect(u.within10Pct.value).not.toBe(100 - u.cvPct.value!);
    expect(u.meetsSampleCountRecommendation).toBe(false); expect(u.reason).toMatch(/Low sample count/);
  });
  it("rejects every bad individual sample token without stripping it", () => {
    const f = fixture();
    for (const samples of ["1,bad,1", "1,,1", "1,0,1", "1,-1,1", "1,1kg,1", "1,NaN,1", "1,Infinity,1"]) {
      mutableRow(f, 14).weightSamples = samples;
      expect(run(f).uniformity.latest!.cvPct.value).toBeNull();
      expect(run(f).uniformity.latest!.within10Pct.value).toBeNull();
      expect(run(f).uniformity.latest!.reason).toMatch(/token/);
    }
  });
  it("reports sample count recommendation as max(100, ceil(1% physical population))", () => {
    const f = fixture(); f.flock.initialCount = 10001;
    mutableRow(f, 14).weightSamples = Array(100).fill("0.6").join(",");
    expect(run(f).uniformity.latest!.recommendedSampleCount).toBe(101);
    expect(run(f).uniformity.latest!.meetsSampleCountRecommendation).toBe(false);
    mutableRow(f, 14).weightSamples = Array(101).fill("0.6").join(",");
    expect(run(f).uniformity.latest!.meetsSampleCountRecommendation).toBe(true);
    expect(run(f).uniformity.latest!.representativeSamplingVerified).toBe(false);
  });
  it("requires at least two samples for sample CV", () => {
    const f = fixture(); mutableRow(f, 14).weightSamples = "0.6";
    expect(run(f).uniformity.latest!.cvPct.value).toBeNull();
    expect(run(f).uniformity.latest!.within10Pct.value).toBe(100);
    expect(run(f).uniformity.latest!.meetsSampleCountRecommendation).toBe(false);
  });
  it("uses actual Day-0/Day-7 mean weights for the 4.5 multiple check", () => {
    const m = run();
    expect(m.day7.weightMultiple.value).toBeCloseTo(0.25 / 0.05); expect(m.day7.meetsMinimum).toBe(true);
    const f = fixture(); mutableRow(f, 0).averageWeight = null;
    expect(run(f).day7.weightMultiple.value).toBeNull();
  });
  it("only compares exact Day-0/Day-7 CVs, not nearest available days", () => {
    const f = fixture(); mutableRow(f, 0).weightSamples = "1,1,1"; mutableRow(f, 7).weightSamples = "0.8,1,1.2";
    expect(run(f).day7.cvChangePercentagePoints.value).toBeCloseTo(20);
    expect(run(f).day7.broodingReviewSuggested).toBe(true);
    mutableRow(f, 7).weightSamples = null; mutableRow(f, 8).weightSamples = "0.8,1,1.2";
    expect(run(f).day7.cvChangePercentagePoints.value).toBeNull();
  });
});

describe("Ross configured phase safeguards and water/feed usage", () => {
  it("derives phase reference at the exact configured weight boundaries", () => {
    const phases = run().phases;
    expect(phases[0].boundaryDay).toBe(0); expect(phases[0].endDay).toBe(7);
    expect(phases[0].feedToGainRatio.value).toBeCloseTo(70 / (1000 * (0.25 - 0.05)));
    expect(phases[0].reference).toBe(derivedRossPhaseReference(0, 7));
    expect(phases[1].boundaryDay).toBe(7); expect(phases[1].reference).toBe(derivedRossPhaseReference(7, 14));
  });
  it("requires exact boundary weights instead of carrying an older weight", () => {
    const f = fixture(); mutableRow(f, 7).averageWeight = null; mutableRow(f, 6).averageWeight = 0.23;
    expect(run(f).phases[0].feedToGainRatio.value).toBeNull();
    expect(run(f).phases[1].feedToGainRatio.value).toBeNull();
    expect(run(f).phases[1].reference).not.toBeNull();
  });
  it("withholds phase actual ratios after losses but still shows reference", () => {
    const f = fixture(); mutableRow(f, 3).mortality = 1;
    const p = run(f).phases[0];
    expect(p.feedToGainRatio.reason).toMatch(/losses\/removals/); expect(p.reference).not.toBeNull();
  });
  it("withholds phase actual ratios after harvesting in the phase", () => {
    const f = fixture(); harvest(f, 10);
    expect(run(f).phases[1].feedToGainRatio.value).toBeNull();
    expect(run(f).phases[1].reference).not.toBeNull();
  });
  it("completed phase ratios never use later losses or future feed", () => {
    const before = run().phases[0].feedToGainRatio.value;
    const f = fixture(16); mutableRow(f, 15).mortality = 100; mutableRow(f, 16).feedConsumed = 9000;
    expect(run(f).phases[0].feedToGainRatio.value).toBe(before);
  });
  it("fails closed for overlaps, missing configuration and feed-type/date mismatch", () => {
    const f = fixture(); f.flock.growerFromDay = 7;
    expect(run(f).phases[0].feedToGainRatio.reason).toMatch(/overlap/);
    expect(run(f).phases[0].reference).toBeNull();
    f.flock.growerFromDay = 8; mutableRow(f, 4).feedType = "grower";
    expect(run(f).phases[0].feedToGainRatio.reason).toMatch(/feed type/);
    f.flock.growerToDay = null;
    expect(run(f).phases[1].reference).toBeNull();
    expect(run(f).phases[1].feedToGainRatio.value).toBeNull();
  });
  it("uses as-of ending day for incomplete phases and requires feed coverage including zero days", () => {
    const f = fixture(10); mutableRow(f, 10).averageWeight = 0.4;
    const p = run(f).phases[1];
    expect(p.endDay).toBe(10); expect(p.complete).toBe(false); expect(p.reference).toBe(derivedRossPhaseReference(7, 10));
    mutableRow(f, 9).feedConsumed = null;
    expect(run(f).phases[1].feedToGainRatio.value).toBeNull();
    expect(run(f).phases[2].feedToGainRatio.value).toBeNull();
  });
  it("uses loss/removal-adjusted physical count for each daily consumption observation", () => {
    const f = fixture(); mutableRow(f, 4).mortality = 10; harvest(f, 10, 100, 30);
    const m = run(f);
    expect(m.dailyConsumption.find(r => r.day === 3)?.feedGPerBird.value).toBeCloseTo(10 / 1000 * 1000);
    expect(m.dailyConsumption.find(r => r.day === 10)?.feedGPerBird.value).toBeCloseTo(10 / 890 * 1000);
    expect(m.dailyConsumption.find(r => r.day === 10)?.birdCountBasis).toMatch(/End-of-day/);
  });
  it("uses matching total water/feed rather than mean daily ratios", () => {
    const f = fixture(2); mutableRow(f, 1).feedConsumed = 1; mutableRow(f, 1).waterConsumed = 4;
    mutableRow(f, 2).feedConsumed = 9; mutableRow(f, 2).waterConsumed = 9;
    expect(run(f).water.ratioLitresPerKg.value).toBeCloseTo((4 + 9) / (1 + 9));
    expect(run(f).water.ratioLitresPerKg.value).not.toBe((4 + 1) / 2);
  });
  it("does not invent missing water or daily feed and shows actual temperature context", () => {
    const f = fixture(); mutableRow(f, 1).waterConsumed = null; mutableRow(f, 2).feedConsumed = null;
    mutableRow(f, 3).temperature = -2; mutableRow(f, 3).humidity = 101;
    const m = run(f);
    expect(m.dailyConsumption[1].waterLitres.value).toBeNull(); expect(m.dailyConsumption[2].feedGPerBird.value).toBeNull();
    expect(m.water.matchedRecordCount).toBe(f.dailyRecords.length - 2);
    expect(m.dailyConsumption[3].temperatureC).toBe(-2); expect(m.dailyConsumption[3].humidityPct).toBeNull();
    expect(m.water.usageLabel).toMatch(/Metered/); expect(m.water.referenceAt21C).toEqual({ min: 1.6, max: 1.8 });
  });
  it("withholds per-bird usage when inventory or loss coverage is unsafe", () => {
    const f = fixture(); f.dailyRecords = f.dailyRecords.filter(r => r.dayNumber !== 1);
    expect(run(f).dailyConsumption.find(r => r.day === 2)?.feedGPerBird.value).toBeNull();
    harvest(f, 14, 1000, 650);
    expect(run(f).dailyConsumption.at(-1)?.meteredWaterMlPerBird.value).toBeNull();
  });
  it("does not mutate caller data or emit nonfinite numbers", () => {
    const f = fixture(); const before = JSON.stringify(f);
    const m = run(f); expect(JSON.stringify(f)).toBe(before);
    const walk = (value: unknown): void => {
      if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
      else if (value && typeof value === "object") Object.values(value).forEach(walk);
    };
    walk(m); mutableRow(f, 3).feedConsumed = "1e308"; mutableRow(f, 4).feedConsumed = "1e308";
    walk(run(f)); expect(run(f).summary.cumulativeFcr.value).toBeNull();
  });
});

/** AST extraction runs only the permitted adapters, not db.ts initialization or credentials. */
function adapterHarness(f: ComputeRossFlockMetricsInput, breed: string | null = "ross_308", failLoads = false) {
  const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
  const tree = ts.createSourceFile("db.ts", source, ts.ScriptTarget.Latest, true);
  const names = ["getRossMetrics", "getAdvancedGrowthMetrics", "getFeedEfficiencyMetrics", "getFlockPerformanceMetrics"];
  const functions = tree.statements.filter(n => ts.isFunctionDeclaration(n) && n.name && names.includes(n.name.text));
  expect(functions.length).toBe(4);
  const code = ts.transpileModule(functions.map(n => n.getText(tree).replace(/^export /, "")).join("\n"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const selections: unknown[] = [];
  const filters: unknown[] = [];
  const columns = Object.fromEntries(["id", "flockId", "harvestDate", "chickenCountLoaded", "totalLoadedWeightKg"].map(k => [k, `harvest.${k}`]));
  const db = { select: (projection: unknown) => {
    selections.push(projection);
    return { from: (table: unknown) => ({ where: async (filter: unknown) => {
      filters.push(filter); expect(table).toBe(columns);
      if (failLoads) throw new Error("harvest query failed");
      return f.harvestLoads.status === "available" ? f.harvestLoads.records : [];
    } }) };
  } };
  const create = new Function("getDb", "getFlockById", "getFlockDailyRecords", "getHouseById", "getDisplayTimezone", "computeRossFlockMetrics", "harvestRecords", "eq", "getFlockAgeDays", `${code}\nreturn { getFlockPerformanceMetrics, getAdvancedGrowthMetrics, getFeedEfficiencyMetrics };`);
  const endpoints = create(async () => db, async () => ({ ...f.flock, houseId: 5, flockNumber: "TEST-1" }),
    async () => f.dailyRecords, async () => breed === null ? null : { breed }, async () => "UTC",
    (input: ComputeRossFlockMetricsInput) => computeRossFlockMetrics({ ...input, company: f.company }), columns,
    (field: unknown, id: unknown) => ({ field, id }), () => Number(f.dailyRecords.at(-1)?.dayNumber ?? 0));
  return { endpoints, selections, filters };
}

describe("credential-free existing adapter integration", () => {
  it("reads only the five allowed load columns and filters by flock", async () => {
    const h = adapterHarness(fixture()); const r = await h.endpoints.getFlockPerformanceMetrics(1);
    expect(Object.keys(h.selections[0] as object).sort()).toEqual(["chickenCountLoaded", "flockId", "harvestDate", "id", "totalLoadedWeightKg"].sort());
    expect(h.filters).toEqual([{ field: "harvest.flockId", id: 1 }]); expect(r.rossMetrics.breed).toBe("ross_308");
  });
  it("corrects common summary fields for Ross and exposes null rather than legacy zero", async () => {
    const f = fixture(); harvest(f, 10, 100, 40);
    const h = adapterHarness(f); const r = await h.endpoints.getFlockPerformanceMetrics(1);
    expect(r.currentCount).toBe(900); expect(r.fcr).toBeCloseTo(140 / (40 + 900 * 0.6));
    const incomplete = fixture(); mutableRow(incomplete, 1).feedConsumed = null;
    const unavailable = await adapterHarness(incomplete).endpoints.getFlockPerformanceMetrics(1);
    expect(unavailable.fcr).toBeNull(); expect(unavailable.totalFeedConsumed).toBeNull();
  });
  it("preserves other-breed/unknown-house summary fields and never reads harvests", async () => {
    for (const breed of ["cobb_500", "arbor_acres", null]) {
      const h = adapterHarness(fixture(), breed); const r = await h.endpoints.getFlockPerformanceMetrics(1);
      expect(r.rossMetrics).toBeNull(); expect(r.currentCount).toBe(1000);
      expect(r.averageWeight).toBe(0.6); expect(r.fcr).toBe(Number((140 / 600).toFixed(2)));
      expect(h.selections).toEqual([]);
    }
  });
  it("propagates failed harvest reads on every existing endpoint", async () => {
    const h = adapterHarness(fixture(), "ross_308", true);
    for (const name of ["getFlockPerformanceMetrics", "getAdvancedGrowthMetrics", "getFeedEfficiencyMetrics"])
      await expect(h.endpoints[name](1)).rejects.toThrow("harvest query failed");
  });
  it("maps corrected Ross ADG/uniformity/EPEF and feed values through legacy names", async () => {
    const f = fixture(); mutableRow(f, 14).weightSamples = "0.9,1,1.1";
    const h = adapterHarness(f); const a = await h.endpoints.getAdvancedGrowthMetrics(1);
    expect(a.avgDailyGain).toBeCloseTo((0.6 - 0.05) * 1000 / 14);
    expect(a.uniformityIndex).toBe(100); expect(a.uniformityCvPct).toBeCloseTo(10); expect(a.uniformitySampleCount).toBe(3);
    const feed = await h.endpoints.getFeedEfficiencyMetrics(1);
    expect(feed.avgWaterFeedRatio).toBe(2); expect(feed.feedTypePerformance[0].fcr).toBeCloseTo(70 / 200);
  });
  it("keeps other-breed advanced/feed legacy definitions unchanged", async () => {
    const f = fixture(); mutableRow(f, 14).weightSamples = "0.9,1,1.1";
    const h = adapterHarness(f, "cobb_500"); const a = await h.endpoints.getAdvancedGrowthMetrics(1);
    expect(a.rossMetrics).toBeNull(); expect(a.uniformityIndex).toBe(Number((100 - Math.sqrt((0.1 ** 2 + 0.1 ** 2) / 3) * 100).toFixed(2)));
    const feed = await h.endpoints.getFeedEfficiencyMetrics(1);
    expect(feed.rossMetrics).toBeNull(); expect(feed.avgWaterFeedRatio).toBe(2); expect(h.selections).toEqual([]);
  });
});
