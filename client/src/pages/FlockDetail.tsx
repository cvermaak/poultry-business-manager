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
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from "recharts";

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
  const { data: advancedGrowthMetrics } = trpc.flocks.getAdvancedGrowthMetrics.useQuery({ flockId });
  const { data: feedEfficiencyMetrics } = trpc.flocks.getFeedEfficiencyMetrics.useQuery({ flockId });
  const { data: targetGrowthCurve } = trpc.flocks.getTargetGrowthCurve.useQuery({ 
    flockId, 
    startDay: 0, 
    endDay: flock?.growingPeriod || 42 
  });
  const { data: vaccinationSchedules } = trpc.flocks.getVaccinationSchedules.useQuery({ flockId });
  const { data: stressPackSchedules } = trpc.flocks.getStressPackSchedules.useQuery({ flockId });
  const { data: flockReminders } = trpc.reminders.list.useQuery({ flockId });
  const { data: allTemplates } = trpc.reminderTemplates.list.useQuery();
  const { data: appliedTemplates } = trpc.reminderTemplates.getAppliedTemplates.useQuery({ flockId });
  const { data: statusHistory } = trpc.flocks.getStatusHistory.useQuery({ flockId });
  const { data: harvests } = trpc.harvest.getByFlock.useQuery({ flockId });
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

  const updateVaccinationSchedule = trpc.flocks.updateVaccinationSchedule.useMutation({
    onSuccess: () => {
      utils.flocks.getVaccinationSchedules.invalidate({ flockId });
      toast.success("Vaccination updated successfully");
      setVaccinationUpdateDialog({ open: false, scheduleId: null });
      setVaccinationUpdateForm({ actualDate: format(new Date(), "yyyy-MM-dd"), dosageUsed: "", notes: "" });
    },
    onError: (error) => {
      toast.error(`Failed to update vaccination: ${error.message}`);
    },
  });

  const updateStressPackSchedule = trpc.flocks.updateStressPackSchedule.useMutation({
    onSuccess: () => {
      utils.flocks.getStressPackSchedules.invalidate({ flockId });
      toast.success("Stress pack usage recorded successfully");
      setStressPackUpdateDialog({ open: false, scheduleId: null });
      setStressPackUpdateForm({ status: "active", quantityUsed: "", notes: "" });
    },
    onError: (error) => {
      toast.error(`Failed to update stress pack: ${error.message}`);
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
  const [vaccinationUpdateDialog, setVaccinationUpdateDialog] = useState<{ open: boolean; scheduleId: number | null }>({ open: false, scheduleId: null });
  const [stressPackUpdateDialog, setStressPackUpdateDialog] = useState<{ open: boolean; scheduleId: number | null }>({ open: false, scheduleId: null });
  const [reminderActionDialog, setReminderActionDialog] = useState<{ open: boolean; reminderId: number | null; action: "complete" | "dismiss" | null }>({ open: false, reminderId: null, action: null });
  const [reminderActionNotes, setReminderActionNotes] = useState("");

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

  // Form states for vaccination update
  const [vaccinationUpdateForm, setVaccinationUpdateForm] = useState({
    actualDate: format(new Date(), "yyyy-MM-dd"),
    dosageUsed: "",
    notes: "",
  });

  // Form states for stress pack update
  const [stressPackUpdateForm, setStressPackUpdateForm] = useState({
    status: "active" as "scheduled" | "active" | "completed" | "cancelled",
    quantityUsed: "",
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

  if (flockLoading) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center">
          <div className="text-muted-foreground">Loading flock details...</div>
        </div>
      </div>
    );
  }

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

  // Prepare chart data - merge actual and target data
  // Treat weight of 0 as "not weighed" (null) so chart skips those days
  const actualData = dailyRecords?.map((record) => {
    const weight = record.averageWeight ? parseFloat(record.averageWeight.toString()) : 0;
    return {
      day: record.dayNumber,
      actualWeight: weight > 0 ? weight : null, // Only plot actual measurements, not zeros
      mortality: record.mortality,
      feed: record.feedConsumed ? parseFloat(record.feedConsumed.toString()) : 0,
    };
  }) || [];

  // Create a complete dataset combining actual and target data
  const maxDay = Math.max(
    ...(actualData.map(d => d.day)),
    ...(targetGrowthCurve?.map(d => d.day) || []),
    flock?.growingPeriod || 42
  );

  const chartData: Array<{
    day: number;
    actualWeight: number | null;
    targetWeight: number;
    farmTargetWeight: number | null;
    feed: number | null;
  }> = [];

  // Parse target weights if they exist
  const finalTargetCatchingWeight = flock?.targetCatchingWeight ? parseFloat(flock.targetCatchingWeight.toString()) : null;
  const growingPeriod = flock?.growingPeriod || 42;

  for (let day = 0; day <= maxDay; day++) {
    const actual = actualData.find(d => d.day === day);
    const target = targetGrowthCurve?.find(d => d.day === day);

    // Calculate farm target weight growth curve (catching weight with shrinkage buffer)
    const farmTargetWeightForDay = finalTargetCatchingWeight 
      ? (finalTargetCatchingWeight / growingPeriod) * day 
      : null;

    chartData.push({
      day,
      actualWeight: actual?.actualWeight || null,
      targetWeight: target?.targetWeight || 0,
      farmTargetWeight: farmTargetWeightForDay,
      feed: actual?.feed || null,
    });
  }

  // Calculate performance status
  // Find the latest record that has an actual weight measurement (not null)
  const latestActual = [...actualData].reverse().find(d => d.actualWeight !== null);

  // Calculate projected catch date based on ADG
  let projectedCatchDay: number | null = null;
  if (finalTargetCatchingWeight && advancedGrowthMetrics && advancedGrowthMetrics.avgDailyGain > 0 && latestActual) {
    const latestWeight = latestActual.actualWeight || 0;
    const latestDay = latestActual.day || 0;
    const remainingWeight = finalTargetCatchingWeight - latestWeight;
    const avgDailyGainKg = advancedGrowthMetrics.avgDailyGain / 1000; // Convert grams to kg
    const daysToTarget = remainingWeight / avgDailyGainKg;
    projectedCatchDay = Math.round(latestDay + daysToTarget);
    
    // Ensure projected day is within reasonable range
    if (projectedCatchDay < latestDay || projectedCatchDay > growingPeriod + 14) {
      projectedCatchDay = null; // Invalid projection
    }
  }
  const performanceDeviation = latestActual && latestActual.actualWeight && targetGrowthCurve
    ? ((latestActual.actualWeight - (targetGrowthCurve.find(t => t.day === latestActual.day)?.targetWeight || 0)) / 
       (targetGrowthCurve.find(t => t.day === latestActual.day)?.targetWeight || 1)) * 100
    : 0;

  const getPerformanceStatus = (deviation: number) => {
    if (deviation >= 5) return { label: 'Ahead of Target', color: 'text-green-600', bgColor: 'bg-green-50' };
    if (deviation >= -5) return { label: 'On Track', color: 'text-blue-600', bgColor: 'bg-blue-50' };
    if (deviation >= -10) return { label: 'Behind Target', color: 'text-yellow-600', bgColor: 'bg-yellow-50' };
    return { label: 'Critical - Action Required', color: 'text-red-600', bgColor: 'bg-red-50' };
  };

  const performanceStatus = getPerformanceStatus(performanceDeviation);

  const getStatusColor = (status: string): "default" | "secondary" | "destructive" | "outline" | "warning" | "success" => {
    switch (status) {
      case "active":
        return "warning"; // Amber/orange - in progress
      case "completed":
        return "success"; // Green - success
      case "planned":
        return "outline"; // No color - neutral
      case "cancelled":
        return "destructive"; // Red - terminated
      default:
        return "outline";
    }
  };

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
              Target: {performanceMetrics?.targetWeight || 0} kg
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

      {/* Ready for Harvest Indicator */}
      {(() => {
        const latestRecord = dailyRecords?.[dailyRecords.length - 1];
        const currentWeight = latestRecord?.averageWeight ? parseFloat(latestRecord.averageWeight.toString()) : 0;
        const targetDeliveredWeight = flock.targetDeliveredWeight ? parseFloat(flock.targetDeliveredWeight.toString()) : 0;
        const targetCatchingWeight = targetDeliveredWeight * 1.055; // 5.5% shrinkage buffer
        
        // Calculate ADG from daily records
        let adg = 50; // Default fallback
        if (dailyRecords && dailyRecords.length >= 2) {
          const recordsWithWeight = dailyRecords.filter(r => r.averageWeight && parseFloat(r.averageWeight.toString()) > 0);
          if (recordsWithWeight.length >= 2) {
            const firstRecord = recordsWithWeight[0];
            const lastRecord = recordsWithWeight[recordsWithWeight.length - 1];
            const weightGain = parseFloat(lastRecord.averageWeight!.toString()) - parseFloat(firstRecord.averageWeight!.toString());
            const daysDiff = lastRecord.dayNumber - firstRecord.dayNumber;
            if (daysDiff > 0) {
              adg = (weightGain * 1000) / daysDiff; // Convert kg to grams
            }
          }
        }
        
        if (currentWeight > 0 && targetDeliveredWeight > 0) {
          const weightProgress = (currentWeight / targetCatchingWeight) * 100;
          const isReadyForHarvest = weightProgress >= 95; // Ready when 95% or more of target
          const daysToTarget = isReadyForHarvest ? 0 : Math.ceil((targetCatchingWeight - currentWeight) / (adg / 1000));
          
          if (isReadyForHarvest || weightProgress >= 85) {
            return (
              <Card className={`mb-6 ${isReadyForHarvest ? 'border-green-500 bg-green-50 dark:bg-green-950' : 'border-orange-500 bg-orange-50 dark:bg-orange-950'}`}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {isReadyForHarvest ? (
                      <>
                        <TrendingUp className="h-5 w-5 text-green-600" />
                        Ready for Harvest
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-5 w-5 text-orange-600" />
                        Approaching Target Weight
                      </>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {isReadyForHarvest
                      ? 'Birds have reached target catching weight and are ready for harvest'
                      : `Birds are ${weightProgress.toFixed(1)}% of target weight`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <p className="text-sm text-muted-foreground">Current Weight</p>
                      <p className="text-2xl font-bold">{currentWeight.toFixed(3)} kg</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Target Catching Weight</p>
                      <p className="text-2xl font-bold">{targetCatchingWeight.toFixed(3)} kg</p>
                      <p className="text-xs text-muted-foreground">Includes 5.5% shrinkage buffer</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{isReadyForHarvest ? 'Action Required' : 'Estimated Days to Target'}</p>
                      <p className="text-2xl font-bold">{isReadyForHarvest ? 'Schedule Catch' : `~${daysToTarget} days`}</p>
                      {!isReadyForHarvest && (
                        <p className="text-xs text-muted-foreground">Based on current ADG: {adg.toFixed(1)}g/day</p>
                      )}
                    </div>
                  </div>
                  {isReadyForHarvest && (
                    <div className="mt-4">
                      <Button onClick={() => window.location.href = '/harvests'} className="w-full md:w-auto">
                        Record Harvest
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          }
        }
        return null;
      })()}

      {/* Tabbed Content */}
      <Tabs defaultValue="daily" className="space-y-4">
        <TabsList>
          <TabsTrigger value="daily">Daily Records</TabsTrigger>
          <TabsTrigger value="growth">Growth Performance</TabsTrigger>
          <TabsTrigger value="health">Health Records</TabsTrigger>
          <TabsTrigger value="vaccination">Vaccinations</TabsTrigger>
          <TabsTrigger value="stress-packs">Stress Packs</TabsTrigger>
          <TabsTrigger value="harvests">Harvest Records</TabsTrigger>
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
          {/* Performance Status Card */}
          {latestActual && (
            <Card className={performanceStatus.bgColor}>
              <CardHeader>
                <CardTitle className={performanceStatus.color}>Performance Status: {performanceStatus.label}</CardTitle>
                <CardDescription>
                  Current deviation from target: {performanceDeviation.toFixed(1)}%
                  {latestActual && latestActual.actualWeight && (
                    <span className="ml-2">
                      (Day {latestActual.day}: {latestActual.actualWeight.toFixed(3)}kg actual vs {targetGrowthCurve?.find(t => t.day === latestActual.day)?.targetWeight.toFixed(3)}kg target)
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
            </Card>
          )}

          {/* Advanced Growth Metrics Cards */}
          {advancedGrowthMetrics && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Avg Daily Gain</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{advancedGrowthMetrics.avgDailyGain}g</div>
                  <p className="text-xs text-muted-foreground">Per day weight increase</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Uniformity Index</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {advancedGrowthMetrics.uniformityIndex !== null ? `${advancedGrowthMetrics.uniformityIndex}%` : "N/A"}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {advancedGrowthMetrics.uniformityIndex !== null 
                      ? advancedGrowthMetrics.uniformityIndex >= 85 ? "Excellent" : advancedGrowthMetrics.uniformityIndex >= 75 ? "Good" : "Needs improvement"
                      : "Need 3+ weight samples"}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Projected Weight</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{advancedGrowthMetrics.projectedFinalWeight.toFixed(3)}kg</div>
                  <p className="text-xs text-muted-foreground">At day {flock?.growingPeriod || 42}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">EPI Score</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{advancedGrowthMetrics.epi}</div>
                  <p className="text-xs text-muted-foreground">
                    {advancedGrowthMetrics.epi >= 350 ? "Excellent" : advancedGrowthMetrics.epi >= 300 ? "Good" : advancedGrowthMetrics.epi >= 250 ? "Average" : "Below target"}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Livability</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{advancedGrowthMetrics.livability.toFixed(2)}%</div>
                  <p className="text-xs text-muted-foreground">Survival rate</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Feed Efficiency Metrics Cards */}
          {feedEfficiencyMetrics && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Avg Feed/Bird</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{feedEfficiencyMetrics.avgFeedPerBird}g</div>
                  <p className="text-xs text-muted-foreground">Per day per bird</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Water:Feed Ratio</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{feedEfficiencyMetrics.avgWaterFeedRatio}:1</div>
                  <p className="text-xs text-muted-foreground">
                    {feedEfficiencyMetrics.avgWaterFeedRatio >= 1.8 && feedEfficiencyMetrics.avgWaterFeedRatio <= 2.2 ? "Normal range" : "Check water system"}
                  </p>
                </CardContent>
              </Card>
              {feedEfficiencyMetrics.feedTypePerformance.map((phase: any) => (
                <Card key={phase.feedType}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium capitalize">{phase.feedType} FCR</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{phase.fcr}</div>
                    <p className="text-xs text-muted-foreground">
                      {phase.weightGain}g gain over {phase.days} days
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

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
                      formatter={(value: any, name: string) => {
                        if (name === "Actual Weight" || name === "Target Weight") {
                          return value ? `${parseFloat(value).toFixed(3)} kg` : 'No data';
                        }
                        return value ? `${parseFloat(value).toFixed(2)} kg` : 'No data';
                      }}
                    />
                               {/* Target weight line (dashed) */}
                    <Line 
                      yAxisId="left" 
                      type="monotone" 
                      dataKey="targetWeight" 
                      stroke="#9ca3af" 
                      strokeWidth={2} 
                      strokeDasharray="5 5" 
                      name="Target Weight" 
                      dot={false}
                    />
                    {/* Farm Target Weight (orange dashed) - includes shrinkage buffer */}
                    {finalTargetCatchingWeight && (
                      <Line 
                        yAxisId="left" 
                        type="monotone" 
                        dataKey="farmTargetWeight" 
                        stroke="#f97316" 
                        strokeWidth={2} 
                        strokeDasharray="8 4" 
                        name="Farm Target Weight" 
                        dot={false}
                      />
                    )}
                    {/* Actual weight line (solid) */}
                    <Line 
                      yAxisId="left" 
                      type="monotone" 
                      dataKey="actualWeight" 
                      stroke="#16a34a" 
                      strokeWidth={3} 
                      name="Actual Weight" 
                      connectNulls={true}
                      dot={{ r: 4, fill: "#16a34a" }}
                    />
                    {/* Feed consumption line (right axis) */}
                    <Line 
                      yAxisId="right" 
                      type="monotone" 
                      dataKey="feed" 
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
                  <span>Industry Benchmark (Ross 308/Cobb 500)</span>
                </div>
                {finalTargetCatchingWeight && (
                  <div className="flex items-center gap-2">
                    <div className="h-0.5 w-8 border-t-2 border-dashed border-orange-500"></div>
                    <span>Farm Target Weight (pre-catch)</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <div className="h-0.5 w-8 bg-blue-600"></div>
                  <span>Daily Feed Consumption</span>
                </div>
              </div>
              
              {/* Projected catch date indicator */}
              {projectedCatchDay && finalTargetCatchingWeight && (
                <div className="mt-3 p-3 bg-green-50 dark:bg-green-950 rounded-md text-sm">
                  <p className="font-medium text-green-900 dark:text-green-100">📅 Projected Ready Date:</p>
                  <p className="mt-1 text-muted-foreground">
                    Based on current growth rate ({advancedGrowthMetrics?.avgDailyGain}g/day), 
                    birds are projected to reach target weight ({finalTargetCatchingWeight.toFixed(3)} kg) 
                    on <span className="font-semibold text-foreground">Day {projectedCatchDay}</span>
                    {projectedCatchDay !== growingPeriod && (
                      <span className="ml-1">
                        ({projectedCatchDay < growingPeriod ? 'ahead of' : 'behind'} planned Day {growingPeriod})
                      </span>
                    )}
                  </p>
                </div>
              )}
              
              {/* Shrinkage explanation */}
              {finalTargetCatchingWeight && flock?.targetDeliveredWeight && (
                <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950 rounded-md text-sm">
                  <p className="font-medium">Weight Planning:</p>
                  <p className="mt-1 text-muted-foreground">
                    Farm target weight ({finalTargetCatchingWeight.toFixed(3)} kg) includes a 5.5% shrinkage buffer 
                    to ensure delivered weight ({parseFloat(flock.targetDeliveredWeight.toString()).toFixed(3)} kg) meets contract requirements 
                    after feed withdrawal, catching stress, and transport losses.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Daily Weight Gain (ADG) Trend Chart */}
          {advancedGrowthMetrics && advancedGrowthMetrics.adgData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Daily Weight Gain Trend</CardTitle>
                <CardDescription>Average daily weight gain (grams per day) throughout the growing period</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={advancedGrowthMetrics.adgData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="day" 
                      label={{ value: "Age (Days)", position: "insideBottom", offset: -5 }} 
                    />
                    <YAxis 
                      label={{ value: "Daily Gain (g)", angle: -90, position: "insideLeft" }} 
                    />
                    <Tooltip 
                      formatter={(value: any) => `${value}g`}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="dailyGain" 
                      stroke="#16a34a" 
                      strokeWidth={2} 
                      name="Daily Weight Gain" 
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
                <div className="mt-4 text-sm text-muted-foreground">
                  <p>Average Daily Gain: <span className="font-semibold text-foreground">{advancedGrowthMetrics.avgDailyGain}g/day</span></p>
                  <p className="mt-1 text-xs">Industry benchmark: 50-60g/day for broilers</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Feed Efficiency Charts */}
          {feedEfficiencyMetrics && feedEfficiencyMetrics.feedIntakeData.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Daily Feed Intake per Bird</CardTitle>
                  <CardDescription>Feed consumption per bird per day (grams)</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={feedEfficiencyMetrics.feedIntakeData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="day" 
                        label={{ value: "Age (Days)", position: "insideBottom", offset: -5 }} 
                      />
                      <YAxis 
                        label={{ value: "Feed (g)", angle: -90, position: "insideLeft" }} 
                      />
                      <Tooltip 
                        formatter={(value: any) => `${value}g`}
                      />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="feedPerBird" 
                        stroke="#2563eb" 
                        strokeWidth={2} 
                        name="Feed per Bird" 
                        dot={{ r: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Water-to-Feed Ratio</CardTitle>
                  <CardDescription>Daily water consumption relative to feed (optimal: 1.8-2.0)</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={feedEfficiencyMetrics.waterFeedRatioData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="day" 
                        label={{ value: "Age (Days)", position: "insideBottom", offset: -5 }} 
                      />
                      <YAxis 
                        label={{ value: "Ratio", angle: -90, position: "insideLeft" }} 
                        domain={[0, 3]}
                      />
                      <Tooltip 
                        formatter={(value: any) => `${value}:1`}
                      />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="ratio" 
                        stroke="#0891b2" 
                        strokeWidth={2} 
                        name="Water:Feed Ratio" 
                        dot={{ r: 2 }}
                      />
                      {/* Reference line for optimal range */}
                      <Line 
                        type="monotone" 
                        data={[{ day: 0, optimal: 1.9 }, { day: 42, optimal: 1.9 }]} 
                        dataKey="optimal" 
                        stroke="#22c55e" 
                        strokeWidth={1} 
                        strokeDasharray="5 5" 
                        name="Optimal (1.9)" 
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="mt-4 text-sm text-muted-foreground">
                    <p>Average Ratio: <span className="font-semibold text-foreground">{feedEfficiencyMetrics.avgWaterFeedRatio}:1</span></p>
                    <p className="mt-1 text-xs">Normal range: 1.8-2.2 (higher may indicate heat stress or water system issues)</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Health Records Tab */}
        <TabsContent value="health" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Health Records</CardTitle>
                <CardDescription>Track treatments, observations, and veterinary visits</CardDescription>
              </div>
              <Button
                onClick={() => {
                  setHealthRecordDialogOpen(true);
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
                }}
              >
                Add Health Record
              </Button>
            </CardHeader>
            <CardContent>
              {healthRecords && healthRecords.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Treatment</TableHead>
                      <TableHead>Medication</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {healthRecords.map((record: any) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">
                          {format(new Date(record.eventDate), 'dd MMM yyyy')}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {record.eventType?.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-xs truncate">{record.description}</TableCell>
                        <TableCell className="max-w-xs truncate">{record.treatment || '-'}</TableCell>
                        <TableCell>{record.medicationUsed || '-'}</TableCell>
                        <TableCell>{record.cost ? `R${parseFloat(record.cost).toFixed(2)}` : '-'}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setHealthRecordDialogOpen(true);
                              setHealthRecordForm({
                                recordDate: format(new Date(record.eventDate), "yyyy-MM-dd"),
                                recordType: record.eventType,
                                description: record.description || "",
                                treatment: record.treatment || "",
                                medication: record.medication || "",
                                dosage: record.dosage || "",
                                veterinarianName: record.veterinarianName || "",
                                cost: parseFloat(record.cost) || 0,
                                notes: record.notes || "",
                              });
                            }}
                          >
                            View/Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  No health records yet. Click "Add Health Record" to create one.
                </div>
              )}
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
                      <TableHead className="text-right">Actions</TableHead>
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
                        <TableCell className="text-right">
                          {schedule.status !== 'completed' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setVaccinationUpdateDialog({ open: true, scheduleId: schedule.id });
                                setVaccinationUpdateForm({
                                  actualDate: format(new Date(), "yyyy-MM-dd"),
                                  dosageUsed: schedule.vaccine?.dosage || "",
                                  notes: "",
                                });
                              }}
                            >
                              Mark Completed
                            </Button>
                          )}
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
                      <TableHead className="text-right">Actions</TableHead>
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
                        <TableCell className="text-right">
                          {schedule.status !== 'completed' && schedule.status !== 'cancelled' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setStressPackUpdateDialog({ open: true, scheduleId: schedule.id });
                                setStressPackUpdateForm({
                                  status: schedule.status || "active",
                                  quantityUsed: schedule.quantityUsed || "",
                                  notes: "",
                                });
                              }}
                            >
                              Record Usage
                            </Button>
                          )}
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

        {/* Harvest Records Tab */}
        <TabsContent value="harvests" className="space-y-4">
          {(() => {
            const totalHarvested = harvests?.reduce((sum, h) => sum + h.chickenCountLoaded, 0) || 0;
            const totalDeliveredWeight = harvests?.reduce((sum, h) => sum + (parseFloat(h.totalDeliveredWeightKg?.toString() || "0")), 0) || 0;
            const avgDeliveredWeight = totalHarvested > 0 ? totalDeliveredWeight / totalHarvested : 0;
            const avgShrinkage = harvests?.length
              ? harvests.reduce((sum, h) => sum + (parseFloat(h.shrinkagePercentage?.toString() || "0")), 0) / harvests.length
              : 0;

            return (
              <>
                {/* Summary Cards */}
                <div className="grid gap-4 md:grid-cols-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Total Harvested</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{totalHarvested.toLocaleString()}</div>
                      <p className="text-xs text-muted-foreground">Birds caught</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Remaining Birds</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{flock?.currentCount.toLocaleString()}</div>
                      <p className="text-xs text-muted-foreground">Still in house</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Avg Delivered Weight</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{avgDeliveredWeight.toFixed(3)} kg</div>
                      <p className="text-xs text-muted-foreground">Per bird</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Avg Shrinkage</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{avgShrinkage.toFixed(2)}%</div>
                      <p className="text-xs text-muted-foreground">Weight loss</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Harvest Records Table */}
                <Card>
                  <CardHeader>
                    <CardTitle>Harvest Records</CardTitle>
                    <CardDescription>All catch records for this flock</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {harvests && harvests.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Destination</TableHead>
                            <TableHead className="text-right">Birds Loaded</TableHead>
                            <TableHead className="text-right">Loaded Weight</TableHead>
                            <TableHead className="text-right">Delivered Weight</TableHead>
                            <TableHead className="text-right">Shrinkage</TableHead>
                            <TableHead className="text-right">Revenue</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {harvests.map((harvest: any) => (
                            <TableRow key={harvest.id}>
                              <TableCell>{new Date(harvest.harvestDate).toLocaleDateString()}</TableCell>
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
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        <p>No harvest records yet</p>
                        <p className="text-sm">Go to Harvests page to record bird catches</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            );
          })()}
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

      {/* Vaccination Update Dialog */}
      <Dialog open={vaccinationUpdateDialog.open} onOpenChange={(open) => setVaccinationUpdateDialog({ open, scheduleId: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Vaccination as Completed</DialogTitle>
            <DialogDescription>
              Record the actual administration date and details for this vaccination.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="actualDate">Actual Date Administered</Label>
              <Input
                id="actualDate"
                type="date"
                value={vaccinationUpdateForm.actualDate}
                onChange={(e) => setVaccinationUpdateForm({ ...vaccinationUpdateForm, actualDate: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="dosageUsed">Dosage Used (optional)</Label>
              <Input
                id="dosageUsed"
                placeholder="e.g., 1000 doses, 2ml per bird"
                value={vaccinationUpdateForm.dosageUsed}
                onChange={(e) => setVaccinationUpdateForm({ ...vaccinationUpdateForm, dosageUsed: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="vaccinationNotes">Notes (optional)</Label>
              <Textarea
                id="vaccinationNotes"
                placeholder="Any observations, issues, or additional details..."
                value={vaccinationUpdateForm.notes}
                onChange={(e) => setVaccinationUpdateForm({ ...vaccinationUpdateForm, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVaccinationUpdateDialog({ open: false, scheduleId: null })}>Cancel</Button>
            <Button
              onClick={() => {
                if (vaccinationUpdateDialog.scheduleId) {
                  updateVaccinationSchedule.mutate({
                    id: vaccinationUpdateDialog.scheduleId,
                    administeredDate: new Date(vaccinationUpdateForm.actualDate),
                    status: "completed",
                    notes: vaccinationUpdateForm.notes || undefined,
                  });
                }
              }}
              disabled={updateVaccinationSchedule.isPending}
            >
              {updateVaccinationSchedule.isPending ? "Saving..." : "Mark as Completed"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stress Pack Update Dialog */}
      <Dialog open={stressPackUpdateDialog.open} onOpenChange={(open) => setStressPackUpdateDialog({ open, scheduleId: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Stress Pack Usage</DialogTitle>
            <DialogDescription>
              Update the status and quantity used for this stress pack administration period.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="stressPackStatus">Status</Label>
              <Select 
                value={stressPackUpdateForm.status} 
                onValueChange={(value) => setStressPackUpdateForm({ ...stressPackUpdateForm, status: value as "scheduled" | "active" | "completed" | "cancelled" })}
              >
                <SelectTrigger id="stressPackStatus">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="quantityUsed">Quantity Used</Label>
              <Input
                id="quantityUsed"
                placeholder="e.g., 5kg, 10 liters, 200g per 1000 birds"
                value={stressPackUpdateForm.quantityUsed}
                onChange={(e) => setStressPackUpdateForm({ ...stressPackUpdateForm, quantityUsed: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="stressPackNotes">Notes (optional)</Label>
              <Textarea
                id="stressPackNotes"
                placeholder="Any observations, issues, or additional details..."
                value={stressPackUpdateForm.notes}
                onChange={(e) => setStressPackUpdateForm({ ...stressPackUpdateForm, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStressPackUpdateDialog({ open: false, scheduleId: null })}>Cancel</Button>
            <Button
              onClick={() => {
                if (stressPackUpdateDialog.scheduleId) {
                  updateStressPackSchedule.mutate({
                    id: stressPackUpdateDialog.scheduleId,
                    status: stressPackUpdateForm.status,
                    quantityUsed: stressPackUpdateForm.quantityUsed || undefined,
                    notes: stressPackUpdateForm.notes || undefined,
                  });
                }
              }}
              disabled={updateStressPackSchedule.isPending}
            >
              {updateStressPackSchedule.isPending ? "Saving..." : "Save Usage"}
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
