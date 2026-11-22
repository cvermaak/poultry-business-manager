import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { DailyLossHistoryCells } from "@/components/DailyLossFields";
const state = vi.hoisted(() => ({ breed: "ross_308", calls: [] as { name: string; enabled: boolean | undefined }[], daily: [] as Record<string, unknown>[] }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 1, role: "farm_manager" } }) }));
vi.mock("@/hooks/useFinancialVisibility", () => ({ useFinancialVisibility: () => ({ allowed: false }) }));
vi.mock("wouter", () => ({ useRoute: () => [true, { id: "1" }], useLocation: () => ["/flocks/1", vi.fn()] }));
vi.mock("@/lib/trpc", () => {
  const flock = { id: 1, flockNumber: "SYNTHETIC-ROSS-ONLY", houseId: 1, placementDate: "2026-10-01", growingPeriod: 42, initialCount: 1000, currentCount: 998, status: "active", targetCatchingWeight: "1.700", targetDeliveredWeight: "1.600", starterFromDay: null, starterToDay: null, growerFromDay: null, growerToDay: null, finisherFromDay: null, finisherToDay: null, starterAllocationKgPerBird: "0.000", growerAllocationKgPerBird: "1.234", finisherAllocationKgPerBird: null, weightUnit: "g" };
  const data = (name: string) => name === "flocks.getById" ? flock : name === "flocks.getDailyRecords" ? state.daily : name === "houses.getById" ? { id: 1, breed: state.breed } : name === "system.getDisplayTimezone" ? { timezone: "Africa/Johannesburg" } : name === "flocks.getPerformanceMetrics" ? { averageWeight: 9.999, targetWeight: 8.888, fcr: 7.777, mortalityRate: 6.666, rossMetrics: null } : name === "flocks.getAdvancedGrowthMetrics" || name === "flocks.getFeedEfficiencyMetrics" || name === "catch.getCatchPlan" ? undefined : [];
  const endpoint = (name: string) => ({ useQuery: (_input: unknown, options?: { enabled?: boolean }) => { state.calls.push({ name, enabled: options?.enabled }); return { data: data(name), isLoading: false, isError: false, refetch: vi.fn() }; }, useMutation: () => ({ mutate: vi.fn(), isPending: false }) });
  const invalidation = new Proxy({}, { get: () => new Proxy({}, { get: () => ({ invalidate: vi.fn() }) }) });
  return { trpc: new Proxy({}, { get: (_target, module: string) => module === "useUtils" ? () => invalidation : new Proxy({}, { get: (_moduleTarget, method: string) => endpoint(`${module}.${method}`) }) }) };
});
import FlockDetail from "@/pages/FlockDetail";
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); state.calls = []; state.daily = []; });
it("real page SSR uses exact Ross branch, suppresses failed-payload legacy statistics, gates queries, preserves loss UI and displays saved allocations for every breed", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
  vi.stubGlobal("window", { location: { search: "?tab=daily" } });
  state.breed = "ross_308";
  const ross = renderToStaticMarkup(React.createElement(FlockDetail));
  expect(ross).toContain("Ross metrics unavailable");
  expect(ross).not.toContain("9.999"); expect(ross).not.toContain("8.888"); expect(ross).not.toContain("7.777");
  expect(ross).toContain("Daily Records"); expect(ross).toContain("Track daily total losses, found dead, culls");
  expect(ross).toContain("Per-flock feed allocation (kg/bird)"); expect(ross).toContain("0.000 kg/bird"); expect(ross).toContain("1.234 kg/bird"); expect(ross).toContain("Not specified");
  expect(ross).not.toContain("Ready for Harvest"); expect(ross).not.toContain("Includes 5.5% shrinkage buffer");
  for (const name of ["flocks.getAdvancedGrowthMetrics", "flocks.getFeedEfficiencyMetrics", "flocks.getTargetGrowthCurve"]) expect(state.calls.find(call => call.name === name)?.enabled).toBe(false);
  state.calls = []; state.breed = "cobb_500";
  const cobb = renderToStaticMarkup(React.createElement(FlockDetail));
  expect(cobb).not.toContain("Ross metrics unavailable"); expect(cobb).toContain("9.999 kg"); expect(cobb).toContain("Per-flock feed allocation (kg/bird)"); expect(cobb).toContain("0.000 kg/bird");
  for (const name of ["flocks.getAdvancedGrowthMetrics", "flocks.getFeedEfficiencyMetrics", "flocks.getTargetGrowthCurve"]) expect(state.calls.find(call => call.name === name)?.enabled).toBe(true);
});

