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
import { Plus, FlaskConical, Archive } from "lucide-react";

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

const RANGE_COLORS: Record<string, string> = {
  premium: "bg-yellow-100 text-yellow-800 border-yellow-200",
  value: "bg-blue-100 text-blue-800 border-blue-200",
  econo: "bg-gray-100 text-gray-800 border-gray-200",
};

const STAGE_COLORS: Record<string, string> = {
  starter: "bg-green-100 text-green-800 border-green-200",
  grower: "bg-orange-100 text-orange-800 border-orange-200",
  finisher: "bg-red-100 text-red-800 border-red-200",
};

type FormState = {
  name: string;
  feedRange: "premium" | "value" | "econo" | "";
  feedStage: "starter" | "grower" | "finisher" | "";
  description: string;
  ingredients: string;
  macroKgPerTon: string;
  soyaOilKgPerTon: string;
  probioticKgPerTon: string;
  allocationKgPerBird: string;
  effectiveDate: string;
  crudeProtein: string;
  crudeFiber: string;
  calcium: string;
  phosphorus: string;
};

const emptyForm: FormState = {
  name: "",
  feedRange: "",
  feedStage: "",
  description: "",
  ingredients: "{}",
  macroKgPerTon: "",
  soyaOilKgPerTon: "",
  probioticKgPerTon: "",
  allocationKgPerBird: "",
  effectiveDate: new Date().toISOString().slice(0, 10),
  crudeProtein: "",
  crudeFiber: "",
  calcium: "",
  phosphorus: "",
};

