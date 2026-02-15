import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle2, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DensityCalculatorProps {
  catchDate: string;
  onPlanCalculated: (plan: {
    crateTypeId: number;
    season: string;
    transportDurationHours?: number;
    plannedStandardDensity: number;
    plannedStandardCrates: number;
    plannedOddDensity: number;
    plannedOddCrates: number;
    plannedTotalBirds: number;
    availableCrates: number;
  }) => void;
}

export function DensityCalculator({ catchDate, onPlanCalculated }: DensityCalculatorProps) {
  const [crateTypeId, setCrateTypeId] = useState<string>("");
  const [targetBirds, setTargetBirds] = useState<string>("");
  const [availableCrates, setAvailableCrates] = useState<string>("");
  const [transportDuration, setTransportDuration] = useState<string>("");
  const [showCalculator, setShowCalculator] = useState(false);

  const crateTypes = trpc.catch.listCrateTypes.useQuery();
  const calculatePlan = trpc.density.calculatePlan.useMutation();

  const handleCalculate = async () => {
    if (!crateTypeId || !targetBirds || !availableCrates || !catchDate) {
      return;
    }

    const result = await calculatePlan.mutateAsync({
      crateTypeId: parseInt(crateTypeId),
      catchDate,
      targetBirds: parseInt(targetBirds),
      availableCrates: parseInt(availableCrates),
      transportDurationHours: transportDuration ? parseFloat(transportDuration) : undefined,
    });

    // Pass the plan back to parent
    onPlanCalculated({
      crateTypeId: parseInt(crateTypeId),
      season: result.season,
      transportDurationHours: transportDuration ? parseFloat(transportDuration) : undefined,
      plannedStandardDensity: result.distribution.standardDensity,
      plannedStandardCrates: result.distribution.standardCrates,
      plannedOddDensity: result.distribution.oddDensity,
      plannedOddCrates: result.distribution.oddCrates,
      plannedTotalBirds: result.distribution.totalBirds,
      availableCrates: parseInt(availableCrates),
    });
  };

  // Auto-calculate when all required fields are filled
  useEffect(() => {
    if (crateTypeId && targetBirds && availableCrates && catchDate && showCalculator) {
      handleCalculate();
    }
  }, [crateTypeId, targetBirds, availableCrates, transportDuration, catchDate]);

  const plan = calculatePlan.data;

  return (
    <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-sm">Seasonal Density Calculator</h4>
          <p className="text-xs text-muted-foreground">Optional: Get science-based recommendations</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowCalculator(!showCalculator)}
        >
          {showCalculator ? "Hide" : "Show"}
        </Button>
      </div>

      {showCalculator && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="crateType">Crate Type *</Label>
              <Select value={crateTypeId} onValueChange={setCrateTypeId}>
                <SelectTrigger id="crateType">
                  <SelectValue placeholder="Select crate type" />
                </SelectTrigger>
                <SelectContent>
                  {crateTypes.data?.map((type) => (
                    <SelectItem key={type.id} value={type.id.toString()}>
                      {type.name} ({type.length}×{type.width}×{type.height} cm)
                    </SelectItem>
                  ))}
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
                placeholder="e.g., 2.5"
              />
              <p className="text-xs text-muted-foreground">Expected travel time to processor</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="targetBirdsCalc">Target Birds *</Label>
              <Input
                id="targetBirdsCalc"
                type="number"
                value={targetBirds}
                onChange={(e) => setTargetBirds(e.target.value)}
                placeholder="e.g., 3000"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="availableCrates">Available Crates *</Label>
              <Input
                id="availableCrates"
                type="number"
                value={availableCrates}
                onChange={(e) => setAvailableCrates(e.target.value)}
                placeholder="e.g., 276"
              />
            </div>
          </div>

          {calculatePlan.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Calculating optimal distribution...
            </div>
          )}

          {plan && (
            <div className="space-y-3">
              {/* Season & Recommendation */}
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <strong>Season:</strong> {plan.season === "summer" ? "☀️ Summer" : "❄️ Winter"} (detected from catch date)
                  <br />
                  <strong>Recommended density:</strong> {plan.recommendation.recommendedBirdsPerCrate} birds/crate
                  <br />
                  <strong>Range:</strong> {plan.recommendation.minBirdsPerCrate}-{plan.recommendation.maxBirdsPerCrate} birds/crate
                  <br />
                  <strong>Legal maximum:</strong> {plan.recommendation.legalMaxBirdsPerCrate} birds/crate
                </AlertDescription>
              </Alert>

              {/* Distribution Plan */}
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <h5 className="font-semibold text-sm">📊 Distribution Plan</h5>
                
                {plan.distribution.shortage < 0 ? (
                  <Alert>
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertDescription>
                      <strong>No shortage!</strong> You have enough crates at recommended density.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Crates needed at standard:</span>
                        <span className="font-medium">
                          {Math.ceil(parseInt(targetBirds) / plan.recommendation.recommendedBirdsPerCrate)} crates
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Available crates:</span>
                        <span className="font-medium">{availableCrates} crates</span>
                      </div>
                      <div className="flex justify-between text-amber-600">
                        <span>Shortage:</span>
                        <span className="font-medium">
                          {Math.ceil(parseInt(targetBirds) / plan.recommendation.recommendedBirdsPerCrate) - parseInt(availableCrates)} crates short
                        </span>
                      </div>
                    </div>

                    <div className="border-t pt-3 space-y-2">
                      <p className="text-sm font-medium">💡 Suggested Distribution:</p>
                      <div className="bg-muted p-3 rounded space-y-1 text-sm">
                        {plan.distribution.oddCrates === 0 || plan.distribution.standardCrates === 0 ? (
                          // All crates at same density
                          <div className="flex justify-between">
                            <span>• All {plan.distribution.totalCrates} crates:</span>
                            <span className="font-medium">
                              {plan.distribution.oddCrates === 0 
                                ? plan.distribution.standardDensity 
                                : plan.distribution.oddDensity} birds each
                            </span>
                          </div>
                        ) : (
                          // Two-tier distribution - show higher density first (minority), then standard (majority)
                          <>
                            <div className="flex justify-between">
                              <span>• First {plan.distribution.oddCrates} crates:</span>
                              <span className="font-medium">{plan.distribution.oddDensity} birds each</span>
                            </div>
                            <div className="flex justify-between">
                              <span>• Last {plan.distribution.standardCrates} crates:</span>
                              <span className="font-medium">{plan.distribution.standardDensity} birds each</span>
                            </div>
                          </>
                        )}
                        <div className="border-t mt-2 pt-2 flex justify-between font-semibold">
                          <span>Total:</span>
                          <span>{plan.distribution.totalCrates} crates = {plan.distribution.totalBirds} birds</span>
                        </div>
                      </div>

                      {plan.distribution.shortage > 0 && (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>
                            <strong>⚠️ {plan.distribution.shortage} birds short of target</strong>
                            <br />
                            Consider adding more crates or reducing target.
                          </AlertDescription>
                        </Alert>
                      )}

                      {plan.distribution.exceedsRecommendation && (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>
                            <strong>⚠️ Exceeds seasonal recommendation</strong>
                            <br />
                            Density is above optimal range for {plan.season}. Ensure excellent ventilation.
                          </AlertDescription>
                        </Alert>
                      )}

                      {!plan.distribution.withinLegalLimit && (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>
                            <strong>🚫 Exceeds legal limit</strong>
                            <br />
                            Density exceeds 70 kg/m² legal maximum. Must add more crates.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  </>
                )}

                <div className="border-t pt-3">
                  <p className="text-xs text-muted-foreground">
                    📋 <strong>Catch Team Instructions:</strong>
                    <br />
                    {plan.distribution.oddCrates > 0 ? (
                      <>
                        1. Pack first {plan.distribution.oddCrates} crates with {plan.distribution.oddDensity} birds each
                        <br />
                        2. Pack last {plan.distribution.standardCrates} crates with {plan.distribution.standardDensity} birds each
                        <br />
                        3. Total expected: {plan.distribution.totalBirds} birds
                      </>
                    ) : (
                      <>
                        Pack all {plan.distribution.standardCrates} crates with {plan.distribution.standardDensity} birds each
                        <br />
                        Total expected: {plan.distribution.totalBirds} birds
                      </>
                    )}
                  </p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                <strong>Note:</strong> This plan will be saved with the session. Operators can deviate if needed, but the transport report will use this as the baseline for "odd crates" calculation.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
