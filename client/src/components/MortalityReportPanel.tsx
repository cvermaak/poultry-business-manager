import React, { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import type { MortalityReport, MortalityReportRow } from "@shared/mortality-report";
import type { ProductionReportOptions } from "@shared/production-reports";
import { buildMortalityCsv } from "@/lib/mortality-report-csv";
import { canExportFlockPerformance, changeFlockPerformanceHouse, defaultFlockPerformanceDraft, flockPerformanceInput, sameFlockPerformanceFilters, validateFlockPerformanceDraft, type FlockPerformanceDraft } from "@/lib/flock-performance-ui";
import { MortalityDetailView, MortalityReportView } from "./MortalityReport";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Download, Loader2 } from "lucide-react";

/** Mounted only after the page's report role allowlist passes. */
export function MortalityReportPanel({ authorized }: { authorized: boolean }) {
  const optionsQuery = trpc.productionReports.options.useQuery(undefined, { enabled: authorized, retry: false, refetchOnWindowFocus: false });
  const options: ProductionReportOptions | undefined = optionsQuery.data;
  const [draft, setDraft] = useState<FlockPerformanceDraft | null>(null);
  const [applied, setApplied] = useState<FlockPerformanceDraft | null>(null);
  const [validation, setValidation] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MortalityReportRow | null>(null);
  useEffect(() => {
    if (options && !draft) { const initial = defaultFlockPerformanceDraft(options.today); setDraft(initial); setApplied(initial); }
  }, [options, draft]);
  const reportQuery = trpc.productionReports.mortality.useQuery(flockPerformanceInput(applied ?? defaultFlockPerformanceDraft("")), {
    enabled: authorized && !!applied && !!options && !optionsQuery.isError, retry: false, refetchOnWindowFocus: false,
  });
  const report: MortalityReport | undefined = reportQuery.data;
  const selectedRow = !reportQuery.isError ? report?.rows.find(row => row.flockId === selected?.flockId) : undefined;
  const dirty = !sameFlockPerformanceFilters(draft, applied);
  const exportAllowed = canExportFlockPerformance({ authorized, hasReport: !!report,
    fetching: reportQuery.isFetching || optionsQuery.isFetching, error: reportQuery.isError || optionsQuery.isError, dirty });
  const update = (patch: Partial<FlockPerformanceDraft>) => {
    if (draft) setDraft({ ...draft, ...patch }); setValidation(null); setExportError(null);
  };
  function apply(next: FlockPerformanceDraft) {
    if (!options) return;
    const error = validateFlockPerformanceDraft(next, options); setValidation(error); setExportError(null);
    if (error) return;
    setSelected(null);
    if (sameFlockPerformanceFilters(next, applied)) void reportQuery.refetch(); else setApplied({ ...next });
  }
  function download() {
    if (!exportAllowed || !report) return;
    let url: string | undefined;
    try {
      url = URL.createObjectURL(new Blob([buildMortalityCsv(report)], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a"); anchor.href = url;
      anchor.download = `mortality_${report.filters.startDate ?? "beginning"}_${report.filters.endDate}.csv`;
      document.body.appendChild(anchor); try { anchor.click(); } finally { anchor.remove(); }
      setExportError(null);
    } catch { setExportError("CSV download could not be created. Please try again."); }
    finally { if (url) { const objectUrl = url; window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000); } }
  }
  const flockOptions = options?.flocks.filter(flock => !draft?.houseId || flock.houseId === Number(draft.houseId)) ?? [];
  const selectClass = "h-9 w-full min-w-0 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return <div className="space-y-5">
    {optionsQuery.isError && <div role="alert" className="space-y-2 rounded-lg border border-destructive/40 p-4 text-sm"><p>Report filters could not be loaded: {optionsQuery.error.message}</p><Button variant="outline" onClick={() => void optionsQuery.refetch()} disabled={optionsQuery.isFetching}>Retry filters</Button></div>}
    {!options && !optionsQuery.isError && <p role="status" className="text-sm text-muted-foreground">Loading company calendar and filter options…</p>}
    {options && draft && <Card><CardHeader><CardTitle><h2 className="text-lg">Mortality report filters</h2></CardTitle><p className="text-xs text-muted-foreground">Inclusive operational dates · {options.timezone} · Company today: {options.today}. Blank start means from placement.</p></CardHeader><CardContent>
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); apply(draft); }}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-2 text-sm font-medium" htmlFor="mortality-start">Start date (optional)<Input id="mortality-start" className="mt-2" type="date" value={draft.startDate} onChange={event => update({ startDate: event.target.value })} /></label>
          <label className="space-y-2 text-sm font-medium" htmlFor="mortality-end">End date (E)<Input id="mortality-end" className="mt-2" type="date" required value={draft.endDate} onChange={event => update({ endDate: event.target.value })} /></label>
          <label className="space-y-2 text-sm font-medium" htmlFor="mortality-house">House<select id="mortality-house" className={`${selectClass} mt-2`} value={draft.houseId} onChange={event => { setDraft(changeFlockPerformanceHouse(draft, event.target.value, options)); setValidation(null); setExportError(null); }}><option value="">All houses</option>{options.houses.map(house => <option key={house.id} value={house.id}>{house.name} (#{house.id})</option>)}</select></label>
          <label className="space-y-2 text-sm font-medium" htmlFor="mortality-flock">Flock<select id="mortality-flock" className={`${selectClass} mt-2`} value={draft.flockId} onChange={event => update({ flockId: event.target.value })}><option value="">All matching flocks</option>{flockOptions.map(flock => <option key={flock.id} value={flock.id}>{flock.flockNumber} (#{flock.id}) · {flock.status}</option>)}</select></label>
        </div>
        {validation && <p role="alert" className="text-sm text-destructive">{validation}</p>}
        <div className="flex flex-wrap items-center gap-2"><Button type="submit" disabled={optionsQuery.isFetching || optionsQuery.isError || reportQuery.isFetching}>Apply filters</Button>
          <Button type="button" variant="outline" disabled={optionsQuery.isFetching || optionsQuery.isError || reportQuery.isFetching} onClick={() => { const reset = defaultFlockPerformanceDraft(options.today); setDraft(reset); apply(reset); }}>Reset filters and apply</Button>
          <Button type="button" variant="outline" className="sm:ml-auto" disabled={!exportAllowed} onClick={download} aria-describedby="mortality-export-help"><Download aria-hidden="true" />Download CSV</Button></div>
        <p id="mortality-export-help" className="text-xs text-muted-foreground">CSV contains summary, flock, daily-trend and reviewed-source rows from this applied snapshot. It is disabled during loading, errors or unapplied changes.</p>
        {dirty && <p role="status" className="text-sm text-amber-800 dark:text-amber-200">Unapplied filter changes. Results retain the applied selection; apply changes before exporting.</p>}
        {exportError && <p role="alert" className="text-sm text-destructive">{exportError}</p>}
      </form>
    </CardContent></Card>}
    {reportQuery.isFetching && applied && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 aria-hidden="true" className="size-4 animate-spin" />Loading applied mortality snapshot… Export is disabled.</p>}
    {reportQuery.isError && <div role="alert" className="space-y-2 rounded-lg border border-destructive/40 p-4 text-sm"><p>Mortality could not be loaded: {reportQuery.error.message}</p><p>No failed result is exportable.</p><Button variant="outline" onClick={() => void reportQuery.refetch()} disabled={reportQuery.isFetching}>Retry applied report</Button></div>}
    {report && !reportQuery.isError && <MortalityReportView report={report} onSelectFlock={setSelected} />}
    <Dialog open={!!selectedRow} onOpenChange={open => { if (!open) setSelected(null); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-6xl"><DialogHeader><DialogTitle>Mortality · {selectedRow?.flockNumber}</DialogTitle><DialogDescription>Read-only recorded mortality by operational date, with source IDs, denominator and capture warnings.</DialogDescription></DialogHeader>{selectedRow && <MortalityDetailView row={selectedRow} />}</DialogContent></Dialog>
  </div>;
}
