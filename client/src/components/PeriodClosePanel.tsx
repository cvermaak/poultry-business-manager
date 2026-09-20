import { trpc } from "@/lib/trpc";
import { formatFinancialMutationError } from "@/lib/financial-period-errors";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CheckCircle2, CircleDollarSign, LockKeyhole, LockKeyholeOpen, Loader2, Plus, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";

const reviewLabels = {
  bank_reconciliation: "Bank reconciliation",
  vat_summary: "VAT summary",
  trial_balance: "Trial balance",
  financial_statements: "Financial statements",
} as const;

type ReviewType = keyof typeof reviewLabels;
type PeriodReviewRow = { id: number; reviewType: ReviewType; reviewStatus: string; notes: string | null };
type PeriodActionRow = { id: number; actionAt: string; actionType: string; reason: string | null; referenceType: string | null; actionBy: number };

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function monthStart() {
  const date = new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function currency(value: unknown) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0);
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
}

function statusBadge(status: string) {
  const style = status === "closed" || status === "approved" ? "bg-emerald-100 text-emerald-800" : status === "exception" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800";
  return <Badge className={style}>{status.replaceAll("_", " ")}</Badge>;
}

export function PeriodClosePanel() {
  const utils = trpc.useUtils();
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reversalOpen, setReversalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [createDraft, setCreateDraft] = useState({ periodName: "", startDate: monthStart(), endDate: todayDate(), notes: "" });
  const [reopenReason, setReopenReason] = useState("");
  const [reversalDraft, setReversalDraft] = useState({ journalEntryId: "", reversalDate: todayDate(), reason: "" });

  const periods = trpc.periodClose.list.useQuery();
  const workspace = trpc.periodClose.getWorkspace.useQuery({ periodId: selectedPeriodId ?? 0 }, { enabled: selectedPeriodId !== null });
  const reversibleJournals = trpc.periodClose.listReversibleJournals.useQuery({ periodId: selectedPeriodId ?? 0 }, { enabled: selectedPeriodId !== null && reversalOpen });

  useEffect(() => {
    if (selectedPeriodId === null && periods.data?.[0]) setSelectedPeriodId(periods.data[0].id);
  }, [periods.data, selectedPeriodId]);

  const refresh = () => {
    void Promise.all([
      utils.periodClose.list.invalidate(),
      selectedPeriodId ? utils.periodClose.getWorkspace.invalidate({ periodId: selectedPeriodId }) : Promise.resolve(),
      selectedPeriodId ? utils.periodClose.listReversibleJournals.invalidate({ periodId: selectedPeriodId }) : Promise.resolve(),
    ]);
  };
	const mutationOptions = {
		onSuccess: () => { setError(null); refresh(); },
		onError: (mutationError: unknown) => setError(formatFinancialMutationError(
			mutationError instanceof Error ? mutationError : undefined,
			"Financial control action could not be completed",
		)),
	};
  const create = trpc.periodClose.create.useMutation({
    ...mutationOptions,
    onSuccess: (result) => { setSelectedPeriodId(result.id); setCreateOpen(false); setCreateDraft({ periodName: "", startDate: monthStart(), endDate: todayDate(), notes: "" }); setError(null); void utils.periodClose.list.invalidate(); },
  });
  const recordReview = trpc.periodClose.recordReview.useMutation(mutationOptions);
  const closePeriod = trpc.periodClose.close.useMutation(mutationOptions);
  const reopenPeriod = trpc.periodClose.reopen.useMutation({ ...mutationOptions, onSuccess: () => { setReopenOpen(false); setReopenReason(""); setError(null); refresh(); } });
  const reverseJournal = trpc.periodClose.reverseManualJournal.useMutation({ ...mutationOptions, onSuccess: () => { setReversalOpen(false); setReversalDraft({ journalEntryId: "", reversalDate: todayDate(), reason: "" }); setError(null); refresh(); } });

  const current = workspace.data;
  const isClosed = current?.period.status === "closed";
  const isPending = create.isPending || recordReview.isPending || closePeriod.isPending || reopenPeriod.isPending || reverseJournal.isPending;

  const submitCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    create.mutate({ ...createDraft, notes: createDraft.notes || undefined });
  };
  const submitReopen = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedPeriodId) return;
    setError(null);
    reopenPeriod.mutate({ periodId: selectedPeriodId, reason: reopenReason });
  };
  const submitReversal = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedPeriodId || !reversalDraft.journalEntryId) return;
    setError(null);
    reverseJournal.mutate({ periodId: selectedPeriodId, journalEntryId: Number(reversalDraft.journalEntryId), reversalDate: reversalDraft.reversalDate, reason: reversalDraft.reason });
  };

  return (
    <div className="space-y-5">
      {error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Financial control action could not be completed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-base"><LockKeyhole className="h-4 w-4 text-primary" /> Financial periods</CardTitle><CardDescription>Create non-overlapping financial periods. A completed close blocks all accounting posts dated within the period.</CardDescription></div><Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> New</Button></div>
          </CardHeader>
          <CardContent className="pt-0">
            {periods.isLoading ? <div className="flex h-28 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading periods…</div> : periods.data?.length ? (
              <ScrollArea className="h-[310px] pr-3"><div className="space-y-2">{periods.data.map((period) => <button type="button" key={period.id} onClick={() => setSelectedPeriodId(period.id)} className={`w-full rounded-lg border p-3 text-left transition-colors ${selectedPeriodId === period.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}><div className="flex items-center justify-between gap-2"><span className="font-medium">{period.periodName}</span>{statusBadge(period.status)}</div><p className="mt-1 text-xs text-muted-foreground">{dateLabel(period.startDate)} – {dateLabel(period.endDate)}</p>{period.status === "closed" && <p className="mt-1 text-xs text-muted-foreground">Closed {dateLabel(period.closedAt)}</p>}</button>)}</div></ScrollArea>
            ) : <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No financial periods have been created. Start by defining the reporting period to review and close.</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" /> Close readiness</CardTitle><CardDescription>Close requires approved control reviews, completed overlapping Bank Reconciliations, and a zero Trial Balance difference.</CardDescription></CardHeader>
          <CardContent>
            {!current ? <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">Select a financial period to review controls and close readiness.</div> : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{current.period.periodName}</p><p className="text-sm text-muted-foreground">{dateLabel(current.period.startDate)} to {dateLabel(current.period.endDate)}</p></div>{statusBadge(current.period.status)}</div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className={`rounded-lg p-3 ${current.readiness.trialBalanceBalanced ? "bg-emerald-50 text-emerald-950" : "bg-rose-50 text-rose-950"}`}><p className="text-xs opacity-80">Trial Balance difference</p><p className="mt-1 font-semibold tabular-nums">{currency(current.trialBalance.difference)}</p></div>
                  <div className={`rounded-lg p-3 ${current.readiness.incompleteBankReconciliationIds.length ? "bg-rose-50 text-rose-950" : "bg-emerald-50 text-emerald-950"}`}><p className="text-xs opacity-80">Incomplete Bank reconciliations</p><p className="mt-1 font-semibold">{current.readiness.incompleteBankReconciliationIds.length}</p></div>
                  <div className={`rounded-lg p-3 ${current.readiness.missingReviewTypes.length ? "bg-amber-50 text-amber-950" : "bg-emerald-50 text-emerald-950"}`}><p className="text-xs opacity-80">Pending reviews</p><p className="mt-1 font-semibold">{current.readiness.missingReviewTypes.length}</p></div>
                  <div className={`rounded-lg p-3 ${current.readiness.exceptionReviewTypes.length ? "bg-rose-50 text-rose-950" : "bg-emerald-50 text-emerald-950"}`}><p className="text-xs opacity-80">Review exceptions</p><p className="mt-1 font-semibold">{current.readiness.exceptionReviewTypes.length}</p></div>
                </div>
                <div className="flex flex-wrap gap-2"><Button onClick={() => closePeriod.mutate({ periodId: current.period.id })} disabled={isClosed || !current.readiness.canClose || isPending}><LockKeyhole className="mr-1.5 h-4 w-4" /> Close period</Button>{isClosed && <Button variant="outline" onClick={() => setReopenOpen(true)} disabled={isPending}><LockKeyholeOpen className="mr-1.5 h-4 w-4" /> Reopen with audit reason</Button>} {!isClosed && <Button variant="outline" onClick={() => setReversalOpen(true)} disabled={isPending}><RotateCcw className="mr-1.5 h-4 w-4" /> Reverse manual journal</Button>}<Button variant="ghost" className="ml-auto" onClick={refresh}><RefreshCw className="mr-1.5 h-4 w-4" /> Refresh</Button></div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {current && <>
        <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Close control review</CardTitle><CardDescription>Approve each review only after checking the corresponding evidence. An exception blocks close until remediated and approved.</CardDescription></CardHeader>
	            <CardContent className="px-0 pb-0"><Table><TableHeader><TableRow><TableHead>Review</TableHead><TableHead>Status</TableHead><TableHead>Evidence note</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{current.reviews.map((review: PeriodReviewRow) => <TableRow key={review.id}><TableCell className="font-medium">{reviewLabels[review.reviewType]}</TableCell><TableCell>{statusBadge(review.reviewStatus)}</TableCell><TableCell className="min-w-56"><Input value={reviewNotes[review.reviewType] ?? review.notes ?? ""} onChange={(event) => setReviewNotes((notes) => ({ ...notes, [review.reviewType]: event.target.value }))} disabled={isClosed || isPending} placeholder="Optional evidence note" /></TableCell><TableCell className="text-right"><div className="flex justify-end gap-1"><Button size="sm" variant="outline" disabled={isClosed || isPending} onClick={() => recordReview.mutate({ periodId: current.period.id, reviewType: review.reviewType, reviewStatus: "exception", notes: reviewNotes[review.reviewType] || undefined })}>Flag exception</Button><Button size="sm" disabled={isClosed || isPending} onClick={() => recordReview.mutate({ periodId: current.period.id, reviewType: review.reviewType, reviewStatus: "approved", notes: reviewNotes[review.reviewType] || undefined })}><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Approve</Button></div></TableCell></TableRow>)}</TableBody></Table></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><CircleDollarSign className="h-4 w-4 text-primary" /> VAT summary</CardTitle><CardDescription>Posted General Ledger activity for the selected period, using accounts 2100 VAT Output and 1300 VAT Input.</CardDescription></CardHeader>
            <CardContent className="space-y-3"><div className="flex items-center justify-between rounded-lg bg-muted/60 p-3"><span className="text-sm text-muted-foreground">VAT output</span><span className="font-semibold tabular-nums">{currency(current.vatSummary.outputVat)}</span></div><div className="flex items-center justify-between rounded-lg bg-muted/60 p-3"><span className="text-sm text-muted-foreground">VAT input</span><span className="font-semibold tabular-nums">{currency(current.vatSummary.inputVat)}</span></div><div className={`flex items-center justify-between rounded-lg p-3 ${current.vatSummary.position === "payable" ? "bg-amber-50 text-amber-950" : current.vatSummary.position === "receivable" ? "bg-sky-50 text-sky-950" : "bg-emerald-50 text-emerald-950"}`}><span className="font-medium">Net VAT {current.vatSummary.position}</span><span className="font-semibold tabular-nums">{currency(current.vatSummary.netVat)}</span></div></CardContent>
          </Card>
        </div>
	        <Card><CardHeader className="pb-3"><CardTitle className="text-base">Financial control audit trail</CardTitle><CardDescription>Period creation, reviews, closing, reopening, and reversals are recorded here with the responsible user and reason.</CardDescription></CardHeader><CardContent className="px-0 pb-0"><ScrollArea className="h-52"><Table><TableHeader><TableRow><TableHead>When</TableHead><TableHead>Action</TableHead><TableHead>Reason / reference</TableHead><TableHead className="text-right">User</TableHead></TableRow></TableHeader><TableBody>{current.actions.length ? current.actions.map((action: PeriodActionRow) => <TableRow key={action.id}><TableCell className="whitespace-nowrap text-xs">{dateLabel(action.actionAt)}</TableCell><TableCell className="font-medium">{action.actionType.replaceAll("_", " ")}</TableCell><TableCell className="max-w-lg text-sm text-muted-foreground">{action.reason || action.referenceType || "—"}</TableCell><TableCell className="text-right text-sm">{action.actionBy}</TableCell></TableRow>) : <TableRow><TableCell colSpan={4} className="h-20 text-center text-sm text-muted-foreground">No actions have been recorded for this period.</TableCell></TableRow>}</TableBody></Table></ScrollArea></CardContent></Card>
      </>}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent style={{ width: "95vw", maxWidth: "620px" }}><form onSubmit={submitCreate}><DialogHeader><DialogTitle>Create financial period</DialogTitle><DialogDescription>Define a non-overlapping accounting period. It remains open until all close controls are approved.</DialogDescription></DialogHeader><div className="grid gap-4 py-4 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label htmlFor="period-name">Period name</Label><Input id="period-name" value={createDraft.periodName} onChange={(event) => setCreateDraft({ ...createDraft, periodName: event.target.value })} placeholder="August 2026" required /></div><div className="space-y-2"><Label htmlFor="period-start">Start date</Label><Input id="period-start" type="date" value={createDraft.startDate} onChange={(event) => setCreateDraft({ ...createDraft, startDate: event.target.value })} required /></div><div className="space-y-2"><Label htmlFor="period-end">End date</Label><Input id="period-end" type="date" value={createDraft.endDate} onChange={(event) => setCreateDraft({ ...createDraft, endDate: event.target.value })} required /></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="period-notes">Notes</Label><Input id="period-notes" value={createDraft.notes} onChange={(event) => setCreateDraft({ ...createDraft, notes: event.target.value })} placeholder="Optional close-scope note" /></div></div><DialogFooter><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" disabled={create.isPending}>{create.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Create period</Button></DialogFooter></form></DialogContent></Dialog>
      <Dialog open={reopenOpen} onOpenChange={setReopenOpen}><DialogContent style={{ width: "95vw", maxWidth: "620px" }}><form onSubmit={submitReopen}><DialogHeader><DialogTitle>Reopen financial period</DialogTitle><DialogDescription>Reopening permits new financial postings within this period. A detailed audit reason is required.</DialogDescription></DialogHeader><div className="space-y-2 py-4"><Label htmlFor="reopen-reason">Audit reason</Label><Input id="reopen-reason" value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} minLength={10} placeholder="Explain the required correction and approval" required /></div><DialogFooter><Button type="button" variant="outline" onClick={() => setReopenOpen(false)}>Cancel</Button><Button type="submit" disabled={reopenPeriod.isPending}>{reopenPeriod.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Reopen period</Button></DialogFooter></form></DialogContent></Dialog>
      <Dialog open={reversalOpen} onOpenChange={setReversalOpen}><DialogContent style={{ width: "95vw", maxWidth: "760px" }}><form onSubmit={submitReversal}><DialogHeader><DialogTitle>Reverse manual journal</DialogTitle><DialogDescription>This creates a new, equal-and-opposite journal in an open period and marks the original manual journal as reversed. Source-driven invoices and payments are intentionally excluded.</DialogDescription></DialogHeader><div className="grid gap-4 py-4 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label htmlFor="reversal-journal">Original manual journal</Label><select id="reversal-journal" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={reversalDraft.journalEntryId} onChange={(event) => setReversalDraft({ ...reversalDraft, journalEntryId: event.target.value })} required><option value="">Select a journal</option>{reversibleJournals.data?.map((journal) => <option key={journal.id} value={journal.id}>{journal.journalNumber} · {dateLabel(journal.entryDate)} · {currency(journal.totalDebit)}</option>)}</select></div><div className="space-y-2"><Label htmlFor="reversal-date">Reversal date</Label><Input id="reversal-date" type="date" value={reversalDraft.reversalDate} onChange={(event) => setReversalDraft({ ...reversalDraft, reversalDate: event.target.value })} required /></div><div className="space-y-2"><Label htmlFor="reversal-reason">Audit reason</Label><Input id="reversal-reason" value={reversalDraft.reason} onChange={(event) => setReversalDraft({ ...reversalDraft, reason: event.target.value })} minLength={10} placeholder="Reason for reversal" required /></div></div><DialogFooter><Button type="button" variant="outline" onClick={() => setReversalOpen(false)}>Cancel</Button><Button type="submit" disabled={reverseJournal.isPending || !reversalDraft.journalEntryId}>{reverseJournal.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Create reversal</Button></DialogFooter></form></DialogContent></Dialog>
    </div>
  );
}
