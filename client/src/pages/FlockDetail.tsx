import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Activity, Calendar, TrendingUp, AlertCircle, Plus, ArrowLeft, RefreshCw, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { toast } from "sonner";
import { format } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function FlockDetail() {
  const [, params] = useRoute("/flocks/:id");
  const [, setLocation] = useLocation();
  const flockId = params?.id ? parseInt(params.id) : 0;
  
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // Fetch flock data
  const { data: flock, isLoading: flockLoading } = trpc.flocks.getById.useQuery({ id: flockId });
  const { data: dailyRecords } = trpc.flocks.getDailyRecords.useQuery({ flockId });
  const { data: healthRecords } = trpc.flocks.getHealthRecords.useQuery({ flockId });
  const { data: vaccinationSchedule } = trpc.flocks.getVaccinationSchedule.useQuery({ flockId });
  const { data: performanceMetrics } = trpc.flocks.getPerformanceMetrics.useQuery({ flockId });
  const { data: growthData } =
  trpc.flocks.getGrowthPerformanceData.useQuery({ flockId });

  const { data: vaccinationSchedules } = trpc.flocks.getVaccinationSchedules.useQuery({ flockId });
  const { data: stressPackSchedules } = trpc.flocks.getStressPackSchedules.useQuery({ flockId });
  const { data: flockReminders } = trpc.reminders.list.useQuery({ flockId });
  const { data: allTemplates } = trpc.reminderTemplates.list.useQuery();
  const { data: appliedTemplates } = trpc.reminderTemplates.getAppliedTemplates.useQuery({ flockId });
  const { data: statusHistory } = trpc.flocks.getStatusHistory.useQuery({ flockId });
  const addTemplate = trpc.reminderTemplates.addToFlock.useMutation();
  const removeTemplate = trpc.reminderTemplates.removeFromFlock.useMutation();
  const syncFromTemplate = trpc.reminders.syncFromTemplate.useMutation();

  // Mutations
  const createDailyRecord = trpc.flocks.createDailyRecord.useMutation({
    onSuccess: () => {
      utils.flocks.getDailyRecords.invalidate({ flockId });
      utils.flocks.getPerformanceMetrics.invalidate({ flockId });
      utils.flocks.getById.invalidate({ id: flockId });
      toast.success("Daily record added successfully");
      setDailyRecordDialogOpen(false);
      resetDailyRecordForm();
    },
    onError: (error) => {
      toast.error(`Failed to add daily record: ${error.message}`);
    },
  });

  const updateDailyRecord = trpc.flocks.updateDailyRecord.useMutation({
    onSuccess: () => {
      utils.flocks.getDailyRecords.invalidate({ flockId });
      utils.flocks.getPerformanceMetrics.invalidate({ flockId });
      utils.flocks.getById.invalidate({ id: flockId });
      toast.success("Daily record updated successfully");
      setEditDailyRecordDialogOpen(false);
      setEditingRecordId(null);
      resetDailyRecordForm();
    },
    onError: (error) => {
      toast.error(`Failed to update daily record: ${error.message}`);
    },
  });

  const deleteDailyRecord = trpc.flocks.deleteDailyRecord.useMutation({
    onSuccess: () => {
      utils.flocks.getDailyRecords.invalidate({ flockId });
      utils.flocks.getPerformanceMetrics.invalidate({ flockId });
      utils.flocks.getById.invalidate({ id: flockId });
      toast.success("Daily record deleted successfully");
      setDeleteConfirmDialogOpen(false);
      setRecordToDelete(null);
    },
    onError: (error) => {
      toast.error(`Failed to delete daily record: ${error.message}`);
    },
  });

  const createHealthRecord = trpc.flocks.createHealthRecord.useMutation({
    onSuccess: () => {
      utils.flocks.getHealthRecords.invalidate({ flockId });
      toast.success("Health record added successfully");
      setHealthRecordDialogOpen(false);
      resetHealthRecordForm();
    },
    onError: (error) => {
      toast.error(`Failed to add health record: ${error.message}`);
    },
  });

  const createVaccination = trpc.flocks.createVaccinationSchedule.useMutation({
    onSuccess: () => {
      utils.flocks.getVaccinationSchedule.invalidate({ flockId });
      toast.success("Vaccination scheduled successfully");
      setVaccinationDialogOpen(false);
      resetVaccinationForm();
    },
    onError: (error) => {
      toast.error(`Failed to schedule vaccination: ${error.message}`);
    },
  });

  // Reminder update mutation
  const updateReminderStatus = trpc.reminders.updateStatus.useMutation({
    onSuccess: () => {
      utils.reminders.list.invalidate({ flockId });
      toast.success("Reminder updated successfully");
      setReminderActionDialog({ open: false, reminderId: null, action: null });
      setReminderActionNotes("");
    },
    onError: (error) => {
      toast.error(`Failed to update reminder: ${error.message}`);
    },
  });

  // Dialog states
  const [dailyRecordDialogOpen, setDailyRecordDialogOpen] = useState(false);
  const [editDailyRecordDialogOpen, setEditDailyRecordDialogOpen] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null);
  const [deleteConfirmDialogOpen, setDeleteConfirmDialogOpen] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<{ id: number; dayNumber: number; date: string } | null>(null);
  const [healthRecordDialogOpen, setHealthRecordDialogOpen] = useState(false);
  const [vaccinationDialogOpen, setVaccinationDialogOpen] = useState(false);
  const [reminderActionDialog, setReminderActionDialog] = useState<{ open: boolean; reminderId: number | null; action: "complete" | "dismiss" | null }>({ open: false, reminderId: null, action: null });
  const [reminderActionNotes, setReminderActionNotes] = useState("");
  const [activeTab, setActiveTab] = useState("daily");
  
  // UI helper: status → badge variant
  const getStatusColor = (
    status: string
  ): "default" | "secondary" | "destructive" | "outline" | "warning" | "success" => {
   switch (status) {
    case "active":
      return "warning";
    case "completed":
      return "success";
    case "cancelled":
      return "destructive";
    case "planned":
      return "outline";
    default:
      return "outline";
  }
 };

  // Form states for daily record
  const [dailyRecordForm, setDailyRecordForm] = useState({
    recordDate: format(new Date(), "yyyy-MM-dd"),
    dayNumber: 1,
    mortality: 0,
    feedConsumed: 0,
    feedType: "starter" as "starter" | "grower" | "finisher",
    waterConsumed: 0,
    averageWeight: 0,
    weightSamples: "",
    temperature: 0,
    humidity: 0,
    notes: "",
  });

  // Form states for health record
  const [healthRecordForm, setHealthRecordForm] = useState({
    recordDate: format(new Date(), "yyyy-MM-dd"),
    recordType: "observation" as "observation" | "treatment" | "veterinary_visit" | "medication" | "other",
    description: "",
    treatment: "",
    medication: "",
    dosage: "",
    veterinarianName: "",
    cost: 0,
    notes: "",
  });

  // Form states for vaccination
  const [vaccinationForm, setVaccinationForm] = useState({
    vaccineName: "",
    scheduledDate: format(new Date(), "yyyy-MM-dd"),
    scheduledDayNumber: 1,
    dosage: "",
    administrationMethod: "",
    notes: "",
  });

  const resetDailyRecordForm = () => {
    const today = new Date();
    const placementDate = flock?.placementDate ? new Date(flock.placementDate) : today;
    const calculatedDayNumber = Math.floor((today.getTime() - placementDate.getTime()) / (1000 * 60 * 60 * 24));
    setDailyRecordForm({
      recordDate: format(today, "yyyy-MM-dd"),
      dayNumber: Math.max(0, calculatedDayNumber),
      mortality: 0,
      feedConsumed: 0,
      feedType: "starter",
      waterConsumed: 0,
      averageWeight: 0,
      weightSamples: "",
      temperature: 0,
      humidity: 0,
      notes: "",
    });
  };

  const resetHealthRecordForm = () => {
    setHealthRecordForm({
      recordDate: format(new Date(), "yyyy-MM-dd"),
      recordType: "observation",
      description: "",
      treatment: "",
      medication: "",
      dosage: "",
      veterinarianName: "",
      cost: 0,
      notes: "",
    });
  };

  const resetVaccinationForm = () => {
    setVaccinationForm({
      vaccineName: "",
      scheduledDate: format(new Date(), "yyyy-MM-dd"),
      scheduledDayNumber: 1,
      dosage: "",
      administrationMethod: "",
      notes: "",
    });
  };

  const handleSubmitDailyRecord = () => {
    createDailyRecord.mutate({
      flockId,
      recordDate: new Date(dailyRecordForm.recordDate),
      dayNumber: dailyRecordForm.dayNumber,
      mortality: dailyRecordForm.mortality,
      feedConsumed: dailyRecordForm.feedConsumed,
      feedType: dailyRecordForm.feedType,
      waterConsumed: dailyRecordForm.waterConsumed || undefined,
      // Allow 0 to be sent explicitly (for days without weighing)
      averageWeight: dailyRecordForm.averageWeight,
      weightSamples: dailyRecordForm.weightSamples || undefined,
      temperature: dailyRecordForm.temperature || undefined,
      humidity: dailyRecordForm.humidity || undefined,
      notes: dailyRecordForm.notes || undefined,
    });
  };

  const handleEditDailyRecord = (record: typeof dailyRecords extends (infer T)[] | undefined ? T : never) => {
    if (!record) return;
    setEditingRecordId(record.id);
    setDailyRecordForm({
      recordDate: format(new Date(record.recordDate), "yyyy-MM-dd"),
      dayNumber: record.dayNumber,
      mortality: record.mortality || 0,
      feedConsumed: record.feedConsumed ? parseFloat(record.feedConsumed.toString()) : 0,
      feedType: (record.feedType as "starter" | "grower" | "finisher") || "starter",
      waterConsumed: record.waterConsumed ? parseFloat(record.waterConsumed.toString()) : 0,
      averageWeight: record.averageWeight ? parseFloat(record.averageWeight.toString()) : 0,
      weightSamples: record.weightSamples || "",
      temperature: record.temperature ? parseFloat(record.temperature.toString()) : 0,
      humidity: record.humidity ? parseFloat(record.humidity.toString()) : 0,
      notes: record.notes || "",
    });
    setEditDailyRecordDialogOpen(true);
  };

  const handleUpdateDailyRecord = () => {
    if (!editingRecordId) return;
    updateDailyRecord.mutate({
      id: editingRecordId,
      flockId,
      mortality: dailyRecordForm.mortality,
      feedConsumed: dailyRecordForm.feedConsumed,
      feedType: dailyRecordForm.feedType,
      waterConsumed: dailyRecordForm.waterConsumed || undefined,
      // Allow 0 to be sent explicitly (for days without weighing)
      averageWeight: dailyRecordForm.averageWeight,
      weightSamples: dailyRecordForm.weightSamples || undefined,
      temperature: dailyRecordForm.temperature || undefined,
      humidity: dailyRecordForm.humidity || undefined,
      notes: dailyRecordForm.notes || undefined,
    });
  };

  const handleDeleteDailyRecord = (record: typeof dailyRecords extends (infer T)[] | undefined ? T : never) => {
    if (!record) return;
    setRecordToDelete({
      id: record.id,
      dayNumber: record.dayNumber,
      date: format(new Date(record.recordDate), "dd MMM yyyy"),
    });
    setDeleteConfirmDialogOpen(true);
  };

  const confirmDeleteDailyRecord = () => {
    if (!recordToDelete) return;
    deleteDailyRecord.mutate({ id: recordToDelete.id, flockId });
  };

  const handleSubmitHealthRecord = () => {
    createHealthRecord.mutate({
      flockId,
      recordDate: new Date(healthRecordForm.recordDate),
      recordType: healthRecordForm.recordType,
      description: healthRecordForm.description,
      treatment: healthRecordForm.treatment || undefined,
      medication: healthRecordForm.medication || undefined,
      dosage: healthRecordForm.dosage || undefined,
      veterinarianName: healthRecordForm.veterinarianName || undefined,
      cost: healthRecordForm.cost || undefined,
      notes: healthRecordForm.notes || undefined,
    });
  };

  const handleSubmitVaccination = () => {
    createVaccination.mutate({
      flockId,
      vaccineName: vaccinationForm.vaccineName,
      scheduledDate: new Date(vaccinationForm.scheduledDate),
      scheduledDayNumber: vaccinationForm.scheduledDayNumber,
      dosage: vaccinationForm.dosage || undefined,
      administrationMethod: vaccinationForm.administrationMethod || undefined,
      notes: vaccinationForm.notes || undefined,
    });
  };
  
