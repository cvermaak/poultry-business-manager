import React from "react";
import type { FlockPerformanceReport, FlockPerformanceRow } from "@shared/production-reports";
import { formatAuditTimestamp } from "@/lib/audit-time";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const number = (value: number, digits = 0) => value.toLocaleString("en-ZA", { maximumFractionDigits: digits, minimumFractionDigits: digits });
function Value({ value, digits = 0, reason = "Unavailable; see data-quality issues." }: { value: number | null; digits?: number; reason?: string }) {
  return value == null || !Number.isFinite(value)
    ? <span className="block text-muted-foreground">N/A<span className="mt-1 block text-xs font-normal">{reason}</span></span>
    : <span className="tabular-nums">{number(value, digits)}</span>;
}
function Issues({ items, empty = "No additional source exceptions reported; capture completeness is not certified." }: { items: string[]; empty?: string }) {
  return items.length ? <ul className="list-disc space-y-1 pl-4 text-sm text-amber-900 dark:text-amber-200">{items.map((issue, i) => <li key={i}>{issue}</li>)}</ul>
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
function Sample({ row }: { row: FlockPerformanceRow }) {
  return <><Value value={row.latestWeightKg} digits={3} reason="No unambiguous positive sample on or before E." />
    {row.latestWeightDate && <div className="mt-1 text-xs text-muted-foreground">Measured {row.latestWeightDate}<br />Sample age at E: {row.weightAgeDays ?? "N/A"} days
      {row.weightOutsidePeriod && <strong className="block font-medium text-amber-800 dark:text-amber-200">Outside selected period</strong>}</div>}</>;
}
function Growth({ row }: { row: FlockPerformanceRow }) {
  return <><Value value={row.observedGrowthGPerBirdDay} digits={2} reason="Requires two valid sample dates within the period; see issues." />
    {row.growthStartDate && row.growthEndDate && <div className="mt-1 text-xs text-muted-foreground">{row.growthStartDate} → {row.growthEndDate}<br />{row.growthStartWeightKg == null ? "N/A" : number(row.growthStartWeightKg, 3)} → {row.growthEndWeightKg == null ? "N/A" : number(row.growthEndWeightKg, 3)} kg/bird</div>}
    {row.observedGrowthGPerBirdDay != null && row.observedGrowthGPerBirdDay < 0 && <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">Negative observed sample-mean change; not clamped.</p>}</>;
}

/** Pure snapshot renderer: no data reads, mutations, routing, or inferred metrics. */
export function FlockPerformanceReportView({ report, onSelectFlock }: { report: FlockPerformanceReport; onSelectFlock?: (row: FlockPerformanceRow) => void }) {
  const summary = report.summary;
  const metrics: Array<[string, number | null, number]> = [
    ["Initial birds (birds)", summary.initialBirds, 0], ["Deaths in period (birds)", summary.periodDeaths, 0],
    ["Deaths through E (birds)", summary.cumulativeDeaths, 0], ["Cumulative mortality (%)", summary.cumulativeMortalityPct, 2],
    ["Loaded through E (birds)", summary.loadedBirds, 0], ["Recorded remaining at E (birds)", summary.remainingBirds, 0],
  ];
  return <section className="space-y-5" aria-label="Applied Flock Performance results">
    <Card className="border-t-4 border-t-primary">
      <CardHeader><CardTitle><h2 className="text-lg">Applied report snapshot</h2></CardTitle>
        <p className="text-sm text-muted-foreground">Period (inclusive): {report.filters.startDate ?? "Available beginning"} → {report.filters.endDate} (E). Snapshot: placement through E.</p>
        <p className="text-xs text-muted-foreground">Generated {formatAuditTimestamp(report.generatedAt, report.timezone)} · Company timezone: {report.timezone}</p>
        <p className="text-xs text-muted-foreground">House ID: {report.filters.houseId ?? "All"} · Flock ID: {report.filters.flockId ?? "All"}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm"><strong>{summary.flockCount} selected flocks</strong> · {summary.eligibleFlockCount} eligible for summary · {summary.excludedFlockCount} excluded. Aggregate values require the entire selected cohort to have valid count/balance metrics; otherwise totals are N/A, not a hidden partial subtotal. Eligibility does not certify complete capture.</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{metrics.map(([label, value, digits]) => <div key={label} className="rounded-lg border bg-muted/20 p-4">
          <p className="text-xs font-medium text-muted-foreground">{label}</p><div className="mt-2 text-xl font-semibold"><Value value={value} digits={digits} reason="No valid/comparable total; review exclusions and issues." /></div>
        </div>)}</div>
        <Issues items={summary.issues} />
        <p className="text-xs text-muted-foreground">Mortality % is matched cumulative deaths ÷ initial birds, not an average of flock percentages. No farm-wide sampled-weight or growth average is inferred.</p>
      </CardContent>
    </Card>
    <Card><CardHeader><CardTitle><h2 className="text-lg">Flock comparison</h2></CardTitle>
      <p className="text-sm text-muted-foreground">Scroll horizontally for all columns. Current status is not historical status; elapsed days are not final slaughter age.</p>
    </CardHeader><CardContent>
      {!report.rows.length ? <p className="py-6 text-center text-muted-foreground">No matching flocks placed on or before E. Try different applied filters. No activity is inferred.</p> : <ScrollTable caption="Flock Performance comparison, with explicit units" headers={[
        "House / flock", "Placement / current recorded status", "Initial birds (birds)", "Days since placement at E (days)", "Deaths in period (birds)", "Deaths through E (birds)", "Cumulative mortality (%)", "Loaded through E (birds)", "Recorded remaining at E (birds)", "Latest sampled mean (kg/bird)", "Observed mean-weight growth (g/bird/day)", "Capture coverage / data quality",
      ]}>{report.rows.map(row => <tr key={row.flockId}>
        <th scope="row" className="max-w-44 font-medium"><span className="block">{row.houseName}</span>{row.flockNumber}<span className="block text-xs font-normal text-muted-foreground">House #{row.houseId} · Flock #{row.flockId}</span>{onSelectFlock && <Button className="mt-2" variant="outline" size="sm" onClick={() => onSelectFlock(row)} aria-label={`View contributing records for ${row.flockNumber}`}>View details</Button>}</th>
        <td>{row.placementDate ?? "N/A — placement not recorded"}<span className="block text-xs text-muted-foreground">Current status: {row.currentStatus}</span></td>
        <td><Value value={row.initialBirds} reason="No valid positive placement count." /></td>
        <td><Value value={row.elapsedDays} reason="Placement date unavailable or invalid." /></td>
        <td><Value value={row.periodDeaths} reason="Period mortality unavailable; see issues." /></td>
        <td><Value value={row.cumulativeDeaths} reason="Cumulative mortality unavailable; see issues." /></td>
        <td><Value value={row.cumulativeMortalityPct} digits={2} reason="Requires valid deaths and positive initial birds." /></td>
        <td><Value value={row.loadedBirds} reason="Harvest reconciliation required; see issues." /></td>
        <td className="max-w-48"><Value value={row.remainingBirds} reason="Recorded balance unavailable / reconciliation required." /><p className="mt-1 text-xs text-muted-foreground">Not a verified physical count</p></td>
        <td className="max-w-48"><Sample row={row} /></td><td className="max-w-56"><Growth row={row} /></td>
        <td className="max-w-80 whitespace-normal"><p className="mb-2 text-xs">Period: {row.periodRecordedDays} recorded / {row.expectedPeriodDays ?? "N/A"} calendar days in scope · {row.missingPeriodDays ?? "N/A"} without a record.<br />Through E: {row.recordedDays} recorded days.<br />Summary: {row.summaryEligible ? "Eligible, subject to capture caveats" : "Excluded — see issues"}</p><Issues items={row.issues.slice(0, 3)} />{row.issues.length > 3 && <p className="mt-2 text-xs text-muted-foreground">{row.issues.length - 3} more issues in source details.</p>}</td>
      </tr>)}</ScrollTable>}
    </CardContent></Card>
    <aside className="space-y-3 rounded-xl border bg-muted/30 p-5 text-sm" aria-label="Report basis and limitations">
      <h2 className="font-semibold">Read the recorded balance with care</h2>
      <p>Unrecorded culls, transfers and placement additions are not assumed zero. Remaining birds are initial birds minus recorded daily deaths and eligible loaded birds; transport deaths are not deducted again. Missing daily rows are not confirmed zero-activity days.</p>
      <p>Events dated through E use today’s corrected source records. Current house labels, initial counts and status are current metadata, not historical snapshots. Sample-mean change is an observation, not a forecast.</p>
      <Issues items={report.notes} empty="No additional report notes." />
    </aside>
  </section>;
}

