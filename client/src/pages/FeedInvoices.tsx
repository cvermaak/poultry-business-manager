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
import { Plus, FileText, DollarSign, Clock, CheckCircle, Trash2 } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
};

const fmt = (v: unknown) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(
    parseFloat(String(v ?? 0))
  );

const fmtDate = (v: unknown) => {
  if (!v) return "—";
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("en-ZA");
};

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  vatPercent: number;
}

const defaultLine = (): LineItem => ({
  description: "",
  quantity: 1,
  unitPrice: 0,
  discountPercent: 0,
  vatPercent: 15,
});

export default function FeedInvoices() {
  const utils = trpc.useUtils();

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    customerId: "",
    deliveryId: "",
    feedOrderId: "",
    invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    notes: "",
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([defaultLine()]);

  // Data queries
  const { data: invoices = [], isLoading } = trpc.invoices.listFeedDeliveryInvoices.useQuery({
    status: statusFilter !== "all" ? statusFilter : undefined,
    customerId: customerFilter !== "all" ? parseInt(customerFilter) : undefined,
  });

  const { data: customers = [] } = trpc.customers.list.useQuery();
  const { data: feedOrders = [] } = trpc.feedOrders.listOrders.useQuery({});
  const { data: deliveries = [] } = trpc.feedOrders.listDeliveries.useQuery(
    form.feedOrderId ? parseInt(form.feedOrderId) : 0,
    { enabled: !!form.feedOrderId }
  );

  const createMutation = trpc.invoices.createFeedDeliveryInvoice.useMutation({
    onSuccess: () => {
      toast.success("Feed invoice created successfully");
      utils.invoices.listFeedDeliveryInvoices.invalidate();
      setCreateOpen(false);
      resetForm();
    },
    onError: (err) => toast.error(`Failed to create invoice: ${err.message}`),
  });

  function resetForm() {
    setForm({
      customerId: "",
      deliveryId: "",
      feedOrderId: "",
      invoiceDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      notes: "",
    });
    setLineItems([defaultLine()]);
  }

  function updateLine(idx: number, field: keyof LineItem, value: string | number) {
    setLineItems((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  }

  function addLine() {
    setLineItems((prev) => [...prev, defaultLine()]);
  }

  function removeLine(idx: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function calcTotals() {
    let excl = 0, vat = 0;
    for (const l of lineItems) {
      const sub = l.quantity * l.unitPrice;
      const disc = sub * (l.discountPercent / 100);
      const e = sub - disc;
      excl += e;
      vat += e * (l.vatPercent / 100);
    }
    return { excl, vat, incl: excl + vat };
  }

  function handleSubmit() {
    if (!form.customerId || !form.deliveryId || !form.feedOrderId) {
      toast.error("Customer, Feed Order, and Delivery are required");
      return;
    }
    if (lineItems.some((l) => !l.description || l.quantity <= 0)) {
      toast.error("All line items must have a description and quantity > 0");
      return;
    }
    createMutation.mutate({
      customerId: parseInt(form.customerId),
      deliveryId: parseInt(form.deliveryId),
      feedOrderId: parseInt(form.feedOrderId),
      invoiceDate: form.invoiceDate,
      dueDate: form.dueDate,
      lineItems,
      notes: form.notes || undefined,
    });
  }

  const totals = calcTotals();

  // Summary stats
  const totalOutstanding = invoices
    .filter((i) => i.status !== "paid" && i.status !== "cancelled")
    .reduce((s, i) => s + parseFloat(String(i.balanceDue ?? 0)), 0);
  const totalOverdue = invoices
    .filter((i) => {
      if (i.status === "paid" || i.status === "cancelled") return false;
      const due = i.dueDate ? new Date(i.dueDate as string) : null;
      return due && due < new Date();
    })
    .reduce((s, i) => s + parseFloat(String(i.balanceDue ?? 0)), 0);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Feed Invoices</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Customer invoices for feed deliveries
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Feed Invoice
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <FileText className="w-8 h-8 text-blue-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Total Invoices</p>
                  <p className="text-2xl font-bold">{invoices.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <Clock className="w-8 h-8 text-yellow-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Outstanding</p>
                  <p className="text-2xl font-bold">{fmt(totalOutstanding)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <DollarSign className="w-8 h-8 text-red-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Overdue</p>
                  <p className="text-2xl font-bold text-red-600">{fmt(totalOverdue)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={customerFilter} onValueChange={setCustomerFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Customers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Customers</SelectItem>
              {customers.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Invoice Table */}
        <Card>
          <CardHeader>
            <CardTitle>Feed Delivery Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading invoices…</div>
            ) : invoices.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No feed invoices found</p>
                <p className="text-sm mt-1">Create an invoice from a feed order delivery</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-2 pr-4">Invoice #</th>
                      <th className="text-left py-2 pr-4">Customer</th>
                      <th className="text-left py-2 pr-4">Invoice Date</th>
                      <th className="text-left py-2 pr-4">Due Date</th>
                      <th className="text-right py-2 pr-4">Excl. VAT</th>
                      <th className="text-right py-2 pr-4">VAT</th>
                      <th className="text-right py-2 pr-4">Total Incl.</th>
                      <th className="text-right py-2 pr-4">Balance Due</th>
                      <th className="text-left py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => {
                      const due = inv.dueDate ? new Date(inv.dueDate as string) : null;
                      const isOverdue =
                        due && due < new Date() && inv.status !== "paid" && inv.status !== "cancelled";
                      return (
                        <tr key={inv.id} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="py-2 pr-4 font-mono font-medium">{inv.invoiceNumber}</td>
                          <td className="py-2 pr-4">{inv.customerName ?? "—"}</td>
                          <td className="py-2 pr-4">{fmtDate(inv.invoiceDate)}</td>
                          <td className={`py-2 pr-4 ${isOverdue ? "text-red-600 font-medium" : ""}`}>
                            {fmtDate(inv.dueDate)}
                          </td>
                          <td className="py-2 pr-4 text-right">{fmt(inv.exclusiveTotal)}</td>
                          <td className="py-2 pr-4 text-right">{fmt(inv.vatAmount)}</td>
                          <td className="py-2 pr-4 text-right font-medium">{fmt(inv.inclusiveTotal)}</td>
                          <td className="py-2 pr-4 text-right font-medium text-orange-600">
                            {fmt(inv.balanceDue)}
                          </td>
                          <td className="py-2">
                            <Badge
                              className={
                                STATUS_COLORS[isOverdue ? "overdue" : (inv.status as string)] ??
                                "bg-gray-100 text-gray-700"
                              }
                            >
                              {isOverdue ? "Overdue" : String(inv.status)}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create Invoice Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Feed Delivery Invoice</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Customer + Feed Order */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Customer *</Label>
                <Select value={form.customerId} onValueChange={(v) => setForm((f) => ({ ...f, customerId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Feed Order *</Label>
                <Select
                  value={form.feedOrderId}
                  onValueChange={(v) => setForm((f) => ({ ...f, feedOrderId: v, deliveryId: "" }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select feed order" />
                  </SelectTrigger>
                  <SelectContent>
                    {(feedOrders as any[]).map((o) => (
                      <SelectItem key={o.id} value={String(o.id)}>
                        {o.orderNumber} — {o.feedRange} {o.feedStage}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Delivery */}
            <div className="space-y-1">
              <Label>Delivery *</Label>
              <Select
                value={form.deliveryId}
                onValueChange={(v) => setForm((f) => ({ ...f, deliveryId: v }))}
                disabled={!form.feedOrderId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={form.feedOrderId ? "Select delivery" : "Select feed order first"} />
                </SelectTrigger>
                <SelectContent>
                  {(deliveries as any[]).map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.deliveryDate} — {d.quantityDeliveredTons} tons
                      {d.customerInvoiceId ? " (already invoiced)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Invoice Date *</Label>
                <Input
                  type="date"
                  value={form.invoiceDate}
                  onChange={(e) => setForm((f) => ({ ...f, invoiceDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Due Date *</Label>
                <Input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
            </div>

            {/* Line Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Line Items</Label>
                <Button variant="outline" size="sm" onClick={addLine}>
                  <Plus className="w-3 h-3 mr-1" />
                  Add Line
                </Button>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2">Description</th>
                      <th className="text-right p-2 w-20">Qty</th>
                      <th className="text-right p-2 w-28">Unit Price</th>
                      <th className="text-right p-2 w-20">Disc %</th>
                      <th className="text-right p-2 w-20">VAT %</th>
                      <th className="text-right p-2 w-28">Amount</th>
                      <th className="p-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((l, idx) => {
                      const sub = l.quantity * l.unitPrice;
                      const disc = sub * (l.discountPercent / 100);
                      const excl = sub - disc;
                      const vat = excl * (l.vatPercent / 100);
                      const amount = excl + vat;
                      return (
                        <tr key={idx} className="border-t">
                          <td className="p-1">
                            <Input
                              value={l.description}
                              onChange={(e) => updateLine(idx, "description", e.target.value)}
                              placeholder="Description"
                              className="h-8 text-sm"
                            />
                          </td>
                          <td className="p-1">
                            <Input
                              type="number"
                              min={0}
                              step="0.001"
                              value={l.quantity}
                              onChange={(e) => updateLine(idx, "quantity", parseFloat(e.target.value) || 0)}
                              className="h-8 text-sm text-right"
                            />
                          </td>
                          <td className="p-1">
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={l.unitPrice}
                              onChange={(e) => updateLine(idx, "unitPrice", parseFloat(e.target.value) || 0)}
                              className="h-8 text-sm text-right"
                            />
                          </td>
                          <td className="p-1">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={l.discountPercent}
                              onChange={(e) => updateLine(idx, "discountPercent", parseFloat(e.target.value) || 0)}
                              className="h-8 text-sm text-right"
                            />
                          </td>
                          <td className="p-1">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={l.vatPercent}
                              onChange={(e) => updateLine(idx, "vatPercent", parseFloat(e.target.value) || 0)}
                              className="h-8 text-sm text-right"
                            />
                          </td>
                          <td className="p-1 text-right font-medium pr-2">
                            {fmt(amount)}
                          </td>
                          <td className="p-1">
                            {lineItems.length > 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                                onClick={() => removeLine(idx)}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-muted/30 border-t">
                    <tr>
                      <td colSpan={5} className="p-2 text-right text-sm text-muted-foreground">
                        Excl. VAT
                      </td>
                      <td className="p-2 text-right font-medium">{fmt(totals.excl)}</td>
                      <td></td>
                    </tr>
                    <tr>
                      <td colSpan={5} className="p-2 text-right text-sm text-muted-foreground">
                        VAT
                      </td>
                      <td className="p-2 text-right font-medium">{fmt(totals.vat)}</td>
                      <td></td>
                    </tr>
                    <tr>
                      <td colSpan={5} className="p-2 text-right font-semibold">
                        Total Incl. VAT
                      </td>
                      <td className="p-2 text-right font-bold text-lg">{fmt(totals.incl)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes…"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating…" : "Create Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
