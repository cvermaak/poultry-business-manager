import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Clock3, Landmark, Loader2 } from "lucide-react";
import { Link } from "wouter";

type AttentionItem = {
  id: string;
  heading: string;
  description: string;
  amount: number;
  count: number;
  href: string;
  tone: "overdue" | "upcoming";
};

const formatCurrency = (value: unknown) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));

export default function FinancialAttentionWidget() {
  const { data: aging, isLoading, isError } = trpc.invoices.getInvoiceAgingSummary.useQuery();

  const customer = aging?.customer ?? {
    overdue: 0,
    totalOverdue: 0,
    dueSoonCount: 0,
    dueSoonAmount: 0,
  };
  const supplier = aging?.mill ?? {
    overdue: 0,
    totalOverdueAmount: 0,
    dueSoonCount: 0,
    dueSoonAmount: 0,
  };

  const attentionItems: AttentionItem[] = [
    {
      id: "customer-overdue",
      heading: "Customer invoices overdue",
      description: "Collection follow-up required",
      amount: Number(customer.totalOverdue ?? 0),
      count: Number(customer.overdue ?? 0),
      href: "/sales/invoices",
      tone: "overdue" as const,
    },
    {
      id: "customer-due-soon",
      heading: "Customer invoices due ≤7 days",
      description: "Plan collection follow-up",
      amount: Number(customer.dueSoonAmount ?? 0),
      count: Number(customer.dueSoonCount ?? 0),
      href: "/sales/invoices",
      tone: "upcoming" as const,
    },
    {
      id: "supplier-overdue",
      heading: "Supplier invoices overdue",
      description: "Payment or supplier follow-up required",
      amount: Number(supplier.totalOverdueAmount ?? 0),
      count: Number(supplier.overdue ?? 0),
      href: "/invoicing/mill-invoices",
      tone: "overdue" as const,
    },
    {
      id: "supplier-due-soon",
      heading: "Supplier invoices due ≤7 days",
      description: "Plan payment requirements",
      amount: Number(supplier.dueSoonAmount ?? 0),
      count: Number(supplier.dueSoonCount ?? 0),
      href: "/invoicing/mill-invoices",
      tone: "upcoming" as const,
    },
  ].filter((item) => item.count > 0 && item.amount > 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="h-4 w-4 text-primary" />
            Financial attention
          </CardTitle>
          <CardDescription>
            Only customer collections and supplier payments needing follow-up are shown here.
          </CardDescription>
        </div>
        <Link href="/finance?tab=receivables" className="shrink-0 text-sm font-medium text-primary hover:underline">
          View Finance →
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading financial attention…
          </div>
        ) : isError ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Financial attention is temporarily unavailable. Use Finance to review receivables and payables.</span>
          </div>
        ) : attentionItems.length === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-900">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <p className="font-medium">No customer or supplier invoice actions need attention.</p>
              <p className="text-xs text-emerald-800/80">There are no overdue invoices or invoices due within the next seven days.</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {attentionItems.map((item) => {
              const isOverdue = item.tone === "overdue";
              const Icon = isOverdue ? AlertTriangle : Clock3;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`rounded-lg border p-3 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
                    isOverdue
                      ? "border-rose-200 bg-rose-50 hover:bg-rose-100"
                      : "border-amber-200 bg-amber-50 hover:bg-amber-100"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Icon className={`h-4 w-4 shrink-0 ${isOverdue ? "text-rose-600" : "text-amber-600"}`} />
                    <Badge variant="outline" className={isOverdue ? "border-rose-300 text-rose-700" : "border-amber-300 text-amber-700"}>
                      {item.count} {item.count === 1 ? "invoice" : "invoices"}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm font-semibold leading-snug">{item.heading}</p>
                  <p className={`mt-1 text-xl font-bold tabular-nums ${isOverdue ? "text-rose-700" : "text-amber-700"}`}>
                    {formatCurrency(item.amount)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