export default function FeedFormulations() {
  const [filterRange, setFilterRange] = useState<"all" | "premium" | "value" | "econo">("all");
  const [filterStage, setFilterStage] = useState<"all" | "starter" | "grower" | "finisher">("all");
  const [showActive, setShowActive] = useState<"active" | "all">("active");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [deactivateId, setDeactivateId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data: formulations = [], isLoading } = trpc.feedManagement.listFormulations.useQuery({
    feedRange: filterRange === "all" ? undefined : filterRange,
    feedStage: filterStage === "all" ? undefined : filterStage,
    isActive: showActive === "active" ? 1 : undefined,
  });

  const createMutation = trpc.feedManagement.createFormulation.useMutation({
    onSuccess: () => {
      toast.success("Formulation created successfully");
      utils.feedManagement.listFormulations.invalidate();
      setDialogOpen(false);
      setForm(emptyForm);
    },
    onError: (err) => toast.error(err.message),
  });

  const deactivateMutation = trpc.feedManagement.deactivateFormulation.useMutation({
    onSuccess: () => {
      toast.success("Formulation archived");
      utils.feedManagement.listFormulations.invalidate();
      setDeactivateId(null);
    },
    onError: (err) => toast.error(err.message),
  });

  function handleSubmit() {
    if (!form.feedRange || !form.feedStage || !form.name) {
      toast.error("Name, range, and stage are required");
      return;
    }
    createMutation.mutate({
      name: form.name,
      feedRange: form.feedRange as "premium" | "value" | "econo",
      feedStage: form.feedStage as "starter" | "grower" | "finisher",
      description: form.description || undefined,
      ingredients: form.ingredients || "{}",
      macroKgPerTon: form.macroKgPerTon || undefined,
      soyaOilKgPerTon: form.soyaOilKgPerTon || undefined,
      probioticKgPerTon: form.probioticKgPerTon || undefined,
      allocationKgPerBird: form.allocationKgPerBird || undefined,
      effectiveDate: form.effectiveDate || undefined,
      crudeProtein: form.crudeProtein || undefined,
      crudeFiber: form.crudeFiber || undefined,
      calcium: form.calcium || undefined,
      phosphorus: form.phosphorus || undefined,
    });
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Feed Formulations</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Versioned feed formulation records with additive inclusion rates. New versions are always created — existing records are never overwritten.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Formulation
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
              <Label className="text-sm font-medium">Stage:</Label>
              <Select value={filterStage} onValueChange={(v) => setFilterStage(v as any)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stages</SelectItem>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="grower">Grower</SelectItem>
                  <SelectItem value="finisher">Finisher</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Status:</Label>
              <Select value={showActive} onValueChange={(v) => setShowActive(v as any)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active Only</SelectItem>
                  <SelectItem value="all">All</SelectItem>
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
            <FlaskConical className="h-4 w-4" />
            Formulation Records ({formulations.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading formulations…</div>
          ) : formulations.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No formulations found. Create the first one using the button above.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Range</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Ver.</TableHead>
                  <TableHead>Effective Date</TableHead>
                  <TableHead className="text-right">MACRO (kg/t)</TableHead>
                  <TableHead className="text-right">Soya Oil (kg/t)</TableHead>
                  <TableHead className="text-right">Probiotic (kg/t)</TableHead>
                  <TableHead className="text-right">Alloc. (kg/bird)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {formulations.map((f: any) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={RANGE_COLORS[f.feedRange]}>
                        {RANGE_LABELS[f.feedRange]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STAGE_COLORS[f.feedStage]}>
                        {STAGE_LABELS[f.feedStage]}
                      </Badge>
                    </TableCell>
                    <TableCell>v{f.version}</TableCell>
                    <TableCell>{f.effectiveDate ?? "—"}</TableCell>
                    <TableCell className="text-right">{f.macroKgPerTon ?? "—"}</TableCell>
                    <TableCell className="text-right">{f.soyaOilKgPerTon ?? "—"}</TableCell>
                    <TableCell className="text-right">{f.probioticKgPerTon ?? "—"}</TableCell>
                    <TableCell className="text-right">{f.allocationKgPerBird ?? "—"}</TableCell>
                    <TableCell>
                      {f.isActive ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200">Archived</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {f.isActive ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeactivateId(f.id)}
                          title="Archive this formulation"
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Feed Formulation</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1">
              <Label>Formulation Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Premium Starter v3"
              />
            </div>
            <div className="space-y-1">
              <Label>Feed Range *</Label>
              <Select value={form.feedRange} onValueChange={(v) => setForm({ ...form, feedRange: v as any })}>
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
              <Label>Feed Stage *</Label>
              <Select value={form.feedStage} onValueChange={(v) => setForm({ ...form, feedStage: v as any })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="grower">Grower</SelectItem>
                  <SelectItem value="finisher">Finisher</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Effective Date</Label>
              <Input
                type="date"
                value={form.effectiveDate}
                onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Allocation (kg/bird)</Label>
              <Input
                type="number"
                step="0.001"
                value={form.allocationKgPerBird}
                onChange={(e) => setForm({ ...form, allocationKgPerBird: e.target.value })}
                placeholder="e.g. 0.900"
              />
            </div>

            <div className="col-span-2">
              <p className="text-sm font-semibold text-muted-foreground mb-2 mt-1">Additive Inclusion Rates</p>
            </div>
            <div className="space-y-1">
              <Label>MACRO (kg/ton)</Label>
              <Input
                type="number"
                step="0.001"
                value={form.macroKgPerTon}
                onChange={(e) => setForm({ ...form, macroKgPerTon: e.target.value })}
                placeholder="e.g. 2.500"
              />
            </div>
            <div className="space-y-1">
              <Label>Soya Oil (kg/ton)</Label>
              <Input
                type="number"
                step="0.001"
                value={form.soyaOilKgPerTon}
                onChange={(e) => setForm({ ...form, soyaOilKgPerTon: e.target.value })}
                placeholder="e.g. 20.000"
              />
            </div>
            <div className="space-y-1">
              <Label>Probiotic (kg/ton)</Label>
              <Input
                type="number"
                step="0.001"
                value={form.probioticKgPerTon}
                onChange={(e) => setForm({ ...form, probioticKgPerTon: e.target.value })}
                placeholder="e.g. 0.500"
              />
            </div>

            <div className="col-span-2">
              <p className="text-sm font-semibold text-muted-foreground mb-2 mt-1">Nutritional Profile (optional)</p>
            </div>
            <div className="space-y-1">
              <Label>Crude Protein (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.crudeProtein}
                onChange={(e) => setForm({ ...form, crudeProtein: e.target.value })}
                placeholder="e.g. 22.00"
              />
            </div>
            <div className="space-y-1">
              <Label>Crude Fibre (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.crudeFiber}
                onChange={(e) => setForm({ ...form, crudeFiber: e.target.value })}
                placeholder="e.g. 3.50"
              />
            </div>
            <div className="space-y-1">
              <Label>Calcium (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.calcium}
                onChange={(e) => setForm({ ...form, calcium: e.target.value })}
                placeholder="e.g. 1.00"
              />
            </div>
            <div className="space-y-1">
              <Label>Phosphorus (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.phosphorus}
                onChange={(e) => setForm({ ...form, phosphorus: e.target.value })}
                placeholder="e.g. 0.45"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Description / Notes</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional notes about this formulation version"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Saving…" : "Create Formulation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive Confirm Dialog */}
      <Dialog open={deactivateId !== null} onOpenChange={() => setDeactivateId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive Formulation</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will mark the formulation as archived (inactive). The record is retained for historical reference. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deactivateId && deactivateMutation.mutate({ id: deactivateId })}
              disabled={deactivateMutation.isPending}
            >
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
