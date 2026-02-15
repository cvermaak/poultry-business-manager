import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Package } from "lucide-react";
import { toast } from "sonner";

export default function CrateTypes() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingCrate, setEditingCrate] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    length: "",
    width: "",
    height: "",
    tareWeight: "",
    notes: "",
  });

  const { data: crateTypes, isLoading, refetch } = trpc.catch.listCrateTypes.useQuery();
  const createMutation = trpc.catch.createCrateType.useMutation();
  const updateMutation = trpc.catch.updateCrateType.useMutation();
  const deleteMutation = trpc.catch.deleteCrateType.useMutation();

  const handleCreate = async () => {
    try {
      await createMutation.mutateAsync({
        name: formData.name,
        length: parseFloat(formData.length),
        width: parseFloat(formData.width),
        height: parseFloat(formData.height),
        tareWeight: parseFloat(formData.tareWeight),
        notes: formData.notes || undefined,
      });
      toast.success("Crate type created successfully");
      setIsCreateDialogOpen(false);
      resetForm();
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Failed to create crate type");
    }
  };

  const handleEdit = async () => {
    if (!editingCrate) return;
    try {
      await updateMutation.mutateAsync({
        id: editingCrate.id,
        name: formData.name,
        length: parseFloat(formData.length),
        width: parseFloat(formData.width),
        height: parseFloat(formData.height),
        tareWeight: parseFloat(formData.tareWeight),
        notes: formData.notes || undefined,
      });
      toast.success("Crate type updated successfully");
      setIsEditDialogOpen(false);
      setEditingCrate(null);
      resetForm();
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Failed to update crate type");
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Are you sure you want to delete crate type "${name}"?`)) return;
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("Crate type deleted successfully");
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete crate type");
    }
  };

  const openEditDialog = (crate: any) => {
    setEditingCrate(crate);
    setFormData({
      name: crate.name,
      length: crate.length,
      width: crate.width,
      height: crate.height,
      tareWeight: crate.tareWeight,
      notes: crate.notes || "",
    });
    setIsEditDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      length: "",
      width: "",
      height: "",
      tareWeight: "",
      notes: "",
    });
  };

  const calculateVolume = () => {
    const l = parseFloat(formData.length);
    const w = parseFloat(formData.width);
    const h = parseFloat(formData.height);
    if (l && w && h) {
      return ((l * w * h) / 1000000).toFixed(3); // Convert cm³ to m³
    }
    return "0.000";
  };

  const calculateFloorArea = () => {
    const l = parseFloat(formData.length);
    const w = parseFloat(formData.width);
    if (l && w) {
      return ((l * w) / 10000).toFixed(3); // Convert cm² to m²
    }
    return "0.000";
  };

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-6 w-6" />
                Crate Types Management
              </CardTitle>
              <CardDescription>
                Manage crate types used for catching and transporting birds
              </CardDescription>
            </div>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Crate Type
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading crate types...</div>
          ) : !crateTypes || crateTypes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No crate types found. Add your first crate type to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Dimensions (L × W × H cm)</TableHead>
                  <TableHead>Floor Area (m²)</TableHead>
                  <TableHead>Volume (m³)</TableHead>
                  <TableHead>Tare Weight (kg)</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {crateTypes.map((crate: any) => {
                  const length = parseFloat(crate.length);
                  const width = parseFloat(crate.width);
                  const height = parseFloat(crate.height);
                  const floorArea = ((length * width) / 10000).toFixed(3);
                  const volume = ((length * width * height) / 1000000).toFixed(3);
                  
                  return (
                    <TableRow key={crate.id}>
                      <TableCell className="font-medium">{crate.name}</TableCell>
                      <TableCell>
                        {length} × {width} × {height}
                      </TableCell>
                      <TableCell>{floorArea} m²</TableCell>
                      <TableCell>{volume} m³</TableCell>
                      <TableCell>{parseFloat(crate.tareWeight).toFixed(2)} kg</TableCell>
                      <TableCell className="max-w-xs truncate">{crate.notes || "-"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditDialog(crate)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(crate.id, crate.name)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add New Crate Type</DialogTitle>
            <DialogDescription>
              Define a new crate type with dimensions and tare weight
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Crate Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Standard Medium, Large Transport"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="length">Length (cm) *</Label>
                <Input
                  id="length"
                  type="number"
                  step="0.01"
                  placeholder="96"
                  value={formData.length}
                  onChange={(e) => setFormData({ ...formData, length: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="width">Width (cm) *</Label>
                <Input
                  id="width"
                  type="number"
                  step="0.01"
                  placeholder="57"
                  value={formData.width}
                  onChange={(e) => setFormData({ ...formData, width: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="height">Height (cm) *</Label>
                <Input
                  id="height"
                  type="number"
                  step="0.01"
                  placeholder="27"
                  value={formData.height}
                  onChange={(e) => setFormData({ ...formData, height: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg border p-3">
                <div className="text-sm text-muted-foreground">Floor Area</div>
                <div className="text-lg font-semibold">{calculateFloorArea()} m²</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-sm text-muted-foreground">Volume</div>
                <div className="text-lg font-semibold">{calculateVolume()} m³</div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tareWeight">Tare Weight (kg) *</Label>
                <Input
                  id="tareWeight"
                  type="number"
                  step="0.001"
                  placeholder="3.2"
                  value={formData.tareWeight}
                  onChange={(e) => setFormData({ ...formData, tareWeight: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Additional information about this crate type..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsCreateDialogOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Crate Type"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Crate Type</DialogTitle>
            <DialogDescription>
              Update crate type dimensions and tare weight
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Crate Name *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-length">Length (cm) *</Label>
                <Input
                  id="edit-length"
                  type="number"
                  step="0.01"
                  value={formData.length}
                  onChange={(e) => setFormData({ ...formData, length: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-width">Width (cm) *</Label>
                <Input
                  id="edit-width"
                  type="number"
                  step="0.01"
                  value={formData.width}
                  onChange={(e) => setFormData({ ...formData, width: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-height">Height (cm) *</Label>
                <Input
                  id="edit-height"
                  type="number"
                  step="0.01"
                  value={formData.height}
                  onChange={(e) => setFormData({ ...formData, height: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg border p-3">
                <div className="text-sm text-muted-foreground">Floor Area</div>
                <div className="text-lg font-semibold">{calculateFloorArea()} m²</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-sm text-muted-foreground">Volume</div>
                <div className="text-lg font-semibold">{calculateVolume()} m³</div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-tareWeight">Tare Weight (kg) *</Label>
                <Input
                  id="edit-tareWeight"
                  type="number"
                  step="0.001"
                  value={formData.tareWeight}
                  onChange={(e) => setFormData({ ...formData, tareWeight: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsEditDialogOpen(false); setEditingCrate(null); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Updating..." : "Update Crate Type"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
