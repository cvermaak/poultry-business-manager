import React from "react";
import type {
  HarvestEventResult,
  HarvestMetricCoverage,
  HarvestMetrics,
  HarvestReport,
  HarvestReportRow,
} from "@shared/harvest-report";
import { formatAuditTimestamp } from "@/lib/audit-time";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type MetricKey =
  | "loadedBirds"
  | "loadedKg"
  | "averageLoadedKg"
  | "deliveredBirds"
  | "deliveredKg"
  | "averageDeliveredKg"
  | "massLossKg"
  | "massLossPct"
  | "transportMortality";
type MetricDefinition = {
  key: MetricKey;
  label: string;
  digits: number;
  coverage: keyof HarvestMetricCoverage;
  paired: boolean;
  reason: string;
};
const metrics: MetricDefinition[] = [
  {
    key: "loadedBirds",
    label: "Recorded loaded birds — field sum (birds)",
    digits: 0,
    coverage: "loadedBirdEvents",
    paired: false,
    reason: "No valid recorded loaded-bird count.",
  },
  {
    key: "loadedKg",
    label: "Recorded loaded net weight — field sum (kg)",
    digits: 2,
    coverage: "loadedKgEvents",
    paired: false,
    reason: "No valid recorded loaded net weight.",
  },
  {
    key: "averageLoadedKg",
    label: "Paired average loaded weight (kg/bird)",
    digits: 3,
    coverage: "loadedAveragePairs",
    paired: true,
    reason:
      "Requires paired valid loaded kg and a positive loaded-bird count on the same event.",
  },
  {
    key: "deliveredBirds",
    label: "Captured delivered birds — field sum (birds)",
    digits: 0,
    coverage: "deliveredBirdEvents",
    paired: false,
    reason:
      "Actual delivered birds not captured or invalid; loaded birds are not substituted.",
  },
  {
    key: "deliveredKg",
    label: "Captured delivered weight — field sum (kg)",
    digits: 2,
    coverage: "deliveredKgEvents",
    paired: false,
    reason:
      "Actual delivered kg not captured or invalid; loaded kg are not substituted.",
  },
  {
    key: "averageDeliveredKg",
    label: "Paired average delivered weight (kg/bird)",
    digits: 3,
    coverage: "deliveredAveragePairs",
    paired: true,
    reason:
      "Requires paired actual delivered kg and a positive delivered-bird count on the same event.",
  },
  {
    key: "massLossKg",
    label: "Paired recorded load-to-delivery mass loss (kg)",
    digits: 2,
    coverage: "massLossPairs",
    paired: true,
    reason:
      "Requires valid loaded and actual delivered weights on the same event.",
  },
  {
    key: "massLossPct",
    label: "Paired recorded load-to-delivery mass loss (%)",
    digits: 2,
    coverage: "massLossPairs",
    paired: true,
    reason:
      "Requires paired weights and a positive paired loaded-kg denominator.",
  },
  {
    key: "transportMortality",
    label: "Recorded transport deaths — field sum (birds)",
    digits: 0,
    coverage: "transportMortalityEvents",
    paired: false,
    reason:
      "No valid recorded transport mortality; it is not inferred from loaded minus delivered birds.",
  },
];
const transportCaveat =
  "Default-zero transport mortality does not prove an explicitly captured zero; never inferred from loaded minus delivered birds.";

function Value({
  value,
  digits = 0,
  reason,
}: {
  value: number | null;
  digits?: number;
  reason: string;
}) {
  return value == null || !Number.isFinite(value) ? (
    <span className="block text-muted-foreground">
      N/A<span className="mt-1 block text-xs font-normal">{reason}</span>
    </span>
  ) : (
    <span className="tabular-nums">
      {value.toLocaleString("en-ZA", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })}
    </span>
  );
}

