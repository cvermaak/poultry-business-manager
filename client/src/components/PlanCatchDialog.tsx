import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, CheckCircle2, Info, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { formatRand } from "@/lib/format";

interface PlanCatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flockId: number;
  flockNumber: string;
  currentCount: number;
  targetCatchingWeight: number;   // kg — the contract target
  targetDeliveredWeight: number;  // kg — delivered after shrinkage
  shrinkagePct?: number;          // default 5.5
  onPlanSaved?: () => void;
}

interface DayRow {
  day: number;
  targetBirds: number;
  targetCatchingWeight: number;
  targetDeliveredWeight: number;
  percentOfFlock: number;
}

// ── Core calculation ──────────────────────────────────────────────────────────
/**
 * Given the overall target catching weight, daily gain, shrinkage %, and per-day
 * bird counts, compute the per-day target catching weights such that the
 * weighted average equals the overall target.
 *
 * Formula: midpoint day = overall target.
 * Day N target = overall target + (N − midpoint) × dailyGain
 * where midpoint = (totalDays + 1) / 2  (1-based, can be fractional)
 */
function calculatePlan(
  overallTargetCatchingWeight: number,
  dailyGainKg: number,
  shrinkagePct: number,
  birdsPerDay: number[],
): DayRow[] {
  const totalDays = birdsPerDay.length;
  const totalBirds = birdsPerDay.reduce((s, b) => s + b, 0);
  if (totalBirds === 0) return [];

  // Weighted midpoint (1-based day index)
  // We want: sum_i(birds_i * weight_i) / totalBirds = overallTarget
  // weight_i = overallTarget + (i - midpoint) * dailyGain
  // Solving for midpoint:
  //   sum_i(birds_i * (overallTarget + (i - midpoint) * dailyGain)) = overallTarget * totalBirds
  //   overallTarget * totalBirds + dailyGain * (sum_i(birds_i * i) - midpoint * totalBirds) = overallTarget * totalBirds
  //   dailyGain * (sum_i(birds_i * i) - midpoint * totalBirds) = 0
  //   midpoint = sum_i(birds_i * i) / totalBirds
  const weightedDaySum = birdsPerDay.reduce((s, b, idx) => s + b * (idx + 1), 0);
  const midpoint = weightedDaySum / totalBirds;

  const shrinkageFactor = 1 - shrinkagePct / 100;

  return birdsPerDay.map((birds, idx) => {
    const dayNum = idx + 1;
    const catchingWeight = overallTargetCatchingWeight + (dayNum - midpoint) * dailyGainKg;
    const deliveredWeight = catchingWeight * shrinkageFactor;
    return {
      day: dayNum,
      targetBirds: birds,
      targetCatchingWeight: Math.max(0.001, catchingWeight),
      targetDeliveredWeight: Math.max(0.001, deliveredWeight),
      percentOfFlock: totalBirds > 0 ? (birds / totalBirds) * 100 : 0,
    };
  });
}

function weightedAverage(rows: DayRow[], field: "targetCatchingWeight" | "targetDeliveredWeight") {
  const totalBirds = rows.reduce((s, r) => s + r.targetBirds, 0);
  if (totalBirds === 0) return 0;
  return rows.reduce((s, r) => s + r[field] * r.targetBirds, 0) / totalBirds;
}

