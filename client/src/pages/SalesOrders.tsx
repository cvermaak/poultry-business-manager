import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus, Search, Eye, Edit2, XCircle, CheckCircle, Truck, Package,
  ShoppingCart, FileText, TrendingUp, Clock,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type OrderStatus = "draft" | "confirmed" | "processing" | "delivered" | "cancelled";
type ItemType = "live_birds" | "feed" | "other";

interface LineItem {
  id?: number;
  itemType: ItemType;
  description: string;
  flockId?: number | null;
  feedBatchId?: number | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
}

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; icon: React.ReactNode }> = {
  draft:      { label: "Draft",      color: "bg-gray-100 text-gray-700",   icon: <FileText className="h-3 w-3" /> },
  confirmed:  { label: "Confirmed",  color: "bg-blue-100 text-blue-700",   icon: <CheckCircle className="h-3 w-3" /> },
  processing: { label: "Processing", color: "bg-yellow-100 text-yellow-700", icon: <Package className="h-3 w-3" /> },
  delivered:  { label: "Delivered",  color: "bg-green-100 text-green-700", icon: <Truck className="h-3 w-3" /> },
  cancelled:  { label: "Cancelled",  color: "bg-red-100 text-red-700",     icon: <XCircle className="h-3 w-3" /> },
};

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  draft:      "confirmed",
  confirmed:  "processing",
  processing: "delivered",
};

const VAT_RATE = 15;

