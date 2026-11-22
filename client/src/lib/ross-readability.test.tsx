import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ComputeRossFlockMetricsInput,
  RossDailyRecordInput,
  RossFlockMetrics,
} from "@shared/ross-flock-metrics";

const charts = vi.hoisted(() => ({
  nodes: [] as { kind: string; props: Record<string, unknown> }[],
}));
vi.mock("recharts", async () => {
  const React = await import("react");
  const mock =
    (kind: string) =>
    ({
      children,
      ...props
    }: { children?: React.ReactNode } & Record<string, unknown>) => {
      charts.nodes.push({ kind, props });
      return React.createElement("div", { "data-chart-mock": kind }, children);
    };
  return Object.fromEntries(
    [
      "ResponsiveContainer",
      "LineChart",
      "Line",
      "XAxis",
      "YAxis",
      "CartesianGrid",
      "Tooltip",
      "ReferenceDot",
      "Legend",
    ].map((kind) => [kind, mock(kind)]),
  );
});

import { RossFlockPerformance } from "@/components/RossFlockPerformance";
import { computeRossFlockMetrics } from "@shared/ross-flock-metrics";
import { getRossObjective, ROSS_REFERENCE } from "@shared/ross308-reference";
import { buildRossChartRows, formatRossNumber } from "./ross-flock-display";
import type { RossCommercialPlan } from "./ross-flock-display";

const commercialPlan: RossCommercialPlan = {
  targetCatchingWeight: "1.700",
  targetDeliveredWeight: "1.600",
  growingPeriod: 42,
};
function fixture(
  options: {
    days?: number;
    companyDay?: number;
    noWeights?: boolean;
    noSamples?: boolean;
    noRecords?: boolean;
    measuredDays?: number[];
    noLosses?: boolean;
    unknownCulls?: boolean;
    missingWaterDay?: number;
    harvest?: ComputeRossFlockMetricsInput["harvestLoads"];
  } = {},
): RossFlockMetrics {
  const days = options.days ?? 14;
  const date = (day: number) =>
    new Date(Date.UTC(2026, 9, 1 + day)).toISOString();
  const measuredDays = options.measuredDays ?? [0, 7, 14];
  const records: RossDailyRecordInput[] = options.noRecords
    ? []
    : Array.from({ length: days + 1 }, (_, day) => ({
        id: day + 1,
        flockId: 1,
        recordDate: date(day),
        dayNumber: day,
        mortality: !options.noLosses && day === 5 ? 2 : 0,
        culls: options.unknownCulls
          ? null
          : !options.noLosses && day === 5
            ? 1
            : 0,
        feedConsumed: day === 0 ? 0 : 10 + day,
        waterConsumed:
          day === options.missingWaterDay
            ? null
            : day === 0
              ? 0
              : (10 + day) * 1.7,
        averageWeight:
          options.noWeights || !measuredDays.includes(day)
            ? null
            : day === 0
              ? 0.04
              : day === 7
                ? 0.2
                : day === 14
                  ? 0.5
                  : day === 57
                    ? 4.5
                    : 0.04 + day * 0.032,
        weightSamples: options.noSamples
          ? null
          : day === 0
            ? "0.04,0.04,0.04"
            : day === 7
              ? "0.16,0.20,0.24"
              : day === 14
                ? "0.45,0.50,0.55"
                : null,
        feedType: day <= 7 ? "starter" : day <= 14 ? "grower" : "finisher",
        temperature: 23,
        humidity: 55,
      }));
  const result = computeRossFlockMetrics({
    houseBreed: "ross_308",
    flock: {
      id: 1,
      placementDate: "2026-10-01",
      initialCount: 1000,
      growingPeriod: 42,
      starterFromDay: 0,
      starterToDay: 7,
      growerFromDay: 8,
      growerToDay: 14,
      finisherFromDay: 15,
      finisherToDay: 21,
    },
    dailyRecords: records,
    harvestLoads: options.harvest ?? { status: "available", records: [] },
    company: {
      timezone: "Africa/Johannesburg",
      now: new Date(Date.UTC(2026, 9, 1 + (options.companyDay ?? days), 12)),
    },
  });
  if (!result) throw new Error("Pure Ross fixture unavailable");
  return result;
}
function render(
  section: "summary" | "readiness" | "daily" | "growth",
  metrics = fixture(),
  plan = commercialPlan,
) {
  return renderToStaticMarkup(
    <RossFlockPerformance
      section={section}
      metrics={metrics}
      commercialPlan={plan}
    />,
  );
}
function detail(html: string, marker: string) {
  const match = html.match(
    new RegExp(`<details\\b([^>]*${marker}[^>]*)>([\\s\\S]*?)<\\/details>`),
  );
  expect(match, `Expected ${marker} detail`).not.toBeNull();
  return { attributes: match![1], content: match![2] };
}
function sampling(html: string) {
  return html.slice(
    html.indexOf('data-ross-sampling=""'),
    html.indexOf("Measured weight &amp; objective"),
  );
}
function node(kind: string, dataKey?: string) {
  const result = charts.nodes.find(
    (item) =>
      item.kind === kind &&
      (dataKey === undefined || item.props.dataKey === dataKey),
  );
  expect(result, `${kind} ${dataKey ?? ""}`).toBeDefined();
  return result!.props;
}
function phaseRow(html: string, phase: string) {
  const row = html.match(
    new RegExp(`<tr[^>]*data-ross-phase="${phase}"[^>]*>([\\s\\S]*?)<\\/tr>`),
  );
  expect(row).not.toBeNull();
  return row![1];
}

