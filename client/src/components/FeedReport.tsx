import React from "react";
import type {
  FeedCoverage, FeedDailyDetail, FeedDailySource, FeedFcr, FeedPerformanceReport,
  FeedReportRow, FeedStage, FeedTotals,
} from "@shared/feed-report";
import type { HarvestEventResult, HarvestResultSourceRecord } from "@shared/harvest-report";
import type { ProductionCatchSource } from "@shared/production-reports";
import { formatAuditTimestamp } from "@/lib/audit-time";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const fcrLabel = "Harvest-adjusted recorded-feed FCR";
const provisional = "provisional — recorded-balance basis";
const stages: Array<[FeedStage, string]> = [
  ["starter", "Starter"], ["grower", "Grower"], ["finisher", "Finisher"], ["unspecified", "Unspecified"],
];
const zeroCaveat = "Stored valid zero feed/deaths are record-level values; existing defaults do not establish deliberate zero capture. Missing days remain unknown, not zero.";
const sampleCaveat = "When birds remain, a valid unambiguous mean weight must be measured on E and strictly after the latest loaded-removal date. Same-day partial harvest and weighing have no recorded ordering: N/A until a qualifying later endpoint sample. Older samples are dated observations, not today’s weight; no carrying forward or growth extrapolation.";

function Value({ value, digits = 0, reason }: { value: number | null; digits?: number; reason: string }) {
  return value == null || !Number.isFinite(value)
    ? <span className="block text-muted-foreground">N/A<span className="mt-1 block text-xs font-normal">{reason}</span></span>
    : <span className="tabular-nums">{value.toLocaleString("en-ZA", { minimumFractionDigits: digits, maximumFractionDigits: digits })}</span>;
}
function Issues({ items, empty = "No additional source exceptions reported; completeness is not certified." }: { items: string[]; empty?: string }) {
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
function RawValue({ value }: { value: unknown }) {
  if (value == null) return <span className="text-muted-foreground">N/A — not recorded (null)</span>;
  if (typeof value === "string" && !value.trim()) return <span data-source-type="string" className="text-muted-foreground">
    {value === "" ? "Empty string — not recorded" : "Whitespace-only string — not recorded"}<span className="whitespace-pre-wrap">{value}</span>
  </span>;
  return <span data-source-type={typeof value} className="whitespace-pre-wrap break-words font-mono text-xs">{String(value)}</span>;
}
function RawVersions<T>({ versions, fields }: { versions: T[]; fields: Array<[keyof T, string]> }) {
  return <details className="mt-2 text-sm">
    <summary className="cursor-pointer">Original source versions — raw review evidence ({versions.length})</summary>
    {versions.length ? <div className="mt-2 space-y-3">{versions.map((source, index) => <div key={index} className="rounded-lg border p-3">
      <p className="mb-2 font-medium">Version {index + 1}</p>
      <dl className="grid gap-2 sm:grid-cols-2">{fields.map(([key, label]) => <div key={String(key)}><dt className="text-xs text-muted-foreground">{label}</dt><dd><RawValue value={source[key]} /></dd></div>)}</dl>
    </div>)}</div> : <p className="mt-2 text-muted-foreground">No original source versions supplied; traceability unavailable, not evidence of zero activity.</p>}
  </details>;
}
const dailyFields: Array<[keyof FeedDailySource, string]> = [
  ["id", "Original daily ID (id)"], ["flockId", "Original flock ID (flockId)"], ["recordDate", "Raw operational date (recordDate)"],
  ["dayNumber", "Raw day number (dayNumber)"], ["feedConsumed", "Raw recorded feed (feedConsumed, kg)"], ["feedType", "Raw feed stage (feedType)"],
  ["mortality", "Raw mortality (mortality, birds)"], ["averageWeight", "Raw sampled mean (averageWeight, kg/bird)"],
];
const harvestFields: Array<[keyof HarvestResultSourceRecord, string]> = [
  ["id", "Original harvest ID (id)"], ["flockId", "Original flock ID (flockId)"], ["harvestDate", "Raw harvest date (harvestDate)"],
  ["chickenCountLoaded", "Raw loaded birds (chickenCountLoaded)"], ["totalLoadedWeightKg", "Raw loaded net weight (totalLoadedWeightKg, kg)"],
  ["chickenCountDelivered", "Raw delivered birds (chickenCountDelivered)"], ["totalDeliveredWeightKg", "Raw delivered weight (totalDeliveredWeightKg, kg)"],
  ["transportMortalities", "Raw transport deaths (transportMortalities, birds)"],
];
const catchFields: Array<[keyof ProductionCatchSource, string]> = [
  ["id", "Original session ID (id)"], ["flockId", "Original flock ID (flockId)"], ["catchDate", "Raw catch date (catchDate)"],
  ["harvestRecordId", "Original harvest link (harvestRecordId)"], ["status", "Raw session status (status)"],
];

function Totals({ value }: { value: FeedTotals }) {
  return <div className="space-y-2">
    <Value value={value.validRecords > 0 ? value.kg : null} digits={2} reason="No valid recorded consumption in this scope; missing capture is not zero." />
    <p className="text-xs text-muted-foreground">{value.validRecords} valid records · {value.validDays} valid dates / {value.expectedDays ?? "N/A — calendar scope unavailable"} calendar days</p>
    <p className="text-xs font-medium">{value.partial ? "Known-only / partial recorded feed" : "Known recorded feed — not biological completeness certification"}</p>
    <dl className="grid gap-2 text-xs sm:grid-cols-2">{stages.map(([key, label]) => <div key={key}>
      <dt className="text-muted-foreground">{label} (kg)</dt><dd><Value value={value.validRecords > 0 ? value.stages[key] : null} digits={2} reason="No valid recorded feed for this stage; not confirmed zero." /></dd>
    </div>)}</dl>
    {value.issues.length > 0 && <details className="text-xs"><summary className="cursor-pointer">Feed subtotal warnings</summary><Issues items={value.issues} /></details>}
  </div>;
}
function Coverage({ value }: { value: FeedCoverage }) {
  return <div className="space-y-1 text-xs">
    <p>Placement…Q inclusive: {value.recordedDays} recorded dates / {value.expectedDays ?? "N/A — calendar scope unavailable"} expected calendar days</p>
    <p>Valid feed days: {value.validFeedDays} · Valid mortality days: {value.validMortalityDays} · Missing feed days: {value.missingFeedDays ?? "N/A — unknown"}</p>
    <p>{value.feedRecords} valid feed records · {value.zeroFeedRecords} stored zero-feed records</p>
    <p>{value.complete ? "Complete recorded-day coverage — subject to capture caveats" : "Incomplete or unresolved daily coverage — FCR unavailable"}</p>
    <Issues items={value.issues} empty="Coverage does not certify physical stock or deliberate zero capture." />
  </div>;
}
function Fcr({ value }: { value: FeedFcr }) {
  return <div className="space-y-2">
    <Value value={value.eligible && value.value != null && value.value > 0 ? value.value : null} digits={3} reason={value.reasons.length ? value.reasons.join("; ") : "No qualifying positive recorded-feed / biomass ratio; review coverage and reconciliation."} />
    <p className="text-xs font-medium">{provisional}</p>
    <p className="text-xs">Status: {value.status} · Basis: {value.basis}</p>
    <p className="text-xs">Calculation endpoint Q: {value.endpoint ?? "N/A — endpoint unavailable"}<br />Final-harvest closure T: {value.closureDate ?? "N/A — no reconciled final-harvest closure"}</p>
    {value.closureDate && <p className="text-xs text-muted-foreground">Completed-cycle endpoint within selected as-of E. Full harvest needs no remaining-stock sample; positive output is still required. Inspect post-closure activity through E.</p>}
    <p className="text-xs">FCR recorded feed F, placement…Q (kg): <Value value={value.cumulativeFeedKg} digits={2} reason="FCR-scope feed unavailable; not replaced by period feed or placement…E feed." /></p>
    <Issues items={value.reasons} empty="No additional FCR blockers reported; result remains provisional." />
  </div>;
}
function Sample({ row }: { row: FeedReportRow }) {
  return <div className="space-y-1 text-xs">
    <Value value={row.latestWeightKg} digits={3} reason="No valid unambiguous latest captured mean weight." />
    <p>Latest measurement date: {row.latestWeightDate ?? "N/A — no measurement date"}</p>
    <p className="text-muted-foreground">Historical observation only; not carried forward to today or substituted for the qualifying endpoint sample.</p>
  </div>;
}
function Basis() {
  return <div className="space-y-2 text-sm">
    <p><strong>{fcrLabel}</strong> = F / (M + R × W), with R = initial birds − D − L. For R = 0, the basis is M and no remaining-stock weight sample is needed.</p>
    <p>F is recorded feed placement…Q; D is recorded daily deaths; L is the known eligible loaded-count balance and M is actual paired loaded net kg. A count-only event can appear in the balance diagnostic, but blocks numeric FCR: every contributing event must have both positive birds and actual kg on that same event. W is a qualifying endpoint mean weight (kg/bird). R × W is estimated remaining live mass. Positive feed and biomass are required.</p>
    <p>{provisional}. Not net biomass-gain FCR, verified physical stock or a certified performance benchmark. Unknown culls, transfers and additions are not assumed zero; known unresolved movements or harvest links block the ratio. No dead-bird mass or assumed chick mass is added. Transport deaths are not deducted again.</p>
    <p>{zeroCaveat}</p><p>{sampleCaveat}</p>
    <p>For a reconciled full harvest, Q = final-harvest T; otherwise Q = E. Same-day final-harvest feed is included. Positive feed, deaths, additional loads or unresolved activity after closure require reconciliation; current completed status alone is not closure proof.</p>
    <p>Orders, purchases and deliveries are not feed consumption. Unknown stages remain Unspecified. Today’s corrected source records and current metadata are not historical snapshots. Operational dates are not shifted.</p>
  </div>;
}

/** Pure applied snapshot: the parent owns filters, queries, the details dialog and same-snapshot CSV. */
export function FeedReportView({ report, onSelectFlock }: { report: FeedPerformanceReport; onSelectFlock: (row: FeedReportRow) => void }) {
  const summary = report.summary;
  const fullCohort = summary.flockCount > 0 && summary.qualifyingFlocks === summary.flockCount;
  return <section className="space-y-5" aria-label="Applied Feed Performance results">
    <Card className="border-t-4 border-t-primary">
      <CardHeader><CardTitle><h2 className="text-lg">Applied feed performance snapshot</h2></CardTitle>
        <p className="text-sm text-muted-foreground">Period (inclusive): {report.filters.startDate ?? "Available beginning"} (S) → {report.filters.endDate} (E). Period feed S…E; cumulative recorded feed placement…E; FCR feed placement…Q.</p>
        <p className="text-xs text-muted-foreground">Generated {formatAuditTimestamp(report.generatedAt, report.timezone)} · Company timezone: {report.timezone}</p>
        <p className="text-xs text-muted-foreground">UTC reference: {formatAuditTimestamp(report.generatedAt, "UTC")}</p>
        <p className="text-xs text-muted-foreground">House ID: {report.filters.houseId ?? "All"} · Flock ID: {report.filters.flockId ?? "All"}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="rounded-lg border bg-muted/20 p-4 text-sm"><strong>{summary.flockCount} selected flocks</strong> · Qualifying FCR coverage: {summary.qualifyingFlocks} / {summary.flockCount} flocks</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-lg border bg-muted/20 p-4"><h3 className="mb-2 text-sm font-medium">Recorded period feed S…E (kg)</h3><Totals value={summary.periodFeed} /></div>
          <div className="rounded-lg border bg-muted/20 p-4"><h3 className="mb-2 text-sm font-medium">Cumulative recorded feed placement…E (kg)</h3><Totals value={summary.cumulativeFeed} /></div>
          <div className="space-y-2 rounded-lg border bg-muted/20 p-4"><h3 className="text-sm font-medium">Whole-cohort {fcrLabel}</h3>
            <Value value={fullCohort && summary.fcr != null && summary.fcr > 0 ? summary.fcr : null} digits={3} reason={summary.flockCount === 0 ? "Empty cohort; no ratio or zero activity is inferred." : "N/A / incomplete — every selected flock must qualify with a positive finite ratio; no hidden qualifying-only ratio."} />
            <p className="text-xs">{provisional}</p>
            <p className="text-xs">Qualifying cumulative FCR feed (kg): <Value value={summary.fcrFeedKg} digits={2} reason="No qualifying FCR feed subtotal; not zero." /></p>
            <p className="text-xs">Qualifying biomass basis (kg): <Value value={summary.biomassKg} digits={2} reason="No qualifying biomass subtotal; not zero." /></p>
            <p className="text-xs text-muted-foreground">Grouped FCR uses summed unrounded qualifying feed ÷ summed unrounded biomass, never an average of flock FCRs. Qualifying subtotals do not establish a full-cohort ratio. Endpoints and sample dates remain per flock.</p>
          </div>
        </div>
        <Issues items={summary.issues} />
        <p className="text-xs text-muted-foreground">{zeroCaveat}</p>
      </CardContent>
    </Card>
    <Card><CardHeader><CardTitle><h2 className="text-lg">Flock feed comparison</h2></CardTitle>
      <p className="text-sm text-muted-foreground">Details are beside the flock name. Scroll horizontally for all metrics. Placement, house labels and current status are current recorded metadata, not historical snapshots.</p>
    </CardHeader><CardContent>
      {!report.rows.length ? <p className="py-6 text-center text-muted-foreground">No matching flocks placed on or before E. Try different applied filters. An empty cohort does not confirm zero feed consumption.</p> : <ScrollTable caption="Feed comparison with explicit scopes, endpoints and coverage" headers={[
        "House / flock", "Placement / current recorded status", "Recorded period feed S…E (kg)", "Cumulative recorded feed placement…E (kg)", fcrLabel,
        "Latest sampled mean (kg/bird)", "FCR daily coverage / reconciliation",
      ]}>{report.rows.map(row => <tr key={row.flockId}>
        <th scope="row" className="max-w-64 font-medium"><span className="block">{row.houseName}</span>
          <div className="mt-1 flex flex-wrap items-center gap-2"><span>{row.flockNumber}</span><Button type="button" variant="outline" size="sm" onClick={() => onSelectFlock(row)} aria-label={`View details for ${row.flockNumber} (flock #${row.flockId})`}>View details</Button></div>
          <span className="mt-1 block text-xs font-normal text-muted-foreground">House {row.houseId == null ? "N/A — not linked" : `#${row.houseId}`} · Flock #{row.flockId}</span>
        </th>
        <td>{row.placementDate ?? "N/A — placement not recorded"}<span className="block text-xs text-muted-foreground">Current status: {row.currentStatus}</span></td>
        <td className="max-w-72"><Totals value={row.periodFeed} /></td><td className="max-w-72"><Totals value={row.cumulativeFeed} /></td>
        <td className="max-w-80"><Fcr value={row.fcr} /></td><td className="max-w-64"><Sample row={row} /></td>
        <td className="max-w-80"><Coverage value={row.fcr.coverage} /><details className="mt-2 text-sm"><summary className="cursor-pointer">Flock source warnings</summary><Issues items={row.issues} /></details></td>
      </tr>)}</ScrollTable>}
    </CardContent></Card>
    <aside className="space-y-3 rounded-xl border bg-muted/30 p-5" aria-label="Feed report basis and limitations"><h2 className="font-semibold">Read recorded feed and biomass with care</h2><Basis /><Issues items={report.notes} empty="No additional report notes." /></aside>
  </section>;
}

function DailyTable({ records, undated = false }: { records: FeedDailyDetail[]; undated?: boolean }) {
  return <ScrollTable caption={undated ? "Undated daily records — review only" : "Chronological recorded daily feed and mortality"} headers={[
    "Daily ID / operational date", "Recorded day / stage", "Eligible recorded feed (kg)", "Eligible recorded deaths (birds)", "Sampled mean (kg/bird)", "Contribution flags", "Warnings / raw source versions",
  ]}>{records.map((record, index) => {
    const eligible = record.eligible && record.date != null;
    return <tr key={`${record.id}-${index}`}>
      <th scope="row">#{record.id}<span className="block text-xs font-normal">{record.date ?? "N/A — undated or invalid operational date"}</span></th>
      <td>{record.dayNumber ?? "N/A — day number unavailable"}<span className="block text-xs">{stages.find(([key]) => key === record.stage)?.[1] ?? "Unspecified"}</span></td>
      <td><Value value={eligible ? record.feedKg : null} digits={2} reason={eligible ? "Missing or invalid feed; not zero." : "Excluded — not a contribution; raw feed remains visible."} />{eligible && record.feedKg === 0 && <p className="text-xs">Stored zero feed</p>}</td>
      <td><Value value={eligible ? record.mortality : null} reason={eligible ? "Missing or invalid mortality; not zero." : "Excluded — not a contribution; raw mortality remains visible."} />{eligible && record.mortality === 0 && <p className="text-xs">Stored zero deaths</p>}</td>
      <td><Value value={eligible ? record.weightKg : null} digits={3} reason="No eligible valid measured mean; raw measurement remains review evidence." /></td>
      <td className="text-xs">{eligible ? "Eligible recorded observation" : "Excluded — not a contributor"}<br />Period S…E: {eligible && record.inPeriod ? "Yes" : "No"}<br />Cumulative placement…E: {eligible && record.inCumulative ? "Yes" : "No"}<br />FCR placement…Q: {eligible && record.inFcr ? "Yes" : "No"}</td>
      <td className="max-w-96"><Issues items={record.issues} /><RawVersions versions={record.sourceVersions} fields={dailyFields} /></td>
    </tr>;
  })}</ScrollTable>;
}
function HarvestTable({ events, row, undated = false }: { events: HarvestEventResult[]; row: FeedReportRow; undated?: boolean }) {
  return <ScrollTable caption={undated ? "Undated harvest records — review only" : "Chronological canonical harvest loaded-output sources"} headers={[
    "Harvest ID / operational date", "Same-event paired loaded birds (birds)", "Same-event paired loaded net weight (kg)", "Canonical eligibility / FCR scope", "Catch provenance", "Warnings / raw source versions",
  ]}>{events.map((event, index) => {
    const paired = event.eligible && event.date != null && event.loadedBirds != null && Number.isInteger(event.loadedBirds) && event.loadedBirds > 0 && event.loadedKg != null && Number.isFinite(event.loadedKg) && event.loadedKg > 0;
    const inFcr = paired && row.placementDate != null && row.fcr.endpoint != null && event.date! >= row.placementDate && event.date! <= row.fcr.endpoint;
    return <tr key={`${event.id}-${index}`}>
      <th scope="row">#{event.id}<span className="block text-xs font-normal">{event.date ?? "N/A — undated or invalid operational date"}</span></th>
      <td><Value value={inFcr ? event.loadedBirds : null} reason="Not an eligible same-event loaded pair within placement…Q; raw values remain visible." /></td>
      <td><Value value={inFcr ? event.loadedKg : null} digits={2} reason="Not an eligible same-event loaded pair within placement…Q; no delivery/planning fallback." /></td>
      <td className="max-w-72 text-xs">{event.classification}<br />Canonical source: {event.eligible && event.date != null ? "Eligible" : "Excluded"}<br />{inFcr ? "Eligible paired FCR loaded-output source" : "Excluded from FCR loaded-output contributions — inspect reconciliation"}</td>
      <td className="max-w-64 text-xs">{event.sessionIds.length ? event.sessionIds.map(id => `#${id}`).join(", ") : "Unlinked — completion status unavailable"}<p>Catch links are provenance, not additional harvest quantities.</p></td>
      <td className="max-w-96"><Issues items={event.issues} /><RawVersions versions={event.sourceVersions} fields={harvestFields} /></td>
    </tr>;
  })}</ScrollTable>;
}

/** Pure detail contents; engine order is consumed without sorting or mutating snapshot arrays. */
export function FeedDetailView({ row }: { row: FeedReportRow }) {
  const datedDaily = row.dailyRecords.filter(record => record.date != null);
  const undatedDaily = row.dailyRecords.filter(record => record.date == null);
  const datedHarvests = row.harvestRecords.filter(event => event.date != null);
  const undatedHarvests = row.harvestRecords.filter(event => event.date == null);
  const balance: Array<[string, number | null, number, string]> = [
    ["Initial birds (birds)", row.initialBirds, 0, "No valid placement count."],
    ["D — recorded deaths placement…Q (birds)", row.fcr.cumulativeDeaths, 0, "No valid recorded death balance."],
    ["L — known eligible loaded-count balance placement…Q (birds; may include unpaired events)", row.fcr.loadedBirds, 0, "Loaded count balance unavailable; reconcile same-event pairs before FCR."],
    ["M — paired actual loaded net weight placement…Q (kg)", row.fcr.loadedKg, 2, "Loaded-output mass unavailable; no delivered-weight substitution."],
    ["R — recorded remaining birds at Q (birds)", row.fcr.remainingBirds, 0, "Recorded balance unavailable; not a physical stock count."],
    ["W — supplied endpoint weight candidate (kg/bird)", row.fcr.weightKg, 3, "No endpoint weight candidate supplied, or not required when R = 0."],
    ["Estimated remaining live mass R × W (kg)", row.fcr.estimatedRemainingKg, 2, "Remaining mass unavailable; no old-weight extrapolation."],
    ["Biomass basis M + R × W (kg)", row.fcr.biomassKg, 2, "No valid positive reconciled biomass basis."],
  ];
  return <div className="space-y-5">
    <p className="text-sm text-muted-foreground">{row.houseName} · House {row.houseId == null ? "N/A — not linked" : `#${row.houseId}`} · {row.flockNumber} · Flock #{row.flockId}<br />Placement: {row.placementDate ?? "N/A — placement not recorded"} · Current status: {row.currentStatus} (current metadata, not historical status).</p>
    <div className="grid gap-4 sm:grid-cols-2"><section><h3 className="mb-2 font-semibold">Recorded period feed S…E (kg)</h3><Totals value={row.periodFeed} /></section><section><h3 className="mb-2 font-semibold">Cumulative recorded feed placement…E (kg)</h3><Totals value={row.cumulativeFeed} /></section></div>
    <section className="space-y-3 rounded-lg border bg-muted/20 p-4" aria-label="FCR endpoint and biomass basis"><h3 className="font-semibold">{fcrLabel}</h3><Fcr value={row.fcr} />
      <dl className="grid gap-3 sm:grid-cols-2">{balance.map(([label, value, digits, reason]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd><Value value={value} digits={digits} reason={reason} /></dd></div>)}</dl>
      <p className="text-xs">Endpoint weight candidate measurement date: {row.fcr.weightDate ?? "N/A — no supplied sample / not required for R = 0"}. A supplied candidate does not certify endpoint qualification; inspect FCR reasons. An older weight remains historical review evidence only.</p>
      <h4 className="text-sm font-semibold">Latest captured sample (kg/bird)</h4><Sample row={row} /><Coverage value={row.fcr.coverage} />
    </section>
    <Issues items={row.issues} /><Basis />
    <section className="space-y-2" aria-label="Chronological daily feed records"><h3 className="font-semibold">Recorded daily feed and mortality — chronological</h3>
      <p className="text-xs text-muted-foreground">Dated records follow ascending operational date, then stable source ID supplied by the engine. No missing dates are filled. Valid records before S can support cumulative balances. Eligibility and period, cumulative and FCR contribution flags are separate. Excluded values remain raw review evidence, not contributions.</p>
      {datedDaily.length ? <DailyTable records={datedDaily} /> : <p className="text-sm text-muted-foreground">No dated daily records; no zero feed or mortality is inferred.</p>}
    </section>
    <section className="space-y-2" aria-label="Undated daily review"><h3 className="font-semibold">Undated daily records — separate review</h3>{undatedDaily.length ? <DailyTable records={undatedDaily} undated /> : <p className="text-sm text-muted-foreground">No undated daily review items supplied.</p>}</section>
    <section className="space-y-2" aria-label="Canonical loaded-output harvest records"><h3 className="font-semibold">Canonical loaded-output harvest sources</h3>
      <p className="text-xs text-muted-foreground">Each actual harvest ID is reviewed once. Both a positive integer loaded count and positive actual loaded net kg must be on that same event; values from different events are never paired. Same-date partial harvests are not merged. Compatible completed catch links are provenance only. Accepted unlinked recorded harvests retain completion/uniqueness warnings; delivery-only gaps do not block this loaded-output basis.</p>
      {datedHarvests.length ? <HarvestTable events={datedHarvests} row={row} /> : <p className="text-sm text-muted-foreground">No dated harvest sources supplied; unrecorded removals remain unknown, not certified zero.</p>}
    </section>
    <section className="space-y-2" aria-label="Undated harvest review"><h3 className="font-semibold">Undated harvest records — separate review</h3>{undatedHarvests.length ? <HarvestTable events={undatedHarvests} row={row} undated /> : <p className="text-sm text-muted-foreground">No undated harvest review items supplied.</p>}</section>
    <section className="space-y-2" aria-label="Catch reconciliation exceptions"><h3 className="font-semibold">Catch reconciliation exceptions — not additional harvests</h3>
      <p className="text-xs text-muted-foreground">Exceptions never contribute quantities. No catch, session, batch or crate total is added. Original version numbers are deterministic review order only, not recency or an arbitrary winner; originals are never independently added to totals.</p>
      {row.catchExceptions.length ? <ScrollTable caption="Catch reconciliation provenance and original versions" headers={["Session ID", "Harvest link ID", "Operational date", "Reason / raw versions"]}>
        {[...row.catchExceptions.filter(item => item.date != null), ...row.catchExceptions.filter(item => item.date == null)].map((item, index) => <tr key={`${item.sessionId}-${index}`}>
          <th scope="row">#{item.sessionId}</th><td>{item.harvestRecordId == null ? "N/A — no valid harvest link" : `#${item.harvestRecordId}`}</td><td>{item.date ?? "N/A — undated review only"}</td>
          <td className="max-w-96"><p className="text-sm text-amber-900 dark:text-amber-200">{item.reason}</p><RawVersions versions={item.sourceVersions} fields={catchFields} /></td>
        </tr>)}
      </ScrollTable> : <p className="text-sm text-muted-foreground">No catch exceptions supplied; completion and historical uniqueness are not certified.</p>}
    </section>
  </div>;
}
