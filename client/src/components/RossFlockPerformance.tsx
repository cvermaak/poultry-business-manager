import React, { type ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot, Legend } from "recharts";
import type { RossFlockMetrics, RossMetric } from "@shared/ross-flock-metrics";
import { getRossObjective, ROSS_REFERENCE } from "@shared/ross308-reference";
import { buildRossChartRows, formatRossNumber, ROSS_GROWTH_POLICY, rossCommercialProgress, rossFeedDeviationPct, rossGrowthStatus, rossRecentWaterChange, sortedRossIntervals, sortedRossSamples } from "@/lib/ross-flock-display";
import type { RossCommercialPlan } from "@/lib/ross-flock-display";

export interface RossFlockPerformanceProps {
  metrics: RossFlockMetrics | null | undefined;
  section: "summary" | "readiness" | "daily" | "growth";
  loading?: boolean;
  error?: boolean;
  commercialPlan: RossCommercialPlan;
}

function metricText(metric: RossMetric, decimals = 2, unit = "") {
  return formatRossNumber(metric.value, decimals, unit);
}

function MetricCard({ title, metric, decimals = 2, unit = "", children }: { title: string; metric: RossMetric; decimals?: number; unit?: string; children?: ReactNode }) {
  return <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{title}</CardTitle></CardHeader><CardContent>
    <div className="text-2xl font-bold">{metricText(metric, decimals, unit)}</div>
    {metric.value === null && <p className="text-xs text-muted-foreground">{metric.reason || "Insufficient recorded data."}</p>}
    <div className="text-xs text-muted-foreground space-y-1 mt-1">{children}</div>
  </CardContent></Card>;
}

function SourceNote() {
  return <div className="text-xs text-muted-foreground space-y-1">
    <p><a className="underline" href={ROSS_REFERENCE.objectiveUrl} target="_blank" rel="noopener noreferrer">{ROSS_REFERENCE.label} — Performance Objectives {ROSS_REFERENCE.edition}</a>.</p>
    <p><a className="underline" href={ROSS_REFERENCE.handbookUrl} target="_blank" rel="noopener noreferrer">Ross Broiler Management Handbook {ROSS_REFERENCE.handbookEdition}</a>. {ROSS_REFERENCE.context}.</p>
    <p>Published ages Day 0–56 only; blank reference fields and unsupported ages remain N/A. No housing discount, extrapolation or fabricated reference zeros.</p>
  </div>;
}

function CommercialProgress({ metrics, commercialPlan }: { metrics: RossFlockMetrics; commercialPlan: RossCommercialPlan }) {
  const latest = sortedRossSamples(metrics.growth.samples).at(-1) ?? null;
  const progress = rossCommercialProgress(commercialPlan, latest, metrics.growth.adgG.value);
  return <Card className="mb-6"><CardHeader><CardTitle>Commercial catching-weight progress</CardTitle><CardDescription>Stored farm targets — separate from the breeder objective. Progress is not a readiness or health certification.</CardDescription></CardHeader><CardContent>
    <div className="grid gap-4 md:grid-cols-4 text-sm">
      <div><p className="text-muted-foreground">Stored catching target</p><p className="text-xl font-semibold">{formatRossNumber(progress.catchingWeightKg, 3, "kg")}</p></div>
      <div><p className="text-muted-foreground">Stored delivered target</p><p className="text-xl font-semibold">{formatRossNumber(progress.deliveredWeightKg, 3, "kg")}</p></div>
      <div><p className="text-muted-foreground">Measured progress</p><p className="text-xl font-semibold">{formatRossNumber(progress.progressPct, 1, "%")}</p><p className="text-xs text-muted-foreground">{latest ? `Day ${latest.day} · ${latest.date}` : "No dated weighing"}</p></div>
      <div><p className="text-muted-foreground">Estimated days from latest weighing</p><p className="text-xl font-semibold">{formatRossNumber(progress.daysToTarget, 0, "days")}</p><p className="text-xs text-muted-foreground">{progress.projectionReason || `Constant observed full-span ADG assumption: ${metricText(metrics.growth.adgG, 1, "g/day")}; estimated age Day ${progress.projectedAgeDay}. Not a biological guarantee.`}</p></div>
    </div>
    <p className="text-xs text-muted-foreground mt-3">Planned final age: {progress.plannedDay === null ? "N/A" : `Day ${progress.plannedDay}`}. Targets are read unchanged; no shrinkage buffer or fallback growth rate is added.</p>
  </CardContent></Card>;
}

