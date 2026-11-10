import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  HarvestEventResult,
  HarvestMetrics,
  HarvestReport,
  HarvestReportRow,
  HarvestResultSourceRecord,
} from "@shared/harvest-report";
import {
  HarvestDetailView,
  HarvestReportView,
} from "../components/HarvestReport";

// Hand-authored, deliberately synthetic display fixtures. No business records or report engine are read.
function makeSource(
  patch: Partial<HarvestResultSourceRecord> = {}
): HarvestResultSourceRecord {
  return {
    id: 701,
    flockId: 10,
    harvestDate: "2026-11-05",
    chickenCountLoaded: "100",
    totalLoadedWeightKg: "200.00",
    chickenCountDelivered: "90",
    totalDeliveredWeightKg: "180.00",
    transportMortalities: "0",
    ...patch,
  };
}
function makeEvent(
  patch: Partial<HarvestEventResult> = {}
): HarvestEventResult {
  return {
    id: 701,
    date: "2026-11-05",
    inPeriod: true,
    eligible: true,
    classification: "Completed compatible catch",
    sessionIds: [900],
    loadedBirds: 100,
    loadedKg: 200,
    averageLoadedKg: 2,
    deliveredBirds: 90,
    deliveredKg: 180,
    averageDeliveredKg: 2,
    massLossKg: 20,
    massLossPct: 10,
    transportMortality: 0,
    issues: [],
    sourceVersions: [makeSource()],
    ...patch,
  };
}
function makeMetrics(patch: Partial<HarvestMetrics> = {}): HarvestMetrics {
  return {
    reviewedEventCount: 4,
    eligibleEventCount: 3,
    excludedEventCount: 1,
    loadedBirds: 170,
    loadedKg: 300,
    averageLoadedKg: 2,
    deliveredBirds: 90,
    deliveredKg: 230,
    averageDeliveredKg: 2,
    massLossKg: 20,
    massLossPct: 10,
    transportMortality: 1,
    coverage: {
      loadedBirdEvents: 3,
      loadedKgEvents: 2,
      loadedAveragePairs: 2,
      deliveredBirdEvents: 1,
      deliveredKgEvents: 2,
      deliveredAveragePairs: 1,
      massLossPairs: 1,
      transportMortalityEvents: 2,
    },
    issues: ["Synthetic incomplete delivery coverage; recorded-only results."],
    ...patch,
  };
}
function makeRow(patch: Partial<HarvestReportRow> = {}): HarvestReportRow {
  return {
    flockId: 10,
    flockNumber: "SYNTHETIC F-10",
    houseId: 3,
    houseName: "Synthetic House A",
    placementDate: "2026-10-01",
    currentStatus: "completed",
    metrics: makeMetrics(),
    events: [
      makeEvent(),
      makeEvent({
        id: 702,
        date: "2026-11-05",
        classification: "Recorded harvest — completion status unavailable",
        sessionIds: [],
        loadedBirds: 50,
        loadedKg: 100,
        deliveredBirds: null,
        deliveredKg: null,
        averageDeliveredKg: null,
        massLossKg: null,
        massLossPct: null,
        transportMortality: null,
        sourceVersions: [
          makeSource({
            id: 702,
            chickenCountLoaded: "50",
            totalLoadedWeightKg: "100",
            chickenCountDelivered: null,
            totalDeliveredWeightKg: null,
            transportMortalities: null,
          }),
        ],
      }),
      makeEvent({
        id: 703,
        date: "2026-11-06",
        loadedBirds: 20,
        loadedKg: null,
        averageLoadedKg: null,
        deliveredBirds: null,
        deliveredKg: 50,
        averageDeliveredKg: null,
        massLossKg: null,
        massLossPct: null,
        transportMortality: 1,
        sessionIds: [901],
        sourceVersions: [
          makeSource({
            id: 703,
            harvestDate: "2026-11-06",
            chickenCountLoaded: "20",
            totalLoadedWeightKg: null,
            chickenCountDelivered: null,
            totalDeliveredWeightKg: "50",
            transportMortalities: "1",
          }),
        ],
      }),
      makeEvent({
        id: 704,
        date: "2026-11-07",
        eligible: false,
        classification: "Conflicting original versions; excluded",
        sessionIds: [902, 903],
        loadedBirds: null,
        loadedKg: null,
        averageLoadedKg: null,
        deliveredBirds: null,
        deliveredKg: null,
        averageDeliveredKg: null,
        massLossKg: null,
        massLossPct: null,
        transportMortality: null,
        issues: ["Conflicting harvest versions; no arbitrary winner."],
        sourceVersions: [
          makeSource({
            id: 704,
            harvestDate: "2026-11-07",
            chickenCountLoaded: "17",
            totalLoadedWeightKg: "-4.500",
            chickenCountDelivered: "19",
            totalDeliveredWeightKg: "-2.125",
            transportMortalities: "-1",
          }),
          makeSource({
            id: 704,
            flockId: 11,
            harvestDate: "2026-11-08",
            chickenCountLoaded: "21",
            totalLoadedWeightKg: "41.250",
            chickenCountDelivered: "22",
            totalDeliveredWeightKg: "43.500",
            transportMortalities: "2",
          }),
        ],
      }),
    ],
    catchExceptions: [
      {
        sessionId: 801,
        harvestRecordId: null,
        date: "2026-11-06",
        reason:
          "Completed catch without a valid harvest link; conflicting session versions.",
        sourceVersions: [
          {
            id: 801,
            flockId: 10,
            catchDate: "2026-11-06",
            harvestRecordId: null,
            status: "completed",
          },
          {
            id: 801,
            flockId: 12,
            catchDate: "2026-11-07",
            harvestRecordId: 999,
            status: "in_progress",
          },
        ],
      },
    ],
    issues: [
      "Synthetic reconciliation exception. Unlinked harvest uniqueness cannot be proven.",
    ],
    ...patch,
  };
}
function makeReport(
  row = makeRow(),
  summaryPatch: Partial<HarvestReport["summary"]> = {}
): HarvestReport {
  return {
    kind: "harvest-results",
    generatedAt: "2026-11-08T22:05:00.000Z",
    timezone: "Africa/Johannesburg",
    filters: {
      startDate: "2026-11-01",
      endDate: "2026-11-08",
      houseId: null,
      flockId: null,
    },
    rows: [row],
    summary: {
      ...row.metrics,
      flockCount: 1,
      catchExceptionCount: row.catchExceptions.length,
      ...summaryPatch,
    },
    notes: [
      "Synthetic note: each canonical harvest ID contributes once, not every original version.",
    ],
  };
}
const render = (
  report = makeReport(),
  onSelectFlock?: (row: HarvestReportRow) => void
) =>
  renderToStaticMarkup(
    React.createElement(HarvestReportView, { report, onSelectFlock })
  );
