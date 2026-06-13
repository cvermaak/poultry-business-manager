import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ShoppingCart, Clock, CheckCircle } from "lucide-react";

export default function FeedAlertsWidget() {
  const { data: alerts, isLoading } = trpc.feedOrders.getAlerts.useQuery();

  const critical = alerts?.filter((a: any) => a.severity === "critical") ?? [];
  const warnings = alerts?.filter((a: any) => a.severity === "warning") ?? [];
  const infos = alerts?.filter((a: any) => a.severity === "info") ?? [];

  const totalAlerts = (alerts?.length ?? 0);

  return (
    <>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingCart className="h-5 w-5" />
            Feed Order Alerts
            {totalAlerts > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                {totalAlerts}
              </span>
            )}
          </CardTitle>
          <CardDescription>Upcoming feed stage transitions and order deadlines</CardDescription>
        </div>
        <Link href="/feed-orders">
          <Button variant="outline" size="sm">View All Orders</Button>
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading alerts...</p>
        )}
        {!isLoading && totalAlerts === 0 && (
          <div className="flex items-center gap-2 text-sm text-green-700">
            <CheckCircle className="h-4 w-4" />
            No feed order alerts. All flocks are on track.
          </div>
        )}
        {!isLoading && totalAlerts > 0 && (
          <div className="space-y-2">
            {critical.map((alert: any, i: number) => (
              <div key={`c-${i}`} className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-red-600" />
                <div className="flex-1">
                  <p>{alert.message}</p>
                  {alert.flockNumber && (
                    <p className="text-xs text-red-600 mt-0.5">Flock: {alert.flockNumber} — {alert.customerName}</p>
                  )}
                </div>
                {alert.flockId && (
                  <Link href={`/flocks/${alert.flockId}`}>
                    <Button variant="ghost" size="sm" className="text-xs h-6 text-red-700 hover:bg-red-100">View Flock</Button>
                  </Link>
                )}
              </div>
            ))}
            {warnings.map((alert: any, i: number) => (
              <div key={`w-${i}`} className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
                <Clock className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                <div className="flex-1">
                  <p>{alert.message}</p>
                  {alert.flockNumber && (
                    <p className="text-xs text-amber-600 mt-0.5">Flock: {alert.flockNumber} — {alert.customerName}</p>
                  )}
                </div>
                {alert.flockId && (
                  <Link href={`/flocks/${alert.flockId}`}>
                    <Button variant="ghost" size="sm" className="text-xs h-6 text-amber-700 hover:bg-amber-100">View Flock</Button>
                  </Link>
                )}
              </div>
            ))}
            {infos.slice(0, 3).map((alert: any, i: number) => (
              <div key={`i-${i}`} className="flex items-start gap-2 p-2 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-800">
                <ShoppingCart className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />
                <div className="flex-1">
                  <p>{alert.message}</p>
                  {alert.flockNumber && (
                    <p className="text-xs text-blue-600 mt-0.5">Flock: {alert.flockNumber} — {alert.customerName}</p>
                  )}
                </div>
              </div>
            ))}
            {infos.length > 3 && (
              <p className="text-xs text-muted-foreground pl-2">+{infos.length - 3} more info alerts</p>
            )}
          </div>
        )}
      </CardContent>
    </>
  );
}
