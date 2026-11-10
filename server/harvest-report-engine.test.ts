import { describe, expect, it } from "vitest";
import { buildHarvestReport } from "./harvest-report-engine";
import type { ProductionCatchSource, ResolvedFlockPerformanceFilters } from "../shared/production-reports";
import type { HarvestReportSource, HarvestResultFlock, HarvestResultSourceRecord } from "../shared/harvest-report";

// SYNTHETIC UNIT FIXTURES ONLY: no business data, seeds, database or network calls.
const GENERATED_AT = "2026-11-09T06:00:00.000Z";
const TIMEZONE = "Africa/Johannesburg";
const FILTERS: ResolvedFlockPerformanceFilters = {
  startDate: "2026-11-01", endDate: "2026-11-05", houseId: null, flockId: null,
};
function flock(overrides: Partial<HarvestResultFlock> = {}): HarvestResultFlock {
  return { id: 1, flockNumber: "SYNTHETIC-FLOCK-1", houseId: 1,
    placementDate: "2026-11-01", status: "active", ...overrides };
}
function harvest(overrides: Partial<HarvestResultSourceRecord> = {}): HarvestResultSourceRecord {
  return { id: 10, flockId: 1, harvestDate: "2026-11-04", chickenCountLoaded: 100,
    totalLoadedWeightKg: "250.000", chickenCountDelivered: 95, totalDeliveredWeightKg: "237.500",
    transportMortalities: 2, ...overrides };
}
function session(overrides: Partial<ProductionCatchSource> = {}): ProductionCatchSource {
  return { id: 20, flockId: 1, harvestRecordId: 10, catchDate: "2026-11-04", status: "completed", ...overrides };
}
function source(overrides: Partial<HarvestReportSource> = {}): HarvestReportSource {
  return { houses: [{ id: 1, name: "Synthetic House 1", houseNumber: "1" },
    { id: 2, name: "Synthetic House 2", houseNumber: "2" }],
    flocks: [flock()], harvests: [harvest()], catches: [session()], ...overrides };
}
function report(data = source(), filters: Partial<ResolvedFlockPerformanceFilters> = {}) {
  return buildHarvestReport(data, { ...FILTERS, ...filters }, TIMEZONE, GENERATED_AT);
}
function row(data = source(), filters: Partial<ResolvedFlockPerformanceFilters> = {}) {
  return report(data, filters).rows[0];
}
function messages(value: { issues: string[] }) { return value.issues.join("\n"); }
function freezeDeep(value: unknown): void {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return;
  Object.freeze(value);
  Object.values(value).forEach(freezeDeep);
}

