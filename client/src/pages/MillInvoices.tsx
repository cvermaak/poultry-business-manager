import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Factory, AlertTriangle, CheckCircle, Clock, DollarSign, Eye } from "lucide-react";

const fmt = (v: unknown) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(
    parseFloat(String(v ?? 0))
  );

const fmtDate = (v: unknown) => {
  if (!v) return "—";
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("en-ZA");
};

function getDaysUntilDue(dueDate: string | null | undefined): number | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

function AgingBadge({ dueDate, status }: { dueDate: string | null | undefined; status: string }) {
  if (status === "paid") return <Badge className="bg-green-100 text-green-700">Paid</Badge>;
  if (status === "disputed") return <Badge className="bg-purple-100 text-purple-700">Disputed</Badge>;

  const days = getDaysUntilDue(dueDate);
  if (days === null) return <Badge className="bg-gray-100 text-gray-700">Outstanding</Badge>;

  if (days < 0) return <Badge className="bg-red-100 text-red-700">Overdue {Math.abs(days)}d</Badge>;
  if (days <= 3) return <Badge className="bg-orange-100 text-orange-700">Due in {days}d</Badge>;
  if (days <= 7) return <Badge className="bg-yellow-100 text-yellow-700">Due in {days}d</Badge>;
  return <Badge className="bg-blue-100 text-blue-700">Due in {days}d</Badge>;
}