export function PlanCatchDialog({
  open,
  onOpenChange,
  flockId,
  flockNumber,
  currentCount,
  targetCatchingWeight,
  targetDeliveredWeight,
  shrinkagePct = 5.5,
  onPlanSaved,
}: PlanCatchDialogProps) {
  const [numDays, setNumDays] = useState(1);
  const [dailyGainG, setDailyGainG] = useState(55); // grams per day
  const [processorMaxKg, setProcessorMaxKg] = useState<string>("");
  const [birdsPerDay, setBirdsPerDay] = useState<number[]>([currentCount]);
  const [rows, setRows] = useState<DayRow[]>([]);

  const saveMutation = trpc.catch.saveCatchPlan.useMutation();
  const existingPlan = trpc.catch.getCatchPlan.useQuery({ flockId }, { enabled: open });

  // Pre-fill from existing plan if available
  useEffect(() => {
    if (existingPlan.data) {
      const plan = existingPlan.data;
      setNumDays(plan.totalCatchDays);
      setDailyGainG(Math.round(plan.dailyGainKg * 1000));
      setProcessorMaxKg(plan.processorMaxCatchingWeight?.toString() ?? "");
      setBirdsPerDay(plan.days.map((d) => d.targetBirds));
    }
  }, [existingPlan.data]);

  // Recalculate rows whenever inputs change
  const recalculate = useCallback(() => {
    const dailyGainKg = dailyGainG / 1000;
    const computed = calculatePlan(
      targetCatchingWeight,
      dailyGainKg,
      shrinkagePct,
      birdsPerDay.slice(0, numDays),
    );
    setRows(computed);
  }, [numDays, dailyGainG, birdsPerDay, targetCatchingWeight, shrinkagePct]);

  useEffect(() => {
    recalculate();
  }, [recalculate]);

  // When numDays changes, resize birdsPerDay with equal split
  useEffect(() => {
    setBirdsPerDay((prev) => {
      const next = Array.from({ length: numDays }, (_, i) => {
        if (i < prev.length) return prev[i];
        // New days: distribute remaining birds equally
        const alreadyAllocated = prev.reduce((s, v) => s + v, 0);
        const remaining = Math.max(0, currentCount - alreadyAllocated);
        const newDaysCount = numDays - prev.length;
        return newDaysCount > 0 ? Math.floor(remaining / newDaysCount) : 0;
      });
      return next;
    });
  }, [numDays, currentCount]);

  const totalBirdsPlanned = birdsPerDay.slice(0, numDays).reduce((s, b) => s + (b || 0), 0);
  const birdsDiff = totalBirdsPlanned - currentCount;
  const avgCatchingWeight = rows.length > 0 ? weightedAverage(rows, "targetCatchingWeight") : 0;
  const avgDeliveredWeight = rows.length > 0 ? weightedAverage(rows, "targetDeliveredWeight") : 0;
  const processorMax = processorMaxKg ? parseFloat(processorMaxKg) : null;
  const maxDayWeight = rows.length > 0 ? Math.max(...rows.map((r) => r.targetCatchingWeight)) : 0;
  const exceedsMax = processorMax !== null && maxDayWeight > processorMax;
  const avgOnTarget = Math.abs(avgCatchingWeight - targetCatchingWeight) < 0.001;

  function handleBirdsChange(idx: number, value: string) {
    const n = parseInt(value, 10);
    setBirdsPerDay((prev) => {
      const next = [...prev];
      next[idx] = isNaN(n) ? 0 : n;
      return next;
    });
  }

  async function handleSave() {
    const dailyGainKg = dailyGainG / 1000;
    await saveMutation.mutateAsync({
      flockId,
      totalCatchDays: numDays,
      dailyGainKg,
      shrinkagePct,
      overallTargetCatchingWeight: targetCatchingWeight,
      overallTargetDeliveredWeight: targetDeliveredWeight,
      processorMaxCatchingWeight: processorMax,
      days: rows,
    });
    onPlanSaved?.();
    onOpenChange(false);
  }

  const dayLabel = (n: number) => (n === 1 ? "1 day" : `${n} days`);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            Plan Catch — {flockNumber}
          </DialogTitle>
          <DialogDescription>
            Declare the multi-day catch plan for this house. The system calculates per-day target
            catching weights so the weighted house average stays within the contract target.
          </DialogDescription>
        </DialogHeader>

        {/* ── Contract anchor ── */}
        <div className="rounded-lg bg-muted/50 border p-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Contract Target (Catching)</p>
            <p className="text-2xl font-bold text-primary">{targetCatchingWeight.toFixed(3)} kg</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Contract Target (Delivered)</p>
            <p className="text-2xl font-bold">{targetDeliveredWeight.toFixed(3)} kg</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Shrinkage Buffer</p>
            <p className="font-semibold">{shrinkagePct}%</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Birds in House</p>
            <p className="font-semibold">{currentCount.toLocaleString()}</p>
          </div>
        </div>

        <Separator />

        {/* ── Plan inputs ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label>Number of Catch Days</Label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setNumDays((n) => Math.max(1, n - 1))}
                disabled={numDays <= 1}
              >−</Button>
              <span className="w-8 text-center font-bold text-lg">{numDays}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setNumDays((n) => Math.min(10, n + 1))}
                disabled={numDays >= 10}
              >+</Button>
            </div>
            <p className="text-xs text-muted-foreground">Catch over {dayLabel(numDays)}</p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="dailyGain">Daily Live Weight Gain (g/day)</Label>
            <Input
              id="dailyGain"
              type="number"
              min={10}
              max={150}
              value={dailyGainG}
              onChange={(e) => setDailyGainG(parseInt(e.target.value, 10) || 55)}
            />
            <p className="text-xs text-muted-foreground">Breed default: 55 g/day</p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="processorMax">Processor Max Catching Weight (kg)</Label>
            <Input
              id="processorMax"
              type="number"
              step="0.001"
              placeholder="e.g. 2.100"
              value={processorMaxKg}
              onChange={(e) => setProcessorMaxKg(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Optional — triggers warning if exceeded</p>
          </div>
        </div>

        {/* ── Per-day bird count inputs ── */}
        <div className="space-y-2">
          <Label>Birds per Catch Day</Label>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {Array.from({ length: numDays }, (_, i) => (
              <div key={i} className="space-y-1">
                <p className="text-xs text-muted-foreground text-center">Day {i + 1}</p>
                <Input
                  type="number"
                  min={0}
                  value={birdsPerDay[i] ?? 0}
                  onChange={(e) => handleBirdsChange(i, e.target.value)}
                  className="text-center"
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Total planned:</span>
            <span className={`font-semibold ${birdsDiff !== 0 ? "text-amber-600" : "text-green-600"}`}>
              {totalBirdsPlanned.toLocaleString()} birds
            </span>
            {birdsDiff !== 0 && (
              <Badge variant="outline" className="text-amber-600 border-amber-400">
                {birdsDiff > 0 ? "+" : ""}{birdsDiff.toLocaleString()} vs house count
              </Badge>
            )}
          </div>
        </div>

        <Separator />

        {/* ── Calculated plan table ── */}
        {rows.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm">Calculated Per-Day Target Weights</h4>
              <Badge variant={avgOnTarget ? "default" : "destructive"} className="text-xs">
                {avgOnTarget ? "House average on target ✓" : "House average off target"}
              </Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left py-2 px-3 font-medium">Day</th>
                    <th className="text-right py-2 px-3 font-medium">Birds</th>
                    <th className="text-right py-2 px-3 font-medium">% of House</th>
                    <th className="text-right py-2 px-3 font-medium">Target Catching (kg)</th>
                    <th className="text-right py-2 px-3 font-medium">Target Delivered (kg)</th>
                    <th className="text-center py-2 px-3 font-medium">vs Contract</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const diff = row.targetCatchingWeight - targetCatchingWeight;
                    const overMax = processorMax !== null && row.targetCatchingWeight > processorMax;
                    return (
                      <tr key={row.day} className={`border-b hover:bg-muted/20 ${overMax ? "bg-red-50 dark:bg-red-950/20" : ""}`}>
                        <td className="py-2 px-3 font-medium">Day {row.day}</td>
                        <td className="py-2 px-3 text-right">{row.targetBirds.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right">{row.percentOfFlock.toFixed(1)}%</td>
                        <td className="py-2 px-3 text-right font-mono font-semibold">
                          {row.targetCatchingWeight.toFixed(3)}
                          {overMax && (
                            <span className="ml-1 text-red-500 text-xs">⚠</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-mono">
                          {row.targetDeliveredWeight.toFixed(3)}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {Math.abs(diff) < 0.001 ? (
                            <Minus className="h-4 w-4 text-muted-foreground mx-auto" />
                          ) : diff < 0 ? (
                            <div className="flex items-center justify-center gap-1 text-blue-600 text-xs">
                              <TrendingDown className="h-3 w-3" />
                              {diff.toFixed(3)}
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1 text-orange-600 text-xs">
                              <TrendingUp className="h-3 w-3" />
                              +{diff.toFixed(3)}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-muted/40 font-semibold">
                    <td className="py-2 px-3">House Average</td>
                    <td className="py-2 px-3 text-right">{totalBirdsPlanned.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right">100%</td>
                    <td className={`py-2 px-3 text-right font-mono ${avgOnTarget ? "text-green-600" : "text-red-600"}`}>
                      {avgCatchingWeight.toFixed(3)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono">
                      {avgDeliveredWeight.toFixed(3)}
                    </td>
                    <td className="py-2 px-3 text-center">
                      {avgOnTarget ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-red-500 mx-auto" />
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Warnings */}
            {exceedsMax && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Processor weight limit exceeded.</strong> Day {rows.findIndex((r) => processorMax !== null && r.targetCatchingWeight > processorMax!) + 1} target ({rows.find((r) => processorMax !== null && r.targetCatchingWeight > processorMax!)?.targetCatchingWeight.toFixed(3)} kg) exceeds the processor maximum of {processorMax?.toFixed(3)} kg. Reduce the number of catch days or increase the bird count on earlier days.
                </AlertDescription>
              </Alert>
            )}

            {birdsDiff !== 0 && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Total planned birds ({totalBirdsPlanned.toLocaleString()}) {birdsDiff > 0 ? "exceeds" : "is less than"} the current house count ({currentCount.toLocaleString()}) by {Math.abs(birdsDiff).toLocaleString()} birds. Adjust the per-day bird counts to match the house.
                </AlertDescription>
              </Alert>
            )}

            {!avgOnTarget && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Weighted average catching weight ({avgCatchingWeight.toFixed(3)} kg) does not match the contract target ({targetCatchingWeight.toFixed(3)} kg). This should not occur — please check your inputs.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending || rows.length === 0 || exceedsMax || birdsDiff !== 0}
          >
            {saveMutation.isPending ? "Saving…" : "Save Catch Plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