function Summary({ metrics }: { metrics: RossFlockMetrics }) {
  const balance = metrics.birdBalances.latest;
  const objective = metrics.summary.weightObjective;
  const fcrObjective = metrics.summary.fcrEndpointDay === null ? null : getRossObjective(metrics.summary.fcrEndpointDay);
  return <div className="mb-6 space-y-3"><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
    <MetricCard title="Age (company calendar)" metric={{ value: metrics.asOf.ageDays, reason: "Age could not be established." }} decimals={0} unit="days"><p>{metrics.asOf.companyDate ?? "N/A"} · {metrics.asOf.timezone}</p></MetricCard>
    <MetricCard title="Remaining inventory (record-reconciled)" metric={{ value: balance.physicalRemaining, reason: balance.reason }} decimals={0} unit="birds"><p>Placed − on-farm losses − harvested removals, as of {balance.date ?? "N/A"}.</p><p>Not verified physical stock; harvest is not mortality.</p></MetricCard>
    <MetricCard title="Latest measured average weight" metric={metrics.summary.averageWeightKg} decimals={3} unit="kg"><p>Day {metrics.asOf.weightDay ?? "N/A"} · {metrics.asOf.weightDate ?? "N/A"}</p><p>Matched-age breeder objective: {formatRossNumber(objective?.weightKg, 3, "kg")}</p><p>Deviation: {metricText(metrics.summary.weightDeviationPct, 1, "%")}</p></MetricCard>
    <MetricCard title="Operational cumulative live-weight FCR" metric={metrics.summary.cumulativeFcr} decimals={3}><p>Aligned endpoint Day {metrics.summary.fcrEndpointDay ?? "N/A"} · {metrics.summary.fcrEndpointDate ?? "N/A"}</p><p>Feed: {metricText(metrics.summary.fcrFeedKg, 1, "kg")} / output plus remaining: {metricText(metrics.summary.fcrOutputPlusRemainingKg, 1, "kg")}</p><p>Published matched-age FCR: {formatRossNumber(fcrObjective?.fcr, 3)}</p></MetricCard>
  </div><p className="text-xs text-muted-foreground">{metrics.summary.fcrConvention}. Operational output-plus-remaining biomass is an application bookkeeping convention, not a handbook thinning formula. Breeder FCR includes placement weight and is not mortality-corrected.</p><SourceNote /></div>;
}

function LossCards({ metrics }: { metrics: RossFlockMetrics }) {
  const balance = metrics.birdBalances.latest;
  return <div className="space-y-2"><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
    <MetricCard title="Found-dead mortality" metric={{ value: balance.foundDead, reason: balance.splitReason }} decimals={0} unit="birds"><p>{metricText(balance.mortalityPct, 2, "%")} of placed birds</p></MetricCard>
    <MetricCard title="Culls" metric={{ value: balance.culls, reason: balance.splitReason }} decimals={0} unit="birds"><p>{metricText(balance.cullsPct, 2, "%")} of placed birds</p></MetricCard>
    <MetricCard title="Total on-farm losses" metric={{ value: balance.totalOnFarmLosses, reason: balance.reason }} decimals={0} unit="birds"><p>{metricText(balance.totalLossPct, 2, "%")} of placed birds</p><p>{balance.splitKnown ? "Recorded mortality/cull split available." : "Historical mortality/cull split unknown; no split is inferred."}</p></MetricCard>
    <MetricCard title="Livability (loss-based survival)" metric={balance.livabilityPct} unit="%"><p>Placed-bird denominator: {formatRossNumber(balance.placed, 0)}. Harvested birds remain survivors.</p><p>Harvested removals: {formatRossNumber(balance.harvestedBirds, 0)}; distinct from remaining inventory.</p></MetricCard>
  </div><p className="text-xs text-muted-foreground">As of {balance.date ?? "N/A"}, Day {balance.day ?? "N/A"}. No universal Ross mortality, livability or uniformity grade is applied. On-farm losses are not processing/transport dead-on-arrival.</p></div>;
}