const detail = (row = makeRow()) =>
  renderToStaticMarkup(React.createElement(HarvestDetailView, { row }));
const formatted = (value: number, digits = 0) =>
  value.toLocaleString("en-ZA", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
const numberSpan = (value: number, digits = 0) =>
  `class="tabular-nums">${formatted(value, digits)}</span>`;
const eventCaption = "Reviewed harvest events and result eligibility";
const originalCaption =
  "Original harvest source versions, all eight raw fields";
const catchCaption = "Catch exceptions with IDs, dates and reasons";
const catchOriginalCaption =
  "Original catch exception source versions, all raw provenance fields";
function tableBody(html: string, caption: string): string {
  const result = html.match(
    new RegExp(
      `<caption[^>]*>${caption}</caption>[\\s\\S]*?<tbody[^>]*>([\\s\\S]*?)</tbody>`
    )
  );
  if (!result) throw new Error(`Missing table: ${caption}`);
  return result[1];
}
function tableRow(html: string, caption: string, heading: string): string {
  const result = tableBody(html, caption)
    .split("</tr>")
    .find(row => row.includes(`>${heading}</th>`));
  if (!result) throw new Error(`Missing row: ${heading}`);
  return result;
}
const eventRow = (html: string, id: number) =>
  tableRow(html, eventCaption, `#${id}`);
const originalRow = (html: string, id: number, version = 1) =>
  tableRow(html, originalCaption, `Event #${id} · Version ${version}`);
const comparisonBody = (html: string) =>
  tableBody(
    html,
    "Harvest comparison with explicit units and independent metric coverage"
  );
const emptyCoverage: HarvestMetrics["coverage"] = {
  loadedBirdEvents: 0,
  loadedKgEvents: 0,
  loadedAveragePairs: 0,
  deliveredBirdEvents: 0,
  deliveredKgEvents: 0,
  deliveredAveragePairs: 0,
  massLossPairs: 0,
  transportMortalityEvents: 0,
};
const emptyValues = {
  loadedBirds: null,
  loadedKg: null,
  averageLoadedKg: null,
  deliveredBirds: null,
  deliveredKg: null,
  averageDeliveredKg: null,
  massLossKg: null,
  massLossPct: null,
  transportMortality: null,
};
const fullCoverage: HarvestMetrics["coverage"] = {
  loadedBirdEvents: 3,
  loadedKgEvents: 3,
  loadedAveragePairs: 3,
  deliveredBirdEvents: 3,
  deliveredKgEvents: 3,
  deliveredAveragePairs: 3,
  massLossPairs: 3,
  transportMortalityEvents: 3,
};
const originalTimezone = process.env.TZ;
afterEach(() => {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
});

describe("Harvest applied snapshot SSR", () => {
  it("renders the applied inclusive operational period and selected filter IDs", () => {
    const report = makeReport();
    report.filters.houseId = 3;
    report.filters.flockId = 10;
    const html = render(report);
    expect(html).toContain(
      "Period (inclusive): 2026-11-01 (S) → 2026-11-08 (E)"
    );
    expect(html).toContain("Harvest operational dates S…E only");
    expect(html).toContain("House ID: 3 · Flock ID: 10");
    expect(html).toContain('aria-label="Applied Harvest Results"');
  });
  it("keeps a blank start as available beginning without inventing a date", () => {
    const report = makeReport();
    report.filters.startDate = null;
    expect(render(report)).toContain(
      "Period (inclusive): Available beginning (S) → 2026-11-08 (E)"
    );
  });
  it.each(["UTC", "America/Los_Angeles", "Pacific/Auckland"])(
    "formats actual canonical UTC generation in company-zone AM/PM independently of host %s",
    zone => {
      process.env.TZ = zone;
      const html = render();
      expect(html).toContain("Generated Nov 9, 2026 at 12:05 AM SAST");
      expect(html).toContain("Company timezone: Africa/Johannesburg");
      expect(html).toContain("2026-11-01 (S) → 2026-11-08 (E)");
      expect(detail()).toContain("2026-11-05");
      expect(detail()).not.toContain("Nov 5");
    }
  );
  it("respects an explicit generation offset without double timezone conversion", () => {
    const report = makeReport();
    report.generatedAt = "2026-11-08T22:00:00+02:00";
    expect(render(report)).toContain("Generated Nov 8, 2026 at 10:00 PM SAST");
  });
  it("rejects ambiguous generation timestamps and invalid company zones for display", () => {
    const report = makeReport();
    report.generatedAt = "2026-11-08 22:00:00";
    expect(render(report)).toContain("Generated Timestamp unavailable");
    report.generatedAt = "2026-11-08T22:05:00Z";
    report.timezone = "Invalid/Zone";
    expect(render(report)).toContain("Generated Timezone unavailable");
  });
  it("labels current metadata and corrected source scope rather than historical status", () => {
    const html = render(
      makeReport(
        makeRow({
          houseName: "Corrected House",
          flockNumber: "Corrected Flock",
          currentStatus: "completed",
        })
      )
    );
    for (const text of [
      "Corrected House",
      "Corrected Flock",
      "2026-10-01",
      "Current status: completed",
      "current recorded metadata, not historical snapshots",
      "today’s corrected source records",
    ])
      expect(html).toContain(text);
    expect(html).not.toContain("Status at E: completed");
  });
  it("shows explicit units and distinguishes independent field sums from paired metrics", () => {
    const html = render();
    for (const label of [
      "Recorded loaded birds — field sum (birds)",
      "Recorded loaded net weight — field sum (kg)",
      "Paired average loaded weight (kg/bird)",
      "Captured delivered birds — field sum (birds)",
      "Captured delivered weight — field sum (kg)",
      "Paired average delivered weight (kg/bird)",
      "Paired recorded load-to-delivery mass loss (kg)",
      "Paired recorded load-to-delivery mass loss (%)",
      "Recorded transport deaths — field sum (birds)",
    ])
      expect(html).toContain(label);
    expect(html).toContain("Field sums and paired populations can differ");
    expect(html).toContain(
      "not ratios of independently covered field sums or averages of event averages"
    );
    expect(html).toContain("not an average of event percentages");
  });
  it("shows independent per-metric eligible-event coverage and explicit exclusion counts", () => {
    const html = render();
    expect(html).toContain(
      "4 reviewed unique harvest IDs · 3 eligible events · 1 excluded events"
    );
    expect(html).toContain("1 catch reconciliation exceptions");
    for (const label of [
      "Field coverage: 3 / 3 eligible events",
      "Field coverage: 2 / 3 eligible events",
      "Field coverage: 1 / 3 eligible events",
      "Paired coverage: 2 / 3 eligible events",
      "Paired coverage: 1 / 3 eligible events",
    ])
      expect(html).toContain(label);
    expect(html).toContain("Known-only / partial");
    expect(html).toContain("Reconciliation required");
    expect(html).toContain(
      "excluded events and catch exceptions are not contributions"
    );
  });
  it("calls complete field coverage known-only / partial when exclusions exist", () => {
    const row = makeRow({
      metrics: makeMetrics({ coverage: fullCoverage, excludedEventCount: 1 }),
      catchExceptions: [],
    });
    expect(
      comparisonBody(render(makeReport(row))).match(/Known-only \/ partial/g)
    ).toHaveLength(9);
  });
  it("calls complete field coverage known-only / partial when catch exceptions exist", () => {
    const row = makeRow({
      metrics: makeMetrics({ coverage: fullCoverage, excludedEventCount: 0 }),
    });
    expect(
      comparisonBody(render(makeReport(row))).match(/Known-only \/ partial/g)
    ).toHaveLength(9);
  });
  it("does not certify biological completeness when all supplied eligible fields are covered", () => {
    const row = makeRow({
      metrics: makeMetrics({ coverage: fullCoverage, excludedEventCount: 0 }),
      catchExceptions: [],
    });
    const body = comparisonBody(render(makeReport(row)));
    expect(body).toContain(
      "Known recorded observations — coverage is not completeness certification"
    );
    expect(body).not.toContain("Known-only / partial");
    expect(body).not.toMatch(
      /text-green|bg-green|text-emerald|Best flock|certified zero/i
    );
  });
  it("renders supplied grouped ratios without recomputing from independent field sums or averaging", () => {
    const row = makeRow({
      metrics: makeMetrics({
        averageLoadedKg: 1.23456,
        averageDeliveredKg: 2.34567,
        massLossPct: 7.89123,
      }),
    });
    const html = render(makeReport(row));
    expect(html).toContain(numberSpan(1.23456, 3));
    expect(html).toContain(numberSpan(2.34567, 3));
    expect(html).toContain(numberSpan(7.89123, 2));
    expect(html).not.toContain(numberSpan(300 / 170, 3));
  });
  it("shows negative grouped mass loss without clamping or performance claims", () => {
    const row = makeRow({
      metrics: makeMetrics({ massLossKg: -20.5, massLossPct: -10.25 }),
    });
    const html = render(makeReport(row));
    expect(html).toContain(numberSpan(-20.5, 2));
    expect(html).toContain(numberSpan(-10.25, 2));
    expect(html).toContain(
      "Negative mass loss — delivered weight exceeds loaded weight; review, not clamped"
    );
    expect(html).not.toMatch(/text-green|bg-green|Good shrinkage|Best flock/i);
  });
  it("shows captured zero counts separately from missing actuals and keeps the transport caveat", () => {
    const row = makeRow({
      metrics: makeMetrics({
        loadedBirds: 0,
        deliveredBirds: 0,
        transportMortality: 0,
        deliveredKg: null,
        averageDeliveredKg: null,
      }),
    });
    const html = render(makeReport(row));
    expect(html).toContain(numberSpan(0));
    expect(html).toContain(
      "Actual delivered kg not captured or invalid; loaded kg are not substituted"
    );
    expect(html).toContain(
      "Default-zero transport mortality does not prove an explicitly captured zero"
    );
    expect(html).toContain("never inferred from loaded minus delivered birds");
  });
  it("renders all unavailable values as N/A with field-specific reasons instead of zero", () => {
    const row = makeRow({ metrics: makeMetrics(emptyValues) });
    const html = render(makeReport(row));
    expect(html).toContain("No valid recorded loaded-bird count");
    expect(html).toContain("No valid recorded loaded net weight");
    expect(html).toContain("positive loaded-bird count on the same event");
    expect(html).toContain("Actual delivered birds not captured or invalid");
    expect(html).toContain("Actual delivered kg not captured or invalid");
    expect(html).toContain("positive delivered-bird count on the same event");
    expect(html).toContain(
      "valid loaded and actual delivered weights on the same event"
    );
    expect(html).toContain("positive paired loaded-kg denominator");
    expect(html).toContain("No valid recorded transport mortality");
    expect(html).not.toContain(numberSpan(0));
    expect(html).not.toMatch(/NaN|Infinity/);
  });
  it("does not display non-finite supplied metrics", () => {
    const row = makeRow({
      metrics: makeMetrics({
        loadedBirds: NaN,
        loadedKg: Infinity,
        massLossPct: -Infinity,
      }),
    });
    const html = render(makeReport(row));
    expect(html).toContain("N/A");
    expect(html).not.toMatch(/NaN|Infinity/);
  });
  it("defensively makes uncovered metrics unavailable even if a snapshot supplies zero", () => {
    const row = makeRow({
      metrics: makeMetrics({
        coverage: emptyCoverage,
        loadedBirds: 0,
        loadedKg: 0,
        deliveredBirds: 0,
        deliveredKg: 0,
        averageLoadedKg: 0,
        averageDeliveredKg: 0,
        massLossKg: 0,
        massLossPct: 0,
        transportMortality: 0,
      }),
    });
    const html = render(makeReport(row));
    expect(html).toContain("Unavailable — no covered eligible observations");
    expect(html).toContain("0 / 3 eligible events");
    expect(html).toContain("known-only / partial coverage");
    expect(html).not.toContain(numberSpan(0));
    expect(html).not.toContain(numberSpan(0, 2));
    expect(html).not.toContain(numberSpan(0, 3));
  });
  it("keeps no-event selected flocks visible as unknown, not zero-weight harvests", () => {
    const row = makeRow({
      events: [],
      catchExceptions: [],
      metrics: makeMetrics({
        ...emptyValues,
        reviewedEventCount: 0,
        eligibleEventCount: 0,
        excludedEventCount: 0,
        coverage: emptyCoverage,
      }),
    });
    const html = render(makeReport(row));
    expect(html).toContain("SYNTHETIC F-10");
    expect(html).toContain(
      "No recorded harvests in the period; not a zero-weight harvest"
    );
    expect(html).toContain(
      "No eligible harvest events; no zero or actual measurement is inferred"
    );
    expect(html).not.toContain(numberSpan(0));
  });
  it("does not claim excluded-only records establish an eligible zero total", () => {
    const row = makeRow({
      metrics: makeMetrics({
        ...emptyValues,
        eligibleEventCount: 0,
        excludedEventCount: 4,
        coverage: emptyCoverage,
      }),
    });
    const html = render(makeReport(row));
    expect(html).toContain(
      "No eligible harvest events; reviewed exceptions do not contribute to totals"
    );
    expect(html).not.toContain(numberSpan(0));
  });
  it("makes an empty cohort explicit rather than generating rows or default-zero totals", () => {
    const report = makeReport(
      makeRow({
        metrics: makeMetrics({
          ...emptyValues,
          reviewedEventCount: 0,
          eligibleEventCount: 0,
          excludedEventCount: 0,
          coverage: emptyCoverage,
        }),
      }),
      { flockCount: 0, catchExceptionCount: 0 }
    );
    report.rows = [];
    const html = render(report);
    expect(html).toContain("No matching flocks placed on or before E");
    expect(html).toContain(
      "An empty cohort does not confirm zero harvests or delivery"
    );
    expect(html).not.toContain("<table");
    expect(html).not.toContain(numberSpan(0));
  });
  it("places accessible details beside the flock name with no routing or CSV ownership", () => {
    const html = render(makeReport(), () => {});
    expect(html).toContain("House #3 · Flock #10");
    expect(html).toContain(
      'aria-label="View details for SYNTHETIC F-10 (flock #10)"'
    );
    expect(html).toMatch(
      /<span>SYNTHETIC F-10<\/span><button[\s\S]*?>View details<\/button>/
    );
    expect(html).toContain('type="button"');
    expect(html).not.toMatch(/href=|Download CSV|Export CSV|\.csv/);
  });
  it("does not render an inert details button if the callback is absent", () => {
    expect(render()).not.toContain("<button");
  });
  it("passes the exact applied row to the parent only when details are selected", () => {
    const report = makeReport();
    const onSelect = vi.fn();
    render(report, onSelect);
    expect(onSelect).not.toHaveBeenCalled();
    const tree = HarvestReportView({ report, onSelectFlock: onSelect });
    function findButton(
      node: React.ReactNode
    ): React.ReactElement<{ onClick: () => void }> | undefined {
      for (const child of React.Children.toArray(node)) {
        if (
          !React.isValidElement<{
            children?: React.ReactNode;
            onClick?: () => void;
            "aria-label"?: string;
          }>(child)
        )
          continue;
        if (
          child.props["aria-label"] ===
          "View details for SYNTHETIC F-10 (flock #10)"
        )
          return child as React.ReactElement<{ onClick: () => void }>;
        const found = findButton(child.props.children);
        if (found) return found;
      }
    }
    const button = findButton(tree);
    expect(button).toBeDefined();
    button!.props.onClick();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toBe(report.rows[0]);
  });
  it("keeps tables keyboard-accessible, horizontally scrollable and summaries responsive", () => {
    expect(render()).toContain("sm:flex-row");
    expect(render()).toContain("sm:grid-cols-2");
    for (const html of [render(), detail()]) {
      expect(html).toContain("overflow-x-auto");
      expect(html).toContain("min-w-max");
      expect(html).toContain('tabindex="0" role="region" aria-label=');
      expect(html).toContain('<caption class="sr-only">');
      expect(html).toContain('scope="col"');
      expect(html).toContain('scope="row"');
    }
    expect(detail().match(/role="region"/g)).toHaveLength(4);
  });
  it("keeps lengthy notes and excess source warnings expandable while primary caveats stay visible", () => {
    const row = makeRow({
      issues: ["Issue one", "Issue two", "Issue three", "Issue four"],
    });
    const html = render(makeReport(row));
    expect(html).toContain("more source warnings</summary>");
    expect(html).toContain("Issue four");
    expect(html).toContain(
      "Calculation basis and source limitations</summary>"
    );
    expect(html).toContain(
      "Synthetic note: each canonical harvest ID contributes once"
    );
  });
  it("shows missing placement and house links as unavailable metadata", () => {
    const row = makeRow({ placementDate: null, houseId: null });
    for (const html of [render(makeReport(row)), detail(row)]) {
      expect(html).toContain("N/A — placement not recorded");
      expect(html).toContain("House N/A — not linked");
      expect(html).not.toContain("House #null");
    }
  });
});

describe("Harvest detail SSR source preservation", () => {
  it("shows one canonical row per unique original harvest ID, retaining same-date partial events", () => {
    const body = tableBody(detail(), eventCaption);
    expect(body.match(/<tr>/g)).toHaveLength(4);
    for (const id of [701, 702, 703, 704])
      expect(body.match(new RegExp(`>#${id}</th>`, "g"))).toHaveLength(1);
    expect(eventRow(detail(), 701)).toContain("2026-11-05");
    expect(eventRow(detail(), 702)).toContain("2026-11-05");
    expect(detail()).toContain("same-date partial harvests are not merged");
    expect(body).not.toContain("2026-11-04");
  });
  it("shows event classification, period eligibility, sessions and original-version counts", () => {
    const html = detail();
    expect(eventRow(html, 701)).toContain(
      "Eligible — period result contributor"
    );
    expect(eventRow(html, 701)).toContain("Completed compatible catch");
    expect(eventRow(html, 701)).toContain("#900");
    expect(eventRow(html, 702)).toContain(
      "Recorded harvest — completion status unavailable"
    );
    expect(eventRow(html, 702)).toContain(
      "Unlinked — completion status unavailable"
    );
    expect(eventRow(html, 704)).toContain("#902, #903");
    expect(eventRow(html, 704)).toContain("2 original source versions");
    expect(html).toContain(
      "Unlinked classification does not prove manual entry"
    );
  });
  it("shows eligible event metrics with kg, birds, kg/bird and percentage units", () => {
    const html = detail();
    const event = eventRow(html, 701);
    expect(html).toContain("Recorded loaded net weight (kg)");
    expect(html).toContain("Captured delivered birds (birds)");
    expect(html).toContain("Paired average delivered weight (kg/bird)");
    expect(html).toContain("mass loss (%)");
    for (const value of [
      numberSpan(100),
      numberSpan(200, 2),
      numberSpan(90),
      numberSpan(180, 2),
      numberSpan(2, 3),
      numberSpan(20, 2),
      numberSpan(10, 2),
      numberSpan(0),
    ])
      expect(event).toContain(value);
  });
  it("never fills absent delivery or transport from loaded data", () => {
    const event = eventRow(detail(), 702);
    expect(event).toContain(numberSpan(50));
    expect(event).toContain(numberSpan(100, 2));
    expect(event).toContain(
      "Actual delivered birds not captured or invalid; loaded birds are not substituted"
    );
    expect(event).toContain(
      "Actual delivered kg not captured or invalid; loaded kg are not substituted"
    );
    expect(event).toContain("No valid recorded transport mortality");
    expect(event).not.toContain(numberSpan(0));
  });
  it("preserves negative loss and the supplied issue rather than clamping or recategorizing", () => {
    const row = makeRow();
    row.events[0] = {
      ...row.events[0],
      deliveredBirds: 110,
      deliveredKg: 220,
      massLossKg: -20,
      massLossPct: -10,
      issues: ["Delivered birds exceed loaded birds; source review required."],
    };
    const html = detail(row);
    const event = eventRow(html, 701);
    expect(event).toContain(numberSpan(-20, 2));
    expect(event).toContain(numberSpan(-10, 2));
    expect(event).toContain(numberSpan(110));
    expect(event).toContain("Negative mass loss — review, not clamped");
    expect(event).toContain("Delivered birds exceed loaded birds");
    expect(event).not.toContain(numberSpan(0, 2));
  });
  it("refuses derived metrics for excluded events even if supplied numeric fields look valid", () => {
    const row = makeRow();
    row.events[3] = {
      ...row.events[3],
      loadedBirds: 99999,
      loadedKg: 88888,
      averageLoadedKg: 77777,
      deliveredBirds: 66666,
      deliveredKg: 55555,
      averageDeliveredKg: 44444,
      massLossKg: 33333,
      massLossPct: 22222,
      transportMortality: 11111,
    };
    const event = eventRow(detail(row), 704);
    expect(event).toContain("Excluded — not a period result contributor");
    expect(event).toContain("Dated inside selected period");
    expect(event).toContain(
      "Excluded, undated or outside-period event — not a result contributor"
    );
    for (const value of [
      99999, 88888, 77777, 66666, 55555, 44444, 33333, 22222, 11111,
    ])
      expect(event).not.toContain(
        formatted(
          value,
          value === 99999 || value === 66666 || value === 11111
            ? 0
            : value === 77777 || value === 44444
              ? 3
              : 2
        )
      );
    expect(originalRow(detail(row), 704)).toContain(
      "Excluded — original values do not contribute to period totals"
    );
  });
  it("defensively excludes undated records despite contradictory eligibility flags", () => {
    const row = makeRow({
      events: [
        makeEvent({
          date: null,
          eligible: true,
          inPeriod: true,
          loadedBirds: 98765,
          sourceVersions: [
            makeSource({ harvestDate: null, chickenCountLoaded: "98765" }),
          ],
        }),
      ],
    });
    const html = detail(row);
    const event = eventRow(html, 701);
    expect(event).toContain("N/A — undated or invalid operational date");
    expect(event).toContain("N/A — undated; excluded");
    expect(event).toContain("Excluded — not a period result contributor");
    expect(event).not.toContain(numberSpan(98765));
    expect(originalRow(html, 701)).toContain(">98765</span>");
  });
  it("keeps outside-period events as review evidence rather than period contributors", () => {
    const row = makeRow({
      events: [
        makeEvent({
          date: "2026-10-31",
          inPeriod: false,
          sourceVersions: [makeSource({ harvestDate: "2026-10-31" })],
        }),
      ],
    });
    const html = detail(row);
    expect(eventRow(html, 701)).toContain(
      "Outside selected period — not a period contributor"
    );
    expect(eventRow(html, 701)).not.toContain(
      "Eligible — period result contributor"
    );
    expect(originalRow(html, 701)).toContain("2026-10-31");
    expect(originalRow(html, 701)).toContain(
      "Excluded — original values do not contribute to period totals"
    );
  });
  it("preserves every relevant original raw field and both conflicting versions without a winner", () => {
    const html = detail();
    const body = tableBody(html, originalCaption);
    expect(body.match(/<tr>/g)).toHaveLength(5);
    for (const label of [
      "Original harvest ID (id)",
      "Original flock ID (flockId)",
      "Raw harvest date (harvestDate)",
      "Raw loaded birds (chickenCountLoaded)",
      "Raw loaded net weight (totalLoadedWeightKg, kg)",
      "Raw delivered birds (chickenCountDelivered)",
      "Raw delivered weight (totalDeliveredWeightKg, kg)",
      "Raw transport deaths (transportMortalities, birds)",
    ])
      expect(html).toContain(label);
    const first = originalRow(html, 704, 1);
    const second = originalRow(html, 704, 2);
    for (const value of [
      "704",
      "10",
      "2026-11-07",
      "17",
      "-4.500",
      "19",
      "-2.125",
      "-1",
    ])
      expect(first).toContain(`>${value}</span>`);
    for (const value of [
      "704",
      "11",
      "2026-11-08",
      "21",
      "41.250",
      "22",
      "43.500",
      "2",
    ])
      expect(second).toContain(`>${value}</span>`);
    expect(html).toContain(
      "Version numbers indicate deterministic review order only, not recency or an arbitrary winner"
    );
    expect(html).toContain(
      "No original version is independently added to totals"
    );
    expect(first).toContain("Excluded — original values do not contribute");
    expect(second).toContain("Excluded — original values do not contribute");
  });
  it("preserves raw zero, null, empty string, whitespace and original numeric text precision distinctly", () => {
    const row = makeRow({
      events: [
        makeEvent({
          sourceVersions: [
            makeSource({
              chickenCountLoaded: 0,
              totalLoadedWeightKg: "200.0000",
              chickenCountDelivered: null,
              totalDeliveredWeightKg: "",
              transportMortalities: "   ",
            }),
          ],
        }),
      ],
    });
    const raw = originalRow(detail(row), 701);
    expect(raw).toContain('data-source-type="number">0</span>');
    expect(raw).toContain('data-source-type="string">200.0000</span>');
    expect(raw).toContain("N/A — not recorded (null)");
    expect(raw).toContain("Empty string — not recorded");
    expect(raw).toContain("Whitespace-only string — not recorded");
    expect(raw).toContain('class="whitespace-pre-wrap">   </span>');
  });
  it("shows exception session/link IDs, actual catch dates and reasons, not catch quantities", () => {
    const html = detail();
    const body = tableBody(html, catchCaption);
    expect(body).toContain("#801");
    expect(body).toContain("N/A — no valid harvest link");
    expect(body).toContain("2026-11-06");
    expect(body).toContain(
      "Completed catch without a valid harvest link; conflicting session versions"
    );
    expect(html).toContain("Exceptions are not result contributors");
    expect(html).toContain(
      "No catch, session, batch or crate quantity is added or inferred"
    );
    expect(body).not.toMatch(
      /Loaded birds|Delivered birds|Catch total|Batch total|Crate total/i
    );
  });
  it("preserves all catch exception original versions including conflicting flock, link, date and status", () => {
    const html = detail();
    const body = tableBody(html, catchOriginalCaption);
    expect(body.match(/<tr>/g)).toHaveLength(2);
    const first = tableRow(
      html,
      catchOriginalCaption,
      "Session #801 · Version 1"
    );
    const second = tableRow(
      html,
      catchOriginalCaption,
      "Session #801 · Version 2"
    );
    for (const value of ["801", "10", "2026-11-06", "completed"])
      expect(first).toContain(`>${value}</span>`);
    expect(first).toContain("N/A — not recorded (null)");
    for (const value of ["801", "12", "2026-11-07", "999", "in_progress"])
      expect(second).toContain(`>${value}</span>`);
    expect(html).toContain("Original harvest link (harvestRecordId)");
    expect(html).toContain("Raw session status (status)");
  });
  it("preserves non-null reviewed catch links and undated exception reasons without inventing date eligibility", () => {
    const row = makeRow();
    row.catchExceptions[0] = {
      ...row.catchExceptions[0],
      harvestRecordId: 999,
      date: null,
      reason: "Invalid date and incompatible harvest flock; excluded.",
    };
    const body = tableBody(detail(row), catchCaption);
    expect(body).toContain("#999");
    expect(body).toContain("N/A — undated or invalid catch date");
    expect(body).toContain(
      "Invalid date and incompatible harvest flock; excluded"
    );
  });
  it("handles missing source-version evidence explicitly instead of synthesizing an original", () => {
    const row = makeRow({ events: [makeEvent({ sourceVersions: [] })] });
    row.catchExceptions[0].sourceVersions = [];
    const html = detail(row);
    expect(html).toContain(
      "No original harvest source versions supplied; traceability is unavailable"
    );
    expect(html).toContain(
      "No original catch exception source versions supplied"
    );
    expect(html).not.toContain(originalCaption);
    expect(html).not.toContain(catchOriginalCaption);
  });
  it("handles completely absent detail events and exceptions without zero rows", () => {
    const html = detail(
      makeRow({
        events: [],
        catchExceptions: [],
        metrics: makeMetrics({
          ...emptyValues,
          reviewedEventCount: 0,
          eligibleEventCount: 0,
          excludedEventCount: 0,
          coverage: emptyCoverage,
        }),
      })
    );
    expect(html).toContain("No reviewed harvest events");
    expect(html).toContain(
      "does not confirm zero harvested birds, weight or delivery"
    );
    expect(html).toContain(
      "No catch reconciliation exceptions supplied; completion and capture completeness are not certified"
    );
    expect(html).not.toContain("<table");
    expect(html).not.toContain(numberSpan(0));
  });
  it("shows all event/detail warnings rather than hiding later reasons", () => {
    const row = makeRow({ issues: ["One", "Two", "Three", "Four"] });
    row.events[0].issues = [
      "Event one",
      "Event two",
      "Event three",
      "Event four",
    ];
    expect(detail(row)).toContain("Four");
    expect(eventRow(detail(row), 701)).toContain("Event four");
  });
  it("escapes injection-like text everywhere, including raw versions and exception status, without executable markup", () => {
    const dangerous =
      '=HYPERLINK("javascript:alert(1)","<script>alert(1)</script>")';
    const row = makeRow({
      flockNumber: dangerous,
      houseName: "<img src=x onerror=alert(1)>",
      currentStatus: "<svg onload=alert(1)>",
    });
    row.events[0].classification = "<script>classification()</script>";
    row.events[0].issues = [dangerous];
    row.events[0].sourceVersions[0] = makeSource({
      harvestDate: "<script>date()</script>",
      chickenCountLoaded: dangerous,
      totalLoadedWeightKg: "<img src=x onerror=alert(1)>",
    });
    row.catchExceptions[0].reason = dangerous;
    row.catchExceptions[0].sourceVersions[0].status =
      "<script>status()</script>";
    const report = makeReport(row);
    report.notes = [dangerous];
    report.summary.issues = ["<img src=x onerror=alert(1)>"];
    for (const html of [render(report, () => {}), detail(row)]) {
      expect(html).toContain("=HYPERLINK(&quot;");
      expect(html).toContain("&lt;script&gt;");
      expect(html).toContain("&lt;img");
      expect(html).toContain("&lt;svg");
      expect(html).not.toMatch(
        /<script|<img|<svg|href=|dangerouslySetInnerHTML|Download CSV/i
      );
    }
    expect(originalRow(detail(row), 701)).toContain(
      "&lt;script&gt;alert(1)&lt;/script&gt;"
    );
    expect(tableBody(detail(row), catchOriginalCaption)).toContain(
      "&lt;script&gt;status()&lt;/script&gt;"
    );
  });
  it("does not mutate supplied snapshots or source-version order during SSR", () => {
    const row = makeRow();
    const report = makeReport(row);
    const before = JSON.stringify(report);
    render(report, () => {});
    detail(row);
    expect(JSON.stringify(report)).toBe(before);
  });
  it("stays within recorded harvest scope without financial, forecast, FCR or cause analysis", () => {
    const html = render() + detail();
    expect(html).toContain(
      "No loaded-to-delivery fallback, planning buffer, configured shrinkage or estimate fills missing actuals"
    );
    expect(html).toContain(
      "Never combine harvest, catch session, batch and crate totals"
    );
    expect(html).not.toMatch(
      /Diagnosis:|Cause:|Forecast yield|Financial margin|FCR:|Report builder|5\.5%|text-green|bg-green|text-emerald/i
    );
  });
});
