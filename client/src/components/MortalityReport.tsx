import React from "react";
import type { MortalityReport, MortalityReportRow } from "@shared/mortality-report";
import { formatAuditTimestamp } from "@/lib/audit-time";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function Value({ value, digits = 0, reason }: { value: number | null; digits?: number; reason: string }) {
  return value == null || !Number.isFinite(value)
    ? <span className="block text-muted-foreground">N/A<span className="mt-1 block text-xs font-normal">{reason}</span></span>
    : <span className="tabular-nums">{value.toLocaleString("en-ZA", { minimumFractionDigits: digits, maximumFractionDigits: digits })}</span>;
}

function Issues({ items, empty = "No additional source exceptions reported; capture completeness is not certified." }: { items: string[]; empty?: string }) {
  return items.length
    ? <ul className="list-disc space-y-1 pl-4 text-sm text-amber-900 dark:text-amber-200">{items.map((issue, index) => <li key={index}>{issue}</li>)}</ul>
    : <p className="text-sm text-muted-foreground">{empty}</p>;
}

function ScrollTable({ caption, headers, children }: { caption: string; headers: string[]; children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-lg border" tabIndex={0} role="region" aria-label={caption}>
    <table className="w-full min-w-max text-left text-sm [&_th]:px-4 [&_th]:py-3 [&_td]:px-4 [&_td]:py-3 [&_td]:align-top">
      <caption className="sr-only">{caption}</caption>
      <thead className="bg-muted/50 text-muted-foreground"><tr>{headers.map(label => <th key={label} scope="col" className="max-w-48 whitespace-normal font-medium">{label}</th>)}</tr></thead>
      <tbody className="divide-y">{children}</tbody>
    </table>
  </div>;
}

function Coverage({ row }: { row: MortalityReportRow }) {
  return <div className="space-y-2 text-xs">
    <p>Period: {row.periodRecordedDays} recorded / {row.calendarDaysInPeriod ?? "N/A — calendar scope unavailable"} calendar days in scope · {row.unrecordedDaysInPeriod ?? "N/A — missing-day coverage unknown"} without a record.</p>
    <p>Through E: {row.recordedDays} recorded days. Missing days are unknown, not zero mortality; cumulative deaths are recorded totals, not a complete count of losses.</p>
    <p>Period summary: {row.periodSummaryEligible ? "Eligible, subject to capture caveats" : "Excluded — see issues"}<br />Cumulative summary: {row.cumulativeSummaryEligible ? "Eligible, subject to capture caveats" : "Excluded — see issues"}</p>
  </div>;
}

function RawMortality({ value }: { value: number | string | null }) {
  if (value == null) return <span className="text-muted-foreground">N/A — mortality not recorded</span>;
  if (typeof value === "string" && !value.trim()) return <span className="text-muted-foreground">Empty value — mortality not recorded</span>;
  return <span className="whitespace-pre-wrap break-words font-mono text-xs">{String(value)}</span>;
}

const ratioReason = "Requires valid recorded deaths and a positive initial-bird denominator; see issues.";

/** Pure applied snapshot: no source reads, routing, export, or inferred mortality. */
export function MortalityReportView({ report, onSelectFlock }: { report: MortalityReport; onSelectFlock?: (row: MortalityReportRow) => void }) {
  const summary = report.summary;
  const summaryReason = summary.flockCount === 0
    ? "No matching flocks; no mortality total or rate is inferred."
    : "No valid/comparable whole-cohort total; review eligibility and data-quality issues. A partial subtotal is not shown.";
  const metrics: Array<[string, number | null, number, string]> = [
    ["Recorded period deaths (birds)", summary.periodDeaths, 0, summaryReason],
    ["Period mortality (% of initial)", summary.periodMortalityPct, 2, `${summaryReason} The denominator is initial birds.`],
    ["Recorded cumulative deaths through E (birds)", summary.cumulativeDeaths, 0, summaryReason],
    ["Cumulative mortality (% of initial)", summary.cumulativeMortalityPct, 2, `${summaryReason} The denominator is initial birds.`],
  ];

  return <section className="space-y-5" aria-label="Applied Mortality results">
    <Card className="border-t-4 border-t-primary">
      <CardHeader><CardTitle><h2 className="text-lg">Applied mortality snapshot</h2></CardTitle>
        <p className="text-sm text-muted-foreground">Period (inclusive): {report.filters.startDate ?? "Available beginning"} → {report.filters.endDate} (E). Cumulative scope: placement through E.</p>
        <p className="text-xs text-muted-foreground">Generated {formatAuditTimestamp(report.generatedAt, report.timezone)} · Company timezone: {report.timezone}</p>
        <p className="text-xs text-muted-foreground">House ID: {report.filters.houseId ?? "All"} · Flock ID: {report.filters.flockId ?? "All"}</p>
        <p className="text-sm">Period mortality = recorded period deaths ÷ initial birds × 100; cumulative mortality = recorded deaths from placement through E ÷ initial birds × 100. Neither rate uses opening live birds or bird-days as its denominator.</p>
        <p className="text-xs text-muted-foreground">Gaps remain unknown, not zero. Cumulative mortality describes recorded losses, not complete mortality capture.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4 sm:flex-row sm:items-start sm:justify-between">
          <div><p className="text-xs font-medium text-muted-foreground">Initial birds (birds)</p><div className="mt-1 text-lg font-semibold"><Value value={summary.initialBirds} reason={summary.flockCount === 0 ? summaryReason : "No valid positive initial-bird total for the whole selected cohort; see issues."} /></div></div>
          <div className="space-y-1 text-sm"><p><strong>{summary.flockCount} selected flocks</strong></p>
            <p>Period cohort coverage: {summary.periodEligibleFlockCount} / {summary.flockCount} eligible flocks</p>
            <p>Cumulative cohort coverage: {summary.cumulativeEligibleFlockCount} / {summary.flockCount} eligible flocks</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Period and cumulative eligibility are assessed separately. Aggregate deaths and rates require a comparable whole selected cohort, not a hidden eligible-only subtotal. Partial capture leaves missing mortality unknown; eligibility does not certify complete capture.</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([label, value, digits, reason]) => <div key={label} className="rounded-lg border bg-muted/20 p-4">
          <p className="text-xs font-medium text-muted-foreground">{label}</p><div className="mt-2 text-xl font-semibold"><Value value={value} digits={digits} reason={reason} /></div>
        </div>)}</div>
        <Issues items={summary.issues} />
        <p className="text-xs text-muted-foreground">Aggregate percentages use matched deaths ÷ initial birds × 100, not an average of flock percentages.</p>
      </CardContent>
    </Card>

    <Card><CardHeader><CardTitle><h2 className="text-lg">Flock mortality comparison</h2></CardTitle>
      <p className="text-sm text-muted-foreground">Scroll horizontally for all columns. Placement, house labels, initial counts and current status are current recorded metadata, not historical snapshots.</p>
    </CardHeader><CardContent>
      {!report.rows.length ? <p className="py-6 text-center text-muted-foreground">No matching flocks placed on or before E. Try different applied filters. An empty cohort does not confirm zero mortality; no activity is inferred.</p> : <ScrollTable caption="Mortality comparison, with explicit units and coverage" headers={[
        "House / flock", "Placement / current recorded status", "Initial birds (birds)", "Recorded period deaths (birds)", "Period mortality (% of initial)", "Recorded cumulative deaths through E (birds)", "Cumulative mortality (% of initial)", "Capture coverage / data quality",
      ]}>{report.rows.map(row => <tr key={row.flockId}>
        <th scope="row" className="max-w-64 font-medium"><span className="block">{row.houseName}</span>
          <div className="mt-1 flex flex-wrap items-center gap-2"><span>{row.flockNumber}</span>{onSelectFlock && <Button type="button" variant="outline" size="sm" onClick={() => onSelectFlock(row)} aria-label={`View details for ${row.flockNumber} (flock #${row.flockId})`}>View details</Button>}</div>
          <span className="mt-1 block text-xs font-normal text-muted-foreground">House #{row.houseId} · Flock #{row.flockId}</span>
        </th>
        <td>{row.placementDate ?? "N/A — placement not recorded"}<span className="block text-xs text-muted-foreground">Current status: {row.currentStatus}</span></td>
        <td><Value value={row.initialBirds} reason="No valid positive placement count." /></td>
        <td><Value value={row.periodDeaths} reason="Period recorded mortality unavailable; missing or invalid capture is not zero. See issues." /></td>
        <td><Value value={row.periodMortalityPct} digits={2} reason={ratioReason} /></td>
        <td><Value value={row.cumulativeDeaths} reason="Cumulative recorded mortality unavailable; missing or invalid capture is not zero. See issues." /></td>
        <td><Value value={row.cumulativeMortalityPct} digits={2} reason={ratioReason} /></td>
        <td className="max-w-80 whitespace-normal"><Coverage row={row} /><div className="mt-3"><Issues items={row.issues.slice(0, 3)} /></div>{row.issues.length > 3 && <p className="mt-2 text-xs text-muted-foreground">{row.issues.length - 3} more issues in source details.</p>}</td>
      </tr>)}</ScrollTable>}
    </CardContent></Card>

    <aside className="space-y-3 rounded-xl border bg-muted/30 p-5 text-sm" aria-label="Mortality report basis and limitations">
      <h2 className="font-semibold">Read recorded mortality with care</h2>
      <p>Missing daily records are not confirmed zero-death days. Recorded zero is shown only where the supplied metric or captured record is zero. Calendar-day coverage is a comparison, not an assumed recording schedule for a completed flock.</p>
      <p>Daily mortality is not merged with culls or transport deaths. Causes of death and forecasts are not inferred. Events through E use today’s corrected source records; current metadata is not a historical status snapshot.</p>
      <p>Reviewed raw records may include excluded or undated entries. They are shown for traceability, not falsely counted as contributors.</p>
      <Issues items={report.notes} empty="No additional report notes." />
    </aside>
  </section>;
}

