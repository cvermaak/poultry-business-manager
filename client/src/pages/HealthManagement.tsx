import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Syringe, Droplets, Plus, Edit, Trash2, Info } from "lucide-react";
import { toast } from "sonner";

export default function HealthManagement() {
  const [selectedTab, setSelectedTab] = useState("vaccines");
  const [vaccineDialogOpen, setVaccineDialogOpen] = useState(false);
  const [stressPackDialogOpen, setStressPackDialogOpen] = useState(false);
  const [editingVaccine, setEditingVaccine] = useState<any>(null);
  const [editingStressPack, setEditingStressPack] = useState<any>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ type: 'vaccine' | 'stressPack', id: number } | null>(null);

  const utils = trpc.useUtils();
  const { data: vaccines, isLoading: vaccinesLoading } = trpc.health.listVaccines.useQuery();
  const { data: stressPacks, isLoading: stressPacksLoading } = trpc.health.listStressPacks.useQuery();

  const createVaccineMutation = trpc.health.createVaccine.useMutation({
    onSuccess: () => {
      utils.health.listVaccines.invalidate();
      setVaccineDialogOpen(false);
      toast.success("Vaccine created successfully");
    },
    onError: (error) => toast.error(error.message),
  });

  const updateVaccineMutation = trpc.health.updateVaccine.useMutation({
    onSuccess: () => {
      utils.health.listVaccines.invalidate();
      setVaccineDialogOpen(false);
      setEditingVaccine(null);
      toast.success("Vaccine updated successfully");
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteVaccineMutation = trpc.health.deleteVaccine.useMutation({
    onSuccess: () => {
      utils.health.listVaccines.invalidate();
      setDeleteConfirmOpen(false);
      setItemToDelete(null);
      toast.success("Vaccine deleted successfully");
    },
    onError: (error) => toast.error(error.message),
  });

  const createStressPackMutation = trpc.health.createStressPack.useMutation({
    onSuccess: () => {
      utils.health.listStressPacks.invalidate();
      setStressPackDialogOpen(false);
      toast.success("Stress pack created successfully");
    },
    onError: (error) => toast.error(error.message),
  });

  const updateStressPackMutation = trpc.health.updateStressPack.useMutation({
    onSuccess: () => {
      utils.health.listStressPacks.invalidate();
      setStressPackDialogOpen(false);
      setEditingStressPack(null);
      toast.success("Stress pack updated successfully");
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteStressPackMutation = trpc.health.deleteStressPack.useMutation({
    onSuccess: () => {
      utils.health.listStressPacks.invalidate();
      setDeleteConfirmOpen(false);
      setItemToDelete(null);
      toast.success("Stress pack deleted successfully");
    },
    onError: (error) => toast.error(error.message),
  });

  const handleVaccineSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get("name") as string,
      brand: formData.get("brand") as string,
      manufacturer: formData.get("manufacturer") as string || undefined,
      diseaseType: formData.get("diseaseType") as any,
      vaccineType: formData.get("vaccineType") as any,
      applicationMethod: formData.get("applicationMethod") as any,
      dosagePerBird: formData.get("dosagePerBird") as string || undefined,
      boosterIntervalDays: formData.get("boosterIntervalDays") ? Number(formData.get("boosterIntervalDays")) : undefined,
      instructions: formData.get("instructions") as string || undefined,
      withdrawalPeriodDays: formData.get("withdrawalPeriodDays") ? Number(formData.get("withdrawalPeriodDays")) : undefined,
      storageTemperature: formData.get("storageTemperature") as string || undefined,
      shelfLifeDays: formData.get("shelfLifeDays") ? Number(formData.get("shelfLifeDays")) : undefined,
    };

    if (editingVaccine) {
      updateVaccineMutation.mutate({ id: editingVaccine.id, ...data });
    } else {
      createVaccineMutation.mutate(data);
    }
  };

  const handleStressPackSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get("name") as string,
      brand: formData.get("brand") as string,
      dosageStrength: formData.get("dosageStrength") as any || undefined,
      recommendedDurationDays: Number(formData.get("recommendedDurationDays")),
      instructions: formData.get("instructions") as string || undefined,
      costPerKg: formData.get("costPerKg") as string || undefined,
      activeIngredients: formData.get("activeIngredients") as string || undefined,
    };

    if (editingStressPack) {
      updateStressPackMutation.mutate({ id: editingStressPack.id, ...data });
    } else {
      createStressPackMutation.mutate(data);
    }
  };

  const handleDelete = () => {
    if (!itemToDelete) return;
    if (itemToDelete.type === 'vaccine') {
      deleteVaccineMutation.mutate({ id: itemToDelete.id });
    } else {
      deleteStressPackMutation.mutate({ id: itemToDelete.id });
    }
  };

  const getVaccineTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      newcastle_disease: "Newcastle Disease (ND)",
      infectious_bronchitis: "Infectious Bronchitis (IB)",
      gumboro: "Gumboro (IBD)",
      mareks: "Marek's Disease",
      fowl_pox: "Fowl Pox",
      coccidiosis: "Coccidiosis",
      other: "Other",
    };
    return labels[type] || type;
  };

  const getApplicationMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      drinking_water: "Drinking Water",
      spray: "Spray",
      eye_drop: "Eye Drop",
      injection: "Injection (SC/IM)",
      wing_web: "Wing-Web Stab",
    };
    return labels[method] || method;
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Health Management</h1>
        <p className="text-muted-foreground">Vaccine library, stress packs, and health protocols</p>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="vaccines">
            <Syringe className="w-4 h-4 mr-2" />
            Vaccines
          </TabsTrigger>
          <TabsTrigger value="stress-packs">
            <Droplets className="w-4 h-4 mr-2" />
            Stress Packs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="vaccines" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {vaccines?.length || 0} vaccines available
            </p>
            <Button onClick={() => { setEditingVaccine(null); setVaccineDialogOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              Add Vaccine
            </Button>
          </div>

          {vaccinesLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading vaccines...</div>
          ) : vaccines && vaccines.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {vaccines.map((vaccine) => (
                <Card key={vaccine.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{vaccine.name}</CardTitle>
                        <CardDescription>{vaccine.brand}</CardDescription>
                      </div>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => { setEditingVaccine(vaccine); setVaccineDialogOpen(true); }}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => { setItemToDelete({ type: 'vaccine', id: vaccine.id }); setDeleteConfirmOpen(true); }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">{getVaccineTypeLabel(vaccine.diseaseType)}</Badge>
                      <Badge variant="outline">{vaccine.vaccineType}</Badge>
                    </div>
                    <div className="text-sm">
                      <p><strong>Method:</strong> {getApplicationMethodLabel(vaccine.applicationMethod)}</p>
                      {vaccine.dosagePerBird && <p><strong>Dosage:</strong> {vaccine.dosagePerBird}</p>}
                      {vaccine.boosterIntervalDays && <p><strong>Booster:</strong> Every {vaccine.boosterIntervalDays} days</p>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No vaccines found. Click "Add Vaccine" to create one.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="stress-packs" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {stressPacks?.length || 0} stress packs available
            </p>
            <Button onClick={() => { setEditingStressPack(null); setStressPackDialogOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              Add Stress Pack
            </Button>
          </div>

          {stressPacksLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading stress packs...</div>
          ) : stressPacks && stressPacks.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {stressPacks.map((pack) => (
                <Card key={pack.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{pack.name}</CardTitle>
                        <CardDescription>{pack.brand}</CardDescription>
                      </div>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => { setEditingStressPack(pack); setStressPackDialogOpen(true); }}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => { setItemToDelete({ type: 'stressPack', id: pack.id }); setDeleteConfirmOpen(true); }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {pack.dosageStrength && <Badge variant="secondary">{pack.dosageStrength} strength</Badge>}
                    </div>
                    <div className="text-sm">
                      {pack.recommendedDurationDays && <p><strong>Duration:</strong> {pack.recommendedDurationDays} days</p>}
                      {pack.activeIngredients && <p><strong>Ingredients:</strong> {pack.activeIngredients}</p>}
                      {pack.costPerKg && <p><strong>Cost:</strong> R{pack.costPerKg}/kg</p>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No stress packs found. Click "Add Stress Pack" to create one.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Vaccine Form Dialog */}
      <Dialog open={vaccineDialogOpen} onOpenChange={setVaccineDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingVaccine ? "Edit Vaccine" : "Add New Vaccine"}</DialogTitle>
            <DialogDescription>
              {editingVaccine ? "Update vaccine information" : "Add a new vaccine to your library"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleVaccineSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Vaccine Name *</Label>
                <Input id="name" name="name" required defaultValue={editingVaccine?.name} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brand">Brand *</Label>
                <Input id="brand" name="brand" required defaultValue={editingVaccine?.brand} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manufacturer">Manufacturer</Label>
                <Input id="manufacturer" name="manufacturer" defaultValue={editingVaccine?.manufacturer} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="diseaseType">Disease Type *</Label>
                <Select name="diseaseType" required defaultValue={editingVaccine?.diseaseType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select disease" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newcastle_disease">Newcastle Disease</SelectItem>
                    <SelectItem value="infectious_bronchitis">Infectious Bronchitis</SelectItem>
                    <SelectItem value="gumboro">Gumboro (IBD)</SelectItem>
                    <SelectItem value="mareks">Marek's Disease</SelectItem>
                    <SelectItem value="coccidiosis">Coccidiosis</SelectItem>
                    <SelectItem value="fowl_pox">Fowl Pox</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="vaccineType">Vaccine Type *</Label>
                <Select name="vaccineType" required defaultValue={editingVaccine?.vaccineType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="live">Live</SelectItem>
                    <SelectItem value="inactivated">Inactivated</SelectItem>
                    <SelectItem value="recombinant">Recombinant</SelectItem>
                    <SelectItem value="vector">Vector</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="applicationMethod">Application Method *</Label>
                <Select name="applicationMethod" required defaultValue={editingVaccine?.applicationMethod}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="drinking_water">Drinking Water</SelectItem>
                    <SelectItem value="spray">Spray</SelectItem>
                    <SelectItem value="eye_drop">Eye Drop</SelectItem>
                    <SelectItem value="injection">Injection</SelectItem>
                    <SelectItem value="wing_web">Wing-Web Stab</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dosagePerBird">Dosage Per Bird</Label>
                <Input id="dosagePerBird" name="dosagePerBird" placeholder="e.g., 0.03ml" defaultValue={editingVaccine?.dosagePerBird} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="boosterIntervalDays">Booster Interval (days)</Label>
                <Input id="boosterIntervalDays" name="boosterIntervalDays" type="number" defaultValue={editingVaccine?.boosterIntervalDays} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="storageTemperature">Storage Temperature</Label>
                <Input id="storageTemperature" name="storageTemperature" placeholder="e.g., 2-8°C" defaultValue={editingVaccine?.storageTemperature} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shelfLifeDays">Shelf Life (days)</Label>
                <Input id="shelfLifeDays" name="shelfLifeDays" type="number" defaultValue={editingVaccine?.shelfLifeDays} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="withdrawalPeriodDays">Withdrawal Period (days)</Label>
                <Input id="withdrawalPeriodDays" name="withdrawalPeriodDays" type="number" defaultValue={editingVaccine?.withdrawalPeriodDays} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="instructions">Instructions</Label>
              <Textarea id="instructions" name="instructions" rows={3} defaultValue={editingVaccine?.instructions} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setVaccineDialogOpen(false); setEditingVaccine(null); }}>
                Cancel
              </Button>
              <Button type="submit" disabled={createVaccineMutation.isPending || updateVaccineMutation.isPending}>
                {editingVaccine ? "Update" : "Create"} Vaccine
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Stress Pack Form Dialog */}
      <Dialog open={stressPackDialogOpen} onOpenChange={setStressPackDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingStressPack ? "Edit Stress Pack" : "Add New Stress Pack"}</DialogTitle>
            <DialogDescription>
              {editingStressPack ? "Update stress pack information" : "Add a new stress pack to your library"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleStressPackSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sp-name">Product Name *</Label>
                <Input id="sp-name" name="name" required defaultValue={editingStressPack?.name} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sp-brand">Brand *</Label>
                <Input id="sp-brand" name="brand" required defaultValue={editingStressPack?.brand} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dosageStrength">Dosage Strength</Label>
                <Select name="dosageStrength" defaultValue={editingStressPack?.dosageStrength || "single"}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select strength" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single</SelectItem>
                    <SelectItem value="double">Double</SelectItem>
                    <SelectItem value="triple">Triple</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="recommendedDurationDays">Recommended Duration (days) *</Label>
                <Input id="recommendedDurationDays" name="recommendedDurationDays" type="number" required defaultValue={editingStressPack?.recommendedDurationDays} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="costPerKg">Cost Per Kg (R)</Label>
                <Input id="costPerKg" name="costPerKg" placeholder="e.g., 450.00" defaultValue={editingStressPack?.costPerKg} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="activeIngredients">Active Ingredients</Label>
              <Textarea id="activeIngredients" name="activeIngredients" rows={2} defaultValue={editingStressPack?.activeIngredients} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sp-instructions">Instructions</Label>
              <Textarea id="sp-instructions" name="instructions" rows={3} defaultValue={editingStressPack?.instructions} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setStressPackDialogOpen(false); setEditingStressPack(null); }}>
                Cancel
              </Button>
              <Button type="submit" disabled={createStressPackMutation.isPending || updateStressPackMutation.isPending}>
                {editingStressPack ? "Update" : "Create"} Stress Pack
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this {itemToDelete?.type === 'vaccine' ? 'vaccine' : 'stress pack'}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteConfirmOpen(false); setItemToDelete(null); }}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteVaccineMutation.isPending || deleteStressPackMutation.isPending}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
