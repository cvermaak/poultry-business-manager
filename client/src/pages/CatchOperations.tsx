import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { toast } from "sonner";
import { Loader2, Play, CheckCircle, Package, TrendingUp, Weight, Edit, Trash2, FileText } from "lucide-react";
import { DensityCalculator } from "@/components/DensityCalculator";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function CatchOperations() {
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [completionNotes, setCompletionNotes] = useState("");
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [reportSessionId, setReportSessionId] = useState<number | null>(null);
  const [reportFarmName, setReportFarmName] = useState("");
  const [reportProcessingDate, setReportProcessingDate] = useState(new Date().toISOString().split("T")[0]);
  const [reportLotNumber, setReportLotNumber] = useState("");
  const [reportTransporter, setReportTransporter] = useState("");

  // Start Session Form State
  const [selectedFlockId, setSelectedFlockId] = useState<string>("");
  const [catchDate, setCatchDate] = useState(new Date().toISOString().split("T")[0]);
  const [catchTeam, setCatchTeam] = useState("");
  const [weighingMethod, setWeighingMethod] = useState<"individual" | "digital_scale_stack" | "platform_scale">("individual");
  const [palletWeight, setPalletWeight] = useState("");
  const [targetBirds, setTargetBirds] = useState("");
  const [targetWeight, setTargetWeight] = useState("");
  
  // Planned distribution from density calculator
  const [plannedDistribution, setPlannedDistribution] = useState<{
    crateTypeId: number;
    season: string;
    transportDurationHours?: number;
    plannedStandardDensity: number;
    plannedStandardCrates: number;
    plannedOddDensity: number;
    plannedOddCrates: number;
    plannedTotalBirds: number;
    availableCrates: number;
  } | null>(null);

  // Add Crate Form State
  const [selectedCrateTypeId, setSelectedCrateTypeId] = useState<string>("");
  const [birdCount, setBirdCount] = useState("");
  const [grossWeight, setGrossWeight] = useState("");
  const [season, setSeason] = useState<"summer" | "winter">("winter");
  const [transportDuration, setTransportDuration] = useState("");
  
  // Batch Weighing Form State
  const [numberOfCrates, setNumberOfCrates] = useState("");
  const [birdsPerCrate, setBirdsPerCrate] = useState("");
  const [totalGrossWeight, setTotalGrossWeight] = useState("");
  const [crateWeight, setCrateWeight] = useState("");
  const [batchPalletWeight, setBatchPalletWeight] = useState("");

  // Queries
  const { data: flocks } = trpc.flocks.list.useQuery();
  const { data: crateTypes } = trpc.catch.listCrateTypes.useQuery();
  const { data: completedSessions } = trpc.catch.listCatchSessions.useQuery(
    { status: "completed" },
    { refetchInterval: 30000 } // Refetch every 30 seconds
  );

  // Auto-populate crate weight when crate type is selected
  useEffect(() => {
    if (selectedCrateTypeId && crateTypes) {
      const selectedCrate = crateTypes.find(ct => ct.id === parseInt(selectedCrateTypeId));
      if (selectedCrate) {
        setCrateWeight(selectedCrate.tareWeight);
      }
    }
  }, [selectedCrateTypeId, crateTypes]);
  const { data: sessionDetails, refetch: refetchSession, isLoading: isLoadingSession, error: sessionError } = trpc.catch.getCatchSessionDetails.useQuery(
    { sessionId: activeSessionId! },
    { enabled: !!activeSessionId, retry: 1 }
  );

  // Get recommendation when crate type and flock are selected
  const { data: recommendation } = trpc.catch.calculateRecommendedBirdsPerCrate.useQuery(
    {
      flockId: selectedFlockId ? parseInt(selectedFlockId) : 0,
      crateTypeId: selectedCrateTypeId ? parseInt(selectedCrateTypeId) : 0,
      season,
      transportDurationHours: transportDuration ? parseFloat(transportDuration) : undefined,
    },
    {
      enabled: !!selectedFlockId && !!selectedCrateTypeId && !!activeSessionId,
    }
  );

  // Mutations
  const startSession = trpc.catch.startCatchSession.useMutation({
    onSuccess: (data) => {
      setActiveSessionId(data.sessionId);
      setShowStartDialog(false);
      toast.success("Catch session started successfully");
      // Reset form
      setSelectedFlockId("");
      setCatchDate(new Date().toISOString().split("T")[0]);
      setCatchTeam("");
      setTargetBirds("");
      setTargetWeight("");
    },
    onError: (error) => {
      toast.error(`Failed to start session: ${error.message}`);
    },
  });

  const addCrate = trpc.catch.addCatchCrate.useMutation({
    onSuccess: (data) => {
      toast.success(`Crate #${data.crateNumber} recorded: ${data.netWeight.toFixed(2)} kg net weight`);
      refetchSession();
      // Reset crate form but keep crate type selected
      setBirdCount("");
      setGrossWeight("");
    },
    onError: (error) => {
      toast.error(`Failed to add crate: ${error.message}`);
    },
  });

  const addCrateBatch = trpc.catch.addCatchCrateBatch.useMutation({
    onSuccess: (data) => {
      toast.success(`Batch #${data.batchNumber} recorded: ${data.cratesInBatch} crates, ${data.totalBirds} birds, ${data.totalNetWeight.toFixed(1)} kg net weight`);
      refetchSession();
      // Reset batch form but keep crate weight (it's usually the same for all batches)
      setNumberOfCrates("");
      setBirdsPerCrate("");
      setTotalGrossWeight("");
      // Don't reset crateWeight - keep it for next batch
      setBatchPalletWeight("");
    },
    onError: (error) => {
      toast.error(`Failed to add batch: ${error.message}`);
    },
  });

  const deleteBatch = trpc.catch.deleteCatchBatch.useMutation({
    onSuccess: () => {
      toast.success("Batch deleted successfully");
      refetchSession();
    },
    onError: (error) => {
      toast.error(`Failed to delete batch: ${error.message}`);
    },
  });

  const completeSession = trpc.catch.completeCatchSession.useMutation({
    onSuccess: (data) => {
      toast.success(`Session completed! Harvest record #${data.harvestRecordId} created`);
      setActiveSessionId(null);
      setShowCompleteDialog(false);
      setCompletionNotes("");
    },
    onError: (error) => {
      toast.error(`Failed to complete session: ${error.message}`);
    },
  });

  const generateReport = trpc.catch.generateTransportReport.useMutation({
    onSuccess: (data) => {
      // Convert base64 to blob and download
      const byteCharacters = atob(data.docBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = data.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success("Transport report generated successfully");
      setShowReportDialog(false);
      // Reset form
      setReportFarmName("");
      setReportProcessingDate(new Date().toISOString().split("T")[0]);
      setReportLotNumber("");
      setReportTransporter("");
    },
    onError: (error) => {
      toast.error(`Failed to generate report: ${error.message}`);
    },
  });

  const handleStartSession = () => {
    if (!selectedFlockId) {
      toast.error("Please select a flock");
      return;
    }

    startSession.mutate({
      flockId: parseInt(selectedFlockId),
      catchDate,
      catchTeam: catchTeam || undefined,
      weighingMethod,
      palletWeight: palletWeight ? parseFloat(palletWeight) : undefined,
      targetBirds: targetBirds ? parseInt(targetBirds) : undefined,
      targetWeight: targetWeight ? parseFloat(targetWeight) : undefined,
      // Include planned distribution if calculated
      ...( plannedDistribution ? {
        crateTypeId: plannedDistribution.crateTypeId,
        season: plannedDistribution.season,
        transportDurationHours: plannedDistribution.transportDurationHours,
        plannedStandardDensity: plannedDistribution.plannedStandardDensity,
        plannedStandardCrates: plannedDistribution.plannedStandardCrates,
        plannedOddDensity: plannedDistribution.plannedOddDensity,
        plannedOddCrates: plannedDistribution.plannedOddCrates,
        plannedTotalBirds: plannedDistribution.plannedTotalBirds,
        availableCrates: plannedDistribution.availableCrates,
      } : {}),
    });
  };

  const handleAddCrate = () => {
    if (!activeSessionId) {
      toast.error("No active session");
      return;
    }
    if (!selectedCrateTypeId) {
      toast.error("Please select a crate type");
      return;
    }
    if (!birdCount || !grossWeight) {
      toast.error("Please enter bird count and gross weight");
      return;
    }

    addCrate.mutate({
      sessionId: activeSessionId,
      crateTypeId: parseInt(selectedCrateTypeId),
      birdCount: parseInt(birdCount),
      grossWeight: parseFloat(grossWeight),
    });
  };

  const handleAddCrateBatch = () => {
    if (!activeSessionId) {
      toast.error("No active session");
      return;
    }
    if (!selectedCrateTypeId) {
      toast.error("Please select a crate type");
      return;
    }
    if (!numberOfCrates || !birdsPerCrate || !totalGrossWeight || !crateWeight) {
      toast.error("Please fill in all required batch fields");
      return;
    }

    addCrateBatch.mutate({
      sessionId: activeSessionId,
      crateTypeId: parseInt(selectedCrateTypeId),
      numberOfCrates: parseInt(numberOfCrates),
      birdsPerCrate: parseInt(birdsPerCrate),
      totalGrossWeight: parseFloat(totalGrossWeight),
      crateWeight: parseFloat(crateWeight),
      palletWeight: batchPalletWeight ? parseFloat(batchPalletWeight) : undefined,
    });
  };

  const handleCompleteSession = () => {
    if (!activeSessionId) return;
    completeSession.mutate({
      sessionId: activeSessionId,
      notes: completionNotes || undefined,
    });
  };

  // Calculate progress percentages
  const progressData = sessionDetails?.session
    ? {
        birdsCaughtPercent: sessionDetails.session.targetBirds
          ? ((sessionDetails.session.totalBirdsCaught || 0) / sessionDetails.session.targetBirds) * 100
          : 0,
        weightCaughtPercent: sessionDetails.session.targetWeight
          ? ((parseFloat(sessionDetails.session.totalNetWeight || "0")) / parseFloat(sessionDetails.session.targetWeight)) * 100
          : 0,
        avgBirdWeight: sessionDetails.session.averageBirdWeight
          ? parseFloat(sessionDetails.session.averageBirdWeight)
          : 0,
      }
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Catch Operations</h1>
          <p className="text-muted-foreground">Real-time catch data recording and session management</p>
        </div>
        {!activeSessionId && (
          <Button onClick={() => setShowStartDialog(true)} size="lg">
            <Play className="mr-2 h-4 w-4" />
            Start New Session
          </Button>
        )}
        {activeSessionId && (
          <div className="flex gap-2">
            <Button onClick={() => setShowCompleteDialog(true)} size="lg" variant="default">
              <CheckCircle className="mr-2 h-4 w-4" />
              Complete Session
            </Button>
            <Button 
              onClick={() => {
                setReportSessionId(activeSessionId);
                setShowReportDialog(true);
              }} 
              size="lg" 
              variant="outline"
            >
              <FileText className="mr-2 h-4 w-4" />
              Generate Transport Report
            </Button>
          </div>
        )}
      </div>

      {/* Loading State */}
      {activeSessionId && isLoadingSession && (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="ml-4 text-muted-foreground">Loading session details...</p>
          </CardContent>
        </Card>
      )}

      {/* Error State */}
      {activeSessionId && !isLoadingSession && sessionError && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-destructive font-semibold">Error loading session details</p>
            <p className="text-sm text-muted-foreground mt-2">{sessionError.message}</p>
            <Button onClick={() => refetchSession()} className="mt-4">Retry</Button>
          </CardContent>
        </Card>
      )}

      {/* Active Session Info */}
      {activeSessionId && sessionDetails && !isLoadingSession && (
        <>
          {/* Progress Dashboard */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Birds Caught</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {sessionDetails.session.totalBirdsCaught || 0}
                  {sessionDetails.session.targetBirds && (
                    <span className="text-sm text-muted-foreground ml-2">
                      / {sessionDetails.session.targetBirds}
                    </span>
                  )}
                </div>
                {sessionDetails.session.targetBirds && progressData && (
                  <div className="mt-2">
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${Math.min(progressData.birdsCaughtPercent, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {progressData.birdsCaughtPercent.toFixed(1)}% of target
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Weight Caught</CardTitle>
                <Weight className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {parseFloat(sessionDetails.session.totalNetWeight || "0").toFixed(1)} kg
                  {sessionDetails.session.targetWeight && (
                    <span className="text-sm text-muted-foreground ml-2">
                      / {parseFloat(sessionDetails.session.targetWeight).toFixed(0)} kg
                    </span>
                  )}
                </div>
                {sessionDetails.session.targetWeight && progressData && (
                  <div className="mt-2">
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${Math.min(progressData.weightCaughtPercent, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {progressData.weightCaughtPercent.toFixed(1)}% of target
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className={sessionDetails.session.targetWeight && progressData ? (() => {
              const targetWeight = parseFloat(sessionDetails.session.targetWeight) / (sessionDetails.session.targetBirds || 1);
              const deviation = ((progressData.avgBirdWeight - targetWeight) / targetWeight) * 100;
              const absDeviation = Math.abs(deviation);
              if (absDeviation > 10) return "border-2 border-red-500 bg-red-50/50";
              if (absDeviation > 5) return "border-2 border-amber-500 bg-amber-50/50";
              return "border-2 border-green-500 bg-green-50/50";
            })() : ""}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Average Bird Weight</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {progressData ? progressData.avgBirdWeight.toFixed(3) : "0.000"} kg
                  {sessionDetails.session.targetWeight && progressData && (() => {
                    const targetWeight = parseFloat(sessionDetails.session.targetWeight) / (sessionDetails.session.targetBirds || 1);
                    const deviation = ((progressData.avgBirdWeight - targetWeight) / targetWeight) * 100;
                    const absDeviation = Math.abs(deviation);
                    let colorClass = "text-green-600 font-semibold";
                    if (absDeviation > 10) colorClass = "text-red-600 font-semibold";
                    else if (absDeviation > 5) colorClass = "text-amber-600 font-semibold";
                    return (
                      <span className={`text-sm ml-2 ${colorClass}`}>
                        ({deviation > 0 ? "+" : ""}{deviation.toFixed(1)}%)
                      </span>
                    );
                  })()}
                </div>
                {sessionDetails.session.targetWeight && progressData && (() => {
                  const targetWeight = parseFloat(sessionDetails.session.targetWeight) / (sessionDetails.session.targetBirds || 1);
                  return (
                    <p className="text-xs text-muted-foreground mt-2">
                      Target: {targetWeight.toFixed(3)} kg/bird
                    </p>
                  );
                })()}
                <p className="text-xs text-muted-foreground mt-1">
                  {sessionDetails.crates.length + (sessionDetails.batches?.length || 0)} {sessionDetails.session.weighingMethod === "individual" ? "crates" : "batches"} recorded
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Add Crate Form */}
          <Card>
            <CardHeader>
              <CardTitle>
                {sessionDetails?.session.weighingMethod === "individual" && "Record Individual Crate"}
                {sessionDetails?.session.weighingMethod === "digital_scale_stack" && "Record Crate Stack (Digital Scale)"}
                {sessionDetails?.session.weighingMethod === "platform_scale" && "Record Pallet Batch (Platform Scale)"}
              </CardTitle>
              <CardDescription>
                {sessionDetails?.session.weighingMethod === "individual" && "Add one crate at a time"}
                {sessionDetails?.session.weighingMethod === "digital_scale_stack" && "Stack multiple crates, weigh together, and record as single batch"}
                {sessionDetails?.session.weighingMethod === "platform_scale" && "Place multiple crates on pallet and record total weight"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Individual Crate Mode */}
              {sessionDetails?.session.weighingMethod === "individual" && (
              <>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="crateType">Crate Type *</Label>
                  <Select value={selectedCrateTypeId} onValueChange={setSelectedCrateTypeId}>
                    <SelectTrigger id="crateType">
                      <SelectValue placeholder="Select crate type" />
                    </SelectTrigger>
                    <SelectContent>
                      {crateTypes?.map((type) => (
                        <SelectItem key={type.id} value={type.id.toString()}>
                          {type.name} ({parseFloat(type.length)}×{parseFloat(type.width)}×{parseFloat(type.height)}cm)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="birdCount">Bird Count *</Label>
                  <Input
                    id="birdCount"
                    type="number"
                    value={birdCount}
                    onChange={(e) => setBirdCount(e.target.value)}
                    placeholder="Number of birds"
                  />
                  {recommendation && (
                    <p className="text-xs text-muted-foreground">
                      Recommended: {recommendation.recommended} ({recommendation.min}-{recommendation.max})
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="grossWeight">Gross Weight (kg) *</Label>
                  <Input
                    id="grossWeight"
                    type="number"
                    step="0.1"
                    value={grossWeight}
                    onChange={(e) => setGrossWeight(e.target.value)}
                    placeholder="Total weight"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Actions</Label>
                  <Button
                    onClick={handleAddCrate}
                    disabled={addCrate.isPending || !selectedCrateTypeId || !birdCount || !grossWeight}
                    className="w-full"
                  >
                    {addCrate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Add Crate
                  </Button>
                </div>
              </div>

              {/* Smart Recommendations Settings for Individual Mode */}
              <div className="grid gap-4 md:grid-cols-3 pt-4 border-t">
                <div className="space-y-2">
                  <Label htmlFor="season">Season</Label>
                  <Select value={season} onValueChange={(v) => setSeason(v as "summer" | "winter")}>
                    <SelectTrigger id="season">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="winter">Winter (Standard)</SelectItem>
                      <SelectItem value="summer">Summer (-30% density)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="transportDuration">Transport Duration (hours)</Label>
                  <Input
                    id="transportDuration"
                    type="number"
                    step="0.5"
                    value={transportDuration}
                    onChange={(e) => setTransportDuration(e.target.value)}
                    placeholder="Optional"
                  />
                </div>

                {recommendation && (
                  <div className="space-y-2">
                    <Label>Recommendation Details</Label>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>Floor area: {recommendation.floorArea} m²</p>
                      <p>Avg bird weight: {recommendation.avgBirdWeight} kg</p>
                      <p>Density: {recommendation.baseDensity} birds/m²</p>
                    </div>
                  </div>
                )}
              </div>
              </>
              )}

              {/* Batch Weighing Mode (Digital Scale Stack or Platform Scale) */}
              {(sessionDetails?.session.weighingMethod === "digital_scale_stack" || 
                sessionDetails?.session.weighingMethod === "platform_scale") && (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="batchCrateType">Crate Type *</Label>
                      <Select value={selectedCrateTypeId} onValueChange={setSelectedCrateTypeId}>
                        <SelectTrigger id="batchCrateType">
                          <SelectValue placeholder="Select crate type" />
                        </SelectTrigger>
                        <SelectContent>
                          {crateTypes?.map((type) => (
                            <SelectItem key={type.id} value={type.id.toString()}>
                              {type.name} ({parseFloat(type.length)}×{parseFloat(type.width)}×{parseFloat(type.height)}cm)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="numberOfCrates">Number of Crates *</Label>
                      <Input
                        id="numberOfCrates"
                        type="number"
                        value={numberOfCrates}
                        onChange={(e) => setNumberOfCrates(e.target.value)}
                        placeholder={sessionDetails?.session.weighingMethod === "digital_scale_stack" ? "Usually 5" : "e.g., 15"}
                      />
                      {sessionDetails?.session.weighingMethod === "digital_scale_stack" && (
                        <p className="text-xs text-muted-foreground">Stack multiple crates together</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="birdsPerCrate">Birds per Crate *</Label>
                      <Input
                        id="birdsPerCrate"
                        type="number"
                        value={birdsPerCrate}
                        onChange={(e) => setBirdsPerCrate(e.target.value)}
                        placeholder="e.g., 10"
                      />
                      {recommendation && (
                        <p className="text-xs text-muted-foreground">
                          Recommended: {recommendation.recommended} ({recommendation.min}-{recommendation.max})
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="totalGrossWeight">Total Gross Weight (kg) *</Label>
                      <Input
                        id="totalGrossWeight"
                        type="number"
                        step="0.1"
                        value={totalGrossWeight}
                        onChange={(e) => setTotalGrossWeight(e.target.value)}
                        placeholder="Weight from scale"
                      />
                      <p className="text-xs text-muted-foreground">Total weight including all crates{sessionDetails?.session.weighingMethod === "platform_scale" && " and pallet"}</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="crateWeight">Crate Weight (kg) *</Label>
                      <Input
                        id="crateWeight"
                        type="number"
                        step="0.1"
                        value={crateWeight}
                        onChange={(e) => setCrateWeight(e.target.value)}
                        placeholder="Actual crate weight"
                      />
                      <p className="text-xs text-muted-foreground">Manual entry for accuracy</p>
                    </div>

                    {sessionDetails?.session.weighingMethod === "platform_scale" && (
                      <div className="space-y-2">
                        <Label htmlFor="batchPalletWeight">Pallet Weight (kg)</Label>
                        <Input
                          id="batchPalletWeight"
                          type="number"
                          step="0.1"
                          value={batchPalletWeight}
                          onChange={(e) => setBatchPalletWeight(e.target.value)}
                          placeholder={sessionDetails?.session.palletWeight || "Optional"}
                        />
                        <p className="text-xs text-muted-foreground">
                          {sessionDetails?.session.palletWeight 
                            ? `Session default: ${parseFloat(sessionDetails.session.palletWeight).toFixed(1)} kg`
                            : "Leave empty if no pallet"}
                        </p>
                      </div>
                    )}
                  </div>

                  <Button
                    onClick={handleAddCrateBatch}
                    disabled={addCrateBatch.isPending || !selectedCrateTypeId || !numberOfCrates || !birdsPerCrate || !totalGrossWeight || !crateWeight}
                    size="lg"
                    className="w-full"
                  >
                    {addCrateBatch.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Record Batch ({numberOfCrates || "0"} crates, {birdsPerCrate && numberOfCrates ? (parseInt(birdsPerCrate) * parseInt(numberOfCrates)) : "0"} birds)
                  </Button>

                  {/* Calculation Preview */}
                  {numberOfCrates && birdsPerCrate && totalGrossWeight && crateWeight && (
                    <div className="p-4 bg-muted rounded-lg space-y-2 text-sm">
                      <h4 className="font-semibold">Calculation Preview:</h4>
                      <div className="grid gap-2 md:grid-cols-2">
                        <p>Total birds: <span className="font-mono">{parseInt(birdsPerCrate) * parseInt(numberOfCrates)}</span></p>
                        <p>Total crate weight: <span className="font-mono">{(parseFloat(crateWeight) * parseInt(numberOfCrates)).toFixed(1)} kg</span></p>
                        {sessionDetails?.session.weighingMethod === "platform_scale" && batchPalletWeight && (
                          <p>Pallet weight: <span className="font-mono">{parseFloat(batchPalletWeight).toFixed(1)} kg</span></p>
                        )}
                        <p>Estimated net weight: <span className="font-mono">
                          {(
                            parseFloat(totalGrossWeight) - 
                            (parseFloat(crateWeight) * parseInt(numberOfCrates)) - 
                            (batchPalletWeight ? parseFloat(batchPalletWeight) : 0)
                          ).toFixed(1)} kg
                        </span></p>
                        <p>Avg bird weight: <span className="font-mono">
                          {(
                            (parseFloat(totalGrossWeight) - 
                            (parseFloat(crateWeight) * parseInt(numberOfCrates)) - 
                            (batchPalletWeight ? parseFloat(batchPalletWeight) : 0)) /
                            (parseInt(birdsPerCrate) * parseInt(numberOfCrates))
                          ).toFixed(3)} kg
                        </span></p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Batches/Crates Table */}
          <Card>
            <CardHeader>
              <CardTitle>
                {sessionDetails.session.weighingMethod === "individual" ? "Recorded Crates" : "Recorded Batches"}
              </CardTitle>
              <CardDescription>
                {sessionDetails.session.weighingMethod === "individual" 
                  ? `${sessionDetails.crates.length} crate(s) recorded in this session`
                  : `${sessionDetails.batches?.length || 0} batch(es) recorded in this session`
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sessionDetails.session.weighingMethod === "individual" ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Crate #</TableHead>
                      <TableHead>Crate Type</TableHead>
                      <TableHead className="text-right">Birds</TableHead>
                      <TableHead className="text-right">Gross Weight</TableHead>
                      <TableHead className="text-right">Tare Weight</TableHead>
                      <TableHead className="text-right">Net Weight</TableHead>
                      <TableHead className="text-right">Avg Bird Weight</TableHead>
                      <TableHead>Recorded At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessionDetails.crates.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground">
                          No crates recorded yet. Add your first crate above.
                        </TableCell>
                      </TableRow>
                    ) : (
                      sessionDetails.crates.map((crate) => (
                        <TableRow key={crate.id}>
                          <TableCell className="font-medium">#{crate.crateNumber}</TableCell>
                          <TableCell>{crate.crateTypeName}</TableCell>
                          <TableCell className="text-right">{crate.birdCount}</TableCell>
                          <TableCell className="text-right">{parseFloat(crate.grossWeight).toFixed(2)} kg</TableCell>
                          <TableCell className="text-right">{parseFloat(crate.crateTypeTareWeight || "0").toFixed(2)} kg</TableCell>
                          <TableCell className="text-right font-medium">{parseFloat(crate.netWeight).toFixed(2)} kg</TableCell>
                          <TableCell className="text-right">{parseFloat(crate.averageBirdWeight).toFixed(3)} kg</TableCell>
                          <TableCell>{new Date(crate.recordedAt).toLocaleTimeString()}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Batch #</TableHead>
                      <TableHead>Crate Type</TableHead>
                      <TableHead className="text-right">Crates</TableHead>
                      <TableHead className="text-right">Birds/Crate</TableHead>
                      <TableHead className="text-right">Total Birds</TableHead>
                      <TableHead className="text-right">Total Net Weight</TableHead>
                      <TableHead className="text-right">Avg Bird Weight</TableHead>
                      <TableHead>Recorded At</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!sessionDetails.batches || sessionDetails.batches.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground">
                          No batches recorded yet. Add your first batch above.
                        </TableCell>
                      </TableRow>
                    ) : (
                      sessionDetails.batches.map((batch) => (
                        <TableRow key={batch.id}>
                          <TableCell className="font-medium">#{batch.batchNumber}</TableCell>
                          <TableCell>{batch.crateTypeName}</TableCell>
                          <TableCell className="text-right">{batch.numberOfCrates}</TableCell>
                          <TableCell className="text-right">{batch.birdsPerCrate}</TableCell>
                          <TableCell className="text-right font-medium">{batch.totalBirds}</TableCell>
                          <TableCell className="text-right font-medium">{parseFloat(batch.totalNetWeight).toFixed(2)} kg</TableCell>
                          <TableCell className="text-right">{parseFloat(batch.averageBirdWeight).toFixed(3)} kg</TableCell>
                          <TableCell>{new Date(batch.recordedAt).toLocaleTimeString()}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-2 justify-end">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                disabled
                                title="Edit batch (coming soon)"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => {
                                  if (confirm(`Delete batch #${batch.batchNumber}? This will remove ${batch.totalBirds} birds (${batch.numberOfCrates} crates) from the session.`)) {
                                    deleteBatch.mutate({ batchId: batch.id });
                                  }
                                }}
                                disabled={deleteBatch.isPending}
                                title="Delete batch"
                              >
                                {deleteBatch.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
              <p className="text-xs text-muted-foreground mt-4">
                {sessionDetails.session.weighingMethod !== "individual" && "✓ Batches are auto-saved immediately after recording"}
              </p>
            </CardContent>
          </Card>
        </>
      )}

      {/* No Active Session Message */}
      {!activeSessionId && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Active Catch Session</h3>
            <p className="text-muted-foreground text-center mb-4">
              Start a new catch session to begin recording crates in real-time
            </p>
            <Button onClick={() => setShowStartDialog(true)}>
              <Play className="mr-2 h-4 w-4" />
              Start New Session
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Start Session Dialog */}
      <Dialog open={showStartDialog} onOpenChange={setShowStartDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start Catch Session</DialogTitle>
            <DialogDescription>
              Begin a new catch operation session. You'll be able to record crates in real-time.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto">
            <div className="space-y-2">
              <Label htmlFor="flock">Flock *</Label>
              <Select value={selectedFlockId} onValueChange={setSelectedFlockId}>
                <SelectTrigger id="flock">
                  <SelectValue placeholder="Select flock" />
                </SelectTrigger>
                <SelectContent>
                  {flocks
                    ?.filter((f) => f.status === "active" || f.status === "harvesting")
                    .map((flock) => (
                      <SelectItem key={flock.id} value={flock.id.toString()}>
                        {flock.flockNumber} - {flock.currentCount} birds (Age: {Math.floor((Date.now() - new Date(flock.placementDate).getTime()) / (1000 * 60 * 60 * 24))} days)
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="catchDate">Catch Date *</Label>
              <Input
                id="catchDate"
                type="date"
                value={catchDate}
                onChange={(e) => setCatchDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="catchTeam">Catch Team</Label>
              <Input
                id="catchTeam"
                value={catchTeam}
                onChange={(e) => setCatchTeam(e.target.value)}
                placeholder="Team name or supervisor"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="weighingMethod">Weighing Method *</Label>
              <Select value={weighingMethod} onValueChange={(v: any) => setWeighingMethod(v)}>
                <SelectTrigger id="weighingMethod">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Individual Crate (one at a time)</SelectItem>
                  <SelectItem value="digital_scale_stack">Digital Scale Stack (multiple crates)</SelectItem>
                  <SelectItem value="platform_scale">Platform Scale (pallet with multiple crates)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {weighingMethod === "individual" && "Weigh each crate individually"}
                {weighingMethod === "digital_scale_stack" && "Stack 5 crates, record total weight"}
                {weighingMethod === "platform_scale" && "Multiple crates on pallet, record total weight"}
              </p>
            </div>

            {weighingMethod === "platform_scale" && (
              <div className="space-y-2">
                <Label htmlFor="palletWeight">Pallet Weight (kg) *</Label>
                <Input
                  id="palletWeight"
                  type="number"
                  step="0.1"
                  value={palletWeight}
                  onChange={(e) => setPalletWeight(e.target.value)}
                  placeholder="e.g., 25.0"
                />
                <p className="text-xs text-muted-foreground">Standard 1200×1000mm pallet weight</p>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="targetBirds">Target Birds</Label>
                <Input
                  id="targetBirds"
                  type="number"
                  value={targetBirds}
                  onChange={(e) => setTargetBirds(e.target.value)}
                  placeholder="e.g., 100"
                />
                <p className="text-xs text-muted-foreground">Total number of birds to catch</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="targetWeight">Total Target Weight (kg)</Label>
                <Input
                  id="targetWeight"
                  type="number"
                  step="0.1"
                  value={targetWeight}
                  onChange={(e) => setTargetWeight(e.target.value)}
                  placeholder="e.g., 200"
                />
                <p className="text-xs text-muted-foreground">Total expected weight for all birds combined</p>
              </div>
            </div>
            {targetBirds && targetWeight && parseFloat(targetBirds) > 0 && parseFloat(targetWeight) > 0 && (
              <div className="rounded-md bg-muted p-3 text-sm">
                <p className="font-medium">Target Preview:</p>
                <p className="text-muted-foreground">
                  {(parseFloat(targetWeight) / parseFloat(targetBirds)).toFixed(3)} kg per bird
                  ({targetBirds} birds × {(parseFloat(targetWeight) / parseFloat(targetBirds)).toFixed(3)} kg = {targetWeight} kg total)
                </p>
              </div>
            )}

            {/* Density Calculator */}
            <DensityCalculator
              catchDate={catchDate}
              onPlanCalculated={setPlannedDistribution}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStartDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleStartSession} disabled={startSession.isPending || !selectedFlockId}>
              {startSession.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Start Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Session Dialog */}
      <Dialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Catch Session</DialogTitle>
            <DialogDescription>
              This will finalize the catch session and automatically create a harvest record.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto">
            {sessionDetails && (
              <div className="space-y-2 p-4 bg-muted rounded-lg">
                <h4 className="font-semibold">Session Summary</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>Total Birds:</div>
                  <div className="font-medium">{sessionDetails.session.totalBirdsCaught || 0}</div>
                  <div>Total Weight:</div>
                  <div className="font-medium">{parseFloat(sessionDetails.session.totalNetWeight || "0").toFixed(2)} kg</div>
                  <div>Total Crates:</div>
                  <div className="font-medium">
                    {sessionDetails.session.weighingMethod === 'individual'
                      ? sessionDetails.crates.length
                      : sessionDetails.batches?.reduce((sum, batch) => sum + (batch.numberOfCrates || 0), 0) || 0}
                  </div>
                  <div>Avg Bird Weight:</div>
                  <div className="font-medium">
                    {sessionDetails.session.averageBirdWeight
                      ? parseFloat(sessionDetails.session.averageBirdWeight).toFixed(3)
                      : "0.000"}{" "}
                    kg
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="completionNotes">Notes (Optional)</Label>
              <Textarea
                id="completionNotes"
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                placeholder="Any additional notes about this catch session..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCompleteDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCompleteSession} disabled={completeSession.isPending}>
              {completeSession.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Complete Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate Transport Report Dialog */}
      <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Transport Report</DialogTitle>
            <DialogDescription>
              Create an Animal Hauling Checklist for this catch session
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="farmName">Farm Name *</Label>
              <Input
                id="farmName"
                value={reportFarmName}
                onChange={(e) => setReportFarmName(e.target.value)}
                placeholder="e.g., AFGRO Farming Group"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="processingDate">Processing Date *</Label>
              <Input
                id="processingDate"
                type="date"
                value={reportProcessingDate}
                onChange={(e) => setReportProcessingDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lotNumber">Lot Number *</Label>
              <Input
                id="lotNumber"
                value={reportLotNumber}
                onChange={(e) => setReportLotNumber(e.target.value)}
                placeholder="e.g., LOT-2026-001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="transporter">Transporter (Optional)</Label>
              <Input
                id="transporter"
                value={reportTransporter}
                onChange={(e) => setReportTransporter(e.target.value)}
                placeholder="e.g., ABC Transport Services"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReportDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (!reportFarmName || !reportProcessingDate || !reportLotNumber) {
                  toast.error("Please fill in all required fields");
                  return;
                }
                if (!reportSessionId) {
                  toast.error("No session selected");
                  return;
                }
                generateReport.mutate({
                  sessionId: reportSessionId,
                  farmName: reportFarmName,
                  processingDate: reportProcessingDate,
                  lotNumber: reportLotNumber,
                  transporter: reportTransporter || undefined,
                });
              }}
              disabled={generateReport.isPending}
            >
              {generateReport.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Generate Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recent Completed Sessions */}
      {completedSessions && completedSessions.length > 0 && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Recent Completed Sessions</CardTitle>
            <CardDescription>
              View and generate reports for completed catch sessions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Flock</TableHead>
                  <TableHead>Birds Caught</TableHead>
                  <TableHead>Total Weight</TableHead>
                  <TableHead>Crates</TableHead>
                  <TableHead>Avg Weight</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completedSessions.slice(0, 10).map((session) => (
                  <TableRow key={session.id}>
                    <TableCell>
                      {new Date(session.catchDate).toLocaleDateString()}
                    </TableCell>
                    <TableCell>{session.flockNumber}</TableCell>
                    <TableCell>{session.totalBirdsCaught || 0}</TableCell>
                    <TableCell>
                      {session.totalNetWeight
                        ? parseFloat(session.totalNetWeight).toFixed(2)
                        : "0.00"}{" "}
                      kg
                    </TableCell>
                    <TableCell>{session.totalCrates || 0}</TableCell>
                    <TableCell>
                      {session.averageBirdWeight
                        ? parseFloat(session.averageBirdWeight).toFixed(3)
                        : "0.000"}{" "}
                      kg
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setReportSessionId(session.id);
                          setReportFarmName("");
                          setReportProcessingDate(new Date(session.catchDate).toISOString().split("T")[0]);
                          setReportLotNumber("");
                          setReportTransporter("");
                          setShowReportDialog(true);
                        }}
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        Generate Report
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
