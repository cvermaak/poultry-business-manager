import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertCircle, Clock, CheckCircle2, Bell, User } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

type ReminderPriority = "urgent" | "high" | "medium" | "low";

const priorityConfig: Record<ReminderPriority, { color: string; icon: typeof AlertCircle }> = {
  urgent: { color: "destructive", icon: AlertCircle },
  high: { color: "orange", icon: AlertCircle },
  medium: { color: "blue", icon: Clock },
  low: { color: "secondary", icon: Bell },
};

export default function RemindersWidget() {
  const [activeTab, setActiveTab] = useState<"today" | "week" | "next_week" | "history">("today");
  const [completionDialog, setCompletionDialog] = useState<{ open: boolean; reminderId: number | null; action: "complete" | "dismiss" | null }>({ open: false, reminderId: null, action: null });
  const [actionNotes, setActionNotes] = useState("");
  const [historyFilters, setHistoryFilters] = useState<{
    status: "completed" | "dismissed" | "all";
    priority: "urgent" | "high" | "medium" | "low" | "all";
    dateRange: "7" | "30" | "90" | "all";
  }>({
    status: "all",
    priority: "all",
    dateRange: "30",
  });
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // Refetch query when filters change
  useEffect(() => {
    if (activeTab === "history") {
      refetchHistory();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyFilters.status, historyFilters.priority, historyFilters.dateRange]);

  const { data: todayReminders, isLoading: loadingToday } = trpc.reminders.getToday.useQuery();
  const { data: weekReminders, isLoading: loadingWeek } = trpc.reminders.getUpcoming.useQuery({ days: 7 });
  const { data: nextWeekReminders, isLoading: loadingNextWeek } = trpc.reminders.getUpcoming.useQuery({ days: 14 });
  const queryInput = useMemo(() => {
    return { limit: 50, status: historyFilters.status, priority: historyFilters.priority, dateRange: historyFilters.dateRange };
  }, [historyFilters.status, historyFilters.priority, historyFilters.dateRange]);
  
  const { data: completedHistory, isLoading: loadingHistory, refetch: refetchHistory } = trpc.reminders.getCompletedHistory.useQuery(
    queryInput,
    { 
      enabled: activeTab === "history",
      refetchOnMount: true,
      refetchOnWindowFocus: false,
      trpc: {
        context: {
          skipBatch: true
        }
      }
    }
  );

  const updateStatusMutation = trpc.reminders.updateStatus.useMutation({
    onSuccess: () => {
      utils.reminders.getToday.invalidate();
      utils.reminders.getUpcoming.invalidate();
      utils.reminders.getCompletedHistory.invalidate();
      setCompletionDialog({ open: false, reminderId: null, action: null });
      setActionNotes("");
      toast.success("Reminder updated");
    },
    onError: (error) => {
      toast.error(`Failed to update reminder: ${error.message}`);
    },
  });

  const handleOpenDialog = (id: number, action: "complete" | "dismiss") => {
    setCompletionDialog({ open: true, reminderId: id, action });
  };

  const handleConfirmAction = () => {
    if (!completionDialog.reminderId || !completionDialog.action) return;
    
    updateStatusMutation.mutate({
      id: completionDialog.reminderId,
      status: completionDialog.action === "complete" ? "completed" : "dismissed",
      actionNotes: actionNotes || undefined,
    });
  };

  const getReminders = () => {
    if (activeTab === "today") return todayReminders || [];
    if (activeTab === "history") return completedHistory || [];
    if (activeTab === "week") {
      // Filter to only show this week (next 7 days)
      const today = new Date();
      const nextWeek = new Date();
      nextWeek.setDate(today.getDate() + 7);
      return (weekReminders || []).filter((r) => {
        const dueDate = new Date(r.dueDate);
        return dueDate >= today && dueDate <= nextWeek;
      });
    }
    // next_week: days 8-14
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + 7);
    const twoWeeksEnd = new Date();
    twoWeeksEnd.setDate(twoWeeksEnd.getDate() + 14);
    return (nextWeekReminders || []).filter((r) => {
      const dueDate = new Date(r.dueDate);
      return dueDate > weekEnd && dueDate <= twoWeeksEnd;
    });
  };

  const isLoading = activeTab === "history" ? loadingHistory : (loadingToday || loadingWeek || loadingNextWeek);
  const reminders = getReminders();

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    // Display date in user's local timezone without time
    return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-start gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tab Selector */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab("today")}
          className={`px-3 py-2 text-sm font-medium transition-colors ${
            activeTab === "today"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Today
          {todayReminders && todayReminders.length > 0 && (
            <Badge variant="destructive" className="ml-2">
              {todayReminders.length}
            </Badge>
          )}
        </button>
        <button
          onClick={() => setActiveTab("week")}
          className={`px-3 py-2 text-sm font-medium transition-colors ${
            activeTab === "week"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          This Week
        </button>
        <button
          onClick={() => setActiveTab("next_week")}
          className={`px-3 py-2 text-sm font-medium transition-colors ${
            activeTab === "next_week"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Next Week
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`px-3 py-2 text-sm font-medium transition-colors ${
            activeTab === "history"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Action History
        </button>
      </div>

      {/* Filter Controls for History Tab */}
      {activeTab === "history" && (
        <div className="flex flex-wrap gap-2 p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium">Status:</label>
            <select
              className="text-xs border rounded px-2 py-1 bg-background"
              value={historyFilters.status}
              onChange={(e) => setHistoryFilters({ ...historyFilters, status: e.target.value as any })}
            >
              <option value="all">All</option>
              <option value="completed">Completed</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium">Priority:</label>
            <select
              className="text-xs border rounded px-2 py-1 bg-background"
              value={historyFilters.priority}
              onChange={(e) => setHistoryFilters({ ...historyFilters, priority: e.target.value as any })}
            >
              <option value="all">All</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium">Date Range:</label>
            <select
              className="text-xs border rounded px-2 py-1 bg-background"
              value={historyFilters.dateRange}
              onChange={(e) => setHistoryFilters({ ...historyFilters, dateRange: e.target.value as any })}
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="all">All time</option>
            </select>
          </div>
        </div>
      )}

      {/* Reminders List */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {reminders.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No reminders for this period</p>
          </div>
        ) : (
          reminders.map((reminder) => {
            const PriorityIcon = priorityConfig[reminder.priority as ReminderPriority].icon;
            return (
              <div
                key={reminder.id}
                className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className={`p-2 rounded-full bg-${priorityConfig[reminder.priority as ReminderPriority].color}/10`}>
                  <PriorityIcon className={`h-4 w-4 text-${priorityConfig[reminder.priority as ReminderPriority].color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium leading-none mb-1">{reminder.title}</p>
                      {reminder.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{reminder.description}</p>
                      )}
                      <div className="flex items-center flex-wrap gap-2 text-xs text-muted-foreground">
                        {(reminder as any).houseName && (
                          <Badge variant="outline" className="text-xs font-normal">
                            {(reminder as any).houseName}
                          </Badge>
                        )}
                        <Clock className="h-3 w-3" />
                        <span>
                          {formatDate(reminder.dueDate)}
                        </span>
                        <Badge variant={priorityConfig[reminder.priority as ReminderPriority].color as any} className="text-xs">
                          {reminder.priority}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  {reminder.status === "completed" && reminder.completedBy && (
                    <div className="mt-2 p-2 rounded bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
                      <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-300">
                        <User className="h-3 w-3" />
                        <span>Completed by User #{reminder.completedBy}</span>
                        {reminder.completedAt && (
                          <span className="text-muted-foreground">
                            on {formatDate(reminder.completedAt)}
                          </span>
                        )}
                      </div>
                      {reminder.actionNotes && (
                        <p className="text-xs text-muted-foreground mt-1 italic">"{reminder.actionNotes}"</p>
                      )}
                    </div>
                  )}
                  {reminder.status === "dismissed" && reminder.completedBy && (
                    <div className="mt-2 p-2 rounded bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                        <User className="h-3 w-3" />
                        <span>Dismissed by User #{reminder.completedBy}</span>
                        {reminder.completedAt && (
                          <span className="text-muted-foreground">
                            on {formatDate(reminder.completedAt)}
                          </span>
                        )}
                      </div>
                      {reminder.actionNotes && (
                        <p className="text-xs text-muted-foreground mt-1 italic">"{reminder.actionNotes}"</p>
                      )}
                    </div>
                  )}
                  {activeTab === "today" && reminder.status === "pending" && (
                    <div className="flex gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenDialog(reminder.id, "complete")}
                        disabled={updateStatusMutation.isPending}
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Complete
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleOpenDialog(reminder.id, "dismiss")}
                        disabled={updateStatusMutation.isPending}
                      >
                        Dismiss
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {reminders.length > 0 && (
        <div className="pt-2 border-t">
          <a href="/reminders" className="text-sm text-primary hover:underline">
            View all reminders →
          </a>
        </div>
      )}

      {/* Completion Dialog */}
      <Dialog open={completionDialog.open} onOpenChange={(open) => !open && setCompletionDialog({ open: false, reminderId: null, action: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {completionDialog.action === "complete" ? "Complete Reminder" : "Dismiss Reminder"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="actionNotes">Notes (Optional)</Label>
              <Textarea
                id="actionNotes"
                placeholder={completionDialog.action === "complete" 
                  ? "Add any notes about how this task was completed..."
                  : "Add a reason for dismissing this reminder..."}
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                rows={3}
              />
            </div>
            {user && (
              <p className="text-sm text-muted-foreground">
                This action will be recorded as performed by {user.name || user.email}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompletionDialog({ open: false, reminderId: null, action: null })}>
              Cancel
            </Button>
            <Button onClick={handleConfirmAction} disabled={updateStatusMutation.isPending}>
              {completionDialog.action === "complete" ? "Mark Complete" : "Dismiss"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
