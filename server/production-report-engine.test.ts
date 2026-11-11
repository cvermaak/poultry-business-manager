import { describe, expect, it } from "vitest";
import { buildFlockPerformanceReport } from "./production-report-engine";
import type {
  FlockPerformanceSource,
  ProductionCatchSource,
  ProductionDailySource,
  ProductionHarvestSource,
  ProductionReportFlock,
  ResolvedFlockPerformanceFilters,
} from "../shared/production-reports";

// SYNTHETIC UNIT FIXTURES ONLY. None of these records are real business data,
// historical analysis, seed data, or a claim that existing history was validated.
const GENERATED_AT = "2026-11-08T20:27:00.000Z";
const TIMEZONE = "Africa/Johannesburg";
const FILTERS: ResolvedFlockPerformanceFilters = {
  startDate: "2026-11-01",
  endDate: "2026-11-05",
  houseId: null,
  flockId: null,
};

function flock(
  overrides: Partial<ProductionReportFlock> = {}
): ProductionReportFlock {
  return {
    id: 1,
    flockNumber: "SYNTHETIC-FLOCK-1",
    houseId: 1,
    placementDate: "2026-11-01",
    initialCount: 1000,
    status: "active",
    ...overrides,
  };
}
function daily(
  overrides: Partial<ProductionDailySource> = {}
): ProductionDailySource {
  return {
    id: 1,
    flockId: 1,
    recordDate: "2026-11-01",
    dayNumber: 0,
    mortality: 0,
    averageWeight: null,
    ...overrides,
  };
}
function harvest(
  overrides: Partial<ProductionHarvestSource> = {}
): ProductionHarvestSource {
  return {
    id: 10,
    flockId: 1,
    harvestDate: "2026-11-04",
    chickenCountLoaded: 100,
    ...overrides,
  };
}
function session(
  overrides: Partial<ProductionCatchSource> = {}
): ProductionCatchSource {
  return {
    id: 20,
    flockId: 1,
    catchDate: "2026-11-04",
    harvestRecordId: 10,
    status: "completed",
    ...overrides,
  };
}
function source(
  overrides: Partial<FlockPerformanceSource> = {}
): FlockPerformanceSource {
  return {
    houses: [
      { id: 1, name: "Synthetic House 1", houseNumber: "1" },
      { id: 2, name: "Synthetic House 2", houseNumber: "2" },
    ],
    flocks: [flock()],
    dailyRecords: [daily()],
    harvests: [],
    catches: [],
    ...overrides,
  };
}
function report(
  data = source(),
  filters: Partial<ResolvedFlockPerformanceFilters> = {}
) {
  return buildFlockPerformanceReport(
    data,
    { ...FILTERS, ...filters },
    TIMEZONE,
    GENERATED_AT
  );
}
function row(
  data = source(),
  filters: Partial<ResolvedFlockPerformanceFilters> = {}
) {
  return report(data, filters).rows[0];
}
function messages(value: { issues: string[] }) {
  return value.issues.join("\n");
}

function fullCapture(
  flockId: number,
  mortality: number,
  startId = flockId * 100
): ProductionDailySource[] {
  return [1, 2, 3, 4, 5].map((day, index) =>
    daily({
      id: startId + index,
      flockId,
      recordDate: `2026-11-0${day}`,
      dayNumber: index,
      mortality: index === 0 ? mortality : 0,
    })
  );
}