/** Pure detail contents for the parent page's accessible dialog; no navigation or data access. */
export function MortalityDetailView({ row }: { row: MortalityReportRow }) {
  return <div className="space-y-5">
    <p className="text-sm text-muted-foreground">{row.houseName} · House #{row.houseId} · {row.flockNumber} · Flock #{row.flockId}<br />Placement: {row.placementDate ?? "N/A — placement not recorded"} · Current status: {row.currentStatus} (current metadata, not historical status).</p>
    <p className="text-sm">Initial birds (birds): <Value value={row.initialBirds} reason="No valid positive placement count; mortality percentages are unavailable." />Mortality percentages use recorded deaths ÷ initial birds × 100, not opening live birds or bird-days.</p>
    <Coverage row={row} />
    <Issues items={row.issues} />

    <section className="space-y-2" aria-label="Recorded daily mortality trend">
      <h3 className="font-semibold">Recorded daily mortality trend</h3>
      <p className="text-xs text-muted-foreground">Only actual captured operational dates are shown, grouped with their reviewed record IDs. An ID in a date group does not certify contribution eligibility; inspect raw-record exclusions below. Missing dates are not filled with zero. Cumulative values run from placement through each captured date and are recorded totals, not proof of complete capture. Valid dates before the selected period can support the cumulative snapshot.</p>
      {row.trend.length ? <ScrollTable caption="Captured-date mortality trend and reviewed record IDs" headers={[
        "Operational date", "Reviewed daily record IDs", "Recorded deaths (birds)", "Recorded cumulative deaths (birds)", "Cumulative mortality (% of initial)", "Selected period", "Issues",
      ]}>{row.trend.map(point => <tr key={point.date}>
        <th scope="row" className="font-medium">{point.date}</th>
        <td>{point.recordIds.length ? point.recordIds.map(id => `#${id}`).join(", ") : "None supplied — source linkage unavailable"}</td>
        <td><Value value={point.recordedDeaths} reason="Captured mortality is missing or invalid; not confirmed zero. See issues." />{point.recordedDeaths === 0 && <p className="mt-1 text-xs text-muted-foreground">Recorded zero deaths</p>}</td>
        <td><Value value={point.cumulativeDeaths} reason="Cumulative recorded mortality unavailable; see earlier capture and issues." /></td>
        <td><Value value={point.cumulativeMortalityPct} digits={2} reason={ratioReason} /></td>
        <td>{point.inPeriod ? "Inside selected period" : "Outside selected period — cumulative scope only"}</td>
        <td className="max-w-80"><Issues items={point.issues} empty="No date-group exceptions reported; missing-day capture remains unknown." /></td>
      </tr>)}</ScrollTable> : <p className="text-sm text-muted-foreground">No captured dates in cumulative scope for the trend. This does not confirm zero deaths; review raw records and exclusions below.</p>}
    </section>

    <section className="space-y-2" aria-label="Reviewed raw daily mortality records">
      <h3 className="font-semibold">Reviewed raw daily mortality records</h3>
      <p className="text-xs text-muted-foreground">Raw mortality is preserved as recorded, separately from the validated count. Excluded, invalid, undated or pre-placement records are review items, not contributors. Being dated inside the period alone does not make a record eligible.</p>
      {row.dailyRecords.length ? <ScrollTable caption="Reviewed raw daily mortality records and eligibility" headers={[
        "Daily record ID", "Operational date", "Recorded day number", "Raw mortality", "Validated count (birds)", "Recorded cumulative deaths (birds)", "Contribution eligibility", "Selected period", "Issues / exclusion reason",
      ]}>{row.dailyRecords.map((source, index) => {
        const contributes = source.eligible && source.date != null;
        return <tr key={`${source.id}-${index}`}>
          <th scope="row" className="font-medium">#{source.id}</th>
          <td>{source.date ?? "N/A — undated or invalid operational date"}</td>
          <td>{source.dayNumber}</td>
          <td className="max-w-64"><RawMortality value={source.rawMortality} /></td>
          <td><Value value={source.deaths} reason="Raw mortality is missing or invalid; no validated count." />{contributes && source.deaths === 0 && <p className="mt-1 text-xs text-muted-foreground">Recorded zero deaths</p>}</td>
          <td><Value value={contributes ? source.cumulativeDeaths : null} reason={contributes ? "Cumulative recorded mortality unavailable; see source issues." : "Excluded or undated record; not a cumulative contributor."} /></td>
          <td>{contributes ? "Eligible for recorded cumulative mortality" : "Excluded — not a contributor"}</td>
          <td>{!contributes ? (source.date ? (source.inPeriod ? "Dated inside selected period; excluded" : "Outside selected period; excluded") : "N/A — undated record; excluded") : source.inPeriod ? "Inside selected period" : "Outside selected period — cumulative scope only"}</td>
          <td className="max-w-80"><Issues items={source.issues} empty={contributes ? "No source exceptions reported; capture completeness is not certified." : "No exclusion reason supplied; record remains excluded. Review source data."} /></td>
        </tr>;
      })}</ScrollTable> : <p className="text-sm text-muted-foreground">No reviewed raw daily records. Missing capture remains unknown; this does not confirm zero mortality.</p>}
    </section>
  </div>;
}
