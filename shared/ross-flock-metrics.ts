import { getFlockPlacementDate, getFlockRecordDay } from "./flock-placement";
import { productionToday, productionDayDifference } from "./production-report-dates";
import { getRossObjective, derivedRossPhaseReference, ROSS_REFERENCE } from "./ross308-reference";

/** Null values are deliberately unavailable, never invented zero observations. */
export interface RossMetric { value: number | null; reason: string | null }
export type RossPhaseName = "starter" | "grower" | "finisher";
export type RossNumeric = number | string | null | undefined;
export interface RossFlockInput {
  id: number; placementDate: Date | string; initialCount: RossNumeric;
  growingPeriod?: RossNumeric; targetSlaughterWeight?: RossNumeric;
  starterFromDay?: RossNumeric; starterToDay?: RossNumeric;
  growerFromDay?: RossNumeric; growerToDay?: RossNumeric;
  finisherFromDay?: RossNumeric; finisherToDay?: RossNumeric;
}
export interface RossDailyRecordInput {
  id?: number; flockId: number; recordDate: Date | string; dayNumber: RossNumeric;
  mortality: RossNumeric; culls?: RossNumeric; feedConsumed: RossNumeric;
  feedType?: string | null; waterConsumed?: RossNumeric; averageWeight?: RossNumeric;
  weightSamples?: string | null; temperature?: RossNumeric; humidity?: RossNumeric;
}
/** Only these operational load fields are accepted; delivery/financial data is not used. */
export interface RossHarvestLoadInput {
  id: number; flockId: number; harvestDate: Date | string;
  chickenCountLoaded: RossNumeric; totalLoadedWeightKg: RossNumeric;
}
export type RossHarvestSource = { status: "available"; records: readonly RossHarvestLoadInput[] }
  | { status: "unavailable"; reason?: string };
export interface ComputeRossFlockMetricsInput {
  houseBreed: string | null | undefined; flock: RossFlockInput;
  dailyRecords: readonly RossDailyRecordInput[]; harvestLoads: RossHarvestSource;
  company: { timezone: string; now?: Date; ageDays?: number };
}
export interface RossWeightSample { day: number; date: string; weightKg: number }
export interface RossGrowthInterval {
  startDay: number; endDay: number; days: number; adgG: number;
  referenceAdgG: number | null;
}
export interface RossUniformitySample {
  day: number; date: string; sampleCount: number; meanWeightKg: number | null;
  sampleSdKg: RossMetric; cvPct: RossMetric; within10Pct: RossMetric;
  recommendedSampleCount: number | null; meetsSampleCountRecommendation: boolean | null;
  representativeSamplingVerified: false; reason: string | null;
}
export interface RossBirdBalance {
  day: number | null; date: string | null; placed: number | null;
  totalOnFarmLosses: number | null; foundDead: number | null; culls: number | null;
  splitKnown: boolean; harvestedBirds: number | null; loadedWeightKg: number | null;
  survivingBirds: number | null; physicalRemaining: number | null;
  livabilityPct: RossMetric; mortalityPct: RossMetric; cullsPct: RossMetric;
  totalLossPct: RossMetric; reason: string | null; splitReason: string | null;
}
export interface RossPhaseMetric {
  phase: RossPhaseName; configuredFromDay: number | null; configuredToDay: number | null;
  boundaryDay: number | null; endDay: number | null; complete: boolean;
  feedKg: RossMetric; weightGainKgPerBird: RossMetric; birdCount: number | null;
  feedToGainRatio: RossMetric; reference: ReturnType<typeof derivedRossPhaseReference>;
}
export interface RossDailyConsumption {
  day: number; date: string; birdCount: number | null; birdCountBasis: string;
  feedKg: RossMetric; feedGPerBird: RossMetric; waterLitres: RossMetric;
  meteredWaterMlPerBird: RossMetric; waterFeedLitresPerKg: RossMetric;
  temperatureC: number | null; humidityPct: number | null;
  reference: ReturnType<typeof getRossObjective>;
}
export interface RossFlockMetrics {
  version: 1; breed: "ross_308"; reference: typeof ROSS_REFERENCE;
  asOf: { companyDate: string | null; ageDays: number | null; timezone: string;
    recordDay: number | null; recordDate: string | null; weightDay: number | null; weightDate: string | null };
  summary: { averageWeightKg: RossMetric; weightObjective: ReturnType<typeof getRossObjective>;
    weightDeviationPct: RossMetric; cumulativeFcr: RossMetric; fcrEndpointDay: number | null;
    fcrEndpointDate: string | null; fcrFeedKg: RossMetric; fcrOutputPlusRemainingKg: RossMetric;
    fcrConvention: string; epef: RossMetric; epefProvisional: true;
    projectedWeightKg: RossMetric; projectionDay: number | null; projectionLabel: string };
  birdBalances: { latest: RossBirdBalance; fcrEndpoint: RossBirdBalance };
  growth: { adgG: RossMetric; referenceAdgG: RossMetric; startDay: number | null;
    endDay: number | null; intervals: RossGrowthInterval[]; samples: RossWeightSample[] };
  uniformity: { latest: RossUniformitySample | null; samples: RossUniformitySample[] };
  day7: { weightMultiple: RossMetric; minimumMultiple: 4.5; meetsMinimum: boolean | null;
    cvChangePercentagePoints: RossMetric; broodingReviewSuggested: boolean | null };
  phases: RossPhaseMetric[]; dailyConsumption: RossDailyConsumption[];
  water: { totalWaterLitres: RossMetric; matchingFeedKg: RossMetric;
    ratioLitresPerKg: RossMetric; matchedRecordCount: number;
    referenceAt21C: { min: 1.6; max: 1.8 }; usageLabel: string; context: string };
  issues: string[];
}

