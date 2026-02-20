import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Activity, Eye, Edit, Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import { formatWeight, convertToKg } from "@/lib/weightUtils";

export default function Flocks() {
  const [, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingFlockId, setEditingFlockId] = useState<number | null>(null);
  const [copyMode, setCopyMode] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingFlockId, setDeletingFlockId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    flockNumber: "",
    houseId: "",
    placementDate: "",
    initialCount: "",
    targetSlaughterWeight: "1.70",
    targetDeliveredWeight: "",
    targetCatchingWeight: "",
    growingPeriod: "42",
    weightUnit: "kg" as "grams" | "kg",
    starterFeedType: "premium" as "premium" | "value" | "econo",
    starterToDay: "10",
    growerFeedType: "premium" as "premium" | "value" | "econo",
    growerFromDay: "11",
    growerToDay: "24",
    finisherFeedType: "premium" as "premium" | "value" | "econo",
    finisherFromDay: "25",
    notes: "",
    vaccinationProtocol: "standard" as "standard" | "premium" | "none",
    vaccinationSchedules: [] as Array<{ vaccineId: number; scheduledDay: number }>,
    stressPackSchedules: [] as Array<{ stressPackId: number; startDay: number; endDay: number; dosageStrength: "single" | "double" | "triple" }>,
    selectedTemplateIds: [] as number[],
  });

  const { data: flocks, isLoading: flocksLoading, refetch } = trpc.flocks.list.useQuery();
  const { data: houses } = trpc.houses.list.useQuery();
  const { data: vaccines } = trpc.health.listVaccines.useQuery();
  const { data: stressPacks } = trpc.health.listStressPacks.useQuery();
  const { data: reminderTemplates } = trpc.reminderTemplates.list.useQuery();
  const { data: protocolTemplates } = trpc.health.listProtocolTemplates.useQuery();
  
  // State for saving protocol template
  const [saveProtocolDialogOpen, setSaveProtocolDialogOpen] = useState(false);
  const [protocolTemplateName, setProtocolTemplateName] = useState("");
  const [protocolTemplateDescription, setProtocolTemplateDescription] = useState("");

  const utils = trpc.useUtils();

  const deleteFlock = trpc.flocks.delete.useMutation({
    onSuccess: () => {
      toast.success("Flock deleted successfully");
      setDeleteDialogOpen(false);
      setDeletingFlockId(null);
      utils.flocks.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete flock");
    },
  });

  const updateFlock = trpc.flocks.update.useMutation({
    onSuccess: () => {
      toast.success("Flock updated successfully");
      setDialogOpen(false);
      resetForm();
      setEditMode(false);
      setEditingFlockId(null);
      setCopyMode(false);
      utils.flocks.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update flock");
    },
  });

  const createFlock = trpc.flocks.create.useMutation({
    onSuccess: async (result) => {
      toast.success("Flock created successfully");
      setDialogOpen(false);
      refetch();
      resetForm();
    },
    onError: (error) => {
      toast.error(`Failed to create flock: ${error.message}`);
    },
  });

  const createProtocolTemplate = trpc.health.createProtocolTemplate.useMutation({
    onSuccess: () => {
      toast.success("Health protocol template saved successfully");
      setSaveProtocolDialogOpen(false);
      setProtocolTemplateName("");
      setProtocolTemplateDescription("");
      utils.health.listProtocolTemplates.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to save protocol template: ${error.message}`);
    },
  });

  const handleSaveProtocolTemplate = () => {
    if (!protocolTemplateName.trim()) {
      toast.error("Please enter a name for the protocol template");
      return;
    }
    if (formData.vaccinationSchedules.length === 0 && formData.stressPackSchedules.length === 0) {
      toast.error("Please add at least one vaccination or stress pack schedule");
      return;
    }
    createProtocolTemplate.mutate({
      name: protocolTemplateName,
      description: protocolTemplateDescription || undefined,
      vaccinationSchedules: formData.vaccinationSchedules,
      stressPackSchedules: formData.stressPackSchedules,
    });
  };

  const handleLoadProtocolTemplate = (templateId: number) => {
    const template = protocolTemplates?.find(t => t.id === templateId);
    if (!template) return;
    
    const vaccSchedules = (template.vaccinationSchedules as Array<{ vaccineId: number; scheduledDay: number }>) || [];
    const stressSchedules = (template.stressPackSchedules as Array<{ stressPackId: number; startDay: number; endDay: number; dosageStrength: "single" | "double" | "triple" }>) || [];
    
    setFormData({
      ...formData,
      vaccinationSchedules: vaccSchedules,
      stressPackSchedules: stressSchedules,
    });
    toast.success(`Loaded protocol: ${template.name}`);
  };

  const resetForm = () => {
    setFormData({
      flockNumber: "",
      houseId: "",
      placementDate: "",
      initialCount: "",
      targetSlaughterWeight: "1.70",
      targetDeliveredWeight: "",
      targetCatchingWeight: "",
      growingPeriod: "42",
      weightUnit: "kg",
      starterFeedType: "premium",
      starterToDay: "10",
      growerFeedType: "premium",
      growerFromDay: "11",
      growerToDay: "24",
      finisherFeedType: "premium",
      finisherFromDay: "25",
      notes: "",
      vaccinationProtocol: "standard",
      vaccinationSchedules: [],
      stressPackSchedules: [],
      selectedTemplateIds: [],
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const growingPeriod = parseInt(formData.growingPeriod);
    const finisherToDay = growingPeriod;
    
    if (editMode && editingFlockId) {
      // Update existing flock
      updateFlock.mutate({
        id: editingFlockId,
        flockNumber: formData.flockNumber,
        houseId: parseInt(formData.houseId),
        placementDate: new Date(formData.placementDate),
        initialCount: parseInt(formData.initialCount),
        targetSlaughterWeight: parseFloat(formData.targetSlaughterWeight),
        targetDeliveredWeight: formData.targetDeliveredWeight ? parseFloat(formData.targetDeliveredWeight) : undefined,
        targetCatchingWeight: formData.targetCatchingWeight ? parseFloat(formData.targetCatchingWeight) : undefined,
        growingPeriod,
        weightUnit: formData.weightUnit as "kg" | "lbs",
        starterFeedType: formData.starterFeedType,
        starterToDay: parseInt(formData.starterToDay),
        growerFeedType: formData.growerFeedType,
        growerFromDay: parseInt(formData.growerFromDay),
        growerToDay: parseInt(formData.growerToDay),
        finisherFeedType: formData.finisherFeedType,
        finisherFromDay: parseInt(formData.finisherFromDay),
        finisherToDay,
        notes: formData.notes || undefined,
        vaccinationProtocol: formData.vaccinationProtocol,
        vaccinationSchedules: formData.vaccinationSchedules,
        stressPackSchedules: formData.stressPackSchedules,
        selectedTemplateIds: formData.selectedTemplateIds,
      });
      return;
    }
    
    // Create new flock (or copy)
    createFlock.mutate({
      flockNumber: formData.flockNumber,
      houseId: parseInt(formData.houseId),
      placementDate: new Date(formData.placementDate),
      initialCount: parseInt(formData.initialCount),
      targetSlaughterWeight: parseFloat(formData.targetSlaughterWeight),
      targetDeliveredWeight: formData.targetDeliveredWeight ? parseFloat(formData.targetDeliveredWeight) : undefined,
      targetCatchingWeight: formData.targetCatchingWeight ? parseFloat(formData.targetCatchingWeight) : undefined,
      growingPeriod,
      weightUnit: formData.weightUnit,
      starterFeedType: formData.starterFeedType,
      starterFromDay: 0,
      starterToDay: parseInt(formData.starterToDay),
      growerFeedType: formData.growerFeedType,
      growerFromDay: parseInt(formData.growerFromDay),
      growerToDay: parseInt(formData.growerToDay),
      finisherFeedType: formData.finisherFeedType,
      finisherFromDay: parseInt(formData.finisherFromDay),
      finisherToDay,
      notes: formData.notes || undefined,
      vaccinationProtocol: formData.vaccinationProtocol,
      vaccinationSchedules: formData.vaccinationSchedules,
      stressPackSchedules: formData.stressPackSchedules,
      selectedTemplateIds: formData.selectedTemplateIds,
    });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline" | "warning" | "success"> = {
      planned: "outline",      // No color - neutral, waiting to start
      active: "warning",       // Amber/orange - in progress, requires attention
      completed: "success",    // Green - success, goal achieved
      cancelled: "destructive", // Red - terminated
    };
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("en-ZA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const calculateAge = (placementDate: Date | string) => {
    // Placement day = Day 0
    // Use UTC dates to ensure consistent calculation regardless of timezone
    const placed = new Date(placementDate);
    const now = new Date();
    // Get UTC date components only (year, month, day) to avoid timezone issues
    const placedUTC = Date.UTC(placed.getUTCFullYear(), placed.getUTCMonth(), placed.getUTCDate());
    const nowUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const diffDays = Math.floor((nowUTC - placedUTC) / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  if (flocksLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Flocks</h1>
          <p className="text-muted-foreground">Manage your broiler chicken flocks</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Flock
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>
                  {editMode ? "Edit Flock" : copyMode ? "Copy Flock" : "Add New Flock"}
                </DialogTitle>
                <DialogDescription>
                  {editMode ? "Update flock settings" : copyMode ? "Create a copy with modified settings" : "Create a new broiler flock"}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="flockNumber">Flock Number *</Label>
                    <Input
                      id="flockNumber"
                      value={formData.flockNumber}
                      onChange={(e) => setFormData({ ...formData, flockNumber: e.target.value })}
                      placeholder="FL-2024-001"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="houseId">House *</Label>
                    <Select
                      value={formData.houseId}
                      onValueChange={(value) => setFormData({ ...formData, houseId: value })}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select house" />
                      </SelectTrigger>
                      <SelectContent>
                        {houses?.map((house) => (
                          <SelectItem key={house.id} value={house.id.toString()}>
                            {house.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="placementDate">Placement Date *</Label>
                    <Input
                      id="placementDate"
                      type="date"
                      value={formData.placementDate}
                      onChange={(e) => setFormData({ ...formData, placementDate: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="initialCount">Initial Bird Count *</Label>
                    <Input
                      id="initialCount"
                      type="number"
                      value={formData.initialCount}
                      onChange={(e) => setFormData({ ...formData, initialCount: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="weightUnit">Weight Unit</Label>
                    <Select
                      value={formData.weightUnit}
                      onValueChange={(value: "grams" | "kg") => setFormData({ ...formData, weightUnit: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kg">Kilograms (kg)</SelectItem>
                        <SelectItem value="grams">Grams (g)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="growingPeriod">Growing Period (days)</Label>
                    <Input
                      id="growingPeriod"
                      type="number"
                      value={formData.growingPeriod}
                      onChange={(e) => setFormData({ ...formData, growingPeriod: e.target.value })}
                    />
                  </div>
                </div>

                {/* Target Weight with Shrinkage Compensation */}
                <div className="border-t pt-4 mt-2">
                  <h4 className="font-medium mb-2">Target Weight Planning</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Account for shrinkage (feed withdrawal, stress, transport) to ensure delivered weight meets contract requirements.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="targetDeliveredWeight">Target Delivered Weight (kg)</Label>
                      <Input
                        id="targetDeliveredWeight"
                        type="number"
                        step="0.001"
                        placeholder="e.g., 2.500"
                        value={formData.targetDeliveredWeight}
                        onChange={(e) => {
                          const delivered = parseFloat(e.target.value) || 0;
                          const catching = delivered / 0.945; // 5.5% shrinkage
                          setFormData({ 
                            ...formData, 
                            targetDeliveredWeight: e.target.value,
                            targetCatchingWeight: catching > 0 ? catching.toFixed(3) : ""
                          });
                        }}
                      />
                      <p className="text-xs text-muted-foreground">Weight at processor after shrinkage</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="targetCatchingWeight">Target Catching Weight (kg)</Label>
                      <Input
                        id="targetCatchingWeight"
                        type="number"
                        step="0.001"
                        value={formData.targetCatchingWeight}
                        disabled
                        className="bg-muted"
                      />
                      <p className="text-xs text-muted-foreground">
                        Auto-calculated with 5.5% shrinkage buffer
                      </p>
                    </div>
                  </div>
                  {formData.targetDeliveredWeight && (
                    <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-950 rounded text-sm">
                      <span className="font-medium">Shrinkage Buffer:</span> +
                      {formatWeight(parseFloat(formData.targetCatchingWeight) - parseFloat(formData.targetDeliveredWeight), formData.weightUnit)}
                      (accounts for feed withdrawal, catching stress, and transport loss)
                    </div>
                  )}
                </div>

                {/* Feed Planning Section */}
                <div className="border-t pt-4 mt-2">
                  <h4 className="font-medium mb-3">Feed Planning</h4>
                  
                  <div className="space-y-3">
                    {/* Starter Feed */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Starter Feed Type</Label>
                        <Select
                          value={formData.starterFeedType}
                          onValueChange={(value: "premium" | "value" | "econo") => 
                            setFormData({ ...formData, starterFeedType: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="premium">Premium</SelectItem>
                            <SelectItem value="value">Value</SelectItem>
                            <SelectItem value="econo">Econo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>From Day</Label>
                        <Input value="0" disabled />
                      </div>
                      <div className="space-y-2">
                        <Label>To Day</Label>
                        <Input
                          type="number"
                          value={formData.starterToDay}
                          onChange={(e) => {
                            const toDay = parseInt(e.target.value);
                            setFormData({ 
                              ...formData, 
                              starterToDay: e.target.value,
                              growerFromDay: (toDay + 1).toString()
                            });
                          }}
                        />
                      </div>
                    </div>

                    {/* Grower Feed */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Grower Feed Type</Label>
                        <Select
                          value={formData.growerFeedType}
                          onValueChange={(value: "premium" | "value" | "econo") => 
                            setFormData({ ...formData, growerFeedType: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="premium">Premium</SelectItem>
                            <SelectItem value="value">Value</SelectItem>
                            <SelectItem value="econo">Econo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>From Day</Label>
                        <Input value={formData.growerFromDay} disabled />
                      </div>
                      <div className="space-y-2">
                        <Label>To Day</Label>
                        <Input
                          type="number"
                          value={formData.growerToDay}
                          onChange={(e) => {
                            const toDay = parseInt(e.target.value);
                            setFormData({ 
                              ...formData, 
                              growerToDay: e.target.value,
                              finisherFromDay: (toDay + 1).toString()
                            });
                          }}
                        />
                      </div>
                    </div>

                    {/* Finisher Feed */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Finisher Feed Type</Label>
                        <Select
                          value={formData.finisherFeedType}
                          onValueChange={(value: "premium" | "value" | "econo") => 
                            setFormData({ ...formData, finisherFeedType: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="premium">Premium</SelectItem>
                            <SelectItem value="value">Value</SelectItem>
                            <SelectItem value="econo">Econo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>From Day</Label>
                        <Input value={formData.finisherFromDay} disabled />
                      </div>
                      <div className="space-y-2">
                        <Label>To Day</Label>
                        <Input value={formData.growingPeriod} disabled />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Health Management Section */}
                <div className="border-t pt-4 mt-2">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium">Health Management</h4>
                    <div className="flex gap-2">
                      {protocolTemplates && protocolTemplates.length > 0 && (
                        <Select onValueChange={(value) => handleLoadProtocolTemplate(parseInt(value))}>
                          <SelectTrigger className="w-[180px] h-8 text-xs">
                            <SelectValue placeholder="Load Protocol..." />
                          </SelectTrigger>
                          <SelectContent>
                            {protocolTemplates.map((template) => (
                              <SelectItem key={template.id} value={template.id.toString()}>
                                {template.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => setSaveProtocolDialogOpen(true)}
                        disabled={formData.vaccinationSchedules.length === 0 && formData.stressPackSchedules.length === 0}
                      >
                        Save as Template
                      </Button>
                    </div>
                  </div>
                  
                  {/* Vaccination Schedule */}
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Vaccination Schedule</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (!vaccines || vaccines.length === 0) {
                              toast.error("No vaccines available. Please add vaccines in Health Management first.");
                              return;
                            }
                            setFormData({
                              ...formData,
                              vaccinationSchedules: [
                                ...formData.vaccinationSchedules,
                                { vaccineId: vaccines[0].id, scheduledDay: 1 }
                              ]
                            });
                          }}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add Vaccine
                        </Button>
                      </div>
                      
                      {(!vaccines || vaccines.length === 0) ? (
                        <p className="text-xs text-muted-foreground">
                          No vaccines configured. <a href="/health" className="text-primary underline">Add vaccines in Health Management</a> first.
                        </p>
                      ) : formData.vaccinationSchedules.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No vaccines scheduled. Click "Add Vaccine" to schedule vaccinations.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {formData.vaccinationSchedules.map((schedule, index) => (
                            <div key={index} className="grid grid-cols-12 gap-2 items-end p-2 border rounded">
                              <div className="col-span-6 space-y-1">
                                <Label className="text-xs">Vaccine</Label>
                                <Select
                                  value={schedule.vaccineId.toString()}
                                  onValueChange={(value) => {
                                    const updated = [...formData.vaccinationSchedules];
                                    updated[index].vaccineId = parseInt(value);
                                    setFormData({ ...formData, vaccinationSchedules: updated });
                                  }}
                                >
                                  <SelectTrigger className="h-8">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {vaccines?.map((vaccine) => (
                                      <SelectItem key={vaccine.id} value={vaccine.id.toString()}>
                                        {vaccine.name} ({vaccine.diseaseType.replace(/_/g, ' ')})
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="col-span-4 space-y-1">
                                <Label className="text-xs">Day</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  className="h-8"
                                  value={schedule.scheduledDay}
                                  onChange={(e) => {
                                    const updated = [...formData.vaccinationSchedules];
                                    updated[index].scheduledDay = parseInt(e.target.value) || 0;
                                    setFormData({ ...formData, vaccinationSchedules: updated });
                                  }}
                                />
                              </div>
                              <div className="col-span-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-full text-destructive hover:text-destructive"
                                  onClick={() => {
                                    setFormData({
                                      ...formData,
                                      vaccinationSchedules: formData.vaccinationSchedules.filter((_, i) => i !== index)
                                    });
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {/* Quick Protocol Buttons */}
                      <div className="flex gap-2 pt-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => {
                            // Apply standard protocol from available vaccines
                            if (!vaccines || vaccines.length === 0) {
                              toast.error("No vaccines available");
                              return;
                            }
                            const ndVaccine = vaccines.find(v => v.diseaseType === 'newcastle_disease');
                            const ibVaccine = vaccines.find(v => v.diseaseType === 'infectious_bronchitis');
                            const gumboroVaccine = vaccines.find(v => v.diseaseType === 'gumboro');
                            
                            const schedules: Array<{ vaccineId: number; scheduledDay: number }> = [];
                            if (ndVaccine) {
                              schedules.push({ vaccineId: ndVaccine.id, scheduledDay: 1 });
                              schedules.push({ vaccineId: ndVaccine.id, scheduledDay: 7 });
                              schedules.push({ vaccineId: ndVaccine.id, scheduledDay: 21 });
                            }
                            if (ibVaccine) {
                              schedules.push({ vaccineId: ibVaccine.id, scheduledDay: 1 });
                              schedules.push({ vaccineId: ibVaccine.id, scheduledDay: 14 });
                            }
                            if (gumboroVaccine) {
                              schedules.push({ vaccineId: gumboroVaccine.id, scheduledDay: 14 });
                              schedules.push({ vaccineId: gumboroVaccine.id, scheduledDay: 28 });
                            }
                            
                            if (schedules.length === 0) {
                              toast.error("No matching vaccines found for standard protocol. Please add ND, IB, and Gumboro vaccines.");
                              return;
                            }
                            
                            setFormData({ ...formData, vaccinationSchedules: schedules });
                            toast.success(`Applied standard protocol with ${schedules.length} vaccinations`);
                          }}
                        >
                          Apply Standard Protocol
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          onClick={() => setFormData({ ...formData, vaccinationSchedules: [] })}
                        >
                          Clear All
                        </Button>
                      </div>
                    </div>

                    {/* Stress Pack Scheduling */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Stress Pack Schedule</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setFormData({
                              ...formData,
                              stressPackSchedules: [
                                ...formData.stressPackSchedules,
                                { stressPackId: stressPacks?.[0]?.id || 1, startDay: 0, endDay: 3, dosageStrength: "single" }
                              ]
                            });
                          }}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add Stress Pack Period
                        </Button>
                      </div>
                      
                      {formData.stressPackSchedules.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No stress pack schedule. Click "Add Stress Pack Period" to add.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {formData.stressPackSchedules.map((schedule, index) => (
                            <div key={index} className="grid grid-cols-5 gap-2 items-end p-2 border rounded">
                              <div className="col-span-2 space-y-1">
                                <Label className="text-xs">Stress Pack</Label>
                                <Select
                                  value={schedule.stressPackId.toString()}
                                  onValueChange={(value) => {
                                    const updated = [...formData.stressPackSchedules];
                                    updated[index].stressPackId = parseInt(value);
                                    setFormData({ ...formData, stressPackSchedules: updated });
                                  }}
                                >
                                  <SelectTrigger className="h-8">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {stressPacks?.map((pack) => (
                                      <SelectItem key={pack.id} value={pack.id.toString()}>
                                        {pack.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Start Day</Label>
                                <Input
                                  type="number"
                                  className="h-8"
                                  value={schedule.startDay}
                                  onChange={(e) => {
                                    const updated = [...formData.stressPackSchedules];
                                    updated[index].startDay = parseInt(e.target.value);
                                    setFormData({ ...formData, stressPackSchedules: updated });
                                  }}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">End Day</Label>
                                <Input
                                  type="number"
                                  className="h-8"
                                  value={schedule.endDay}
                                  onChange={(e) => {
                                    const updated = [...formData.stressPackSchedules];
                                    updated[index].endDay = parseInt(e.target.value);
                                    setFormData({ ...formData, stressPackSchedules: updated });
                                  }}
                                />
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8"
                                onClick={() => {
                                  const updated = formData.stressPackSchedules.filter((_, i) => i !== index);
                                  setFormData({ ...formData, stressPackSchedules: updated });
                                }}
                              >
                                Remove
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Reminder Templates */}
                    <div className="space-y-2 mt-4">
                      <Label>Reminder Templates</Label>
                      <p className="text-xs text-muted-foreground mb-2">
                        Select reminder templates to apply to this flock. Reminders will be created based on the placement date.
                      </p>
                      {reminderTemplates && reminderTemplates.length > 0 ? (
                        <div className="space-y-2 max-h-48 overflow-y-auto border rounded p-2">
                          {reminderTemplates.map((template) => (
                            <div key={template.id} className="flex items-start space-x-2">
                              <Checkbox
                                id={`template-${template.id}`}
                                checked={formData.selectedTemplateIds.includes(template.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setFormData({
                                      ...formData,
                                      selectedTemplateIds: [...formData.selectedTemplateIds, template.id]
                                    });
                                  } else {
                                    setFormData({
                                      ...formData,
                                      selectedTemplateIds: formData.selectedTemplateIds.filter(id => id !== template.id)
                                    });
                                  }
                                }}
                              />
                              <label htmlFor={`template-${template.id}`} className="text-sm flex-1 cursor-pointer">
                                <span className="font-medium">{template.name}</span>
                                {template.description && (
                                  <span className="text-muted-foreground ml-2">- {template.description}</span>
                                )}
                                <span className="text-xs text-muted-foreground block mt-0.5">
                                  Day {template.dayOffset} • {template.priority} priority
                                </span>
                              </label>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          No reminder templates available. Create templates in Reminder Templates page.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createFlock.isPending || updateFlock.isPending}>
                  {editMode 
                    ? (updateFlock.isPending ? "Updating..." : "Update Flock")
                    : (createFlock.isPending ? "Creating..." : "Create Flock")
                  }
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {flocks && flocks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Activity className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No flocks found</h3>
            <p className="text-muted-foreground mb-4">Get started by creating your first flock</p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Flock
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>All Flocks</CardTitle>
            <CardDescription>View and manage your broiler flocks</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Flock Number</TableHead>
                  <TableHead>House</TableHead>
                  <TableHead>Placement Date</TableHead>
                  <TableHead>Age (days)</TableHead>
                  <TableHead>Bird Count</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flocks?.map((flock) => {
                  const house = houses?.find((h) => h.id === flock.houseId);
                  return (
                    <TableRow key={flock.id}>
                      <TableCell className="font-medium">{flock.flockNumber}</TableCell>
                      <TableCell>{house?.name || "Unknown"}</TableCell>
                      <TableCell>{formatDate(flock.placementDate)}</TableCell>
                      <TableCell>{calculateAge(flock.placementDate)}</TableCell>
                      <TableCell>{flock.currentCount.toLocaleString()}</TableCell>
                      <TableCell>{getStatusBadge(flock.status)}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setLocation(`/flocks/${flock.id}`)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            try {
                              setEditMode(true);
                              setEditingFlockId(flock.id);
                              setCopyMode(false);
                              
                              // Load existing health schedules with error handling
                              let vacSchedules: any[] = [];
                              let spSchedules: any[] = [];
                              
                              try {
                                vacSchedules = await utils.flocks.getVaccinationSchedules.fetch({ flockId: flock.id });
                              } catch (error) {
                                console.error("Failed to load vaccination schedules:", error);
                                toast.error("Warning: Could not load vaccination schedules");
                              }
                              
                              try {
                                spSchedules = await utils.flocks.getStressPackSchedules.fetch({ flockId: flock.id });
                              } catch (error) {
                                console.error("Failed to load stress pack schedules:", error);
                                toast.error("Warning: Could not load stress pack schedules");
                              }
                              
                              // Determine vaccination protocol from schedules
                              let vacProtocol: "standard" | "premium" | "none" = "none";
                              if (vacSchedules.length > 0) {
                                // Check if it's standard (3 vaccines) or premium (more vaccines)
                                vacProtocol = vacSchedules.length <= 3 ? "standard" : "premium";
                              }
                              
                              // Map stress pack schedules to form format
                              const spSchedulesForForm = spSchedules.map((sp: any) => ({
                                stressPackId: sp.stressPackId,
                                startDay: sp.startDay,
                                endDay: sp.endDay,
                                dosageStrength: sp.dosageStrength as "single" | "double" | "triple",
                              }));
                              
                              // Load flock data into form
                              // Convert vaccination schedules to form format
                              const vacSchedulesForForm = vacSchedules.map((vs: any) => ({
                                vaccineId: vs.vaccineId,
                                scheduledDay: vs.scheduledDay,
                              }));
                              
                              setFormData({
                                flockNumber: flock.flockNumber,
                                houseId: flock.houseId.toString(),
                                placementDate: new Date(flock.placementDate).toISOString().split('T')[0],
                                initialCount: flock.initialCount.toString(),
                                targetSlaughterWeight: flock.targetSlaughterWeight || "1.70",
                                targetDeliveredWeight: flock.targetDeliveredWeight?.toString() || "",
                                targetCatchingWeight: flock.targetCatchingWeight?.toString() || "",
                                growingPeriod: flock.growingPeriod?.toString() || "42",
                                weightUnit: flock.weightUnit || "kg",
                                starterFeedType: flock.starterFeedType || "premium",
                                starterToDay: flock.starterToDay?.toString() || "10",
                                growerFeedType: flock.growerFeedType || "premium",
                                growerFromDay: flock.growerFromDay?.toString() || "11",
                                growerToDay: flock.growerToDay?.toString() || "24",
                                finisherFeedType: flock.finisherFeedType || "premium",
                                finisherFromDay: flock.finisherFromDay?.toString() || "25",
                                notes: flock.notes || "",
                                vaccinationProtocol: vacProtocol,
                                vaccinationSchedules: vacSchedulesForForm,
                                stressPackSchedules: spSchedulesForForm,
                                selectedTemplateIds: [],
                              });
                              setDialogOpen(true);
                            } catch (error) {
                              console.error("Failed to open edit dialog:", error);
                              toast.error("Failed to open edit form. Please try again.");
                            }
                          }}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setCopyMode(true);
                            setEditMode(false);
                            setEditingFlockId(null);
                            // Load flock data with new number
                            setFormData({
                              flockNumber: `${flock.flockNumber}-COPY`,
                              houseId: flock.houseId.toString(),
                              placementDate: "",
                              initialCount: flock.initialCount.toString(),
                              targetSlaughterWeight: flock.targetSlaughterWeight || "1.70",
                              targetDeliveredWeight: flock.targetDeliveredWeight?.toString() || "",
                              targetCatchingWeight: flock.targetCatchingWeight?.toString() || "",
                              growingPeriod: flock.growingPeriod?.toString() || "42",
                              weightUnit: flock.weightUnit || "kg",
                              starterFeedType: flock.starterFeedType || "premium",
                              starterToDay: flock.starterToDay?.toString() || "10",
                              growerFeedType: flock.growerFeedType || "premium",
                              growerFromDay: flock.growerFromDay?.toString() || "11",
                              growerToDay: flock.growerToDay?.toString() || "24",
                              finisherFeedType: flock.finisherFeedType || "premium",
                              finisherFromDay: flock.finisherFromDay?.toString() || "25",
                              notes: flock.notes || "",
                              vaccinationProtocol: "standard",
                              vaccinationSchedules: [],
                              stressPackSchedules: [],
                              selectedTemplateIds: [],
                            });
                            setDialogOpen(true);
                          }}
                        >
                          <Copy className="h-4 w-4 mr-1" />
                          Copy
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setDeletingFlockId(flock.id);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-1 text-destructive" />
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Flock</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this flock? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setDeletingFlockId(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteFlock.isPending}
              onClick={() => {
                if (deletingFlockId) {
                  deleteFlock.mutate({ id: deletingFlockId });
                }
              }}
            >
              {deleteFlock.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save Protocol Template Dialog */}
      <Dialog open={saveProtocolDialogOpen} onOpenChange={setSaveProtocolDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Health Protocol Template</DialogTitle>
            <DialogDescription>
              Save the current vaccination and stress pack schedule as a reusable template.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="protocolName">Template Name *</Label>
              <Input
                id="protocolName"
                placeholder="e.g., Standard Broiler Protocol"
                value={protocolTemplateName}
                onChange={(e) => setProtocolTemplateName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="protocolDescription">Description</Label>
              <Textarea
                id="protocolDescription"
                placeholder="Optional description of this protocol..."
                value={protocolTemplateDescription}
                onChange={(e) => setProtocolTemplateDescription(e.target.value)}
              />
            </div>
            <div className="text-sm text-muted-foreground">
              <p className="font-medium mb-1">This template will include:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>{formData.vaccinationSchedules.length} vaccination(s)</li>
                <li>{formData.stressPackSchedules.length} stress pack period(s)</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSaveProtocolDialogOpen(false);
                setProtocolTemplateName("");
                setProtocolTemplateDescription("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={createProtocolTemplate.isPending || !protocolTemplateName.trim()}
              onClick={handleSaveProtocolTemplate}
            >
              {createProtocolTemplate.isPending ? "Saving..." : "Save Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