beforeEach(() => {
  charts.nodes = [];
});

describe("Ross presentation readability (offline SSR; not browser-interaction proof)", () => {
  it("shows company date/age and separate stale record/weighing endpoints without rebasing metrics", () => {
    const metrics = fixture({ days: 14, companyDay: 21 });
    const before = JSON.stringify(metrics);
    const html = render("summary", metrics);
    expect(html.match(/data-ross-freshness=/g)).toHaveLength(1);
    for (const value of [
      "Company age / date",
      "Day 21",
      "2026-10-22",
      "Latest daily record",
      "Latest weighing",
      "Day 14",
      "2026-10-15",
      "Stale record",
      "Stale weight",
      "Aligned endpoint Day 14",
      "0.500 kg",
      "output plus remaining",
    ])
      expect(html).toContain(value);
    expect(html).not.toContain("Aligned endpoint Day 21");
    expect(html).toContain(
      formatRossNumber(metrics.summary.cumulativeFcr.value, 3),
    );
    expect(html).toContain(
      formatRossNumber(getRossObjective(14)?.weightKg, 3, "kg"),
    );
    expect(JSON.stringify(metrics)).toBe(before);
  });

  it("distinguishes current daily data from stale weight and retains unavailable endpoints", () => {
    const current = render("summary", fixture({ days: 16 }));
    expect(current).toContain("Day 16");
    expect(current).toContain("2026-10-17");
    expect(current).toContain("Stale weight");
    expect(current).not.toContain("Stale record");
    expect(current).toContain("Current");
    const absent = render("summary", fixture({ noRecords: true }));
    expect(absent).toContain("N/A — no daily record");
    expect(absent).toContain("N/A — no valid weighing");
    expect(absent).toContain("No valid measured average weight");
    expect(absent).not.toContain("Stale record");
  });

  it("renders Summary only at the top, leaving distinct loss/consumption cards and no default source prose", () => {
    const metrics = fixture({ unknownCulls: true });
    const summary = render("summary", metrics);
    const daily = render("daily", metrics);
    const page = summary + daily + render("growth", metrics);
    expect(page.match(/data-ross-freshness=/g)).toHaveLength(1);
    expect(page.match(/Latest measured average weight/g)).toHaveLength(1);
    expect(daily).not.toContain("Cumulative FCR · operational");
    expect(daily).not.toContain("Data freshness");
    for (const label of [
      "Found dead",
      "Culls",
      "On-farm losses",
      "Livability · loss-based",
      "Metered water · matched window",
      "Water:feed · whole window",
      "Daily feed &amp; water",
      "Historical culls NULL",
    ])
      expect(daily).toContain(label);
    for (const html of [summary, daily]) {
      expect(html).not.toContain("Performance Objectives");
      expect(html).not.toMatch(/handbook/i);
      expect(html).not.toContain(ROSS_REFERENCE.objectiveUrl);
    }
    expect(daily).toContain("1.70 L/kg");
  });

  it("keeps sampling dates/counts/multiple/CV checks concise with one unrecorded-location limitation", () => {
    const metrics = fixture();
    const html = render("growth", metrics);
    const panel = sampling(html);
    for (const text of [
      "Sampling &amp; first-week checks",
      "Day 14 · 2026-10-15 · n=3",
      "recommendation: 100",
      "Low sample count",
      "Sampling locations unrecorded",
      "weight multiple: 5.00×",
      "Meets 4.5× check",
      "Day 0: 2026-10-01",
      "Day 7: 2026-10-08",
      "20.00 percentage points",
      "Brooding review suggested",
    ])
      expect(panel).toContain(text);
    expect(html.match(/Sampling locations unrecorded/g)).toHaveLength(1);
    expect(panel).not.toMatch(
      /handbook|pages|https?:|representativ|certif|at least three locations/i,
    );
    expect(panel).not.toContain("no token was silently discarded");
    expect(metrics.day7.weightMultiple.value).toBe(5);
    expect(metrics.day7.cvChangePercentagePoints.value).toBeCloseTo(20);
    expect(metrics.day7.meetsMinimum).toBe(true);
    expect(metrics.day7.broodingReviewSuggested).toBe(true);
  });

  it("retains missing-data reasons for individual samples, early weights/CV, ADG, consumption and phases", () => {
    const metrics = fixture({
      noWeights: true,
      noSamples: true,
      missingWaterDay: 14,
    });
    const growth = render("growth", metrics);
    const panel = sampling(growth);
    expect(panel).toContain("N/A — no individual-weight sample");
    expect(panel).toContain(metrics.day7.weightMultiple.reason!);
    expect(panel).toContain(metrics.day7.cvChangePercentagePoints.reason!);
    expect(panel).not.toMatch(/handbook|representativ/i);
    expect(growth).toContain(metrics.growth.adgG.reason!);
    expect(growth).toContain("Individual weight samples are required");
    expect(growth).toContain(
      "Exact boundary weights missing; no carried weights",
    );
    expect(growth).not.toContain(">0.000 kg<");
    const daily = render("daily", metrics);
    expect(daily).toContain("Missing/invalid metered water usage");
    expect(daily).toContain(
      "Matching valid daily water and positive feed are required",
    );
  });

  it("keeps all 57 exact reference rows in a separate default-closed, bounded table", () => {
    const html = render("growth");
    const reference = detail(html, "data-ross-reference=");
    const methods = detail(html, "data-ross-methodology=");
    expect(reference.attributes).not.toMatch(/\bopen(?:=|\s|$)/);
    expect(methods.attributes).not.toMatch(/\bopen(?:=|\s|$)/);
    expect(reference.content).toContain(
      "View all 57 exact reference rows · Day 0–56",
    );
    expect(reference.content.match(/data-ross-reference-day=/g)).toHaveLength(
      57,
    );
    const rows = buildRossChartRows([]);
    for (const row of rows) {
      const match = reference.content.match(
        new RegExp(
          `<tr[^>]*data-ross-reference-day="${row.day}"[^>]*>([\\s\\S]*?)<\\/tr>`,
        ),
      );
      expect(match).not.toBeNull();
      for (const value of [
        formatRossNumber(row.breederWeightKg, 3),
        formatRossNumber(row.publishedDailyGainG, 0),
        formatRossNumber(row.publishedAverageDailyGainG, 0),
        formatRossNumber(row.dailyFeedG, 0),
        formatRossNumber(row.cumulativeFeedKg, 3),
        formatRossNumber(row.referenceFcr, 3),
      ])
        expect(match![1]).toContain(value);
    }
    expect(reference.content).toContain("max-h-80 overflow-auto");
    expect(reference.content).toContain("tabular-nums");
    expect(reference.content).toContain("whitespace-normal");
    expect(methods.content).toContain(`href="${ROSS_REFERENCE.objectiveUrl}"`);
    expect(methods.content).toContain(`href="${ROSS_REFERENCE.handbookUrl}"`);
    expect(methods.content).toContain("Performance Objectives 2022");
    expect(methods.content).toContain("Handbook 2025");
    expect(methods.content).toContain(
      "not a verified South African open-house average",
    );
    expect(methods.content).toContain("bookkeeping convention");
    expect(methods.content).toContain("not mortality-corrected");
    const defaultContent = html.replace(
      /<details\b[^>]*>[\s\S]*?<\/details>/g,
      "",
    );
    expect(defaultContent).not.toMatch(
      /handbook|bookkeeping convention|Application planning policy|6\.5% per °C/i,
    );
  });

  it("preserves chart data/null gaps, measured points only, distinct marks, age extent, axis units and Day tooltips", () => {
    const metrics = fixture({
      days: 30,
      measuredDays: [21, 30],
      noSamples: true,
    });
    render("growth", metrics);
    const weightChart = node("LineChart");
    expect(weightChart.data).toEqual(
      buildRossChartRows(metrics.growth.samples, 42),
    );
    const data = weightChart.data as ReturnType<typeof buildRossChartRows>;
    expect(data.find((row) => row.day === 22)?.actualWeightKg).toBeNull();
    expect(data).toHaveLength(57);
    expect(node("XAxis", "day").domain).toEqual([19, 44]);
    expect(node("XAxis", "day").allowDataOverflow).toBe(true);
    expect(node("XAxis", "day").label).toMatchObject({ value: "Age (days)" });
    expect(node("YAxis").label).toMatchObject({ value: "Weight (kg)" });
    const visibleMaximum = Math.max(1.7, ...data
      .filter(row => row.day >= 19 && row.day <= 44)
      .flatMap(row => [row.actualWeightKg, row.breederWeightKg])
      .filter((weight): weight is number => weight !== null));
    const weightDomain = node("YAxis").domain as [number, number];
    expect(weightDomain[0]).toBe(0);
    expect(weightDomain[1]).toBeCloseTo(visibleMaximum * 1.1);
    expect(weightDomain[1]).toBeLessThan(getRossObjective(56)!.weightKg * 1.1);
    expect(node("YAxis").allowDataOverflow).toBe(true);
    const actual = node("Line", "actualWeightKg");
    const reference = node("Line", "breederWeightKg");
    expect(actual.stroke).toBe("none");
    expect(actual.dot).toMatchObject({ r: 5 });
    expect(actual.isAnimationActive).toBe(false);
    expect(reference.strokeDasharray).toBe("6 4");
    expect(reference.dot).toBe(false);
    expect((actual.dot as { fill: string }).fill).not.toBe(reference.stroke);
    expect(node("ReferenceDot")).toMatchObject({ x: 42, y: 1.7, r: 7 });
    for (const line of charts.nodes.filter((item) => item.kind === "Line"))
      expect(line.props.connectNulls).toBe(false);
    for (const tooltip of charts.nodes.filter(
      (item) => item.kind === "Tooltip",
    )) {
      const label = tooltip.props.labelFormatter as (day: unknown) => string;
      expect(label(7)).toBe("Day 7");
      expect(label("Day 0–7")).toBe("Day 0–7");
    }
    for (const small of charts.nodes
      .filter((item) => item.kind === "LineChart")
      .slice(2))
      expect(small.props.data).toHaveLength(57);
    expect(
      charts.nodes.some(
        (item) =>
          item.kind === "YAxis" &&
          (item.props.label as { value?: string })?.value === "ADG (g/day)",
      ),
    ).toBe(true);
  });

  it("uses the full age fallback without endpoints and retains post-56 measurements without reference extrapolation", () => {
    render("growth", fixture({ noWeights: true }), {
      ...commercialPlan,
      growingPeriod: null,
    });
    expect(node("XAxis", "day").domain).toEqual([0, 56]);
    expect((node("YAxis").domain as number[])[1]).toBeCloseTo(getRossObjective(56)!.weightKg * 1.1);
    charts.nodes = [];
    render("growth", fixture({ days: 57, measuredDays: [57] }), {
      ...commercialPlan,
      growingPeriod: 60,
    });
    const data = node("LineChart").data as ReturnType<
      typeof buildRossChartRows
    >;
    expect(data.find((row) => row.day === 57)).toMatchObject({
      actualWeightKg: 4.5,
      breederWeightKg: null,
    });
    expect(data.find((row) => row.day === 60)?.breederWeightKg).toBeNull();
    const extent = node("XAxis", "day").domain as number[];
    expect(extent[0]).toBeLessThanOrEqual(57);
    expect(extent[1]).toBeGreaterThanOrEqual(60);
    expect((node("YAxis").domain as number[])[1]).toBeGreaterThanOrEqual(4.5);
  });

  it("labels daily dual axes with units and preserves source nulls without connecting gaps", () => {
    const metrics = fixture({ missingWaterDay: 7 });
    render("daily", metrics);
    const data = node("LineChart").data as {
      day: number;
      meteredWaterMl: number | null;
    }[];
    expect(data.find((row) => row.day === 7)?.meteredWaterMl).toBeNull();
    expect(
      charts.nodes
        .filter((item) => item.kind === "YAxis")
        .map((item) => (item.props.label as { value: string }).value),
    ).toEqual(["Feed (g/bird/day)", "Water (ml/bird/day)"]);
    const feed = node("Line", "actualFeedG");
    const objective = node("Line", "breederDailyFeedG");
    const water = node("Line", "meteredWaterMl");
    expect(new Set([feed.stroke, objective.stroke, water.stroke]).size).toBe(3);
    expect(feed.strokeDasharray).toBeUndefined();
    expect(objective.strokeDasharray).toBe("6 4");
    expect(water.dot).toMatchObject({ r: 4 });
    for (const line of [feed, objective, water])
      expect(line.connectNulls).toBe(false);
  });

  it("keeps phase loss ratios unavailable, null reasons descriptive, reference values separate and EPEF provisional after harvest", () => {
    const metrics = fixture();
    const snapshot = JSON.stringify(metrics);
    const html = render("growth", metrics);
    expect(metrics.phases[0].feedToGainRatio.value).toBeNull();
    const starter = phaseRow(html, "starter");
    expect(starter).toContain("Day 0 → 7");
    expect(starter).toContain("N/A");
    expect(starter).toContain("Losses/removals: bird gain unavailable");
    expect(starter).toContain(formatRossNumber(metrics.phases[0].reference, 3));
    expect(phaseRow(html, "grower")).toContain(
      formatRossNumber(metrics.phases[1].feedToGainRatio.value, 3),
    );
    expect(phaseRow(html, "finisher")).toContain(
      "Not started / no dated records",
    );
    expect(html).toContain("not cumulative FCR or fixed phase targets");
    expect(JSON.stringify(metrics)).toBe(snapshot);
    const harvested = fixture({
      harvest: {
        status: "available",
        records: [
          {
            id: 1,
            flockId: 1,
            harvestDate: "2026-10-11",
            chickenCountLoaded: 100,
            totalLoadedWeightKg: 30,
          },
        ],
      },
    });
    expect(harvested.summary.epef.value).toBeNull();
    const harvestedHtml = render("growth", harvested);
    expect(harvestedHtml).toContain("PEF/EPEF — provisional");
    expect(harvestedHtml).toContain(harvested.summary.epef.reason!);
  });
});
