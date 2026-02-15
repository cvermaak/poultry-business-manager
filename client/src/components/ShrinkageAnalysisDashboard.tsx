import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, ScatterChart, Scatter } from "recharts";
import { TrendingDown, TrendingUp, AlertTriangle, CheckCircle2 } from "lucide-react";

interface ShrinkageDataPoint {
  catchDate: string | Date;
  shrinkagePercent: number;
  travelDuration: number;
  feedWithdrawalDuration: number;
  loadedWeight: number;
  deliveredWeight: number;
  chickenCount: number;
}

interface ShrinkageAnalysisDashboardProps {
  data: ShrinkageDataPoint[];
}

export function ShrinkageAnalysisDashboard({ data }: ShrinkageAnalysisDashboardProps) {
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Shrinkage Analysis</CardTitle>
          <CardDescription>Weight loss patterns and optimization insights</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            No harvest data available for shrinkage analysis
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate summary statistics
  const avgShrinkage = data.reduce((sum, item) => sum + item.shrinkagePercent, 0) / data.length;
  const minShrinkage = Math.min(...data.map(item => item.shrinkagePercent));
  const maxShrinkage = Math.max(...data.map(item => item.shrinkagePercent));
  const avgTravelTime = data.reduce((sum, item) => sum + item.travelDuration, 0) / data.length;
  
  // Industry benchmark for shrinkage (typically 3-6%)
  const industryBenchmark = 4.5;
  const targetShrinkage = 5.5; // Farm's target shrinkage buffer
  
  // Performance assessment
  const performanceStatus = avgShrinkage <= industryBenchmark ? 'excellent' : 
                           avgShrinkage <= targetShrinkage ? 'good' : 'needs-improvement';

  // Prepare trend chart data
  const trendData = data.map((item, index) => ({
    catch: `Catch ${index + 1}`,
    date: new Date(item.catchDate).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' }),
    shrinkage: Number(item.shrinkagePercent.toFixed(2)),
    travelTime: Number(item.travelDuration.toFixed(1)),
    count: item.chickenCount,
  }));

  // Prepare correlation data (travel time vs shrinkage)
  const correlationData = data.map((item, index) => ({
    travelTime: Number(item.travelDuration.toFixed(1)),
    shrinkage: Number(item.shrinkagePercent.toFixed(2)),
    name: `Catch ${index + 1}`,
  }));

  // Calculate correlation coefficient
  const calculateCorrelation = () => {
    const n = data.length;
    if (n < 2) return 0;
    
    const sumX = data.reduce((sum, item) => sum + item.travelDuration, 0);
    const sumY = data.reduce((sum, item) => sum + item.shrinkagePercent, 0);
    const sumXY = data.reduce((sum, item) => sum + (item.travelDuration * item.shrinkagePercent), 0);
    const sumX2 = data.reduce((sum, item) => sum + (item.travelDuration ** 2), 0);
    const sumY2 = data.reduce((sum, item) => sum + (item.shrinkagePercent ** 2), 0);
    
    const numerator = (n * sumXY) - (sumX * sumY);
    const denominator = Math.sqrt(((n * sumX2) - (sumX ** 2)) * ((n * sumY2) - (sumY ** 2)));
    
    return denominator === 0 ? 0 : numerator / denominator;
  };

  const correlation = calculateCorrelation();
  const correlationStrength = Math.abs(correlation) > 0.7 ? 'Strong' : 
                              Math.abs(correlation) > 0.4 ? 'Moderate' : 'Weak';

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className={`${
          performanceStatus === 'excellent' ? 'border-green-500 border-l-4' :
          performanceStatus === 'good' ? 'border-yellow-500 border-l-4' :
          'border-red-500 border-l-4'
        }`}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Average Shrinkage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <div className={`text-3xl font-bold ${
                performanceStatus === 'excellent' ? 'text-green-600' :
                performanceStatus === 'good' ? 'text-yellow-600' :
                'text-red-600'
              }`}>
                {avgShrinkage.toFixed(2)}%
              </div>
              {performanceStatus === 'excellent' ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : performanceStatus === 'good' ? (
                <TrendingDown className="h-5 w-5 text-yellow-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-red-600" />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {performanceStatus === 'excellent' ? 'Below industry benchmark' :
               performanceStatus === 'good' ? 'Within target range' :
               'Above target - needs attention'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Shrinkage Range</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{minShrinkage.toFixed(1)}% - {maxShrinkage.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-2">
              Best to worst performance
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Travel Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{avgTravelTime.toFixed(1)} hrs</div>
            <p className="text-xs text-muted-foreground mt-2">
              From farm to processor
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Travel Impact</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{correlationStrength}</div>
            <p className="text-xs text-muted-foreground mt-2">
              Correlation: {correlation >= 0 ? '+' : ''}{correlation.toFixed(2)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Shrinkage Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Shrinkage Trend Over Time</CardTitle>
          <CardDescription>Track weight loss percentage across catches</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={trendData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 12 }}
              />
              <YAxis 
                label={{ value: 'Shrinkage (%)', angle: -90, position: 'insideLeft' }}
                tick={{ fontSize: 12 }}
                domain={[0, 'auto']}
              />
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-background border border-border rounded-lg shadow-lg p-3">
                        <p className="font-semibold mb-2">{data.catch}</p>
                        <p className="text-sm text-muted-foreground mb-2">{data.date}</p>
                        <div className="space-y-1">
                          <p className="text-sm">
                            <span className="font-medium">Shrinkage:</span> {data.shrinkage}%
                          </p>
                          <p className="text-sm">
                            <span className="font-medium">Travel Time:</span> {data.travelTime} hrs
                          </p>
                          <p className="text-sm text-muted-foreground">Birds: {data.count.toLocaleString()}</p>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend />
              <ReferenceLine 
                y={industryBenchmark} 
                stroke="hsl(142, 76%, 36%)" 
                strokeDasharray="5 5" 
                label={{ value: 'Industry Benchmark', position: 'right', fill: 'hsl(142, 76%, 36%)' }}
              />
              <ReferenceLine 
                y={targetShrinkage} 
                stroke="hsl(24, 95%, 53%)" 
                strokeDasharray="5 5" 
                label={{ value: 'Farm Target', position: 'right', fill: 'hsl(24, 95%, 53%)' }}
              />
              <Line 
                type="monotone" 
                dataKey="shrinkage" 
                name="Shrinkage (%)"
                stroke="hsl(221, 83%, 53%)" 
                strokeWidth={3}
                dot={{ fill: 'hsl(221, 83%, 53%)', r: 5 }}
                activeDot={{ r: 7 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Travel Time vs Shrinkage Correlation */}
      <Card>
        <CardHeader>
          <CardTitle>Travel Time vs Shrinkage Correlation</CardTitle>
          <CardDescription>
            Analyze the relationship between travel duration and weight loss
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <ScatterChart margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis 
                type="number" 
                dataKey="travelTime" 
                name="Travel Time"
                label={{ value: 'Travel Time (hours)', position: 'insideBottom', offset: -10 }}
                tick={{ fontSize: 12 }}
              />
              <YAxis 
                type="number" 
                dataKey="shrinkage" 
                name="Shrinkage"
                label={{ value: 'Shrinkage (%)', angle: -90, position: 'insideLeft' }}
                tick={{ fontSize: 12 }}
              />
              <Tooltip 
                cursor={{ strokeDasharray: '3 3' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-background border border-border rounded-lg shadow-lg p-3">
                        <p className="font-semibold mb-2">{data.name}</p>
                        <div className="space-y-1">
                          <p className="text-sm">
                            <span className="font-medium">Travel Time:</span> {data.travelTime} hrs
                          </p>
                          <p className="text-sm">
                            <span className="font-medium">Shrinkage:</span> {data.shrinkage}%
                          </p>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Scatter 
                name="Catches" 
                data={correlationData} 
                fill="hsl(221, 83%, 53%)"
                shape="circle"
              />
            </ScatterChart>
          </ResponsiveContainer>
          
          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <p className="text-sm font-medium mb-2">Analysis:</p>
            <p className="text-sm text-muted-foreground">
              {Math.abs(correlation) > 0.7 ? (
                <>There is a <strong>strong {correlation > 0 ? 'positive' : 'negative'} correlation</strong> ({correlation.toFixed(2)}) between travel time and shrinkage. {correlation > 0 ? 'Longer travel times significantly increase weight loss.' : 'Surprisingly, longer travel times correlate with lower shrinkage - investigate other factors.'}</>
              ) : Math.abs(correlation) > 0.4 ? (
                <>There is a <strong>moderate {correlation > 0 ? 'positive' : 'negative'} correlation</strong> ({correlation.toFixed(2)}) between travel time and shrinkage. Travel time has some impact on weight loss, but other factors may also be significant.</>
              ) : (
                <>There is a <strong>weak correlation</strong> ({correlation.toFixed(2)}) between travel time and shrinkage. Weight loss is likely influenced more by other factors such as feed withdrawal timing, handling practices, or environmental conditions.</>
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle>Optimization Recommendations</CardTitle>
          <CardDescription>Actions to reduce shrinkage and improve performance</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {avgShrinkage > targetShrinkage && (
              <div className="flex gap-3 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-900 dark:text-red-100">High Shrinkage Alert</p>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                    Average shrinkage ({avgShrinkage.toFixed(2)}%) exceeds target ({targetShrinkage}%). Review catch procedures and transport conditions.
                  </p>
                </div>
              </div>
            )}
            
            {correlation > 0.5 && (
              <div className="flex gap-3 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg">
                <TrendingUp className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-900 dark:text-blue-100">Travel Time Impact</p>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    Travel time strongly correlates with shrinkage. Consider scheduling catches during cooler hours or finding closer processors.
                  </p>
                </div>
              </div>
            )}

            {avgShrinkage <= industryBenchmark && (
              <div className="flex gap-3 p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-green-900 dark:text-green-100">Excellent Performance</p>
                  <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                    Your shrinkage rate is below the industry benchmark. Document your best practices to maintain this performance.
                  </p>
                </div>
              </div>
            )}

            <div className="flex gap-3 p-3 bg-muted/50 border border-border rounded-lg">
              <div className="text-sm space-y-2">
                <p className="font-medium">General Best Practices:</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Optimize feed withdrawal timing (8-12 hours recommended)</li>
                  <li>Schedule catches during cooler parts of the day</li>
                  <li>Ensure proper ventilation during transport</li>
                  <li>Minimize handling stress during loading</li>
                  <li>Use appropriate crate density (avoid overcrowding)</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
