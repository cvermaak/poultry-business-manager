import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Edit, Trash2, TrendingUp, TrendingDown, DollarSign, BarChart3, Activity } from "lucide-react";
import { HarvestPerformanceChart } from "@/components/HarvestPerformanceChart";
import { ShrinkageAnalysisDashboard } from "@/components/ShrinkageAnalysisDashboard";
import { HarvestHistoryComparison } from "@/components/HarvestHistoryComparison";
import { toast } from "sonner";


interface HarvestFormData {
  id?: number;
  flockId: number;
  harvestDate: string;
  harvestStartTime: string;
  harvestDurationMinutes?: number;
  feedWithdrawalStartTime?: string;
  destination?: string;
  chickenCountLoaded: number;
  totalLoadedWeightKg: number;
  totalCrates?: number;
  oddCrateCount?: number;
  oddCrateWeightKg?: number;
  transportDepartTime?: string;
  transportArrivalTime?: string;
  chickenCountDelivered?: number;
  totalDeliveredWeightKg?: number;
  transportMortalities?: number;
  pricePerKg?: number;
  paymentTerms?: string;
  invoiceReference?: string;
  notes?: string;
}

export default function Harvests() {

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingHarvest, setEditingHarvest] = useState<HarvestFormData | null>(null);

  const { data: harvests, isLoading, refetch } = trpc.harvest.list.useQuery();
  const { data: flocks } = trpc.flocks.list.useQuery();
  const { data: shrinkageData } = trpc.harvest.getShrinkageAnalysis.useQuery({});
  const { data: comparisonData } = trpc.harvest.getHarvestComparison.useQuery();
  const createMutation = trpc.harvest.create.useMutation();
  const updateMutation = trpc.harvest.update.useMutation({
    onError: (error) => {
      console.error('[UPDATE MUTATION ERROR]', error);
      console.error('[UPDATE MUTATION ERROR DATA]', JSON.stringify(error, null, 2));
      toast.error(`Update failed: ${error.message}`);
    },
  });
  const deleteMutation = trpc.harvest.delete.useMutation();

  const [formData, setFormData] = useState<HarvestFormData>({
    flockId: 0,
    harvestDate: new Date().toISOString().split("T")[0],
    harvestStartTime: new Date().toISOString().slice(0, 16),
    chickenCountLoaded: 0,
    totalLoadedWeightKg: 0,
  });

  const resetForm = () => {
    setFormData({
      flockId: 0,
      harvestDate: new Date().toISOString().split("T")[0],
      harvestStartTime: new Date().toISOString().slice(0, 16),
      chickenCountLoaded: 0,
      totalLoadedWeightKg: 0,
    });
    setEditingHarvest(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.flockId === 0) {
      toast.error("Please select a flock");
      return;
    }

    try {
      if (editingHarvest) {
        // Exclude flockId from update data - it should not be changed
        const { flockId, ...rawUpdateData } = formData;
        
        // Clean the data: remove null/empty values, convert strings to proper types
        const cleanedData: any = {};
        Object.entries(rawUpdateData).forEach(([key, value]) => {
          // Skip null, undefined, and empty strings
          if (value === null || value === undefined || value === '') return;
          
          // Convert string numbers to actual numbers for number fields
          if (typeof value === 'string' && !isNaN(Number(value)) && value.trim() !== '') {
            cleanedData[key] = Number(value);
          } else {
            cleanedData[key] = value;
          }
        });
        
        await updateMutation.mutateAsync({
          id: editingHarvest.id!,
          data: cleanedData,
        });
        toast.success("Harvest record updated successfully");
      } else {
        await createMutation.mutateAsync(formData);
        toast.success("Harvest record created successfully");
      }
      setIsDialogOpen(false);
      resetForm();
      refetch();
    } catch (error: any) {
      console.error("Harvest save error:", error);
      console.error("Error details:", JSON.stringify(error, null, 2));
      const errorMessage = error?.message || error?.data?.message || error?.toString() || "Failed to save harvest record";
      toast.error(errorMessage);
      // Keep dialog open on error so user can see what went wrong
      return;
    }
  };

  const handleEdit = (harvest: any) => {
    setEditingHarvest(harvest);
    setFormData({
      ...harvest,
      harvestDate: new Date(harvest.harvestDate).toISOString().split("T")[0],
      harvestStartTime: new Date(harvest.harvestStartTime).toISOString().slice(0, 16),
      feedWithdrawalStartTime: harvest.feedWithdrawalStartTime
        ? new Date(harvest.feedWithdrawalStartTime).toISOString().slice(0, 16)
        : undefined,
      transportDepartTime: harvest.transportDepartTime
        ? new Date(harvest.transportDepartTime).toISOString().slice(0, 16)
        : undefined,
      transportArrivalTime: harvest.transportArrivalTime
        ? new Date(harvest.transportArrivalTime).toISOString().slice(0, 16)
        : undefined,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this harvest record? This will restore the flock count.")) {
      return;
    }

    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("Harvest record deleted successfully");
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete harvest record");
    }
  };

  // Calculate summary statistics
  const totalHarvests = harvests?.length || 0;
  const totalBirdsHarvested = harvests?.reduce((sum, h) => sum + h.chickenCountLoaded, 0) || 0;
  const totalRevenue = harvests?.reduce((sum, h) => sum + (parseFloat(h.totalRevenue?.toString() || "0")), 0) || 0;
  const avgShrinkage = harvests?.length
    ? harvests.reduce((sum, h) => sum + (parseFloat(h.shrinkagePercentage?.toString() || "0")), 0) / harvests.length
    : 0;

  if (isLoading) {
    return <div className="p-8">Loading harvests...</div>;
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Harvest Management</h1>
          <p className="text-muted-foreground">Track bird catches for slaughtering</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Record Harvest
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingHarvest ? "Edit Harvest Record" : "Record New Harvest"}</DialogTitle>
              <DialogDescription>
                Record details of bird catch for slaughtering. All times and calculations are handled automatically.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Basic Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="flockId">Flock *</Label>
                    <Select
                      value={formData.flockId.toString()}
                      onValueChange={(value) => setFormData({ ...formData, flockId: parseInt(value) })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select flock" />
                      </SelectTrigger>
                      <SelectContent>
                        {flocks?.map((flock) => (
                          <SelectItem key={flock.id} value={flock.id.toString()}>
                            {flock.flockNumber} - {flock.currentCount} birds remaining
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="destination">Destination</Label>
                    <Input
                      id="destination"
                      value={formData.destination || ""}
                      onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                      placeholder="Processor/Abattoir name"
                    />
                  </div>
                </div>
              </div>

              {/* Harvest Timing */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Harvest Timing</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="harvestDate">Harvest Date *</Label>
                    <Input
                      id="harvestDate"
                      type="date"
                      required
                      value={formData.harvestDate}
                      onChange={(e) => setFormData({ ...formData, harvestDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="harvestStartTime">Harvest Start Time *</Label>
                    <Input
                      id="harvestStartTime"
                      type="datetime-local"
                      required
                      value={formData.harvestStartTime}
                      onChange={(e) => setFormData({ ...formData, harvestStartTime: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="harvestDurationMinutes">Harvest Duration (minutes)</Label>
                    <Input
                      id="harvestDurationMinutes"
                      type="number"
                      value={formData.harvestDurationMinutes || ""}
                      onChange={(e) => setFormData({ ...formData, harvestDurationMinutes: parseInt(e.target.value) || undefined })}
                      placeholder="Total time for catching, crating, weighing, loading"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="feedWithdrawalStartTime">Feed Withdrawal Start Time</Label>
                    <Input
                      id="feedWithdrawalStartTime"
                      type="datetime-local"
                      value={formData.feedWithdrawalStartTime || ""}
                      onChange={(e) => setFormData({ ...formData, feedWithdrawalStartTime: e.target.value || undefined })}
                    />
                  </div>
                </div>
              </div>

              {/* Loading Details */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Loading Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="chickenCountLoaded">Birds Loaded *</Label>
                    <Input
                      id="chickenCountLoaded"
                      type="number"
                      required
                      value={formData.chickenCountLoaded || ""}
                      onChange={(e) => setFormData({ ...formData, chickenCountLoaded: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="totalLoadedWeightKg">Total Loaded Weight (kg) *</Label>
                    <Input
                      id="totalLoadedWeightKg"
                      type="number"
                      step="0.001"
                      required
                      value={formData.totalLoadedWeightKg || ""}
                      onChange={(e) => setFormData({ ...formData, totalLoadedWeightKg: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="totalCrates">Total Crates</Label>
                    <Input
                      id="totalCrates"
                      type="number"
                      value={formData.totalCrates || ""}
                      onChange={(e) => setFormData({ ...formData, totalCrates: parseInt(e.target.value) || undefined })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="oddCrateCount">Odd Crate Bird Count</Label>
                    <Input
                      id="oddCrateCount"
                      type="number"
                      value={formData.oddCrateCount || ""}
                      onChange={(e) => setFormData({ ...formData, oddCrateCount: parseInt(e.target.value) || undefined })}
                      placeholder="Birds in partial crate"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="oddCrateWeightKg">Odd Crate Weight (kg)</Label>
                    <Input
                      id="oddCrateWeightKg"
                      type="number"
                      step="0.001"
                      value={formData.oddCrateWeightKg || ""}
                      onChange={(e) => setFormData({ ...formData, oddCrateWeightKg: parseFloat(e.target.value) || undefined })}
                    />
                  </div>
                </div>
              </div>

              {/* Transport Details */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Transport Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="transportDepartTime">Transport Depart Time</Label>
                    <Input
                      id="transportDepartTime"
                      type="datetime-local"
                      value={formData.transportDepartTime || ""}
                      onChange={(e) => setFormData({ ...formData, transportDepartTime: e.target.value || undefined })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="transportArrivalTime">Transport Arrival Time</Label>
                    <Input
                      id="transportArrivalTime"
                      type="datetime-local"
                      value={formData.transportArrivalTime || ""}
                      onChange={(e) => setFormData({ ...formData, transportArrivalTime: e.target.value || undefined })}
                    />
                  </div>
                </div>
              </div>

              {/* Delivery Details */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Delivery Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="chickenCountDelivered">Birds Delivered</Label>
                    <Input
                      id="chickenCountDelivered"
                      type="number"
                      value={formData.chickenCountDelivered || ""}
                      onChange={(e) => setFormData({ ...formData, chickenCountDelivered: parseInt(e.target.value) || undefined })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="totalDeliveredWeightKg">Total Delivered Weight (kg)</Label>
                    <Input
                      id="totalDeliveredWeightKg"
                      type="number"
                      step="0.001"
                      value={formData.totalDeliveredWeightKg || ""}
                      onChange={(e) => setFormData({ ...formData, totalDeliveredWeightKg: parseFloat(e.target.value) || undefined })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="transportMortalities">Transport Mortalities</Label>
                    <Input
                      id="transportMortalities"
                      type="number"
                      value={formData.transportMortalities || ""}
                      onChange={(e) => setFormData({ ...formData, transportMortalities: parseInt(e.target.value) || undefined })}
                    />
                  </div>
                </div>
              </div>

              {/* Financial Details */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Financial Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="pricePerKg">Price per kg</Label>
                    <Input
                      id="pricePerKg"
                      type="number"
                      step="0.01"
                      value={formData.pricePerKg || ""}
                      onChange={(e) => setFormData({ ...formData, pricePerKg: parseFloat(e.target.value) || undefined })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="paymentTerms">Payment Terms</Label>
                    <Input
                      id="paymentTerms"
                      value={formData.paymentTerms || ""}
                      onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value || undefined })}
                      placeholder="e.g., Net 30 days"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invoiceReference">Invoice Reference</Label>
                    <Input
                      id="invoiceReference"
                      value={formData.invoiceReference || ""}
                      onChange={(e) => setFormData({ ...formData, invoiceReference: e.target.value || undefined })}
                    />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes || ""}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value || undefined })}
                  placeholder="Weather conditions, issues, observations..."
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingHarvest ? "Update" : "Create"} Harvest
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Harvests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalHarvests}</div>
            <p className="text-xs text-muted-foreground">Catch records</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Birds Harvested</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalBirdsHarvested.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Total count</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Total Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R{totalRevenue.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">From all harvests</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {avgShrinkage > 5 ? (
                <TrendingDown className="h-4 w-4 text-red-500" />
              ) : (
                <TrendingUp className="h-4 w-4 text-green-500" />
              )}
              Avg Shrinkage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgShrinkage.toFixed(2)}%</div>
            <p className="text-xs text-muted-foreground">Weight loss</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Records and Analytics */}
      <Tabs defaultValue="records" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="records" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Harvest Records
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="records" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Harvest Records</CardTitle>
              <CardDescription>Complete history of bird catches for slaughtering</CardDescription>
            </CardHeader>
        <CardContent>
          {harvests && harvests.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Flock</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead className="text-right">Birds Loaded</TableHead>
                  <TableHead className="text-right">Loaded Weight</TableHead>
                  <TableHead className="text-right">Delivered Weight</TableHead>
                  <TableHead className="text-right">Shrinkage</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {harvests.map((harvest: any) => {
                  const flock = flocks?.find((f) => f.id === harvest.flockId);
                  return (
                    <TableRow key={harvest.id}>
                      <TableCell>{new Date(harvest.harvestDate).toLocaleDateString()}</TableCell>
                      <TableCell>{flock?.flockNumber || `Flock #${harvest.flockId}`}</TableCell>
                      <TableCell>{harvest.destination || "-"}</TableCell>
                      <TableCell className="text-right">{harvest.chickenCountLoaded.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{parseFloat(harvest.totalLoadedWeightKg.toString()).toFixed(2)} kg</TableCell>
                      <TableCell className="text-right">
                        {harvest.totalDeliveredWeightKg ? `${parseFloat(harvest.totalDeliveredWeightKg.toString()).toFixed(2)} kg` : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {harvest.shrinkagePercentage ? `${harvest.shrinkagePercentage}%` : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {harvest.totalRevenue ? `R${parseFloat(harvest.totalRevenue).toFixed(2)}` : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(harvest)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(harvest.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>No harvest records yet</p>
              <p className="text-sm">Click "Record Harvest" to add your first catch record</p>
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="analytics" className="mt-6 space-y-6">
          {harvests && harvests.length > 0 ? (
            <div className="space-y-6">
              {shrinkageData && shrinkageData.length > 0 && (
                <ShrinkageAnalysisDashboard data={shrinkageData} />
              )}
              {comparisonData && comparisonData.length > 0 && (
                <HarvestHistoryComparison data={comparisonData} />
              )}
              {(!shrinkageData || shrinkageData.length === 0) && (!comparisonData || comparisonData.length === 0) && (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center h-64">
                    <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-2">Incomplete harvest data</p>
                    <p className="text-sm text-muted-foreground">Record harvests with complete data (loaded weight, delivered weight, travel times) to see analytics</p>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center h-64">
                <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-2">No harvest data available</p>
                <p className="text-sm text-muted-foreground">Record harvests with complete data (loaded weight, delivered weight, travel times) to see analytics</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
