import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, TrendingUp, Users, DollarSign, Bell, AlertCircle, Clock, CheckCircle2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import RemindersWidget from "@/components/RemindersWidget";

export default function Home() {
  const { data: analytics, isLoading } = trpc.analytics.dashboard.useQuery();

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Hero Banner Skeleton */}
        <Skeleton className="w-full h-48 rounded-xl" />

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4 rounded-full" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
    }).format(cents / 100);
  };

  return (
    <div className="space-y-6">
      {/* Hero Banner */}
      <div className="relative w-full rounded-lg overflow-hidden shadow-sm border" style={{ aspectRatio: '6/1' }}>
        <img 
          src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663029451273/fIAFAsFnFJkgBmHY.png" 
          alt="AFGRO Poultry Manager - Modern chicken farm" 
          className="w-full h-full object-cover object-left"
        />
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Flocks</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.activeFlocks || 0}</div>
            <p className="text-xs text-muted-foreground">Currently in production</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.totalCustomers || 0}</div>
            <p className="text-xs text-muted-foreground">Active customer accounts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {analytics?.monthlyRevenue ? formatCurrency(analytics.monthlyRevenue) : "R0.00"}
            </div>
            <p className="text-xs text-muted-foreground">Current month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Performance</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Good</div>
            <p className="text-xs text-muted-foreground">Overall status</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks and operations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 gap-4">
              <a
                href="/flocks"
                className="flex items-center justify-center p-4 border rounded-lg hover:bg-accent transition-colors"
              >
                <div className="text-center">
                  <Activity className="h-6 w-6 mx-auto mb-2 text-primary" />
                  <p className="font-medium">Manage Flocks</p>
                </div>
              </a>
              <a
                href="/houses"
                className="flex items-center justify-center p-4 border rounded-lg hover:bg-accent transition-colors"
              >
                <div className="text-center">
                  <Activity className="h-6 w-6 mx-auto mb-2 text-primary" />
                  <p className="font-medium">House Configuration</p>
                </div>
              </a>
              <a
                href="/customers"
                className="flex items-center justify-center p-4 border rounded-lg hover:bg-accent transition-colors"
              >
                <div className="text-center">
                  <Users className="h-6 w-6 mx-auto mb-2 text-primary" />
                  <p className="font-medium">Customer Management</p>
                </div>
              </a>
              <a
                href="/suppliers"
                className="flex items-center justify-center p-4 border rounded-lg hover:bg-accent transition-colors"
              >
                <div className="text-center">
                  <Users className="h-6 w-6 mx-auto mb-2 text-primary" />
                  <p className="font-medium">Supplier Management</p>
                </div>
              </a>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Reminders & Alerts
            </CardTitle>
            <CardDescription>Upcoming tasks and notifications</CardDescription>
          </CardHeader>
          <CardContent>
            <RemindersWidget />
            <div className="space-y-4">
              <div className="flex items-center">
                <div className="ml-4 space-y-1">
                  <p className="text-sm font-medium leading-none">System initialized</p>
                  <p className="text-sm text-muted-foreground">Ready to start managing your poultry business</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
