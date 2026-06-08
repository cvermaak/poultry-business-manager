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
import { Syringe, Droplets, Plus, Edit, Trash2, Info, FileText, Copy, Star } from "lucide-react";
import { toast } from "sonner";

export default function HealthManagement() {
  const [selectedTab, setSelectedTab] = useState("vaccines");
  const [vaccineDialogOpen, setVaccineDialogOpen] = useState(false);
  const [stressPackDialogOpen, setStressPackDialogOpen] = useState(false);
  const [protocolDialogOpen, setProtocolDialogOpen] = useState(false);
  const [editingVaccine, setEditingVaccine] = useState<any>(null);
  const [editingStressPack, setEditingStressPack] = useState<any>(null);
  const [editingProtocol, setEditingProtocol] = useState<any>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ type: 'vaccine' | 'stressPack' | 'protocol', id: number } | null>(null);

  // Protocol form state
  const [protocolName, setProtocolName] = useState("");
  const [protocolDescription, setProtocolDescription] = useState("");
  const [protocolVaccinations, setProtocolVaccinations] = useState<Array<{ vaccineId: number; scheduledDay: number }>>([]);
  const [protocolStressPacks, setProtocolStressPacks] = useState<Array<{ stressPackId: number; startDay: number; endDay: number; dosageStrength: 'single' | 'double' | 'triple' }>>([]);

  const utils = trpc.useUtils();
  const { data: vaccines, isLoading: vaccinesLoading } = trpc.health.listVaccines.useQuery();
  const { data: stressPacks, isLoading: stressPacksLoading } = trpc.health.listStressPacks.useQuery();
  const { data: protocolTemplates, isLoading: protocolsLoading } = trpc.health.listProtocolTemplates.useQuery();

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

  const createProtocolMutation = trpc.health.createProtocolTemplate.useMutation({
    onSuccess: () => {
      utils.health.listProtocolTemplates.invalidate();
      setProtocolDialogOpen(false);
      resetProtocolForm();
      toast.success("Protocol template created successfully");
    },
    onError: (error) => toast.error(error.message),
  });

  const updateProtocolMutation = trpc.health.updateProtocolTemplate.useMutation({
    onSuccess: () => {
      utils.health.listProtocolTemplates.invalidate();
      setProtocolDialogOpen(false);
      resetProtocolForm();
      toast.success("Protocol template updated successfully");
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteProtocolMutation = trpc.health.deleteProtocolTemplate.useMutation({
    onSuccess: () => {
      utils.health.listProtocolTemplates.invalidate();
      setDeleteConfirmOpen(false);
      setItemToDelete(null);
      toast.success("Protocol template deleted successfully");
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

  const handleProtocolSubmit = () => {
    if (!protocolName.trim()) {
      toast.error("Protocol name is required");
      return;
    }

    if (protocolVaccinations.length === 0 && protocolStressPacks.length === 0) {
      toast.error("Protocol must have at least one vaccination or stress pack schedule");
      return;
    }

    const data = {
      name: protocolName,
      description: protocolDescription || undefined,
      vaccinationSchedules: protocolVaccinations,
      stressPackSchedules: protocolStressPacks,
    };

    if (editingProtocol) {
      updateProtocolMutation.mutate({ id: editingProtocol.id, ...data });
    } else {
      createProtocolMutation.mutate(data);
    }
  };

  const handleDelete = () => {
    if (!itemToDelete) return;
    if (itemToDelete.type === 'vaccine') {
      deleteVaccineMutation.mutate({ id: itemToDelete.id });
    } else if (itemToDelete.type === 'stressPack') {
      deleteStressPackMutation.mutate({ id: itemToDelete.id });
    } else if (itemToDelete.type === 'protocol') {
      deleteProtocolMutation.mutate({ id: itemToDelete.id });
    }
  };

  const resetProtocolForm = () => {
    setProtocolName("");
    setProtocolDescription("");
    setProtocolVaccinations([]);
    setProtocolStressPacks([]);
    setEditingProtocol(null);
  };

  const openProtocolDialog = (protocol?: any) => {
    if (protocol) {
      setEditingProtocol(protocol);
      setProtocolName(protocol.name);
      setProtocolDescription(protocol.description || "");
      setProtocolVaccinations(protocol.vaccinationSchedules || []);
      setProtocolStressPacks(protocol.stressPackSchedules || []);
    } else {
      resetProtocolForm();
    }
    setProtocolDialogOpen(true);
  };

  const handleDuplicateProtocol = (protocol: any) => {
    setEditingProtocol(null);
    setProtocolName(protocol.name + " (Copy)");
    setProtocolDescription(protocol.description || "");
    setProtocolVaccinations(protocol.vaccinationSchedules || []);
    setProtocolStressPacks(protocol.stressPackSchedules || []);
    setProtocolDialogOpen(true);
  };

  const addVaccinationSchedule = () => {
    setProtocolVaccinations([...protocolVaccinations, { vaccineId: 0, scheduledDay: 0 }]);
  };

  const removeVaccinationSchedule = (index: number) => {
    setProtocolVaccinations(protocolVaccinations.filter((_, i) => i !== index));
  };

  const updateVaccinationSchedule = (index: number, field: 'vaccineId' | 'scheduledDay', value: number) => {
    const updated = [...protocolVaccinations];
    updated[index] = { ...updated[index], [field]: value };
    setProtocolVaccinations(updated);
  };

  const addStressPackSchedule = () => {
    setProtocolStressPacks([...protocolStressPacks, { stressPackId: 0, startDay: 0, endDay: 0, dosageStrength: "single" }]);
  };

  const removeStressPackSchedule = (index: number) => {
    setProtocolStressPacks(protocolStressPacks.filter((_, i) => i !== index));
  };

  const updateStressPackSchedule = (index: number, field: 'stressPackId' | 'startDay' | 'endDay' | 'dosageStrength', value: number | 'single' | 'double' | 'triple') => {
    const updated = [...protocolStressPacks];
    updated[index] = { ...updated[index], [field]: value };
    setProtocolStressPacks(updated);
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

  const getVaccineName = (vaccineId: number) => {
    const vaccine = vaccines?.find(v => v.id === vaccineId);
    return vaccine ? `${vaccine.name} (${vaccine.diseaseType})` : "Unknown Vaccine";
  };

  const getStressPackName = (stressPackId: number) => {
    const stressPack = stressPacks?.find(sp => sp.id === stressPackId);
    return stressPack ? stressPack.name : "Unknown Stress Pack";
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Health Management</h1>
        <p className="text-muted-foreground">Vaccine library, stress packs, and health protocols</p>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full max-w-2xl grid-cols-3">
          <TabsTrigger value="vaccines">
            <Syringe className="w-4 h-4 mr-2" />
            Vaccines
          </TabsTrigger>
          <TabsTrigger value="stress-packs">
            <Droplets className="w-4 h-4 mr-2" />
            Stress Packs
          </TabsTrigger>
          <TabsTrigger value="protocols">
            <FileText className="w-4 h-4 mr-2" />
            Protocol Templates
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
              {stressPacks.map((stressPack) => (
                <Card key={stressPack.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{stressPack.name}</CardTitle>
                        <CardDescription>{stressPack.brand}</CardDescription>
                      </div>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => { setEditingStressPack(stressPack); setStressPackDialogOpen(true); }}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => { setItemToDelete({ type: 'stressPack', id: stressPack.id }); setDeleteConfirmOpen(true); }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {stressPack.dosageStrength && <Badge variant="secondary">{stressPack.dosageStrength}</Badge>}
                    </div>
                    <div className="text-sm">
                      <p><strong>Duration:</strong> {stressPack.recommendedDurationDays} days</p>
                      {stressPack.costPerKg && <p><strong>Cost:</strong> R{stressPack.costPerKg}/kg</p>}
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

        <TabsContent value="protocols" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {protocolTemplates?.length || 0} protocol templates available
            </p>
            <Button onClick={() => openProtocolDialog()}>
              <Plus className="w-4 h-4 mr-2" />
              Create Protocol Template
            </Button>
          </div>

          {protocolsLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading protocol templates...</div>
          ) : protocolTemplates && protocolTemplates.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {protocolTemplates.map((protocol) => (
                <Card key={protocol.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{protocol.name}</CardTitle>
                        <CardDescription className="line-clamp-2">{protocol.description || "No description"}</CardDescription>
                      </div>
                      {protocol.isDefault && (
                        <Badge variant="default" className="ml-2">
                          <Star className="w-3 h-3 mr-1" />
                          Default
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">
                        <Syringe className="w-3 h-3 mr-1" />
                        {(protocol.vaccinationSchedules as any[])?.length || 0} vaccines
                      </Badge>
                      <Badge variant="secondary">
                        <Droplets className="w-3 h-3 mr-1" />
                        {(protocol.stressPackSchedules as any[])?.length || 0} stress packs
                      </Badge>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => openProtocolDialog(protocol)}>
                        <Edit className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDuplicateProtocol(protocol)}>
                        <Copy className="w-3 h-3 mr-1" />
                        Duplicate
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setItemToDelete({ type: 'protocol', id: protocol.id }); setDeleteConfirmOpen(true); }}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No protocol templates found. Click "Create Protocol Template" to create one.
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
                    <SelectItem value="newcastle_disease">Newcastle Disease (ND)</SelectItem>
                    <SelectItem value="infectious_bronchitis">Infectious Bronchitis (IB)</SelectItem>
                    <SelectItem value="gumboro">Gumboro (IBD)</SelectItem>
                    <SelectItem value="mareks">Marek's Disease</SelectItem>
                    <SelectItem value="fowl_pox">Fowl Pox</SelectItem>
                    <SelectItem value="coccidiosis">Coccidiosis</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="vaccineType">Vaccine Type *</Label>
                <Select name="vaccineType" required defaultValue={editingVaccine?.vaccineType || "live"}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="live">Live</SelectItem>
                    <SelectItem value="inactivated">Inactivated</SelectItem>
                    <SelectItem value="recombinant">Recombinant</SelectItem>
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
                    <SelectItem value="injection">Injection (SC/IM)</SelectItem>
                    <SelectItem value="wing_web">Wing-Web Stab</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dosagePerBird">Dosage Per Bird</Label>
                <Input id="dosagePerBird" name="dosagePerBird" placeholder="e.g., 1 dose" defaultValue={editingVaccine?.dosagePerBird} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="boosterIntervalDays">Booster Interval (days)</Label>
                <Input id="boosterIntervalDays" name="boosterIntervalDays" type="number" placeholder="e.g., 21" defaultValue={editingVaccine?.boosterIntervalDays} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="withdrawalPeriodDays">Withdrawal Period (days)</Label>
                <Input id="withdrawalPeriodDays" name="withdrawalPeriodDays" type="number" placeholder="e.g., 0" defaultValue={editingVaccine?.withdrawalPeriodDays} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="storageTemperature">Storage Temperature</Label>
                <Input id="storageTemperature" name="storageTemperature" placeholder="e.g., 2-8°C" defaultValue={editingVaccine?.storageTemperature} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shelfLifeDays">Shelf Life (days)</Label>
                <Input id="shelfLifeDays" name="shelfLifeDays" type="number" placeholder="e.g., 365" defaultValue={editingVaccine?.shelfLifeDays} />
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

      {/* Protocol Template Form Dialog */}
      <Dialog open={protocolDialogOpen} onOpenChange={setProtocolDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProtocol ? "Edit Protocol Template" : "Create New Protocol Template"}</DialogTitle>
            <DialogDescription>
              {editingProtocol ? "Update protocol template information" : "Create a reusable health protocol with vaccination and stress pack schedules"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="protocol-name">Protocol Name *</Label>
                <Input 
                  id="protocol-name" 
                  value={protocolName} 
                  onChange={(e) => setProtocolName(e.target.value)} 
                  placeholder="e.g., Standard Broiler Protocol"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="protocol-description">Description</Label>
                <Textarea 
                  id="protocol-description" 
                  value={protocolDescription} 
                  onChange={(e) => setProtocolDescription(e.target.value)} 
                  rows={2}
                  placeholder="Describe this protocol..."
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base">Vaccination Schedule</Label>
                <Button type="button" size="sm" variant="outline" onClick={addVaccinationSchedule}>
                  <Plus className="w-3 h-3 mr-1" />
                  Add Vaccine
                </Button>
              </div>
              {protocolVaccinations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No vaccines added yet</p>
              ) : (
                <div className="space-y-2">
                  {protocolVaccinations.map((vac, index) => (
                    <div key={index} className="flex gap-2 items-end">
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs">Vaccine</Label>
                        <Select 
                          value={vac.vaccineId.toString()} 
                          onValueChange={(value) => updateVaccinationSchedule(index, 'vaccineId', parseInt(value))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select vaccine" />
                          </SelectTrigger>
                          <SelectContent>
                            {vaccines?.map((vaccine) => (
                              <SelectItem key={vaccine.id} value={vaccine.id.toString()}>
                                {vaccine.name} ({vaccine.diseaseType})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-32 space-y-1">
                        <Label className="text-xs">Day</Label>
                        <Input 
                          type="number" 
                          value={vac.scheduledDay} 
                          onChange={(e) => updateVaccinationSchedule(index, 'scheduledDay', parseInt(e.target.value))}
                          placeholder="Day"
                        />
                      </div>
                      <Button type="button" size="icon" variant="ghost" onClick={() => removeVaccinationSchedule(index)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base">Stress Pack Schedule</Label>
                <Button type="button" size="sm" variant="outline" onClick={addStressPackSchedule}>
                  <Plus className="w-3 h-3 mr-1" />
                  Add Stress Pack
                </Button>
              </div>
              {protocolStressPacks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No stress packs added yet</p>
              ) : (
                <div className="space-y-2">
                  {protocolStressPacks.map((sp, index) => (
                    <div key={index} className="flex gap-2 items-end">
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs">Stress Pack</Label>
                        <Select 
                          value={sp.stressPackId.toString()} 
                          onValueChange={(value) => updateStressPackSchedule(index, 'stressPackId', parseInt(value))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select stress pack" />
                          </SelectTrigger>
                          <SelectContent>
                            {stressPacks?.map((stressPack) => (
                              <SelectItem key={stressPack.id} value={stressPack.id.toString()}>
                                {stressPack.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-24 space-y-1">
                        <Label className="text-xs">Start Day</Label>
                        <Input 
                          type="number" 
                          value={sp.startDay} 
                          onChange={(e) => updateStressPackSchedule(index, 'startDay', parseInt(e.target.value))}
                          placeholder="Start"
                        />
                      </div>
                      <div className="w-24 space-y-1">
                        <Label className="text-xs">End Day</Label>
                        <Input 
                          type="number" 
                          value={sp.endDay} 
                          onChange={(e) => updateStressPackSchedule(index, 'endDay', parseInt(e.target.value))}
                          placeholder="End"
                        />
                      </div>
                      <div className="w-32 space-y-1">
                        <Label className="text-xs">Dosage</Label>
                        <Select 
                          value={sp.dosageStrength} 
                          onValueChange={(value) => updateStressPackSchedule(index, 'dosageStrength', value as 'single' | 'double' | 'triple')}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="single">Single</SelectItem>
                            <SelectItem value="double">Double</SelectItem>
                            <SelectItem value="triple">Triple</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button type="button" size="icon" variant="ghost" onClick={() => removeStressPackSchedule(index)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setProtocolDialogOpen(false); resetProtocolForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleProtocolSubmit} disabled={createProtocolMutation.isPending || updateProtocolMutation.isPending}>
              {editingProtocol ? "Update" : "Create"} Protocol
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this {itemToDelete?.type === 'vaccine' ? 'vaccine' : itemToDelete?.type === 'stressPack' ? 'stress pack' : 'protocol template'}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteConfirmOpen(false); setItemToDelete(null); }}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteVaccineMutation.isPending || deleteStressPackMutation.isPending || deleteProtocolMutation.isPending}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
