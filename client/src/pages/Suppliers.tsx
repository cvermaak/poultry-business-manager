import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Building2,
  Phone,
  Mail,
  MessageCircle,
  Search,
  RefreshCw,
  CheckCircle,
  XCircle,
  User,
  CreditCard,
  FileText,
} from "lucide-react";

const SUPPLIER_CATEGORIES = [
  "Feed & Nutrition",
  "Veterinary & Health",
  "Equipment & Machinery",
  "Utilities & Energy",
  "Packaging & Supplies",
  "Transport & Logistics",
  "Chemicals & Disinfectants",
  "Bedding & Litter",
  "Day-Old Chicks",
  "Other",
];

const PAYMENT_TERMS = [
  "Cash on Delivery",
  "Net 7",
  "Net 14",
  "Net 30",
  "Net 60",
  "EOM (End of Month)",
  "Prepaid",
  "Account",
];

const CONTACT_METHODS = [
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "both", label: "Phone & WhatsApp" },
];

type SupplierForm = {
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  whatsapp: string;
  preferredContactMethod: "email" | "whatsapp" | "phone" | "both";
  category: string;
  paymentTerms: string;
  taxNumber: string;
  bankName: string;
  bankAccountNumber: string;
  notes: string;
};

const emptyForm = (): SupplierForm => ({
  name: "",
  contactPerson: "",
  email: "",
  phone: "",
  whatsapp: "",
  preferredContactMethod: "email",
  category: "",
  paymentTerms: "Net 30",
  taxNumber: "",
  bankName: "",
  bankAccountNumber: "",
  notes: "",
});

