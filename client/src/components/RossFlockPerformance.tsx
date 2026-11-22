import React, { type ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
  Legend,
} from "recharts";
import type { RossFlockMetrics, RossMetric } from "@shared/ross-flock-metrics";
import { getRossObjective, ROSS_REFERENCE } from "@shared/ross308-reference";
import {
  buildRossChartRows,
  formatRossNumber,
  ROSS_GROWTH_POLICY,
  rossCommercialProgress,
  rossFeedDeviationPct,
  rossGrowthStatus,
  rossRecentWaterChange,
  sortedRossIntervals,
  sortedRossSamples,
} from "@/lib/ross-flock-display";
import type { RossCommercialPlan } from "@/lib/ross-flock-display";

export interface RossFlockPerformanceProps {
  metrics: RossFlockMetrics | null | undefined;
  section: "summary" | "readiness" | "daily" | "growth";
  loading?: boolean;
  error?: boolean;
  commercialPlan: RossCommercialPlan;
}

const colours = {
  actual: "#0f766e",
  objective: "#6d28d9",
  goal: "#c2410c",
  feed: "#1d4ed8",
  water: "#b45309",
};
const dayLabel = (day: unknown) =>
  String(day).startsWith("Day ") ? String(day) : `Day ${day}`;
const ageAxisLabel = {
  value: "Age (days)",
  position: "insideBottom" as const,
  offset: -4,
};
const leftAxisLabel = (value: string) => ({
  value,
  angle: -90,
  position: "insideLeft" as const,
});

function metricText(metric: RossMetric, decimals = 2, unit = "") {
  return formatRossNumber(metric.value, decimals, unit);
}

function MetricCard({
  title,
  metric,
  decimals = 2,
  unit = "",
  children,
}: {
  title: string;
  metric: RossMetric;
  decimals?: number;
  unit?: string;
  children?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">
          {metricText(metric, decimals, unit)}
        </div>
        {metric.value === null && (
          <p className="text-xs text-muted-foreground">
            {metric.reason || "Insufficient recorded data."}
          </p>
        )}
        <div className="text-xs text-muted-foreground space-y-1 mt-1">
          {children}
        </div>
      </CardContent>
    </Card>
  );
}

function RossTable({
  children,
  label,
  className = "min-w-[640px]",
}: {
  children: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="max-h-80 overflow-auto rounded-md border [&>div]:overflow-visible"
    >
      <Table
        className={`${className} tabular-nums [&_th]:whitespace-normal [&_td]:whitespace-normal [&_td]:break-words [&_td]:align-top`}
      >
        {children}
      </Table>
    </div>
  );
}

function NumberCell({ children }: { children: ReactNode }) {
  return (
    <TableCell className="text-right">
      <div className="whitespace-nowrap">{children}</div>
    </TableCell>
  );
}

// Display-only availability labels. Unrecognised engine reasons are retained verbatim.
function phaseReason(reason: string | null) {
  if (!reason) return null;
  const labels: Record<string, string> = {
    "Configured phase from/to days are missing or invalid.":
      "Phase dates missing or invalid.",
    "Phase has not started or has no in-window records.":
      "Not started / no dated records.",
    "Configured feed-phase intervals overlap.": "Configured phases overlap.",
    "Recorded feed type does not match the configured phase/date interval.":
      "Feed type does not match phase dates.",
    "Exact positive weight measurements are required at both phase boundaries; no carried weights.":
      "Exact boundary weights missing; no carried weights.",
    "Phase losses/removals cannot be reconciled without lost/removed-bird gain data.":
      "Losses/removals: bird gain unavailable.",
    "Positive phase weight gain and safe bird count are required.":
      "Positive gain / safe bird count unavailable.",
    "Phase biomass gain exceeds finite numeric range.":
      "Biomass gain exceeds numeric range.",
    "Positive measured phase feed is required; early zero-feed ratio is not reported.":
      "Positive phase feed required.",
  };
  return labels[reason] ?? reason;
}

