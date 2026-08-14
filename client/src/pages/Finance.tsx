import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  CircleAlert,
  Download,
  Loader2,
  ReceiptText,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getMonthStart() {
  const today = new Date();
  return toDateInputValue(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

function formatReportDate(value: string) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
}

function Amount({ value, emphasis = false }: { value: number; emphasis?: boolean }) {
  return (
    <span className={emphasis ? "font-semibold tabular-nums" : "tabular-nums"}>
      {formatCurrency(value)}
    </span>
  );
}

function MetricCard({
  label,
  value,
  description,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "positive" | "negative" | "warning";
}) {
  const toneStyles = {
    default: "bg-primary/10 text-primary",
    positive: "bg-emerald-100 text-emerald-700",
    negative: "bg-rose-100 text-rose-700",
    warning: "bg-amber-100 text-amber-700",
  }[tone];

  return (
    <Card className="overflow-hidden">
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums"><Amount value={value} /></p>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneStyles}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailCategoryTable({
  title,
  description,
  rows,
  emptyMessage,
}: {
  title: string;
  description: string;
  rows: Array<{ category: string; amount: number }>;
  emptyMessage: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {rows.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount excl. VAT</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.category}>
                  <TableCell className="font-medium">{row.category}</TableCell>
                  <TableCell className="text-right"><Amount value={row.amount} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default function Finance() {
  const today = useMemo(() => toDateInputValue(new Date()), []);
  const [startDate, setStartDate] = useState(getMonthStart);
  const [endDate, setEndDate] = useState(today);
  const [asOfDate, setAsOfDate] = useState(today);

  const periodInput = useMemo(() => ({ startDate, endDate }), [startDate, endDate]);
  const receivablesInput = useMemo(() => ({ asOfDate }), [asOfDate]);

  const profitAndLoss = trpc.financialReports.profitAndLoss.useQuery(periodInput, {
    enabled: startDate <= endDate,
  });
  const agedReceivables = trpc.financialReports.agedReceivables.useQuery(receivablesInput);
  const cashFlowStatement = trpc.financialReports.cashFlowStatement.useQuery(periodInput, {
    enabled: startDate <= endDate,
  });

  const isLoading = profitAndLoss.isLoading || agedReceivables.isLoading || cashFlowStatement.isLoading;
  const hasError = profitAndLoss.error || agedReceivables.error || cashFlowStatement.error;
  const isInvalidPeriod = startDate > endDate;

  const refreshReports = () => {
    void Promise.all([
      profitAndLoss.refetch(),
      agedReceivables.refetch(),
      cashFlowStatement.refetch(),
    ]);
  };

  const resetToMonthToDate = () => {
    setStartDate(getMonthStart());
    setEndDate(today);
    setAsOfDate(today);
  };

  const profit = profitAndLoss.data;
  const receivables = agedReceivables.data;
  const cashFlow = cashFlowStatement.data;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <WalletCards className="h-4 w-4" /> Financial Accounting
          </div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Business performance reports</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Review accrual-based profitability, outstanding customer balances, and actual cash movement from your operational records.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={resetToMonthToDate}>
            <CalendarDays className="mr-2 h-4 w-4" /> Month to date
          </Button>
          <Button variant="outline" onClick={refreshReports} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <Card className="border-primary/15 bg-muted/25">
        <CardContent className="pt-5">
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-[1fr_1fr_1fr_auto] xl:items-end">
            <div className="space-y-2">
              <Label htmlFor="financial-start-date">Report period from</Label>
              <Input id="financial-start-date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="financial-end-date">Report period to</Label>
              <Input id="financial-end-date" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="financial-as-of-date">Receivables as at</Label>
              <Input id="financial-as-of-date" type="date" value={asOfDate} onChange={(event) => setAsOfDate(event.target.value)} />
            </div>
            <p className="pb-2 text-xs text-muted-foreground xl:max-w-56">
              Profitability uses invoice and expense dates; cash flow uses recorded payment dates.
            </p>
          </div>
          {isInvalidPeriod && (
            <p className="mt-3 text-sm font-medium text-destructive">The report start date must be on or before the end date.</p>
          )}
        </CardContent>
      </Card>

      {hasError && (
        <Alert variant="destructive">
          <CircleAlert className="h-4 w-4" />
          <AlertTitle>Financial reports could not be loaded</AlertTitle>
          <AlertDescription>{hasError.message}</AlertDescription>
        </Alert>
      )}

      {isLoading && !profit && !receivables && !cashFlow ? (
        <div className="flex min-h-72 items-center justify-center rounded-xl border border-dashed bg-muted/20">
          <div className="flex items-center gap-3 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading financial reports…</div>
        </div>
      ) : (
        <Tabs defaultValue="profit-loss" className="space-y-5">
          <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-lg bg-muted p-1 sm:w-fit">
            <TabsTrigger value="profit-loss" className="gap-2"><TrendingUp className="h-4 w-4" /> Profit &amp; Loss</TabsTrigger>
            <TabsTrigger value="receivables" className="gap-2"><ReceiptText className="h-4 w-4" /> Aged Receivables</TabsTrigger>
            <TabsTrigger value="cash-flow" className="gap-2"><Banknote className="h-4 w-4" /> Cash Flow</TabsTrigger>
          </TabsList>

          <TabsContent value="profit-loss" className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Revenue" value={profit?.revenue ?? 0} description="Issued invoices, excl. VAT" icon={ArrowUpRight} tone="positive" />
              <MetricCard label="Gross profit" value={profit?.grossProfit ?? 0} description="Revenue less direct costs" icon={TrendingUp} tone={(profit?.grossProfit ?? 0) >= 0 ? "positive" : "negative"} />
              <MetricCard label="Operating expenses" value={profit?.operatingExpenses ?? 0} description="Excl. VAT, pending and paid" icon={TrendingDown} tone="warning" />
              <MetricCard label="Net profit" value={profit?.netProfit ?? 0} description="Before tax and financing" icon={WalletCards} tone={(profit?.netProfit ?? 0) >= 0 ? "positive" : "negative"} />
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
              <Card>
                <CardHeader>
                  <CardTitle>Profit &amp; Loss statement</CardTitle>
                  <CardDescription>{formatReportDate(startDate)} to {formatReportDate(endDate)} · accrual basis · excl. VAT</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-0 rounded-lg border">
                    <div className="flex items-center justify-between gap-4 px-4 py-3"><span>Revenue</span><Amount value={profit?.revenue ?? 0} emphasis /></div>
                    <div className="flex items-center justify-between gap-4 border-t px-4 py-3 text-muted-foreground"><span>Less: cost of sales</span><span className="text-foreground"><Amount value={-(profit?.costOfSales ?? 0)} /></span></div>
                    <div className="flex items-center justify-between gap-4 border-t bg-muted/40 px-4 py-3 font-semibold"><span>Gross profit</span><Amount value={profit?.grossProfit ?? 0} emphasis /></div>
                    <div className="flex items-center justify-between gap-4 border-t px-4 py-3 text-muted-foreground"><span>Less: operating expenses</span><span className="text-foreground"><Amount value={-(profit?.operatingExpenses ?? 0)} /></span></div>
                    <div className={`flex items-center justify-between gap-4 border-t px-4 py-4 text-base font-bold ${(profit?.netProfit ?? 0) >= 0 ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}><span>Net profit / (loss)</span><Amount value={profit?.netProfit ?? 0} emphasis /></div>
                  </div>
                  <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                    Direct costs are classified from poultry production categories such as chicks, feed, bedding, vaccines, cleaning, coal, transport, and veterinary costs. Mill feed invoices are included once as cost of sales.
                  </p>
                </CardContent>
              </Card>

              <div className="grid gap-5">
                <DetailCategoryTable title="Cost of sales detail" description="Direct production costs for the period" rows={profit?.costOfSalesByCategory ?? []} emptyMessage="No direct production costs were recorded for this period." />
                <DetailCategoryTable title="Operating expense detail" description="Indirect operating costs for the period" rows={profit?.operatingExpensesByCategory ?? []} emptyMessage="No operating expenses were recorded for this period." />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="receivables" className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <MetricCard label="Total outstanding" value={receivables?.totalOutstanding ?? 0} description={`As at ${formatReportDate(asOfDate)}`} icon={ReceiptText} tone="warning" />
              <MetricCard label="0–30 days" value={receivables?.buckets["0-30"] ?? 0} description="Current balances" icon={CalendarDays} />
              <MetricCard label="31–60 days" value={receivables?.buckets["31-60"] ?? 0} description="Follow up required" icon={CircleAlert} tone="warning" />
              <MetricCard label="61–90 days" value={receivables?.buckets["61-90"] ?? 0} description="Escalate collections" icon={TrendingDown} tone="negative" />
              <MetricCard label="Over 90 days" value={receivables?.buckets["90+"] ?? 0} description="High collection risk" icon={CircleAlert} tone="negative" />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Open customer receivables</CardTitle>
                <CardDescription>Balances are aged from the invoice date through {formatReportDate(asOfDate)}. Draft, cancelled, and fully paid invoices are excluded.</CardDescription>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                {(receivables?.receivables.length ?? 0) === 0 ? (
                  <div className="px-6 pb-6 text-sm text-muted-foreground">No open customer balances as at the selected date.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Invoice date</TableHead>
                          <TableHead>Due date</TableHead>
                          <TableHead className="text-center">Age</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Balance due</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {receivables?.receivables.map((invoice) => (
                          <TableRow key={invoice.id}>
                            <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                            <TableCell>{invoice.customerName}</TableCell>
                            <TableCell>{formatReportDate(invoice.invoiceDate)}</TableCell>
                            <TableCell>{formatReportDate(invoice.dueDate)}</TableCell>
                            <TableCell className="text-center"><Badge variant={invoice.bucket === "0-30" ? "secondary" : "destructive"}>{invoice.daysOutstanding} days</Badge></TableCell>
                            <TableCell><Badge variant={invoice.status === "overdue" ? "destructive" : "outline"} className="capitalize">{invoice.status}</Badge></TableCell>
                            <TableCell className="text-right"><Amount value={invoice.balanceDue} emphasis /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cash-flow" className="space-y-5">
            <div className="grid gap-4 md:grid-cols-3">
              <MetricCard label="Cash received" value={cashFlow?.cashInflows ?? 0} description="Customer and standalone receipts" icon={ArrowUpRight} tone="positive" />
              <MetricCard label="Cash paid" value={cashFlow?.cashOutflows ?? 0} description="Recorded expense and mill payments" icon={ArrowDownRight} tone="negative" />
              <MetricCard label="Net cash movement" value={cashFlow?.netCashMovement ?? 0} description="Cash received less cash paid" icon={Banknote} tone={(cashFlow?.netCashMovement ?? 0) >= 0 ? "positive" : "negative"} />
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Monthly cash movement</CardTitle>
                  <CardDescription>{formatReportDate(startDate)} to {formatReportDate(endDate)} · actual cash basis · incl. VAT</CardDescription>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  {(cashFlow?.monthlySummary.length ?? 0) === 0 ? (
                    <div className="px-6 pb-6 text-sm text-muted-foreground">No recorded cash movements for this period.</div>
                  ) : (
                    <Table>
                      <TableHeader><TableRow><TableHead>Month</TableHead><TableHead className="text-right">Received</TableHead><TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Net movement</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {cashFlow?.monthlySummary.map((month) => (
                          <TableRow key={month.month}>
                            <TableCell className="font-medium">{formatReportDate(`${month.month}-01`)}</TableCell>
                            <TableCell className="text-right text-emerald-700"><Amount value={month.cashInflows} /></TableCell>
                            <TableCell className="text-right text-rose-700"><Amount value={month.cashOutflows} /></TableCell>
                            <TableCell className={`text-right font-semibold ${month.netCashMovement >= 0 ? "text-emerald-700" : "text-rose-700"}`}><Amount value={month.netCashMovement} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Cash-flow basis</CardTitle>
                  <CardDescription>What is included in the actual movement statement.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-950"><p className="font-medium">Cash received</p><p className="mt-1 text-emerald-900/80">Invoice payments recorded in the selected period and standalone payment records.</p></div>
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-950"><p className="font-medium">Cash paid</p><p className="mt-1 text-rose-900/80">Paid operational expenses and paid mill invoices with a recorded payment date.</p></div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950"><p className="font-medium">Important scope</p><p className="mt-1 text-amber-900/80">This statement shows net cash movement, not a bank balance. It does not estimate future cash or reconcile bank transactions.</p></div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Recorded cash movements</CardTitle>
                <CardDescription>Most recent transactions appear first.</CardDescription>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                {(cashFlow?.transactions.length ?? 0) === 0 ? (
                  <div className="px-6 pb-6 text-sm text-muted-foreground">No recorded cash movements for this period.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead>Source</TableHead><TableHead>Direction</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {cashFlow?.transactions.map((transaction) => (
                          <TableRow key={transaction.id}>
                            <TableCell>{formatReportDate(transaction.date)}</TableCell>
                            <TableCell className="font-medium">{transaction.description}</TableCell>
                            <TableCell className="text-muted-foreground">{transaction.source}</TableCell>
                            <TableCell><Badge className={transaction.direction === "inflow" ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "bg-rose-100 text-rose-800 hover:bg-rose-100"}>{transaction.direction === "inflow" ? "Cash in" : "Cash out"}</Badge></TableCell>
                            <TableCell className={`text-right font-semibold ${transaction.direction === "inflow" ? "text-emerald-700" : "text-rose-700"}`}><Amount value={transaction.direction === "inflow" ? transaction.amount : -transaction.amount} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <p className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs leading-relaxed text-muted-foreground">
        <Download className="mt-0.5 h-4 w-4 shrink-0" />
        These reports are based solely on records currently captured in AFGRO Poultry Manager. They support operational review and should be reconciled to your accounting records before external or statutory reporting.
      </p>
    </div>
  );
}
