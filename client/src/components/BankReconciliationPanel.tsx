import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatFinancialMutationError } from "@/lib/financial-period-errors";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CheckCircle2, Landmark, Loader2, Plus, RefreshCw, Trash2, Unlink } from "lucide-react";

type AccountOption = { id: number; accountNumber: string; accountName: string };

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

function reconciliationStatus(status: string) {
  const style = status === "completed" ? "bg-emerald-100 text-emerald-800" : status === "in_progress" ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-700";
  return <Badge className={style}>{status.replace("_", " ")}</Badge>;
}

const newStatementLine = () => ({
  transactionDate: todayDate(),
  valueDate: "",
  description: "",
  reference: "",
  direction: "inflow" as "inflow" | "outflow",
  amount: "",
  runningBalance: "",
});

export function BankReconciliationPanel({ accounts }: { accounts: AccountOption[] }) {
  const utils = trpc.useUtils();
  const [selectedReconciliationId, setSelectedReconciliationId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [lineOpen, setLineOpen] = useState(false);
  const [selectedStatementLineId, setSelectedStatementLineId] = useState<number | null>(null);
  const [selectedLedgerEntryIds, setSelectedLedgerEntryIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const bankAccount = useMemo(() => accounts.find((account) => account.accountNumber === "1000") ?? null, [accounts]);
  const [createDraft, setCreateDraft] = useState({
    statementStartDate: monthStart(),
    statementEndDate: todayDate(),
    openingStatementBalance: "0.00",
    closingStatementBalance: "0.00",
    notes: "",
  });
  const [statementDraft, setStatementDraft] = useState(newStatementLine);

  const reconciliations = trpc.bankReconciliation.list.useQuery();
  const workspace = trpc.bankReconciliation.getWorkspace.useQuery(
    { reconciliationId: selectedReconciliationId ?? 0 },
    { enabled: selectedReconciliationId !== null },
  );

  const refresh = () => {
    void Promise.all([
      utils.bankReconciliation.list.invalidate(),
      selectedReconciliationId ? utils.bankReconciliation.getWorkspace.invalidate({ reconciliationId: selectedReconciliationId }) : Promise.resolve(),
    ]);
  };
  const mutationOptions = {
    onSuccess: () => { setError(null); refresh(); },
    onError: (mutationError: Error) => setError(formatFinancialMutationError(mutationError, "Bank Reconciliation action could not be completed")),
  };
  const create = trpc.bankReconciliation.create.useMutation({
    ...mutationOptions,
    onSuccess: (result) => {
      setSelectedReconciliationId(result.id);
      setCreateOpen(false);
      setError(null);
      void utils.bankReconciliation.list.invalidate();
    },
  });
  const addStatementLine = trpc.bankReconciliation.addStatementLine.useMutation({
    ...mutationOptions,
    onSuccess: () => { setLineOpen(false); setStatementDraft(newStatementLine()); setError(null); refresh(); },
  });
  const deleteStatementLine = trpc.bankReconciliation.deleteStatementLine.useMutation(mutationOptions);
  const matchStatementLine = trpc.bankReconciliation.matchStatementLine.useMutation({
    ...mutationOptions,
    onSuccess: () => { setSelectedLedgerEntryIds([]); setSelectedStatementLineId(null); setError(null); refresh(); },
  });
  const unmatchStatementLine = trpc.bankReconciliation.unmatchStatementLine.useMutation(mutationOptions);
  const complete = trpc.bankReconciliation.complete.useMutation(mutationOptions);

  useEffect(() => {
    setSelectedLedgerEntryIds([]);
  }, [selectedStatementLineId]);

  const selectedStatementLine = workspace.data?.statementLines.find((line) => line.id === selectedStatementLineId) ?? null;
  const canEdit = workspace.data?.reconciliation.status !== "completed";
  const isPending = create.isPending || addStatementLine.isPending || deleteStatementLine.isPending || matchStatementLine.isPending || unmatchStatementLine.isPending || complete.isPending;

  const toggleLedgerSelection = (id: number) => {
    setSelectedLedgerEntryIds((selected) => selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  };

  const submitCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!bankAccount) { setError("Chart of Accounts account 1000 — Bank must be active before a reconciliation can be created."); return; }
    create.mutate({ bankAccountId: bankAccount.id, ...createDraft, notes: createDraft.notes || undefined });
  };

  const submitStatementLine = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedReconciliationId) return;
    setError(null);
    addStatementLine.mutate({
      reconciliationId: selectedReconciliationId,
      ...statementDraft,
      valueDate: statementDraft.valueDate || undefined,
      reference: statementDraft.reference || undefined,
      runningBalance: statementDraft.runningBalance || undefined,
    });
  };

  return (
    <div className="space-y-5">
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Bank reconciliation action could not be completed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base"><Landmark className="h-4 w-4 text-primary" /> Reconciliation periods</CardTitle>
                <CardDescription className="mt-1">Create one controlled period per Bank statement. Account 1000 — Bank is reconciled in this phase.</CardDescription>
              </div>
              <Button size="sm" onClick={() => setCreateOpen(true)} disabled={!bankAccount}><Plus className="mr-1.5 h-4 w-4" /> New</Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {!bankAccount ? (
              <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Bank account unavailable</AlertTitle><AlertDescription>Seed or activate account 1000 — Bank in the Chart of Accounts first.</AlertDescription></Alert>
            ) : reconciliations.isLoading ? (
              <div className="flex h-28 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading reconciliation periods…</div>
            ) : reconciliations.data?.length ? (
              <ScrollArea className="h-[310px] pr-3">
                <div className="space-y-2">
                  {reconciliations.data.map((reconciliation) => (
                    <button
                      type="button"
                      key={reconciliation.id}
                      onClick={() => setSelectedReconciliationId(reconciliation.id)}
                      className={`w-full rounded-lg border p-3 text-left transition-colors ${selectedReconciliationId === reconciliation.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                    >
                      <div className="flex items-center justify-between gap-2"><span className="font-medium">{reconciliation.reconciliationNumber}</span>{reconciliationStatus(reconciliation.status)}</div>
                      <p className="mt-1 text-xs text-muted-foreground">{dateLabel(reconciliation.statementStartDate)} – {dateLabel(reconciliation.statementEndDate)}</p>
                      <p className="mt-1 text-sm font-semibold tabular-nums">Closing {currency(reconciliation.closingStatementBalance)}</p>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No Bank statement periods have been captured. Create a period from the Bank statement opening and closing balances.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Reconciliation controls</CardTitle>
            <CardDescription>Completion is blocked until the statement arithmetic balances and every in-period Bank GL line and statement line is matched exactly.</CardDescription>
          </CardHeader>
          <CardContent>
            {!workspace.data ? (
              <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">Select a reconciliation period to review statement lines and Bank GL activity.</div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><p className="font-semibold">{workspace.data.reconciliation.reconciliationNumber}</p><p className="text-sm text-muted-foreground">{workspace.data.reconciliation.bankAccountNumber} — {workspace.data.reconciliation.bankAccountName} · {dateLabel(workspace.data.reconciliation.statementStartDate)} to {dateLabel(workspace.data.reconciliation.statementEndDate)}</p></div>
                  {reconciliationStatus(workspace.data.reconciliation.status)}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg bg-muted/60 p-3"><p className="text-xs text-muted-foreground">Statement opening</p><p className="mt-1 font-semibold tabular-nums">{currency(workspace.data.reconciliation.openingStatementBalance)}</p></div>
                  <div className="rounded-lg bg-muted/60 p-3"><p className="text-xs text-muted-foreground">Statement closing</p><p className="mt-1 font-semibold tabular-nums">{currency(workspace.data.reconciliation.closingStatementBalance)}</p></div>
                  <div className="rounded-lg bg-muted/60 p-3"><p className="text-xs text-muted-foreground">Statement movement</p><p className="mt-1 font-semibold tabular-nums">{currency(workspace.data.controls.statementMovement)}</p></div>
                  <div className={`rounded-lg p-3 ${workspace.data.controls.statementBalanceDifference === "0.00" ? "bg-emerald-50 text-emerald-950" : "bg-rose-50 text-rose-950"}`}><p className="text-xs opacity-80">Balance difference</p><p className="mt-1 font-semibold tabular-nums">{currency(workspace.data.controls.statementBalanceDifference)}</p></div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={workspace.data.controls.unmatchedStatementLineIds.length ? "destructive" : "secondary"}>{workspace.data.controls.unmatchedStatementLineIds.length} unmatched statement line(s)</Badge>
                  <Badge variant={workspace.data.controls.unmatchedLedgerEntryIds.length ? "destructive" : "secondary"}>{workspace.data.controls.unmatchedLedgerEntryIds.length} unmatched Bank GL line(s)</Badge>
                  <Button className="ml-auto" disabled={!canEdit || !workspace.data.controls.canComplete || isPending} onClick={() => complete.mutate({ reconciliationId: workspace.data!.reconciliation.id })}><CheckCircle2 className="mr-1.5 h-4 w-4" /> Complete reconciliation</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {workspace.data && (
        <div className="grid gap-5 2xl:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3"><div><CardTitle className="text-base">Bank statement lines</CardTitle><CardDescription>Enter lines exactly as they appear on the statement. Identical lines are prevented within a period.</CardDescription></div><Button size="sm" onClick={() => setLineOpen(true)} disabled={!canEdit}><Plus className="mr-1.5 h-4 w-4" /> Add line</Button></div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <ScrollArea className="h-[430px]">
                <Table>
                  <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Description / reference</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {workspace.data.statementLines.length ? workspace.data.statementLines.map((line) => (
                      <TableRow key={line.id} className={selectedStatementLineId === line.id ? "bg-primary/5" : ""}>
                        <TableCell className="whitespace-nowrap text-xs">{dateLabel(line.transactionDate)}</TableCell>
                        <TableCell className="max-w-52"><p className="truncate font-medium">{line.description}</p><p className="truncate text-xs text-muted-foreground">{line.reference || "No reference"}</p></TableCell>
                        <TableCell className={`text-right font-medium tabular-nums ${line.direction === "inflow" ? "text-emerald-700" : "text-rose-700"}`}>{line.direction === "inflow" ? "+" : "−"}{currency(line.amount)}</TableCell>
                        <TableCell><Badge variant={line.status === "matched" ? "secondary" : "destructive"}>{line.status}</Badge></TableCell>
                        <TableCell className="text-right">
                          {line.status === "matched" ? <Button size="sm" variant="outline" disabled={!canEdit || isPending} onClick={() => unmatchStatementLine.mutate({ reconciliationId: workspace.data!.reconciliation.id, statementLineId: line.id })}><Unlink className="mr-1 h-3.5 w-3.5" /> Unmatch</Button> : (
                            <div className="flex justify-end gap-1"><Button size="sm" variant={selectedStatementLineId === line.id ? "default" : "outline"} disabled={!canEdit} onClick={() => setSelectedStatementLineId(line.id)}>Select</Button><Button size="icon" variant="ghost" disabled={!canEdit || isPending} onClick={() => deleteStatementLine.mutate({ reconciliationId: workspace.data!.reconciliation.id, statementLineId: line.id })} aria-label="Delete statement line"><Trash2 className="h-4 w-4 text-destructive" /></Button></div>
                          )}
                        </TableCell>
                      </TableRow>
                    )) : <TableRow><TableCell colSpan={5} className="h-24 text-center text-sm text-muted-foreground">No statement lines captured for this period.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="text-base">Bank General Ledger</CardTitle><CardDescription>{selectedStatementLine ? `Select one or more GL lines that exactly total ${selectedStatementLine.direction === "inflow" ? "+" : "−"}${currency(selectedStatementLine.amount)}.` : "Select an unmatched statement line, then select matching Bank GL entries."}</CardDescription></div>{selectedStatementLine && <Button size="sm" disabled={!canEdit || selectedLedgerEntryIds.length === 0 || isPending} onClick={() => matchStatementLine.mutate({ reconciliationId: workspace.data!.reconciliation.id, statementLineId: selectedStatementLine.id, ledgerEntryIds: selectedLedgerEntryIds })}><CheckCircle2 className="mr-1.5 h-4 w-4" /> Match {selectedLedgerEntryIds.length || ""} GL line(s)</Button>}</div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <ScrollArea className="h-[430px]">
                <Table>
                  <TableHeader><TableRow><TableHead className="w-10"></TableHead><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {workspace.data.ledgerEntries.length ? workspace.data.ledgerEntries.map((entry) => {
                      const matched = Boolean(entry.currentMatch) || Boolean(entry.isReconciled);
                      return <TableRow key={entry.id} className={matched ? "bg-muted/35" : ""}>
                        <TableCell><input type="checkbox" className="h-4 w-4 accent-primary" checked={selectedLedgerEntryIds.includes(entry.id)} disabled={!canEdit || matched || !selectedStatementLine} onChange={() => toggleLedgerSelection(entry.id)} aria-label={`Select ledger line ${entry.id}`} /></TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{dateLabel(entry.entryDate)}</TableCell>
                        <TableCell className="max-w-56"><p className="truncate">{entry.description}</p><p className="text-xs text-muted-foreground">{entry.entryNumber}</p></TableCell>
                        <TableCell className="text-right tabular-nums">{Number(entry.debit) ? currency(entry.debit) : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{Number(entry.credit) ? currency(entry.credit) : "—"}</TableCell>
                        <TableCell><Badge variant={matched ? "secondary" : "destructive"}>{matched ? "matched" : "unmatched"}</Badge></TableCell>
                      </TableRow>;
                    }) : <TableRow><TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">No Bank GL entries exist inside this statement period.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent style={{ width: "95vw", maxWidth: "760px" }}>
          <form onSubmit={submitCreate}>
            <DialogHeader><DialogTitle>Start Bank Reconciliation</DialogTitle><DialogDescription>Create a controlled reconciliation period using the opening and closing balances from the Bank statement. This does not create any journal entries.</DialogDescription></DialogHeader>
            <div className="grid gap-4 py-5 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2"><Label>Bank account</Label><Input value={bankAccount ? `${bankAccount.accountNumber} — ${bankAccount.accountName}` : "Account 1000 — Bank unavailable"} disabled /></div>
              <div className="space-y-2"><Label htmlFor="bank-reconciliation-start">Statement start date</Label><Input id="bank-reconciliation-start" type="date" value={createDraft.statementStartDate} onChange={(event) => setCreateDraft((draft) => ({ ...draft, statementStartDate: event.target.value }))} required /></div>
              <div className="space-y-2"><Label htmlFor="bank-reconciliation-end">Statement end date</Label><Input id="bank-reconciliation-end" type="date" value={createDraft.statementEndDate} onChange={(event) => setCreateDraft((draft) => ({ ...draft, statementEndDate: event.target.value }))} required /></div>
              <div className="space-y-2"><Label htmlFor="bank-reconciliation-opening">Opening statement balance</Label><Input id="bank-reconciliation-opening" inputMode="decimal" value={createDraft.openingStatementBalance} onChange={(event) => setCreateDraft((draft) => ({ ...draft, openingStatementBalance: event.target.value }))} required /></div>
              <div className="space-y-2"><Label htmlFor="bank-reconciliation-closing">Closing statement balance</Label><Input id="bank-reconciliation-closing" inputMode="decimal" value={createDraft.closingStatementBalance} onChange={(event) => setCreateDraft((draft) => ({ ...draft, closingStatementBalance: event.target.value }))} required /></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="bank-reconciliation-notes">Notes</Label><Input id="bank-reconciliation-notes" value={createDraft.notes} onChange={(event) => setCreateDraft((draft) => ({ ...draft, notes: event.target.value }))} placeholder="Optional statement reference or review note" /></div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" disabled={create.isPending}>{create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create period</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={lineOpen} onOpenChange={setLineOpen}>
        <DialogContent style={{ width: "95vw", maxWidth: "900px" }}>
          <form onSubmit={submitStatementLine}>
            <DialogHeader><DialogTitle>Add Bank Statement Line</DialogTitle><DialogDescription>Capture the transaction exactly as presented on the Bank statement. Amounts are stored as decimal rands and duplicate lines within the period are blocked.</DialogDescription></DialogHeader>
            <div className="grid gap-4 py-5 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2"><Label htmlFor="statement-transaction-date">Transaction date</Label><Input id="statement-transaction-date" type="date" value={statementDraft.transactionDate} onChange={(event) => setStatementDraft((draft) => ({ ...draft, transactionDate: event.target.value }))} required /></div>
              <div className="space-y-2"><Label htmlFor="statement-value-date">Value date</Label><Input id="statement-value-date" type="date" value={statementDraft.valueDate} onChange={(event) => setStatementDraft((draft) => ({ ...draft, valueDate: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="statement-direction">Direction</Label><select id="statement-direction" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={statementDraft.direction} onChange={(event) => setStatementDraft((draft) => ({ ...draft, direction: event.target.value as "inflow" | "outflow" }))}><option value="inflow">Inflow / credit</option><option value="outflow">Outflow / debit</option></select></div>
              <div className="space-y-2 lg:col-span-2"><Label htmlFor="statement-description">Description</Label><Input id="statement-description" value={statementDraft.description} onChange={(event) => setStatementDraft((draft) => ({ ...draft, description: event.target.value }))} placeholder="Bank statement narration" required /></div>
              <div className="space-y-2"><Label htmlFor="statement-reference">Reference</Label><Input id="statement-reference" value={statementDraft.reference} onChange={(event) => setStatementDraft((draft) => ({ ...draft, reference: event.target.value }))} placeholder="EFT / cheque / bank reference" /></div>
              <div className="space-y-2"><Label htmlFor="statement-amount">Amount</Label><Input id="statement-amount" inputMode="decimal" value={statementDraft.amount} onChange={(event) => setStatementDraft((draft) => ({ ...draft, amount: event.target.value }))} placeholder="0.00" required /></div>
              <div className="space-y-2"><Label htmlFor="statement-running-balance">Running balance</Label><Input id="statement-running-balance" inputMode="decimal" value={statementDraft.runningBalance} onChange={(event) => setStatementDraft((draft) => ({ ...draft, runningBalance: event.target.value }))} placeholder="Optional" /></div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setLineOpen(false)}>Cancel</Button><Button type="submit" disabled={addStatementLine.isPending}>{addStatementLine.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add statement line</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