describe("buildFlockPerformanceReport — pure synthetic unit fixtures", () => {
  it("preserves metadata, copies filters, never mutates its sources, and uses operational dates without timezone shifts", () => {
    const data = source({
      dailyRecords: [
        daily({
          recordDate: "2026-11-01",
          mortality: "0",
          averageWeight: "1.25",
        }),
      ],
    });
    const before = JSON.stringify(data);
    const freezeDeep = (value: unknown) => {
      if (!value || typeof value !== "object" || Object.isFrozen(value)) return;
      Object.freeze(value);
      for (const child of Object.values(value)) freezeDeep(child);
    };
    freezeDeep(data);
    const filters = Object.freeze({ ...FILTERS });
    const result = buildFlockPerformanceReport(
      data,
      filters,
      "Pacific/Kiritimati",
      GENERATED_AT
    );
    expect(JSON.stringify(data)).toBe(before);
    expect(result).toMatchObject({
      kind: "flock-performance",
      timezone: "Pacific/Kiritimati",
      generatedAt: GENERATED_AT,
      filters,
    });
    expect(result.filters).not.toBe(filters);
    expect(result.rows[0]).toMatchObject({
      placementDate: "2026-11-01",
      elapsedDays: 4,
      latestWeightDate: "2026-11-01",
      weightAgeDays: 4,
    });
    expect(result.notes.join(" ")).toMatch(/today's corrected source records/);
    expect(result.notes.join(" ")).toMatch(/not.*historical snapshots/);
    expect(result.notes.join(" ")).toMatch(/not.*validated/);
    expect(result.notes.join(" ")).toMatch(/unrecorded culls, transfers/);
    expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity/);
    expect(result).toEqual(
      buildFlockPerformanceReport(
        data,
        filters,
        "Pacific/Kiritimati",
        GENERATED_AT
      )
    );
  });

  it.each([
    { endDate: "2026-02-30" },
    { endDate: "2026-11-05T00:00:00Z" },
    { startDate: "2026-13-01" },
    { startDate: "2026-11-06" },
    { houseId: 0 },
    { flockId: -1 },
    { houseId: 1.2 },
    { flockId: Number.NaN },
    { flockId: Number.POSITIVE_INFINITY },
    { houseId: Number.MAX_SAFE_INTEGER + 1 },
  ])(
    "rejects malformed/reversed filters before calculation: %j",
    badFilters => {
      expect(() => report(source(), badFilters)).toThrow(/date|integer/);
    }
  );

  it("applies house and flock intersection and only valid placements on/before E; invalid placements remain visible", () => {
    const data = source({
      flocks: [
        flock(),
        flock({ id: 2, houseId: 2 }),
        flock({ id: 3, placementDate: "2026-11-06" }),
        flock({ id: 4, placementDate: "bad" }),
      ],
    });
    expect(report(data).rows.map(item => item.flockId)).toEqual([1, 4, 2]);
    expect(report(data, { houseId: 2 }).rows.map(item => item.flockId)).toEqual(
      [2]
    );
    expect(report(data, { houseId: 1, flockId: 2 }).rows).toEqual([]);
    expect(report(data, { flockId: 4 }).rows[0]).toMatchObject({
      flockId: 4,
      placementDate: null,
      elapsedDays: null,
      cumulativeDeaths: null,
      remainingBirds: null,
    });
    expect(report(data, { flockId: 999 }).summary).toMatchObject({
      flockCount: 0,
      initialBirds: null,
      cumulativeDeaths: null,
    });
  });

  it("includes a placement on E and defines placement day as zero elapsed days", () => {
    expect(
      row(
        source({
          flocks: [flock({ placementDate: "2026-11-05" })],
          dailyRecords: [daily({ recordDate: "2026-11-05" })],
        })
      )
    ).toMatchObject({
      elapsedDays: 0,
      expectedPeriodDays: 1,
      recordedDays: 1,
      missingPeriodDays: 0,
      cumulativeDeaths: 0,
    });
  });

  it("does not reinterpret a completed flock's elapsed time at E as its final slaughter age", () => {
    const data = source({
      flocks: [flock({ status: "completed" })],
      harvests: [harvest()],
      catches: [session()],
    });
    expect(row(data, { endDate: "2026-11-08" })).toMatchObject({
      currentStatus: "completed",
      elapsedDays: 7,
    });
    expect(row(data, { endDate: "2026-11-02" })).toMatchObject({
      currentStatus: "completed",
      elapsedDays: 1,
      loadedBirds: 0,
    });
    expect(report(data).notes.join(" ")).toMatch(
      /not a completed flock's final slaughter age/
    );
  });

  it("separates period activity from prior-record snapshot balances and excludes later records", () => {
    const data = source({
      dailyRecords: [
        daily({ id: 1, mortality: 10, averageWeight: "1.1" }),
        daily({
          id: 2,
          recordDate: "2026-11-02",
          mortality: 5,
          averageWeight: "1.2",
        }),
        daily({ id: 3, recordDate: "2026-11-04", mortality: 2 }),
        daily({
          id: 4,
          recordDate: "2026-11-06",
          mortality: 999,
          averageWeight: "9",
        }),
      ],
      harvests: [
        harvest({ id: 10, harvestDate: "2026-11-02", chickenCountLoaded: 100 }),
        harvest({ id: 11, harvestDate: "2026-11-06", chickenCountLoaded: 900 }),
      ],
      catches: [
        session({ harvestRecordId: 10, catchDate: "2026-11-02" }),
        session({ id: 21, harvestRecordId: 11, catchDate: "2026-11-06" }),
      ],
    });
    const actual = row(data, { startDate: "2026-11-03" });
    expect(actual).toMatchObject({
      periodDeaths: 2,
      cumulativeDeaths: 17,
      loadedBirds: 100,
      remainingBirds: 883,
      latestWeightKg: 1.2,
      latestWeightDate: "2026-11-02",
      weightAgeDays: 3,
      weightOutsidePeriod: true,
      observedGrowthGPerBirdDay: null,
      periodRecordedDays: 1,
      recordedDays: 3,
      expectedPeriodDays: 3,
      missingPeriodDays: 2,
    });
    expect(actual.cumulativeMortalityPct).toBeCloseTo(1.7);
    expect(
      actual.dailyRecords.map(record => [record.id, record.inPeriod])
    ).toEqual([
      [1, false],
      [2, false],
      [3, true],
    ]);
    expect(
      actual.harvestRecords.map(record => [record.id, record.eligible])
    ).toEqual([[10, true]]);
    expect(messages(actual)).toMatch(/outside the selected period/);
    expect(messages(actual)).toMatch(/3 calendar day\(s\) old/);
    expect(actual.catchExceptions).toEqual([]);
  });

  it("supports a blank start from placement, not a fabricated default growth origin", () => {
    const actual = row(
      source({
        dailyRecords: [
          daily({ id: 1, averageWeight: 0.7 }),
          daily({
            id: 2,
            recordDate: "2026-11-05",
            mortality: 5,
            averageWeight: 1.1,
          }),
        ],
      }),
      { startDate: null }
    );
    expect(actual).toMatchObject({
      periodDeaths: 5,
      cumulativeDeaths: 5,
      expectedPeriodDays: 5,
      growthStartWeightKg: 0.7,
      growthEndWeightKg: 1.1,
    });
    expect(actual.observedGrowthGPerBirdDay).toBeCloseTo(100);
  });

  it("counts partial harvest IDs once and never adds catch-session quantities", () => {
    const first = harvest({ chickenCountLoaded: "100" });
    const dailyRow = daily({ mortality: 3 });
    const catchRow = session();
    const actual = row(
      source({
        dailyRecords: [dailyRow, { ...dailyRow }],
        harvests: [
          first,
          { ...first },
          harvest({ id: 11, chickenCountLoaded: 50 }),
        ],
        catches: [
          catchRow,
          { ...catchRow },
          session({ id: 21, harvestRecordId: 11 }),
        ],
      })
    );
    expect(actual).toMatchObject({
      cumulativeDeaths: 3,
      loadedBirds: 150,
      remainingBirds: 847,
    });
    expect(actual.dailyRecords).toHaveLength(1);
    expect(actual.harvestRecords).toHaveLength(2);
    expect(actual.harvestRecords[0].sessionIds).toEqual([20]);
    expect(actual.harvestRecords.every(event => event.eligible)).toBe(true);
    expect(actual.catchExceptions).toEqual([]);
    expect(messages(actual)).toMatch(/Repeated daily source ID/);
    expect(messages(actual)).toMatch(/Repeated harvest source ID/);
  });

  it("preserves separate unlinked same-day partial harvests as recorded, not proven manual", () => {
    const actual = row(
      source({
        harvests: [harvest(), harvest({ id: 11, chickenCountLoaded: 25 })],
      })
    );
    expect(actual).toMatchObject({ loadedBirds: 125, remainingBirds: 875 });
    expect(actual.harvestRecords.map(event => event.classification)).toEqual([
      "Recorded harvest — completion status unavailable",
      "Recorded harvest — completion status unavailable",
    ]);
    expect(messages(actual)).toMatch(
      /does not prove manual entry or historical uniqueness/
    );
    expect(actual.harvestRecords[0].sessionIds).toEqual([]);
  });

  it.each([
    { label: "non-completed", catches: [session({ status: "in_progress" })] },
    { label: "cancelled", catches: [session({ status: "cancelled" })] },
    { label: "mismatched flock", catches: [session({ flockId: 2 })] },
    { label: "multiple links", catches: [session(), session({ id: 21 })] },
    {
      label: "conflicting same session ID",
      catches: [session(), session({ status: "draft" })],
    },
  ])(
    "excludes $label harvest linkage and exposes stable exception IDs without a confident balance",
    ({ catches }) => {
      const actual = row(source({ harvests: [harvest()], catches }));
      expect(actual).toMatchObject({
        loadedBirds: 0,
        remainingBirds: null,
        summaryEligible: false,
      });
      expect(actual.harvestRecords[0]).toMatchObject({
        id: 10,
        eligible: false,
      });
      expect(
        actual.catchExceptions.some(
          exception =>
            exception.sessionId === 20 && exception.harvestRecordId === 10
        )
      ).toBe(true);
      expect(messages(actual)).toMatch(/reconciliation/);
    }
  );

  it.each([null, 999])(
    "completed catch with absent/invalid harvest link %s makes remaining birds N/A",
    harvestRecordId => {
      const actual = row(source({ catches: [session({ harvestRecordId })] }));
      expect(actual).toMatchObject({
        loadedBirds: 0,
        remainingBirds: null,
        summaryEligible: false,
      });
      expect(actual.catchExceptions).toEqual([
        expect.objectContaining({
          sessionId: 20,
          harvestRecordId,
          reason: expect.stringContaining("no valid eligible harvest link"),
        }),
      ]);
    }
  );

  it("ignores future orphan catches for a historical end, but flags undated completed catches", () => {
    const future = row(
      source({
        catches: [session({ harvestRecordId: null, catchDate: "2026-11-06" })],
      })
    );
    expect(future.remainingBirds).toBe(1000);
    expect(future.catchExceptions).toEqual([]);
    const undated = row(
      source({
        catches: [session({ harvestRecordId: null, catchDate: "invalid" })],
      })
    );
    expect(undated.remainingBirds).toBeNull();
    expect(undated.catchExceptions[0].date).toBeNull();
  });

  it("excludes wholly future conflicting source IDs from as-of population and details instead of inventing undated exceptions", () => {
    const actual = report(
      source({
        flocks: [
          flock(),
          flock({ id: 2, placementDate: "2026-11-06" }),
          flock({ id: 2, placementDate: "2026-11-07" }),
        ],
        dailyRecords: [
          daily(),
          daily({ id: 2, recordDate: "2026-11-06", mortality: 5 }),
          daily({ id: 2, recordDate: "2026-11-07", mortality: 7 }),
        ],
        harvests: [
          harvest({ harvestDate: "2026-11-06" }),
          harvest({ harvestDate: "2026-11-07" }),
        ],
        catches: [
          session({ catchDate: "2026-11-06", harvestRecordId: null }),
          session({ catchDate: "2026-11-07", harvestRecordId: null }),
        ],
      })
    );
    expect(actual.rows).toHaveLength(1);
    expect(actual.rows[0]).toMatchObject({
      cumulativeDeaths: 0,
      loadedBirds: 0,
      remainingBirds: 1000,
    });
    expect(actual.rows[0].dailyRecords.map(record => record.id)).toEqual([1]);
    expect(actual.rows[0].harvestRecords).toEqual([]);
    expect(actual.rows[0].catchExceptions).toEqual([]);
  });

  it("non-completed catches without a harvest are not phantom loaded movements", () => {
    const actual = row(
      source({
        catches: [session({ harvestRecordId: null, status: "planned" })],
      })
    );
    expect(actual).toMatchObject({ loadedBirds: 0, remainingBirds: 1000 });
    expect(actual.catchExceptions).toEqual([]);
  });

  it("uses harvest operational date, not catch date, as the canonical event scope", () => {
    const actual = row(
      source({
        harvests: [harvest()],
        catches: [session({ catchDate: "2026-11-06" })],
      })
    );
    expect(actual).toMatchObject({ loadedBirds: 100, remainingBirds: 900 });
    const futureHarvest = row(
      source({
        harvests: [harvest({ harvestDate: "2026-11-06" })],
        catches: [session()],
      })
    );
    expect(futureHarvest).toMatchObject({
      loadedBirds: 0,
      remainingBirds: null,
    });
    expect(futureHarvest.catchExceptions[0].reason).toMatch(
      /no valid eligible harvest link/
    );
  });

  it("flags a linked catch's invalid date but does not shift or replace the valid harvest event date", () => {
    const actual = row(
      source({
        harvests: [harvest()],
        catches: [session({ catchDate: "2026-02-30" })],
      })
    );
    expect(actual).toMatchObject({ loadedBirds: 100, remainingBirds: 900 });
    expect(actual.catchExceptions[0]).toMatchObject({
      sessionId: 20,
      harvestRecordId: 10,
      date: null,
      reason: expect.stringContaining("harvest operational date alone"),
    });
  });

  it("keeps preplacement reconciliation details but excludes future harvest details and future invalid counts", () => {
    const actual = row(
      source({
        harvests: [
          harvest({
            id: 10,
            harvestDate: "2026-10-31",
            chickenCountLoaded: 50,
          }),
          harvest({
            id: 11,
            harvestDate: "2026-11-06",
            chickenCountLoaded: -1,
          }),
          harvest({ id: 12, chickenCountLoaded: 25 }),
        ],
      })
    );
    expect(actual).toMatchObject({ loadedBirds: 25, remainingBirds: null });
    expect(
      actual.harvestRecords.map(event => [event.id, event.eligible])
    ).toEqual([
      [10, false],
      [12, true],
    ]);
    expect(messages(actual)).toMatch(/before placement/);
    expect(messages(actual)).not.toMatch(/Harvest 11:/);
    const onlyFuture = row(
      source({
        harvests: [
          harvest({ harvestDate: "2026-11-06", chickenCountLoaded: -1 }),
        ],
      })
    );
    expect(onlyFuture).toMatchObject({ loadedBirds: 0, remainingBirds: 1000 });
    expect(onlyFuture.harvestRecords).toEqual([]);
  });

  it.each([null, "not-a-date", "2026-02-30"])(
    "keeps undated/invalid dated harvest %s visible and makes loaded and balance unknown",
    harvestDate => {
      const actual = row(source({ harvests: [harvest({ harvestDate })] }));
      expect(actual).toMatchObject({ loadedBirds: null, remainingBirds: null });
      expect(actual.harvestRecords[0]).toMatchObject({
        id: 10,
        date: null,
        eligible: false,
      });
      expect(messages(actual)).toMatch(/harvest operational date/);
    }
  );

  it.each([-1, 1.5, null, "", "bad", "Infinity", Number.MAX_SAFE_INTEGER + 1])(
    "does not turn invalid loaded bird count %s into zero",
    chickenCountLoaded => {
      const actual = row(
        source({ harvests: [harvest({ chickenCountLoaded })] })
      );
      expect(actual).toMatchObject({
        loadedBirds: null,
        remainingBirds: null,
        summaryEligible: false,
      });
      expect(actual.harvestRecords[0]).toMatchObject({
        eligible: false,
        loadedBirds: null,
      });
    }
  );

  it("does not choose an arbitrary source version for a repeated conflicting harvest ID", () => {
    const a = harvest();
    const b = harvest({ chickenCountLoaded: 200 });
    const result = row(source({ harvests: [a, b] }));
    expect(result).toMatchObject({ loadedBirds: null, remainingBirds: null });
    expect(result.harvestRecords).toHaveLength(1);
    expect(row(source({ harvests: [b, a] })).loadedBirds).toBeNull();
  });

  it("makes negative recorded balance N/A, retaining raw negative value/components in the warning rather than zero clamping", () => {
    const actual = row(
      source({
        flocks: [flock({ initialCount: 100 })],
        dailyRecords: [daily({ mortality: 20 })],
        harvests: [harvest({ chickenCountLoaded: 90 })],
      })
    );
    expect(actual).toMatchObject({
      initialBirds: 100,
      cumulativeDeaths: 20,
      loadedBirds: 90,
      remainingBirds: null,
      summaryEligible: false,
    });
    expect(messages(actual)).toMatch(
      /Negative recorded remaining balance -10 birds = initial 100 - recorded deaths 20 - eligible loaded 90/
    );
    expect(actual.dailyRecords[0].mortality).toBe(20);
    expect(actual.harvestRecords[0].loadedBirds).toBe(90);
    expect(
      report(
        source({
          flocks: [flock({ initialCount: 100 })],
          dailyRecords: [daily({ mortality: 20 })],
          harvests: [harvest({ chickenCountLoaded: 90 })],
        })
      ).summary.remainingBirds
    ).toBeNull();
  });

  it("keeps a real recorded zero distinct from absence of any daily capture", () => {
    const zero = row();
    expect(zero).toMatchObject({
      cumulativeDeaths: 0,
      periodDeaths: 0,
      cumulativeMortalityPct: 0,
      remainingBirds: 1000,
      recordedDays: 1,
      missingPeriodDays: 4,
    });
    expect(messages(zero)).toMatch(/missing capture is unknown/);
    const absent = row(source({ dailyRecords: [] }));
    expect(absent).toMatchObject({
      cumulativeDeaths: null,
      periodDeaths: null,
      cumulativeMortalityPct: null,
      remainingBirds: null,
      summaryEligible: false,
      recordedDays: 0,
      periodRecordedDays: 0,
      missingPeriodDays: 5,
    });
    expect(messages(absent)).toMatch(/not successful zero activity/);
    const harvestOnly = row(
      source({ dailyRecords: [], harvests: [harvest()] })
    );
    expect(harvestOnly).toMatchObject({
      loadedBirds: 100,
      cumulativeDeaths: null,
      remainingBirds: null,
    });
  });

  it("missing period capture remains N/A even when preperiod deaths are available", () => {
    const actual = row(source({ dailyRecords: [daily({ mortality: 3 })] }), {
      startDate: "2026-11-03",
    });
    expect(actual).toMatchObject({
      cumulativeDeaths: 3,
      periodDeaths: null,
      remainingBirds: 997,
      periodRecordedDays: 0,
      expectedPeriodDays: 3,
      missingPeriodDays: 3,
      summaryEligible: false,
    });
  });

  it.each(["planned", "pending", "scheduled", "unconfirmed"])(
    "does not make %s flocks successful zero-mortality rows or summary denominator",
    status => {
      const actual = report(
        source({ flocks: [flock({ status })], harvests: [harvest()] })
      );
      expect(actual.rows[0]).toMatchObject({
        initialBirds: 1000,
        cumulativeDeaths: null,
        periodDeaths: null,
        cumulativeMortalityPct: null,
        remainingBirds: null,
        summaryEligible: false,
      });
      expect(messages(actual.rows[0])).toMatch(/not-confirmed placement/);
      expect(actual.summary).toMatchObject({
        flockCount: 1,
        eligibleFlockCount: 0,
        excludedFlockCount: 1,
        initialBirds: null,
      });
    }
  );

  it.each([null, "2026-02-30", "2026-11-01T00:00:00Z", ""])(
    "keeps invalid placement %s visible and all dependent metrics unavailable",
    placementDate => {
      const actual = row(
        source({
          flocks: [flock({ placementDate })],
          dailyRecords: [daily({ mortality: 5, averageWeight: 1 })],
          harvests: [harvest()],
        })
      );
      expect(actual).toMatchObject({
        placementDate: null,
        elapsedDays: null,
        cumulativeDeaths: null,
        periodDeaths: null,
        loadedBirds: null,
        remainingBirds: null,
        latestWeightKg: null,
        expectedPeriodDays: null,
        missingPeriodDays: null,
        summaryEligible: false,
      });
      expect(actual.dailyRecords).toHaveLength(1);
      expect(actual.harvestRecords).toHaveLength(1);
    }
  );

  it.each([
    -1,
    1.25,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])(
    "rejects invalid initial bird count %s without dropping the flock",
    initialCount => {
      const actual = row(source({ flocks: [flock({ initialCount })] }));
      expect(actual).toMatchObject({
        initialBirds: null,
        cumulativeDeaths: 0,
        cumulativeMortalityPct: null,
        remainingBirds: null,
        summaryEligible: false,
      });
      expect(messages(actual)).toMatch(/Invalid initial bird count/);
    }
  );

  it("zero initial birds is preserved but not a valid mortality denominator", () => {
    const actual = row(source({ flocks: [flock({ initialCount: 0 })] }));
    expect(actual).toMatchObject({
      initialBirds: 0,
      cumulativeMortalityPct: null,
      remainingBirds: null,
      summaryEligible: false,
    });
  });

  it.each([-1, 1.2, null, "", "bad", "Infinity", Number.MAX_SAFE_INTEGER + 1])(
    "keeps invalid mortality %s as unknown, not a zero or silently dropped contribution",
    mortality => {
      const actual = row(source({ dailyRecords: [daily({ mortality })] }));
      expect(actual).toMatchObject({
        cumulativeDeaths: null,
        periodDeaths: null,
        cumulativeMortalityPct: null,
        remainingBirds: null,
      });
      expect(actual.dailyRecords[0].mortality).toBeNull();
      expect(messages(actual)).toMatch(/nonnegative safe integer/);
    }
  );

  it("accepts recorded integer string counts and meaningful zero; flags invalid day numbers separately", () => {
    const actual = row(
      source({
        dailyRecords: [
          daily({ mortality: " 0 ", dayNumber: -4, averageWeight: "1.5" }),
        ],
        harvests: [harvest({ chickenCountLoaded: "0" })],
      })
    );
    expect(actual).toMatchObject({
      initialBirds: 1000,
      cumulativeDeaths: 0,
      loadedBirds: 0,
      remainingBirds: 1000,
      latestWeightKg: 1.5,
      elapsedDays: 4,
    });
    expect(messages(actual)).toMatch(/Invalid recorded day number/);
  });

  it("only scoped invalid mortality poisons totals; preplacement/future mortality is excluded", () => {
    const actual = row(
      source({
        dailyRecords: [
          daily({ id: 1, recordDate: "2026-10-31", mortality: -1 }),
          daily({ id: 2, recordDate: "2026-11-01", mortality: 2 }),
          daily({ id: 3, recordDate: "2026-11-06", mortality: -2 }),
        ],
      })
    );
    expect(actual).toMatchObject({
      cumulativeDeaths: 2,
      periodDeaths: 2,
      remainingBirds: 998,
      recordedDays: 1,
    });
    expect(actual.dailyRecords.map(record => record.id)).toEqual([1, 2]);
    expect(messages(actual)).toMatch(/before placement/);
    expect(messages(actual)).not.toMatch(/Daily record 3:/);
  });

  it.each([null, "2026-02-30", "not-a-date"])(
    "undatable daily date %s cannot be silently excluded to yield apparently complete totals",
    recordDate => {
      const actual = row(
        source({
          dailyRecords: [
            daily({ id: 1 }),
            daily({ id: 2, recordDate, mortality: 3, averageWeight: 1.2 }),
          ],
        })
      );
      expect(actual).toMatchObject({
        cumulativeDeaths: null,
        periodDeaths: null,
        remainingBirds: null,
        latestWeightKg: null,
      });
      expect(actual.dailyRecords.find(record => record.id === 2)).toMatchObject(
        { id: 2, date: null, inPeriod: false }
      );
      expect(messages(actual)).toMatch(/cannot be positioned reliably/);
    }
  );

  it("sums unique IDs on duplicate daily dates, counts date coverage once and flags duplicate dates", () => {
    const actual = row(
      source({
        dailyRecords: [
          daily({ id: 1, mortality: 2, averageWeight: 1 }),
          daily({ id: 2, mortality: 3, averageWeight: 1 }),
        ],
      })
    );
    expect(actual).toMatchObject({
      cumulativeDeaths: 5,
      periodDeaths: 5,
      recordedDays: 1,
      periodRecordedDays: 1,
      missingPeriodDays: 4,
      latestWeightKg: 1,
    });
    expect(actual.dailyRecords.map(record => record.id)).toEqual([1, 2]);
    expect(messages(actual)).toMatch(/Duplicate daily date/);
    expect(
      actual.dailyRecords.every(record =>
        messages(record).includes("Duplicate daily date")
      )
    ).toBe(true);
  });

  it("does not choose arbitrary versions of a conflicting repeated daily source ID", () => {
    const first = daily({ mortality: 2, averageWeight: 1 });
    const second = daily({ mortality: 3, averageWeight: 2 });
    const actual = row(source({ dailyRecords: [first, second] }));
    expect(actual).toMatchObject({
      cumulativeDeaths: null,
      periodDeaths: null,
      latestWeightKg: null,
      remainingBirds: null,
    });
    expect(actual.dailyRecords).toHaveLength(1);
    expect(
      row(source({ dailyRecords: [second, first] })).cumulativeDeaths
    ).toBeNull();
    expect(messages(actual)).toMatch(/no arbitrary version selected/);
  });

  it("latest same-day conflicting weights are N/A with their date, not an earlier fallback", () => {
    const records = [
      daily({ id: 1, averageWeight: 1 }),
      daily({ id: 2, recordDate: "2026-11-05", averageWeight: 2 }),
      daily({ id: 3, recordDate: "2026-11-05", averageWeight: 2.1 }),
    ];
    const actual = row(source({ dailyRecords: records }));
    expect(actual).toMatchObject({
      latestWeightKg: null,
      latestWeightDate: "2026-11-05",
      weightAgeDays: 0,
      observedGrowthGPerBirdDay: null,
      growthStartDate: "2026-11-01",
      growthEndDate: "2026-11-05",
      growthStartWeightKg: 1,
      growthEndWeightKg: null,
    });
    expect(messages(actual)).toMatch(/conflicting sampled weights/);
    expect(
      row(source({ dailyRecords: [...records].reverse() })).latestWeightKg
    ).toBeNull();
  });

  it("uses the latest positive actual measurement, not a zero/blank daily default or a future weight", () => {
    const actual = row(
      source({
        dailyRecords: [
          daily({ id: 1, averageWeight: 0.8 }),
          daily({ id: 2, recordDate: "2026-11-02", averageWeight: 0 }),
          daily({ id: 3, recordDate: "2026-11-03", averageWeight: "" }),
          daily({ id: 4, recordDate: "2026-11-04", averageWeight: null }),
          daily({ id: 5, recordDate: "2026-11-05", averageWeight: "0.0" }),
          daily({ id: 6, recordDate: "2026-11-06", averageWeight: 3 }),
        ],
      })
    );
    expect(actual).toMatchObject({
      latestWeightKg: 0.8,
      latestWeightDate: "2026-11-01",
      weightAgeDays: 4,
      observedGrowthGPerBirdDay: null,
    });
  });

  it.each([-1, "bad", "Infinity", Number.NaN])(
    "does not bypass invalid latest actual weight attempt %s to fabricate a usable endpoint",
    averageWeight => {
      const actual = row(
        source({
          dailyRecords: [
            daily({ id: 1, averageWeight: 1 }),
            daily({ id: 2, recordDate: "2026-11-05", averageWeight }),
          ],
        })
      );
      expect(actual).toMatchObject({
        latestWeightKg: null,
        latestWeightDate: "2026-11-05",
        observedGrowthGPerBirdDay: null,
        growthEndWeightKg: null,
      });
      expect(messages(actual)).toMatch(/Invalid or conflicting sampled weight/);
    }
  );

  it("computes observed endpoint growth in g/bird/day without invented 50g placement weight or averaging interval rates", () => {
    const actual = row(
      source({
        dailyRecords: [
          daily({ id: 1, averageWeight: 0.5 }),
          daily({ id: 2, recordDate: "2026-11-02", averageWeight: 0.9 }),
          daily({ id: 3, recordDate: "2026-11-05", averageWeight: 1.1 }),
        ],
      })
    );
    expect(actual).toMatchObject({
      growthStartDate: "2026-11-01",
      growthEndDate: "2026-11-05",
      growthStartWeightKg: 0.5,
      growthEndWeightKg: 1.1,
    });
    expect(actual.observedGrowthGPerBirdDay).toBeCloseTo(150);
    const one = row(
      source({
        dailyRecords: [daily({ recordDate: "2026-11-05", averageWeight: 2 })],
      })
    );
    expect(one.observedGrowthGPerBirdDay).toBeNull();
  });

  it("growth only uses dates inside S..E, while the as-of latest sample remains separately scoped", () => {
    const actual = row(
      source({
        dailyRecords: [
          daily({ id: 1, averageWeight: 0.2 }),
          daily({ id: 2, recordDate: "2026-11-03", averageWeight: 0.9 }),
          daily({ id: 3, recordDate: "2026-11-05", averageWeight: 1.2 }),
          daily({ id: 4, recordDate: "2026-11-06", averageWeight: 1.5 }),
        ],
      }),
      { startDate: "2026-11-03" }
    );
    expect(actual.observedGrowthGPerBirdDay).toBeCloseTo(150);
    expect(actual).toMatchObject({
      growthStartDate: "2026-11-03",
      growthEndDate: "2026-11-05",
      latestWeightDate: "2026-11-05",
    });
  });

  it("same-day observations alone are not distinct measurement dates", () => {
    const actual = row(
      source({
        dailyRecords: [
          daily({ id: 1, averageWeight: 1 }),
          daily({ id: 2, averageWeight: 1 }),
        ],
      })
    );
    expect(actual).toMatchObject({
      latestWeightKg: 1,
      observedGrowthGPerBirdDay: null,
      growthStartDate: null,
      growthEndDate: null,
    });
  });

  it("does not discard an invalid first endpoint to use a convenient interior measurement", () => {
    const actual = row(
      source({
        dailyRecords: [
          daily({ id: 1, averageWeight: -1 }),
          daily({ id: 2, recordDate: "2026-11-03", averageWeight: 1.2 }),
          daily({ id: 3, recordDate: "2026-11-05", averageWeight: 1.4 }),
        ],
      })
    );
    expect(actual).toMatchObject({
      latestWeightKg: 1.4,
      observedGrowthGPerBirdDay: null,
      growthStartDate: "2026-11-01",
      growthStartWeightKg: null,
    });
  });

  it("an interior conflict is flagged but does not replace or poison independently unambiguous growth endpoints", () => {
    const actual = row(
      source({
        dailyRecords: [
          daily({ id: 1, averageWeight: 1 }),
          daily({ id: 2, recordDate: "2026-11-03", averageWeight: 1.2 }),
          daily({ id: 3, recordDate: "2026-11-03", averageWeight: 1.3 }),
          daily({ id: 4, recordDate: "2026-11-05", averageWeight: 1.4 }),
        ],
      })
    );
    expect(actual.observedGrowthGPerBirdDay).toBeCloseTo(100);
    expect(messages(actual)).toMatch(
      /conflicting sampled weights on 2026-11-03/
    );
  });

  it("preserves negative observed growth and warns instead of clamping", () => {
    const actual = row(
      source({
        dailyRecords: [
          daily({ id: 1, averageWeight: 1.4 }),
          daily({ id: 2, recordDate: "2026-11-05", averageWeight: 1 }),
        ],
      })
    );
    expect(actual.observedGrowthGPerBirdDay).toBeCloseTo(-100);
    expect(messages(actual)).toMatch(/sample-mean weight change is negative/);
  });

  it("uses ratio-of-sums mortality for a complete matched cohort, not unweighted percentages or pooled weights", () => {
    const result = report(
      source({
        flocks: [
          flock({ initialCount: 100 }),
          flock({ id: 2, houseId: 2, initialCount: 900 }),
        ],
        dailyRecords: [...fullCapture(1, 10), ...fullCapture(2, 9)],
      })
    );
    expect(result.rows.map(item => item.cumulativeMortalityPct)).toEqual([
      10, 1,
    ]);
    expect(result.summary).toMatchObject({
      flockCount: 2,
      eligibleFlockCount: 2,
      excludedFlockCount: 0,
      initialBirds: 1000,
      periodDeaths: 19,
      cumulativeDeaths: 19,
      cumulativeMortalityPct: 1.9,
      loadedBirds: 0,
      remainingBirds: 981,
    });
    expect(result.summary).not.toHaveProperty("latestWeightKg");
    expect(result.summary).not.toHaveProperty("observedGrowthGPerBirdDay");
  });

  it.each([
    { label: "no capture", flock: flock({ id: 2, houseId: 2 }), records: [] },
    {
      label: "planned",
      flock: flock({ id: 2, houseId: 2, status: "planned" }),
      records: fullCapture(2, 0),
    },
    {
      label: "invalid denominator",
      flock: flock({ id: 2, houseId: 2, initialCount: -1 }),
      records: fullCapture(2, 0),
    },
    {
      label: "invalid placement",
      flock: flock({ id: 2, houseId: 2, placementDate: null }),
      records: fullCapture(2, 0),
    },
    {
      label: "invalid death count",
      flock: flock({ id: 2, houseId: 2 }),
      records: [daily({ flockId: 2, id: 222, mortality: -1 })],
    },
  ])(
    "does not silently drop a $label cohort to produce complete-looking aggregate totals",
    fixture => {
      const result = report(
        source({
          flocks: [flock(), fixture.flock],
          dailyRecords: [...fullCapture(1, 10), ...fixture.records],
        })
      );
      expect(result.rows).toHaveLength(2);
      expect(result.summary).toMatchObject({
        flockCount: 2,
        eligibleFlockCount: 1,
        excludedFlockCount: 1,
        initialBirds: null,
        periodDeaths: null,
        cumulativeDeaths: null,
        cumulativeMortalityPct: null,
        loadedBirds: null,
        remainingBirds: null,
      });
      expect(messages(result.summary)).toMatch(/not silently omitted/);
    }
  );

  it("partial daily history can show explicitly caveated recorded totals, never a completeness claim", () => {
    const result = report();
    expect(result.summary).toMatchObject({
      eligibleFlockCount: 1,
      initialBirds: 1000,
      cumulativeDeaths: 0,
    });
    expect(messages(result.summary)).toMatch(/Recorded-only totals/);
    expect(result.rows[0]).toMatchObject({
      recordedDays: 1,
      expectedPeriodDays: 5,
      missingPeriodDays: 4,
    });
  });

  it("never counts initial birds twice for repeated flock IDs; conflicting masters remain visible and unavailable", () => {
    const repeated = report(source({ flocks: [flock(), flock()] }));
    expect(repeated.rows).toHaveLength(1);
    expect(repeated.summary.initialBirds).toBe(1000);
    const conflicting = report(
      source({ flocks: [flock(), flock({ initialCount: 2000 })] })
    );
    expect(conflicting.rows).toHaveLength(1);
    expect(conflicting.rows[0]).toMatchObject({
      initialBirds: null,
      remainingBirds: null,
      summaryEligible: false,
    });
    expect(conflicting.summary.initialBirds).toBeNull();
    expect(messages(conflicting.rows[0])).toMatch(/Conflicting master records/);
  });

  it("unrelated flocks' malformed data cannot poison a selected flock", () => {
    const actual = row(
      source({
        dailyRecords: [
          daily(),
          daily({
            flockId: 2,
            id: 2,
            recordDate: null,
            mortality: -1,
            averageWeight: -1,
          }),
        ],
        harvests: [harvest({ flockId: 2, harvestDate: null })],
        catches: [session({ flockId: 2, harvestRecordId: null })],
      }),
      { flockId: 1 }
    );
    expect(actual).toMatchObject({
      cumulativeDeaths: 0,
      loadedBirds: 0,
      remainingBirds: 1000,
    });
    expect(actual.dailyRecords).toHaveLength(1);
    expect(actual.harvestRecords).toEqual([]);
    expect(actual.catchExceptions).toEqual([]);
  });

  it("calendar differences handle leap days without timezone/DST arithmetic", () => {
    const actual = row(
      source({
        flocks: [flock({ placementDate: "2024-02-28" })],
        dailyRecords: [daily({ recordDate: "2024-02-29", averageWeight: 1 })],
      }),
      { startDate: "2024-02-28", endDate: "2024-03-01" }
    );
    expect(actual).toMatchObject({
      elapsedDays: 2,
      expectedPeriodDays: 3,
      weightAgeDays: 1,
    });
  });

  it.each([
    "Africa/Johannesburg",
    "America/New_York",
    "Pacific/Kiritimati",
    "Pacific/Pago_Pago",
  ])(
    "keeps operational-day calculations identical in %s, including across a DST transition",
    timezone => {
      const data = source({
        flocks: [flock({ placementDate: "2026-10-31" })],
        dailyRecords: [
          daily({ id: 1, recordDate: "2026-10-31", averageWeight: 1 }),
          daily({ id: 2, recordDate: "2026-11-02", averageWeight: 1.2 }),
        ],
      });
      const filters = {
        ...FILTERS,
        startDate: "2026-10-31",
        endDate: "2026-11-02",
      };
      const result = buildFlockPerformanceReport(
        data,
        filters,
        timezone,
        GENERATED_AT
      );
      expect(result.rows).toEqual(
        buildFlockPerformanceReport(data, filters, "UTC", GENERATED_AT).rows
      );
      expect(result.rows[0]).toMatchObject({
        elapsedDays: 2,
        expectedPeriodDays: 3,
        latestWeightDate: "2026-11-02",
        weightAgeDays: 0,
      });
      expect(result.rows[0].observedGrowthGPerBirdDay).toBeCloseTo(100);
    }
  );

  it("flags saved day-number/date disagreement without using the saved number for age or growth", () => {
    const actual = row(
      source({
        dailyRecords: [
          daily({ recordDate: "2026-11-03", dayNumber: 77, averageWeight: 1 }),
        ],
      })
    );
    expect(actual).toMatchObject({
      elapsedDays: 4,
      latestWeightDate: "2026-11-03",
      weightAgeDays: 2,
    });
    expect(messages(actual)).toMatch(
      /Recorded day number 77 differs from placement-day-0 elapsed days 2/
    );
    expect(actual.dailyRecords[0].dayNumber).toBe(77);
  });

  it.each([
    { label: "missing house", data: source({ houses: [] }) },
    {
      label: "conflicting house label",
      data: source({
        houses: [
          { id: 1, name: "A", houseNumber: "1" },
          { id: 1, name: "B", houseNumber: "1" },
        ],
      }),
    },
    {
      label: "invalid house ID",
      data: source({ flocks: [flock({ houseId: 0 })] }),
    },
  ])(
    "retains a flock with $label but excludes its invalid master data from complete-looking aggregates",
    ({ data }) => {
      const result = report(data);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].summaryEligible).toBe(false);
      expect(messages(result.rows[0])).toMatch(/house identifier\/label/);
      expect(result.summary.initialBirds).toBeNull();
    }
  );

  it("uses safe count sums instead of emitting imprecise aggregate integers", () => {
    const records = [
      daily({ id: 1, mortality: Number.MAX_SAFE_INTEGER }),
      daily({ id: 2, recordDate: "2026-11-02", mortality: 1 }),
    ];
    expect(row(source({ dailyRecords: records })).cumulativeDeaths).toBeNull();
    const result = report(
      source({
        flocks: [
          flock({ initialCount: Number.MAX_SAFE_INTEGER }),
          flock({ id: 2, initialCount: Number.MAX_SAFE_INTEGER }),
        ],
        dailyRecords: [daily(), daily({ id: 2, flockId: 2 })],
      })
    );
    expect(result.summary).toMatchObject({
      eligibleFlockCount: 2,
      initialBirds: null,
      cumulativeDeaths: null,
    });
    expect(messages(result.summary)).toMatch(/safe integer precision/);
  });
});