function Consumption({ metrics }: { metrics: RossFlockMetrics }) {
  const rows = [...metrics.dailyConsumption].sort((a, b) => a.day - b.day || a.date.localeCompare(b.date));
  const waterTrend = rossRecentWaterChange(rows);
  const data = rows.map(row => ({ day: row.day, actualFeedG: row.feedGPerBird.value, breederDailyFeedG: row.reference?.dailyFeedG ?? null, meteredWaterMl: row.meteredWaterMlPerBird.value }));
  return <div className="space-y-4"><div className="grid gap-4 md:grid-cols-3">
    <MetricCard title="Matched-window metered water usage" metric={metrics.water.totalWaterLitres} decimals={1} unit="L"><p>{metrics.water.matchedRecordCount} matching daily records; not necessarily bird intake.</p></MetricCard>
    <MetricCard title="Feed in matching water window" metric={metrics.water.matchingFeedKg} decimals={1} unit="kg"><p>Same dated records as water total.</p></MetricCard>
    <MetricCard title="Whole-window water:feed" metric={metrics.water.ratioLitresPerKg} unit="L/kg"><p>Total metered water ÷ total matching feed; not the mean of daily ratios.</p></MetricCard>
  </div>
  <Card><CardHeader><CardTitle>Daily feed and water — dated bird-count basis</CardTitle><CardDescription>Feed is compared with the exact age-specific living-bird objective, not an all-history mean.</CardDescription></CardHeader><CardContent className="space-y-4">
    <p className="text-sm text-muted-foreground">Per-bird operational quantities use that date's end-of-day remaining inventory after recorded losses and harvest removals, not bird-day exposure or certified bird intake. Removal-day denominators can inflate per-remaining-bird amounts: interpret the age-objective deviation descriptively, not as an intake grade or diagnosis.</p>
    <ResponsiveContainer width="100%" height={280}><LineChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" /><YAxis yAxisId="feed" /><YAxis yAxisId="water" orientation="right" /><Tooltip /><Legend />
      <Line yAxisId="feed" type="linear" dataKey="actualFeedG" stroke="#f59e0b" name="Recorded feed g/bird/day" connectNulls={false} />
      <Line yAxisId="feed" type="linear" dataKey="breederDailyFeedG" stroke="#64748b" strokeDasharray="5 5" name="Breeder daily feed g/living bird" connectNulls={false} />
      <Line yAxisId="water" type="linear" dataKey="meteredWaterMl" stroke="#2563eb" name="Metered water ml/bird/day" connectNulls={false} />
    </LineChart></ResponsiveContainer>
    <Table><TableHeader><TableRow><TableHead>Date / age</TableHead><TableHead>Birds / basis</TableHead><TableHead>Feed kg / g per bird</TableHead><TableHead>Breeder feed g / deviation</TableHead><TableHead>Water L / ml per bird</TableHead><TableHead>Water:feed L/kg</TableHead><TableHead>Temperature / humidity</TableHead></TableRow></TableHeader><TableBody>
      {rows.map(row => <TableRow key={`${row.date}-${row.day}`}><TableCell>{row.date}<br />Day {row.day}</TableCell><TableCell>{formatRossNumber(row.birdCount, 0)}<p className="text-xs text-muted-foreground">{row.birdCountBasis}</p></TableCell>
        <TableCell>{metricText(row.feedKg, 1)} / {metricText(row.feedGPerBird, 1)}{row.feedGPerBird.value === null && <p className="text-xs">{row.feedGPerBird.reason}</p>}</TableCell>
        <TableCell>{formatRossNumber(row.reference?.dailyFeedG, 0)} / {formatRossNumber(rossFeedDeviationPct(row), 1, "%")}</TableCell>
        <TableCell>{metricText(row.waterLitres, 1)} / {metricText(row.meteredWaterMlPerBird, 1)}{row.meteredWaterMlPerBird.value === null && <p className="text-xs">{row.meteredWaterMlPerBird.reason}</p>}</TableCell>
        <TableCell>{metricText(row.waterFeedLitresPerKg)}{row.waterFeedLitresPerKg.value === null && <p className="text-xs">{row.waterFeedLitresPerKg.reason}</p>}</TableCell><TableCell>{formatRossNumber(row.temperatureC, 1, "°C")} / {formatRossNumber(row.humidityPct, 1, "%")}</TableCell>
      </TableRow>)}
      {rows.length === 0 && <TableRow><TableCell colSpan={7}>N/A — no validated daily consumption records.</TableCell></TableRow>}
    </TableBody></Table>
    <div className="text-sm text-muted-foreground space-y-2"><p>Handbook reference: close to 1.6–1.8 L/kg at 21°C, qualified by drinker and environmental conditions. Approximate water requirement rises about 6.5% per °C above 21°C; this is not an exact unlimited correction formula.</p><p>Metered usage can include leaks, flushing and spillage. Never restrict water to force a target ratio. Review temperature, drinker conditions and recording windows; a deviation is not a medical diagnosis.</p>
      <p>{waterTrend ? `Latest consecutive recorded days ${waterTrend.startDay}–${waterTrend.endDay}: metered water per bird changed ${formatRossNumber(waterTrend.changePct, 1, "%")}; temperatures ${formatRossNumber(waterTrend.previousTemperatureC, 1, "°C")} → ${formatRossNumber(waterTrend.latestTemperatureC, 1, "°C")}. Interpret with environment, leakage and flushing.` : "Water trend: N/A — two latest consecutive dated days with valid per-bird usage are required."}</p><p>No breeder alert bands or universal consumption grades are assigned.</p></div>
  </CardContent></Card><SourceNote /></div>;
}