function SourceNote() {
  return (
    <div className="text-xs text-muted-foreground space-y-1">
      <p>
        <a
          className="underline"
          href={ROSS_REFERENCE.objectiveUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {ROSS_REFERENCE.label} — Performance Objectives{" "}
          {ROSS_REFERENCE.edition}
        </a>
        .
      </p>
      <p>
        <a
          className="underline"
          href={ROSS_REFERENCE.handbookUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Ross Broiler Management Handbook {ROSS_REFERENCE.handbookEdition}
        </a>
        . {ROSS_REFERENCE.context}.
      </p>
      <p>
        Published ages Day 0–56 only; blank reference fields and unsupported
        ages remain N/A. No housing discount, extrapolation or fabricated
        reference zeros.
      </p>
    </div>
  );
}

function CommercialProgress({
  metrics,
  commercialPlan,
}: {
  metrics: RossFlockMetrics;
  commercialPlan: RossCommercialPlan;
}) {
  const latest = sortedRossSamples(metrics.growth.samples).at(-1) ?? null;
  const progress = rossCommercialProgress(
    commercialPlan,
    latest,
    metrics.growth.adgG.value,
  );
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Catching-weight progress</CardTitle>
        <CardDescription>
          Stored farm targets, not breeder objectives or readiness
          certification.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-4 text-sm tabular-nums">
          <div>
            <p className="text-muted-foreground">Catching target</p>
            <p className="text-xl font-semibold">
              {formatRossNumber(progress.catchingWeightKg, 3, "kg")}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Delivered target</p>
            <p className="text-xl font-semibold">
              {formatRossNumber(progress.deliveredWeightKg, 3, "kg")}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Measured progress</p>
            <p className="text-xl font-semibold">
              {formatRossNumber(progress.progressPct, 1, "%")}
            </p>
            <p className="text-xs text-muted-foreground">
              {latest
                ? `Day ${latest.day} · ${latest.date}`
                : "No dated weighing"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">
              Estimated days from weighing
            </p>
            <p className="text-xl font-semibold">
              {formatRossNumber(progress.daysToTarget, 0, "days")}
            </p>
            <p className="text-xs text-muted-foreground">
              {progress.projectionReason ||
                `Observed ADG ${metricText(metrics.growth.adgG, 1, "g/day")} held constant; estimated Day ${progress.projectedAgeDay}. Not a guarantee.`}
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Planned final age:{" "}
          {progress.plannedDay === null ? "N/A" : `Day ${progress.plannedDay}`};
          no shrinkage buffer or fallback growth rate is added.
        </p>
      </CardContent>
    </Card>
  );
}

function Freshness({ metrics }: { metrics: RossFlockMetrics }) {
  const asOf = metrics.asOf;
  const state = (
    day: number | null,
    date: string | null,
    kind: "record" | "weight",
  ) => {
    if (day === null || date === null)
      return kind === "record"
        ? "N/A — no daily record"
        : "N/A — no valid weighing";
    if (
      (asOf.ageDays !== null && day < asOf.ageDays) ||
      (asOf.companyDate !== null && date < asOf.companyDate)
    )
      return `Stale ${kind}`;
    if (asOf.ageDays === null || asOf.companyDate === null)
      return "Freshness N/A";
    return "Current";
  };
  const recordState = state(asOf.recordDay, asOf.recordDate, "record");
  const weightState = state(asOf.weightDay, asOf.weightDate, "weight");
  const stale =
    recordState.startsWith("Stale") || weightState.startsWith("Stale");
  return (
    <Alert
      data-ross-freshness=""
      className={
        stale
          ? "border-amber-600 bg-amber-50 dark:bg-amber-950/20"
          : "border-blue-600 bg-blue-50 dark:bg-blue-950/20"
      }
    >
      <AlertDescription>
        <p className="font-semibold mb-2">Data freshness</p>
        <div className="grid gap-3 sm:grid-cols-3 tabular-nums">
          <div>
            <p className="font-medium">Company age / date</p>
            <p>
              Day {asOf.ageDays ?? "N/A"} · {asOf.companyDate ?? "N/A"}
            </p>
            <p className="text-xs">{asOf.timezone}</p>
          </div>
          <div>
            <p className="font-medium">Latest daily record</p>
            <p>
              Day {asOf.recordDay ?? "N/A"} · {asOf.recordDate ?? "N/A"}
            </p>
            <p className="font-semibold">{recordState}</p>
          </div>
          <div>
            <p className="font-medium">Latest weighing</p>
            <p>
              Day {asOf.weightDay ?? "N/A"} · {asOf.weightDate ?? "N/A"}
            </p>
            <p className="font-semibold">{weightState}</p>
          </div>
        </div>
        <p className="text-xs mt-2">Metrics keep their recorded endpoints.</p>
      </AlertDescription>
    </Alert>
  );
}

function Summary({ metrics }: { metrics: RossFlockMetrics }) {
  const balance = metrics.birdBalances.latest;
  const objective = metrics.summary.weightObjective;
  const fcrObjective =
    metrics.summary.fcrEndpointDay === null
      ? null
      : getRossObjective(metrics.summary.fcrEndpointDay);
  return (
    <div className="mb-6 space-y-3">
      <Freshness metrics={metrics} />
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title="Remaining inventory · recorded"
          metric={{ value: balance.physicalRemaining, reason: balance.reason }}
          decimals={0}
          unit="birds"
        >
          <p>
            Day {balance.day ?? "N/A"} · {balance.date ?? "N/A"}; after losses
            and harvest.
          </p>
          <p>Not verified physical stock.</p>
        </MetricCard>
        <MetricCard
          title="Latest measured average weight"
          metric={metrics.summary.averageWeightKg}
          decimals={3}
          unit="kg"
        >
          <p>
            Day {metrics.asOf.weightDay ?? "N/A"} ·{" "}
            {metrics.asOf.weightDate ?? "N/A"}
          </p>
          <p>
            Same-age objective: {formatRossNumber(objective?.weightKg, 3, "kg")}{" "}
            · deviation {metricText(metrics.summary.weightDeviationPct, 1, "%")}
          </p>
          {metrics.summary.weightDeviationPct.value === null && (
            <p>{metrics.summary.weightDeviationPct.reason}</p>
          )}
        </MetricCard>
        <MetricCard
          title="Cumulative FCR · operational"
          metric={metrics.summary.cumulativeFcr}
          decimals={3}
        >
          <p>
            Aligned endpoint Day {metrics.summary.fcrEndpointDay ?? "N/A"} ·{" "}
            {metrics.summary.fcrEndpointDate ?? "N/A"}
          </p>
          <p>
            Feed {metricText(metrics.summary.fcrFeedKg, 1, "kg")} / output plus
            remaining{" "}
            {metricText(metrics.summary.fcrOutputPlusRemainingKg, 1, "kg")}
          </p>
          <p>
            Same-age published FCR: {formatRossNumber(fcrObjective?.fcr, 3)}
          </p>
        </MetricCard>
      </div>
    </div>
  );
}

function LossCards({ metrics }: { metrics: RossFlockMetrics }) {
  const balance = metrics.birdBalances.latest;
  return (
    <div className="space-y-2">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Found dead"
          metric={{ value: balance.foundDead, reason: balance.splitReason }}
          decimals={0}
          unit="birds"
        >
          <p>{metricText(balance.mortalityPct, 2, "%")} of placed birds</p>
        </MetricCard>
        <MetricCard
          title="Culls"
          metric={{ value: balance.culls, reason: balance.splitReason }}
          decimals={0}
          unit="birds"
        >
          <p>{metricText(balance.cullsPct, 2, "%")} of placed birds</p>
        </MetricCard>
        <MetricCard
          title="On-farm losses"
          metric={{ value: balance.totalOnFarmLosses, reason: balance.reason }}
          decimals={0}
          unit="birds"
        >
          <p>{metricText(balance.totalLossPct, 2, "%")} of placed birds</p>
          <p>
            {balance.splitKnown
              ? "Mortality/cull split recorded."
              : "Historical mortality/cull split unknown; no split inferred."}
          </p>
        </MetricCard>
        <MetricCard
          title="Livability · loss-based"
          metric={balance.livabilityPct}
          unit="%"
        >
          <p>
            Placed: {formatRossNumber(balance.placed, 0)}. Harvested birds
            remain survivors.
          </p>
          <p>
            Harvested: {formatRossNumber(balance.harvestedBirds, 0)}; remaining:{" "}
            {formatRossNumber(balance.physicalRemaining, 0, "birds")}.
          </p>
          {balance.physicalRemaining === null && <p>{balance.reason}</p>}
        </MetricCard>
      </div>
      <p className="text-xs text-muted-foreground">
        Day {balance.day ?? "N/A"} · {balance.date ?? "N/A"}. No universal loss
        grade; harvest is not mortality.
      </p>
    </div>
  );
}

function Consumption({ metrics }: { metrics: RossFlockMetrics }) {
  const rows = [...metrics.dailyConsumption].sort(
    (a, b) => a.day - b.day || a.date.localeCompare(b.date),
  );
  const waterTrend = rossRecentWaterChange(rows);
  const data = rows.map((row) => ({
    day: row.day,
    actualFeedG: row.feedGPerBird.value,
    breederDailyFeedG: row.reference?.dailyFeedG ?? null,
    meteredWaterMl: row.meteredWaterMlPerBird.value,
  }));
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title="Metered water · matched window"
          metric={metrics.water.totalWaterLitres}
          decimals={1}
          unit="L"
        >
          <p>
            {metrics.water.matchedRecordCount} matching daily records; usage,
            not certified intake.
          </p>
        </MetricCard>
        <MetricCard
          title="Feed · matched window"
          metric={metrics.water.matchingFeedKg}
          decimals={1}
          unit="kg"
        >
          <p>Same dates as water total.</p>
        </MetricCard>
        <MetricCard
          title="Water:feed · whole window"
          metric={metrics.water.ratioLitresPerKg}
          unit="L/kg"
        >
          <p>Ratio of matching totals.</p>
        </MetricCard>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Daily feed & water</CardTitle>
          <CardDescription>
            Dated remaining-bird basis; exact same-age feed objective.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Closing inventory after losses/harvest, not bird-day intake. Removal
            days can inflate per-bird usage. Water may include leaks, flushing
            and spillage; never restrict water to match a ratio.
          </p>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart
              data={data}
              margin={{ top: 10, right: 20, bottom: 24, left: 18 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" label={ageAxisLabel} />
              <YAxis
                yAxisId="feed"
                label={leftAxisLabel("Feed (g/bird/day)")}
              />
              <YAxis
                yAxisId="water"
                orientation="right"
                label={{
                  value: "Water (ml/bird/day)",
                  angle: 90,
                  position: "insideRight",
                }}
              />
              <Tooltip labelFormatter={dayLabel} />
              <Legend verticalAlign="top" />
              <Line
                yAxisId="feed"
                type="linear"
                dataKey="actualFeedG"
                stroke={colours.feed}
                strokeWidth={2.5}
                dot={{ r: 3 }}
                name="Recorded feed g/bird/day"
                connectNulls={false}
              />
              <Line
                yAxisId="feed"
                type="linear"
                dataKey="breederDailyFeedG"
                stroke={colours.objective}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                name="Breeder feed g/living bird/day"
                connectNulls={false}
              />
              <Line
                yAxisId="water"
                type="linear"
                dataKey="meteredWaterMl"
                stroke={colours.water}
                strokeWidth={2.5}
                dot={{ r: 4 }}
                name="Metered water ml/bird/day"
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
          <RossTable
            label="Daily consumption records"
            className="min-w-[960px]"
          >
            <TableHeader>
              <TableRow>
                <TableHead>Date / age</TableHead>
                <TableHead>Remaining birds</TableHead>
                <TableHead>Feed kg / g per bird</TableHead>
                <TableHead>Objective feed g / deviation</TableHead>
                <TableHead>Water L / ml per bird</TableHead>
                <TableHead>Water:feed L/kg</TableHead>
                <TableHead>Temperature / humidity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={`${row.date}-${row.day}`}>
                  <TableCell>
                    {row.date}
                    <br />
                    Day {row.day}
                  </TableCell>
                  <NumberCell>{formatRossNumber(row.birdCount, 0)}</NumberCell>
                  <TableCell className="text-right">
                    <span className="whitespace-nowrap">
                      {metricText(row.feedKg, 1)} /{" "}
                      {metricText(row.feedGPerBird, 1)}
                    </span>
                    {row.feedKg.value === null && (
                      <p className="text-xs">{row.feedKg.reason}</p>
                    )}
                    {row.feedGPerBird.value === null &&
                      row.feedGPerBird.reason !== row.feedKg.reason && (
                        <p className="text-xs">{row.feedGPerBird.reason}</p>
                      )}
                  </TableCell>
                  <NumberCell>
                    {formatRossNumber(row.reference?.dailyFeedG, 0)} /{" "}
                    {formatRossNumber(rossFeedDeviationPct(row), 1, "%")}
                  </NumberCell>
                  <TableCell className="text-right">
                    <span className="whitespace-nowrap">
                      {metricText(row.waterLitres, 1)} /{" "}
                      {metricText(row.meteredWaterMlPerBird, 1)}
                    </span>
                    {row.waterLitres.value === null && (
                      <p className="text-xs">{row.waterLitres.reason}</p>
                    )}
                    {row.meteredWaterMlPerBird.value === null &&
                      row.meteredWaterMlPerBird.reason !==
                        row.waterLitres.reason && (
                        <p className="text-xs">
                          {row.meteredWaterMlPerBird.reason}
                        </p>
                      )}
                  </TableCell>
                  <TableCell className="text-right">
                    {metricText(row.waterFeedLitresPerKg)}
                    {row.waterFeedLitresPerKg.value === null && (
                      <p className="text-xs">
                        {row.waterFeedLitresPerKg.reason}
                      </p>
                    )}
                  </TableCell>
                  <NumberCell>
                    {formatRossNumber(row.temperatureC, 1, "°C")} /{" "}
                    {formatRossNumber(row.humidityPct, 1, "%")}
                  </NumberCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>
                    N/A — no validated daily consumption records.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </RossTable>
          <p className="text-xs text-muted-foreground">
            {waterTrend
              ? `Days ${waterTrend.startDay}–${waterTrend.endDay}: water per bird ${formatRossNumber(waterTrend.changePct, 1, "%")}; temperature ${formatRossNumber(waterTrend.previousTemperatureC, 1, "°C")} → ${formatRossNumber(waterTrend.latestTemperatureC, 1, "°C")}. Review environment and metering.`
              : "Water trend: N/A — two latest consecutive dated days with valid per-bird usage are required."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Methodology({ metrics }: { metrics: RossFlockMetrics }) {
  return (
    <details data-ross-methodology="" className="rounded-lg border p-4">
      <summary className="cursor-pointer font-medium">
        Methods & sources
      </summary>
      <div className="mt-4 space-y-3 text-sm text-muted-foreground">
        <p>{ROSS_GROWTH_POLICY}</p>
        <p>
          {metrics.summary.fcrConvention} Operational output-plus-remaining
          biomass is an application bookkeeping convention, not a handbook
          thinning formula. Published breeder FCR includes placement weight and
          is not mortality-corrected.
        </p>
        <p>
          Observed ADG = measured gain ÷ elapsed days; reference ADG uses the
          same endpoints. Published average daily gain since placement is a
          distinct column; published one-day gain does not replace measured
          interval ADG.
        </p>
        <p>
          Sample CV uses n−1 standard deviation ÷ mean × 100, not 100 − CV.
          Within ±10% is a direct sample count, not a universal uniformity
          grade. Sample-count recommendation: at least 100 birds or 1% of
          remaining population, whichever is larger.
        </p>
        <p>
          Day-7 weight check: minimum 4.5× actual measured placement weight; no
          reference-weight substitute. More than 3 percentage points of Day-0 →
          Day-7 CV increase suggests a brooding review.
        </p>
        <p>
          PEF/EPEF is provisional and endpoint-aligned, without universal score
          grades. EPEF is withheld after harvest because no mixed-age harvest
          aggregation method is approved.
        </p>
        <p>
          Configured-phase references = change in published cumulative feed ÷
          change in published weight. These are idealized boundary-derived
          ratios, not published cumulative FCR and not fixed phase targets.
          Actual comparisons are withheld when gain/population reconciliation is
          unsupported.
        </p>
        <p>
          Daily per-bird quantities use end-of-day remaining inventory after
          losses and harvested removals, not bird-day exposure. Removal-day
          denominators can inflate per-bird quantities; deviations are
          descriptive, not intake grades or diagnoses. Published feed is per
          living bird, not a feed order; farm feed can include wastage and
          consumption by subsequently lost or harvested birds.
        </p>
        <p>
          Total metered water ÷ total matching feed; not the mean of daily
          ratios. Contextual water reference: 1.6–1.8 L/kg at 21°C, subject to
          drinker/environment conditions. Approximate requirement increase of
          6.5% per °C above 21°C is not an unlimited correction formula. Metered
          usage can include leaks, flushing and spillage. Never restrict water
          to force a ratio; a deviation is not a medical diagnosis.
        </p>
        <p>
          Commercial targets are stored farm targets. Days-to-target holds
          observed full-span ADG constant from the latest weighing; no shrinkage
          buffer or fallback growth rate. The final goal is not a linear genetic
          growth curve.
        </p>
        <SourceNote />
      </div>
    </details>
  );
}

function Growth({
  metrics,
  commercialPlan,
}: {
  metrics: RossFlockMetrics;
  commercialPlan: RossCommercialPlan;
}) {
  const uniformity = metrics.uniformity.latest;
  const status = rossGrowthStatus(metrics.summary.weightDeviationPct.value);
  const samples = sortedRossSamples(metrics.growth.samples);
  const plan = rossCommercialProgress(
    commercialPlan,
    samples.at(-1) ?? null,
    metrics.growth.adgG.value,
  );
  const chart = buildRossChartRows(metrics.growth.samples, plan.plannedDay);
  const referenceRows = chart.filter((row) => row.day <= 56);
  const intervals = sortedRossIntervals(metrics.growth.intervals);
  // Focus the viewport, never the data: exact reference rows and null gaps remain intact.
  const endpoints = [
    ...samples.map((sample) => sample.day),
    ...(plan.plannedDay === null ? [] : [plan.plannedDay]),
  ];
  const firstAge = samples.length ? Math.min(...endpoints) : 0;
  const lastAge = endpoints.length ? Math.max(...endpoints) : 56;
  const padding = Math.max(2, Math.ceil((lastAge - firstAge) * 0.08));
  const ageExtent: [number, number] = endpoints.length
    ? [Math.max(0, firstAge - padding), lastAge + padding]
    : [0, 56];
  const visibleWeights = chart
    .filter((row) => row.day >= ageExtent[0] && row.day <= ageExtent[1])
    .flatMap((row) => [row.actualWeightKg, row.breederWeightKg])
    .filter((weight): weight is number => weight !== null && Number.isFinite(weight));
  if (plan.catchingWeightKg !== null && plan.plannedDay !== null)
    visibleWeights.push(plan.catchingWeightKg);
  const maximumVisibleWeight = Math.max(0, ...visibleWeights);
  const paddedWeight = maximumVisibleWeight + maximumVisibleWeight * 0.1;
  const weightExtent: [number, number | "auto"] = [
    0,
    maximumVisibleWeight > 0 && Number.isFinite(paddedWeight) ? paddedWeight : "auto",
  ];
  const sampleState = !uniformity
    ? "N/A — no individual-weight sample."
    : uniformity.meetsSampleCountRecommendation === null
      ? "Sample-count check N/A — population unavailable."
      : uniformity.meetsSampleCountRecommendation
        ? "Sample count met."
        : "Low sample count.";
  // Do not repeat engine sampling-location prose; retain invalid-data reasons separately.
  const sampleDataReason =
    uniformity?.reason &&
    !/^(Low sample count:|Sample count met;|Population unavailable for sample-size recommendation;)/.test(
      uniformity.reason,
    )
      ? uniformity.reason
      : null;
  const day0 = samples.find((sample) => sample.day === 0);
  const day7 = samples.find((sample) => sample.day === 7);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className={status.className}>
            Growth: {status.label}
          </CardTitle>
          <CardDescription>
            Same-age weight deviation:{" "}
            {metricText(metrics.summary.weightDeviationPct, 1, "%")}.{" "}
            {metrics.summary.weightDeviationPct.value === null &&
              metrics.summary.weightDeviationPct.reason}
          </CardDescription>
        </CardHeader>
      </Card>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Observed ADG · full span"
          metric={metrics.growth.adgG}
          decimals={1}
          unit="g/day"
        >
          <p>
            Day {metrics.growth.startDay ?? "N/A"}–
            {metrics.growth.endDay ?? "N/A"}
          </p>
          <p>
            Same-interval objective:{" "}
            {metricText(metrics.growth.referenceAdgG, 1, "g/day")}
          </p>
          {metrics.growth.referenceAdgG.value === null && (
            <p>{metrics.growth.referenceAdgG.reason}</p>
          )}
        </MetricCard>
        <MetricCard
          title="Sample CV% (n−1)"
          metric={
            uniformity?.cvPct ?? {
              value: null,
              reason: "Individual weight samples are required.",
            }
          }
          unit="%"
        >
          <p>
            SD:{" "}
            {uniformity ? metricText(uniformity.sampleSdKg, 3, "kg") : "N/A"}
          </p>
        </MetricCard>
        <MetricCard
          title="Direct within ±10% of mean"
          metric={
            uniformity?.within10Pct ?? {
              value: null,
              reason: "Individual weight samples are required.",
            }
          }
          unit="%"
        >
          <p>Measured sample only; no uniformity grade.</p>
        </MetricCard>
        <MetricCard
          title="PEF/EPEF — provisional"
          metric={metrics.summary.epef}
          decimals={1}
        >
          <p>
            Endpoint Day {metrics.summary.fcrEndpointDay ?? "N/A"}; in progress,
            no score grade.
          </p>
        </MetricCard>
      </div>
      <Card data-ross-sampling="">
        <CardHeader>
          <CardTitle>Sampling & first-week checks</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2 tabular-nums">
          <p>
            Latest sample:{" "}
            {uniformity
              ? `Day ${uniformity.day} · ${uniformity.date} · n=${uniformity.sampleCount}; recommendation: ${uniformity.recommendedSampleCount ?? "N/A"}. ${sampleState}`
              : sampleState}
          </p>
          {sampleDataReason && <p>{sampleDataReason}</p>}
          <p className="text-xs text-muted-foreground">
            Sampling locations unrecorded.
          </p>
          <p>
            Day-7 / Day-0 weight multiple:{" "}
            {metricText(metrics.day7.weightMultiple, 2)}
            {metrics.day7.weightMultiple.value !== null ? "×" : ""} ·{" "}
            {metrics.day7.meetsMinimum === null
              ? `N/A — ${metrics.day7.weightMultiple.reason}`
              : metrics.day7.meetsMinimum
                ? "Meets 4.5× check."
                : "Below 4.5× — review chick start."}
          </p>
          <p className="text-xs text-muted-foreground">
            Day 0: {day0?.date ?? "N/A"} · Day 7: {day7?.date ?? "N/A"}
          </p>
          <p>
            Day-0 → Day-7 CV change:{" "}
            {metricText(
              metrics.day7.cvChangePercentagePoints,
              2,
              "percentage points",
            )}{" "}
            ·{" "}
            {metrics.day7.broodingReviewSuggested === null
              ? `N/A — ${metrics.day7.cvChangePercentagePoints.reason}`
              : metrics.day7.broodingReviewSuggested
                ? "Brooding review suggested (>3-point rise)."
                : "No >3-point rise recorded."}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Measured weight & objective</CardTitle>
          <CardDescription>
            Measured points only; commercial goal is separate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ResponsiveContainer width="100%" height={360}>
            <LineChart
              data={chart}
              margin={{ top: 15, right: 24, bottom: 24, left: 12 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                type="number"
                domain={ageExtent}
                allowDataOverflow
                dataKey="day"
                label={ageAxisLabel}
              />
              <YAxis domain={weightExtent} allowDataOverflow label={leftAxisLabel("Weight (kg)")} />
              <Tooltip labelFormatter={dayLabel} />
              <Legend verticalAlign="top" />
              <Line
                type="linear"
                dataKey="breederWeightKg"
                stroke={colours.objective}
                strokeWidth={2.5}
                strokeDasharray="6 4"
                name="Ross objective kg"
                connectNulls={false}
                dot={false}
              />
              <Line
                type="linear"
                dataKey="actualWeightKg"
                stroke="none"
                name="Measured weight kg (points only)"
                connectNulls={false}
                dot={{
                  r: 5,
                  fill: colours.actual,
                  stroke: "#ffffff",
                  strokeWidth: 1.5,
                }}
                activeDot={{ r: 7, fill: colours.actual }}
                isAnimationActive={false}
              />
              {plan.catchingWeightKg !== null && plan.plannedDay !== null && (
                <ReferenceDot
                  x={plan.plannedDay}
                  y={plan.catchingWeightKg}
                  r={7}
                  fill={colours.goal}
                  stroke="#ffffff"
                  strokeWidth={1.5}
                  label={`Commercial goal Day ${plan.plannedDay}`}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground">
            Commercial goal: {formatRossNumber(plan.catchingWeightKg, 3, "kg")}{" "}
            · Day {plan.plannedDay ?? "N/A"}. Measured ages beyond Day 56 have
            no breeder comparison.
          </p>
          <RossTable label="Measured weights" className="min-w-[480px]">
            <TableHeader>
              <TableRow>
                <TableHead>Measured date / day</TableHead>
                <TableHead className="text-right">Actual kg</TableHead>
                <TableHead className="text-right">
                  Same-age objective kg
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {samples.map((sample) => (
                <TableRow key={`${sample.date}-${sample.day}`}>
                  <TableCell>
                    {sample.date} / Day {sample.day}
                  </TableCell>
                  <NumberCell>
                    {formatRossNumber(sample.weightKg, 3)}
                  </NumberCell>
                  <NumberCell>
                    {formatRossNumber(
                      getRossObjective(sample.day)?.weightKg,
                      3,
                    )}
                  </NumberCell>
                </TableRow>
              ))}
              {samples.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3}>
                    N/A — no validated measured weights.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </RossTable>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Measured-interval ADG</CardTitle>
          <CardDescription>
            Observed gain vs same-interval objective.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart
              data={intervals}
              margin={{ top: 10, right: 16, bottom: 24, left: 12 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="interval"
                label={{
                  value: "Age interval (days)",
                  position: "insideBottom",
                  offset: -4,
                }}
              />
              <YAxis label={leftAxisLabel("ADG (g/day)")} />
              <Tooltip labelFormatter={dayLabel} />
              <Legend verticalAlign="top" />
              <Line
                dataKey="adgG"
                stroke="none"
                dot={{ r: 5, fill: colours.actual }}
                name="Observed ADG g/day"
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                dataKey="referenceAdgG"
                stroke="none"
                dot={{ r: 3, fill: colours.objective }}
                name="Objective ADG g/day"
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
          <RossTable label="Measured growth intervals">
            <TableHeader>
              <TableRow>
                <TableHead>Measured interval</TableHead>
                <TableHead className="text-right">Elapsed days</TableHead>
                <TableHead className="text-right">Observed g/day</TableHead>
                <TableHead className="text-right">Objective g/day</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {intervals.map((interval) => (
                <TableRow key={interval.interval}>
                  <TableCell>{interval.interval}</TableCell>
                  <NumberCell>{interval.days}</NumberCell>
                  <NumberCell>{formatRossNumber(interval.adgG, 1)}</NumberCell>
                  <NumberCell>
                    {formatRossNumber(interval.referenceAdgG, 1)}
                  </NumberCell>
                </TableRow>
              ))}
              {intervals.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>
                    N/A — at least two validated dated weighings are required.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </RossTable>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Phase feed-to-gain ratios</CardTitle>
          <CardDescription>
            Configured boundaries; not cumulative FCR or fixed phase targets.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RossTable label="Configured phase ratios" className="min-w-[800px]">
            <TableHeader>
              <TableRow>
                <TableHead>Feed phase / days</TableHead>
                <TableHead>Weight/feed endpoints</TableHead>
                <TableHead className="text-right">Actual ratio</TableHead>
                <TableHead className="text-right">Derived reference</TableHead>
                <TableHead>Actual basis / availability</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.phases.map((phase) => (
                <TableRow key={phase.phase} data-ross-phase={phase.phase}>
                  <TableCell className="capitalize">
                    {phase.phase}
                    <br />
                    {phase.configuredFromDay ?? "N/A"}–
                    {phase.configuredToDay ?? "N/A"}
                  </TableCell>
                  <TableCell>
                    Day {phase.boundaryDay ?? "N/A"} → {phase.endDay ?? "N/A"}
                    <p>
                      {phase.complete
                        ? "Complete"
                        : "In progress / unavailable"}
                    </p>
                  </TableCell>
                  <NumberCell>
                    {metricText(phase.feedToGainRatio, 3)}
                  </NumberCell>
                  <TableCell className="text-right">
                    {formatRossNumber(phase.reference, 3)}
                    {phase.reference === null && (
                      <p className="text-xs">
                        Reference unavailable at these boundaries.
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <p>
                      Feed {metricText(phase.feedKg, 1, "kg")}; gain{" "}
                      {metricText(phase.weightGainKgPerBird, 3, "kg/bird")};
                      birds {formatRossNumber(phase.birdCount, 0)}.
                    </p>
                    {phase.feedToGainRatio.value === null && (
                      <p className="text-xs">
                        {phaseReason(phase.feedToGainRatio.reason) ??
                          "Phase data unavailable."}
                      </p>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </RossTable>
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            key: "dailyFeedG",
            title: "Published daily feed",
            unit: "g/living bird/day",
          },
          {
            key: "cumulativeFeedKg",
            title: "Published cumulative feed",
            unit: "kg/living bird",
          },
          {
            key: "referenceFcr",
            title: "Published cumulative FCR",
            unit: "feed / live weight",
          },
        ].map((item) => (
          <Card key={item.key}>
            <CardHeader>
              <CardTitle className="text-base">{item.title}</CardTitle>
              <CardDescription>{item.unit} · Day 0–56</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart
                  data={referenceRows}
                  margin={{ top: 10, right: 12, bottom: 24, left: 18 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" label={ageAxisLabel} />
                  <YAxis label={leftAxisLabel(item.unit)} />
                  <Tooltip labelFormatter={dayLabel} />
                  <Line
                    type="linear"
                    dataKey={item.key}
                    name={`${item.title} (${item.unit})`}
                    stroke={colours.objective}
                    strokeWidth={2}
                    connectNulls={false}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ))}
      </div>
      <details data-ross-reference="" className="rounded-lg border p-4">
        <summary className="cursor-pointer font-medium">
          View all 57 exact reference rows · Day 0–56
        </summary>
        <div className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Published breeder objectives, not observations. One-day gain and
            average gain since placement are distinct.
          </p>
          <RossTable
            label="All 57 exact breeder reference rows"
            className="min-w-[880px] [&_td]:text-right [&_th]:text-right"
          >
            <TableHeader>
              <TableRow>
                <TableHead>Age day</TableHead>
                <TableHead>Weight kg</TableHead>
                <TableHead>Daily gain g</TableHead>
                <TableHead>Average daily gain g/day</TableHead>
                <TableHead>Daily feed g</TableHead>
                <TableHead>Cumulative feed kg</TableHead>
                <TableHead>Cumulative FCR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {referenceRows.map((row) => (
                <TableRow key={row.day} data-ross-reference-day={row.day}>
                  <NumberCell>{row.day}</NumberCell>
                  <NumberCell>
                    {formatRossNumber(row.breederWeightKg, 3)}
                  </NumberCell>
                  <NumberCell>
                    {formatRossNumber(row.publishedDailyGainG, 0)}
                  </NumberCell>
                  <NumberCell>
                    {formatRossNumber(row.publishedAverageDailyGainG, 0)}
                  </NumberCell>
                  <NumberCell>{formatRossNumber(row.dailyFeedG, 0)}</NumberCell>
                  <NumberCell>
                    {formatRossNumber(row.cumulativeFeedKg, 3)}
                  </NumberCell>
                  <NumberCell>
                    {formatRossNumber(row.referenceFcr, 3)}
                  </NumberCell>
                </TableRow>
              ))}
            </TableBody>
          </RossTable>
        </div>
      </details>
      <Methodology metrics={metrics} />
    </div>
  );
}

export function RossFlockPerformance({
  metrics,
  section,
  loading = false,
  error = false,
  commercialPlan,
}: RossFlockPerformanceProps) {
  if (error || !metrics)
    return (
      <div className="mb-4">
        <Alert variant={error || !loading ? "destructive" : "default"}>
          <AlertDescription>
            {loading && !error
              ? "Loading Ross metrics — N/A until the typed payload is available."
              : "Ross metrics unavailable — N/A. Calculation or data loading failed; legacy zero/statistics are not substituted."}
          </AlertDescription>
        </Alert>
      </div>
    );
  return (
    <section aria-label={`Ross ${section} metrics`} className="space-y-4">
      {section === "summary" && <Summary metrics={metrics} />}
      {section === "readiness" && (
        <CommercialProgress metrics={metrics} commercialPlan={commercialPlan} />
      )}
      {section === "daily" && (
        <>
          <LossCards metrics={metrics} />
          <Consumption metrics={metrics} />
        </>
      )}
      {section === "growth" && (
        <Growth metrics={metrics} commercialPlan={commercialPlan} />
      )}
      {metrics.issues.length > 0 && section !== "readiness" && (
        <Alert>
          <AlertDescription>
            <p className="font-medium">Recorded-data qualifications</p>
            <ul className="list-disc pl-5">
              {metrics.issues.map((issue, index) => (
                <li key={`${index}-${issue}`}>{issue}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </section>
  );
}