function formatCurrency(val: number | string | null | undefined) {
  const n = Number(val) || 0;
  return `R ${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function today() {
  return new Date().toISOString().split("T")[0];
}

// ── Line Item Row ─────────────────────────────────────────────────────────────
function LineItemRow({
  item, index, onChange, onRemove,
}: {
  item: LineItem;
  index: number;
  onChange: (i: number, field: keyof LineItem, value: any) => void;
  onRemove: (i: number) => void;
}) {
  const recalc = (field: keyof LineItem, value: any) => {
    const updated = { ...item, [field]: value };
    if (field === "quantity" || field === "unitPrice" || field === "taxRate") {
      const qty = Number(field === "quantity" ? value : item.quantity) || 0;
      const price = Number(field === "unitPrice" ? value : item.unitPrice) || 0;
      const rate = Number(field === "taxRate" ? value : item.taxRate) || 0;
      updated.subtotal = qty * price;
      updated.taxAmount = updated.subtotal * (rate / 100);
      updated.totalAmount = updated.subtotal + updated.taxAmount;
    }
    onChange(index, field, value);
    if (field === "quantity" || field === "unitPrice" || field === "taxRate") {
      onChange(index, "subtotal", updated.subtotal);
      onChange(index, "taxAmount", updated.taxAmount);
      onChange(index, "totalAmount", updated.totalAmount);
    }
  };

  return (
    <TableRow>
      <TableCell className="w-32">
        <Select value={item.itemType} onValueChange={(v) => recalc("itemType", v as ItemType)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="live_birds">Live Birds</SelectItem>
            <SelectItem value="feed">Feed</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input
          className="h-8 text-xs"
          value={item.description}
          onChange={(e) => onChange(index, "description", e.target.value)}
          placeholder="Description"
        />
      </TableCell>
      <TableCell className="w-20">
        <Input
          className="h-8 text-xs"
          type="number"
          min={0}
          value={item.quantity}
          onChange={(e) => recalc("quantity", parseFloat(e.target.value) || 0)}
        />
      </TableCell>
      <TableCell className="w-20">
        <Input
          className="h-8 text-xs"
          value={item.unit}
          onChange={(e) => onChange(index, "unit", e.target.value)}
          placeholder="kg / ea"
        />
      </TableCell>
      <TableCell className="w-24">
        <Input
          className="h-8 text-xs"
          type="number"
          min={0}
          step={0.01}
          value={item.unitPrice}
          onChange={(e) => recalc("unitPrice", parseFloat(e.target.value) || 0)}
        />
      </TableCell>
      <TableCell className="w-16">
        <Input
          className="h-8 text-xs"
          type="number"
          min={0}
          max={100}
          value={item.taxRate}
          onChange={(e) => recalc("taxRate", parseFloat(e.target.value) || 0)}
        />
      </TableCell>
      <TableCell className="w-28 text-right text-xs font-medium">
        {formatCurrency(item.totalAmount)}
      </TableCell>
      <TableCell className="w-10">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-red-500 hover:text-red-700"
          onClick={() => onRemove(index)}
        >
          <XCircle className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function SalesOrders() {
  const utils = trpc.useUtils();

  // Filters
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<any>(null);
  const [viewOrder, setViewOrder] = useState<any>(null);
  const [confirmCancel, setConfirmCancel] = useState<number | null>(null);

  // Form state
  const emptyForm = () => ({
    customerId: 0,
    orderDate: today(),
    deliveryDate: "",
    status: "draft" as OrderStatus,
    notes: "",
    items: [] as LineItem[],
  });
  const [form, setForm] = useState(emptyForm());

  // Queries
  const { data: orders = [], isLoading } = trpc.salesOrders.list.useQuery({});
  const { data: stats } = trpc.salesOrders.getStats.useQuery();
  const { data: customers = [] } = trpc.customers.list.useQuery({ isActive: true });
  const { data: nextNumber } = trpc.salesOrders.getNextNumber.useQuery();
  const { data: viewItems = [] } = trpc.salesOrders.getItems.useQuery(
    viewOrder?.id ?? 0,
    { enabled: !!viewOrder?.id }
  );

  // Mutations
  const createMut = trpc.salesOrders.create.useMutation({
    onSuccess: () => {
      utils.salesOrders.list.invalidate();
      utils.salesOrders.getStats.invalidate();
      setCreateOpen(false);
      setForm(emptyForm());
      toast.success("Sales order created");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.salesOrders.update.useMutation({
    onSuccess: () => {
      utils.salesOrders.list.invalidate();
      utils.salesOrders.getStats.invalidate();
      setEditOrder(null);
      toast.success("Sales order updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const statusMut = trpc.salesOrders.updateStatus.useMutation({
    onSuccess: () => {
      utils.salesOrders.list.invalidate();
      utils.salesOrders.getStats.invalidate();
      toast.success("Status updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const cancelMut = trpc.salesOrders.cancel.useMutation({
    onSuccess: () => {
      utils.salesOrders.list.invalidate();
      utils.salesOrders.getStats.invalidate();
      setConfirmCancel(null);
      toast.success("Order cancelled");
    },
    onError: (e) => toast.error(e.message),
  });

  // Filtered orders
  const filtered = useMemo(() => {
    let list = orders as any[];
    if (filterStatus !== "all") list = list.filter((o) => o.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (o) =>
          o.orderNumber?.toLowerCase().includes(q) ||
          o.customerName?.toLowerCase().includes(q) ||
          o.customerCompany?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [orders, filterStatus, search]);

  // Line item helpers
  const addItem = (items: LineItem[], setItems: (i: LineItem[]) => void) => {
    setItems([
      ...items,
      { itemType: "other", description: "", quantity: 1, unit: "ea", unitPrice: 0, subtotal: 0, taxRate: VAT_RATE, taxAmount: 0, totalAmount: 0 },
    ]);
  };

  const changeItem = (items: LineItem[], setItems: (i: LineItem[]) => void, idx: number, field: keyof LineItem, value: any) => {
    const updated = items.map((it, i) => (i === idx ? { ...it, [field]: value } : it));
    setItems(updated);
  };

  const removeItem = (items: LineItem[], setItems: (i: LineItem[]) => void, idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  // Form items state (lifted for create/edit)
  const [createItems, setCreateItems] = useState<LineItem[]>([]);
  const [editItems, setEditItems] = useState<LineItem[]>([]);

  const orderTotals = (items: LineItem[]) => ({
    subtotal: items.reduce((s, i) => s + (i.subtotal || 0), 0),
    taxAmount: items.reduce((s, i) => s + (i.taxAmount || 0), 0),
    totalAmount: items.reduce((s, i) => s + (i.totalAmount || 0), 0),
  });

  // Handlers
  const handleCreate = () => {
    if (!form.customerId) return toast.error("Please select a customer");
    if (createItems.length === 0) return toast.error("Please add at least one line item");
    createMut.mutate({ ...form, items: createItems });
  };

  const handleEdit = (order: any) => {
    setEditOrder(order);
    setForm({
      customerId: order.customerId,
      orderDate: order.orderDate?.split("T")[0] ?? today(),
      deliveryDate: order.deliveryDate?.split("T")[0] ?? "",
      status: order.status,
      notes: order.notes ?? "",
      items: [],
    });
    // Load items from server
    utils.salesOrders.getItems.fetch(order.id).then((items) => {
      setEditItems(
        (items as any[]).map((it) => ({
          id: it.id,
          itemType: it.itemType,
          description: it.description,
          flockId: it.flockId,
          feedBatchId: it.feedBatchId,
          quantity: Number(it.quantity),
          unit: it.unit,
          unitPrice: Number(it.unitPrice),
          subtotal: Number(it.subtotal),
          taxRate: Number(it.taxRate ?? VAT_RATE),
          taxAmount: Number(it.taxAmount),
          totalAmount: Number(it.totalAmount),
        }))
      );
    });
  };

  const handleUpdate = () => {
    if (!editOrder) return;
    if (!form.customerId) return toast.error("Please select a customer");
    if (editItems.length === 0) return toast.error("Please add at least one line item");
    updateMut.mutate({ id: editOrder.id, ...form, items: editItems });
  };

  const handleAdvanceStatus = (order: any) => {
    const next = NEXT_STATUS[order.status as OrderStatus];
    if (!next) return;
    statusMut.mutate({ id: order.id, status: next });
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShoppingCart className="h-6 w-6 text-primary" />
              Sales Orders
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Create and manage customer sales orders
            </p>
          </div>
          <Button onClick={() => { setCreateOpen(true); setCreateItems([]); setForm(emptyForm()); }}>
            <Plus className="h-4 w-4 mr-2" /> New Order
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {[
            { label: "Total Orders", value: stats?.total ?? 0, icon: <ShoppingCart className="h-4 w-4" />, color: "text-primary" },
            { label: "Draft", value: stats?.draft ?? 0, icon: <FileText className="h-4 w-4" />, color: "text-gray-500" },
            { label: "Confirmed", value: stats?.confirmed ?? 0, icon: <CheckCircle className="h-4 w-4" />, color: "text-blue-500" },
            { label: "Processing", value: stats?.processing ?? 0, icon: <Package className="h-4 w-4" />, color: "text-yellow-500" },
            { label: "Delivered", value: stats?.delivered ?? 0, icon: <Truck className="h-4 w-4" />, color: "text-green-500" },
            { label: "Total Value", value: formatCurrency(stats?.totalValue), icon: <TrendingUp className="h-4 w-4" />, color: "text-emerald-600" },
          ].map((s) => (
            <Card key={s.label} className="p-4">
              <div className={`flex items-center gap-2 ${s.color} mb-1`}>
                {s.icon}
                <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
              </div>
              <p className="text-xl font-bold">{s.value}</p>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by order number or customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {(Object.keys(STATUS_CONFIG) as OrderStatus[]).map((s) => (
                <SelectItem key={s} value={s}>{STATUS_CONFIG[s].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Orders Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Order Date</TableHead>
                  <TableHead>Delivery Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total (incl. VAT)</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No orders found</TableCell></TableRow>
                ) : filtered.map((order: any) => {
                  const cfg = STATUS_CONFIG[order.status as OrderStatus] ?? STATUS_CONFIG.draft;
                  const next = NEXT_STATUS[order.status as OrderStatus];
                  return (
                    <TableRow key={order.id}>
                      <TableCell className="font-mono text-sm font-medium">{order.orderNumber}</TableCell>
                      <TableCell>
                        <div className="font-medium">{order.customerName}</div>
                        {order.customerCompany && <div className="text-xs text-muted-foreground">{order.customerCompany}</div>}
                      </TableCell>
                      <TableCell className="text-sm">{order.orderDate?.split("T")[0]}</TableCell>
                      <TableCell className="text-sm">{order.deliveryDate?.split("T")[0] ?? "—"}</TableCell>
                      <TableCell>
                        <Badge className={`${cfg.color} border-0 gap-1 text-xs`}>
                          {cfg.icon} {cfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(order.totalAmount)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewOrder(order)} title="View">
                            <Eye className="h-4 w-4" />
                          </Button>
                          {order.status !== "cancelled" && order.status !== "delivered" && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(order)} title="Edit">
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          )}
                          {next && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-blue-600 hover:text-blue-800"
                              onClick={() => handleAdvanceStatus(order)}
                              title={`Advance to ${STATUS_CONFIG[next].label}`}
                            >
                              {STATUS_CONFIG[next].icon}
                            </Button>
                          )}
                          {order.status !== "cancelled" && order.status !== "delivered" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-500 hover:text-red-700"
                              onClick={() => setConfirmCancel(order.id)}
                              title="Cancel"
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* ── Create Dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Sales Order {nextNumber && <span className="text-muted-foreground font-normal">({nextNumber})</span>}</DialogTitle>
          </DialogHeader>
          <OrderForm
            form={form}
            setForm={setForm}
            items={createItems}
            setItems={setCreateItems}
            customers={customers as any[]}
            onChangeItem={(i, f, v) => changeItem(createItems, setCreateItems, i, f, v)}
            onRemoveItem={(i) => removeItem(createItems, setCreateItems, i)}
            onAddItem={() => addItem(createItems, setCreateItems)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMut.isPending}>
              {createMut.isPending ? "Creating..." : "Create Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ── */}
      <Dialog open={!!editOrder} onOpenChange={(o) => !o && setEditOrder(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Order {editOrder?.orderNumber}</DialogTitle>
          </DialogHeader>
          <OrderForm
            form={form}
            setForm={setForm}
            items={editItems}
            setItems={setEditItems}
            customers={customers as any[]}
            onChangeItem={(i, f, v) => changeItem(editItems, setEditItems, i, f, v)}
            onRemoveItem={(i) => removeItem(editItems, setEditItems, i)}
            onAddItem={() => addItem(editItems, setEditItems)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOrder(null)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={updateMut.isPending}>
              {updateMut.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── View Dialog ── */}
      <Dialog open={!!viewOrder} onOpenChange={(o) => !o && setViewOrder(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Order {viewOrder?.orderNumber}</DialogTitle>
          </DialogHeader>
          {viewOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Customer:</span> <span className="font-medium">{viewOrder.customerName}</span></div>
                <div><span className="text-muted-foreground">Status:</span> <Badge className={`${STATUS_CONFIG[viewOrder.status as OrderStatus]?.color} border-0 text-xs ml-1`}>{STATUS_CONFIG[viewOrder.status as OrderStatus]?.label}</Badge></div>
                <div><span className="text-muted-foreground">Order Date:</span> <span>{viewOrder.orderDate?.split("T")[0]}</span></div>
                <div><span className="text-muted-foreground">Delivery Date:</span> <span>{viewOrder.deliveryDate?.split("T")[0] ?? "—"}</span></div>
              </div>
              {viewOrder.notes && <p className="text-sm text-muted-foreground border rounded p-3">{viewOrder.notes}</p>}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">VAT</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(viewItems as any[]).map((it: any) => (
                    <TableRow key={it.id}>
                      <TableCell className="text-xs capitalize">{it.itemType?.replace("_", " ")}</TableCell>
                      <TableCell className="text-sm">{it.description}</TableCell>
                      <TableCell className="text-right text-sm">{Number(it.quantity).toFixed(2)}</TableCell>
                      <TableCell className="text-sm">{it.unit}</TableCell>
                      <TableCell className="text-right text-sm">{formatCurrency(it.unitPrice)}</TableCell>
                      <TableCell className="text-right text-sm">{formatCurrency(it.taxAmount)}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{formatCurrency(it.totalAmount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex flex-col items-end gap-1 text-sm">
                <div className="flex gap-8"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(viewOrder.subtotal)}</span></div>
                <div className="flex gap-8"><span className="text-muted-foreground">VAT</span><span>{formatCurrency(viewOrder.taxAmount)}</span></div>
                <div className="flex gap-8 font-bold text-base border-t pt-1"><span>Total</span><span>{formatCurrency(viewOrder.totalAmount)}</span></div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewOrder(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Cancel Confirm ── */}
      <Dialog open={confirmCancel !== null} onOpenChange={(o) => !o && setConfirmCancel(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Cancel Order?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This will mark the order as cancelled. The order history will be preserved.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmCancel(null)}>Keep Order</Button>
            <Button variant="destructive" onClick={() => confirmCancel !== null && cancelMut.mutate(confirmCancel)} disabled={cancelMut.isPending}>
              {cancelMut.isPending ? "Cancelling..." : "Cancel Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

// ── Order Form Sub-component ──────────────────────────────────────────────────
function OrderForm({
  form, setForm, items, setItems, customers, onChangeItem, onRemoveItem, onAddItem,
}: {
  form: any;
  setForm: (f: any) => void;
  items: LineItem[];
  setItems: (i: LineItem[]) => void;
  customers: any[];
  onChangeItem: (i: number, f: keyof LineItem, v: any) => void;
  onRemoveItem: (i: number) => void;
  onAddItem: () => void;
}) {
  const totals = {
    subtotal: items.reduce((s, i) => s + (i.subtotal || 0), 0),
    taxAmount: items.reduce((s, i) => s + (i.taxAmount || 0), 0),
    totalAmount: items.reduce((s, i) => s + (i.totalAmount || 0), 0),
  };

  return (
    <div className="space-y-5">
      {/* Order header */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Customer *</Label>
          <Select
            value={form.customerId ? String(form.customerId) : ""}
            onValueChange={(v) => setForm({ ...form, customerId: parseInt(v) })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select customer..." />
            </SelectTrigger>
            <SelectContent>
              {customers.map((c: any) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}{c.companyName ? ` — ${c.companyName}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as OrderStatus })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(STATUS_CONFIG) as OrderStatus[]).filter((s) => s !== "cancelled").map((s) => (
                <SelectItem key={s} value={s}>{STATUS_CONFIG[s].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Order Date *</Label>
          <Input type="date" value={form.orderDate} onChange={(e) => setForm({ ...form, orderDate: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Delivery Date</Label>
          <Input type="date" value={form.deliveryDate} onChange={(e) => setForm({ ...form, deliveryDate: e.target.value })} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Notes</Label>
        <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes..." />
      </div>

      {/* Line items */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-base font-semibold">Line Items</Label>
          <Button type="button" variant="outline" size="sm" onClick={onAddItem}>
            <Plus className="h-3 w-3 mr-1" /> Add Item
          </Button>
        </div>
        {items.length === 0 ? (
          <div className="border rounded-md py-6 text-center text-muted-foreground text-sm">
            No items yet — click "Add Item" to start
          </div>
        ) : (
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Unit Price</TableHead>
                  <TableHead>VAT %</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, idx) => (
                  <LineItemRow
                    key={idx}
                    item={item}
                    index={idx}
                    onChange={onChangeItem}
                    onRemove={onRemoveItem}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {items.length > 0 && (
          <div className="flex flex-col items-end gap-1 mt-3 text-sm">
            <div className="flex gap-8"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(totals.subtotal)}</span></div>
            <div className="flex gap-8"><span className="text-muted-foreground">VAT</span><span>{formatCurrency(totals.taxAmount)}</span></div>
            <div className="flex gap-8 font-bold text-base border-t pt-1"><span>Total</span><span>{formatCurrency(totals.totalAmount)}</span></div>
          </div>
        )}
      </div>
    </div>
  );
}