function Growth({ metrics, commercialPlan }: { metrics: RossFlockMetrics; commercialPlan: RossCommercialPlan }) {
  const uniformity = metrics.uniformity.latest;
  const status = rossGrowthStatus(metrics.summary.weightDeviationPct.value);
  const plan = rossCommercialProgress(commercialPlan, sortedRossSamples(metrics.growth.samples).at(-1) ?? null, metrics.growth.adgG.value);
  const chart = buildRossChartRows(metrics.growth.samples, plan.plannedDay);
  const referenceRows = chart.filter(row => row.day <= 56);
  const intervals = sortedRossIntervals(metrics.growth.intervals);
  return <div className="space-y-4"><Card><CardHeader><CardTitle className={status.className}>Growth comparison: {status.label}</CardTitle><CardDescription>Matched measured-age deviation: {metricText(metrics.summary.weightDeviationPct, 1, "%")}. {metrics.summary.weightDeviationPct.value === null && metrics.summary.weightDeviationPct.reason}</CardDescription></CardHeader><CardContent><p className="text-xs text-muted-foreground">{ROSS_GROWTH_POLICY}</p></CardContent></Card>
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <MetricCard title="Observed full-span ADG" metric={metrics.growth.adgG} decimals={1} unit="g/day"><p>Day {metrics.growth.startDay ?? "N/A"}–{metrics.growth.endDay ?? "N/A"}; total measured gain ÷ elapsed days.</p><p>Same-interval objective ADG: {metricText(metrics.growth.referenceAdgG, 1, "g/day")}</p>{metrics.growth.referenceAdgG.value === null && <p>{metrics.growth.referenceAdgG.reason}</p>}</MetricCard>
      <MetricCard title="Sample CV% (n−1)" metric={uniformity?.cvPct ?? { value: null, reason: "Individual weight samples are required." }} unit="%"><p>Sample standard deviation / measured mean × 100; not 100 − CV.</p><p>SD: {uniformity ? metricText(uniformity.sampleSdKg, 3, "kg") : "N/A"}</p></MetricCard>
      <MetricCard title="Direct within ±10% of mean" metric={uniformity?.within10Pct ?? { value: null, reason: "Individual weight samples are required." }} unit="%"><p>Direct count in sample band; no universal uniformity grade.</p><p>Sample n: {uniformity?.sampleCount ?? "N/A"}; recommendation: {uniformity?.recommendedSampleCount ?? "N/A"}</p></MetricCard>
      <MetricCard title="PEF/EPEF — provisional" metric={metrics.summary.epef} decimals={1}><p>Aligned endpoint Day {metrics.summary.fcrEndpointDay ?? "N/A"}; in-progress figure, no universal score grades.</p><p>No mixed-age harvest aggregation method is approved; the engine withholds EPEF after harvest. Compare environments at similar processing ages.</p></MetricCard>
    </div>
    <Card><CardHeader><CardTitle>Sampling and first-week handbook checks</CardTitle><CardDescription>Handbook 2025, pages 17, 19 and 38–41; measurement checks, not flock certification.</CardDescription></CardHeader><CardContent className="text-sm space-y-2">
      <p>Weigh at least 100 birds or 1% of the population, whichever is larger, representatively from at least three locations. Actual sample locations are not recorded, so representative sampling is not verified.</p>
      <p>Latest individual-weight sample: {uniformity ? `Day ${uniformity.day} · ${uniformity.date}, n=${uniformity.sampleCount}. ${uniformity.meetsSampleCountRecommendation === false ? "Low sample count — below the recommended count." : uniformity.meetsSampleCountRecommendation === true ? "Count meets recommendation only; locations/representativeness remain unverified." : "Sample-count adequacy N/A."}` : "N/A — no individual-weight sample."}</p>
      {uniformity?.reason && <p>{uniformity.reason}</p>}
      <p>Day-7 / actual measured Day-0 weight multiple: {metricText(metrics.day7.weightMultiple, 2)}. Handbook minimum 4.5× actual measured placement weight; no reference-weight substitute. {metrics.day7.meetsMinimum === null ? metrics.day7.weightMultiple.reason : metrics.day7.meetsMinimum ? "Meets the measured-weight check." : "Below minimum — review chick start."}</p>
      <p>Day-0 → Day-7 CV change: {metricText(metrics.day7.cvChangePercentagePoints, 2, "percentage points")}. More than 3 percentage points calls for a brooding review. {metrics.day7.broodingReviewSuggested === null ? metrics.day7.cvChangePercentagePoints.reason : metrics.day7.broodingReviewSuggested ? "Brooding review suggested." : "No >3-point rise recorded."}</p>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Measured weight vs breeder objective</CardTitle><CardDescription>Measured points only; no filled-in weights. Exact published breeder rows Day 0–56; the commercial final goal is separate.</CardDescription></CardHeader><CardContent>
      <ResponsiveContainer width="100%" height={360}><LineChart data={chart}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" domain={["dataMin", "dataMax"]} dataKey="day" /><YAxis /><Tooltip /><Legend />
        <Line type="linear" dataKey="breederWeightKg" stroke="#64748b" strokeDasharray="5 5" name="Ross breeder objective kg" connectNulls={false} dot={false} />
        <Line type="linear" dataKey="actualWeightKg" stroke="none" name="Measured weight kg (points only)" connectNulls={false} dot={{ r: 4, fill: "#16a34a", stroke: "#16a34a" }} isAnimationActive={false} />
        {plan.catchingWeightKg !== null && plan.plannedDay !== null && <ReferenceDot x={plan.plannedDay} y={plan.catchingWeightKg} r={6} fill="#f97316" stroke="#f97316" label={`Commercial final goal Day ${plan.plannedDay}`} />}
      </LineChart></ResponsiveContainer>
      <p className="text-xs text-muted-foreground">Commercial final goal: {formatRossNumber(plan.catchingWeightKg, 3, "kg")} at {plan.plannedDay === null ? "N/A" : `Day ${plan.plannedDay}`}. It is not a linear genetic growth curve. Measured ages beyond Day 56 have no breeder comparison.</p>
      <Table><TableHeader><TableRow><TableHead>Measured date / day</TableHead><TableHead>Actual kg</TableHead><TableHead>Same-age breeder kg</TableHead></TableRow></TableHeader><TableBody>{sortedRossSamples(metrics.growth.samples).map(sample => <TableRow key={`${sample.date}-${sample.day}`}><TableCell>{sample.date} / Day {sample.day}</TableCell><TableCell>{formatRossNumber(sample.weightKg, 3)}</TableCell><TableCell>{formatRossNumber(getRossObjective(sample.day)?.weightKg, 3)}</TableCell></TableRow>)}{metrics.growth.samples.length === 0 && <TableRow><TableCell colSpan={3}>N/A — no validated measured weights.</TableCell></TableRow>}</TableBody></Table>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Observed interval ADG vs matched-interval reference</CardTitle><CardDescription>Each measured interval uses the same objective endpoints; not a universal 50–60 g/day benchmark.</CardDescription></CardHeader><CardContent>
      <ResponsiveContainer width="100%" height={250}><LineChart data={intervals}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="interval" /><YAxis /><Tooltip /><Legend /><Line dataKey="adgG" stroke="none" dot={{ r: 4, fill: "#16a34a" }} name="Observed interval ADG g/day" isAnimationActive={false} /><Line dataKey="referenceAdgG" stroke="none" dot={{ r: 4, fill: "#64748b" }} name="Same-interval objective ADG g/day" isAnimationActive={false} /></LineChart></ResponsiveContainer>
      <Table><TableHeader><TableRow><TableHead>Measured interval</TableHead><TableHead>Elapsed days</TableHead><TableHead>Observed g/day</TableHead><TableHead>Same-interval objective g/day</TableHead></TableRow></TableHeader><TableBody>{intervals.map(interval => <TableRow key={interval.interval}><TableCell>{interval.interval}</TableCell><TableCell>{interval.days}</TableCell><TableCell>{formatRossNumber(interval.adgG, 1)}</TableCell><TableCell>{formatRossNumber(interval.referenceAdgG, 1)}</TableCell></TableRow>)}{intervals.length === 0 && <TableRow><TableCell colSpan={4}>N/A — at least two validated dated weighings are required.</TableCell></TableRow>}</TableBody></Table>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Configured-phase feed-to-gain ratios</CardTitle><CardDescription>Derived idealized breeder reference = change in published cumulative feed ÷ change in published weight. Not published cumulative FCR or fixed phase targets.</CardDescription></CardHeader><CardContent>
      <Table><TableHeader><TableRow><TableHead>Configured feed days</TableHead><TableHead>Weight/feed endpoints</TableHead><TableHead>Actual ratio</TableHead><TableHead>Boundary-derived reference</TableHead><TableHead>Actual basis / availability</TableHead></TableRow></TableHeader><TableBody>{metrics.phases.map(phase => <TableRow key={phase.phase}><TableCell className="capitalize">{phase.phase}<br />{phase.configuredFromDay ?? "N/A"}–{phase.configuredToDay ?? "N/A"}</TableCell><TableCell>Day {phase.boundaryDay ?? "N/A"} → {phase.endDay ?? "N/A"}<p>{phase.complete ? "Complete" : "In progress / unavailable"}</p></TableCell><TableCell>{metricText(phase.feedToGainRatio, 3)}</TableCell><TableCell>{formatRossNumber(phase.reference, 3)}{phase.reference === null && <p className="text-xs">Reference unavailable for these boundaries.</p>}</TableCell><TableCell><p>Feed {metricText(phase.feedKg, 1, "kg")}; gain {metricText(phase.weightGainKgPerBird, 3, "kg/bird")}; birds {formatRossNumber(phase.birdCount, 0)}.</p><p className="text-xs">{phase.feedToGainRatio.reason}</p></TableCell></TableRow>)}</TableBody></Table>
      <p className="text-xs text-muted-foreground mt-2">These are boundary-derived references, not fixed phase targets. References use the backend's configured boundaries; no losses/removals adjustment is implied by the idealized breeder calculation. Actual comparisons are withheld when population/gain reconciliation is unsupported.</p>
    </CardContent></Card>
    <div className="grid gap-4 md:grid-cols-3">{[
      { key: "dailyFeedG", title: "Published daily feed", unit: "g/living bird/day" },
      { key: "cumulativeFeedKg", title: "Published cumulative feed", unit: "kg/living bird" },
      { key: "referenceFcr", title: "Published cumulative FCR", unit: "feed / live weight" },
    ].map(item => <Card key={item.key}><CardHeader><CardTitle className="text-base">{item.title}</CardTitle><CardDescription>{item.unit}, exact ages 0–56</CardDescription></CardHeader><CardContent><ResponsiveContainer width="100%" height={220}><LineChart data={referenceRows}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" /><YAxis /><Tooltip /><Line type="linear" dataKey={item.key} name={item.title} stroke="#64748b" connectNulls={false} dot={false} /></LineChart></ResponsiveContainer></CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle>All 57 published age rows — breeder reference, not observations</CardTitle><CardDescription>Daily gain is the published one-day gain. Published average daily gain since placement is a distinct column; neither replaces the measured interval ADG.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Age day</TableHead><TableHead>Weight kg</TableHead><TableHead>Daily gain g</TableHead><TableHead>Average daily gain g/day</TableHead><TableHead>Daily feed g</TableHead><TableHead>Cumulative feed kg</TableHead><TableHead>Cumulative FCR</TableHead></TableRow></TableHeader><TableBody>{referenceRows.map(row => <TableRow key={row.day} data-ross-reference-day={row.day}><TableCell>{row.day}</TableCell><TableCell>{formatRossNumber(row.breederWeightKg, 3)}</TableCell><TableCell>{formatRossNumber(row.publishedDailyGainG, 0)}</TableCell><TableCell>{formatRossNumber(row.publishedAverageDailyGainG, 0)}</TableCell><TableCell>{formatRossNumber(row.dailyFeedG, 0)}</TableCell><TableCell>{formatRossNumber(row.cumulativeFeedKg, 3)}</TableCell><TableCell>{formatRossNumber(row.referenceFcr, 3)}</TableCell></TableRow>)}</TableBody></Table><p className="text-xs text-muted-foreground mt-2">Published feed is per living bird, not a feed order or your farm allocation. Actual farm feed can include wastage and feed consumed by subsequently lost or harvested birds.</p></CardContent></Card>
    <SourceNote />
  </div>;
}

export function RossFlockPerformance({ metrics, section, loading = false, error = false, commercialPlan }: RossFlockPerformanceProps) {
  if (error || !metrics) return <div className="mb-4"><Alert variant={error || !loading ? "destructive" : "default"}><AlertDescription>{loading && !error ? "Loading Ross metrics — N/A until the typed payload is available." : "Ross metrics unavailable — N/A. Calculation or data loading failed; legacy zero/statistics are not substituted."}</AlertDescription></Alert></div>;
  return <section aria-label={`Ross ${section} metrics`} className="space-y-4">
    {section === "summary" && <Summary metrics={metrics} />}
    {section === "readiness" && <CommercialProgress metrics={metrics} commercialPlan={commercialPlan} />}
    {section === "daily" && <><LossCards metrics={metrics} /><Summary metrics={metrics} /><Consumption metrics={metrics} /></>}
    {section === "growth" && <Growth metrics={metrics} commercialPlan={commercialPlan} />}
    {metrics.issues.length > 0 && section !== "readiness" && <Alert><AlertDescription><p className="font-medium">Recorded-data qualifications</p><ul className="list-disc pl-5">{metrics.issues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ul></AlertDescription></Alert>}
  </section>;
}