// =====================================================
// GROWTH PERFORMANCE DATA (single source of truth)
// =====================================================

  const benchmark = growthData?.benchmark ?? [];
  const farmTarget = growthData?.farmTarget ?? [];
  const actuals = growthData?.actuals ?? [];

// --- Chart data (merged by day) ---
  const chartData = (() => {
  const days = new Set<number>();

  benchmark.forEach(b => days.add(b.day));
  farmTarget.forEach(t => days.add(t.day));
  actuals.forEach(a => days.add(a.day));

  return Array.from(days)
  .sort((a, b) => a - b)
  .map(day => {
    const row = {
      day,
      benchmarkWeight:
        benchmark.find(b => b.day === day)?.weightKg ?? null,
      targetWeight:
        farmTarget.find(t => t.day === day)?.targetWeightKg ?? null,
      actualWeight:
        actuals.find(a => a.day === day)?.weightKg ?? null,
      feedKg:
        actuals.find(a => a.day === day)?.feedKg ?? null,
    };

    // 🔑 Keep row ONLY if at least one weight exists
    return row.benchmarkWeight !== null ||
      row.targetWeight !== null ||
      row.actualWeight !== null
      ? row
      : null;
  })
  .filter(Boolean);

})();

  if (flockLoading) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center">
          <div className="text-muted-foreground">Loading flock details...</div>
        </div>
      </div>
    );
  }
  


