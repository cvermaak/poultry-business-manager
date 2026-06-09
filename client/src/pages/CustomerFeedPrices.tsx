import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Tag, Pencil, Trash2 } from "lucide-react";

const RANGE_LABELS: Record<string, string> = {
  premium: "Premium",
  value: "Value",
  econo: "Econo",
};

const TYPE_LABELS: Record<string, string> = {
  starter: "Starter",
  grower: "Grower",
  finisher: "Finisher",
};

const RANGE_COLORS: Record<string, string> = {
  premium: "bg-yellow-100 text-yellow-800 border-yellow-200",
  value: "bg-blue-100 text-blue-800 border-blue-200",
  econo: "bg-gray-100 text-gray-800 border-gray-200",
};

const TYPE_COLORS: Record<string, string> = {
  starter: "bg-green-100 text-green-800 border-green-200",
  grower: "bg-orange-100 text-orange-800 border-orange-200",
  finisher: "bg-red-100 text-red-800 border-red-200",
};

type FormState = {
  customerId: string;
  feedRange: "premium" | "value" | "econo" | "";
  feedType: "starter" | "grower" | "finisher" | "";
  pricePerTon: string;
  effectiveDate: string;
  notes: string;
};

const emptyForm: FormState = {
  customerId: "",
  feedRange: "",
  feedType: "",
  pricePerTon: "",
  effectiveDate: new Date().toISOString().slice(0, 10),
  notes: "",
};

export default function CustomerFeedPrices() {
  const [filterCustomer, setFilterCustomer] = useState<string>("all");
  const [filterRange, setFilterRange] = useState<"all" | "premium" | "value" | "econo">("all");
  const [filterType, setFilterType] = useState<"all" | "starter" | "grower" | "finisher">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data: customers = [] } = trpc.customers.list.useQuery({ isActive: true });

  const { data: prices = [], isLoading } = trpc.feedManagement.listCustomerPrices.useQuery({
    customerId: filterCustomer !== "all" ? parseInt(filterCustomer) : undefined,
    feedRange: filterRange === "all" ? undefined : filterRange,
    feedType: filterType === "all" ? undefined : filterType,
  });

  const createMutation = trpc.feedManagement.createCustomerPrice.useMutation({
    onSuccess: () => {
      toast.success("Customer price record created");
      utils.feedManagement.listCustomerPrices.invalidate();
      setDialogOpen(false);
      setForm(emptyForm);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.feedManagement.updateCustomerPrice.useMutation({
    onSuccess: () => {
      toast.success("Customer price updated");
      utils.feedManagement.listCustomerPrices.invalidate();
      setDialogOpen(false);
      setEditId(null);
      setForm(emptyForm);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.feedManagement.deleteCustomerPrice.useMutation({
    onSuccess: () => {
      toast.success("Price record deleted");
      utils.feedManagement.listCustomerPrices.invalidate();
      setDeleteId(null);
    },
    onError: (err) => toast.error(err.message),
  });

  function openEdit(price: any) {
    setEditId(price.id);
    setForm({
      customerId: price.customerId?.toString() ?? "",
      feedRange: price.feedRange,
      feedType: price.feedType,
      pricePerTon: price.pricePerTon?.toString() ?? "",
      effectiveDate: price.effectiveDate ?? "",
      notes: price.notes ?? "",
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.customerId || !form.feedRange || !form.feedType || !form.pricePerTon || !form.effectiveDate) {
      toast.error("Customer, range, type, price, and effective date are required");
      return;
    }
    if (editId !== null) {
      updateMutation.mutate({
        id: editId,
        pricePerTon: form.pricePerTon,
        effectiveDate: form.effectiveDate,
        notes: form.notes || undefined,
      });
    } else {
      createMutation.mutate({
        customerId: parseInt(form.customerId),
        feedRange: form.feedRange as "premium" | "value" | "econo",
        feedType: form.feedType as "starter" | "grower" | "finisher",
        pricePerTon: form.pricePerTon,
        effectiveDate: form.effectiveDate,
        notes: form.notes || undefined,
      });
    }
  }

  function handleClose() {
    setDialogOpen(false);
    setEditId(null);
    setForm(emptyForm);
  }

  const formatCurrency = (val: any) => {
    const n = parseFloat(val);
    if (isNaN(n)) return "—";
    return `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Customer Feed Prices</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Per-customer selling prices per feed range and type. Historical records are retained — new records are created for each price change.
          </p>
        </div>
        <Button onClick={() => { setEditId(null); setForm(emptyForm); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Price
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Customer:</Label>
              <Select value={filterCustomer} onValueChange={setFilterCustomer}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  {(customers as any[]).map((c: any) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Range:</Label>
              <Select value={filterRange} onValueChange={(v) => setFilterRange(v as any)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Ranges</SelectItem>
                  <SelectItem value="premium">Premium</SelectItem>
                  <SelectItem value="value">Value</SelectItem>
                  <SelectItem value="econo">Econo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Type:</Label>
              <Select value={filterType} onValueChange={(v) => setFilterType(v as any)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="grower">Grower</SelectItem>
                  <SelectItem value="finisher">Finisher</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Tag className="h-4 w-4" />
            Price Records ({prices.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading prices…</div>
          ) : prices.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No price records found. Add the first one using the button above.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Feed Range</TableHead>
                  <TableHead>Feed Type</TableHead>
                  <TableHead>Effective Date</TableHead>
                  <TableHead className="text-right">Price per Ton (ZAR)</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prices.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.customerName ?? `Customer #${p.customerId}`}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={RANGE_COLORS[p.feedRange]}>
                        {RANGE_LABELS[p.feedRange]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={TYPE_COLORS[p.feedType]}>
                        {TYPE_LABELS[p.feedType]}
                      </Badge>
                    </TableCell>
                    <TableCell>{p.effectiveDate}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(p.pricePerTon)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-[180px] truncate">{p.notes ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteId(p.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId !== null ? "Edit Customer Price" : "Add Customer Price"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1">
              <Label>Customer *</Label>
              <Select
                value={form.customerId}
                onValueChange={(v) => setForm({ ...form, customerId: v })}
                disabled={editId !== null}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {(customers as any[]).map((c: any) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Feed Range *</Label>
              <Select
                value={form.feedRange}
                onValueChange={(v) => setForm({ ...form, feedRange: v as any })}
                disabled={editId !== null}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="premium">Premium</SelectItem>
                  <SelectItem value="value">Value</SelectItem>
                  <SelectItem value="econo">Econo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Feed Type *</Label>
              <Select
                value={form.feedType}
                onValueChange={(v) => setForm({ ...form, feedType: v as any })}
                disabled={editId !== null}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="grower">Grower</SelectItem>
                  <SelectItem value="finisher">Finisher</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Effective Date *</Label>
              <Input
                type="date"
                value={form.effectiveDate}
                onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Price per Ton (ZAR) *</Label>
              <Input
                type="number"
                step="0.01"
                value={form.pricePerTon}
                onChange={(e) => setForm({ ...form, pricePerTon: e.target.value })}
                placeholder="e.g. 5200.00"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional notes"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending ? "Saving…" : editId !== null ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Price Record</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this price record? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
              disabled={deleteMutation.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
