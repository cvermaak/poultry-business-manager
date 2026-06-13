import { useState, useMemo } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, ShoppingCart, AlertTriangle, Truck, Package } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  submitted_to_mill: "bg-blue-100 text-blue-700",
  in_production: "bg-yellow-100 text-yellow-700",
  ready_for_collection: "bg-purple-100 text-purple-700",
  partially_delivered: "bg-orange-100 text-orange-700",
  delivered: "bg-green-100 text-green-700",
  invoiced: "bg-teal-100 text-teal-700",
  cancelled: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted_to_mill: "Submitted to Mill",
  in_production: "In Production",
  ready_for_collection: "Ready for Collection",
  partially_delivered: "Partially Delivered",
  delivered: "Delivered",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
};

const RANGE_LABELS: Record<string, string> = {
  premium: "Premium",
  value: "Value",
  econo: "Econo",
};

const STAGE_LABELS: Record<string, string> = {
  starter: "Starter",
  grower: "Grower",
  finisher: "Finisher",
};

interface CreateOrderForm {
  customerId: string;
  flockId: string;
  feedRange: string;
  feedStage: string;
  formulationId: string;
  quantityTons: string;
  birdCount: string;
  allocationKgPerBird: string;
  transportMode: string;
  transportCostPerTon: string;
  orderDate: string;
  requiredByDate: string;
  pricePerTon: string;
  notes: string;
  macroKgPerTon: string;
  soyaOilKgPerTon: string;
  probioticKgPerTon: string;
  macroSupplierId: string;
  soyaOilSupplierId: string;
  probioticSupplierId: string;
}

const defaultForm: CreateOrderForm = {
  customerId: "",
  flockId: "",
  feedRange: "premium",
  feedStage: "starter",
  formulationId: "",
  quantityTons: "",
  birdCount: "",
  allocationKgPerBird: "0.900",
  transportMode: "afgro_delivers",
  transportCostPerTon: "0",
  orderDate: new Date().toISOString().slice(0, 10),
  requiredByDate: "",
  pricePerTon: "",
  notes: "",
  macroKgPerTon: "",
  soyaOilKgPerTon: "",
  probioticKgPerTon: "",
  macroSupplierId: "",
  soyaOilSupplierId: "",
  probioticSupplierId: "",
};