// Derived expectations below are explicit formulas, not arithmetic mean shortcuts.
describe("buildHarvestReport — pure synthetic unit fixtures", () => {
  it("returns exact contract metadata and preserves operational date labels without timezone shifts", () => {
    const result = buildHarvestReport(source(), FILTERS, "Pacific/Kiritimati", GENERATED_AT);
    expect(result).toMatchObject({ kind: "harvest-results", timezone: "Pacific/Kiritimati",
      generatedAt: GENERATED_AT, filters: FILTERS });
    expect(result.filters).not.toBe(FILTERS);
    expect(result.rows[0]).toMatchObject({ flockId: 1, houseId: 1,
      placementDate: "2026-11-01", currentStatus: "active" });
    expect(result.rows[0].events[0]).toMatchObject({ id: 10, date: "2026-11-04",
      eligible: true, inPeriod: true, classification: "Completed catch-linked harvest", sessionIds: [20] });
    expect(result.notes.join(" ")).toMatch(/not.*historical snapshots/);
    expect(result.notes.join(" ")).toMatch(/not.*validated or repaired/);
  });

  it("is immutable, deterministic, and returns independent raw source copies", () => {
    const data = source({ harvests: [harvest(), harvest({ id: 11, harvestDate: null })],
      catches: [session(), session({ id: 21, harvestRecordId: null })] });
    const snapshot = JSON.stringify(data);
    freezeDeep(data);
    const filters = Object.freeze({ ...FILTERS });
    const result = buildHarvestReport(data, filters, TIMEZONE, GENERATED_AT);
    expect(JSON.stringify(data)).toBe(snapshot);
    expect(result).toEqual(buildHarvestReport(data, filters, TIMEZONE, GENERATED_AT));
    expect(result.rows[0].events[0].sourceVersions[0]).not.toBe(data.harvests[0]);
    expect(result.rows[0].catchExceptions[0].sourceVersions[0]).not.toBe(data.catches[1]);
    result.rows[0].events[0].sourceVersions[0].chickenCountLoaded = 999;
    result.rows[0].catchExceptions[0].sourceVersions[0].status = "changed output only";
    expect(JSON.stringify(data)).toBe(snapshot);
  });

  it.each([
    { endDate: "2026-02-30" }, { endDate: "2026-11-05T00:00:00Z" },
    { startDate: "2026-13-01" }, { startDate: "" }, { startDate: "2026-11-06" },
    { houseId: 0 }, { flockId: -1 }, { houseId: 1.2 }, { flockId: Number.NaN },
    { flockId: Infinity }, { houseId: Number.MAX_SAFE_INTEGER + 1 },
    { houseId: "1" as unknown as number }, { startDate: undefined },
  ])("strictly rejects malformed/reversed filters: %j", bad => {
    expect(() => report(source(), bad)).toThrow(/date|integer/);
  });

  it("intersects house/flock filters, leaves mismatch validation to caller, and preserves distinct flock IDs with matching labels", () => {
    const data = source({ flocks: [flock(), flock({ id: 2, houseId: 2 }),
      flock({ id: 3, placementDate: "2026-11-06" }), flock({ id: 4, placementDate: null })] });
    expect(report(data).rows.map(item => item.flockId)).toEqual([1, 4, 2]);
    expect(report(data, { houseId: 2 }).rows.map(item => item.flockId)).toEqual([2]);
    expect(report(data, { houseId: 1, flockId: 2 }).rows).toEqual([]);
    expect(report(data, { flockId: 99 }).summary).toMatchObject({ flockCount: 0,
      reviewedEventCount: 0, loadedBirds: null, massLossPct: null });
    expect(report(data).rows.filter(item => item.flockNumber === "SYNTHETIC-FLOCK-1")).toHaveLength(3);
  });

  it("includes harvest on placement/report end and supports blank start from available placement", () => {
    const actual = row(source({ flocks: [flock({ placementDate: "2026-11-05" })],
      harvests: [harvest({ harvestDate: "2026-11-05" })],
      catches: [session({ catchDate: "2026-11-05" })] }));
    expect(actual.events[0].eligible).toBe(true);
    expect(actual.metrics.loadedBirds).toBe(100);
    const earlier = row(source({ flocks: [flock({ placementDate: "2026-10-01" })],
      harvests: [harvest({ harvestDate: "2026-10-15" })], catches: [] }), { startDate: null });
    expect(earlier.metrics.loadedBirds).toBe(100);
  });

  it.each(["planned", "pending", "scheduled", "unconfirmed", "not_started", "not-started", " PLANNED "])(
    "keeps %s placement visible as review-only N/A", status => {
      const actual = report(source({ flocks: [flock({ status })] }));
      expect(actual.rows[0].currentStatus).toBe(status);
      expect(actual.rows[0].events[0].eligible).toBe(false);
      expect(actual.rows[0].metrics).toMatchObject({ eligibleEventCount: 0,
        excludedEventCount: 1, loadedBirds: null, averageLoadedKg: null, transportMortality: null });
      expect(messages(actual.rows[0])).toMatch(/Planned\/not-confirmed/);
      expect(actual.summary.loadedKg).toBeNull();
    },
  );

  it.each([null, "", "bad", "2026-02-30", "2026-11-01T00:00:00Z"])(
    "retains invalid placement %s with no result quantities", placementDate => {
      const actual = row(source({ flocks: [flock({ placementDate })] }));
      expect(actual.placementDate).toBeNull();
      expect(actual.metrics.loadedBirds).toBeNull();
      expect(actual.events).toHaveLength(1);
      expect(actual.events[0].averageLoadedKg).toBeNull();
      expect(messages(actual)).toMatch(/placement date/);
    },
  );

  it.each([
    { label: "flock label", change: { flockNumber: "" } },
    { label: "status", change: { status: "" } },
    { label: "house identifier", change: { houseId: 0 } },
    { label: "flock identifier", change: { id: 0 } },
  ])("rejects invalid $label master metadata without inventing activity", ({ change }) => {
    const f = flock(change);
    const actual = row(source({ flocks: [f], harvests: [harvest({ flockId: f.id })], catches: [] }));
    expect(actual.metrics.eligibleEventCount).toBe(0);
    expect(actual.metrics.loadedBirds).toBeNull();
    expect(messages(actual)).toMatch(/Invalid|invalid|Missing/);
  });

  it("counts exact flock/house duplicates once, but excludes conflicting master and house versions", () => {
    const data = source();
    data.flocks.push({ ...data.flocks[0] });
    data.houses.push({ ...data.houses[0] });
    expect(report(data).summary).toMatchObject({ flockCount: 1, loadedBirds: 100 });
    expect(messages(row(data))).toMatch(/Repeated flock[\s\S]*Repeated house/);
    data.flocks[1].status = "completed";
    expect(row(data).metrics.loadedBirds).toBeNull();
    expect(row(data).currentStatus).toBe("Current status unavailable or conflicting");
    const houseConflict = source();
    houseConflict.houses.push({ ...houseConflict.houses[0], houseNumber: "other" });
    expect(row(houseConflict).metrics.loadedKg).toBeNull();
    const missingHouse = source({ houses: [] });
    expect(row(missingHouse).metrics.loadedBirds).toBeNull();
    expect(messages(row(missingHouse))).toMatch(/house metadata/);
  });

  it("does not silently assign conflicting house ownership to a selected house", () => {
    const actual = row(source({ flocks: [flock(), flock({ houseId: 2 })] }), { houseId: 1 });
    expect(actual.houseId).toBeNull();
    expect(actual.metrics.loadedBirds).toBeNull();
  });

  it("omits wholly future master conflicts and retains today's current completed status for prior event dates", () => {
    const future = report(source({ flocks: [flock({ placementDate: "2026-11-06" }),
      flock({ placementDate: "2026-11-07" })] }));
    expect(future.rows).toEqual([]);
    expect(row(source({ flocks: [flock({ status: "completed" })] })).currentStatus).toBe("completed");
  });

  it("counts separate same-day partial harvest IDs once and catch provenance never contributes quantities", () => {
    const first = harvest();
    const catchFirst = session();
    const actual = row(source({ harvests: [first, { ...first }, harvest({ id: 11,
      chickenCountLoaded: 50, totalLoadedWeightKg: 150, chickenCountDelivered: 49, totalDeliveredWeightKg: 140 })],
      catches: [catchFirst, { ...catchFirst }, session({ id: 21, harvestRecordId: 11 })] }));
    expect(actual.events).toHaveLength(2);
    expect(actual.metrics).toMatchObject({ reviewedEventCount: 2, eligibleEventCount: 2,
      loadedBirds: 150, loadedKg: 400, deliveredBirds: 144, deliveredKg: 377.5, transportMortality: 4 });
    expect(actual.metrics.averageLoadedKg).toBeCloseTo(400 / 150);
    expect(actual.events[0].sessionIds).toEqual([20]);
    expect(actual.events[0].sourceVersions).toHaveLength(2);
    expect(actual.catchExceptions).toEqual([]);
    expect(messages(actual)).toMatch(/Repeated harvest[\s\S]*Repeated catch/);
  });

  it("includes distinct unlinked same-day records without fuzzy/manual assumptions", () => {
    const actual = row(source({ harvests: [harvest(), harvest({ id: 11 })], catches: [] }));
    expect(actual.metrics.loadedBirds).toBe(200);
    expect(actual.events.every(event => event.classification === "Recorded harvest — completion status unavailable")).toBe(true);
    expect(messages(actual)).toMatch(/does not prove manual entry or historical uniqueness/);
    expect(messages(actual.metrics)).toMatch(/completion and historical uniqueness are unavailable/);
  });

  it.each([
    { change: { flockId: 2 }, label: "ownership" },
    { change: { harvestDate: "2026-11-03" }, label: "date" },
    { change: { chickenCountLoaded: "100" }, label: "raw integer spelling" },
    { change: { totalLoadedWeightKg: "260.000" }, label: "loaded weight" },
    { change: { chickenCountDelivered: null }, label: "actual delivered count" },
    { change: { totalDeliveredWeightKg: "230.000" }, label: "actual delivered weight" },
    { change: { transportMortalities: 0 }, label: "transport" },
  ])("preserves full conflicting $label source versions without choosing a winner", ({ change }) => {
    const a = harvest(); const b = harvest(change);
    const data = source({ harvests: [a, b], catches: [] });
    const actual = row(data);
    expect(actual.events).toHaveLength(1);
    expect(actual.events[0]).toMatchObject({ id: 10, eligible: false, loadedBirds: null,
      loadedKg: null, deliveredBirds: null, deliveredKg: null, transportMortality: null });
    expect(actual.events[0].sourceVersions).toEqual(expect.arrayContaining([a, b]));
    expect(actual.metrics).toMatchObject({ reviewedEventCount: 1, eligibleEventCount: 0,
      excludedEventCount: 1, loadedBirds: null });
    expect(report(data)).toEqual(report(source({ harvests: [b, a], catches: [] })));
  });

  it("ownership conflicts never allocate quantities twice, and summary reviews/excludes the unique ID once", () => {
    const a = harvest(); const b = harvest({ flockId: 2 });
    const actual = report(source({ flocks: [flock(), flock({ id: 2, houseId: 2 })],
      harvests: [a, b, harvest({ id: 11, flockId: 2, chickenCountLoaded: 30, totalLoadedWeightKg: 60 })], catches: [] }));
    expect(actual.rows[0].metrics.loadedBirds).toBeNull();
    expect(actual.rows[1].metrics.loadedBirds).toBe(30);
    expect(actual.rows.every(r => r.events.find(event => event.id === 10)?.eligible === false)).toBe(true);
    expect(actual.rows[0].events[0].sourceVersions).toEqual(actual.rows[1].events[0].sourceVersions);
    expect(actual.rows[0].events[0].sourceVersions).not.toBe(actual.rows[1].events[0].sourceVersions);
    expect(actual.summary).toMatchObject({ reviewedEventCount: 2, eligibleEventCount: 1,
      excludedEventCount: 1, loadedBirds: 30, loadedKg: 60 });
    expect(messages(actual.summary)).toMatch(/Partial recorded-only/);
  });

  it.each([
    { label: "non-completed", catches: [session({ status: "in_progress" })] },
    { label: "cancelled", catches: [session({ status: "cancelled" })] },
    { label: "planned", catches: [session({ status: "planned" })] },
    { label: "wrong-flock", catches: [session({ flockId: 999 })] },
    { label: "multiple", catches: [session(), session({ id: 21 })] },
    { label: "conflicting status", catches: [session(), session({ status: "draft" })] },
    { label: "conflicting catch date", catches: [session(), session({ catchDate: null })] },
    { label: "conflicting catch owner", catches: [session(), session({ flockId: 2 })] },
    { label: "conflicting harvest link", catches: [session(), session({ harvestRecordId: 999 })] },
    { label: "invalid catch ID", catches: [session({ id: 0 })] },
  ])("excludes $label linkage and preserves raw catch versions as reconciliation only", ({ catches }) => {
    const actual = row(source({ catches }));
    expect(actual.events[0].eligible).toBe(false);
    expect(actual.metrics).toMatchObject({ loadedBirds: null, loadedKg: null,
      deliveredBirds: null, transportMortality: null, excludedEventCount: 1 });
    expect(actual.catchExceptions.length).toBeGreaterThan(0);
    expect(actual.catchExceptions.flatMap(item => item.sourceVersions)).toEqual(expect.arrayContaining(catches));
    expect(messages(actual.metrics)).toMatch(/reconciliation/);
  });

  it("validates external-flock catches referenced by selected harvest even with a flock filter", () => {
    const actual = row(source({ catches: [session({ flockId: 999 })] }), { flockId: 1 });
    expect(actual.events[0].eligible).toBe(false);
    expect(actual.catchExceptions[0].sourceVersions[0].flockId).toBe(999);
    expect(messages(actual.events[0])).toMatch(/flock mismatch/);
  });

  it("a conflicting catch ID referencing two different harvests excludes both canonical events", () => {
    const catches = [session(), session({ harvestRecordId: 11 })];
    const actual = row(source({ harvests: [harvest(), harvest({ id: 11 })], catches }));
    expect(actual.events.map(event => event.eligible)).toEqual([false, false]);
    expect(actual.metrics.loadedBirds).toBeNull();
    expect(actual.catchExceptions).toHaveLength(1);
    expect(actual.catchExceptions[0].harvestRecordId).toBeNull();
    expect(actual.catchExceptions[0].sourceVersions).toEqual(expect.arrayContaining(catches));
  });

  it.each([null, 999, 0])("completed catch with missing/unknown harvest link %s never supplies quantities", harvestRecordId => {
    const actual = row(source({ harvests: [], catches: [session({ harvestRecordId })] }));
    expect(actual.events).toEqual([]);
    expect(actual.metrics).toMatchObject({ reviewedEventCount: 0, eligibleEventCount: 0, loadedBirds: null,
      loadedKg: null, deliveredBirds: null, transportMortality: null });
    expect(actual.catchExceptions).toHaveLength(1);
    expect(actual.catchExceptions[0]).toMatchObject({ sessionId: 20, harvestRecordId,
      reason: expect.stringMatching(/no valid harvest source linkage/) });
  });

  it("deduplicates exact orphan catch IDs but retains every raw version and summary exception count once", () => {
    const orphan = session({ harvestRecordId: null });
    const actual = report(source({ harvests: [], catches: [orphan, { ...orphan }] }));
    expect(actual.rows[0].catchExceptions).toHaveLength(1);
    expect(actual.rows[0].catchExceptions[0].sourceVersions).toHaveLength(2);
    expect(actual.summary).toMatchObject({ catchExceptionCount: 1, loadedBirds: null });
  });

  it("does not fuzzy-link same-day orphan catch to unlinked recorded harvest", () => {
    const actual = row(source({ catches: [session({ harvestRecordId: null })] }));
    expect(actual.events[0].sessionIds).toEqual([]);
    expect(actual.events[0].eligible).toBe(true);
    expect(actual.metrics.loadedBirds).toBe(100);
    expect(actual.catchExceptions).toHaveLength(1);
    expect(messages(actual.metrics)).toMatch(/Partial\/reconciliation/);
  });

  it("scopes orphan exceptions by selected catch period or ambiguous date; noncompleted work supplies nothing", () => {
    const actual = row(source({ harvests: [], catches: [
      session({ id: 20, harvestRecordId: null, catchDate: "2026-10-31" }),
      session({ id: 21, harvestRecordId: null, catchDate: "2026-11-06" }),
      session({ id: 22, harvestRecordId: null, catchDate: "2026-11-01" }),
      session({ id: 23, harvestRecordId: null, catchDate: null }),
      session({ id: 24, harvestRecordId: null, catchDate: "bad" }),
      session({ id: 25, harvestRecordId: null, status: "in_progress" }),
    ] }));
    expect(actual.catchExceptions.map(item => item.sessionId)).toEqual([22, 23, 24]);
    expect(actual.metrics.loadedBirds).toBeNull();
  });

  it.each([null, "bad", "2026-02-30", "2026-11-06", "2026-10-31"])(
    "catch date %s warns but valid harvest operational date scopes the event", catchDate => {
      const actual = row(source({ catches: [session({ catchDate })] }));
      expect(actual.events[0]).toMatchObject({ date: "2026-11-04", eligible: true });
      expect(actual.metrics.loadedBirds).toBe(100);
      expect(actual.catchExceptions).toHaveLength(1);
      expect(actual.catchExceptions[0].reason).toMatch(/harvest operational date alone/);
      expect(actual.catchExceptions[0].reason).not.toMatch(/no valid harvest source linkage/);
    },
  );

  it.each(["2026-10-31", "2026-11-06"])(
    "valid linked harvest dated %s outside the selected period is not falsely missing/invalid", harvestDate => {
      const actual = row(source({ flocks: [flock({ placementDate: "2026-10-01" })],
        harvests: [harvest({ harvestDate })], catches: [session()] }));
      expect(actual.events).toEqual([]);
      expect(actual.catchExceptions).toEqual([]);
      expect(actual.metrics.loadedBirds).toBeNull();
      expect(messages(actual)).toMatch(/valid linked harvest.*outside the selected period/);
      expect(messages(actual)).not.toMatch(/no valid harvest source linkage/);
    },
  );

  it("known harvests outside S..E are not reviewed results or invalid metric contributors", () => {
    const actual = row(source({ flocks: [flock({ placementDate: "2026-10-01" })], harvests: [
      harvest({ id: 10, harvestDate: "2026-10-31", chickenCountLoaded: -1 }),
      harvest({ id: 11, harvestDate: "2026-11-06", totalLoadedWeightKg: -1 }),
      harvest({ id: 12, harvestDate: "2026-11-01" }),
      harvest({ id: 13, harvestDate: "2026-11-05" }),
    ], catches: [] }));
    expect(actual.events.map(event => event.id)).toEqual([12, 13]);
    expect(actual.metrics).toMatchObject({ eligibleEventCount: 2, reviewedEventCount: 2,
      excludedEventCount: 0, loadedBirds: 200 });
    expect(messages(actual)).not.toMatch(/Harvest 10:|Harvest 11:/);
  });

  it("preserves pre-placement harvest review but never lets it contribute quantities", () => {
    const actual = row(source({ harvests: [harvest({ id: 9, harvestDate: "2026-10-31" }), harvest()], catches: [] }));
    expect(actual.events.map(event => [event.id, event.eligible, event.inPeriod])).toEqual([
      [9, false, false], [10, true, true],
    ]);
    expect(actual.metrics).toMatchObject({ reviewedEventCount: 2, eligibleEventCount: 1,
      excludedEventCount: 1, loadedBirds: 100 });
    expect(messages(actual)).toMatch(/before placement/);
    expect(messages(actual.metrics)).toMatch(/Partial recorded-only/);
  });

  it.each([null, "bad", "", "2026-02-30", "2026-11-04T00:00:00Z"])(
    "unknown harvest date %s is excluded ambiguous review and partial, not a fabricated event date", harvestDate => {
      const actual = row(source({ harvests: [harvest(), harvest({ id: 11, harvestDate })], catches: [] }));
      expect(actual.events[1]).toMatchObject({ id: 11, date: null, inPeriod: false, eligible: false,
        averageLoadedKg: null, massLossKg: null });
      expect(actual.events[1].sourceVersions[0].harvestDate).toBe(harvestDate);
      expect(actual.metrics).toMatchObject({ reviewedEventCount: 2, excludedEventCount: 1, loadedBirds: 100 });
      expect(messages(actual.metrics)).toMatch(/ambiguous dates cannot prove period completeness/);
    },
  );

  it("all-unknown dates have no observations and missing links to undated harvest are reconciliation only", () => {
    const actual = row(source({ harvests: [harvest({ harvestDate: null })] }));
    expect(actual.metrics).toMatchObject({ loadedBirds: null, deliveredKg: null,
      eligibleEventCount: 0, excludedEventCount: 1 });
    expect(actual.catchExceptions[0].reason).toMatch(/no valid harvest source linkage/);
  });

  it("no-event flocks stay visible with all metrics N/A and selected-flock summary coverage warning", () => {
    const actual = report(source({ flocks: [flock(), flock({ id: 2, houseId: 2 })] }));
    const empty = actual.rows[1];
    expect(empty.events).toEqual([]);
    expect(empty.metrics).toMatchObject({ reviewedEventCount: 0, eligibleEventCount: 0,
      excludedEventCount: 0, loadedBirds: null, loadedKg: null, deliveredBirds: null,
      deliveredKg: null, averageLoadedKg: null, averageDeliveredKg: null,
      massLossKg: null, massLossPct: null, transportMortality: null });
    expect(messages(empty)).toMatch(/N\/A, not fabricated zero/);
    expect(actual.summary.loadedBirds).toBe(100);
    expect(messages(actual.summary)).toMatch(/Partial selected-flock coverage: 1\/2/);
  });

  it("missing actual deliveries remain N/A, never loaded/session/planned/stored-average/shrinkage fallbacks", () => {
    const record = { ...harvest({ chickenCountDelivered: null, totalDeliveredWeightKg: null }),
      averageLoadedWeightKg: 999, averageDeliveredWeightKg: 999, shrinkage: 5.5, plannedBirds: 900,
      plannedWeightKg: 900, invoiceWeightKg: 900 };
    const catchRecord = { ...session(), totalBirds: 900, totalWeightKg: 900, birdsDelivered: 900 };
    const actual = row(source({ harvests: [record], catches: [catchRecord] }));
    expect(actual.events[0].eligible).toBe(true);
    expect(actual.metrics).toMatchObject({ loadedBirds: 100, loadedKg: 250, averageLoadedKg: 2.5,
      deliveredBirds: null, deliveredKg: null, averageDeliveredKg: null, massLossKg: null,
      massLossPct: null, transportMortality: 2 });
    expect(actual.metrics.coverage).toMatchObject({ loadedAveragePairs: 1, deliveredBirdEvents: 0,
      deliveredKgEvents: 0, deliveredAveragePairs: 0, massLossPairs: 0 });
    expect(messages(actual.metrics)).toMatch(/Partial actual delivered birds: 0\/1/);
    expect(actual.events[0].sourceVersions[0]).not.toHaveProperty("invoiceWeightKg");
  });

  it("computes independent metric subtotals and weighted averages from precisely matched populations", () => {
    const data = source({ catches: [], harvests: [
      harvest({ id: 10, chickenCountLoaded: 100, totalLoadedWeightKg: 200,
        chickenCountDelivered: 90, totalDeliveredWeightKg: 180, transportMortalities: 0 }),
      harvest({ id: 11, chickenCountLoaded: 10, totalLoadedWeightKg: 50,
        chickenCountDelivered: 5, totalDeliveredWeightKg: 30, transportMortalities: 1 }),
      harvest({ id: 12, chickenCountLoaded: 1000, totalLoadedWeightKg: null,
        chickenCountDelivered: null, totalDeliveredWeightKg: 100, transportMortalities: null }),
      harvest({ id: 13, chickenCountLoaded: null, totalLoadedWeightKg: 400,
        chickenCountDelivered: 2000, totalDeliveredWeightKg: null, transportMortalities: 2 }),
      harvest({ id: 14, chickenCountLoaded: 0, totalLoadedWeightKg: 1000,
        chickenCountDelivered: 0, totalDeliveredWeightKg: 900, transportMortalities: 0 }),
    ] });
    const actual = row(data).metrics;
    expect(actual).toMatchObject({ reviewedEventCount: 5, eligibleEventCount: 5,
      excludedEventCount: 0, loadedBirds: 1110, loadedKg: 1650,
      deliveredBirds: 2095, deliveredKg: 1210, transportMortality: 3,
      coverage: { loadedBirdEvents: 4, loadedKgEvents: 4, loadedAveragePairs: 2,
        deliveredBirdEvents: 4, deliveredKgEvents: 4, deliveredAveragePairs: 2,
        massLossPairs: 3, transportMortalityEvents: 4 } });
    expect(actual.averageLoadedKg).toBeCloseTo((200 + 50) / (100 + 10));
    expect(actual.averageDeliveredKg).toBeCloseTo((180 + 30) / (90 + 5));
    expect(actual.massLossKg).toBe((200 + 50 + 1000) - (180 + 30 + 900));
    expect(actual.massLossPct).toBeCloseTo(100 * ((200 + 50 + 1000) - (180 + 30 + 900)) / (200 + 50 + 1000));
    expect(actual.averageLoadedKg).not.toBe((2 + 5) / 2);
    expect(messages(actual)).toMatch(/Partial loaded birds: 4\/5/);
    expect(messages(actual)).toMatch(/paired coverage: 2\/5/);
    expect(messages(actual)).toMatch(/Partial mass-loss paired coverage: 3\/5/);
  });

  it("does not pair unmatched loaded and delivered fields from different events", () => {
    const actual = row(source({ catches: [], harvests: [
      harvest({ id: 10, chickenCountLoaded: 100, totalLoadedWeightKg: null, totalDeliveredWeightKg: 200 }),
      harvest({ id: 11, chickenCountLoaded: null, totalLoadedWeightKg: 300, totalDeliveredWeightKg: null }),
    ] })).metrics;
    expect(actual.loadedBirds).toBe(100);
    expect(actual.loadedKg).toBe(300);
    expect(actual.averageLoadedKg).toBeNull();
    expect(actual.massLossKg).toBeNull();
    expect(actual.massLossPct).toBeNull();
    expect(actual.coverage.massLossPairs).toBe(0);
  });

  it("mass-loss pairs need weights only, not bird counts, and weights/count metrics remain independent", () => {
    const actual = row(source({ harvests: [harvest({ chickenCountLoaded: null, chickenCountDelivered: null })] }));
    expect(actual.events[0].eligible).toBe(true);
    expect(actual.metrics).toMatchObject({ loadedBirds: null, loadedKg: 250,
      averageLoadedKg: null, deliveredBirds: null, deliveredKg: 237.5,
      averageDeliveredKg: null, massLossKg: 12.5, massLossPct: 5 });
    expect(actual.metrics.coverage.massLossPairs).toBe(1);
  });

  it("preserves negative loss, overdelivery and transport zero; never clamps or infers/subtracts deaths", () => {
    const actual = row(source({ harvests: [harvest({ chickenCountLoaded: 100,
      chickenCountDelivered: 110, totalLoadedWeightKg: 200, totalDeliveredWeightKg: 220,
      transportMortalities: 0 })] }));
    expect(actual.events[0]).toMatchObject({ loadedBirds: 100, deliveredBirds: 110,
      averageLoadedKg: 2, averageDeliveredKg: 2, massLossKg: -20, massLossPct: -10, transportMortality: 0 });
    expect(actual.metrics).toMatchObject({ loadedBirds: 100, deliveredBirds: 110,
      massLossKg: -20, massLossPct: -10, transportMortality: 0 });
    expect(messages(actual)).toMatch(/Negative recorded/);
    expect(messages(actual)).toMatch(/delivered birds exceed loaded/);
    expect(messages(actual)).toMatch(/schema default cannot prove/);
    const positiveDeath = row(source({ harvests: [harvest({ transportMortalities: 20 })] }));
    expect(positiveDeath.metrics.deliveredBirds).toBe(95);
    expect(positiveDeath.metrics.loadedBirds).toBe(100);
    expect(positiveDeath.metrics.transportMortality).toBe(20);
  });

  it("recorded zero bird counts remain zero observations while paired averages are N/A", () => {
    const actual = row(source({ harvests: [harvest({ chickenCountLoaded: "000", chickenCountDelivered: " 0 " })] }));
    expect(actual.events[0]).toMatchObject({ loadedBirds: 0, deliveredBirds: 0,
      averageLoadedKg: null, averageDeliveredKg: null });
    expect(actual.metrics).toMatchObject({ loadedBirds: 0, deliveredBirds: 0, averageLoadedKg: null,
      averageDeliveredKg: null, massLossKg: 12.5, coverage: { loadedBirdEvents: 1,
        deliveredBirdEvents: 1, loadedAveragePairs: 0, deliveredAveragePairs: 0 } });
  });

  it.each([
    null, "", " ", "bad", "Infinity", "NaN", "0x10", "1e2", "1e-400", "1.0", "+1", "-0", "1_000",
    "9007199254740991.1", "1.000000000000000000001", "0." + "0".repeat(400) + "1",
    -1, 1.2, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1,
  ])("rejects original malformed/rounded/underflow bird count %s for all independent count fields", value => {
    const actual = row(source({ harvests: [harvest({ chickenCountLoaded: value,
      chickenCountDelivered: value, transportMortalities: value })] }));
    expect(actual.events[0].eligible).toBe(true);
    expect(actual.events[0]).toMatchObject({ loadedBirds: null, deliveredBirds: null, transportMortality: null });
    expect(actual.metrics).toMatchObject({ loadedBirds: null, deliveredBirds: null,
      transportMortality: null, loadedKg: 250, deliveredKg: 237.5, massLossKg: 12.5 });
    expect(actual.events[0].sourceVersions[0].chickenCountLoaded).toEqual(value);
  });

  it.each([" 00012 ", "12", 12, Number.MAX_SAFE_INTEGER, "9007199254740991"])(
    "accepts valid safe integer count %s with whitespace/leading zeros allowed", value => {
      expect(row(source({ harvests: [harvest({ chickenCountLoaded: value })] })).events[0].loadedBirds).toBe(Number(value));
    },
  );

  it.each([
    null, "", " ", "bad", "Infinity", "NaN", "0x10", "1e2", "1e-400", "+1", "-1", "1,000", "1_000",
    "0." + "0".repeat(400) + "1", "9007199254740991.000000001", "9007199254740992", "9".repeat(400),
    -1, 0, "0.000", Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1,
  ])("rejects original malformed/zero/underflow/unsafe kg %s independently and preserves raw", value => {
    const actual = row(source({ harvests: [harvest({ totalLoadedWeightKg: value, totalDeliveredWeightKg: value })] }));
    expect(actual.events[0].eligible).toBe(true);
    expect(actual.events[0]).toMatchObject({ loadedKg: null, deliveredKg: null,
      averageLoadedKg: null, averageDeliveredKg: null, massLossKg: null, massLossPct: null });
    expect(actual.metrics).toMatchObject({ loadedBirds: 100, loadedKg: null, deliveredBirds: 95,
      deliveredKg: null, averageLoadedKg: null, averageDeliveredKg: null, massLossKg: null });
    expect(actual.events[0].sourceVersions[0].totalLoadedWeightKg).toEqual(value);
  });

  it.each([" 000250.123 ", "250", "250.", ".125", "0.001", 250.123, "9007199254740991.000"])(
    "accepts positive decimal kg %s without integer-only weight restrictions", value => {
      expect(row(source({ harvests: [harvest({ totalLoadedWeightKg: value })] })).events[0].loadedKg).toBe(Number(value));
    },
  );

  it("all-invalid respective metrics have null subtotals despite eligible events and valid other observations", () => {
    const actual = row(source({ catches: [], harvests: [
      harvest({ id: 10, chickenCountLoaded: null, totalDeliveredWeightKg: null }),
      harvest({ id: 11, chickenCountLoaded: -1, totalDeliveredWeightKg: 0 }),
    ] })).metrics;
    expect(actual).toMatchObject({ eligibleEventCount: 2, excludedEventCount: 0,
      loadedBirds: null, loadedKg: 500, deliveredBirds: 190, deliveredKg: null,
      averageLoadedKg: null, averageDeliveredKg: null, massLossKg: null,
      coverage: { loadedBirdEvents: 0, loadedKgEvents: 2, deliveredKgEvents: 0 } });
    expect(messages(actual)).toMatch(/0\/2 eligible events/);
  });

  it("excluded events supply no metric quantity even if all their fields are numerically valid", () => {
    const actual = row(source({ harvests: [harvest(), harvest({ id: 11, chickenCountLoaded: 999,
      totalLoadedWeightKg: 999, chickenCountDelivered: 999, totalDeliveredWeightKg: 999, transportMortalities: 999 })],
      catches: [session(), session({ id: 21, harvestRecordId: 11, status: "draft" })] }));
    expect(actual.metrics).toMatchObject({ reviewedEventCount: 2, eligibleEventCount: 1,
      excludedEventCount: 1, loadedBirds: 100, loadedKg: 250, deliveredBirds: 95,
      deliveredKg: 237.5, transportMortality: 2,
      coverage: { loadedBirdEvents: 1, loadedKgEvents: 1, massLossPairs: 1 } });
    expect(messages(actual.metrics)).toMatch(/Partial recorded-only[\s\S]*1 unique reviewed/);
  });

  it("summary aggregates deduplicated events using paired sums, never flock ratios", () => {
    const a = harvest({ chickenCountLoaded: 100, totalLoadedWeightKg: 200,
      chickenCountDelivered: 90, totalDeliveredWeightKg: 180 });
    const b = harvest({ id: 11, flockId: 2, chickenCountLoaded: 10, totalLoadedWeightKg: 50,
      chickenCountDelivered: 5, totalDeliveredWeightKg: 25 });
    const actual = report(source({ flocks: [flock(), flock({ id: 2, houseId: 2 })],
      harvests: [a, { ...a }, b], catches: [session(), session({ id: 21, flockId: 2, harvestRecordId: 11 })] }));
    expect(actual.summary).toMatchObject({ flockCount: 2, reviewedEventCount: 2, eligibleEventCount: 2,
      loadedBirds: 110, loadedKg: 250, deliveredBirds: 95, deliveredKg: 205,
      massLossKg: 45, transportMortality: 4, catchExceptionCount: 0 });
    expect(actual.summary.averageLoadedKg).toBeCloseTo(250 / 110);
    expect(actual.summary.averageDeliveredKg).toBeCloseTo(205 / 95);
    expect(actual.summary.massLossPct).toBeCloseTo(100 * 45 / 250);
    expect(actual.summary.averageLoadedKg).not.toBe((2 + 5) / 2);
    expect(actual.summary.massLossPct).not.toBe((10 + 50) / 2);
    expect(actual.summary.coverage).toMatchObject({ loadedAveragePairs: 2, deliveredAveragePairs: 2, massLossPairs: 2 });
  });

  it("summary recomputes valid pairs across partial flocks rather than dividing unmatched totals", () => {
    const actual = report(source({ flocks: [flock(), flock({ id: 2, houseId: 2 })], catches: [], harvests: [
      harvest({ chickenCountLoaded: 100, totalLoadedWeightKg: 200 }),
      harvest({ id: 11, flockId: 2, chickenCountLoaded: 1000, totalLoadedWeightKg: null }),
      harvest({ id: 12, flockId: 2, chickenCountLoaded: null, totalLoadedWeightKg: 500 }),
    ] }));
    expect(actual.summary).toMatchObject({ loadedBirds: 1100, loadedKg: 700,
      averageLoadedKg: 2, coverage: { loadedAveragePairs: 1, loadedBirdEvents: 2, loadedKgEvents: 2 } });
    expect(messages(actual.summary)).toMatch(/Partial.*1\/3/);
  });

  it("summary counts shared conflicted-catch exceptions once across selected flocks", () => {
    const actual = report(source({ flocks: [flock(), flock({ id: 2, houseId: 2 })], harvests: [],
      catches: [session({ harvestRecordId: null }), session({ flockId: 2, harvestRecordId: null })] }));
    expect(actual.rows.map(r => r.catchExceptions.length)).toEqual([1, 1]);
    expect(actual.summary.catchExceptionCount).toBe(1);
    expect(actual.summary.loadedBirds).toBeNull();
  });

  it("guards count and kg sums and paired ratios without poisoning unrelated metric subtotals", () => {
    const actual = row(source({ catches: [], harvests: [
      harvest({ id: 10, chickenCountLoaded: Number.MAX_SAFE_INTEGER, totalLoadedWeightKg: Number.MAX_SAFE_INTEGER,
        chickenCountDelivered: 10, totalDeliveredWeightKg: 20, transportMortalities: Number.MAX_SAFE_INTEGER }),
      harvest({ id: 11, chickenCountLoaded: 1, totalLoadedWeightKg: 1,
        chickenCountDelivered: 10, totalDeliveredWeightKg: 20, transportMortalities: 1 }),
    ] })).metrics;
    expect(actual).toMatchObject({ loadedBirds: null, loadedKg: null, averageLoadedKg: null,
      deliveredBirds: 20, deliveredKg: 40, averageDeliveredKg: 2,
      massLossKg: null, massLossPct: null, transportMortality: null });
    expect(messages(actual)).toMatch(/safe numeric sum precision/);
    expect(messages(actual)).toMatch(/paired sums exceed safe precision/);
  });

  it("guards cross-flock aggregate overflow even when each row sum is safe", () => {
    const actual = report(source({ flocks: [flock(), flock({ id: 2, houseId: 2 })], catches: [], harvests: [
      harvest({ chickenCountLoaded: Number.MAX_SAFE_INTEGER, totalLoadedWeightKg: Number.MAX_SAFE_INTEGER }),
      harvest({ id: 11, flockId: 2, chickenCountLoaded: 1, totalLoadedWeightKg: 1 }),
    ] }));
    expect(actual.rows.map(r => r.metrics.loadedBirds)).toEqual([Number.MAX_SAFE_INTEGER, 1]);
    expect(actual.summary.loadedBirds).toBeNull();
    expect(actual.summary.loadedKg).toBeNull();
    expect(actual.summary.averageLoadedKg).toBeNull();
    expect(actual.summary.deliveredBirds).toBe(190);
  });

  it("guards tiny positive ratios and nonfinite mass percentage while preserving positive actual weights", () => {
    const actual = row(source({ harvests: [harvest({ chickenCountLoaded: 1000,
      totalLoadedWeightKg: Number.MIN_VALUE, totalDeliveredWeightKg: Number.MAX_SAFE_INTEGER })] }));
    expect(actual.events[0].loadedKg).toBe(Number.MIN_VALUE);
    expect(actual.events[0].averageLoadedKg).toBeNull();
    expect(actual.events[0].massLossPct).toBeNull();
    expect(actual.metrics.averageLoadedKg).toBeNull();
    expect(actual.metrics.massLossPct).toBeNull();
    expect(Object.values(actual.metrics).filter(value => typeof value === "number")
      .every(Number.isFinite)).toBe(true);
  });

  it("does not create an unsafe sum by rounding an added decimal fraction at MAX", () => {
    const actual = row(source({ catches: [], harvests: [
      harvest({ id: 10, totalLoadedWeightKg: Number.MAX_SAFE_INTEGER }),
      harvest({ id: 11, totalLoadedWeightKg: 0.001 }),
    ] }));
    expect(actual.metrics.loadedKg).toBeNull();
    expect(actual.metrics.averageLoadedKg).toBeNull();
  });

  it("guards small-fraction plus MAX sum overflow when the smaller event sorts first", () => {
    const actual = row(source({ catches: [], harvests: [
      harvest({ id: 10, totalLoadedWeightKg: 0.001 }),
      harvest({ id: 11, totalLoadedWeightKg: Number.MAX_SAFE_INTEGER }),
    ] }));
    expect(actual.metrics.loadedKg).toBeNull();
    expect(actual.metrics.averageLoadedKg).toBeNull();
    expect(messages(actual.metrics)).toMatch(/exceeds safe numeric sum precision/);
  });

  it("completed catches linked to incompatible out-of-period harvest work remain reconciliation exceptions", () => {
    const actual = row(source({ flocks: [flock({ placementDate: "2026-10-01" })],
      harvests: [harvest({ harvestDate: "2026-11-06" })],
      catches: [session(), session({ id: 21, catchDate: "2026-11-06" })] }));
    expect(actual.events).toEqual([]);
    expect(actual.catchExceptions).toHaveLength(1);
    expect(actual.catchExceptions[0].sessionId).toBe(20);
    expect(actual.catchExceptions[0].reason).toMatch(/no valid harvest source linkage/);
    expect(actual.metrics.loadedBirds).toBeNull();
  });

  it.each([0, -1, 1.5, Number.NaN, Infinity])("invalid harvest source ID %s is review-only and cannot validate a catch", id => {
    const actual = row(source({ harvests: [harvest({ id })], catches: [session({ harvestRecordId: id })] }));
    expect(actual.events[0].eligible).toBe(false);
    expect(actual.metrics.loadedBirds).toBeNull();
    expect(messages(actual)).toMatch(/Invalid harvest source ID/);
  });

  it("sorts houses/flocks, events by date/ID, catch exceptions and raw versions deterministically", () => {
    const data = source({ flocks: [flock({ id: 3, houseId: 2 }), flock({ id: 2 }), flock()],
      harvests: [harvest({ id: 12, harvestDate: null }), harvest({ id: 11, harvestDate: "2026-11-03" }),
        harvest({ id: 10, harvestDate: "2026-11-03" }), harvest({ id: 13, harvestDate: "2026-11-01" })],
      catches: [session({ id: 22, harvestRecordId: null, catchDate: null }),
        session({ id: 21, harvestRecordId: null, catchDate: "2026-11-02" }),
        session({ id: 20, harvestRecordId: null, catchDate: "2026-11-02" })] });
    const actual = report(data);
    expect(actual.rows.map(r => r.flockId)).toEqual([1, 2, 3]);
    expect(actual.rows[0].events.map(event => event.id)).toEqual([13, 10, 11, 12]);
    expect(actual.rows[0].catchExceptions.map(item => item.sessionId)).toEqual([20, 21, 22]);
    expect(actual).toEqual(report({ houses: [...data.houses].reverse(), flocks: [...data.flocks].reverse(),
      harvests: [...data.harvests].reverse(), catches: [...data.catches].reverse() }));
  });
});
