import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Search } from "lucide-react";

export default function AuditLogs() {
  const [searchQuery, setSearchQuery] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("all");

  const { data: allLogs, isLoading } = trpc.system.getAllActivityLogs.useQuery();

  const filteredLogs = (allLogs || []).filter((log: any) => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = 
        log.action.toLowerCase().includes(query) ||
        log.details?.toLowerCase().includes(query) ||
        log.userName?.toLowerCase().includes(query) ||
        log.entityType?.toLowerCase().includes(query);
      if (!matchesSearch) return false;
    }

    // Entity type filter
    if (entityTypeFilter !== "all" && log.entityType !== entityTypeFilter) {
      return false;
    }

    // Action filter
    if (actionFilter !== "all") {
      if (actionFilter === "create" && !log.action.includes("create")) return false;
      if (actionFilter === "update" && !log.action.includes("update")) return false;
      if (actionFilter === "delete" && !log.action.includes("delete")) return false;
      if (actionFilter === "status" && !log.action.includes("status")) return false;
    }

    // Date range filter
    if (dateRange !== "all") {
      const logDate = new Date(log.createdAt);
      const now = new Date();
      const daysDiff = Math.floor((now.getTime() - logDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (dateRange === "today" && daysDiff > 0) return false;
      if (dateRange === "week" && daysDiff > 7) return false;
      if (dateRange === "month" && daysDiff > 30) return false;
    }

    return true;
  });

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Audit Logs</h1>
        <p className="text-muted-foreground">
          Complete system-wide audit trail of all user activities and changes
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Search and filter audit logs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Entity Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Entities</SelectItem>
                <SelectItem value="flock">Flocks</SelectItem>
                <SelectItem value="house">Houses</SelectItem>
                <SelectItem value="daily_record">Daily Records</SelectItem>
                <SelectItem value="health_record">Health Records</SelectItem>
                <SelectItem value="vaccination_schedule">Vaccinations</SelectItem>
                <SelectItem value="reminder">Reminders</SelectItem>
                <SelectItem value="harvest">Harvests</SelectItem>
                <SelectItem value="user">Users</SelectItem>
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Action Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="create">Create</SelectItem>
                <SelectItem value="update">Update</SelectItem>
                <SelectItem value="delete">Delete</SelectItem>
                <SelectItem value="status">Status Changes</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger>
                <SelectValue placeholder="Date Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">Past Week</SelectItem>
                <SelectItem value="month">Past Month</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Log</CardTitle>
          <CardDescription>
            Showing {filteredLogs.length} of {allLogs?.length || 0} total logs
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">
              Loading audit logs...
            </div>
          ) : filteredLogs.length > 0 ? (
            <div className="space-y-3">
              {filteredLogs.map((log: any) => (
                <div key={log.id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold capitalize">
                          {log.action.replace(/_/g, ' ')}
                        </span>
                        {log.entityType && (
                          <Badge variant="outline" className="capitalize">
                            {log.entityType.replace(/_/g, ' ')}
                          </Badge>
                        )}
                        {log.entityId && (
                          <span className="text-xs text-muted-foreground">
                            ID: {log.entityId}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {format(new Date(log.createdAt), 'MMM d, yyyy \\at h:mm a')}
                      </div>
                      {log.details && (
                        <div className="text-sm break-words">
                          {log.details}
                        </div>
                      )}
                    </div>
                    {log.userName && (
                      <Badge variant="secondary" className="shrink-0">
                        {log.userName}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>No audit logs found</p>
              <p className="text-sm">Try adjusting your filters</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