const missing = (reason: string): RossMetric => ({ value: null, reason });
const metric = (value: number, reason = "Calculation exceeds finite numeric range."): RossMetric =>
  Number.isFinite(value) ? { value, reason: null } : missing(reason);
const DECIMAL = /^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
/** Unlike parseFloat, numeric suffixes, blanks, booleans, infinities and negatives are rejected. */
export function parseRossNonnegative(value: RossNumeric): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !DECIMAL.test(value.trim())) return null;
  const n = typeof value === "number" ? value : Number(value.trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function birdCount(value: RossNumeric): number | null {
  const n = parseRossNonnegative(value);
  return n !== null && Number.isSafeInteger(n) ? n : null;
}
function positive(value: RossNumeric): number | null {
  const n = parseRossNonnegative(value);
  return n !== null && n > 0 ? n : null;
}
function optionalSigned(value: RossNumeric): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
type DatedRecord = RossDailyRecordInput & { day: number; date: string };
type DatedLoad = RossHarvestLoadInput & { day: number; date: string };
const PHASES: readonly RossPhaseName[] = ["starter", "grower", "finisher"];

/** Pure calculation; never imports server/db, reads credentials, or changes source records. */
export function computeRossFlockMetrics(input: ComputeRossFlockMetricsInput): RossFlockMetrics | null {
  if (input.houseBreed !== "ross_308") return null;
  const { flock, company } = input;
  const issues: string[] = [];
  let companyDate: string | null = null;
  let placement: string | null = null;
  let ageDays: number | null = null;
  let timelineReason: string | null = null;
  try {
    placement = getFlockPlacementDate(flock.placementDate);
    companyDate = productionToday(company.timezone, company.now ?? new Date());
    ageDays = productionDayDifference(placement, companyDate);
    if (!Number.isSafeInteger(ageDays) || ageDays < 0) timelineReason = "Placement is after the company-calendar date.";
    if (company.ageDays !== undefined && company.ageDays !== ageDays)
      timelineReason = "Supplied age disagrees with the company-calendar placement age.";
  } catch {
    timelineReason = "Invalid placement date, company timezone, or current date.";
  }
  const records: DatedRecord[] = [];
  if (placement && companyDate && ageDays !== null) {
    const days = new Set<number>();
    for (const r of input.dailyRecords) {
      let date: string;
      let day: number;
      try {
        date = getFlockPlacementDate(r.recordDate);
        day = getFlockRecordDay(placement, date);
      } catch {
        timelineReason = "Invalid daily-record date; calculation scope cannot be established.";
        continue;
      }
      // Operational labels are not shifted by the server's timezone. Ignore out-of-window observations.
      if (day < 0 || day > ageDays) continue;
      if (r.flockId !== flock.id || birdCount(r.dayNumber) !== day) {
        timelineReason = "Daily-record flock/date/day-number mismatch.";
        continue;
      }
      if (days.has(day)) timelineReason = "Duplicate daily-record date/day; no record was arbitrarily selected.";
      days.add(day);
      records.push({ ...r, day, date });
    }
  }
  records.sort((a, b) => a.day - b.day);
  if (timelineReason) issues.push(timelineReason);
  const byDay = new Map(records.map(r => [r.day, r]));
  const latest = records.at(-1) ?? null;
  const loads: DatedLoad[] = [];
  let harvestReason = input.harvestLoads.status === "unavailable"
    ? `Harvest loads unavailable${input.harvestLoads.reason ? `: ${input.harvestLoads.reason}` : "."}` : null;
  if (input.harvestLoads.status === "available" && placement && ageDays !== null) {
    const ids = new Set<number>();
    for (const h of input.harvestLoads.records) {
      let date: string;
      let day: number;
      try { date = getFlockPlacementDate(h.harvestDate); day = getFlockRecordDay(placement, date); }
      catch { harvestReason = "Invalid harvest date; removal scope is unknown."; continue; }
      if (day < 0 || day > ageDays) continue;
      if (h.flockId !== flock.id || !Number.isSafeInteger(h.id) || h.id <= 0 || ids.has(h.id)) {
        harvestReason = "Invalid or duplicate harvest-load identity.";
        continue;
      }
      ids.add(h.id);
      loads.push({ ...h, day, date });
    }
  }
  loads.sort((a, b) => a.day - b.day);
  if (harvestReason) issues.push(harvestReason);
  const placed = birdCount(flock.initialCount);
  function scopedRecords(start: number, end: number): { rows: DatedRecord[]; reason: string | null } {
    if (timelineReason) return { rows: [], reason: timelineReason };
    const rows: DatedRecord[] = [];
    for (let d = start; d <= end; d++) {
      const row = byDay.get(d);
      if (!row) return { rows: [], reason: `Daily-record coverage missing at Day ${d}.` };
      rows.push(row);
    }
    return { rows, reason: null };
  }
  function feedScope(start: number, end: number): RossMetric {
    const { rows, reason } = scopedRecords(start, end);
    if (reason) return missing(reason);
    let sum = 0;
    for (const r of rows) {
      const feed = parseRossNonnegative(r.feedConsumed);
      if (feed === null) return missing(`Missing or invalid feed at Day ${r.day}; zero was not assumed.`);
      sum += feed;
    }
    return metric(sum);
  }
  function balance(day: number | null, date: string | null): RossBirdBalance {
    const base: RossBirdBalance = {
      day, date, placed, totalOnFarmLosses: null, foundDead: null, culls: null, splitKnown: false,
      harvestedBirds: null, loadedWeightKg: null, survivingBirds: null, physicalRemaining: null,
      livabilityPct: missing("Population balance unavailable."), mortalityPct: missing("Loss split unavailable."),
      cullsPct: missing("Loss split unavailable."), totalLossPct: missing("Population balance unavailable."),
      reason: null, splitReason: null,
    };
    if (timelineReason) { base.reason = timelineReason; return base; }
    if (day === null || placed === null || placed <= 0) {
      base.reason = day === null ? "No in-window daily-record endpoint." : "Placed bird count is missing, unsafe, or zero.";
      return base;
    }
    const scope = scopedRecords(0, day);
    if (scope.reason) { base.reason = scope.reason; return base; }
    let loss = 0, culls = 0, splitKnown = true;
    for (const r of scope.rows) {
      const total = birdCount(r.mortality);
      const culled = birdCount(r.culls);
      if (total === null || (r.culls !== null && r.culls !== undefined && (culled === null || culled > total))) {
        base.reason = `Invalid losses/culls at Day ${r.day}.`;
        return base;
      }
      loss += total;
      if (culled === null) splitKnown = false;
      else culls += culled;
    }
    if (!Number.isSafeInteger(loss) || loss > placed) { base.reason = "On-farm losses exceed placed birds or safe count range."; return base; }
    base.totalOnFarmLosses = loss;
    base.survivingBirds = placed - loss;
    base.splitKnown = splitKnown;
    base.foundDead = splitKnown ? loss - culls : null;
    base.culls = splitKnown ? culls : null;
    base.splitReason = splitKnown ? null : "Historical culls NULL: found-dead/cull split is unknown.";
    base.livabilityPct = metric((placed - loss) / placed * 100);
    base.totalLossPct = metric(loss / placed * 100);
    base.mortalityPct = splitKnown ? metric((loss - culls) / placed * 100) : missing(base.splitReason!);
    base.cullsPct = splitKnown ? metric(culls / placed * 100) : missing(base.splitReason!);
    if (harvestReason) { base.reason = harvestReason; return base; }
    let removed = 0, outputKg = 0;
    for (const h of loads.filter(h => h.day <= day)) {
      const count = birdCount(h.chickenCountLoaded);
      const kg = parseRossNonnegative(h.totalLoadedWeightKg);
      if (count === null || kg === null || (count > 0 && kg <= 0) || (count === 0 && kg !== 0)) {
        base.reason = `Invalid harvest count/loaded weight at Day ${h.day}.`;
        return base;
      }
      removed += count;
      outputKg += kg;
    }
    if (!Number.isSafeInteger(removed) || !Number.isFinite(outputKg) || removed + loss > placed) {
      base.reason = "Losses plus harvested birds exceed placement or safe numeric range.";
      return base;
    }
    // Check each prior day too: later events cannot conceal an impossible inventory history.
    let priorLoss = 0;
    for (const r of scope.rows) {
      priorLoss += birdCount(r.mortality)!;
      const priorRemoved = loads.filter(h => h.day <= r.day).reduce((sum, h) => sum + (birdCount(h.chickenCountLoaded) ?? NaN), 0);
      if (!Number.isSafeInteger(priorRemoved) || priorLoss + priorRemoved > placed) {
        base.reason = `Impossible physical bird balance at Day ${r.day}.`;
        return base;
      }
    }
    base.harvestedBirds = removed;
    base.loadedWeightKg = outputKg;
    base.physicalRemaining = placed - loss - removed;
    return base;
  }
  const latestBalance = balance(latest?.day ?? null, latest?.date ?? null);
  if (latestBalance.reason) issues.push(latestBalance.reason);
  const weightRows = timelineReason ? [] : records.filter(r => positive(r.averageWeight) !== null);
  // Existing records use numeric zero/"0.000" as "not weighed"; it is absent, never a measured zero weight.
  const badWeight = records.find(r => r.averageWeight !== null && r.averageWeight !== undefined && parseRossNonnegative(r.averageWeight) === null);
  const weightReason = timelineReason ?? (badWeight ? `Invalid measured weight at Day ${badWeight.day}.` : null);
  const samples: RossWeightSample[] = weightReason ? [] : weightRows.map(r => ({ day: r.day, date: r.date, weightKg: positive(r.averageWeight)! }));
  const firstWeight = samples[0] ?? null;
  const lastWeight = samples.at(-1) ?? null;
  const intervals: RossGrowthInterval[] = samples.slice(1).map((r, i) => {
    const previous = samples[i];
    const startReference = getRossObjective(previous.day), endReference = getRossObjective(r.day);
    const days = r.day - previous.day;
    return { startDay: previous.day, endDay: r.day, days, adgG: (r.weightKg - previous.weightKg) * 1000 / days,
      referenceAdgG: startReference && endReference ? (endReference.weightKg - startReference.weightKg) * 1000 / days : null };
  }).filter(interval => {
    if (Number.isFinite(interval.adgG)) return true;
    issues.push(`Observed interval ADG exceeds finite numeric range at Day ${interval.endDay}.`);
    return false;
  });
  const adg = firstWeight && lastWeight && lastWeight.day > firstWeight.day
    ? metric((lastWeight.weightKg - firstWeight.weightKg) * 1000 / (lastWeight.day - firstWeight.day))
    : missing(weightReason ?? "At least two dated measured weights are required for observed ADG.");
  const refStart = firstWeight ? getRossObjective(firstWeight.day) : null;
  const refEnd = lastWeight ? getRossObjective(lastWeight.day) : null;
  const refAdg = refStart && refEnd && firstWeight && lastWeight && lastWeight.day > firstWeight.day
    ? metric((refEnd.weightKg - refStart.weightKg) * 1000 / (lastWeight.day - firstWeight.day))
    : missing("Reference unavailable at the same measured endpoints.");
  const fullyDepleted = latestBalance.physicalRemaining === 0 && (latestBalance.loadedWeightKg ?? 0) > 0;
  const endpointDay = fullyDepleted ? latest!.day : lastWeight?.day ?? null;
  const endpointDate = fullyDepleted ? latest!.date : lastWeight?.date ?? null;
  const endpointBalance = balance(endpointDay, endpointDate);
  const scopedFeed = endpointDay !== null ? feedScope(0, endpointDay) : missing(weightReason ?? "No measured FCR endpoint.");
  let output = missing("Same-date output and remaining biomass are unavailable.");
  let fcr = missing(endpointBalance.reason ?? scopedFeed.reason ?? "Insufficient FCR data.");
  if (endpointBalance.physicalRemaining !== null && endpointBalance.loadedWeightKg !== null && endpointDay !== null) {
    const removalDays = loads.filter(h => h.day <= endpointDay && (birdCount(h.chickenCountLoaded) ?? 0) > 0).map(h => h.day);
    const lastRemovalDay = removalDays.length ? Math.max(...removalDays) : null;
    const remaining = endpointBalance.physicalRemaining;
    if (remaining > 0 && (!lastWeight || (lastRemovalDay !== null && lastWeight.day <= lastRemovalDay))) {
      fcr = missing("Remaining birds require a valid measured weight AFTER the last removal day.");
    } else {
      output = metric(endpointBalance.loadedWeightKg + (remaining > 0 ? remaining * lastWeight!.weightKg : 0));
      fcr = scopedFeed.value === null ? missing(scopedFeed.reason!)
        : endpointDay <= 0 ? missing("FCR is unavailable on placement Day 0.")
        : scopedFeed.value <= 0 ? missing("Positive recorded cumulative feed is required; early zero-feed FCR is not reported.")
        : output.value !== null && output.value > 0 ? metric(scopedFeed.value / output.value)
        : missing("Positive live output/biomass is required for FCR.");
    }
  }
  const anyHarvestByEndpoint = endpointBalance.harvestedBirds !== null && endpointBalance.harvestedBirds > 0;
  const harvestedAfterOlderWeight = latest !== null && loads.some(h => h.day <= latest.day && (birdCount(h.chickenCountLoaded) ?? 0) > 0);
  let epef = missing("Same-date positive age, livability, weight and FCR are required for EPEF.");
  if (harvestReason) epef = missing(harvestReason);
  else if (anyHarvestByEndpoint || harvestedAfterOlderWeight || fullyDepleted) epef = missing("EPEF withheld after harvest: no mixed-age output aggregation method is approved.");
  else if (fcr.value !== null && fcr.value > 0 && endpointDay !== null && endpointDay > 0 && lastWeight
    && lastWeight.day === endpointDay && endpointBalance.livabilityPct.value !== null
    && Number.isFinite(endpointDay * fcr.value))
    epef = metric(endpointBalance.livabilityPct.value * lastWeight.weightKg * 100 / (endpointDay * fcr.value));
  const projectionDay = birdCount(flock.growingPeriod);
  let projected = missing("Observed nonnegative ADG and a valid future projection day are required.");
  if (lastWeight && adg.value !== null && adg.value >= 0 && projectionDay !== null && projectionDay >= lastWeight.day)
    projected = metric(lastWeight.weightKg + adg.value / 1000 * (projectionDay - lastWeight.day));

  const uniformitySamples: RossUniformitySample[] = timelineReason ? [] : records
    .filter(r => r.weightSamples !== null && r.weightSamples !== undefined && r.weightSamples.trim() !== "")
    .map(r => {
      const tokens = r.weightSamples!.split(",");
      const parsed = tokens.map(token => positive(token));
      const count = tokens.length;
      const population = balance(r.day, r.date).physicalRemaining;
      const recommended = population !== null && population > 0 ? Math.max(100, Math.ceil(population / 100)) : null;
      const result: RossUniformitySample = { day: r.day, date: r.date, sampleCount: count, meanWeightKg: null,
        sampleSdKg: missing("Individual sample weights are invalid."), cvPct: missing("Individual sample weights are invalid."),
        within10Pct: missing("Individual sample weights are invalid."), recommendedSampleCount: recommended,
        meetsSampleCountRecommendation: recommended === null ? null : count >= recommended,
        representativeSamplingVerified: false, reason: null };
      if (parsed.some(p => p === null)) {
        result.reason = "Invalid individual sample token; no token was silently discarded.";
        result.sampleSdKg = result.cvPct = result.within10Pct = missing(result.reason);
        result.meetsSampleCountRecommendation = false;
        return result;
      }
      const weights = parsed as number[];
      const mean = weights.reduce((sum, w) => sum + w, 0) / count;
      if (!Number.isFinite(mean) || mean <= 0) { result.reason = "Sample mean exceeds finite numeric range."; return result; }
      result.meanWeightKg = mean;
      result.within10Pct = metric(weights.filter(w => Math.abs(w - mean) <= mean * 0.1 + Number.EPSILON * mean * 4).length / count * 100);
      if (count >= 2) {
        const sd = Math.sqrt(weights.reduce((sum, w) => sum + (w - mean) ** 2, 0) / (count - 1));
        result.sampleSdKg = metric(sd);
        result.cvPct = metric(sd / mean * 100);
      } else result.sampleSdKg = result.cvPct = missing("Sample SD/CV requires at least two individual weights.");
      result.reason = recommended === null ? "Population unavailable for sample-size recommendation; representativeness unverified."
        : count < recommended ? `Low sample count: ${count} weighed; at least ${recommended} recommended; representativeness unverified.`
        : "Sample count met; representative sampling from at least three locations is not verified.";
      return result;
    });
  const day0Weight = samples.find(s => s.day === 0), day7Weight = samples.find(s => s.day === 7);
  const multiple = day0Weight && day7Weight ? metric(day7Weight.weightKg / day0Weight.weightKg)
    : missing("Actual positive Day-0 and Day-7 average weights are required; breeder weights are not substituted.");
  const cv0 = uniformitySamples.find(s => s.day === 0)?.cvPct.value;
  const cv7 = uniformitySamples.find(s => s.day === 7)?.cvPct.value;
  const cvChange = cv0 !== undefined && cv0 !== null && cv7 !== undefined && cv7 !== null ? metric(cv7 - cv0)
    : missing("Valid individual-weight CV samples at exactly Day 0 and Day 7 are required.");

  const configs = PHASES.map(phase => ({ phase, from: birdCount(flock[`${phase}FromDay`]), to: birdCount(flock[`${phase}ToDay`]) }));
  const overlap = configs.some((a, i) => a.from !== null && a.to !== null && configs.slice(i + 1)
    .some(b => b.from !== null && b.to !== null && a.from! <= b.to && b.from <= a.to!));
  const phaseMetrics: RossPhaseMetric[] = configs.map(({ phase, from, to }) => {
    const boundary = from === null ? null : from === 0 ? 0 : from - 1;
    const end = to !== null && latest ? Math.min(to, latest.day) : null;
    const reference = !overlap && from !== null && to !== null && to >= from && boundary !== null && end !== null && end > boundary
      ? derivedRossPhaseReference(boundary, end) : null;
    const result: RossPhaseMetric = { phase, configuredFromDay: from, configuredToDay: to, boundaryDay: boundary,
      endDay: end, complete: to !== null && end === to, feedKg: missing("Phase configuration/data unavailable."),
      weightGainKgPerBird: missing("Exact boundary weights unavailable."), birdCount: null,
      feedToGainRatio: missing("Phase configuration/data unavailable."), reference };
    const unavailable = (reason: string) => { result.feedToGainRatio = missing(reason); return result; };
    if (from === null || to === null || to < from) return unavailable("Configured phase from/to days are missing or invalid.");
    if (end === null || end < from || boundary === null) return unavailable("Phase has not started or has no in-window records.");
    if (overlap) return unavailable("Configured feed-phase intervals overlap.");
    result.feedKg = feedScope(from, end);
    const phaseRows = scopedRecords(from, end);
    if (phaseRows.reason) return unavailable(phaseRows.reason);
    if (phaseRows.rows.some(r => r.feedType !== phase)) return unavailable("Recorded feed type does not match the configured phase/date interval.");
    const startWeight = positive(byDay.get(boundary)?.averageWeight), endWeight = positive(byDay.get(end)?.averageWeight);
    if (startWeight === null || endWeight === null) return unavailable("Exact positive weight measurements are required at both phase boundaries; no carried weights.");
    const gain = endWeight - startWeight;
    result.weightGainKgPerBird = metric(gain);
    const atStart = balance(boundary, byDay.get(boundary)?.date ?? null);
    const atEnd = balance(end, byDay.get(end)?.date ?? null);
    result.birdCount = atStart.physicalRemaining;
    if (atStart.reason || atEnd.reason) return unavailable(atStart.reason ?? atEnd.reason!);
    if (phaseRows.rows.some(r => birdCount(r.mortality) === null || (birdCount(r.mortality) ?? 0) > 0)
      || loads.some(h => h.day >= from && h.day <= end && (birdCount(h.chickenCountLoaded) ?? 0) > 0))
      return unavailable("Phase losses/removals cannot be reconciled without lost/removed-bird gain data.");
    if (gain <= 0 || result.birdCount === null || result.birdCount <= 0) return unavailable("Positive phase weight gain and safe bird count are required.");
    const phaseBiomassGain = result.birdCount * gain;
    if (!Number.isFinite(phaseBiomassGain) || phaseBiomassGain <= 0) return unavailable("Phase biomass gain exceeds finite numeric range.");
    result.feedToGainRatio = result.feedKg.value === null ? missing(result.feedKg.reason!)
      : result.feedKg.value <= 0 ? missing("Positive measured phase feed is required; early zero-feed ratio is not reported.")
      : metric(result.feedKg.value / phaseBiomassGain);
    return result;
  });
  const consumption: RossDailyConsumption[] = timelineReason ? [] : records.map(r => {
    const pop = balance(r.day, r.date);
    const feed = parseRossNonnegative(r.feedConsumed), water = parseRossNonnegative(r.waterConsumed);
    const count = pop.physicalRemaining;
    const denominatorReason = pop.reason ?? "Positive end-of-day physical bird count is required; exposure/intake is not measured.";
    const temp = optionalSigned(r.temperature), humidity = parseRossNonnegative(r.humidity);
    return { day: r.day, date: r.date, birdCount: count,
      birdCountBasis: "End-of-day physical remaining birds, after same-day losses and loaded removals; metered usage, not exposure-adjusted intake.",
      feedKg: feed === null ? missing("Missing/invalid daily feed; zero not assumed.") : metric(feed),
      feedGPerBird: feed !== null && count !== null && count > 0 ? metric(feed / count * 1000)
        : missing(feed === null ? "Missing/invalid daily feed." : denominatorReason),
      waterLitres: water === null ? missing("Missing/invalid metered water usage.") : metric(water),
      meteredWaterMlPerBird: water !== null && count !== null && count > 0 ? metric(water / count * 1000)
        : missing(water === null ? "Missing/invalid metered water usage." : denominatorReason),
      waterFeedLitresPerKg: water !== null && feed !== null && feed > 0 ? metric(water / feed)
        : missing("Matching valid daily water and positive feed are required."),
      temperatureC: temp, humidityPct: humidity !== null && humidity <= 100 ? humidity : null,
      reference: getRossObjective(r.day) };
  });
  const matched = consumption.filter(r => r.feedKg.value !== null && r.waterLitres.value !== null);
  const totalMatchedFeed = matched.reduce((sum, r) => sum + r.feedKg.value!, 0);
  const totalMatchedWater = matched.reduce((sum, r) => sum + r.waterLitres.value!, 0);
  const waterReason = timelineReason ?? "No matching daily feed/water observations.";
  const averageWeight = lastWeight ? metric(lastWeight.weightKg) : missing(weightReason ?? "No valid measured average weight.");
  const objective = lastWeight ? getRossObjective(lastWeight.day) : null;
  if (weightReason) issues.push(weightReason);
  return { version: 1, breed: "ross_308", reference: ROSS_REFERENCE,
    asOf: { companyDate, ageDays, timezone: company.timezone, recordDay: latest?.day ?? null, recordDate: latest?.date ?? null,
      weightDay: lastWeight?.day ?? null, weightDate: lastWeight?.date ?? null },
    summary: { averageWeightKg: averageWeight, weightObjective: objective,
      weightDeviationPct: objective && lastWeight ? metric((lastWeight.weightKg - objective.weightKg) / objective.weightKg * 100)
        : missing("Same-age weight objective unavailable."), cumulativeFcr: fcr, fcrEndpointDay: endpointDay,
      fcrEndpointDate: endpointDate, fcrFeedKg: scopedFeed, fcrOutputPlusRemainingKg: output,
      fcrConvention: "Recorded feed / (actual loaded live kg through endpoint + remaining birds × same-date measured live kg); placement biomass included, not subtracted; not mortality-corrected.",
      epef, epefProvisional: true, projectedWeightKg: projected, projectionDay,
      projectionLabel: "Linear projection from full-span observed ADG; not a breeder objective or forecast guarantee." },
    birdBalances: { latest: latestBalance, fcrEndpoint: endpointBalance },
    growth: { adgG: adg, referenceAdgG: refAdg, startDay: firstWeight?.day ?? null, endDay: lastWeight?.day ?? null, intervals, samples },
    uniformity: { latest: uniformitySamples.at(-1) ?? null, samples: uniformitySamples },
    day7: { weightMultiple: multiple, minimumMultiple: 4.5, meetsMinimum: multiple.value === null ? null : multiple.value >= 4.5,
      cvChangePercentagePoints: cvChange, broodingReviewSuggested: cvChange.value === null ? null : cvChange.value > 3 },
    phases: phaseMetrics, dailyConsumption: consumption,
    water: { totalWaterLitres: matched.length ? metric(totalMatchedWater) : missing(waterReason),
      matchingFeedKg: matched.length ? metric(totalMatchedFeed) : missing(waterReason),
      ratioLitresPerKg: matched.length && totalMatchedFeed > 0 && Number.isFinite(totalMatchedFeed) && Number.isFinite(totalMatchedWater)
        ? metric(totalMatchedWater / totalMatchedFeed)
        : missing(timelineReason ?? "Positive total feed on matching daily water/feed records is required."),
      matchedRecordCount: matched.length, referenceAt21C: { min: 1.6, max: 1.8 },
      usageLabel: "Metered water usage; may include flushing, spillage and leakage, not certified bird intake.",
      context: "Handbook contextual reference close to 1.6–1.8 L/kg at 21°C; temperature, drinker type and conditions matter. Do not restrict water or apply an unlimited temperature correction." },
    issues: Array.from(new Set(issues)) };
}
