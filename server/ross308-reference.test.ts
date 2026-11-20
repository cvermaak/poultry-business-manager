import { describe, expect, it } from "vitest";
import {
  derivedRossPhaseReference,
  getRossObjective,
  ROSS_REFERENCE,
  type RossObjective,
} from "../shared/ross308-reference";

/**
 * Independent golden copy of all seven objective fields from the approved
 * ross308-current-versus-proposed-daily.csv (20 November 2026), sourced from
 * Ross 308 / Ross 308 FF Performance Objectives 2022, as-hatched, printed p3.
 * Original cumulative-feed units (g) and blank fields are deliberately retained.
 * This fixture imports no production table and reads no external file at runtime.
 */
const GOLDEN_CSV = `day,weightKg,dailyGainG,averageDailyGainG,dailyFeedG,cumulativeFeedG,fcr
0,0.044,,,,,
1,0.062,18,,,12,0.196
2,0.081,19,,16,28,0.352
3,0.102,21,,20,48,0.476
4,0.125,23,,24,72,0.577
5,0.151,26,,27,100,0.658
6,0.181,29,,31,131,0.724
7,0.213,32,24,35,166,0.780
8,0.249,36,26,39,206,0.826
9,0.288,39,27,44,249,0.865
10,0.330,42,29,48,297,0.900
11,0.376,46,30,52,349,0.930
12,0.425,49,32,57,406,0.957
13,0.477,52,33,62,468,0.982
14,0.533,56,35,67,535,1.005
15,0.592,59,37,72,608,1.026
16,0.655,62,38,77,685,1.047
17,0.720,66,40,83,768,1.066
18,0.789,69,41,88,856,1.086
19,0.860,72,43,94,950,1.105
20,0.935,74,45,100,1050,1.123
21,1.012,77,46,105,1155,1.142
22,1.092,80,48,111,1266,1.160
23,1.174,82,49,117,1383,1.178
24,1.258,85,51,122,1505,1.196
25,1.345,87,52,128,1633,1.214
26,1.434,89,53,134,1767,1.233
27,1.524,91,55,139,1907,1.251
28,1.616,92,56,145,2051,1.269
29,1.710,94,57,150,2202,1.288
30,1.805,95,59,156,2357,1.306
31,1.901,96,60,161,2518,1.325
32,1.999,97,61,166,2684,1.343
33,2.097,98,62,171,2855,1.362
34,2.196,99,63,176,3031,1.381
35,2.296,100,64,180,3211,1.399
36,2.396,100,65,185,3396,1.418
37,2.496,100,66,189,3584,1.437
38,2.597,101,67,193,3777,1.456
39,2.697,101,68,197,3974,1.474
40,2.798,100,69,201,4175,1.493
41,2.898,100,70,204,4379,1.512
42,2.998,100,70,207,4586,1.531
43,3.097,100,71,211,4797,1.550
44,3.197,99,72,213,5010,1.569
45,3.295,98,72,216,5226,1.587
46,3.393,98,73,219,5445,1.606
47,3.490,97,73,221,5666,1.625
48,3.586,96,74,223,5890,1.644
49,3.681,95,74,225,6115,1.663
50,3.776,94,75,227,6342,1.681
51,3.869,93,75,229,6571,1.700
52,3.961,92,75,230,6801,1.719
53,4.052,91,76,231,7032,1.738
54,4.142,90,76,233,7265,1.756
55,4.230,89,76,233,7498,1.775
56,4.318,87,76,234,7733,1.793`;

const nullableNumber = (value: string): number | null =>
  value === "" ? null : Number(value);

