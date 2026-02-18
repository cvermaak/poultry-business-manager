import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { format, isToday, isThisWeek, addWeeks, isBefore, startOfDay } from "date-fns";

export default function AllReminders() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  
  // Fetch all reminders
  const { data: allReminders, isLoading } = trpc.reminders.listAll.useQuery();
  
  // Action dialog state
  const [actionDialog, setActionDialog] = useState<{
    open: boolean;
    reminderId: number | null;
    action: "complete" | "dismiss" | null;
  }>({ open: false, reminderId: null, action: null });
  const [actionNotes, setActionNotes] = useState("");
  
  // Update reminder status mutation
  const updateStatus = trpc.reminders.updateStatus.useMutation({
    onSuccess: () => {
      utils.reminders.listAll.invalidate();
      toast.success(
        actionDialog.action === "complete"
          ? "Reminder marked as complete"
          : "Reminder dismissed"
      );
      setActionDialog({ open: false, reminderId: null, action: null });
      setActionNotes("");
    },
    onError: (error) => {
      toast.error(`Failed to update reminder: ${error.message}`);
    },
  });
  
  // Filter pending reminders and categorize
  const now = new Date();
  const todayStart = startOfDay(now);
  const nextWeekEnd = addWeeks(todayStart, 1);
  const twoWeeksEnd = addWeeks(todayStart, 2);
  
  const pendingReminders = allReminders?.filter(r => r.status === "pending") || [];
  
  const overdueReminders = pendingReminders.filter(r => {
    const dueDate = new Date(r.dueDate);
    return isBefore(dueDate, todayStart);
  });
  
  const todayReminders = pendingReminders.filter(r => {
    const dueDate = new Date(r.dueDate);
    return isToday(dueDate);
  });
  
  const thisWeekReminders = pendingReminders.filter(r => {
    const dueDate = new Date(r.dueDate);
    return !isToday(dueDate) && isThisWeek(dueDate, { weekStartsOn: 1 }) && dueDate >= todayStart;
  });
  
  const nextWeekReminders = pendingReminders.filter(r => {
    const dueDate = new Date(r.dueDate);
    return dueDate > nextWeekEnd && dueDate <= twoWeeksEnd;
  });
  
  const laterReminders = pendingReminders.filter(r => {
    const dueDate = new Date(r.dueDate);
    return dueDate > twoWeeksEnd;
  });
  
  // Priority colors
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent": return "bg-red-500";
      case "high": return "bg-orange-500";
      case "medium": return "bg-yellow-500";
      case "low": return "bg-blue-500";
      default: return "bg-gray-500";
    }
  };
  
  const getPriorityLabel = (priority: string) => {
    return priority.charAt(0).toUpperCase() + priority.slice(1);
  };
  
  // Handle action button clicks
  const handleAction = (reminderId: number, action: "complete" | "dismiss") => {
    setActionDialog({ open: true, reminderId, action });
  };
  
  const confirmAction = () => {
    if (!actionDialog.reminderId || !actionDialog.action) return;
    
    updateStatus.mutate({
      id: actionDialog.reminderId,
      status: actionDialog.action === "complete" ? "completed" : "dismissed",
      completedBy: user?.id,
      actionNotes: actionNotes || undefined,
    });
  };
  
  // Render reminder card
  const renderReminder = (reminder: any) => (
    <Card key={reminder.id} className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${getPriorityColor(reminder.priority)}`} />
              <h3 className="font-semibold text-base">{reminder.title}</h3>
              <Badge variant="outline" className="text-xs">
                {getPriorityLabel(reminder.priority)}
              </Badge>
            </div>
            
            {reminder.description && (
              <p className="text-sm text-muted-foreground">{reminder.description}</p>
            )}
            
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>Due: {format(new Date(reminder.dueDate), "MMM d, yyyy")}</span>
              {reminder.flockNumber && (
                <button
                  onClick={() => setLocation(`/flocks/${reminder.flockId}?tab=reminders`)}
                  className="text-primary hover:underline"
                >
                  Flock: {reminder.flockNumber}
                </button>
              )}
              {reminder.houseName && (
                <span>House: {reminder.houseName}</span>
              )}
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="default"
              onClick={() => handleAction(reminder.id, "complete")}
              className="gap-1"
            >
              <CheckCircle2 className="h-4 w-4" />
              Complete
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleAction(reminder.id, "dismiss")}
              className="gap-1"
            >
              <XCircle className="h-4 w-4" />
              Dismiss
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
  
  if (isLoading) {
    return (
      <div className="container max-w-6xl py-6">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-3xl font-bold">All Reminders</h1>
        </div>
        <p className="text-muted-foreground">Loading reminders...</p>
      </div>
    );
  }
  
  return (
    <div className="container max-w-6xl py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">All Reminders</h1>
          <p className="text-muted-foreground">
            Manage all pending reminders across your operation
          </p>
        </div>
        <Badge variant="secondary" className="text-lg px-4 py-2">
          {pendingReminders.length} Pending
        </Badge>
      </div>
      
      {/* Overdue Reminders */}
      {overdueReminders.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-red-600">Overdue</h2>
            <Badge variant="destructive">{overdueReminders.length}</Badge>
          </div>
          <div className="space-y-3">
            {overdueReminders.map(renderReminder)}
          </div>
        </div>
      )}
      
      {/* Today's Reminders */}
      {todayReminders.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-orange-600">Today</h2>
            <Badge variant="secondary">{todayReminders.length}</Badge>
          </div>
          <div className="space-y-3">
            {todayReminders.map(renderReminder)}
          </div>
        </div>
      )}
      
      {/* This Week's Reminders */}
      {thisWeekReminders.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">This Week</h2>
            <Badge variant="secondary">{thisWeekReminders.length}</Badge>
          </div>
          <div className="space-y-3">
            {thisWeekReminders.map(renderReminder)}
          </div>
        </div>
      )}
      
      {/* Next Week's Reminders */}
      {nextWeekReminders.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">Next Week</h2>
            <Badge variant="secondary">{nextWeekReminders.length}</Badge>
          </div>
          <div className="space-y-3">
            {nextWeekReminders.map(renderReminder)}
          </div>
        </div>
      )}
      
      {/* Later Reminders */}
      {laterReminders.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-muted-foreground">Later</h2>
            <Badge variant="outline">{laterReminders.length}</Badge>
          </div>
          <div className="space-y-3">
            {laterReminders.map(renderReminder)}
          </div>
        </div>
      )}
      
      {/* Empty State */}
      {pendingReminders.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">No Pending Reminders</h3>
            <p className="text-muted-foreground">
              All reminders have been completed or dismissed. Great job!
            </p>
          </CardContent>
        </Card>
      )}
      
      {/* Action Dialog */}
      <Dialog open={actionDialog.open} onOpenChange={(open) => !open && setActionDialog({ open: false, reminderId: null, action: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog.action === "complete" ? "Complete Reminder" : "Dismiss Reminder"}
            </DialogTitle>
            <DialogDescription>
              {actionDialog.action === "complete"
                ? "Mark this reminder as complete and optionally add notes about the action taken."
                : "Dismiss this reminder if it's no longer relevant."}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Notes {actionDialog.action === "complete" ? "(Optional)" : "(Optional)"}
              </label>
              <Textarea
                placeholder={
                  actionDialog.action === "complete"
                    ? "Describe what was done..."
                    : "Reason for dismissal..."
                }
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setActionDialog({ open: false, reminderId: null, action: null })}
            >
              Cancel
            </Button>
            <Button onClick={confirmAction} disabled={updateStatus.isPending}>
              {updateStatus.isPending ? "Saving..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