it("renders actual daily history chronologically by date even when supplied in reverse order", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
  vi.stubGlobal("window", { location: { search: "?tab=daily" } });
  state.breed = "ross_308";
  const record = (id: number, day: number, date: string, notes: string) => ({ id, flockId: 1, dayNumber: day, recordDate: date,
    mortality: 0, culls: 0, cullingReason: null, feedConsumed: null, feedType: null, waterConsumed: null,
    averageWeight: null, temperature: null, humidity: null, notes });
  state.daily = [record(2, 7, "2026-10-08", "chronology-late-marker"), record(1, 1, "2026-10-02", "chronology-early-marker")];
  const markup = renderToStaticMarkup(React.createElement(FlockDetail));
  expect(markup).toContain("chronology-early-marker"); expect(markup).toContain("chronology-late-marker");
  expect(markup.indexOf("chronology-early-marker")).toBeLessThan(markup.indexOf("chronology-late-marker"));
});

it.each(["ross_308", "cobb_500"])("keeps complete wrapped history text and readable numeric values for %s", breed => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
  vi.stubGlobal("window", { location: { search: "?tab=daily" } });
  state.breed = breed;
  const cullReason = "Synthetic recorded culling reason ".repeat(12).trim();
  const notes = "Synthetic unbroken note ".repeat(20).trim();
  state.daily = [{ id: 1, flockId: 1, recordDate: "2026-10-08", dayNumber: 7,
    mortality: 3, culls: 1, cullReason, feedConsumed: "21.500", waterConsumed: "35.800",
    feedType: "starter", averageWeight: "0.200", temperature: "25.100", humidity: "55", notes }];
  const html = renderToStaticMarkup(React.createElement(FlockDetail));
  expect(html).toContain('aria-label="Daily record history"');
  expect(html).toContain('tabindex="0"');
  expect(html).toContain("overflow-x-auto");
  expect(html).toContain("min-w-[1900px]");
  expect(html).toContain("tabular-nums");
  expect(html).toContain("whitespace-pre-wrap [overflow-wrap:anywhere]");
  expect(html).toContain("w-[196px]"); expect(html).toContain("w-[216px]");
  expect(html).toContain(cullReason); expect(html).toContain(notes);
  expect(html).toContain("21.5"); expect(html).toContain("35.8"); expect(html).toContain("0.200");
  expect(html).toContain("Separately recorded");
});

it.each([
  { mortality: 3, culls: 1, cullReason: "Synthetic reason", expected: "Separately recorded" },
  { mortality: 3, culls: null, expected: "Combined losses — mortality/cull breakdown unavailable" },
  { mortality: 1, culls: 2, expected: "Invalid stored losses — review required" },
])("preserves the loss-history state while wrapping its text: $expected", record => {
  const html = renderToStaticMarkup(React.createElement("table", null,
    React.createElement("tbody", null, React.createElement("tr", null,
      React.createElement(DailyLossHistoryCells, { record })))));
  expect(html).toContain(record.expected);
  expect(html).toContain("w-[156px]"); expect(html).toContain("w-[196px]");
  expect(html).toContain("[overflow-wrap:anywhere]");
  if (record.culls !== 1) expect(html).toContain("Unavailable");
});