const GOLDEN: RossObjective[] = GOLDEN_CSV.split("\n")
  .slice(1)
  .map((line) => {
    const cells = line.split(",");
    if (cells.length !== 7) throw new Error(`Invalid golden fixture: ${line}`);
    const [day, weight, gain, averageGain, dailyFeed, cumulativeFeed, fcr] =
      cells;
    const cumulativeFeedG = nullableNumber(cumulativeFeed);
    return {
      day: Number(day),
      weightKg: Number(weight),
      dailyGainG: nullableNumber(gain),
      averageDailyGainG: nullableNumber(averageGain),
      dailyFeedG: nullableNumber(dailyFeed),
      cumulativeFeedKg:
        cumulativeFeedG === null ? null : cumulativeFeedG / 1000,
      fcr: nullableNumber(fcr),
    };
  });

const UNSUPPORTED_AGES = [
  -1,
  -56,
  57,
  100,
  Number.MAX_SAFE_INTEGER,
  Number.MIN_SAFE_INTEGER,
  -0.5,
  0.5,
  1.1,
  55.9,
  56.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
];

describe("Ross 308 / 308 FF exact as-hatched objective", () => {
  it("has an independent golden row for every age 0–56, without gaps", () => {
    expect(GOLDEN).toHaveLength(57);
    expect(GOLDEN.map((row) => row.day)).toEqual(
      Array.from({ length: 57 }, (_, day) => day),
    );
  });

  it.each(GOLDEN)(
    "matches every published field exactly at day $day",
    (golden) => {
      expect(getRossObjective(golden.day)).toStrictEqual(golden);
    },
  );

  it.each(UNSUPPORTED_AGES)(
    "returns null at unsupported age %s without extrapolation",
    (age) => {
      expect(getRossObjective(age)).toBeNull();
    },
  );

  it("does not coerce runtime non-number input into an age", () => {
    for (const age of [
      "0",
      "7",
      null,
      undefined,
      true,
      {},
      [],
      new Number(7),
    ]) {
      expect(getRossObjective(age as unknown as number)).toBeNull();
    }
  });

  it("preserves publication blanks rather than inventing zero or derived values", () => {
    expect(getRossObjective(0)).toStrictEqual({
      day: 0,
      weightKg: 0.044,
      dailyGainG: null,
      averageDailyGainG: null,
      dailyFeedG: null,
      cumulativeFeedKg: null,
      fcr: null,
    });
    expect(getRossObjective(1)?.dailyFeedG).toBeNull();
    for (let day = 1; day <= 6; day++) {
      expect(getRossObjective(day)?.averageDailyGainG).toBeNull();
    }
  });

  it("preserves rounded published FCR and gain, not recomputed rounded-column values", () => {
    const day1 = getRossObjective(1)!;
    expect(day1.fcr).toBe(0.196);
    expect(day1.fcr).not.toBe(day1.cumulativeFeedKg! / day1.weightKg);
    const day6 = getRossObjective(6)!;
    expect(day6.dailyGainG).toBe(29);
    expect(day6.dailyGainG).not.toBe(
      (day6.weightKg - getRossObjective(5)!.weightKg) * 1000,
    );
  });

  it("returns frozen immutable objects for all 57 ages", () => {
    for (const golden of GOLDEN) {
      const objective = getRossObjective(golden.day)!;
      expect(Object.isFrozen(objective)).toBe(true);
      expect(getRossObjective(golden.day)).toBe(objective);
      for (const key of Object.keys(objective)) {
        expect(Reflect.set(objective, key, -999)).toBe(false);
        expect(Reflect.deleteProperty(objective, key)).toBe(false);
      }
      expect(Reflect.set(objective, "invented", 1)).toBe(false);
      expect(getRossObjective(golden.day)).toStrictEqual(golden);
    }
  });

  it("exports frozen exact objective and handbook provenance with no housing discount", () => {
    expect(ROSS_REFERENCE).toStrictEqual({
      label: "Ross 308 / 308 FF as-hatched breeder objective",
      edition: "2022",
      objectiveUrl:
        "https://aviagen.com/assets/Tech_Center/Ross_Broiler/RossxRoss308-BroilerPerformanceObjectives2022-EN.pdf",
      handbookUrl:
        "https://aviagen.com/assets/Tech_Center/Ross_Broiler/Aviagen-ROSS-Broiler-Handbook-EN.pdf",
      handbookEdition: "2025",
      context:
        "Breeder objective; not a verified South African open-house average",
    });
    expect(Object.isFrozen(ROSS_REFERENCE)).toBe(true);
    expect(Reflect.set(ROSS_REFERENCE, "edition", "changed")).toBe(false);
    expect(Reflect.deleteProperty(ROSS_REFERENCE, "context")).toBe(false);
  });
});

