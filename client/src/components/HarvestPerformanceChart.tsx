import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Cell } from "recharts";

interface HarvestPerformanceData {
  catchNumber: number;
  catchDate: string;
  deliveredWeight: number;
  targetWeight: number;
  variance: number;
  variancePercent: number;
  chickenCount: number;
}

interface HarvestPerformanceChartProps {
  data: HarvestPerformanceData[];
  targetDeliveredWeight?: number;
}

export function HarvestPerformanceChart({ data, targetDeliveredWeight }: HarvestPerformanceChartProps) {
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Harvest Performance</CardTitle>
          <CardDescription>Delivered weight vs target across catches</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            No harvest data available
          </div>
        </CardContent>
      </Card>
    );
  }

  // Prepare chart data
  const chartData = data.map((item) => ({
    name: `Catch ${item.catchNumber}`,
    date: new Date(item.catchDate).toLocaleDateString(),
    delivered: Number(item.deliveredWeight.toFixed(2)),
    target: targetDeliveredWeight ? Number(targetDeliveredWeight.toFixed(2)) : Number(item.targetWeight.toFixed(2)),
    variance: Number(item.variance.toFixed(2)),
    variancePercent: Number(item.variancePercent.toFixed(1)),
    count: item.chickenCount,
  }));

  // Calculate overall performance
  const totalDelivered = data.reduce((sum, item) => sum + item.deliveredWeight * item.chickenCount, 0);
  const totalCount = data.reduce((sum, item) => sum + item.chickenCount, 0);
  const avgDeliveredWeight = totalCount > 0 ? totalDelivered / totalCount : 0;
  const overallVariance = targetDeliveredWeight ? avgDeliveredWeight - targetDeliveredWeight : 0;
  const overallVariancePercent = targetDeliveredWeight && targetDeliveredWeight > 0 
    ? (overallVariance / targetDeliveredWeight) * 100 
    : 0;

  // Determine bar colors based on performance
  const getBarColor = (variance: number) => {
    if (variance >= 0) return "hsl(142, 76%, 36%)"; // Green for meeting/exceeding target
    if (variance >= -0.1) return "hsl(48, 96%, 53%)"; // Yellow for slightly under
    return "hsl(0, 84%, 60%)"; // Red for significantly under
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Harvest Performance</CardTitle>
        <CardDescription>
          Average delivered weight across {data.length} catch{data.length !== 1 ? 'es' : ''} vs target weight
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Overall Performance Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-muted/50 rounded-lg p-4">
            <div className="text-sm text-muted-foreground">Total Harvested</div>
            <div className="text-2xl font-bold">{totalCount.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">birds</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-4">
            <div className="text-sm text-muted-foreground">Avg Delivered Weight</div>
            <div className="text-2xl font-bold">{avgDeliveredWeight.toFixed(2)} kg</div>
            <div className="text-xs text-muted-foreground">per bird</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-4">
            <div className="text-sm text-muted-foreground">Target Weight</div>
            <div className="text-2xl font-bold">{targetDeliveredWeight?.toFixed(2) || 'N/A'} kg</div>
            <div className="text-xs text-muted-foreground">per bird</div>
          </div>
          <div className={`bg-muted/50 rounded-lg p-4 ${
            overallVariance >= 0 ? 'border-l-4 border-green-500' : 
            overallVariance >= -0.1 ? 'border-l-4 border-yellow-500' : 
            'border-l-4 border-red-500'
          }`}>
            <div className="text-sm text-muted-foreground">Overall Variance</div>
            <div className={`text-2xl font-bold ${
              overallVariance >= 0 ? 'text-green-600' : 
              overallVariance >= -0.1 ? 'text-yellow-600' : 
              'text-red-600'
            }`}>
              {overallVariance >= 0 ? '+' : ''}{overallVariance.toFixed(2)} kg
            </div>
            <div className={`text-xs ${
              overallVariance >= 0 ? 'text-green-600' : 
              overallVariance >= -0.1 ? 'text-yellow-600' : 
              'text-red-600'
            }`}>
              {overallVariancePercent >= 0 ? '+' : ''}{overallVariancePercent.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Chart */}
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis 
              dataKey="name" 
              angle={-45}
              textAnchor="end"
              height={80}
              tick={{ fontSize: 12 }}
            />
            <YAxis 
              label={{ value: 'Weight (kg)', angle: -90, position: 'insideLeft' }}
              tick={{ fontSize: 12 }}
            />
            <Tooltip 
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="bg-background border border-border rounded-lg shadow-lg p-3">
                      <p className="font-semibold mb-2">{data.name}</p>
                      <p className="text-sm text-muted-foreground mb-2">{data.date}</p>
                      <div className="space-y-1">
                        <p className="text-sm">
                          <span className="text-green-600 font-medium">Delivered:</span> {data.delivered} kg
                        </p>
                        <p className="text-sm">
                          <span className="text-orange-600 font-medium">Target:</span> {data.target} kg
                        </p>
                        <p className="text-sm">
                          <span className={`font-medium ${
                            data.variance >= 0 ? 'text-green-600' : 
                            data.variance >= -0.1 ? 'text-yellow-600' : 
                            'text-red-600'
                          }`}>
                            Variance:
                          </span> {data.variance >= 0 ? '+' : ''}{data.variance} kg ({data.variancePercent >= 0 ? '+' : ''}{data.variancePercent}%)
                        </p>
                        <p className="text-sm text-muted-foreground">Birds: {data.count.toLocaleString()}</p>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend 
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="square"
            />
            {targetDeliveredWeight && (
              <ReferenceLine 
                y={targetDeliveredWeight} 
                stroke="hsl(24, 95%, 53%)" 
                strokeDasharray="5 5" 
                strokeWidth={2}
                label={{ value: 'Target', position: 'right', fill: 'hsl(24, 95%, 53%)' }}
              />
            )}
            <Bar 
              dataKey="delivered" 
              name="Delivered Weight (kg)" 
              radius={[8, 8, 0, 0]}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.variance)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Performance Legend */}
        <div className="mt-6 flex flex-wrap gap-4 justify-center text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-green-600"></div>
            <span className="text-muted-foreground">Meeting/Exceeding Target</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-yellow-500"></div>
            <span className="text-muted-foreground">Slightly Under Target (&lt;100g)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-red-500"></div>
            <span className="text-muted-foreground">Significantly Under Target</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
