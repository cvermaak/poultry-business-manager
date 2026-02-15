import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Edit, Trash2, MapPin, Phone, Mail, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ProcessorFormData {
  name: string;
  physicalAddress: string;
  contactPerson: string;
  phone: string;
  email: string;
  notes: string;
}

const emptyForm: ProcessorFormData = {
  name: "",
  physicalAddress: "",
  contactPerson: "",
  phone: "",
  email: "",
  notes: "",
};

export default function Processors() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<ProcessorFormData>(emptyForm);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const { data: processors, isLoading } = trpc.processor.list.useQuery();
  const createMutation = trpc.processor.create.useMutation();
  const updateMutation = trpc.processor.update.useMutation();
  const deleteMutation = trpc.processor.delete.useMutation();
  const utils = trpc.useUtils();

  const handleOpenDialog = (processor?: any) => {
    if (processor) {
      setEditingId(processor.id);
      setFormData({
        name: processor.name,
        physicalAddress: processor.physicalAddress || "",
        contactPerson: processor.contactPerson || "",
        phone: processor.phone || "",
        email: processor.email || "",
        notes: processor.notes || "",
      });
    } else {
      setEditingId(null);
      setFormData(emptyForm);
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingId(null);
    setFormData(emptyForm);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingId) {
        await updateMutation.mutateAsync({
          id: editingId,
          ...formData,
        });
        toast.success("Processor updated successfully");
      } else {
        await createMutation.mutateAsync(formData);
        toast.success("Processor created successfully");
      }
      utils.processor.list.invalidate();
      handleCloseDialog();
    } catch (error: any) {
      toast.error(error.message || "Failed to save processor");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("Processor deleted successfully");
      utils.processor.list.invalidate();
      setDeleteConfirmId(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to delete processor");
    }
  };

  if (isLoading) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading processors...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Processors</h1>
          <p className="text-muted-foreground mt-1">
            Manage processing plants and abattoirs
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          Add Processor
        </Button>
      </div>

      {!processors || processors.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-64">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">No processors added yet</p>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Processor
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {processors.map((processor) => (
            <Card key={processor.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-xl">{processor.name}</CardTitle>
                  {processor.physicalAddress && (
                    <CardDescription className="flex items-center gap-1 mt-2">
                      <MapPin className="h-3 w-3" />
                      {processor.physicalAddress}
                    </CardDescription>
                  )}
                  </div>
                  <Badge variant={processor.isActive ? "default" : "secondary"}>
                    {processor.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {processor.contactPerson && (
                    <div className="text-sm">
                      <span className="font-medium">Contact Person:</span>
                      <p className="text-muted-foreground">{processor.contactPerson}</p>
                    </div>
                  )}
                  
                  {processor.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <a href={`tel:${processor.phone}`} className="text-blue-600 hover:underline">
                        {processor.phone}
                      </a>
                    </div>
                  )}
                  
                  {processor.email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <a href={`mailto:${processor.email}`} className="text-blue-600 hover:underline">
                        {processor.email}
                      </a>
                    </div>
                  )}

                  {processor.notes && (
                    <div className="text-sm pt-2 border-t">
                      <span className="font-medium">Notes:</span>
                      <p className="text-muted-foreground mt-1 line-clamp-2">{processor.notes}</p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenDialog(processor)}
                      className="flex-1"
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeleteConfirmId(processor.id)}
                      className="flex-1 text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Processor" : "Add New Processor"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Update processor information" : "Add a new processing plant or abattoir"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">
                  Processor Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Rainbow Chicken, Country Bird"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="physicalAddress">Physical Address</Label>
                <Textarea
                  id="physicalAddress"
                  value={formData.physicalAddress}
                  onChange={(e) => setFormData({ ...formData, physicalAddress: e.target.value })}
                  placeholder="e.g., 123 Industrial Road, Rustenburg, North West"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contactPerson">Contact Person</Label>
                  <Input
                    id="contactPerson"
                    value={formData.contactPerson}
                    onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                    placeholder="e.g., John Smith"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Contact Phone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="e.g., +27 82 123 4567"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Contact Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="e.g., orders@processor.co.za"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Payment terms, operating hours, special requirements..."
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingId ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this processor? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
