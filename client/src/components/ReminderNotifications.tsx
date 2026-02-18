import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { format } from "date-fns";
import React from "react";

export function ReminderNotifications() {
  const [, setLocation] = useLocation();
  const [open, setOpen] = React.useState(false);
  
  // Fetch all pending reminders across all flocks
  const { data: allReminders } = trpc.reminders.listAll.useQuery();
  
  // Filter for pending and overdue reminders
  const now = new Date();
  const pendingReminders = allReminders?.filter(r => r.status === "pending") || [];
  const overdueReminders = pendingReminders.filter(r => new Date(r.dueDate) < now);
  const upcomingReminders = pendingReminders.filter(r => {
    const dueDate = new Date(r.dueDate);
    const diffDays = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 3; // Next 3 days
  });
  
  const totalCount = overdueReminders.length + upcomingReminders.length;
  
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
  
  const handleReminderClick = (flockId: number | null) => {
    setOpen(false); // Close dropdown
    if (flockId) {
      setLocation(`/flocks/${flockId}?tab=reminders`);
    } else {
      // If no flockId, go to dashboard
      setLocation("/");
    }
  };
  
  const handleViewAll = () => {
    setOpen(false); // Close dropdown
    setLocation("/reminders");
  };
  
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {totalCount > 0 && (
            <Badge 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs bg-red-500 hover:bg-red-600"
            >
              {totalCount > 9 ? "9+" : totalCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <h3 className="font-semibold text-sm">Reminders & Alerts</h3>
          {totalCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {totalCount}
            </Badge>
          )}
        </div>
        
        <div className="max-h-[400px] overflow-y-auto">
          {overdueReminders.length > 0 && (
            <>
              <div className="px-4 py-2 text-xs font-semibold text-red-600 bg-red-50 dark:bg-red-950">
                Overdue ({overdueReminders.length})
              </div>
              {overdueReminders.slice(0, 5).map((reminder) => (
                <DropdownMenuItem
                  key={reminder.id}
                  className="cursor-pointer px-4 py-3 flex flex-col items-start gap-1"
                  onClick={() => handleReminderClick(reminder.flockId)}
                >
                  <div className="flex items-center gap-2 w-full">
                    <div className={`h-2 w-2 rounded-full ${getPriorityColor(reminder.priority)}`} />
                    <span className="font-medium text-sm flex-1 line-clamp-1">{reminder.title}</span>
                  </div>
                  <span className="text-xs text-muted-foreground pl-4">
                    Due: {format(new Date(reminder.dueDate), "MMM d, yyyy")}
                  </span>
                  {reminder.flockNumber && (
                    <span className="text-xs text-muted-foreground pl-4">
                      Flock: {reminder.flockNumber}
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </>
          )}
          
          {upcomingReminders.length > 0 && (
            <>
              <div className="px-4 py-2 text-xs font-semibold text-orange-600 bg-orange-50 dark:bg-orange-950">
                Upcoming (Next 3 Days) ({upcomingReminders.length})
              </div>
              {upcomingReminders.slice(0, 5).map((reminder) => (
                <DropdownMenuItem
                  key={reminder.id}
                  className="cursor-pointer px-4 py-3 flex flex-col items-start gap-1"
                  onClick={() => handleReminderClick(reminder.flockId)}
                >
                  <div className="flex items-center gap-2 w-full">
                    <div className={`h-2 w-2 rounded-full ${getPriorityColor(reminder.priority)}`} />
                    <span className="font-medium text-sm flex-1 line-clamp-1">{reminder.title}</span>
                  </div>
                  <span className="text-xs text-muted-foreground pl-4">
                    Due: {format(new Date(reminder.dueDate), "MMM d, yyyy")}
                  </span>
                  {reminder.flockNumber && (
                    <span className="text-xs text-muted-foreground pl-4">
                      Flock: {reminder.flockNumber}
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </>
          )}
          
          {totalCount === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
              No pending reminders
            </div>
          )}
        </div>
        
        {totalCount > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer justify-center font-medium"
              onClick={handleViewAll}
            >
              View All Reminders
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