export default function FeedOrders() {
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterStage, setFilterStage] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreateOrderForm>(defaultForm);

  const { data: ordersData, refetch } = trpc.feedOrders.listOrders.useQuery({});
  const { data: customers } = trpc.customers.list.useQuery();
  const { data: flocks } = trpc.flocks.list.useQuery();
  const { data: suppliers } = trpc.suppliers.list.useQuery();
  const { data: formulations } = trpc.feedManagement.listFormulations.useQuery({});
  const { data: alerts } = trpc.feedOrders.getAlerts.useQuery();

  const createMutation = trpc.feedOrders.createOrder.useMutation({
    onSuccess: () => {
      toast.success("Feed order created — additive purchase orders generated automatically.");
      setCreateOpen(false);
      setForm(defaultForm);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  // Auto-calculate quantity from bird count × allocation
  const calculatedQty = useMemo(() => {
    const birds = parseFloat(form.birdCount);
    const alloc = parseFloat(form.allocationKgPerBird);
    if (!isNaN(birds) && !isNaN(alloc) && birds > 0 && alloc > 0) {
      return ((birds * alloc) / 1000).toFixed(3);
    }
    return "";
  }, [form.birdCount, form.allocationKgPerBird]);

  // Auto-set allocation based on stage
  const handleStageChange = (stage: string) => {
    const defaults: Record<string, string> = {
      starter: "0.900",
      grower: "1.750",
      finisher: "0.350",
    };
    setForm((f) => ({ ...f, feedStage: stage, allocationKgPerBird: defaults[stage] || f.allocationKgPerBird }));
  };

  // Auto-fill additive rates from selected formulation
  const handleFormulationChange = (formulationId: string) => {
    const formulation = formulations?.find((f: any) => String(f.id) === formulationId);
    if (formulation) {
      setForm((prev) => ({
        ...prev,
        formulationId,
        macroKgPerTon: formulation.macroInclusionKgPerTon || "",
        soyaOilKgPerTon: formulation.soyaOilInclusionKgPerTon || "",
        probioticKgPerTon: formulation.probioticInclusionKgPerTon || "",
      }));
    } else {
      setForm((prev) => ({ ...prev, formulationId }));
    }
  };

  const filteredOrders = useMemo(() => {
    if (!ordersData) return [];
    return ordersData.filter((row: any) => {
      if (filterStatus !== "all" && row.order.status !== filterStatus) return false;
      if (filterStage !== "all" && row.order.feedStage !== filterStage) return false;
      return true;
    });
  }, [ordersData, filterStatus, filterStage]);

  const criticalAlerts = alerts?.filter((a: any) => a.severity === "critical") ?? [];
  const warningAlerts = alerts?.filter((a: any) => a.severity === "warning") ?? [];

  const handleSubmit = () => {
    if (!form.customerId || !form.orderDate || !form.requiredByDate) {
      toast.error("Customer, order date and required-by date are required.");
      return;
    }
    const qty = form.quantityTons || calculatedQty;
    if (!qty || parseFloat(qty) <= 0) {
      toast.error("Quantity (tons) is required.");
      return;
    }
    createMutation.mutate({
      customerId: parseInt(form.customerId),
      flockId: form.flockId ? parseInt(form.flockId) : undefined,
      feedRange: form.feedRange as any,
      feedStage: form.feedStage as any,
      formulationId: form.formulationId ? parseInt(form.formulationId) : undefined,
      quantityTons: qty,
      birdCount: form.birdCount ? parseInt(form.birdCount) : undefined,
      allocationKgPerBird: form.allocationKgPerBird || undefined,
      transportMode: form.transportMode as any,
      transportCostPerTon: form.transportCostPerTon || "0",
      orderDate: form.orderDate,
      requiredByDate: form.requiredByDate,
      pricePerTon: form.pricePerTon || undefined,
      notes: form.notes || undefined,
      macroKgPerTon: form.macroKgPerTon || undefined,
      soyaOilKgPerTon: form.soyaOilKgPerTon || undefined,
      probioticKgPerTon: form.probioticKgPerTon || undefined,
      macroSupplierId: form.macroSupplierId ? parseInt(form.macroSupplierId) : undefined,
      soyaOilSupplierId: form.soyaOilSupplierId ? parseInt(form.soyaOilSupplierId) : undefined,
      probioticSupplierId: form.probioticSupplierId ? parseInt(form.probioticSupplierId) : undefined,
    });
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Feed Orders</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage feed orders, additive purchase orders, and delivery tracking
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Feed Order
          </Button>
        </div>

        {/* Alert Banner */}
        {(criticalAlerts.length > 0 || warningAlerts.length > 0) && (
          <div className="space-y-2">
            {criticalAlerts.slice(0, 3).map((alert: any, i: number) => (
              <div key={i} className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-red-600" />
                <span>{alert.message}</span>
              </div>
            ))}
            {warningAlerts.slice(0, 2).map((alert: any, i: number) => (
              <div key={i} className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                <span>{alert.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Orders", value: ordersData?.length ?? 0, icon: ShoppingCart },
            { label: "In Production", value: ordersData?.filter((r: any) => r.order.status === "in_production").length ?? 0, icon: Package },
            { label: "Pending Delivery", value: ordersData?.filter((r: any) => ["ready_for_collection","partially_delivered"].includes(r.order.status)).length ?? 0, icon: Truck },
            { label: "Critical Alerts", value: criticalAlerts.length, icon: AlertTriangle },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label}>
              <CardContent className="p-4 flex items-center gap-3">
                <Icon className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStage} onValueChange={setFilterStage}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter by stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              <SelectItem value="starter">Starter</SelectItem>
              <SelectItem value="grower">Grower</SelectItem>
              <SelectItem value="finisher">Finisher</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Orders Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Feed Orders ({filteredOrders.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">Order #</th>
                    <th className="text-left p-3 font-medium">Customer</th>
                    <th className="text-left p-3 font-medium">Feed</th>
                    <th className="text-left p-3 font-medium">Qty (tons)</th>
                    <th className="text-left p-3 font-medium">Order Date</th>
                    <th className="text-left p-3 font-medium">Required By</th>
                    <th className="text-left p-3 font-medium">Transport</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Mill Invoice</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.length === 0 && (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-muted-foreground">
                        No feed orders found. Create your first order to get started.
                      </td>
                    </tr>
                  )}
                  {filteredOrders.map((row: any) => {
                    const o = row.order;
                    const today = new Date().toISOString().slice(0, 10);
                    const isMillInvoiceDue = o.millInvoiceDueDate && o.millInvoiceDueDate <= today && !o.millInvoicePaid && o.millInvoiceNumber;
                    return (
                      <tr key={o.id} className="border-t hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-mono text-xs">{o.orderNumber}</td>
                        <td className="p-3">
                          <div className="font-medium">{row.customerName}</div>
                          {row.customerCompany && <div className="text-xs text-muted-foreground">{row.customerCompany}</div>}
                        </td>
                        <td className="p-3">
                          <div className="font-medium">{RANGE_LABELS[o.feedRange]}</div>
                          <div className="text-xs text-muted-foreground">{STAGE_LABELS[o.feedStage]}</div>
                        </td>
                        <td className="p-3 font-medium">{parseFloat(o.quantityTons).toFixed(3)}</td>
                        <td className="p-3 text-sm">{o.orderDate}</td>
                        <td className="p-3 text-sm">{o.requiredByDate}</td>
                        <td className="p-3">
                          {o.transportMode === "afgro_delivers" ? (
                            <span className="flex items-center gap-1 text-xs"><Truck className="h-3 w-3" /> AFGRO</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Customer</span>
                          )}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[o.status] || "bg-gray-100 text-gray-700"}`}>
                            {STATUS_LABELS[o.status] || o.status}
                          </span>
                        </td>
                        <td className="p-3">
                          {o.millInvoiceNumber ? (
                            <div>
                              <div className="text-xs font-mono">{o.millInvoiceNumber}</div>
                              {isMillInvoiceDue && (
                                <Badge variant="destructive" className="text-xs mt-0.5">OVERDUE</Badge>
                              )}
                              {o.millInvoicePaid ? (
                                <Badge className="text-xs mt-0.5 bg-green-100 text-green-700">Paid</Badge>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3">
                          <Link href={`/feed-orders/${o.id}`}>
                            <Button variant="ghost" size="sm">View</Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Create Order Dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New Feed Order</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {/* Customer & Flock */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Customer *</Label>
                  <Select value={form.customerId} onValueChange={(v) => setForm((f) => ({ ...f, customerId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                    <SelectContent>
                      {customers?.map((c: any) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.name}{c.companyName ? ` (${c.companyName})` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Linked Flock (optional)</Label>
                  <Select value={form.flockId} onValueChange={(v) => setForm((f) => ({ ...f, flockId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select flock" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {flocks?.filter((f: any) => ["active","planned"].includes(f.status)).map((f: any) => (
                        <SelectItem key={f.id} value={String(f.id)}>{f.flockNumber}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Feed Range & Stage */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Feed Range *</Label>
                  <Select value={form.feedRange} onValueChange={(v) => setForm((f) => ({ ...f, feedRange: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="premium">Premium</SelectItem>
                      <SelectItem value="value">Value</SelectItem>
                      <SelectItem value="econo">Econo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Feed Stage *</Label>
                  <Select value={form.feedStage} onValueChange={handleStageChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="starter">Starter</SelectItem>
                      <SelectItem value="grower">Grower</SelectItem>
                      <SelectItem value="finisher">Finisher</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Formulation */}
              <div className="space-y-1">
                <Label>Formulation (optional — auto-fills additive rates)</Label>
                <Select value={form.formulationId} onValueChange={handleFormulationChange}>
                  <SelectTrigger><SelectValue placeholder="Select formulation" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {formulations?.filter((f: any) => f.status === "active").map((f: any) => (
                      <SelectItem key={f.id} value={String(f.id)}>{f.name} ({f.feedRange} {f.feedStage})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Quantity Calculator */}
              <div className="p-3 bg-muted/30 rounded-lg space-y-3">
                <p className="text-sm font-medium">Quantity Calculator</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Bird Count (after mortality)</Label>
                    <Input
                      type="number"
                      placeholder="e.g. 25000"
                      value={form.birdCount}
                      onChange={(e) => setForm((f) => ({ ...f, birdCount: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Allocation kg/bird</Label>
                    <Input
                      type="number"
                      step="0.001"
                      value={form.allocationKgPerBird}
                      onChange={(e) => setForm((f) => ({ ...f, allocationKgPerBird: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Calculated Qty (tons)</Label>
                    <Input
                      value={calculatedQty}
                      readOnly
                      className="bg-muted font-mono text-sm"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Override Quantity (tons) — leave blank to use calculated</Label>
                  <Input
                    type="number"
                    step="0.001"
                    placeholder={calculatedQty || "Enter tons"}
                    value={form.quantityTons}
                    onChange={(e) => setForm((f) => ({ ...f, quantityTons: e.target.value }))}
                  />
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Order Date *</Label>
                  <Input type="date" value={form.orderDate} onChange={(e) => setForm((f) => ({ ...f, orderDate: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Required By Date *</Label>
                  <Input type="date" value={form.requiredByDate} onChange={(e) => setForm((f) => ({ ...f, requiredByDate: e.target.value }))} />
                </div>
              </div>

              {/* Transport */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Transport Mode *</Label>
                  <Select value={form.transportMode} onValueChange={(v) => setForm((f) => ({ ...f, transportMode: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="afgro_delivers">AFGRO Delivers</SelectItem>
                      <SelectItem value="customer_collects">Customer Collects</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.transportMode === "afgro_delivers" && (
                  <div className="space-y-1">
                    <Label>Transport Cost per Ton (R)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={form.transportCostPerTon}
                      onChange={(e) => setForm((f) => ({ ...f, transportCostPerTon: e.target.value }))}
                    />
                  </div>
                )}
              </div>

              {/* Pricing */}
              <div className="space-y-1">
                <Label>Selling Price per Ton (R, excl. VAT)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="From customer price list"
                  value={form.pricePerTon}
                  onChange={(e) => setForm((f) => ({ ...f, pricePerTon: e.target.value }))}
                />
              </div>

              {/* Additive Rates */}
              <div className="p-3 border rounded-lg space-y-3">
                <p className="text-sm font-medium">Additive Inclusion Rates (kg per ton of feed)</p>
                <p className="text-xs text-muted-foreground">Used to auto-generate additive purchase orders. MACRO has a 14-day lead time (critical path); Soya Oil and Probiotic have 7-day lead times.</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { key: "macroKgPerTon", label: "MACRO (kg/ton)", supplierKey: "macroSupplierId", critical: true },
                    { key: "soyaOilKgPerTon", label: "Soya Oil (kg/ton)", supplierKey: "soyaOilSupplierId", critical: false },
                    { key: "probioticKgPerTon", label: "Probiotic (kg/ton)", supplierKey: "probioticSupplierId", critical: false },
                  ].map(({ key, label, supplierKey, critical }) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-xs flex items-center gap-1">
                        {label}
                        {critical && <span className="text-red-500 text-xs">(14d)</span>}
                      </Label>
                      <Input
                        type="number"
                        step="0.001"
                        placeholder="0.000"
                        value={(form as any)[key]}
                        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      />
                      <Select
                        value={(form as any)[supplierKey]}
                        onValueChange={(v) => setForm((f) => ({ ...f, [supplierKey]: v }))}
                      >
                        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Supplier" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">No supplier</SelectItem>
                          {suppliers?.map((s: any) => (
                            <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <Label>Notes</Label>
                <Textarea
                  placeholder="Any special instructions..."
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Order"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