export default function MillInvoices() {
  const utils = trpc.useUtils();

  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    feedOrderId: "",
    invoiceNumber: "",
    invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    amountExcl: "",
    vatAmount: "",
    amountIncl: "",
    notes: "",
  });

  // View dialog
  const [viewInvoice, setViewInvoice] = useState<any>(null);
  const [viewOpen, setViewOpen] = useState(false);

  // Payment dialog
  const [payOpen, setPayOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<{ id: number; invoiceNumber: string; amountIncl: string } | null>(null);
  const [payForm, setPayForm] = useState({
    paidDate: new Date().toISOString().slice(0, 10),
    paidAmount: "",
    paymentReference: "",
  });

  // Data
  const { data: millInvoices = [], isLoading } = trpc.invoices.listMillInvoices.useQuery(
    statusFilter !== "all" ? { status: statusFilter } : {}
  );
  const { data: feedOrders = [] } = trpc.feedOrders.listOrders.useQuery({});

  const createMutation = trpc.invoices.createMillInvoice.useMutation({
    onSuccess: () => {
      toast.success("Mill invoice recorded");
      utils.invoices.listMillInvoices.invalidate();
      setCreateOpen(false);
      resetCreateForm();
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const payMutation = trpc.invoices.recordMillInvoicePayment.useMutation({
    onSuccess: () => {
      toast.success("Payment recorded");
      utils.invoices.listMillInvoices.invalidate();
      setPayOpen(false);
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  function resetCreateForm() {
    setCreateForm({
      feedOrderId: "",
      invoiceNumber: "",
      invoiceDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      amountExcl: "",
      vatAmount: "",
      amountIncl: "",
      notes: "",
    });
  }

  function handleCreateSubmit() {
    if (!createForm.feedOrderId || !createForm.invoiceNumber || !createForm.amountIncl) {
      toast.error("Feed Order, Invoice Number, and Amount Incl. are required");
      return;
    }
    createMutation.mutate({
      feedOrderId: parseInt(createForm.feedOrderId),
      invoiceNumber: createForm.invoiceNumber,
      invoiceDate: createForm.invoiceDate,
      dueDate: createForm.dueDate,
      amountExcl: parseFloat(createForm.amountExcl) || 0,
      vatAmount: parseFloat(createForm.vatAmount) || 0,
      amountIncl: parseFloat(createForm.amountIncl),
      notes: createForm.notes || undefined,
    });
  }

  function openPayDialog(inv: any) {
    setPayTarget({ id: inv.id, invoiceNumber: inv.invoiceNumber, amountIncl: inv.amountIncl });
    setPayForm({
      paidDate: new Date().toISOString().slice(0, 10),
      paidAmount: String(inv.amountIncl),
      paymentReference: "",
    });
    setPayOpen(true);
  }

  function handlePaySubmit() {
    if (!payTarget) return;
    payMutation.mutate({
      id: payTarget.id,
      paidDate: payForm.paidDate,
      paidAmount: parseFloat(payForm.paidAmount),
      paymentReference: payForm.paymentReference || undefined,
    });
  }

  // Auto-calc amountIncl when excl/vat change
  function handleExclChange(val: string) {
    const excl = parseFloat(val) || 0;
    const vat = parseFloat(createForm.vatAmount) || 0;
    setCreateForm((f) => ({ ...f, amountExcl: val, amountIncl: String((excl + vat).toFixed(2)) }));
  }

  function handleVatChange(val: string) {
    const excl = parseFloat(createForm.amountExcl) || 0;
    const vat = parseFloat(val) || 0;
    setCreateForm((f) => ({ ...f, vatAmount: val, amountIncl: String((excl + vat).toFixed(2)) }));
  }

  // Summary
  const outstanding = (millInvoices as any[]).filter((i) => i.status !== "paid");
  const totalOutstanding = outstanding.reduce((s: number, i: any) => s + parseFloat(String(i.amountIncl || 0)), 0);
  const overdue = outstanding.filter((i: any) => {
    const days = getDaysUntilDue(i.dueDate);
    return days !== null && days < 0;
  });
  const dueSoon = outstanding.filter((i: any) => {
    const days = getDaysUntilDue(i.dueDate);
    return days !== null && days >= 0 && days <= 7;
  });

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Mill Invoices</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Invoices from the mill to AFGRO — 14-day credit facility
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Record Mill Invoice
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <Factory className="w-8 h-8 text-blue-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Total Outstanding</p>
                  <p className="text-2xl font-bold">{fmt(totalOutstanding)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-8 h-8 text-red-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Overdue</p>
                  <p className="text-2xl font-bold text-red-600">{overdue.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <Clock className="w-8 h-8 text-yellow-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Due Within 7 Days</p>
                  <p className="text-2xl font-bold text-yellow-600">{dueSoon.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-8 h-8 text-green-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Paid This Month</p>
                  <p className="text-2xl font-bold text-green-600">
                    {(millInvoices as any[]).filter((i: any) => {
                      if (i.status !== "paid") return false;
                      const pd = i.paidDate ? new Date(i.paidDate) : null;
                      if (!pd) return false;
                      const now = new Date();
                      return pd.getMonth() === now.getMonth() && pd.getFullYear() === now.getFullYear();
                    }).length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filter */}
        <div className="flex gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="outstanding">Outstanding</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="disputed">Disputed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>Mill Invoice Register</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading…</div>
            ) : (millInvoices as any[]).length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Factory className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No mill invoices recorded yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-2 pr-4">Invoice #</th>
                      <th className="text-left py-2 pr-4">Feed Order</th>
                      <th className="text-left py-2 pr-4">Customer</th>
                      <th className="text-left py-2 pr-4">Invoice Date</th>
                      <th className="text-left py-2 pr-4">Due Date</th>
                      <th className="text-right py-2 pr-4">Excl. VAT</th>
                      <th className="text-right py-2 pr-4">VAT</th>
                      <th className="text-right py-2 pr-4">Incl. VAT</th>
                      <th className="text-left py-2 pr-4">Status</th>
                      <th className="text-left py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(millInvoices as any[]).map((inv) => (
                      <tr key={inv.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="py-2 pr-4 font-mono font-medium">{inv.invoiceNumber}</td>
                        <td className="py-2 pr-4 text-xs">{inv.orderNumber ?? "—"}</td>
                        <td className="py-2 pr-4">{inv.customerName ?? "—"}</td>
                        <td className="py-2 pr-4">{fmtDate(inv.invoiceDate)}</td>
                        <td className="py-2 pr-4">{fmtDate(inv.dueDate)}</td>
                        <td className="py-2 pr-4 text-right">{fmt(inv.amountExcl)}</td>
                        <td className="py-2 pr-4 text-right">{fmt(inv.vatAmount)}</td>
                        <td className="py-2 pr-4 text-right font-medium">{fmt(inv.amountIncl)}</td>
                        <td className="py-2 pr-4">
                          <AgingBadge dueDate={inv.dueDate} status={inv.status} />
                        </td>
                        <td className="py-2">
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm" variant="ghost"
                              className="h-7 w-7 p-0"
                              title="View details"
                              onClick={() => { setViewInvoice(inv); setViewOpen(true); }}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            {inv.status !== "paid" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => openPayDialog(inv)}
                              >
                                <DollarSign className="w-3 h-3 mr-1" />
                                Record Payment
                              </Button>
                            )}
                            {inv.status === "paid" && (
                              <span className="text-xs text-muted-foreground">
                                Paid {fmtDate(inv.paidDate)}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* View / Detail Dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Mill Invoice — {viewInvoice?.invoiceNumber}</DialogTitle>
          </DialogHeader>
          {viewInvoice && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Feed Order</p>
                  <p className="font-medium">{viewInvoice.orderNumber ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Customer</p>
                  <p className="font-medium">{viewInvoice.customerName ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Invoice Date</p>
                  <p className="font-medium">{fmtDate(viewInvoice.invoiceDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Due Date (14-day credit)</p>
                  <p className="font-medium">{fmtDate(viewInvoice.dueDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <AgingBadge dueDate={viewInvoice.dueDate} status={viewInvoice.status} />
                </div>
                {viewInvoice.status === "paid" && (
                  <div>
                    <p className="text-xs text-muted-foreground">Paid Date</p>
                    <p className="font-medium">{fmtDate(viewInvoice.paidDate)}</p>
                  </div>
                )}
              </div>

              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b">
                      <td className="p-2 text-muted-foreground">Amount Excl. VAT</td>
                      <td className="p-2 text-right font-medium">{fmt(viewInvoice.amountExcl)}</td>
                    </tr>
                    <tr className="border-b">
                      <td className="p-2 text-muted-foreground">VAT</td>
                      <td className="p-2 text-right font-medium">{fmt(viewInvoice.vatAmount)}</td>
                    </tr>
                    <tr className="bg-muted/30">
                      <td className="p-2 font-semibold">Total Incl. VAT</td>
                      <td className="p-2 text-right font-bold text-lg">{fmt(viewInvoice.amountIncl)}</td>
                    </tr>
                    {viewInvoice.status === "paid" && (
                      <tr>
                        <td className="p-2 text-green-700">Paid Amount</td>
                        <td className="p-2 text-right text-green-700 font-medium">{fmt(viewInvoice.paidAmount)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {viewInvoice.paymentReference && (
                <div>
                  <p className="text-xs text-muted-foreground">Payment Reference</p>
                  <p className="font-mono text-sm">{viewInvoice.paymentReference}</p>
                </div>
              )}

              {viewInvoice.notes && (
                <div>
                  <p className="text-xs text-muted-foreground">Notes</p>
                  <p className="bg-muted/30 rounded p-2">{viewInvoice.notes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewOpen(false)}>Close</Button>
            {viewInvoice && viewInvoice.status !== "paid" && (
              <Button onClick={() => { setViewOpen(false); openPayDialog(viewInvoice); }}>
                <DollarSign className="w-4 h-4 mr-2" />
                Record Payment
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Record Mill Invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Feed Order *</Label>
              <Select
                value={createForm.feedOrderId}
                onValueChange={(v) => setCreateForm((f) => ({ ...f, feedOrderId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select feed order" />
                </SelectTrigger>
                <SelectContent>
                  {(feedOrders as any[]).map((o) => {
                    const ord = o.order ?? o;
                    return (
                      <SelectItem key={ord.id} value={String(ord.id)}>
                        {ord.orderNumber} — {ord.feedRange} {ord.feedStage}
                        {o.customerName ? ` (${o.customerName})` : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Mill Invoice Number *</Label>
              <Input
                value={createForm.invoiceNumber}
                onChange={(e) => setCreateForm((f) => ({ ...f, invoiceNumber: e.target.value }))}
                placeholder="e.g. MILL-2024-001"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Invoice Date *</Label>
                <Input
                  type="date"
                  value={createForm.invoiceDate}
                  onChange={(e) => setCreateForm((f) => ({ ...f, invoiceDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Due Date (14 days) *</Label>
                <Input
                  type="date"
                  value={createForm.dueDate}
                  onChange={(e) => setCreateForm((f) => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Amount Excl. VAT</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={createForm.amountExcl}
                  onChange={(e) => handleExclChange(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1">
                <Label>VAT Amount</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={createForm.vatAmount}
                  onChange={(e) => handleVatChange(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1">
                <Label>Amount Incl. VAT *</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={createForm.amountIncl}
                  onChange={(e) => setCreateForm((f) => ({ ...f, amountIncl: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea
                value={createForm.notes}
                onChange={(e) => setCreateForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes…"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateSubmit} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Saving…" : "Save Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          {payTarget && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Invoice <span className="font-mono font-medium">{payTarget.invoiceNumber}</span> —
                Total: <span className="font-medium">{fmt(payTarget.amountIncl)}</span>
              </p>
              <div className="space-y-1">
                <Label>Payment Date *</Label>
                <Input
                  type="date"
                  value={payForm.paidDate}
                  onChange={(e) => setPayForm((f) => ({ ...f, paidDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Amount Paid *</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={payForm.paidAmount}
                  onChange={(e) => setPayForm((f) => ({ ...f, paidAmount: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Payment Reference</Label>
                <Input
                  value={payForm.paymentReference}
                  onChange={(e) => setPayForm((f) => ({ ...f, paymentReference: e.target.value }))}
                  placeholder="EFT ref / cheque no."
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button onClick={handlePaySubmit} disabled={payMutation.isPending}>
              {payMutation.isPending ? "Saving…" : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
