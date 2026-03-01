import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRand } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Award, AlertCircle } from "lucide-react";

interface FlockComparisonData {
  flockId: number;
  flockNumber: string;
  placementDate: Date | string;
  targetDeliveredWeight: number;
  catchCount: number;
  totalBirdsHarvested: number;
  avgDeliveredWeight: number;
  avgShrinkage: number;
  totalRevenue: number;
}

interface HarvestHistoryComparisonProps {
  data: FlockComparisonData[];
}

export function HarvestHistoryComparison({ data }: HarvestHistoryComparisonProps) {
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Harvest History Comparison</CardTitle>
          <CardDescription>Compare harvest performance across flocks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            No harvest data available for comparison
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate performance rankings
  const rankedByWeight = [...data].sort((a, b) => b.avgDeliveredWeight - a.avgDeliveredWeight);
  const rankedByShrinkage = [...data].sort((a, b) => a.avgShrinkage - b.avgShrinkage); // Lower is better
  const rankedByRevenue = [...data].sort((a, b) => b.totalRevenue - a.totalRevenue);

  // Find best performers
  const bestWeight = rankedByWeight[0];
  const bestShrinkage = rankedByShrinkage[0];
  const bestRevenue = rankedByRevenue[0];

  // Calculate overall averages
  const overallAvgWeight = data.reduce((sum, f) => sum + f.avgDeliveredWeight, 0) / data.length;
  const overallAvgShrinkage = data.reduce((sum, f) => sum + f.avgShrinkage, 0) / data.length;
  const overallTotalRevenue = data.reduce((sum, f) => sum + f.totalRevenue, 0);

  const getPerformanceBadge = (value: number, target: number, lowerIsBetter: boolean = false) => {
    const variance = lowerIsBetter ? target - value : value - target;
    const percentVariance = target > 0 ? (variance / target) * 100 : 0;

    if (Math.abs(percentVariance) < 2) {
      return <Badge variant="secondary">On Target</Badge>;
    } else if (percentVariance > 0) {
      return <Badge className="bg-green-600">Above Target</Badge>;
    } else {
      return <Badge variant="destructive">Below Target</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Award className="h-4 w-4" />
              Best Delivered Weight
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{bestWeight.flockNumber}</div>
            <p className="text-sm text-muted-foreground mt-1">
              {bestWeight.avgDeliveredWeight.toFixed(3)} kg avg
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Award className="h-4 w-4" />
              Lowest Shrinkage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{bestShrinkage.flockNumber}</div>
            <p className="text-sm text-muted-foreground mt-1">
              {bestShrinkage.avgShrinkage.toFixed(2)}% shrinkage
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Award className="h-4 w-4" />
              Highest Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{bestRevenue.flockNumber}</div>
            <p className="text-sm text-muted-foreground mt-1">
              {formatRand(bestRevenue.totalRevenue)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Comparison Table */}
      <Card>
        <CardHeader>
          <CardTitle>Flock Performance Comparison</CardTitle>
          <CardDescription>
            Detailed harvest metrics across {data.length} flock{data.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Flock</TableHead>
                  <TableHead>Placement Date</TableHead>
                  <TableHead className="text-right">Catches</TableHead>
                  <TableHead className="text-right">Birds Harvested</TableHead>
                  <TableHead className="text-right">Target Weight</TableHead>
                  <TableHead className="text-right">Avg Delivered</TableHead>
                  <TableHead className="text-right">Performance</TableHead>
                  <TableHead className="text-right">Avg Shrinkage</TableHead>
                  <TableHead className="text-right">Total Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((flock) => {
                  const weightVariance = flock.avgDeliveredWeight - flock.targetDeliveredWeight;
                  const weightVariancePercent = flock.targetDeliveredWeight > 0 
                    ? (weightVariance / flock.targetDeliveredWeight) * 100 
                    : 0;

                  return (
                    <TableRow key={flock.flockId}>
                      <TableCell className="font-medium">{flock.flockNumber}</TableCell>
                      <TableCell>
                        {new Date(flock.placementDate).toLocaleDateString('en-ZA', { 
                          year: 'numeric', 
                          month: 'short', 
                          day: 'numeric' 
                        })}
                      </TableCell>
                      <TableCell className="text-right">{flock.catchCount}</TableCell>
                      <TableCell className="text-right">{flock.totalBirdsHarvested.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        {flock.targetDeliveredWeight > 0 ? `${flock.targetDeliveredWeight.toFixed(2)} kg` : '-'}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {flock.avgDeliveredWeight.toFixed(3)} kg
                      </TableCell>
                      <TableCell className="text-right">
                        {flock.targetDeliveredWeight > 0 ? (
                          <div className="flex items-center justify-end gap-2">
                            {weightVariance >= 0 ? (
                              <TrendingUp className="h-4 w-4 text-green-600" />
                            ) : (
                              <TrendingDown className="h-4 w-4 text-red-600" />
                            )}
                            <span className={weightVariance >= 0 ? 'text-green-600' : 'text-red-600'}>
                              {weightVariance >= 0 ? '+' : ''}{weightVariancePercent.toFixed(1)}%
                            </span>
                          </div>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={
                          flock.avgShrinkage <= 4.5 ? 'text-green-600' :
                          flock.avgShrinkage <= 5.5 ? 'text-yellow-600' :
                          'text-red-600'
                        }>
                          {flock.avgShrinkage.toFixed(2)}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatRand(flock.totalRevenue)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Overall Statistics */}
          <div className="mt-6 p-4 bg-muted/50 rounded-lg">
            <h4 className="font-semibold mb-3">Overall Statistics</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Average Delivered Weight</p>
                <p className="text-lg font-bold">{overallAvgWeight.toFixed(3)} kg</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Average Shrinkage</p>
                <p className={`text-lg font-bold ${
                  overallAvgShrinkage <= 4.5 ? 'text-green-600' :
                  overallAvgShrinkage <= 5.5 ? 'text-yellow-600' :
                  'text-red-600'
                }`}>
                  {overallAvgShrinkage.toFixed(2)}%
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue (All Flocks)</p>
                <p className="text-lg font-bold">R{overallTotalRevenue.toFixed(2)}</p>
              </div>
            </div>
          </div>

          {/* Insights */}
          <div className="mt-4 space-y-2">
            {overallAvgShrinkage > 5.5 && (
              <div className="flex gap-2 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-red-900 dark:text-red-100">High Average Shrinkage</p>
                  <p className="text-red-700 dark:text-red-300 mt-1">
                    Your overall shrinkage ({overallAvgShrinkage.toFixed(2)}%) exceeds the target (5.5%). 
                    Review catch procedures, transport conditions, and timing across all flocks.
                  </p>
                </div>
              </div>
            )}
            
            {data.some(f => f.targetDeliveredWeight > 0 && f.avgDeliveredWeight < f.targetDeliveredWeight * 0.95) && (
              <div className="flex gap-2 p-3 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 rounded-lg">
                <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-yellow-900 dark:text-yellow-100">Weight Target Concerns</p>
                  <p className="text-yellow-700 dark:text-yellow-300 mt-1">
                    Some flocks are significantly below their target delivered weight. Consider adjusting feed programs or extending growing periods.
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