export default function Suppliers() {
  
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("active");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [form, setForm] = useState<SupplierForm>(emptyForm());
  const [activeTab, setActiveTab] = useState("list");
  const [viewingSupplier, setViewingSupplier] = useState<number | null>(null);

  const { data: suppliers = [], refetch } = trpc.suppliers.list.useQuery(
    filterStatus === "all"
      ? { category: filterCategory !== "all" ? filterCategory : undefined }
      : {
          isActive: filterStatus === "active",
          category: filterCategory !== "all" ? filterCategory : undefined,
        }
  );

  const { data: viewSupplier } = trpc.suppliers.getById.useQuery(
    { id: viewingSupplier! },
    { enabled: viewingSupplier !== null }
  );

  const createMutation = trpc.suppliers.create.useMutation({
    onSuccess: () => {
      toast.success("Supplier created successfully");
      setDialogOpen(false);
      setForm(emptyForm());
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.suppliers.update.useMutation({
    onSuccess: () => {
      toast.success("Supplier updated successfully");
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm());
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.suppliers.delete.useMutation({
    onSuccess: () => {
      toast.success("Supplier deactivated");
      setDeleteDialogOpen(false);
      setDeletingId(null);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const reactivateMutation = trpc.suppliers.update.useMutation({
    onSuccess: () => {
      toast.success("Supplier reactivated");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleOpenCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const handleOpenEdit = (supplier: (typeof suppliers)[0]) => {
    setEditingId(supplier.id);
    setForm({
      name: supplier.name,
      contactPerson: supplier.contactPerson ?? "",
      email: supplier.email ?? "",
      phone: supplier.phone ?? "",
      whatsapp: supplier.whatsapp ?? "",
      preferredContactMethod:
        (supplier.preferredContactMethod as SupplierForm["preferredContactMethod"]) ?? "email",
      category: supplier.category ?? "",
      paymentTerms: supplier.paymentTerms ?? "Net 30",
      taxNumber: supplier.taxNumber ?? "",
      bankName: supplier.bankName ?? "",
      bankAccountNumber: supplier.bankAccountNumber ?? "",
      notes: supplier.notes ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast.error("Supplier name is required");
      return;
    }
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, ...form });
    } else {
      createMutation.mutate(form);
    }
  };

  const handleDelete = (id: number) => {
    setDeletingId(id);
    setDeleteDialogOpen(true);
  };

  const handleView = (id: number) => {
    setViewingSupplier(id);
    setActiveTab("detail");
  };

  const filtered = suppliers.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.contactPerson ?? "").toLowerCase().includes(q) ||
      (s.email ?? "").toLowerCase().includes(q) ||
      (s.phone ?? "").toLowerCase().includes(q) ||
      (s.supplierNumber ?? "").toLowerCase().includes(q)
    );
  });

  const activeCount = suppliers.filter((s) => s.isActive).length;
  const inactiveCount = suppliers.filter((s) => !s.isActive).length;

  const getContactIcon = (method: string | null) => {
    switch (method) {
      case "email": return <Mail className="h-3 w-3" />;
      case "whatsapp": return <MessageCircle className="h-3 w-3" />;
      case "phone": return <Phone className="h-3 w-3" />;
      default: return <Phone className="h-3 w-3" />;
    }
  };

  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Supplier Management
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your feed, veterinary, and equipment suppliers
          </p>
        </div>
        <Button onClick={handleOpenCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Supplier
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4 pb-3">
          <div className="text-2xl font-bold text-foreground">{suppliers.length}</div>
          <div className="text-xs text-muted-foreground">Total Suppliers</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <div className="text-2xl font-bold text-green-600">{activeCount}</div>
          <div className="text-xs text-muted-foreground">Active</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <div className="text-2xl font-bold text-muted-foreground">{inactiveCount}</div>
          <div className="text-xs text-muted-foreground">Inactive</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <div className="text-2xl font-bold text-foreground">
            {new Set(suppliers.map((s) => s.category).filter(Boolean)).size}
          </div>
          <div className="text-xs text-muted-foreground">Categories</div>
        </CardContent></Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="list">Supplier List</TabsTrigger>
          {viewingSupplier !== null && (
            <TabsTrigger value="detail">{viewSupplier?.name ?? "Detail"}</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="list" className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, contact, email, phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Categories" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {SUPPLIER_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier #</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Payment Terms</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                        {search || filterCategory !== "all"
                          ? "No suppliers match your filters."
                          : 'No suppliers yet. Click "Add Supplier" to get started.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((supplier) => (
                      <TableRow key={supplier.id}>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {supplier.supplierNumber}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{supplier.name}</div>
                          {supplier.contactPerson && (
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <User className="h-3 w-3" />{supplier.contactPerson}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {supplier.category
                            ? <Badge variant="outline" className="text-xs">{supplier.category}</Badge>
                            : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-0.5">
                            {supplier.email && (
                              <div className="text-xs flex items-center gap-1">
                                <Mail className="h-3 w-3 text-muted-foreground" />
                                <a href={`mailto:${supplier.email}`} className="hover:underline text-primary">{supplier.email}</a>
                              </div>
                            )}
                            {supplier.phone && (
                              <div className="text-xs flex items-center gap-1">
                                <Phone className="h-3 w-3 text-muted-foreground" />{supplier.phone}
                              </div>
                            )}
                            {supplier.whatsapp && (
                              <div className="text-xs flex items-center gap-1">
                                <MessageCircle className="h-3 w-3 text-muted-foreground" />{supplier.whatsapp}
                              </div>
                            )}
                            {!supplier.email && !supplier.phone && !supplier.whatsapp && (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs">{supplier.paymentTerms ?? "—"}</div>
                        </TableCell>
                        <TableCell>
                          {supplier.isActive
                            ? <Badge className="bg-green-100 text-green-700 border-green-200 text-xs gap-1"><CheckCircle className="h-3 w-3" />Active</Badge>
                            : <Badge variant="outline" className="text-muted-foreground text-xs gap-1"><XCircle className="h-3 w-3" />Inactive</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => handleView(supplier.id)}>View</Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleOpenEdit(supplier)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {supplier.isActive
                              ? <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(supplier.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              : <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:text-green-700" title="Reactivate" onClick={() => reactivateMutation.mutate({ id: supplier.id, isActive: true })}>
                                  <RefreshCw className="h-3.5 w-3.5" />
                                </Button>}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {viewingSupplier !== null && (
          <TabsContent value="detail" className="space-y-4">
            {viewSupplier ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Building2 className="h-4 w-4" />General Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Supplier #</span><span className="font-mono">{viewSupplier.supplierNumber}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span className="font-medium">{viewSupplier.name}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Category</span><span>{viewSupplier.category ?? "—"}</span></div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status</span>
                      {viewSupplier.isActive
                        ? <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">Active</Badge>
                        : <Badge variant="outline" className="text-xs">Inactive</Badge>}
                    </div>
                    {viewSupplier.notes && (
                      <div><span className="text-muted-foreground block mb-1">Notes</span>
                        <p className="text-xs bg-muted rounded p-2">{viewSupplier.notes}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Phone className="h-4 w-4" />Contact Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Contact Person</span><span>{viewSupplier.contactPerson ?? "—"}</span></div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Email</span>
                      {viewSupplier.email
                        ? <a href={`mailto:${viewSupplier.email}`} className="text-primary hover:underline">{viewSupplier.email}</a>
                        : <span>—</span>}
                    </div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span>{viewSupplier.phone ?? "—"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">WhatsApp</span><span>{viewSupplier.whatsapp ?? "—"}</span></div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Preferred Contact</span>
                      <div className="flex items-center gap-1">
                        {getContactIcon(viewSupplier.preferredContactMethod)}
                        <span className="capitalize">{viewSupplier.preferredContactMethod ?? "—"}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />Financial & Banking
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Payment Terms</span><span>{viewSupplier.paymentTerms ?? "—"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Tax Number</span><span className="font-mono">{viewSupplier.taxNumber ?? "—"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Bank Name</span><span>{viewSupplier.bankName ?? "—"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Account Number</span><span className="font-mono">{viewSupplier.bankAccountNumber ?? "—"}</span></div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="h-4 w-4" />Actions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Button variant="outline" className="w-full justify-start gap-2" onClick={() => handleOpenEdit(viewSupplier)}>
                      <Pencil className="h-4 w-4" />Edit Supplier
                    </Button>
                    {viewSupplier.isActive
                      ? <Button variant="outline" className="w-full justify-start gap-2 text-destructive hover:text-destructive" onClick={() => handleDelete(viewSupplier.id)}>
                          <XCircle className="h-4 w-4" />Deactivate Supplier
                        </Button>
                      : <Button variant="outline" className="w-full justify-start gap-2 text-green-600" onClick={() => reactivateMutation.mutate({ id: viewSupplier.id, isActive: true })}>
                          <CheckCircle className="h-4 w-4" />Reactivate Supplier
                        </Button>}
                    <Button variant="ghost" className="w-full justify-start gap-2 text-muted-foreground" onClick={() => { setViewingSupplier(null); setActiveTab("list"); }}>
                      ← Back to List
                    </Button>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-10">Loading supplier...</div>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId !== null ? "Edit Supplier" : "Add New Supplier"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Basic Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <Label>Supplier Name <span className="text-destructive">*</span></Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Afgri Animal Feeds" />
                </div>
                <div>
                  <Label>Category</Label>
                  <Select value={form.category || "none"} onValueChange={(v) => setForm({ ...form, category: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {SUPPLIER_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Payment Terms</Label>
                  <Select value={form.paymentTerms || "Net 30"} onValueChange={(v) => setForm({ ...form, paymentTerms: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Contact Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <Label>Contact Person</Label>
                  <Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} placeholder="e.g. John Smith" />
                </div>
                <div>
                  <Label>Email Address</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="supplier@example.com" />
                </div>
                <div>
                  <Label>Phone Number</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+27 11 123 4567" />
                </div>
                <div>
                  <Label>WhatsApp Number</Label>
                  <Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="+27 82 123 4567" />
                </div>
                <div>
                  <Label>Preferred Contact Method</Label>
                  <Select value={form.preferredContactMethod} onValueChange={(v) => setForm({ ...form, preferredContactMethod: v as SupplierForm["preferredContactMethod"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CONTACT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Financial & Banking</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Tax / VAT Number</Label>
                  <Input value={form.taxNumber} onChange={(e) => setForm({ ...form, taxNumber: e.target.value })} placeholder="e.g. 4123456789" />
                </div>
                <div>
                  <Label>Bank Name</Label>
                  <Input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="e.g. First National Bank" />
                </div>
                <div className="md:col-span-2">
                  <Label>Bank Account Number</Label>
                  <Input value={form.bankAccountNumber} onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })} placeholder="e.g. 62123456789" />
                </div>
              </div>
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Any additional notes about this supplier..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {editingId !== null ? "Update Supplier" : "Create Supplier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Supplier?</AlertDialogTitle>
            <AlertDialogDescription>
              This supplier will be marked as inactive and hidden from active lists. All historical data (orders, invoices) will be preserved. You can reactivate at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingId !== null && deleteMutation.mutate({ id: deletingId })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