describe("derived Ross phase feed-to-gain reference", () => {
  it("derives, rather than hardcodes, the three rounded report examples", () => {
    expect(derivedRossPhaseReference(0, 10)).toBeCloseTo(1.038, 3);
    expect(derivedRossPhaseReference(10, 24)).toBeCloseTo(1.302, 3);
    expect(derivedRossPhaseReference(24, 42)).toBeCloseTo(1.771, 3);
  });

  it("uses exact endpoint differences for every increasing pair of published ages", () => {
    for (let startDay = 0; startDay < 56; startDay++) {
      for (let endDay = startDay + 1; endDay <= 56; endDay++) {
        const start = GOLDEN[startDay];
        const end = GOLDEN[endDay];
        const startFeed = startDay === 0 ? 0 : start.cumulativeFeedKg!;
        const expected =
          (end.cumulativeFeedKg! - startFeed) / (end.weightKg - start.weightKg);
        expect(derivedRossPhaseReference(startDay, endDay)).toBe(expected);
      }
    }
  });

  it("changes its derived answer when either phase boundary changes", () => {
    for (const [startDay, endDay] of [
      [0, 10],
      [10, 24],
      [24, 42],
    ]) {
      const original = derivedRossPhaseReference(startDay, endDay);
      expect(derivedRossPhaseReference(startDay + 1, endDay)).not.toBe(
        original,
      );
      expect(derivedRossPhaseReference(startDay, endDay + 1)).not.toBe(
        original,
      );
    }
  });

  it("uses net weight gain, not final live weight, as the phase denominator", () => {
    const start = GOLDEN[10];
    const end = GOLDEN[24];
    expect(derivedRossPhaseReference(10, 24)).toBe(
      (end.cumulativeFeedKg! - start.cumulativeFeedKg!) /
        (end.weightKg - start.weightKg),
    );
    expect(derivedRossPhaseReference(10, 24)).not.toBe(
      (end.cumulativeFeedKg! - start.cumulativeFeedKg!) / end.weightKg,
    );
    expect(derivedRossPhaseReference(10, 24)).not.toBe(end.fcr);
  });

  it("uses Day 0 zero feed only internally and leaves publication blanks unchanged", () => {
    expect(getRossObjective(0)?.cumulativeFeedKg).toBeNull();
    expect(derivedRossPhaseReference(0, 1)).toBe(
      GOLDEN[1].cumulativeFeedKg! / (GOLDEN[1].weightKg - GOLDEN[0].weightKg),
    );
    expect(derivedRossPhaseReference(0, 56)).toBe(
      GOLDEN[56].cumulativeFeedKg! / (GOLDEN[56].weightKg - GOLDEN[0].weightKg),
    );
    expect(getRossObjective(0)?.cumulativeFeedKg).toBeNull();
  });

  it("returns null for every equal or reversed published endpoint pair", () => {
    for (let startDay = 0; startDay <= 56; startDay++) {
      for (let endDay = 0; endDay <= startDay; endDay++) {
        expect(derivedRossPhaseReference(startDay, endDay)).toBeNull();
      }
    }
  });

  it.each(UNSUPPORTED_AGES)(
    "rejects unsupported age %s at either phase boundary",
    (age) => {
      expect(derivedRossPhaseReference(age, 56)).toBeNull();
      expect(derivedRossPhaseReference(0, age)).toBeNull();
    },
  );
});