function Issues({
  items,
  empty = "No additional source exceptions reported; completeness is not certified.",
}: {
  items: string[];
  empty?: string;
}) {
  return items.length ? (
    <ul className="list-disc space-y-1 pl-4 text-sm text-amber-900 dark:text-amber-200">
      {items.map((issue, index) => (
        <li key={index}>{issue}</li>
      ))}
    </ul>
  ) : (
    <p className="text-sm text-muted-foreground">{empty}</p>
  );
}

function SourceIssues({ items }: { items: string[] }) {
  return (
    <>
      <Issues items={items.slice(0, 2)} />
      {items.length > 2 && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer">
            {items.length - 2} more source warnings
          </summary>
          <div className="mt-2">
            <Issues items={items.slice(2)} />
          </div>
        </details>
      )}
    </>
  );
}

function ScrollTable({
  caption,
  headers,
  children,
}: {
  caption: string;
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <div
      className="overflow-x-auto rounded-lg border"
      tabIndex={0}
      role="region"
      aria-label={caption}
    >
      <table className="w-full min-w-max text-left text-sm [&_th]:px-4 [&_th]:py-3 [&_td]:px-4 [&_td]:py-3 [&_td]:align-top">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            {headers.map(label => (
              <th
                key={label}
                scope="col"
                className="max-w-48 whitespace-normal font-medium"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">{children}</tbody>
      </table>
    </div>
  );
}

function Counts({
  value,
  catchExceptionCount,
}: {
  value: HarvestMetrics;
  catchExceptionCount: number;
}) {
  return (
    <div className="space-y-1 text-xs">
      <p>
        {value.reviewedEventCount} reviewed unique harvest IDs ·{" "}
        {value.eligibleEventCount} eligible events · {value.excludedEventCount}{" "}
        excluded events
      </p>
      <p>{catchExceptionCount} catch reconciliation exceptions</p>
      {value.eligibleEventCount === 0 && (
        <p className="text-muted-foreground">
          {value.reviewedEventCount === 0
            ? "No recorded harvests in the period; not a zero-weight harvest."
            : "No eligible harvest events; reviewed exceptions do not contribute to totals."}
        </p>
      )}
      {(value.excludedEventCount > 0 || catchExceptionCount > 0) && (
        <p className="font-medium text-amber-900 dark:text-amber-200">
          Reconciliation required — known-only / partial results; excluded
          events and catch exceptions are not contributions.
        </p>
      )}
    </div>
  );
}

function Metric({
  definition,
  value,
  catchExceptionCount,
}: {
  definition: MetricDefinition;
  value: HarvestMetrics;
  catchExceptionCount: number;
}) {
  const n = value.coverage[definition.coverage];
  const total = value.eligibleEventCount;
  const partial =
    n < total || value.excludedEventCount > 0 || catchExceptionCount > 0;
  const displayValue = total > 0 && n > 0 ? value[definition.key] : null;
  const reason =
    total === 0
      ? "No eligible harvest events; no zero or actual measurement is inferred."
      : definition.reason;
  return (
    <div className="space-y-1">
      <Value value={displayValue} digits={definition.digits} reason={reason} />
      <p className="text-xs font-normal text-muted-foreground">
        {definition.paired ? "Paired" : "Field"} coverage: {n} / {total}{" "}
        eligible events
      </p>
      <p
        className={`text-xs font-normal ${partial ? "text-amber-900 dark:text-amber-200" : "text-muted-foreground"}`}
      >
        {total === 0 || n === 0
          ? `Unavailable — no covered eligible observations${partial ? "; known-only / partial coverage" : ""}`
          : partial
            ? "Known-only / partial"
            : "Known recorded observations — coverage is not completeness certification"}
      </p>
      {(definition.key === "massLossKg" || definition.key === "massLossPct") &&
        displayValue != null &&
        displayValue < 0 && (
          <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
            Negative mass loss — delivered weight exceeds loaded weight; review,
            not clamped.
          </p>
        )}
    </div>
  );
}

function RawValue({ value }: { value: number | string | null }) {
  if (value == null)
    return (
      <span className="text-muted-foreground">N/A — not recorded (null)</span>
    );
  if (typeof value === "string" && !value.trim())
    return (
      <span className="text-muted-foreground" data-source-type="string">
        {value === ""
          ? "Empty string — not recorded"
          : "Whitespace-only string — not recorded"}
        <span className="whitespace-pre-wrap">{value}</span>
      </span>
    );
  return (
    <span
      className="whitespace-pre-wrap break-words font-mono text-xs"
      data-source-type={typeof value}
    >
      {String(value)}
    </span>
  );
}

/** Pure applied snapshot; the parent owns filters, data access, details dialog, and CSV. */
export function HarvestReportView({
  report,
  onSelectFlock,
}: {
  report: HarvestReport;
  onSelectFlock?: (row: HarvestReportRow) => void;
}) {
  const summary = report.summary;
  return (
    <section className="space-y-5" aria-label="Applied Harvest Results">
      <Card className="border-t-4 border-t-primary">
        <CardHeader>
          <CardTitle>
            <h2 className="text-lg">Applied harvest snapshot</h2>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Period (inclusive):{" "}
            {report.filters.startDate ?? "Available beginning"} (S) →{" "}
            {report.filters.endDate} (E). Harvest operational dates S…E only.
          </p>
          <p className="text-xs text-muted-foreground">
            Generated{" "}
            {formatAuditTimestamp(report.generatedAt, report.timezone)} ·
            Company timezone: {report.timezone}
          </p>
          <p className="text-xs text-muted-foreground">
            House ID: {report.filters.houseId ?? "All"} · Flock ID:{" "}
            {report.filters.flockId ?? "All"}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4 sm:flex-row sm:items-start sm:justify-between">
            <strong className="text-sm">
              {summary.flockCount} selected flocks
            </strong>
            <Counts
              value={summary}
              catchExceptionCount={summary.catchExceptionCount}
            />
          </div>
          <p className="text-sm font-medium">
            Known recorded results only: each metric has independent n/N
            eligible-event coverage. Field sums and paired populations can
            differ; missing actual delivery stays N/A.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {metrics.map(definition => (
              <div
                key={definition.key}
                className="rounded-lg border bg-muted/20 p-4"
              >
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  {definition.label}
                </p>
                <Metric
                  definition={definition}
                  value={summary}
                  catchExceptionCount={summary.catchExceptionCount}
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{transportCaveat}</p>
          <SourceIssues items={summary.issues} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="text-lg">Flock harvest comparison</h2>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Scroll horizontally for all columns. House labels, placement and
            current status are current recorded metadata, not historical
            snapshots.
          </p>
        </CardHeader>
        <CardContent>
          {!report.rows.length ? (
            <p className="py-6 text-center text-muted-foreground">
              No matching flocks placed on or before E. Try different applied
              filters. An empty cohort does not confirm zero harvests or
              delivery.
            </p>
          ) : (
            <ScrollTable
              caption="Harvest comparison with explicit units and independent metric coverage"
              headers={[
                "House / flock",
                "Placement / current recorded status",
                ...metrics.map(definition => definition.label),
                "Source coverage / reconciliation",
              ]}
            >
              {report.rows.map(row => (
                <tr key={row.flockId}>
                  <th scope="row" className="max-w-64 font-medium">
                    <span className="block">{row.houseName}</span>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span>{row.flockNumber}</span>
                      {onSelectFlock && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onSelectFlock(row)}
                          aria-label={`View details for ${row.flockNumber} (flock #${row.flockId})`}
                        >
                          View details
                        </Button>
                      )}
                    </div>
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      House{" "}
                      {row.houseId == null
                        ? "N/A — not linked"
                        : `#${row.houseId}`}{" "}
                      · Flock #{row.flockId}
                    </span>
                  </th>
                  <td>
                    {row.placementDate ?? "N/A — placement not recorded"}
                    <span className="block text-xs text-muted-foreground">
                      Current status: {row.currentStatus}
                    </span>
                  </td>
                  {metrics.map(definition => (
                    <td key={definition.key} className="max-w-64">
                      <Metric
                        definition={definition}
                        value={row.metrics}
                        catchExceptionCount={row.catchExceptions.length}
                      />
                    </td>
                  ))}
                  <td className="max-w-80 whitespace-normal">
                    <Counts
                      value={row.metrics}
                      catchExceptionCount={row.catchExceptions.length}
                    />
                    <div className="mt-3">
                      <SourceIssues
                        items={[...row.metrics.issues, ...row.issues]}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </ScrollTable>
          )}
        </CardContent>
      </Card>

      <aside
        className="space-y-3 rounded-xl border bg-muted/30 p-5 text-sm"
        aria-label="Harvest report basis and limitations"
      >
        <h2 className="font-semibold">
          Read recorded harvest results with care
        </h2>
        <p>
          One canonical event per harvest ID. Linked catch sessions provide
          provenance, not additional quantities. Eligible unlinked records are
          labeled “Recorded harvest — completion status unavailable”; source
          data cannot prove manual entry or uniqueness of all unlinked
          historical harvests.
        </p>
        <p>
          Only actual captured delivery fields are used. No loaded-to-delivery
          fallback, planning buffer, configured shrinkage or estimate fills
          missing actuals. {transportCaveat}
        </p>
        <details>
          <summary className="cursor-pointer font-medium">
            Calculation basis and source limitations
          </summary>
          <div className="mt-3 space-y-3">
            <p>
              Grouped averages = sum paired kg ÷ sum paired birds, using the
              same events with both valid inputs and positive counts. They are
              not ratios of independently covered field sums or averages of
              event averages.
            </p>
            <p>
              Paired mass loss = sum paired loaded kg − sum paired delivered kg;
              percentage = loss ÷ sum paired loaded kg × 100. Both use the same
              paired-weight population, not an average of event percentages.
              Negative mass loss remains visible with a warning, not clamped.
            </p>
            <p>
              Totals exclude incompatible or incomplete linked work; catch
              exceptions remain review items. Never combine harvest, catch
              session, batch and crate totals. Catch provenance has no quantity
              fields in this report.
            </p>
            <p>
              Events dated S…E use today’s corrected source records. Current
              metadata is not a historical snapshot. Missing capture is unknown,
              not confirmed zero; coverage cannot certify all harvests or
              deliveries were captured.
            </p>
            <Issues items={report.notes} empty="No additional report notes." />
          </div>
        </details>
      </aside>
    </section>
  );
}

function EventMetric({
  event,
  definition,
}: {
  event: HarvestEventResult;
  definition: MetricDefinition;
}) {
  const contributes = event.eligible && event.inPeriod && event.date != null;
  const value = contributes ? event[definition.key] : null;
  return (
    <>
      <Value
        value={value}
        digits={definition.digits}
        reason={
          contributes
            ? definition.reason
            : "Excluded, undated or outside-period event — not a result contributor; inspect original source values below."
        }
      />
      {(definition.key === "massLossKg" || definition.key === "massLossPct") &&
        value != null &&
        value < 0 && (
          <p className="mt-1 text-xs text-amber-900 dark:text-amber-200">
            Negative mass loss — review, not clamped.
          </p>
        )}
    </>
  );
}

/** Pure detail contents for the parent's dialog, preserving every supplied original source version. */
export function HarvestDetailView({ row }: { row: HarvestReportRow }) {
  const originals = row.events.flatMap(event =>
    event.sourceVersions.map((source, index) => ({
      event,
      source,
      version: index + 1,
    }))
  );
  const catchOriginals = row.catchExceptions.flatMap(exception =>
    exception.sourceVersions.map((source, index) => ({
      exception,
      source,
      version: index + 1,
    }))
  );
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        {row.houseName} · House{" "}
        {row.houseId == null ? "N/A — not linked" : `#${row.houseId}`} ·{" "}
        {row.flockNumber} · Flock #{row.flockId}
        <br />
        Placement: {row.placementDate ?? "N/A — placement not recorded"} ·
        Current status: {row.currentStatus} (current metadata, not historical
        status).
      </p>
      <Counts
        value={row.metrics}
        catchExceptionCount={row.catchExceptions.length}
      />
      <Issues items={[...row.metrics.issues, ...row.issues]} />
      <p className="text-xs text-muted-foreground">
        Derived result metrics are shown only for eligible, dated events inside
        the selected period. Being dated inside the period alone does not make
        an event eligible. Excluded original values are separate review
        evidence, not totals. {transportCaveat}
      </p>

      <section
        className="space-y-2"
        aria-label="Reviewed canonical harvest events"
      >
        <h3 className="font-semibold">Reviewed canonical harvest events</h3>
        <p className="text-xs text-muted-foreground">
          One reviewed row per original unique harvest ID; same-date partial
          harvests are not merged. Session IDs are provenance only. Unlinked
          classification does not prove manual entry. Field values, paired
          averages and paired losses have distinct valid-input requirements.
        </p>
        {row.events.length ? (
          <ScrollTable
            caption="Reviewed harvest events and result eligibility"
            headers={[
              "Harvest ID",
              "Harvest operational date / selected period",
              "Eligibility / source classification",
              "Linked catch session IDs",
              ...metrics.map(definition =>
                definition.label.replace(" — field sum", "")
              ),
              "Issues",
            ]}
          >
            {row.events.map(event => (
              <tr key={event.id}>
                <th scope="row" className="font-medium">
                  #{event.id}
                </th>
                <td>
                  {event.date ?? "N/A — undated or invalid operational date"}
                  <span className="block text-xs text-muted-foreground">
                    {event.date == null
                      ? "N/A — undated; excluded"
                      : event.inPeriod
                        ? "Dated inside selected period"
                        : "Outside selected period — not a period contributor"}
                  </span>
                </td>
                <td className="max-w-72">
                  {event.eligible && event.inPeriod && event.date != null
                    ? "Eligible — period result contributor"
                    : "Excluded — not a period result contributor"}
                  <span className="mt-1 block text-xs">
                    {event.classification}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {event.sourceVersions.length} original source versions
                  </span>
                </td>
                <td>
                  {event.sessionIds.length
                    ? event.sessionIds.map(id => `#${id}`).join(", ")
                    : "Unlinked — completion status unavailable"}
                </td>
                {metrics.map(definition => (
                  <td key={definition.key} className="max-w-64">
                    <EventMetric event={event} definition={definition} />
                  </td>
                ))}
                <td className="max-w-80">
                  <Issues items={event.issues} />
                </td>
              </tr>
            ))}
          </ScrollTable>
        ) : (
          <p className="text-sm text-muted-foreground">
            No reviewed harvest events. No recorded harvests in the period does
            not confirm zero harvested birds, weight or delivery.
          </p>
        )}
      </section>

      <section
        className="space-y-2"
        aria-label="Original harvest source versions"
      >
        <h3 className="font-semibold">
          Original harvest source versions — raw review evidence
        </h3>
        <p className="text-xs text-muted-foreground">
          All eight relevant original fields are preserved, including
          conflicting versions, exact recorded text, missing and invalid values.
          Version numbers indicate deterministic review order only, not recency or an
          arbitrary winner. No original version is independently added to
          totals; inspect its canonical event’s eligibility above.
        </p>
        {originals.length ? (
          <ScrollTable
            caption="Original harvest source versions, all eight raw fields"
            headers={[
              "Reviewed event / review version",
              "Original harvest ID (id)",
              "Original flock ID (flockId)",
              "Raw harvest date (harvestDate)",
              "Raw loaded birds (chickenCountLoaded)",
              "Raw loaded net weight (totalLoadedWeightKg, kg)",
              "Raw delivered birds (chickenCountDelivered)",
              "Raw delivered weight (totalDeliveredWeightKg, kg)",
              "Raw transport deaths (transportMortalities, birds)",
              "Canonical event contribution",
            ]}
          >
            {originals.map(({ event, source, version }) => (
              <tr key={`${event.id}-${version}`}>
                <th scope="row" className="font-medium">
                  Event #{event.id} · Version {version}
                </th>
                <td>
                  <RawValue value={source.id} />
                </td>
                <td>
                  <RawValue value={source.flockId} />
                </td>
                <td>
                  <RawValue value={source.harvestDate} />
                </td>
                <td>
                  <RawValue value={source.chickenCountLoaded} />
                </td>
                <td>
                  <RawValue value={source.totalLoadedWeightKg} />
                </td>
                <td>
                  <RawValue value={source.chickenCountDelivered} />
                </td>
                <td>
                  <RawValue value={source.totalDeliveredWeightKg} />
                </td>
                <td>
                  <RawValue value={source.transportMortalities} />
                </td>
                <td className="max-w-72">
                  {event.eligible && event.inPeriod && event.date != null
                    ? "Canonical event eligible; original version is not a separate contribution"
                    : "Excluded — original values do not contribute to period totals"}
                </td>
              </tr>
            ))}
          </ScrollTable>
        ) : (
          <p className="text-sm text-muted-foreground">
            No original harvest source versions supplied; traceability is
            unavailable, not evidence of zero activity.
          </p>
        )}
      </section>

      <section
        className="space-y-2"
        aria-label="Catch reconciliation exceptions"
      >
        <h3 className="font-semibold">
          Catch reconciliation exceptions — not additional harvests
        </h3>
        <p className="text-xs text-muted-foreground">
          Exceptions are not result contributors. No catch, session, batch or
          crate quantity is added or inferred; only the supplied link provenance
          is reviewed.
        </p>
        {row.catchExceptions.length ? (
          <ScrollTable
            caption="Catch exceptions with IDs, dates and reasons"
            headers={[
              "Reviewed session ID",
              "Reviewed harvest link ID",
              "Recorded catch date",
              "Reconciliation reason",
              "Original versions",
            ]}
          >
            {row.catchExceptions.map((exception, index) => (
              <tr key={`${exception.sessionId}-${index}`}>
                <th scope="row" className="font-medium">
                  #{exception.sessionId}
                </th>
                <td>
                  {exception.harvestRecordId == null
                    ? "N/A — no valid harvest link"
                    : `#${exception.harvestRecordId}`}
                </td>
                <td>
                  {exception.date ?? "N/A — undated or invalid catch date"}
                </td>
                <td className="max-w-80 text-amber-900 dark:text-amber-200">
                  {exception.reason}
                </td>
                <td>{exception.sourceVersions.length}</td>
              </tr>
            ))}
          </ScrollTable>
        ) : (
          <p className="text-sm text-muted-foreground">
            No catch reconciliation exceptions supplied; completion and capture
            completeness are not certified.
          </p>
        )}
        {catchOriginals.length ? (
          <ScrollTable
            caption="Original catch exception source versions, all raw provenance fields"
            headers={[
              "Reviewed session / review version",
              "Original session ID (id)",
              "Original flock ID (flockId)",
              "Raw catch date (catchDate)",
              "Original harvest link (harvestRecordId)",
              "Raw session status (status)",
              "Reconciliation reason",
            ]}
          >
            {catchOriginals.map(({ exception, source, version }, index) => (
              <tr key={`${exception.sessionId}-${version}-${index}`}>
                <th scope="row" className="font-medium">
                  Session #{exception.sessionId} · Version {version}
                </th>
                <td>
                  <RawValue value={source.id} />
                </td>
                <td>
                  <RawValue value={source.flockId} />
                </td>
                <td>
                  <RawValue value={source.catchDate} />
                </td>
                <td>
                  <RawValue value={source.harvestRecordId} />
                </td>
                <td>
                  <RawValue value={source.status} />
                </td>
                <td className="max-w-80">{exception.reason}</td>
              </tr>
            ))}
          </ScrollTable>
        ) : (
          row.catchExceptions.length > 0 && (
            <p className="text-sm text-muted-foreground">
              No original catch exception source versions supplied; inspect
              source records for reconciliation.
            </p>
          )
        )}
      </section>
    </div>
  );
}
