import { useState } from "react";
import { useRoute, Link } from "wouter";
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
import { ArrowLeft, Truck, Package, AlertTriangle, CheckCircle, Clock } from "lucide-react";

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

const ADDITIVE_LABELS: Record<string, string> = {
  macro: "MACRO",
  soya_oil: "Soya Oil",
  probiotic: "Probiotic",
};

const PO_STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  ordered: "bg-blue-100 text-blue-700",
  confirmed: "bg-yellow-100 text-yellow-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function FeedOrderDetail() {
  const [, params] = useRoute("/feed-orders/:id");
  const orderId = params?.id ? parseInt(params.id) : 0;

  const { data, refetch } = trpc.feedOrders.getOrder.useQuery({ id: orderId }, { enabled: orderId > 0 });

  // Dialogs
  const [statusOpen, setStatusOpen] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [millInvoiceOpen, setMillInvoiceOpen] = useState(false);
  const [millInvoiceForm, setMillInvoiceForm] = useState({ millInvoiceNumber: "", millInvoiceDate: "", millInvoiceAmountExcl: "" });
  const [paidOpen, setPaidOpen] = useState(false);
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10));
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [deliveryForm, setDeliveryForm] = useState({ deliveryDate: new Date().toISOString().slice(0, 10), quantityTons: "", driverName: "", vehicleReg: "", deliveryNoteNumber: "", receivedBy: "", notes: "" });
  const [poOpen, setPoOpen] = useState(false);
  const [selectedPO, setSelectedPO] = useState<any>(null);
  const [poForm, setPoForm] = useState({ status: "", orderPlacedDate: "", expectedDeliveryDate: "", actualDeliveryDate: "", unitPricePerKg: "", supplierInvoiceNumber: "", supplierInvoiceDate: "", supplierInvoicePaid: "0", notes: "" });

  const { data: suppliers } = trpc.suppliers.list.useQuery();

  const updateStatus = trpc.feedOrders.updateStatus.useMutation({
    onSuccess: () => { toast.success("Status updated"); setStatusOpen(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const recordMillInvoice = trpc.feedOrders.recordMillInvoice.useMutation({
    onSuccess: () => { toast.success("Mill invoice recorded"); setMillInvoiceOpen(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const markPaid = trpc.feedOrders.markMillInvoicePaid.useMutation({
    onSuccess: () => { toast.success("Mill invoice marked as paid"); setPaidOpen(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const addDelivery = trpc.feedOrders.addDelivery.useMutation({
    onSuccess: () => { toast.success("Delivery recorded"); setDeliveryOpen(false); setDeliveryForm({ deliveryDate: new Date().toISOString().slice(0, 10), quantityTons: "", driverName: "", vehicleReg: "", deliveryNoteNumber: "", receivedBy: "", notes: "" }); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const updatePO = trpc.feedOrders.updateAdditivePO.useMutation({
    onSuccess: () => { toast.success("Purchase order updated"); setPoOpen(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  if (!data) {
    return (
      <DashboardLayout>
        <div className="p-6 text-muted-foreground">Loading order...</div>
      </DashboardLayout>
    );
  }

  const { order, customerName, customerCompany, deliveries, additivePOs } = data as any;
  const today = new Date().toISOString().slice(0, 10);
  const totalDelivered = (deliveries || []).reduce((sum: number, d: any) => sum + parseFloat(d.quantityTons), 0);
  const remainingTons = parseFloat(order.quantityTons) - totalDelivered;

  const openPODialog = (po: any) => {
    setSelectedPO(po);
    setPoForm({
      status: po.po.status,
      orderPlacedDate: po.po.orderPlacedDate || "",
      expectedDeliveryDate: po.po.expectedDeliveryDate || "",
      actualDeliveryDate: po.po.actualDeliveryDate || "",
      unitPricePerKg: po.po.unitPricePerKg || "",
      supplierInvoiceNumber: po.po.supplierInvoiceNumber || "",
      supplierInvoiceDate: po.po.supplierInvoiceDate || "",
      supplierInvoicePaid: po.po.supplierInvoicePaid ? "1" : "0",
      notes: po.po.notes || "",
    });
    setPoOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/feed-orders">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold font-mono">{order.orderNumber}</h1>
            <p className="text-muted-foreground text-sm">{customerName}{customerCompany ? ` — ${customerCompany}` : ""}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[order.status]}`}>
            {STATUS_LABELS[order.status]}
          </span>
          <Button variant="outline" size="sm" onClick={() => { setNewStatus(order.status); setStatusOpen(true); }}>
            Update Status
          </Button>
        </div>

        {/* Order Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Feed</p>
              <p className="font-bold capitalize">{order.feedRange} {order.feedStage}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Ordered</p>
              <p className="font-bold">{parseFloat(order.quantityTons).toFixed(3)} tons</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Delivered</p>
              <p className="font-bold">{totalDelivered.toFixed(3)} tons</p>
              {remainingTons > 0 && <p className="text-xs text-amber-600">{remainingTons.toFixed(3)} remaining</p>}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Transport</p>
              <p className="font-bold text-sm">{order.transportMode === "afgro_delivers" ? "AFGRO Delivers" : "Customer Collects"}</p>
              {order.transportMode === "afgro_delivers" && order.transportCostTotal && (
                <p className="text-xs text-muted-foreground">R {parseFloat(order.transportCostTotal).toFixed(2)}</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Key Dates */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Key Dates & Lead Times</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {[
                { label: "Order Date", value: order.orderDate },
                { label: "Required By", value: order.requiredByDate },
                { label: "MACRO Order Deadline", value: order.macroOrderDeadline, critical: order.macroOrderDeadline && order.macroOrderDeadline <= today },
                { label: "Mill Production Deadline", value: order.millProductionDeadline },
              ].map(({ label, value, critical }) => (
                <div key={label}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={`font-medium ${critical ? "text-red-600" : ""}`}>{value || "—"}</p>
                  {critical && <p className="text-xs text-red-500">⚠ Overdue</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Mill Invoice (AFGRO pays mill) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Mill Invoice (Mill → AFGRO)</CardTitle>
            <div className="flex gap-2">
              {!order.millInvoiceNumber && (
                <Button size="sm" variant="outline" onClick={() => setMillInvoiceOpen(true)}>
                  Record Invoice
                </Button>
              )}
              {order.millInvoiceNumber && !order.millInvoicePaid && (
                <Button size="sm" variant="outline" onClick={() => setPaidOpen(true)}>
                  Mark as Paid
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {order.millInvoiceNumber ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Invoice #</p>
                  <p className="font-mono font-medium">{order.millInvoiceNumber}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Invoice Date</p>
                  <p>{order.millInvoiceDate}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Amount (excl. VAT)</p>
                  <p className="font-medium">R {parseFloat(order.millInvoiceAmountExcl || "0").toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Due Date (14-day credit)</p>
                  <p className={order.millInvoiceDueDate && order.millInvoiceDueDate <= today && !order.millInvoicePaid ? "text-red-600 font-medium" : ""}>
                    {order.millInvoiceDueDate}
                    {order.millInvoiceDueDate && order.millInvoiceDueDate <= today && !order.millInvoicePaid && " ⚠ OVERDUE"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Payment Status</p>
                  {order.millInvoicePaid ? (
                    <Badge className="bg-green-100 text-green-700 text-xs">Paid {order.millInvoicePaidDate}</Badge>
                  ) : (
                    <Badge className="bg-amber-100 text-amber-700 text-xs">Outstanding</Badge>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No mill invoice recorded yet. Record the invoice once received from the mill.</p>
            )}
          </CardContent>
        </Card>

        {/* Additive Purchase Orders */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Additive Purchase Orders</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {(!additivePOs || additivePOs.length === 0) ? (
              <p className="p-4 text-sm text-muted-foreground">No additive purchase orders. These are generated automatically when the feed order is created with inclusion rates.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">PO #</th>
                    <th className="text-left p-3 font-medium">Additive</th>
                    <th className="text-left p-3 font-medium">Supplier</th>
                    <th className="text-left p-3 font-medium">Qty (kg)</th>
                    <th className="text-left p-3 font-medium">Lead Time</th>
                    <th className="text-left p-3 font-medium">Order Deadline</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {additivePOs.map((row: any) => {
                    const po = row.po;
                    const isOverdue = po.status === "pending" && po.orderDeadlineDate <= today;
                    return (
                      <tr key={po.id} className="border-t hover:bg-muted/30">
                        <td className="p-3 font-mono text-xs">{po.poNumber}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-1">
                            {ADDITIVE_LABELS[po.additiveType] || po.additiveType}
                            {po.isCriticalPath ? <Badge className="text-xs bg-red-100 text-red-700">Critical</Badge> : null}
                          </div>
                        </td>
                        <td className="p-3 text-sm">{row.supplierName || <span className="text-muted-foreground">Not assigned</span>}</td>
                        <td className="p-3 font-medium">{parseFloat(po.quantityKg).toFixed(3)}</td>
                        <td className="p-3 text-sm">{po.leadTimeDays} days</td>
                        <td className="p-3">
                          <span className={isOverdue ? "text-red-600 font-medium" : ""}>{po.orderDeadlineDate}</span>
                          {isOverdue && <p className="text-xs text-red-500">⚠ OVERDUE</p>}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PO_STATUS_COLORS[po.status] || "bg-gray-100 text-gray-700"}`}>
                            {po.status.charAt(0).toUpperCase() + po.status.slice(1)}
                          </span>
                        </td>
                        <td className="p-3">
                          <Button variant="ghost" size="sm" onClick={() => openPODialog(row)}>Update</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Deliveries */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Deliveries ({(deliveries || []).length})</CardTitle>
            <Button size="sm" onClick={() => setDeliveryOpen(true)}>
              <Truck className="h-4 w-4 mr-1" /> Record Delivery
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {(!deliveries || deliveries.length === 0) ? (
              <p className="p-4 text-sm text-muted-foreground">No deliveries recorded yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">Delivery #</th>
                    <th className="text-left p-3 font-medium">Date</th>
                    <th className="text-left p-3 font-medium">Qty (tons)</th>
                    <th className="text-left p-3 font-medium">Driver</th>
                    <th className="text-left p-3 font-medium">Vehicle</th>
                    <th className="text-left p-3 font-medium">Delivery Note</th>
                    <th className="text-left p-3 font-medium">Received By</th>
                    <th className="text-left p-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map((d: any) => (
                    <tr key={d.id} className="border-t hover:bg-muted/30">
                      <td className="p-3 font-mono text-xs">{d.deliveryNumber}</td>
                      <td className="p-3">{d.deliveryDate}</td>
                      <td className="p-3 font-medium">{parseFloat(d.quantityTons).toFixed(3)}</td>
                      <td className="p-3">{d.driverName || "—"}</td>
                      <td className="p-3">{d.vehicleReg || "—"}</td>
                      <td className="p-3 font-mono text-xs">{d.deliveryNoteNumber || "—"}</td>
                      <td className="p-3">{d.receivedBy || "—"}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          d.status === "delivered" ? "bg-green-100 text-green-700" :
                          d.status === "invoiced" ? "bg-teal-100 text-teal-700" :
                          d.status === "in_transit" ? "bg-blue-100 text-blue-700" :
                          "bg-gray-100 text-gray-700"
                        }`}>
                          {d.status.charAt(0).toUpperCase() + d.status.slice(1).replace("_", " ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Notes */}
        {order.notes && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Notes</CardTitle></CardHeader>
            <CardContent><p className="text-sm">{order.notes}</p></CardContent>
          </Card>
        )}
      </div>

      {/* Update Status Dialog */}
      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Update Order Status</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Label>New Status</Label>
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusOpen(false)}>Cancel</Button>
            <Button onClick={() => updateStatus.mutate({ id: orderId, status: newStatus as any })} disabled={updateStatus.isPending}>
              {updateStatus.isPending ? "Saving..." : "Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Mill Invoice Dialog */}
      <Dialog open={millInvoiceOpen} onOpenChange={setMillInvoiceOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Record Mill Invoice</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Invoice Number *</Label>
              <Input value={millInvoiceForm.millInvoiceNumber} onChange={(e) => setMillInvoiceForm((f) => ({ ...f, millInvoiceNumber: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Invoice Date *</Label>
              <Input type="date" value={millInvoiceForm.millInvoiceDate} onChange={(e) => setMillInvoiceForm((f) => ({ ...f, millInvoiceDate: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Amount (excl. VAT) R *</Label>
              <Input type="number" step="0.01" value={millInvoiceForm.millInvoiceAmountExcl} onChange={(e) => setMillInvoiceForm((f) => ({ ...f, millInvoiceAmountExcl: e.target.value }))} />
            </div>
            <p className="text-xs text-muted-foreground">Payment due date will be automatically set to 14 days from invoice date (mill credit facility).</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMillInvoiceOpen(false)}>Cancel</Button>
            <Button
              onClick={() => recordMillInvoice.mutate({ id: orderId, ...millInvoiceForm })}
              disabled={recordMillInvoice.isPending || !millInvoiceForm.millInvoiceNumber || !millInvoiceForm.millInvoiceDate || !millInvoiceForm.millInvoiceAmountExcl}
            >
              {recordMillInvoice.isPending ? "Saving..." : "Record Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark Mill Invoice Paid Dialog */}
      <Dialog open={paidOpen} onOpenChange={setPaidOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Mark Mill Invoice as Paid</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Payment Date</Label>
            <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaidOpen(false)}>Cancel</Button>
            <Button onClick={() => markPaid.mutate({ id: orderId, paidDate })} disabled={markPaid.isPending}>
              {markPaid.isPending ? "Saving..." : "Mark Paid"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Delivery Dialog */}
      <Dialog open={deliveryOpen} onOpenChange={setDeliveryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record Delivery</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Delivery Date *</Label>
                <Input type="date" value={deliveryForm.deliveryDate} onChange={(e) => setDeliveryForm((f) => ({ ...f, deliveryDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Quantity (tons) *</Label>
                <Input type="number" step="0.001" placeholder={remainingTons > 0 ? `Max ${remainingTons.toFixed(3)}` : "0.000"} value={deliveryForm.quantityTons} onChange={(e) => setDeliveryForm((f) => ({ ...f, quantityTons: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Driver Name</Label>
                <Input value={deliveryForm.driverName} onChange={(e) => setDeliveryForm((f) => ({ ...f, driverName: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Vehicle Reg</Label>
                <Input value={deliveryForm.vehicleReg} onChange={(e) => setDeliveryForm((f) => ({ ...f, vehicleReg: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Delivery Note #</Label>
                <Input value={deliveryForm.deliveryNoteNumber} onChange={(e) => setDeliveryForm((f) => ({ ...f, deliveryNoteNumber: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Received By</Label>
                <Input value={deliveryForm.receivedBy} onChange={(e) => setDeliveryForm((f) => ({ ...f, receivedBy: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea rows={2} value={deliveryForm.notes} onChange={(e) => setDeliveryForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeliveryOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addDelivery.mutate({ feedOrderId: orderId, ...deliveryForm })}
              disabled={addDelivery.isPending || !deliveryForm.quantityTons}
            >
              {addDelivery.isPending ? "Saving..." : "Record Delivery"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Additive PO Dialog */}
      <Dialog open={poOpen} onOpenChange={setPoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Update {selectedPO ? ADDITIVE_LABELS[selectedPO.po.additiveType] : ""} Purchase Order
            </DialogTitle>
          </DialogHeader>
          {selectedPO && (
            <div className="space-y-3 py-2">
              <div className="p-2 bg-muted/30 rounded text-sm">
                <span className="font-mono">{selectedPO.po.poNumber}</span> — {parseFloat(selectedPO.po.quantityKg).toFixed(3)} kg
                {selectedPO.po.isCriticalPath ? <Badge className="ml-2 text-xs bg-red-100 text-red-700">Critical Path (14d)</Badge> : null}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select value={poForm.status} onValueChange={(v) => setPoForm((f) => ({ ...f, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="ordered">Ordered</SelectItem>
                      <SelectItem value="confirmed">Confirmed</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Unit Price (R/kg)</Label>
                  <Input type="number" step="0.0001" value={poForm.unitPricePerKg} onChange={(e) => setPoForm((f) => ({ ...f, unitPricePerKg: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Order Placed Date</Label>
                  <Input type="date" value={poForm.orderPlacedDate} onChange={(e) => setPoForm((f) => ({ ...f, orderPlacedDate: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Expected Delivery</Label>
                  <Input type="date" value={poForm.expectedDeliveryDate} onChange={(e) => setPoForm((f) => ({ ...f, expectedDeliveryDate: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Actual Delivery</Label>
                  <Input type="date" value={poForm.actualDeliveryDate} onChange={(e) => setPoForm((f) => ({ ...f, actualDeliveryDate: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Supplier Invoice #</Label>
                  <Input value={poForm.supplierInvoiceNumber} onChange={(e) => setPoForm((f) => ({ ...f, supplierInvoiceNumber: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Supplier Invoice Date</Label>
                  <Input type="date" value={poForm.supplierInvoiceDate} onChange={(e) => setPoForm((f) => ({ ...f, supplierInvoiceDate: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Supplier Invoice Paid?</Label>
                  <Select value={poForm.supplierInvoicePaid} onValueChange={(v) => setPoForm((f) => ({ ...f, supplierInvoicePaid: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">No</SelectItem>
                      <SelectItem value="1">Yes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Notes</Label>
                <Textarea rows={2} value={poForm.notes} onChange={(e) => setPoForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPoOpen(false)}>Cancel</Button>
            <Button
              onClick={() => updatePO.mutate({
                id: selectedPO.po.id,
                status: poForm.status as any,
                unitPricePerKg: poForm.unitPricePerKg || undefined,
                orderPlacedDate: poForm.orderPlacedDate || undefined,
                expectedDeliveryDate: poForm.expectedDeliveryDate || undefined,
                actualDeliveryDate: poForm.actualDeliveryDate || undefined,
                supplierInvoiceNumber: poForm.supplierInvoiceNumber || undefined,
                supplierInvoiceDate: poForm.supplierInvoiceDate || undefined,
                supplierInvoicePaid: parseInt(poForm.supplierInvoicePaid),
                notes: poForm.notes || undefined,
              })}
              disabled={updatePO.isPending}
            >
              {updatePO.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
