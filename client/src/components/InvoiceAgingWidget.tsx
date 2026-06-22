import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, CheckCircle, Factory, FileText } from "lucide-react";
import { Link } from "wouter";

const fmt = (v: unknown) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(
    parseFloat(String(v ?? 0))
  );

function getDaysUntilDue(dueDate: string | null | undefined): number | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

export default function InvoiceAgingWidget() {
  const { data: aging, isLoading } = trpc.invoices.getInvoiceAgingSummary.useQuery();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Invoice Aging
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading…</div>
        </CardContent>
      </Card>
    );
  }

  const customer = aging?.customer ?? { totalOutstanding: 0, overdueCount: 0, overdueAmount: 0, dueSoonCount: 0 };
  const mill = aging?.mill ?? { totalOutstanding: 0, overdueCount: 0, dueSoonCount: 0, dueSoonAmount: 0 };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Invoice Aging
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Customer Invoices */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Customer Invoices
            </span>
            <Link href="/invoicing/feed-invoices">
              <span className="text-xs text-primary hover:underline cursor-pointer">View all →</span>
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-muted/40 rounded-lg p-2 text-center">
              <p className="text-xs text-muted-foreground">Outstanding</p>
              <p className="text-sm font-bold">{fmt(customer.totalOutstanding)}</p>
            </div>
            <div className={`rounded-lg p-2 text-center ${(customer.overdueCount ?? 0) > 0 ? "bg-red-50 dark:bg-red-950/20" : "bg-muted/40"}`}>
              <p className="text-xs text-muted-foreground">Overdue</p>
              <p className={`text-sm font-bold ${(customer.overdueCount ?? 0) > 0 ? "text-red-600" : ""}`}>
                {customer.overdueCount ?? 0}
              </p>
            </div>
            <div className={`rounded-lg p-2 text-center ${(customer.dueSoonCount ?? 0) > 0 ? "bg-yellow-50 dark:bg-yellow-950/20" : "bg-muted/40"}`}>
              <p className="text-xs text-muted-foreground">Due ≤7d</p>
              <p className={`text-sm font-bold ${(customer.dueSoonCount ?? 0) > 0 ? "text-yellow-600" : ""}`}>
                {customer.dueSoonCount ?? 0}
              </p>
            </div>
          </div>
        </div>

        <div className="border-t" />

        {/* Mill Invoices */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Mill Invoices (AFGRO owes)
            </span>
            <Link href="/invoicing/mill-invoices">
              <span className="text-xs text-primary hover:underline cursor-pointer">View all →</span>
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-muted/40 rounded-lg p-2 text-center">
              <p className="text-xs text-muted-foreground">Outstanding</p>
              <p className="text-sm font-bold">{fmt(mill.totalOutstanding)}</p>
            </div>
            <div className={`rounded-lg p-2 text-center ${(mill.overdueCount ?? 0) > 0 ? "bg-red-50 dark:bg-red-950/20" : "bg-muted/40"}`}>
              <p className="text-xs text-muted-foreground">Overdue</p>
              <p className={`text-sm font-bold ${(mill.overdueCount ?? 0) > 0 ? "text-red-600" : ""}`}>
                {mill.overdueCount ?? 0}
              </p>
            </div>
            <div className={`rounded-lg p-2 text-center ${(mill.dueSoonCount ?? 0) > 0 ? "bg-orange-50 dark:bg-orange-950/20" : "bg-muted/40"}`}>
              <p className="text-xs text-muted-foreground">Due ≤7d</p>
              <p className={`text-sm font-bold ${(mill.dueSoonCount ?? 0) > 0 ? "text-orange-600" : ""}`}>
                {mill.dueSoonCount ?? 0}
              </p>
            </div>
          </div>
          {(mill.overdueCount ?? 0) > 0 && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600 bg-red-50 dark:bg-red-950/20 rounded px-2 py-1">
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              {mill.overdueCount} mill invoice{(mill.overdueCount ?? 0) > 1 ? "s" : ""} overdue — action required
            </div>
          )}
          {(mill.dueSoonCount ?? 0) > 0 && (mill.overdueCount ?? 0) === 0 && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-orange-600 bg-orange-50 dark:bg-orange-950/20 rounded px-2 py-1">
              <Clock className="w-3 h-3 flex-shrink-0" />
              {mill.dueSoonCount} mill invoice{(mill.dueSoonCount ?? 0) > 1 ? "s" : ""} due within 7 days
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
