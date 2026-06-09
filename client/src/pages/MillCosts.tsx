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
import { Plus, Factory, Pencil, Trash2 } from "lucide-react";

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
  feedRange: "premium" | "value" | "econo" | "";
  feedType: "starter" | "grower" | "finisher" | "";
  costPerTon: string;
  effectiveDate: string;
  notes: string;
};

const emptyForm: FormState = {
  feedRange: "",
  feedType: "",
  costPerTon: "",
  effectiveDate: new Date().toISOString().slice(0, 10),
  notes: "",
};

export default function MillCosts() {
  const [filterRange, setFilterRange] = useState<"all" | "premium" | "value" | "econo">("all");
  const [filterType, setFilterType] = useState<"all" | "starter" | "grower" | "finisher">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data: costs = [], isLoading } = trpc.feedManagement.listMillCosts.useQuery({
    feedRange: filterRange === "all" ? undefined : filterRange,
    feedType: filterType === "all" ? undefined : filterType,
  });

  const createMutation = trpc.feedManagement.createMillCost.useMutation({
    onSuccess: () => {
      toast.success("Mill cost record created");
      utils.feedManagement.listMillCosts.invalidate();
      setDialogOpen(false);
      setForm(emptyForm);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.feedManagement.updateMillCost.useMutation({
    onSuccess: () => {
      toast.success("Mill cost updated");
      utils.feedManagement.listMillCosts.invalidate();
      setDialogOpen(false);
      setEditId(null);
      setForm(emptyForm);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.feedManagement.deleteMillCost.useMutation({
    onSuccess: () => {
      toast.success("Mill cost record deleted");
      utils.feedManagement.listMillCosts.invalidate();
      setDeleteId(null);
    },
    onError: (err) => toast.error(err.message),
  });

  function openEdit(cost: any) {
    setEditId(cost.id);
    setForm({
      feedRange: cost.feedRange,
      feedType: cost.feedType,
      costPerTon: cost.costPerTon?.toString() ?? "",
      effectiveDate: cost.effectiveDate ?? "",
      notes: cost.notes ?? "",
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.feedRange || !form.feedType || !form.costPerTon || !form.effectiveDate) {
      toast.error("Range, type, cost per ton, and effective date are required");
      return;
    }
    if (editId !== null) {
      updateMutation.mutate({
        id: editId,
        costPerTon: form.costPerTon,
        effectiveDate: form.effectiveDate,
        notes: form.notes || undefined,
      });
    } else {
      createMutation.mutate({
        feedRange: form.feedRange as "premium" | "value" | "econo",
        feedType: form.feedType as "starter" | "grower" | "finisher",
        costPerTon: form.costPerTon,
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
          <h1 className="text-2xl font-bold text-foreground">Mill Costs</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monthly mill manufacturing cost records per feed range and type. Historical records are retained — new records are created for each period.
          </p>
        </div>
        <Button onClick={() => { setEditId(null); setForm(emptyForm); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Mill Cost
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-center">
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
            <Factory className="h-4 w-4" />
            Mill Cost Records ({costs.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading mill costs…</div>
          ) : costs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No mill cost records found. Add the first one using the button above.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feed Range</TableHead>
                  <TableHead>Feed Type</TableHead>
                  <TableHead>Effective Date</TableHead>
                  <TableHead className="text-right">Cost per Ton (ZAR)</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {costs.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Badge variant="outline" className={RANGE_COLORS[c.feedRange]}>
                        {RANGE_LABELS[c.feedRange]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={TYPE_COLORS[c.feedType]}>
                        {TYPE_LABELS[c.feedType]}
                      </Badge>
                    </TableCell>
                    <TableCell>{c.effectiveDate}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(c.costPerTon)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{c.notes ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteId(c.id)}>
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
            <DialogTitle>{editId !== null ? "Edit Mill Cost" : "Add Mill Cost"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
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
              <Label>Cost per Ton (ZAR) *</Label>
              <Input
                type="number"
                step="0.01"
                value={form.costPerTon}
                onChange={(e) => setForm({ ...form, costPerTon: e.target.value })}
                placeholder="e.g. 4500.00"
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
            <DialogTitle>Delete Mill Cost Record</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this mill cost record? This action cannot be undone.
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
