import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
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
import { Plus, FileText, DollarSign, Clock, Trash2, Info, Eye, Download, Send, XCircle, CreditCard } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-700",
  partial: "bg-yellow-100 text-yellow-700",
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

const FEED_RANGE_LABELS: Record<string, string> = {
  premium: "Premium",
  value: "Value",
  econo: "Econo",
};

const FEED_STAGE_LABELS: Record<string, string> = {
  starter: "Starter",
  grower: "Grower",
  finisher: "Finisher",
};

export default function FeedInvoices() {
  const utils = trpc.useUtils();

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    customerId: "",
    feedOrderId: "",
    invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    notes: "",
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([defaultLine()]);
  const [priceNotFound, setPriceNotFound] = useState(false);

  // View/detail dialog
  const [viewInvoice, setViewInvoice] = useState<any>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const { data: viewItems = [] } = trpc.invoices.getItems.useQuery(
    viewInvoice?.id ?? 0,
    { enabled: !!viewInvoice?.id }
  );

  // Payment dialog
  const [payInvoice, setPayInvoice] = useState<any>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState({
    amount: "",
    paymentMethod: "eft",
    paymentDate: new Date().toISOString().slice(0, 10),
  });

  // Data queries
  const { data: invoices = [], isLoading } = trpc.invoices.listFeedDeliveryInvoices.useQuery({
    status: statusFilter !== "all" ? statusFilter : undefined,
    customerId: customerFilter !== "all" ? parseInt(customerFilter) : undefined,
  });

  const { data: customers = [] } = trpc.customers.list.useQuery();
  const { data: feedOrders = [] } = trpc.feedOrders.listOrders.useQuery({});

  // Resolve the selected feed order object
  const selectedOrderRow = (feedOrders as any[]).find((o) => {
    const ord = o.order ?? o;
    return String(ord.id) === form.feedOrderId;
  });
  const selectedOrder = selectedOrderRow ? (selectedOrderRow.order ?? selectedOrderRow) : null;

  // Look up the customer price for the selected order's feed range + stage
  const { data: customerPrice } = trpc.feedManagement.getCustomerFeedPrice.useQuery(
    {
      customerId: parseInt(form.customerId),
      feedRange: selectedOrder?.feedRange as any,
      feedType: selectedOrder?.feedStage as any,
    },
    {
      enabled: !!(form.customerId && selectedOrder?.feedRange && selectedOrder?.feedStage),
    }
  );

  // Auto-populate line items when a feed order is selected and customer price is resolved
  useEffect(() => {
    if (!selectedOrder) return;

    const qty = parseFloat(selectedOrder.quantityTons || "0");
    if (qty <= 0) return;

    const pricePerTon = customerPrice
      ? parseFloat(String(customerPrice.pricePerTon))
      : selectedOrder.pricePerTon
      ? parseFloat(String(selectedOrder.pricePerTon))
      : 0;

    setPriceNotFound(!customerPrice && !selectedOrder.pricePerTon);

    const feedLabel = `${FEED_RANGE_LABELS[selectedOrder.feedRange] ?? selectedOrder.feedRange} ${FEED_STAGE_LABELS[selectedOrder.feedStage] ?? selectedOrder.feedStage} Feed`;
    const lines: LineItem[] = [
      {
        description: `${feedLabel} — ${qty.toFixed(3)} tons`,
        quantity: qty,
        unitPrice: pricePerTon,
        discountPercent: 0,
        vatPercent: 15,
      },
    ];

    // Add transport line if AFGRO delivers and there is a transport cost
    const transportTotal = parseFloat(selectedOrder.transportCostTotal || "0");
    if (selectedOrder.transportMode === "afgro_delivers" && transportTotal > 0) {
      lines.push({
        description: `Delivery — ${qty.toFixed(3)} tons`,
        quantity: qty,
        unitPrice: parseFloat(selectedOrder.transportCostPerTon || "0"),
        discountPercent: 0,
        vatPercent: 15,
      });
    }

    setLineItems(lines);
  }, [selectedOrder, customerPrice]);

  // Mutations
  const createMutation = trpc.invoices.createFeedDeliveryInvoice.useMutation({
    onSuccess: () => {
      toast.success("Feed invoice created successfully");
      utils.invoices.listFeedDeliveryInvoices.invalidate();
      setCreateOpen(false);
      resetForm();
    },
    onError: (err) => toast.error(`Failed to create invoice: ${err.message}`),
  });

  const payMutation = trpc.invoices.recordPayment.useMutation({
    onSuccess: () => {
      toast.success("Payment recorded successfully");
      utils.invoices.listFeedDeliveryInvoices.invalidate();
      setPayOpen(false);
      setPayInvoice(null);
    },
    onError: (err) => toast.error(`Failed to record payment: ${err.message}`),
  });

  const sendMutation = trpc.invoices.markAsSent.useMutation({
    onSuccess: () => {
      toast.success("Invoice marked as sent");
      utils.invoices.listFeedDeliveryInvoices.invalidate();
    },
    onError: (err) => toast.error(`Failed to update invoice: ${err.message}`),
  });

  const cancelMutation = trpc.invoices.cancel.useMutation({
    onSuccess: () => {
      toast.success("Invoice cancelled");
      utils.invoices.listFeedDeliveryInvoices.invalidate();
    },
    onError: (err) => toast.error(`Failed to cancel invoice: ${err.message}`),
  });

  const pdfMutation = trpc.invoices.generatePDF.useMutation({
    onSuccess: (data) => {
      const binaryString = atob(data.pdfBuffer);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = data.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Invoice downloaded");
    },
    onError: (err) => toast.error(`PDF generation failed: ${err.message}`),
  });

  function resetForm() {
    setForm({
      customerId: "",
      feedOrderId: "",
      invoiceDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      notes: "",
    });
    setLineItems([defaultLine()]);
    setPriceNotFound(false);
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

  function calcTotals(items: LineItem[] = lineItems) {
    let excl = 0, vat = 0;
    for (const l of items) {
      const sub = l.quantity * l.unitPrice;
      const disc = sub * (l.discountPercent / 100);
      const e = sub - disc;
      excl += e;
      vat += e * (l.vatPercent / 100);
    }
    return { excl, vat, incl: excl + vat };
  }

  function handleSubmit() {
    if (!form.customerId || !form.feedOrderId) {
      toast.error("Customer and Feed Order are required");
      return;
    }
    if (lineItems.some((l) => !l.description || l.quantity <= 0)) {
      toast.error("All line items must have a description and quantity > 0");
      return;
    }
    createMutation.mutate({
      customerId: parseInt(form.customerId),
      feedOrderId: parseInt(form.feedOrderId),
      invoiceDate: form.invoiceDate,
      dueDate: form.dueDate,
      lineItems,
      notes: form.notes || undefined,
    });
  }

  function handlePay(inv: any) {
    setPayInvoice(inv);
    setPayForm({
      amount: parseFloat(String(inv.balanceDue ?? 0)).toFixed(2),
      paymentMethod: "eft",
      paymentDate: new Date().toISOString().slice(0, 10),
    });
    setPayOpen(true);
  }

  function handleView(inv: any) {
    setViewInvoice(inv);
    setViewOpen(true);
  }

  const totals = calcTotals();

  // Summary stats
  const totalOutstanding = (invoices as any[])
    .filter((i) => i.status !== "paid" && i.status !== "cancelled")
    .reduce((s, i) => s + parseFloat(String(i.balanceDue ?? 0)), 0);
  const totalOverdue = (invoices as any[])
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
              Customer invoices for feed — raised before delivery
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
                  <p className="text-2xl font-bold">{(invoices as any[]).length}</p>
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
              <SelectItem value="partial">Partial</SelectItem>
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
              {(customers as any[]).map((c) => (
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
            ) : (invoices as any[]).length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No feed invoices found</p>
                <p className="text-sm mt-1">Create an invoice from a feed order — before delivery</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-2 pr-3">Invoice #</th>
                      <th className="text-left py-2 pr-3">Customer</th>
                      <th className="text-left py-2 pr-3">Invoice Date</th>
                      <th className="text-left py-2 pr-3">Due Date</th>
                      <th className="text-right py-2 pr-3">Excl. VAT</th>
                      <th className="text-right py-2 pr-3">VAT</th>
                      <th className="text-right py-2 pr-3">Total Incl.</th>
                      <th className="text-right py-2 pr-3">Paid</th>
                      <th className="text-right py-2 pr-3">Balance Due</th>
                      <th className="text-left py-2 pr-3">Status</th>
                      <th className="py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(invoices as any[]).map((inv) => (
                      <tr key={inv.id} className="border-b hover:bg-muted/30">
                        <td className="py-2 pr-3 font-mono text-xs">{inv.invoiceNumber}</td>
                        <td className="py-2 pr-3">{inv.customerName || "—"}</td>
                        <td className="py-2 pr-3">{fmtDate(inv.invoiceDate)}</td>
                        <td className="py-2 pr-3">{fmtDate(inv.dueDate)}</td>
                        <td className="py-2 pr-3 text-right">{fmt(inv.exclusiveTotal)}</td>
                        <td className="py-2 pr-3 text-right">{fmt(inv.vatAmount)}</td>
                        <td className="py-2 pr-3 text-right font-medium">{fmt(inv.inclusiveTotal)}</td>
                        <td className="py-2 pr-3 text-right text-green-700">{fmt(inv.paidAmount)}</td>
                        <td className="py-2 pr-3 text-right font-semibold">{fmt(inv.balanceDue)}</td>
                        <td className="py-2 pr-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[inv.status] ?? "bg-gray-100 text-gray-700"}`}>
                            {inv.status}
                          </span>
                        </td>
                        <td className="py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* View */}
                            <Button
                              variant="ghost" size="sm"
                              className="h-7 w-7 p-0"
                              title="View details"
                              onClick={() => handleView(inv)}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            {/* Download PDF */}
                            <Button
                              variant="ghost" size="sm"
                              className="h-7 w-7 p-0"
                              title="Download PDF"
                              disabled={pdfMutation.isPending}
                              onClick={() => pdfMutation.mutate(inv.id)}
                            >
                              <Download className="w-3.5 h-3.5" />
                            </Button>
                            {/* Mark as Sent (draft only) */}
                            {inv.status === "draft" && (
                              <Button
                                variant="ghost" size="sm"
                                className="h-7 w-7 p-0 text-blue-600 hover:text-blue-800"
                                title="Mark as sent"
                                disabled={sendMutation.isPending}
                                onClick={() => sendMutation.mutate({ invoiceId: inv.id, sentAt: new Date().toISOString() })}
                              >
                                <Send className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {/* Record Payment (not paid/cancelled) */}
                            {inv.status !== "paid" && inv.status !== "cancelled" && (
                              <Button
                                variant="ghost" size="sm"
                                className="h-7 w-7 p-0 text-green-600 hover:text-green-800"
                                title="Record payment"
                                onClick={() => handlePay(inv)}
                              >
                                <CreditCard className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {/* Cancel (draft or sent only) */}
                            {(inv.status === "draft" || inv.status === "sent") && (
                              <Button
                                variant="ghost" size="sm"
                                className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                                title="Cancel invoice"
                                disabled={cancelMutation.isPending}
                                onClick={() => {
                                  if (confirm(`Cancel invoice ${inv.invoiceNumber}?`)) {
                                    cancelMutation.mutate(inv.id);
                                  }
                                }}
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </Button>
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

      {/* ── View / Detail Dialog ── */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Invoice {viewInvoice?.invoiceNumber}</DialogTitle>
          </DialogHeader>
          {viewInvoice && (
            <div className="space-y-4 text-sm">
              {/* Meta */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-muted-foreground text-xs">Customer</p>
                  <p className="font-medium">{viewInvoice.customerName || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Status</p>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[viewInvoice.status] ?? "bg-gray-100 text-gray-700"}`}>
                    {viewInvoice.status}
                  </span>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Invoice Date</p>
                  <p className="font-medium">{fmtDate(viewInvoice.invoiceDate)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Due Date</p>
                  <p className="font-medium">{fmtDate(viewInvoice.dueDate)}</p>
                </div>
              </div>

              {/* Line Items */}
              <div>
                <p className="font-semibold mb-2">Line Items</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border rounded-lg overflow-hidden">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-2">Description</th>
                        <th className="text-right p-2">Qty</th>
                        <th className="text-right p-2">Unit Price</th>
                        <th className="text-right p-2">Disc %</th>
                        <th className="text-right p-2">VAT %</th>
                        <th className="text-right p-2">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(viewItems as any[]).length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-3 text-center text-muted-foreground">No line items stored</td>
                        </tr>
                      ) : (viewItems as any[]).map((item: any, idx: number) => {
                        const qty = parseFloat(String(item.quantity || 1));
                        const price = (item.unitPrice || 0) / 100;
                        const disc = item.discountPercent || 0;
                        const sub = qty * price * (1 - disc / 100);
                        return (
                          <tr key={idx} className="border-t">
                            <td className="p-2">{item.description}</td>
                            <td className="p-2 text-right">{qty}</td>
                            <td className="p-2 text-right">{fmt(price)}</td>
                            <td className="p-2 text-right">{disc}%</td>
                            <td className="p-2 text-right">{item.taxRate ?? 15}%</td>
                            <td className="p-2 text-right font-medium">{fmt(sub)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-muted/30 border-t">
                      <tr>
                        <td colSpan={5} className="p-2 text-right text-muted-foreground">Excl. VAT</td>
                        <td className="p-2 text-right font-medium">{fmt(viewInvoice.exclusiveTotal)}</td>
                      </tr>
                      <tr>
                        <td colSpan={5} className="p-2 text-right text-muted-foreground">VAT</td>
                        <td className="p-2 text-right font-medium">{fmt(viewInvoice.vatAmount)}</td>
                      </tr>
                      <tr>
                        <td colSpan={5} className="p-2 text-right font-semibold">Total Incl. VAT</td>
                        <td className="p-2 text-right font-bold text-lg">{fmt(viewInvoice.inclusiveTotal)}</td>
                      </tr>
                      <tr>
                        <td colSpan={5} className="p-2 text-right text-green-700">Paid</td>
                        <td className="p-2 text-right text-green-700 font-medium">{fmt(viewInvoice.paidAmount)}</td>
                      </tr>
                      <tr>
                        <td colSpan={5} className="p-2 text-right font-semibold">Balance Due</td>
                        <td className="p-2 text-right font-bold text-red-600">{fmt(viewInvoice.balanceDue)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Notes */}
              {viewInvoice.notes && (
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Notes</p>
                  <p className="text-sm bg-muted/30 rounded p-2">{viewInvoice.notes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setViewOpen(false)}>Close</Button>
            {viewInvoice && (
              <Button
                onClick={() => pdfMutation.mutate(viewInvoice.id)}
                disabled={pdfMutation.isPending}
              >
                <Download className="w-4 h-4 mr-2" />
                {pdfMutation.isPending ? "Generating…" : "Download PDF"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Record Payment Dialog ── */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          {payInvoice && (
            <div className="space-y-4 py-2">
              <div className="text-sm text-muted-foreground">
                <span className="font-mono font-medium text-foreground">{payInvoice.invoiceNumber}</span>
                {" · "}{payInvoice.customerName}
                {" · Balance: "}<span className="font-semibold text-foreground">{fmt(payInvoice.balanceDue)}</span>
              </div>
              <div className="space-y-1">
                <Label>Amount (R) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={payForm.amount}
                  onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Payment Method *</Label>
                <Select value={payForm.paymentMethod} onValueChange={(v) => setPayForm((f) => ({ ...f, paymentMethod: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="eft">EFT</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Payment Date *</Label>
                <Input
                  type="date"
                  value={payForm.paymentDate}
                  onChange={(e) => setPayForm((f) => ({ ...f, paymentDate: e.target.value }))}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!payInvoice || !payForm.amount || parseFloat(payForm.amount) <= 0) {
                  toast.error("Enter a valid payment amount");
                  return;
                }
                payMutation.mutate({
                  invoiceId: payInvoice.id,
                  amount: parseFloat(payForm.amount),
                  paymentMethod: payForm.paymentMethod,
                  paymentDate: payForm.paymentDate,
                });
              }}
              disabled={payMutation.isPending}
            >
              {payMutation.isPending ? "Saving…" : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create Invoice Dialog ── */}
      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Feed Invoice</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Info banner */}
            <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg text-sm text-blue-700 dark:text-blue-300">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Invoicing occurs <strong>before delivery</strong>. Select the feed order to invoice — line items are auto-populated from the customer price table.</span>
            </div>

            {/* Customer + Feed Order */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Customer *</Label>
                <Select
                  value={form.customerId}
                  onValueChange={(v) => setForm((f) => ({ ...f, customerId: v, feedOrderId: "" }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {(customers as any[]).map((c) => (
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
                  onValueChange={(v) => setForm((f) => ({ ...f, feedOrderId: v }))}
                  disabled={!form.customerId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={form.customerId ? "Select feed order" : "Select customer first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(feedOrders as any[])
                      .filter((o) => {
                        const ord = o.order ?? o;
                        return !form.customerId || String(ord.customerId) === form.customerId;
                      })
                      .map((o) => {
                        const ord = o.order ?? o;
                        return (
                          <SelectItem key={ord.id} value={String(ord.id)}>
                            {ord.orderNumber} — {FEED_RANGE_LABELS[ord.feedRange] ?? ord.feedRange} {FEED_STAGE_LABELS[ord.feedStage] ?? ord.feedStage} — {parseFloat(ord.quantityTons).toFixed(3)} tons
                          </SelectItem>
                        );
                      })}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Price not found warning */}
            {priceNotFound && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg text-sm text-amber-700 dark:text-amber-300">
                <Info className="w-4 h-4 mt-0.5 shrink-0" />
                <span>No price found in the Customer Feed Price table for this combination. Enter the unit price manually below.</span>
              </div>
            )}

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
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ minWidth: 640 }}>
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2 w-[35%]">Description</th>
                      <th className="text-right p-2 w-[12%]">Qty (tons)</th>
                      <th className="text-right p-2 w-[15%]">Unit Price (R/ton)</th>
                      <th className="text-right p-2 w-[10%]">Disc %</th>
                      <th className="text-right p-2 w-[10%]">VAT %</th>
                      <th className="text-right p-2 w-[13%]">Amount</th>
                      <th className="p-2 w-[5%]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((l, idx) => {
                      const sub = l.quantity * l.unitPrice;
                      const disc = sub * (l.discountPercent / 100);
                      const e = sub - disc;
                      const vat = e * (l.vatPercent / 100);
                      const total = e + vat;
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
                              type="number" step="0.001" min="0"
                              value={l.quantity}
                              onChange={(e) => updateLine(idx, "quantity", parseFloat(e.target.value) || 0)}
                              className="h-8 text-sm text-right"
                            />
                          </td>
                          <td className="p-1">
                            <Input
                              type="number" step="0.01" min="0"
                              value={l.unitPrice}
                              onChange={(e) => updateLine(idx, "unitPrice", parseFloat(e.target.value) || 0)}
                              className="h-8 text-sm text-right"
                            />
                          </td>
                          <td className="p-1">
                            <Input
                              type="number" step="1" min="0" max="100"
                              value={l.discountPercent}
                              onChange={(e) => updateLine(idx, "discountPercent", parseFloat(e.target.value) || 0)}
                              className="h-8 text-sm text-right"
                            />
                          </td>
                          <td className="p-1">
                            <Input
                              type="number" step="1" min="0" max="100"
                              value={l.vatPercent}
                              onChange={(e) => updateLine(idx, "vatPercent", parseFloat(e.target.value) || 0)}
                              className="h-8 text-sm text-right"
                            />
                          </td>
                          <td className="p-1 text-right font-medium pr-2">{fmt(total)}</td>
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
                      <td colSpan={5} className="p-2 text-right text-sm text-muted-foreground">Excl. VAT</td>
                      <td className="p-2 text-right font-medium">{fmt(totals.excl)}</td>
                      <td></td>
                    </tr>
                    <tr>
                      <td colSpan={5} className="p-2 text-right text-sm text-muted-foreground">VAT (15%)</td>
                      <td className="p-2 text-right font-medium">{fmt(totals.vat)}</td>
                      <td></td>
                    </tr>
                    <tr>
                      <td colSpan={5} className="p-2 text-right font-semibold">Total Incl. VAT</td>
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
            <Button variant="outline" onClick={() => { setCreateOpen(false); resetForm(); }}>
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
