import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface CopyTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: {
    id: number;
    name: string;
    bundleConfig: any;
  };
  onSuccess?: () => void;
}

export function CopyTemplateDialog({ open, onOpenChange, template, onSuccess }: CopyTemplateDialogProps) {
  const [templateName, setTemplateName] = useState(`${template.name} (Custom)`);
  const [categories, setCategories] = useState(() => {
    // Initialize with all categories enabled
    if (!template.bundleConfig) return [];
    return template.bundleConfig.map((cat: any) => ({
      ...cat,
      enabled: true,
    }));
  });

  const copyMutation = trpc.reminderTemplates.copyAndCustomize.useMutation({
    onSuccess: () => {
      toast.success("Custom template created successfully");
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(`Failed to create template: ${error.message}`);
    },
  });

  const handleToggleCategory = (index: number) => {
    setCategories((prev: any[]) =>
      prev.map((cat: any, i: number) => (i === index ? { ...cat, enabled: !cat.enabled } : cat))
    );
  };

  const handleSave = () => {
    if (!templateName.trim()) {
      toast.error("Please enter a template name");
      return;
    }

    copyMutation.mutate({
      sourceTemplateId: template.id,
      newName: templateName,
      bundleConfig: categories,
    });
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      house_preparation: "House Preparation",
      feed_transition: "Feed Transitions",
      weight_sampling: "Weight Sampling",
      biosecurity: "Biosecurity",
      environmental_check: "Environmental Checks",
      milestone: "Milestones",
      vaccination: "Vaccinations",
      performance_alert: "Performance Alerts",
      routine_task: "Routine Tasks",
    };
    return labels[category] || category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const getCategoryDescription = (category: string) => {
    const descriptions: Record<string, string> = {
      house_preparation: "Cleaning, disinfection, and bedding setup",
      feed_transition: "Starter → Grower → Finisher feed transitions",
      weight_sampling: "Weekly weight monitoring (6 samples)",
      biosecurity: "Footbath, visitor protocols, equipment sanitization",
      environmental_check: "Temperature, humidity, and ventilation checks",
      milestone: "Weight checks, FCR assessments, market readiness",
      vaccination: "Disease prevention vaccinations schedule",
      performance_alert: "Mortality monitoring and growth targets",
      routine_task: "Regular maintenance and operational tasks",
    };
    return descriptions[category] || "Reminders for " + category.replace(/_/g, ' ');
  };

  const getEnabledCount = () => categories.filter((cat: any) => cat.enabled).length;
  const getTotalReminderCount = () => {
    return categories.reduce((total: number, cat: any) => {
      if (cat.enabled && cat.reminders) {
        return total + cat.reminders.length;
      }
      return total;
    }, 0);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Copy & Customize Template</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Template Name */}
          <div className="space-y-2">
            <Label htmlFor="template-name">Template Name</Label>
            <Input
              id="template-name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Enter custom template name"
            />
          </div>

          {/* Category Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Select Reminder Categories</Label>
              <span className="text-sm text-muted-foreground">
                {getEnabledCount()} of {categories.length} categories ({getTotalReminderCount()} reminders)
              </span>
            </div>

            <div className="space-y-3 border rounded-lg p-4">
              {categories.map((category: any, index: number) => (
                <div key={index} className="flex items-start space-x-3 p-3 rounded-md hover:bg-accent/50 transition-colors">
                  <Checkbox
                    id={`category-${index}`}
                    checked={category.enabled}
                    onCheckedChange={() => handleToggleCategory(index)}
                    className="mt-1"
                  />
                  <div className="flex-1 space-y-1">
                    <Label
                      htmlFor={`category-${index}`}
                      className="text-base font-medium cursor-pointer"
                    >
                      {getCategoryLabel(category.category)}
                      <span className="ml-2 text-sm text-muted-foreground font-normal">
                        ({category.reminders?.length || 0} reminders)
                      </span>
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {getCategoryDescription(category.category)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Summary */}
          {getEnabledCount() === 0 && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                ⚠️ Please select at least one reminder category
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={copyMutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={copyMutation.isPending || getEnabledCount() === 0}>
            {copyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Custom Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
