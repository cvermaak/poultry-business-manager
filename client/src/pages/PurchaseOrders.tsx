import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Check, Eye, PackageCheck, Pencil, Plus, Send, Trash2, X } from "lucide-react";

type DraftLine = { description: string; quantity: string; unit: string; unitPrice: string };

const blankLine = (): DraftLine => ({ description: "", quantity: "1", unit: "each", unitPrice: "" });
const blankForm = () => ({
  supplierId: "",
  orderDate: new Date().toISOString().slice(0, 10),
  expectedDeliveryDate: "",
  notes: "",
  items: [blankLine()],
});

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  sent: "bg-blue-100 text-blue-700 border-blue-200",
  confirmed: "bg-amber-100 text-amber-800 border-amber-200",
  delivered: "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelled: "bg-red-100 text-red-700 border-red-200",
};

function formatCurrency(cents: unknown) {
  const rands = Number(cents ?? 0) / 100;
  return `R ${rands.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PurchaseOrders() {
  const utils = trpc.useUtils();
  const [statusFilter, setStatusFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [viewId, setViewId] = useState<number | null>(null);
  const [form, setForm] = useState(blankForm());

  const { data: suppliers = [] } = trpc.suppliers.list.useQuery({ isActive: true });
  const { data: orders = [], isLoading } = trpc.purchaseOrders.list.useQuery({
    supplierId: supplierFilter === "all" ? undefined : Number(supplierFilter),
    status: statusFilter === "all" ? undefined : statusFilter as any,
  });
  const { data: nextNumber } = trpc.purchaseOrders.getNextNumber.useQuery(undefined, { enabled: formOpen && editId === null });
  const { data: editOrder } = trpc.purchaseOrders.get.useQuery({ id: editId ?? 0 }, { enabled: editId !== null });
  const { data: editItems = [] } = trpc.purchaseOrders.getItems.useQuery({ orderId: editId ?? 0 }, { enabled: editId !== null });
  const { data: viewOrder } = trpc.purchaseOrders.get.useQuery({ id: viewId ?? 0 }, { enabled: viewId !== null });
  const { data: viewItems = [] } = trpc.purchaseOrders.getItems.useQuery({ orderId: viewId ?? 0 }, { enabled: viewId !== null });

  useEffect(() => {
    if (!editOrder || !editItems.length) return;
    setForm({
      supplierId: String(editOrder.supplierId),
      orderDate: String(editOrder.orderDate).slice(0, 10),
      expectedDeliveryDate: editOrder.expectedDeliveryDate ? String(editOrder.expectedDeliveryDate).slice(0, 10) : "",
      notes: editOrder.notes ?? "",
      items: editItems.map((item: any) => ({
        description: item.description,
        quantity: String(item.quantity),
        unit: item.unit,
        unitPrice: (Number(item.unitPrice ?? 0) / 100).toFixed(2),
      })),
    });
  }, [editOrder, editItems]);

  const refresh = () => {
    utils.purchaseOrders.list.invalidate();
    utils.purchaseOrders.getNextNumber.invalidate();
  };

  const createMutation = trpc.purchaseOrders.create.useMutation({
    onSuccess: (result) => { toast.success(`${result.orderNumber} created as a draft`); refresh(); closeForm(); },
    onError: (error) => toast.error(error.message),
  });
  const updateMutation = trpc.purchaseOrders.update.useMutation({
    onSuccess: () => { toast.success("Purchase order updated"); refresh(); closeForm(); },
    onError: (error) => toast.error(error.message),
  });
  const sendMutation = trpc.purchaseOrders.send.useMutation({ onSuccess: () => { toast.success("Purchase order sent"); refresh(); }, onError: (e) => toast.error(e.message) });
  const confirmMutation = trpc.purchaseOrders.confirm.useMutation({ onSuccess: () => { toast.success("Purchase order confirmed"); refresh(); }, onError: (e) => toast.error(e.message) });
  const receiveMutation = trpc.purchaseOrders.receive.useMutation({ onSuccess: () => { toast.success("Receipt recorded"); refresh(); }, onError: (e) => toast.error(e.message) });
  const cancelMutation = trpc.purchaseOrders.cancel.useMutation({ onSuccess: () => { toast.success("Purchase order cancelled"); refresh(); }, onError: (e) => toast.error(e.message) });
  const deleteMutation = trpc.purchaseOrders.delete.useMutation({ onSuccess: () => { toast.success("Draft purchase order deleted"); refresh(); }, onError: (e) => toast.error(e.message) });

  const formTotal = useMemo(() => form.items.reduce((total, item) => total + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0), [form.items]);
  const statusCounts = useMemo(() => (orders as any[]).reduce((counts, order) => ({ ...counts, [order.status]: (counts[order.status] ?? 0) + 1 }), {} as Record<string, number>), [orders]);

  function openCreate() { setEditId(null); setForm(blankForm()); setFormOpen(true); }
  function openEdit(id: number) { setEditId(id); setFormOpen(true); }
  function closeForm() { setFormOpen(false); setEditId(null); setForm(blankForm()); }
  function updateLine(index: number, change: Partial<DraftLine>) { setForm((current) => ({ ...current, items: current.items.map((line, lineIndex) => lineIndex === index ? { ...line, ...change } : line) })); }
  function removeLine(index: number) { setForm((current) => ({ ...current, items: current.items.filter((_, lineIndex) => lineIndex !== index) })); }

  function submitForm() {
    if (!form.supplierId) return toast.error("Select a supplier");
    if (!form.items.length || form.items.some((item) => !item.description.trim() || Number(item.quantity) <= 0 || Number(item.unitPrice) < 0)) return toast.error("Complete every line item with a quantity and unit price");
    const payload = {
      supplierId: Number(form.supplierId),
      orderDate: form.orderDate,
      expectedDeliveryDate: form.expectedDeliveryDate || null,
      notes: form.notes || null,
      items: form.items.map((item) => ({
        description: item.description,
        quantity: Number(item.quantity),
        unit: item.unit || "each",
        unitPriceCents: Math.round(Number(item.unitPrice) * 100),
      })),
    };
    if (editId !== null) updateMutation.mutate({ id: editId, ...payload }); else createMutation.mutate(payload);
  }

  function handleStatus(order: any, action: "send" | "confirm" | "receive" | "cancel" | "delete") {
    if (action === "send") sendMutation.mutate({ id: order.id, sentVia: "manual" });
    if (action === "confirm") confirmMutation.mutate({ id: order.id });
    if (action === "receive") receiveMutation.mutate({ id: order.id, actualDeliveryDate: new Date().toISOString().slice(0, 10) });
    if (action === "cancel" && window.confirm(`Cancel ${order.orderNumber}? This cannot be undone.`)) cancelMutation.mutate({ id: order.id });
    if (action === "delete" && window.confirm(`Delete draft ${order.orderNumber}? This cannot be undone.`)) deleteMutation.mutate({ id: order.id });
  }

  return <div className="p-6 space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-bold">Purchase Orders</h1><p className="mt-1 text-sm text-muted-foreground">Create, send, confirm, and record delivery of supplier purchase orders.</p></div>
      <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />New Purchase Order</Button>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {["draft", "sent", "confirmed", "delivered", "cancelled"].map((status) => <Card key={status}><CardContent className="p-4"><p className="text-xs capitalize text-muted-foreground">{status}</p><p className="mt-1 text-2xl font-bold">{statusCounts[status] ?? 0}</p></CardContent></Card>)}
    </div>

    <Card><CardContent className="flex flex-wrap gap-3 p-4">
      <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-40"><SelectValue placeholder="All statuses" /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{["draft", "sent", "confirmed", "delivered", "cancelled"].map((status) => <SelectItem key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</SelectItem>)}</SelectContent></Select>
      <Select value={supplierFilter} onValueChange={setSupplierFilter}><SelectTrigger className="w-56"><SelectValue placeholder="All suppliers" /></SelectTrigger><SelectContent><SelectItem value="all">All suppliers</SelectItem>{(suppliers as any[]).map((supplier) => <SelectItem key={supplier.id} value={String(supplier.id)}>{supplier.name}</SelectItem>)}</SelectContent></Select>
    </CardContent></Card>

    <Card><CardHeader><CardTitle className="text-base">Supplier Purchase Orders</CardTitle></CardHeader><CardContent className="p-0">
      {isLoading ? <p className="p-8 text-center text-muted-foreground">Loading purchase orders…</p> : !(orders as any[]).length ? <p className="p-8 text-center text-muted-foreground">No purchase orders match the current filters.</p> : <Table><TableHeader><TableRow><TableHead>PO Number</TableHead><TableHead>Supplier</TableHead><TableHead>Order Date</TableHead><TableHead>Expected</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Status</TableHead><TableHead className="w-48">Actions</TableHead></TableRow></TableHeader><TableBody>{(orders as any[]).map((order) => <TableRow key={order.id}><TableCell className="font-medium">{order.orderNumber}</TableCell><TableCell>{order.supplierName}</TableCell><TableCell>{String(order.orderDate).slice(0, 10)}</TableCell><TableCell>{order.expectedDeliveryDate ? String(order.expectedDeliveryDate).slice(0, 10) : "—"}</TableCell><TableCell className="text-right">{formatCurrency(order.totalAmount)}</TableCell><TableCell><Badge variant="outline" className={STATUS_STYLES[order.status]}>{order.status}</Badge></TableCell><TableCell><div className="flex items-center gap-1"><Button variant="ghost" size="icon" title="View" onClick={() => setViewId(order.id)}><Eye className="h-4 w-4" /></Button>{order.status === "draft" && <><Button variant="ghost" size="icon" title="Edit draft" onClick={() => openEdit(order.id)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" title="Send" onClick={() => handleStatus(order, "send")}><Send className="h-4 w-4" /></Button><Button variant="ghost" size="icon" title="Delete draft" onClick={() => handleStatus(order, "delete")}><Trash2 className="h-4 w-4 text-destructive" /></Button></>}{order.status === "sent" && <><Button variant="ghost" size="icon" title="Confirm" onClick={() => handleStatus(order, "confirm")}><Check className="h-4 w-4" /></Button><Button variant="ghost" size="icon" title="Cancel" onClick={() => handleStatus(order, "cancel")}><X className="h-4 w-4 text-destructive" /></Button></>}{order.status === "confirmed" && <><Button variant="ghost" size="icon" title="Record receipt" onClick={() => handleStatus(order, "receive")}><PackageCheck className="h-4 w-4" /></Button><Button variant="ghost" size="icon" title="Cancel" onClick={() => handleStatus(order, "cancel")}><X className="h-4 w-4 text-destructive" /></Button></>}</div></TableCell></TableRow>)}</TableBody></Table>}
    </CardContent></Card>

    <Dialog open={formOpen} onOpenChange={(open) => !open && closeForm()}><DialogContent style={{ width: "95vw", maxWidth: "1100px" }} className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{editId ? "Edit Draft Purchase Order" : "New Purchase Order"}{!editId && nextNumber?.orderNumber ? ` — ${nextNumber.orderNumber}` : ""}</DialogTitle></DialogHeader><div className="grid gap-4 md:grid-cols-3"><div className="space-y-1"><Label>Supplier *</Label><Select value={form.supplierId} onValueChange={(supplierId) => setForm({ ...form, supplierId })}><SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger><SelectContent>{(suppliers as any[]).map((supplier) => <SelectItem key={supplier.id} value={String(supplier.id)}>{supplier.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><Label>Order Date *</Label><Input type="date" value={form.orderDate} onChange={(event) => setForm({ ...form, orderDate: event.target.value })} /></div><div className="space-y-1"><Label>Expected Delivery</Label><Input type="date" value={form.expectedDeliveryDate} onChange={(event) => setForm({ ...form, expectedDeliveryDate: event.target.value })} /></div><div className="space-y-1 md:col-span-3"><Label>Notes</Label><Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Supplier reference, delivery instructions, or terms" rows={2} /></div></div><div className="mt-5 space-y-2"><div className="flex items-center justify-between"><h3 className="font-semibold">Line Items</h3><Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, items: [...form.items, blankLine()] })}><Plus className="mr-1 h-3 w-3" />Add line</Button></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Description</TableHead><TableHead className="w-28">Qty</TableHead><TableHead className="w-28">Unit</TableHead><TableHead className="w-36">Unit Price (R)</TableHead><TableHead className="w-36 text-right">Line Total</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>{form.items.map((item, index) => <TableRow key={index}><TableCell><Input value={item.description} onChange={(event) => updateLine(index, { description: event.target.value })} placeholder="Item or service description" /></TableCell><TableCell><Input type="number" min="0.01" step="0.01" value={item.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} /></TableCell><TableCell><Input value={item.unit} onChange={(event) => updateLine(index, { unit: event.target.value })} /></TableCell><TableCell><Input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => updateLine(index, { unitPrice: event.target.value })} /></TableCell><TableCell className="text-right font-medium">R {((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell><TableCell>{form.items.length > 1 && <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}</TableCell></TableRow>)}</TableBody></Table></div><div className="text-right text-lg font-bold">Order Total: R {formTotal.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div><DialogFooter><Button variant="outline" onClick={closeForm}>Cancel</Button><Button onClick={submitForm} disabled={createMutation.isPending || updateMutation.isPending}>{createMutation.isPending || updateMutation.isPending ? "Saving…" : editId ? "Save Draft" : "Create Draft"}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={viewId !== null} onOpenChange={(open) => !open && setViewId(null)}><DialogContent style={{ width: "95vw", maxWidth: "900px" }}><DialogHeader><DialogTitle>{viewOrder?.orderNumber ?? "Purchase Order"}</DialogTitle></DialogHeader>{viewOrder && <div className="space-y-4"><div className="grid gap-3 text-sm sm:grid-cols-2"><div><span className="text-muted-foreground">Supplier:</span> {viewOrder.supplierName}</div><div><span className="text-muted-foreground">Status:</span> <Badge variant="outline" className={STATUS_STYLES[viewOrder.status]}>{viewOrder.status}</Badge></div><div><span className="text-muted-foreground">Ordered:</span> {String(viewOrder.orderDate).slice(0, 10)}</div><div><span className="text-muted-foreground">Received:</span> {viewOrder.actualDeliveryDate ? String(viewOrder.actualDeliveryDate).slice(0, 10) : "Not yet received"}</div></div><Table><TableHeader><TableRow><TableHead>Description</TableHead><TableHead>Qty</TableHead><TableHead>Unit</TableHead><TableHead className="text-right">Unit Price</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader><TableBody>{(viewItems as any[]).map((item) => <TableRow key={item.id}><TableCell>{item.description}</TableCell><TableCell>{item.quantity}</TableCell><TableCell>{item.unit}</TableCell><TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell><TableCell className="text-right">{formatCurrency(item.totalAmount)}</TableCell></TableRow>)}</TableBody></Table><div className="text-right text-lg font-bold">Order Total: {formatCurrency(viewOrder.totalAmount)}</div>{viewOrder.notes && <p className="rounded bg-muted p-3 text-sm">{viewOrder.notes}</p>}</div>}</DialogContent></Dialog>
  </div>;
}