// --- ADWG (frontend-derived, temporary) ---
  const DEFAULT_SHRINKAGE_PERCENT = 6.5;

  const adwgData = (() => {
  if (!dailyRecords || !flock) return [];

  const deliveredTargetWeight = Number(flock.targetSlaughterWeight);
  const growingPeriod = Number(flock.growingPeriod);

  if (!deliveredTargetWeight || !growingPeriod) return [];

  const preCatchTargetWeight =
    deliveredTargetWeight / (1 - DEFAULT_SHRINKAGE_PERCENT / 100);

  const expectedDailyGain = preCatchTargetWeight / growingPeriod;

  const sortedRecords = [...dailyRecords]
    .filter(r => Number(r.averageWeight ?? 0) > 0)
    .sort(
      (a, b) =>
        new Date(a.recordDate).getTime() -
        new Date(b.recordDate).getTime()
    );

  if (sortedRecords.length < 2) return [];

  return sortedRecords
    .map((record, index, arr) => {
      if (index === 0) return null;

      const prev = arr[index - 1];

      const daysBetween =
        (new Date(record.recordDate).getTime() -
          new Date(prev.recordDate).getTime()) /
        (1000 * 60 * 60 * 24);

      if (daysBetween <= 0) return null;

      const currentWeight = Number(record.averageWeight);
      const prevWeight = Number(prev.averageWeight);

      const adwg = (currentWeight - prevWeight) / daysBetween;

      return {
        targetDay: Number((currentWeight / expectedDailyGain).toFixed(2)),
        actualADWG: Number(adwg.toFixed(3)),
        targetADWG: Number(expectedDailyGain.toFixed(3)),
      };
    })
    .filter(Boolean);
})();

  if (!flock) {
    return (
      <div className="container py-8">
        <div className="flex flex-col items-center justify-center gap-4">
          <AlertCircle className="h-12 w-12 text-muted-foreground" />
          <div className="text-xl font-semibold">Flock not found</div>
          <Button onClick={() => setLocation("/flocks")}>Back to Flocks</Button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="container py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/flocks")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{flock.flockNumber}</h1>
            <p className="text-muted-foreground">Detailed flock tracking and management</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end gap-1">
            <Badge variant={getStatusColor(flock.status)}>{flock.status}</Badge>
            {flock.statusChangedAt && (
              <span className="text-xs text-muted-foreground">
                {flock.isManualStatusChange ? 'Manual' : 'Auto'} • {format(new Date(flock.statusChangedAt), 'MMM d, yyyy')}
              </span>
            )}
          </div>
          <StatusChangeDialog flockId={flockId} currentStatus={flock.status} />
        </div>
      </div>

      {/* Performance Summary Cards */}
      <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Age (Days)</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{performanceMetrics?.ageInDays || 0}</div>
            <p className="text-xs text-muted-foreground">
              {performanceMetrics?.daysRemaining || 0} days remaining
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Count</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{flock.currentCount.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Mortality: {performanceMetrics?.mortalityRate || 0}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Weight</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{performanceMetrics?.averageWeight || 0} kg</div>
            <p className="text-xs text-muted-foreground">
			  Target (pre-catch): {(
				(performanceMetrics?.targetWeight || 0) /
				(1 - 0.065)
			).toFixed(3)} kg
		</p>

          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">FCR</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{performanceMetrics?.fcr || 0}</div>
            <p className="text-xs text-muted-foreground">
              Feed consumed: {performanceMetrics?.totalFeedConsumed || 0} kg
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabbed Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="daily">Daily Records</TabsTrigger>
          <TabsTrigger value="growth">Growth Performance</TabsTrigger>
          <TabsTrigger value="health">Health Records</TabsTrigger>
          <TabsTrigger value="vaccination">Vaccinations</TabsTrigger>
          <TabsTrigger value="stress-packs">Stress Packs</TabsTrigger>
          <TabsTrigger value="reminders">Reminders</TabsTrigger>
          <TabsTrigger value="status-history">Status History</TabsTrigger>
        </TabsList>

        {/* Daily Records Tab */}
        <TabsContent value="daily" className="space-y-4">
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Mortality</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {dailyRecords?.reduce((sum, r) => sum + (r.mortality || 0), 0).toLocaleString() || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {((dailyRecords?.reduce((sum, r) => sum + (r.mortality || 0), 0) || 0) / (flock?.initialCount || 1) * 100).toFixed(2)}% mortality rate
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Feed Consumed</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {dailyRecords?.reduce((sum, r) => sum + (r.feedConsumed ? parseFloat(r.feedConsumed.toString()) : 0), 0).toFixed(1) || 0} kg
                </div>
                <p className="text-xs text-muted-foreground">
                  {((dailyRecords?.reduce((sum, r) => sum + (r.feedConsumed ? parseFloat(r.feedConsumed.toString()) : 0), 0) || 0) / (flock?.currentCount || 1) * 1000).toFixed(0)}g per bird
                </p>
              </CardContent>
            </Card>
			            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Latest Weight</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {performanceMetrics?.averageWeight && performanceMetrics.averageWeight > 0
                    ? `${performanceMetrics.averageWeight.toFixed(3)} kg`
                    : "No data"}
                </div>
                <p className="text-xs text-muted-foreground">
                  {performanceMetrics?.ageInDays !== undefined ? `Day ${performanceMetrics.ageInDays}` : "Record weights to track"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">FCR</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {performanceMetrics?.fcr && performanceMetrics.fcr > 0
                    ? performanceMetrics.fcr.toFixed(2)
                    : "N/A"}
                </div>
                <p className="text-xs text-muted-foreground">Feed Conversion Ratio</p>
              </CardContent>
            </Card>
          </div>

          {/* Add Record Button and Dialog */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Daily Records</CardTitle>
                <CardDescription>Track daily mortality, feed consumption, and weight samples</CardDescription>
              </div>
              <Dialog open={dailyRecordDialogOpen} onOpenChange={(open) => {
                setDailyRecordDialogOpen(open);
                if (open) {
                  // Calculate day number when dialog opens
                  const today = new Date();
                  const placementDate = flock?.placementDate ? new Date(flock.placementDate) : today;
                  const calculatedDayNumber = Math.floor((today.getTime() - placementDate.getTime()) / (1000 * 60 * 60 * 24));
                  setDailyRecordForm(prev => ({
                    ...prev,
                    recordDate: format(today, "yyyy-MM-dd"),
                    dayNumber: Math.max(0, calculatedDayNumber),
                  }));
                }
              }}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Record
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add Daily Record</DialogTitle>
                    <DialogDescription>
                      Record daily data for {flock?.flockNumber}. Day number is calculated automatically from placement date.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="recordDate">Record Date</Label>
                        <Input
                          id="recordDate"
                          type="date"
                          value={dailyRecordForm.recordDate}
                          onChange={(e) => {
                            const newDate = e.target.value;
                            const placementDate = flock?.placementDate ? new Date(flock.placementDate) : new Date();
                            const recordDate = new Date(newDate);
                            const dayNumber = Math.floor((recordDate.getTime() - placementDate.getTime()) / (1000 * 60 * 60 * 24));
                            setDailyRecordForm({ ...dailyRecordForm, recordDate: newDate, dayNumber: Math.max(0, dayNumber) });
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="dayNumber">Day Number</Label>
                        <Input
                          id="dayNumber"
                          type="number"
                          value={dailyRecordForm.dayNumber}
                          disabled
                          className="bg-muted"
                        />
                        <p className="text-xs text-muted-foreground">Auto-calculated from placement date</p>
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <h4 className="font-medium mb-3">Mortality & Bird Count</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="mortality">Mortality Count</Label>
                          <Input
                            id="mortality"
                            type="number"
                            min="0"
                            value={dailyRecordForm.mortality}
                            onChange={(e) => setDailyRecordForm({ ...dailyRecordForm, mortality: parseInt(e.target.value) || 0 })}
                          />
                          <p className="text-xs text-muted-foreground">Number of birds that died today</p>
                        </div>
                        <div className="space-y-2">
                          <Label>Current Count After Mortality</Label>
                          <div className="text-lg font-medium p-2 bg-muted rounded">
                            {((flock?.currentCount || 0) - dailyRecordForm.mortality).toLocaleString()} birds
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <h4 className="font-medium mb-3">Feed & Water Consumption</h4>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="feedConsumed">Feed Consumed (kg)</Label>
                          <Input
                            id="feedConsumed"
                            type="number"
                            step="0.1"
                            min="0"
                            value={dailyRecordForm.feedConsumed}
                            onChange={(e) => setDailyRecordForm({ ...dailyRecordForm, feedConsumed: parseFloat(e.target.value) || 0 })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="feedType">Feed Type</Label>
                          <Select
                            value={dailyRecordForm.feedType}
                            onValueChange={(value) => setDailyRecordForm({ ...dailyRecordForm, feedType: value as "starter" | "grower" | "finisher" })}
                          >
                            <SelectTrigger id="feedType">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="starter">Starter</SelectItem>
                              <SelectItem value="grower">Grower</SelectItem>
                              <SelectItem value="finisher">Finisher</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="waterConsumed">Water Consumed (L)</Label>
                          <Input
                            id="waterConsumed"
                            type="number"
                            step="0.1"
                            min="0"
                            value={dailyRecordForm.waterConsumed}
                            onChange={(e) => setDailyRecordForm({ ...dailyRecordForm, waterConsumed: parseFloat(e.target.value) || 0 })}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <h4 className="font-medium mb-3">Weight Sampling</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="averageWeight">Average Weight (kg)</Label>
                          <Input
                            id="averageWeight"
                            type="number"
                            step="0.001"
                            min="0"
                            value={dailyRecordForm.averageWeight === 0 ? "" : dailyRecordForm.averageWeight}
                            placeholder="Leave empty if not weighed"
                            onChange={(e) => {
                              const val = e.target.value;
                              setDailyRecordForm({ ...dailyRecordForm, averageWeight: val === "" ? 0 : parseFloat(val) });
                            }}
                          />
                          <p className="text-xs text-muted-foreground">Average from weight samples</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="weightSamples">Individual Weights (optional)</Label>
                          <Input
                            id="weightSamples"
                            placeholder="e.g., 1.2, 1.3, 1.25, 1.18"
                            value={dailyRecordForm.weightSamples}
                            onChange={(e) => {
                              const samples = e.target.value;
                              setDailyRecordForm({ ...dailyRecordForm, weightSamples: samples });
                              // Auto-calculate average if samples provided
                              const weights = samples.split(",").map(w => parseFloat(w.trim())).filter(w => !isNaN(w));
                              if (weights.length > 0) {
                                const avg = weights.reduce((a, b) => a + b, 0) / weights.length;
                                setDailyRecordForm(prev => ({ ...prev, weightSamples: samples, averageWeight: parseFloat(avg.toFixed(3)) }));
                              }
                            }}
                          />
                          <p className="text-xs text-muted-foreground">Comma-separated weights in kg</p>
                        </div>
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <h4 className="font-medium mb-3">Environmental Conditions</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="temperature">Temperature (°C)</Label>
                          <Input
                            id="temperature"
                            type="number"
                            step="0.1"
                            value={dailyRecordForm.temperature}
                            onChange={(e) => setDailyRecordForm({ ...dailyRecordForm, temperature: parseFloat(e.target.value) || 0 })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="humidity">Humidity (%)</Label>
                          <Input
                            id="humidity"
                            type="number"
                            step="1"
                            min="0"
                            max="100"
                            value={dailyRecordForm.humidity}
                            onChange={(e) => setDailyRecordForm({ ...dailyRecordForm, humidity: parseFloat(e.target.value) || 0 })}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <div className="space-y-2">
                        <Label htmlFor="notes">Notes (optional)</Label>
                        <Textarea
                          id="notes"
                          placeholder="Any observations or comments about today..."
                          value={dailyRecordForm.notes}
                          onChange={(e) => setDailyRecordForm({ ...dailyRecordForm, notes: e.target.value })}
                          rows={2}
                        />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDailyRecordDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleSubmitDailyRecord} disabled={createDailyRecord.isPending}>
                      {createDailyRecord.isPending ? "Saving..." : "Save Record"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {dailyRecords && dailyRecords.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Day</TableHead>
                        <TableHead>Mortality</TableHead>
                        <TableHead>Feed (kg)</TableHead>
                        <TableHead>Feed Type</TableHead>
                        <TableHead>Water (L)</TableHead>
                        <TableHead>Avg Weight (kg)</TableHead>
                        <TableHead>Temp (°C)</TableHead>
                        <TableHead>Humidity (%)</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead className="w-[80px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...dailyRecords].sort((a, b) => new Date(b.recordDate).getTime() - new Date(a.recordDate).getTime()).map((record) => (
                        <TableRow key={record.id}>
                          <TableCell>{format(new Date(record.recordDate), "dd MMM yyyy")}</TableCell>
                          <TableCell>{record.dayNumber}</TableCell>
                          <TableCell>
                            <span className={record.mortality > 0 ? "text-red-600 font-medium" : ""}>
                              {record.mortality}
                            </span>
                          </TableCell>
                          <TableCell>{record.feedConsumed ? parseFloat(record.feedConsumed.toString()).toFixed(1) : "-"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">{record.feedType || "-"}</Badge>
                          </TableCell>
                          <TableCell>{record.waterConsumed ? parseFloat(record.waterConsumed.toString()).toFixed(1) : "-"}</TableCell>
                          <TableCell>
                            {record.averageWeight && parseFloat(record.averageWeight.toString()) > 0 
                              ? parseFloat(record.averageWeight.toString()).toFixed(3) 
                              : "-"}
                          </TableCell>
                          <TableCell>{record.temperature ? parseFloat(record.temperature.toString()).toFixed(1) : "-"}</TableCell>
                          <TableCell>{record.humidity ? parseFloat(record.humidity.toString()).toFixed(0) : "-"}</TableCell>
                          <TableCell className="max-w-[200px] truncate" title={record.notes || ""}>
                            {record.notes || "-"}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEditDailyRecord(record)}
                                title="Edit record"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteDailyRecord(record)}
                                title="Delete record"
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  <p>No daily records yet.</p>
                  <p className="text-sm mt-2">Click "Add Record" to start tracking daily data.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Edit Daily Record Dialog */}
          <Dialog open={editDailyRecordDialogOpen} onOpenChange={(open) => {
            setEditDailyRecordDialogOpen(open);
            if (!open) {
              setEditingRecordId(null);
              resetDailyRecordForm();
            }
          }}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Daily Record</DialogTitle>
                <DialogDescription>Update the daily record for Day {dailyRecordForm.dayNumber}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input type="date" value={dailyRecordForm.recordDate} disabled />
                  </div>
                  <div className="space-y-2">
                    <Label>Day Number</Label>
                    <Input type="number" value={dailyRecordForm.dayNumber} disabled />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-mortality">Mortality</Label>
                    <Input
                      id="edit-mortality"
                      type="number"
                      min="0"
                      value={dailyRecordForm.mortality}
                      onChange={(e) => setDailyRecordForm({ ...dailyRecordForm, mortality: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-feedConsumed">Feed Consumed (kg)</Label>
                    <Input
                      id="edit-feedConsumed"
                      type="number"
                      step="0.1"
                      min="0"
                      value={dailyRecordForm.feedConsumed}
                      onChange={(e) => setDailyRecordForm({ ...dailyRecordForm, feedConsumed: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-feedType">Feed Type</Label>
                    <Select
                      value={dailyRecordForm.feedType}
                      onValueChange={(value) => setDailyRecordForm({ ...dailyRecordForm, feedType: value as "starter" | "grower" | "finisher" })}
                    >
                      <SelectTrigger id="edit-feedType">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="starter">Starter</SelectItem>
                        <SelectItem value="grower">Grower</SelectItem>
                        <SelectItem value="finisher">Finisher</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-waterConsumed">Water Consumed (L)</Label>
                    <Input
                      id="edit-waterConsumed"
                      type="number"
                      step="0.1"
                      min="0"
                      value={dailyRecordForm.waterConsumed}
                      onChange={(e) => setDailyRecordForm({ ...dailyRecordForm, waterConsumed: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-averageWeight">Average Weight (kg)</Label>
                    <Input
                      id="edit-averageWeight"
                      type="number"
                      step="0.001"
                      min="0"
                      value={dailyRecordForm.averageWeight === 0 ? "" : dailyRecordForm.averageWeight}
                      placeholder="Leave empty if not weighed"
                      onChange={(e) => {
                        const val = e.target.value;
                        setDailyRecordForm({ ...dailyRecordForm, averageWeight: val === "" ? 0 : parseFloat(val) });
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-weightSamples">Weight Samples</Label>
                    <Input
                      id="edit-weightSamples"
                      placeholder="e.g., 1.2, 1.3, 1.25"
                      value={dailyRecordForm.weightSamples}
                      onChange={(e) => setDailyRecordForm({ ...dailyRecordForm, weightSamples: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-temperature">Temperature (°C)</Label>
                    <Input
                      id="edit-temperature"
                      type="number"
                      step="0.1"
                      value={dailyRecordForm.temperature}
                      onChange={(e) => setDailyRecordForm({ ...dailyRecordForm, temperature: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-humidity">Humidity (%)</Label>
                    <Input
                      id="edit-humidity"
                      type="number"
                      min="0"
                      max="100"
                      value={dailyRecordForm.humidity}
                      onChange={(e) => setDailyRecordForm({ ...dailyRecordForm, humidity: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-notes">Notes</Label>
                  <Textarea
                    id="edit-notes"
                    placeholder="Any observations or notes..."
                    value={dailyRecordForm.notes}
                    onChange={(e) => setDailyRecordForm({ ...dailyRecordForm, notes: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditDailyRecordDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleUpdateDailyRecord} disabled={updateDailyRecord.isPending}>
                  {updateDailyRecord.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Delete Confirmation Dialog */}
          <Dialog open={deleteConfirmDialogOpen} onOpenChange={setDeleteConfirmDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Daily Record</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete the daily record for Day {recordToDelete?.dayNumber} ({recordToDelete?.date})? This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteConfirmDialogOpen(false)}>Cancel</Button>
                <Button variant="destructive" onClick={confirmDeleteDailyRecord} disabled={deleteDailyRecord.isPending}>
                  {deleteDailyRecord.isPending ? "Deleting..." : "Delete"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Growth Performance Tab */}
        <TabsContent value="growth" className="space-y-4">
           <Card>
            <CardHeader>
              <CardTitle>Growth Performance</CardTitle>
              <CardDescription>Actual weight progression vs. industry standard target (Ross 308/Cobb 500 benchmark)</CardDescription>
            </CardHeader>
            <CardContent>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={450}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="day" 
                      label={{ value: "Age (Days)", position: "insideBottom", offset: -5 }} 
                    />
                    <YAxis 
                      yAxisId="left" 
                      label={{ value: "Weight (kg)", angle: -90, position: "insideLeft" }} 
                      domain={[0, 'auto']}
                    />
                    <YAxis 
                      yAxisId="right" 
                      orientation="right" 
                      label={{ value: "Feed (kg)", angle: 90, position: "insideRight" }} 
                    />
                    <Tooltip
						formatter={(value: number, name: string) => {
						 if (name === "Farm Target Weight") {
						     return [`${value.toFixed(3)} kg`, "Target Weight (farm, pre-catch)"];
						}
						return [`${value}`, name];
						}}
					/>

                    <Legend />
					<Line
					  yAxisId="left"
					  type="monotone"
					  dataKey="benchmarkWeight"
					  stroke="#6b7280"
					  strokeWidth={1.5}
					  strokeDasharray="2 2"
					  name="Industry Benchmark"
					  dot={false}
					/>

                    {/* Target weight line (dashed) */}
                    <Line 
                      yAxisId="left" 
                      type="monotone" 
                      dataKey="targetWeight" 
                      stroke="#f59e0b" 
                      strokeWidth={2} 
                      strokeDasharray="6 4"
                      name="Farm Target Weight" 
                      dot={false}
                    />
                    {/* Actual weight line (solid) */}
                    <Line 
                      yAxisId="left" 
                      type="monotone" 
                      dataKey="actualWeight" 
                      stroke="#16a34a" 
                      strokeWidth={3} 
                      name="Actual Weight" 
                      connectNulls={true}
                      dot={{ r: 4 }}
                    />
                    {/* Feed consumption */}
                    <Line 
                      yAxisId="right" 
                      type="monotone" 
                      dataKey="feedKg" 
                      stroke="#2563eb" 
                      strokeWidth={2} 
                      name="Feed Consumed" 
                      connectNulls={false}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[450px] items-center justify-center text-muted-foreground">
                  No growth data available. Add daily records to see performance charts.
                </div>
              )}
              
              {/* Legend explanation */}
              <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="h-0.5 w-8 bg-green-600"></div>
                  <span>Actual Weight (your flock)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-0.5 w-8 border-t-2 border-dashed border-gray-400"></div>
                  <span>Farm Target Weight (pre-catch)</span>
				  </div>
				  <div className="flex items-center gap-2">
					<div className="h-0.5 w-8 border-t-2 border-dashed border-gray-500"></div>
				    <span>Industry Benchmark (breed)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-0.5 w-8 bg-blue-600"></div>
                  <span>Daily Feed Consumption</span>
                </div>
              </div>
            </CardContent>
          </Card>
		  
		  {adwgData.length === 0 && (
				<div className="text-sm text-muted-foreground text-center py-4">
				ADWG requires at least two valid weight measurements.
				</div>
			)}
		  
		<Card>
  <CardHeader>
    <CardTitle>Average Daily Weight Gain vs Target</CardTitle>
    <CardDescription>
      Actual ADWG plotted against derived target day
    </CardDescription>
  </CardHeader>

  <CardContent>
      <ResponsiveContainer width="100%" height={300}>
  <LineChart data={adwgData}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis
      dataKey="targetDay"
      label={{ value: "Target Day", position: "insideBottom", offset: -5 }}
    />
    <YAxis
      label={{ value: "ADWG (kg/day)", angle: -90, position: "insideLeft" }}
    />
    <Tooltip />
    <Legend />
    <Line
      type="monotone"
      dataKey="actualADWG"
      name="Actual ADWG"
      stroke="#2563eb"
      strokeWidth={2}
    />
    <Line
      type="monotone"
      dataKey="targetADWG"
      name="Target ADWG"
      stroke="#16a34a"
      strokeDasharray="5 5"
    />
  </LineChart>
</ResponsiveContainer>

  </CardContent>
</Card>
        </TabsContent>

        {/* Health Records Tab */}
        <TabsContent value="health" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Health Records</CardTitle>
              <CardDescription>Track treatments, observations, and veterinary visits</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center text-muted-foreground py-8">
                Health records interface - Add health record form and table will be displayed here
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Vaccinations Tab */}
        <TabsContent value="vaccination" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Vaccination Schedule</CardTitle>
              <CardDescription>Planned vaccinations for this flock based on selected protocol</CardDescription>
            </CardHeader>
            <CardContent>
              {vaccinationSchedules && vaccinationSchedules.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Day</TableHead>
                      <TableHead>Vaccine</TableHead>
                      <TableHead>Disease Type</TableHead>
                      <TableHead>Application Method</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actual Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vaccinationSchedules.map((schedule: any) => (
                      <TableRow key={schedule.id}>
                        <TableCell className="font-medium">Day {schedule.scheduledDay}</TableCell>
                        <TableCell>{schedule.vaccine?.name || 'Unknown'}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {schedule.vaccine?.diseaseType?.replace(/_/g, ' ').toUpperCase() || 'N/A'}
                          </Badge>
                        </TableCell>
                        <TableCell className="capitalize">
                          {schedule.vaccine?.applicationMethod?.replace(/_/g, ' ') || 'N/A'}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={schedule.status === 'completed' ? 'default' : 
                                   schedule.status === 'missed' ? 'destructive' : 'secondary'}
                          >
                            {schedule.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {schedule.actualDate ? format(new Date(schedule.actualDate), 'dd MMM yyyy') : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  No vaccination schedule configured for this flock.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Stress Packs Tab */}
        <TabsContent value="stress-packs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Stress Pack Administration</CardTitle>
              <CardDescription>Planned stress pack administration periods for this flock</CardDescription>
            </CardHeader>
            <CardContent>
              {stressPackSchedules && stressPackSchedules.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Stress Pack</TableHead>
                      <TableHead>Start Day</TableHead>
                      <TableHead>End Day</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Dosage Strength</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Quantity Used</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stressPackSchedules.map((schedule: any) => (
                      <TableRow key={schedule.id}>
                        <TableCell className="font-medium">
                          Stress Pack #{schedule.stressPackId}
                        </TableCell>
                        <TableCell>Day {schedule.startDay}</TableCell>
                        <TableCell>Day {schedule.endDay}</TableCell>
                        <TableCell>{schedule.endDay - schedule.startDay + 1} days</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {schedule.dosageStrength}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={schedule.status === 'completed' ? 'default' : 
                                   schedule.status === 'active' ? 'secondary' : 
                                   schedule.status === 'cancelled' ? 'destructive' : 'outline'}
                          >
                            {schedule.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {schedule.quantityUsed || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  No stress pack schedule configured for this flock.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reminders Tab */}
        <TabsContent value="reminders" className="space-y-4">
          {/* Manage Templates Section */}
          <Card>
            <CardHeader>
              <CardTitle>Manage Reminder Templates</CardTitle>
              <CardDescription>Add or remove reminder templates for this flock</CardDescription>
            </CardHeader>
            <CardContent>
              {allTemplates && appliedTemplates ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {allTemplates.map((template: any) => {
                    const isApplied = appliedTemplates.includes(template.id);
                    return (
                      <div key={template.id} className="flex items-center space-x-2 p-3 border rounded-lg">
                        <input
                          type="checkbox"
                          checked={isApplied}
                          onChange={async (e) => {
                            try {
                              if (e.target.checked) {
                                await addTemplate.mutateAsync({ flockId, templateId: template.id });
                                toast.success(`Added template: ${template.name}`);
                              } else {
                                await removeTemplate.mutateAsync({ flockId, templateId: template.id });
                                toast.success(`Removed template: ${template.name}`);
                              }
                              utils.reminders.list.invalidate({ flockId });
                              utils.reminderTemplates.getAppliedTemplates.invalidate({ flockId });
                            } catch (error: any) {
                              toast.error(error.message);
                            }
                          }}
                          className="h-4 w-4"
                        />
                        <div className="flex-1">
                          <p className="font-medium">{template.name}</p>
                          <p className="text-sm text-muted-foreground">
                            Day {template.dayOffset} | {template.priority} priority
                          </p>
                        </div>
                        {isApplied && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              try {
                                const result = await syncFromTemplate.mutateAsync({ flockId, templateId: template.id });
                                toast.success(`Synced ${result.newReminderCount} reminders from template`);
                                utils.reminders.list.invalidate({ flockId });
                              } catch (error: any) {
                                toast.error(error.message);
                              }
                            }}
                            disabled={syncFromTemplate.isPending}
                          >
                            <RefreshCw className={`h-4 w-4 mr-1 ${syncFromTemplate.isPending ? 'animate-spin' : ''}`} />
                            Sync
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-muted-foreground">Loading templates...</p>
              )}
            </CardContent>
          </Card>

          {/* Active Reminders Section */}
          <Card>
            <CardHeader>
              <CardTitle>Active Reminders</CardTitle>
              <CardDescription>All reminders for this flock</CardDescription>
            </CardHeader>
            <CardContent>
              {flockReminders && flockReminders.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {flockReminders.map((reminder: any) => (
                      <TableRow key={reminder.id}>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {reminder.reminderType.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{reminder.title}</TableCell>
                        <TableCell>
                          {new Date(reminder.dueDate).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={reminder.priority === 'urgent' ? 'destructive' : 
                                   reminder.priority === 'high' ? 'default' : 
                                   reminder.priority === 'medium' ? 'secondary' : 'outline'}
                          >
                            {reminder.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={reminder.status === 'completed' ? 'default' : 
                                   reminder.status === 'dismissed' ? 'secondary' : 'outline'}
                          >
                            {reminder.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {reminder.status === 'pending' && (
                            <div className="flex gap-2">
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => setReminderActionDialog({ open: true, reminderId: reminder.id, action: "complete" })}
                                disabled={updateReminderStatus.isPending}
                              >
                                Complete
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost"
                                onClick={() => setReminderActionDialog({ open: true, reminderId: reminder.id, action: "dismiss" })}
                                disabled={updateReminderStatus.isPending}
                              >
                                Dismiss
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  No reminders for this flock.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Status History Tab */}
        <TabsContent value="status-history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Status Change History</CardTitle>
              <CardDescription>Complete audit trail of all status changes for this flock</CardDescription>
            </CardHeader>
            <CardContent>
              {statusHistory && statusHistory.length > 0 ? (
                <div className="space-y-3">
                  {statusHistory.map((entry, index) => (
                    <div key={index} className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">Status:</span>
                            <Badge variant={getStatusColor(entry.status)}>{entry.status}</Badge>
                          </div>
                          {entry.changedAt && (
                            <div className="text-sm text-muted-foreground">
                              {format(new Date(entry.changedAt), 'MMM d, yyyy \\at h:mm a')}
                            </div>
                          )}
                        </div>
                        <Badge variant={entry.isManual ? 'default' : 'secondary'}>
                          {entry.isManual ? 'Manual' : 'Automatic'}
                        </Badge>
                      </div>
                      {entry.changedBy && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Changed by:</span> {entry.changedBy}
                        </div>
                      )}
                      {entry.reason && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Reason:</span> {entry.reason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  No status changes recorded yet.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Reminder Action Dialog */}
      <Dialog open={reminderActionDialog.open} onOpenChange={(open) => !open && setReminderActionDialog({ open: false, reminderId: null, action: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reminderActionDialog.action === "complete" ? "Complete Reminder" : "Dismiss Reminder"}
            </DialogTitle>
            <DialogDescription>
              {reminderActionDialog.action === "complete"
                ? "Mark this reminder as completed. Add any notes about the action taken."
                : "Dismiss this reminder. Add a reason for dismissing if needed."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="action-notes">
                {reminderActionDialog.action === "complete" ? "Action Notes" : "Reason for Dismissal"}
              </Label>
              <Textarea
                id="action-notes"
                placeholder={reminderActionDialog.action === "complete" ? "Notes about the action taken..." : "Reason for dismissing..."}
                value={reminderActionNotes}
                onChange={(e) => setReminderActionNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReminderActionDialog({ open: false, reminderId: null, action: null })}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (reminderActionDialog.reminderId && reminderActionDialog.action) {
                  updateReminderStatus.mutate({
                    id: reminderActionDialog.reminderId,
                    status: reminderActionDialog.action === "complete" ? "completed" : "dismissed",
                    actionNotes: reminderActionNotes || undefined,
                  });
                }
              }}
              disabled={updateReminderStatus.isPending}
            >
              {updateReminderStatus.isPending ? "Updating..." : reminderActionDialog.action === "complete" ? "Complete" : "Dismiss"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


// Status Change Dialog Component
function StatusChangeDialog({ flockId, currentStatus }: { flockId: number; currentStatus: string }) {
  const [open, setOpen] = useState(false);
  const [newStatus, setNewStatus] = useState(currentStatus);
  const [reason, setReason] = useState("");
  const utils = trpc.useUtils();

  const changeStatus = trpc.flocks.changeStatus.useMutation({
    onSuccess: () => {
      utils.flocks.getById.invalidate({ id: flockId });
      utils.flocks.list.invalidate();
      toast.success("Flock status updated successfully");
      setOpen(false);
      setReason("");
    },
    onError: (error) => {
      toast.error(`Failed to update status: ${error.message}`);
    },
  });

  const handleSubmit = () => {
    if (!reason.trim()) {
      toast.error("Please provide a reason for the status change");
      return;
    }
    changeStatus.mutate({
      flockId,
      status: newStatus as "planned" | "active" | "completed" | "cancelled",
      reason,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Change Status</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Flock Status</DialogTitle>
          <DialogDescription>
            Manually override the flock status. This action will be logged in the audit trail.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="status">New Status</Label>
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="planned">Planned</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="reason">Reason for Change</Label>
            <Textarea
              id="reason"
              placeholder="e.g., Delayed placement due to weather, Early activation for house prep, etc."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={changeStatus.isPending}>
            {changeStatus.isPending ? "Updating..." : "Update Status"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
