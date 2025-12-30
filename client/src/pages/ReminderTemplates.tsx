import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Edit, Trash2, Bell, Calendar, Copy, Layers, ChevronDown, ChevronUp, Clock, AlertCircle, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { CopyTemplateDialog } from "@/components/CopyTemplateDialog";

export default function ReminderTemplates() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bundleDialogOpen, setBundleDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<number | null>(null);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [templateToCopy, setTemplateToCopy] = useState<any>(null);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<number[]>([]);
  const [bundleName, setBundleName] = useState("");
  const [bundleDescription, setBundleDescription] = useState("");
  const [bundleEditDialogOpen, setBundleEditDialogOpen] = useState(false);
  const [editingBundle, setEditingBundle] = useState<any>(null);
  const [editBundleName, setEditBundleName] = useState("");
  const [editBundleDescription, setEditBundleDescription] = useState("");
  const [editBundleCategories, setEditBundleCategories] = useState<any[]>([]);
  const [expandedBundles, setExpandedBundles] = useState<Record<number, boolean>>({});
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  const toggleBundleExpanded = (bundleId: number) => {
    setExpandedBundles(prev => ({ ...prev, [bundleId]: !prev[bundleId] }));
  };

  const toggleCategoryExpanded = (key: string) => {
    setExpandedCategories(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      vaccination: "Vaccinations",
      feed_transition: "Feed Transitions",
      environmental_check: "Environmental Checks",
      biosecurity: "Biosecurity",
      milestone: "Milestones",
      performance_alert: "Performance Alerts",
      house_preparation: "House Preparation",
      weight_sampling: "Weight Sampling",
      routine_task: "Routine Tasks",
    };
    return labels[category] || category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'text-red-600 bg-red-50';
      case 'high': return 'text-orange-600 bg-orange-50';
      case 'medium': return 'text-blue-600 bg-blue-50';
      case 'low': return 'text-gray-600 bg-gray-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const utils = trpc.useUtils();
  const { data: templates, isLoading } = trpc.reminderTemplates.list.useQuery();

  const createMutation = trpc.reminderTemplates.create.useMutation({
    onSuccess: () => {
      utils.reminderTemplates.list.invalidate();
      setDialogOpen(false);
      toast.success("Reminder template created successfully");
    },
    onError: (error) => toast.error(error.message),
  });

  const createBundleMutation = trpc.reminderTemplates.createBundle.useMutation({
    onSuccess: (result) => {
      utils.reminderTemplates.list.invalidate();
      setBundleDialogOpen(false);
      setSelectedTemplateIds([]);
      setBundleName("");
      setBundleDescription("");
      toast.success(`Bundle template created with ${result.templateCount} templates`);
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.reminderTemplates.update.useMutation({
    onSuccess: () => {
      utils.reminderTemplates.list.invalidate();
      setDialogOpen(false);
      setEditingTemplate(null);
      toast.success("Reminder template updated successfully");
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.reminderTemplates.delete.useMutation({
    onSuccess: () => {
      utils.reminderTemplates.list.invalidate();
      setDeleteConfirmOpen(false);
      setTemplateToDelete(null);
      toast.success("Reminder template deleted successfully");
    },
    onError: (error) => toast.error(error.message),
  });

  const updateBundleMutation = trpc.reminderTemplates.updateBundle.useMutation({
    onSuccess: () => {
      utils.reminderTemplates.list.invalidate();
      setBundleEditDialogOpen(false);
      setEditingBundle(null);
      toast.success("Bundle template updated successfully");
    },
    onError: (error) => toast.error(error.message),
  });

  const openBundleEditDialog = (template: any) => {
    setEditingBundle(template);
    setEditBundleName(template.name);
    setEditBundleDescription(template.description || "");
    setEditBundleCategories(template.bundleConfig ? [...template.bundleConfig] : []);
    setBundleEditDialogOpen(true);
  };

  const handleUpdateBundle = () => {
    if (!editBundleName.trim()) {
      toast.error("Please enter a bundle name");
      return;
    }
    updateBundleMutation.mutate({
      id: editingBundle.id,
      name: editBundleName,
      description: editBundleDescription || undefined,
      bundleConfig: editBundleCategories,
    });
  };

  const toggleEditCategory = (index: number) => {
    setEditBundleCategories(prev =>
      prev.map((cat, i) => (i === index ? { ...cat, enabled: !cat.enabled } : cat))
    );
  };

  // Category CRUD functions
  const addCategory = () => {
    const newCategory = {
      category: `custom_${Date.now()}`,
      name: "New Category",
      enabled: true,
      reminders: []
    };
    setEditBundleCategories(prev => [...prev, newCategory]);
  };

  const updateCategoryName = (index: number, name: string) => {
    setEditBundleCategories(prev =>
      prev.map((cat, i) => (i === index ? { ...cat, name, category: name.toLowerCase().replace(/\s+/g, '_') } : cat))
    );
  };

  const removeCategory = (index: number) => {
    setEditBundleCategories(prev => prev.filter((_, i) => i !== index));
  };

  const moveCategoryUp = (index: number) => {
    if (index === 0) return;
    setEditBundleCategories(prev => {
      const newCategories = [...prev];
      [newCategories[index - 1], newCategories[index]] = [newCategories[index], newCategories[index - 1]];
      return newCategories;
    });
  };

  const moveCategoryDown = (index: number) => {
    setEditBundleCategories(prev => {
      if (index === prev.length - 1) return prev;
      const newCategories = [...prev];
      [newCategories[index], newCategories[index + 1]] = [newCategories[index + 1], newCategories[index]];
      return newCategories;
    });
  };

  // Reminder CRUD functions within categories
  const addReminder = (categoryIndex: number) => {
    const newReminder = {
      name: "New Reminder",
      dayOffset: 0,
      priority: "medium",
      description: ""
    };
    setEditBundleCategories(prev =>
      prev.map((cat, i) => (
        i === categoryIndex
          ? { ...cat, reminders: [...(cat.reminders || []), newReminder] }
          : cat
      ))
    );
  };

  const updateReminder = (categoryIndex: number, reminderIndex: number, field: string, value: any) => {
    setEditBundleCategories(prev =>
      prev.map((cat, i) => {
        if (i !== categoryIndex) return cat;
        const newReminders = [...(cat.reminders || [])];
        newReminders[reminderIndex] = { ...newReminders[reminderIndex], [field]: value };
        return { ...cat, reminders: newReminders };
      })
    );
  };

  const removeReminder = (categoryIndex: number, reminderIndex: number) => {
    setEditBundleCategories(prev =>
      prev.map((cat, i) => {
        if (i !== categoryIndex) return cat;
        return { ...cat, reminders: (cat.reminders || []).filter((_: any, ri: number) => ri !== reminderIndex) };
      })
    );
  };

  // Sort reminders by day offset within a category
  const sortRemindersByDay = (categoryIndex: number) => {
    setEditBundleCategories(prev =>
      prev.map((cat, i) => {
        if (i !== categoryIndex) return cat;
        const sortedReminders = [...(cat.reminders || [])].sort((a, b) => a.dayOffset - b.dayOffset);
        return { ...cat, reminders: sortedReminders };
      })
    );
    toast.success('Reminders sorted by day');
  };

  // Move reminder up within category
  const moveReminderUp = (categoryIndex: number, reminderIndex: number) => {
    if (reminderIndex === 0) return;
    setEditBundleCategories(prev =>
      prev.map((cat, i) => {
        if (i !== categoryIndex) return cat;
        const newReminders = [...(cat.reminders || [])];
        [newReminders[reminderIndex - 1], newReminders[reminderIndex]] = [newReminders[reminderIndex], newReminders[reminderIndex - 1]];
        return { ...cat, reminders: newReminders };
      })
    );
  };

  // Move reminder down within category
  const moveReminderDown = (categoryIndex: number, reminderIndex: number) => {
    setEditBundleCategories(prev =>
      prev.map((cat, i) => {
        if (i !== categoryIndex) return cat;
        const reminders = cat.reminders || [];
        if (reminderIndex >= reminders.length - 1) return cat;
        const newReminders = [...reminders];
        [newReminders[reminderIndex], newReminders[reminderIndex + 1]] = [newReminders[reminderIndex + 1], newReminders[reminderIndex]];
        return { ...cat, reminders: newReminders };
      })
    );
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get("name") as string,
      description: formData.get("description") as string || undefined,
      reminderType: formData.get("reminderType") as any,
      priority: formData.get("priority") as any,
      dayOffset: Number(formData.get("dayOffset")),
    };

    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleCreateBundle = () => {
    if (!bundleName.trim()) {
      toast.error("Please enter a bundle name");
      return;
    }
    if (selectedTemplateIds.length === 0) {
      toast.error("Please select at least one template");
      return;
    }
    createBundleMutation.mutate({
      name: bundleName,
      description: bundleDescription || undefined,
      templateIds: selectedTemplateIds,
    });
  };

  const handleDelete = () => {
    if (templateToDelete) {
      deleteMutation.mutate({ id: templateToDelete });
    }
  };

  const toggleTemplateSelection = (templateId: number) => {
    setSelectedTemplateIds(prev => 
      prev.includes(templateId) 
        ? prev.filter(id => id !== templateId)
        : [...prev, templateId]
    );
  };

  const getReminderTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      vaccination: "Vaccination",
      feed_transition: "Feed Transition",
      house_preparation: "House Preparation",
      environmental_check: "Environmental Check",
      routine_task: "Routine Task",
      milestone: "Milestone",
      biosecurity: "Biosecurity",
      performance_alert: "Performance Alert",
    };
    return labels[type] || type;
  };

  // Separate bundle and single templates
  const bundleTemplates = templates?.filter(t => t.isBundle) || [];
  const singleTemplates = templates?.filter(t => !t.isBundle) || [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Reminder Templates</h1>
        <p className="text-muted-foreground">Create reusable reminder templates to apply to your flocks</p>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {templates?.length || 0} templates available ({bundleTemplates.length} bundles, {singleTemplates.length} single)
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setBundleDialogOpen(true)} disabled={singleTemplates.length === 0}>
            <Layers className="w-4 h-4 mr-2" />
            Create Bundle
          </Button>
          <Button onClick={() => { setEditingTemplate(null); setDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            Add Template
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading templates...</div>
      ) : templates && templates.length > 0 ? (
        <div className="space-y-6">
          {/* Bundle Templates Section */}
          {bundleTemplates.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Layers className="w-5 h-5" />
                Bundle Templates
              </h2>
              <div className="space-y-4">
                {bundleTemplates.map((template) => (
                  <Card key={template.id} className="border-purple-200 bg-purple-50/30">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg">{template.name}</CardTitle>
                          {template.description && (
                            <CardDescription className="mt-1">{template.description}</CardDescription>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            onClick={() => { setTemplateToCopy(template); setCopyDialogOpen(true); }}
                            title="Copy & Customize"
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            onClick={() => openBundleEditDialog(template)}
                            title="Edit Bundle"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => { setTemplateToDelete(template.id); setDeleteConfirmOpen(true); }}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="default" className="bg-purple-600">Bundle Template</Badge>
                        <span className="text-sm text-muted-foreground">
                          {template.bundleConfig && Array.isArray(template.bundleConfig) ? (
                            <>
                              {template.bundleConfig.filter((c: any) => c.enabled).length} categories • 
                              {template.bundleConfig.reduce((total: number, cat: any) => 
                                cat.enabled && cat.reminders ? total + cat.reminders.length : total, 0
                              )} reminders
                            </>
                          ) : null}
                        </span>
                      </div>
                      
                      {/* Expandable Categories Section */}
                      <Collapsible 
                        open={expandedBundles[template.id]} 
                        onOpenChange={() => toggleBundleExpanded(template.id)}
                      >
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" className="w-full justify-between p-2 h-auto">
                            <span className="text-sm font-medium">View All Reminders</span>
                            {expandedBundles[template.id] ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-2 space-y-3">
                          {template.bundleConfig && Array.isArray(template.bundleConfig) ? 
                            (template.bundleConfig as any[]).filter((cat: any) => cat.enabled).map((category: any, catIndex: number) => (
                              <div key={catIndex} className="border rounded-lg overflow-hidden">
                                <div 
                                  className="bg-muted/50 px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-muted"
                                  onClick={() => toggleCategoryExpanded(`${template.id}-${catIndex}`)}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-sm">{getCategoryLabel(category.category)}</span>
                                    <Badge variant="outline" className="text-xs">
                                      {category.reminders?.length || 0} reminders
                                    </Badge>
                                  </div>
                                  {expandedCategories[`${template.id}-${catIndex}`] ? (
                                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                  )}
                                </div>
                                {expandedCategories[`${template.id}-${catIndex}`] && category.reminders && (
                                  <div className="divide-y">
                                    {category.reminders.map((reminder: any, remIndex: number) => (
                                      <div key={remIndex} className="px-3 py-2 bg-background">
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="flex-1 min-w-0">
                                            <p className="font-medium text-sm truncate">{reminder.name}</p>
                                            {reminder.description && (
                                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                                {reminder.description}
                                              </p>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-2 shrink-0">
                                            <Badge variant="outline" className="text-xs flex items-center gap-1">
                                              <Clock className="w-3 h-3" />
                                              Day {reminder.dayOffset}
                                            </Badge>
                                            <Badge className={`text-xs ${getPriorityColor(reminder.priority)}`}>
                                              {reminder.priority}
                                            </Badge>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )) : null
                          }
                        </CollapsibleContent>
                      </Collapsible>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Single Templates Section */}
          {singleTemplates.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Single Templates
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {singleTemplates.map((template) => (
                  <Card key={template.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg">{template.name}</CardTitle>
                          {template.description && (
                            <CardDescription className="mt-1">{template.description}</CardDescription>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => { setEditingTemplate(template); setDialogOpen(true); }}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => { setTemplateToDelete(template.id); setDeleteConfirmOpen(true); }}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">{getReminderTypeLabel(template.reminderType)}</Badge>
                        <Badge className={getPriorityColor(template.priority)}>{template.priority}</Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="w-4 h-4" />
                        <span>Day {template.dayOffset} after placement</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No reminder templates found. Click "Add Template" to create one.
          </CardContent>
        </Card>
      )}

      {/* Template Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Edit Template" : "Add New Template"}</DialogTitle>
            <DialogDescription>
              {editingTemplate ? "Update template information" : "Create a reusable reminder template"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Template Name *</Label>
              <Input id="name" name="name" required defaultValue={editingTemplate?.name} placeholder="e.g., Day 7 Weight Check" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" rows={2} defaultValue={editingTemplate?.description} placeholder="Optional description of what this reminder is for" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="reminderType">Reminder Type *</Label>
                <Select name="reminderType" required defaultValue={editingTemplate?.reminderType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vaccination">Vaccination</SelectItem>
                    <SelectItem value="feed_transition">Feed Transition</SelectItem>
                    <SelectItem value="house_preparation">House Preparation</SelectItem>
                    <SelectItem value="environmental_check">Environmental Check</SelectItem>
                    <SelectItem value="routine_task">Routine Task</SelectItem>
                    <SelectItem value="milestone">Milestone</SelectItem>
                    <SelectItem value="biosecurity">Biosecurity</SelectItem>
                    <SelectItem value="performance_alert">Performance Alert</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority">Priority *</Label>
                <Select name="priority" required defaultValue={editingTemplate?.priority || "medium"}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dayOffset">Day Offset *</Label>
              <Input id="dayOffset" name="dayOffset" type="number" required defaultValue={editingTemplate?.dayOffset} placeholder="Days after flock placement (e.g., 7 for day 7)" />
              <p className="text-xs text-muted-foreground">
                0 = placement day, 7 = day 7, 14 = day 14, etc.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); setEditingTemplate(null); }}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editingTemplate ? "Update" : "Create"} Template
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bundle Creation Dialog */}
      <Dialog open={bundleDialogOpen} onOpenChange={(open) => {
        setBundleDialogOpen(open);
        if (!open) {
          setSelectedTemplateIds([]);
          setBundleName("");
          setBundleDescription("");
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Bundle Template</DialogTitle>
            <DialogDescription>
              Select multiple templates to combine into a single bundle. When applied to a flock, all selected templates will generate their reminders.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bundleName">Bundle Name *</Label>
              <Input 
                id="bundleName" 
                value={bundleName}
                onChange={(e) => setBundleName(e.target.value)}
                placeholder="e.g., Complete Broiler Cycle Reminders" 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bundleDescription">Description</Label>
              <Textarea 
                id="bundleDescription" 
                value={bundleDescription}
                onChange={(e) => setBundleDescription(e.target.value)}
                rows={2} 
                placeholder="Optional description of what this bundle includes" 
              />
            </div>
            <div className="space-y-2">
              <Label>Select Templates ({selectedTemplateIds.length} selected)</Label>
              <div className="border rounded-lg p-4 max-h-60 overflow-y-auto space-y-2">
                {singleTemplates.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No single templates available. Create some templates first.
                  </p>
                ) : (
                  singleTemplates.map((template) => (
                    <div 
                      key={template.id} 
                      className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-muted/50 ${
                        selectedTemplateIds.includes(template.id) ? 'bg-muted' : ''
                      }`}
                      onClick={() => toggleTemplateSelection(template.id)}
                    >
                      <Checkbox 
                        checked={selectedTemplateIds.includes(template.id)}
                        onCheckedChange={() => toggleTemplateSelection(template.id)}
                      />
                      <div className="flex-1">
                        <p className="font-medium text-sm">{template.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {getReminderTypeLabel(template.reminderType)} • Day {template.dayOffset} • {template.priority}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBundleDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateBundle} 
              disabled={createBundleMutation.isPending || selectedTemplateIds.length === 0 || !bundleName.trim()}
            >
              {createBundleMutation.isPending ? "Creating..." : `Create Bundle (${selectedTemplateIds.length} templates)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this reminder template? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteConfirmOpen(false); setTemplateToDelete(null); }}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Copy & Customize Dialog */}
      {templateToCopy && (
        <CopyTemplateDialog
          open={copyDialogOpen}
          onOpenChange={setCopyDialogOpen}
          template={templateToCopy}
          onSuccess={() => {
            utils.reminderTemplates.list.invalidate();
            setTemplateToCopy(null);
          }}
        />
      )}

      {/* Bundle Edit Dialog */}
      <Dialog open={bundleEditDialogOpen} onOpenChange={(open) => {
        setBundleEditDialogOpen(open);
        if (!open) {
          setEditingBundle(null);
          setEditBundleName("");
          setEditBundleDescription("");
          setEditBundleCategories([]);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Bundle Template</DialogTitle>
            <DialogDescription>
              Modify the bundle name, description, and enable/disable categories.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="editBundleName">Bundle Name *</Label>
              <Input 
                id="editBundleName" 
                value={editBundleName}
                onChange={(e) => setEditBundleName(e.target.value)}
                placeholder="Bundle name" 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editBundleDescription">Description</Label>
              <Textarea 
                id="editBundleDescription" 
                value={editBundleDescription}
                onChange={(e) => setEditBundleDescription(e.target.value)}
                rows={2} 
                placeholder="Optional description" 
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Categories ({editBundleCategories.filter((c: any) => c.enabled).length} enabled)</Label>
                <Button type="button" variant="outline" size="sm" onClick={addCategory}>
                  <Plus className="w-4 h-4 mr-1" /> Add Category
                </Button>
              </div>
              <div className="border rounded-lg max-h-[400px] overflow-y-auto">
                {editBundleCategories.map((category: any, index: number) => (
                  <Collapsible key={index} defaultOpen={false}>
                    <div className={`border-b last:border-b-0 ${category.enabled ? 'bg-muted/30' : ''}`}>
                      <div className="flex items-center gap-2 p-3">
                        <Checkbox 
                          checked={category.enabled}
                          onCheckedChange={() => toggleEditCategory(index)}
                        />
                        <Input
                          value={category.name || getCategoryLabel(category.category)}
                          onChange={(e) => updateCategoryName(index, e.target.value)}
                          className="flex-1 h-8 text-sm font-medium"
                          placeholder="Category name"
                        />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {category.reminders?.length || 0} reminders
                        </span>
                        <div className="flex items-center gap-1">
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 w-7 p-0"
                            onClick={() => moveCategoryUp(index)}
                            disabled={index === 0}
                          >
                            <ArrowUp className="w-4 h-4" />
                          </Button>
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 w-7 p-0"
                            onClick={() => moveCategoryDown(index)}
                            disabled={index === editBundleCategories.length - 1}
                          >
                            <ArrowDown className="w-4 h-4" />
                          </Button>
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => removeCategory(index)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                              <ChevronDown className="w-4 h-4" />
                            </Button>
                          </CollapsibleTrigger>
                        </div>
                      </div>
                      <CollapsibleContent>
                        <div className="px-3 pb-3 space-y-2">
                          {category.reminders?.map((reminder: any, remIndex: number) => (
                            <div key={remIndex} className="bg-background border rounded-lg p-3 space-y-2">
                              <div className="flex items-center gap-2">
                                <div className="flex flex-col gap-0.5">
                                  <Button 
                                    type="button" 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-5 w-5 p-0"
                                    onClick={() => moveReminderUp(index, remIndex)}
                                    disabled={remIndex === 0}
                                  >
                                    <ArrowUp className="w-3 h-3" />
                                  </Button>
                                  <Button 
                                    type="button" 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-5 w-5 p-0"
                                    onClick={() => moveReminderDown(index, remIndex)}
                                    disabled={remIndex === (category.reminders?.length || 0) - 1}
                                  >
                                    <ArrowDown className="w-3 h-3" />
                                  </Button>
                                </div>
                                <Input
                                  value={reminder.name}
                                  onChange={(e) => updateReminder(index, remIndex, 'name', e.target.value)}
                                  className="flex-1 h-8 text-sm"
                                  placeholder="Reminder name"
                                />
                                <Input
                                  type="number"
                                  value={reminder.dayOffset}
                                  onChange={(e) => updateReminder(index, remIndex, 'dayOffset', parseInt(e.target.value) || 0)}
                                  className="w-20 h-8 text-sm"
                                  placeholder="Day"
                                />
                                <Select
                                  value={reminder.priority}
                                  onValueChange={(value) => updateReminder(index, remIndex, 'priority', value)}
                                >
                                  <SelectTrigger className="w-24 h-8">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="urgent">Urgent</SelectItem>
                                    <SelectItem value="high">High</SelectItem>
                                    <SelectItem value="medium">Medium</SelectItem>
                                    <SelectItem value="low">Low</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Button 
                                  type="button" 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                  onClick={() => removeReminder(index, remIndex)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                              <Textarea
                                value={reminder.description || ''}
                                onChange={(e) => updateReminder(index, remIndex, 'description', e.target.value)}
                                className="text-sm min-h-[60px]"
                                placeholder="Description (optional)"
                                rows={2}
                              />
                            </div>
                          ))}
                          <div className="flex gap-2">
                            <Button 
                              type="button" 
                              variant="outline" 
                              size="sm" 
                              className="flex-1"
                              onClick={() => addReminder(index)}
                            >
                              <Plus className="w-4 h-4 mr-1" /> Add Reminder
                            </Button>
                            <Button 
                              type="button" 
                              variant="outline" 
                              size="sm"
                              onClick={() => sortRemindersByDay(index)}
                              title="Sort reminders by day offset"
                            >
                              <ArrowUpDown className="w-4 h-4 mr-1" /> Sort by Day
                            </Button>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                ))}
                {editBundleCategories.length === 0 && (
                  <div className="p-4 text-center text-muted-foreground text-sm">
                    No categories yet. Click "Add Category" to create one.
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBundleEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateBundle} 
              disabled={updateBundleMutation.isPending || !editBundleName.trim()}
            >
              {updateBundleMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