/** Rendered inside the page's accessible dialog; exported separately for SSR/source traceability tests. */
export function FlockPerformanceDetailView({ row }: { row: FlockPerformanceRow }) {
  return <div className="space-y-5">
    <p className="text-sm text-muted-foreground">{row.houseName} · Flock #{row.flockId} · Current status: {row.currentStatus} · Days since placement at E: {row.elapsedDays ?? "N/A"} (not final slaughter age).</p>
    <Issues items={row.issues} />
    <div className="grid gap-4 sm:grid-cols-2"><div><h3 className="mb-1 text-sm font-semibold">Latest sample (kg/bird)</h3><Sample row={row} /></div><div><h3 className="mb-1 text-sm font-semibold">Observed growth (g/bird/day)</h3><Growth row={row} /></div></div>
    <section className="space-y-2"><h3 className="font-semibold">Reviewed daily source records</h3>
      <p className="text-xs text-muted-foreground">Valid rows before S support the cumulative snapshot. Invalid, undated or pre-placement rows may also be listed for review with their exclusion issues; they are not all contributors. Calendar-day coverage is not a required recording schedule after a flock has completed.</p>
      {row.dailyRecords.length ? <ScrollTable caption="Reviewed daily source records" headers={["Daily record ID", "Operational date", "Recorded day number", "Deaths (birds)", "Sampled mean (kg/bird)", "Period eligibility", "Issues"]}>
        {row.dailyRecords.map(source => <tr key={source.id}><th scope="row">#{source.id}</th><td>{source.date ?? "N/A — invalid date"}</td><td>{source.dayNumber}</td><td><Value value={source.mortality} reason="Invalid or missing count." /></td><td><Value value={source.weightKg} digits={3} reason="No valid sampled mean." /></td><td>{source.inPeriod ? "Inside selected period" : "Outside selected period"}</td><td className="max-w-80"><Issues items={source.issues} empty="No source issues reported." /></td></tr>)}
      </ScrollTable> : <p className="text-sm text-muted-foreground">No contributing daily records. This does not confirm zero deaths.</p>}
    </section>
    <section className="space-y-2"><h3 className="font-semibold">Harvest sources through E</h3>
      {row.harvestRecords.length ? <ScrollTable caption="Harvest sources and eligibility" headers={["Harvest record ID", "Operational date", "Loaded (birds)", "Eligibility / classification", "Catch session IDs", "Issues"]}>
        {row.harvestRecords.map(source => <tr key={source.id}><th scope="row">#{source.id}</th><td>{source.date ?? "N/A — invalid date"}</td><td><Value value={source.loadedBirds} reason="Invalid or missing loaded count." /></td><td className="max-w-64">{source.eligible ? "Eligible" : "Excluded — reconciliation required"}<span className="block text-xs">{source.classification}</span></td><td>{source.sessionIds.length ? source.sessionIds.map(id => `#${id}`).join(", ") : "None linked — completion unavailable"}</td><td className="max-w-80"><Issues items={source.issues} empty="No source issues reported." /></td></tr>)}
      </ScrollTable> : <p className="text-sm text-muted-foreground">No recorded harvest sources through E; unrecorded movements remain unknown.</p>}
    </section>
    <section className="space-y-2"><h3 className="font-semibold">Catch-link reconciliation exceptions</h3>
      {row.catchExceptions.length ? <ScrollTable caption="Catch session exceptions" headers={["Catch session ID", "Harvest link ID", "Operational date", "Reason"]}>
        {row.catchExceptions.map((source, i) => <tr key={`${source.sessionId}-${i}`}><th scope="row">#{source.sessionId}</th><td>{source.harvestRecordId == null ? "N/A — no harvest link" : `#${source.harvestRecordId}`}</td><td>{source.date ?? "N/A — invalid date"}</td><td className="max-w-96">{source.reason}</td></tr>)}
      </ScrollTable> : <p className="text-sm text-muted-foreground">No catch-link exceptions reported; historical uniqueness is not certified.</p>}
    </section>
  </div>;
}
