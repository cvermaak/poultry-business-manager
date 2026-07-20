import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit2, UserX, UserCheck, Eye, Search, Users, TrendingUp, CreditCard, Building2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const SEGMENT_LABELS: Record<string, string> = { wholesale: "Wholesale", retail: "Retail", contract: "Contract" };
const SEGMENT_COLORS: Record<string, string> = {
  wholesale: "bg-blue-100 text-blue-800",
  retail: "bg-green-100 text-green-800",
  contract: "bg-purple-100 text-purple-800",
};
const PAYMENT_TERMS_OPTIONS = ["Cash", "Net 7", "Net 14", "Net 30", "Net 60", "Net 90", "COD", "Prepaid", "EOM"];

type CustomerForm = {
  name: string; companyName: string; contactPerson: string; email: string;
  phone: string; whatsapp: string; segment: "wholesale" | "retail" | "contract";
  creditLimit: string; paymentTerms: string; taxNumber: string; vatNumber: string; notes: string;
};
const emptyForm = (): CustomerForm => ({
  name: "", companyName: "", contactPerson: "", email: "", phone: "", whatsapp: "",
  segment: "retail", creditLimit: "0", paymentTerms: "Cash", taxNumber: "", vatNumber: "", notes: "",
});

export default function Customers() {
  const [search, setSearch] = useState("");
  const [segmentFilter, setSegmentFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<any>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm());

  const isActive = statusFilter === "active" ? true : statusFilter === "inactive" ? false : undefined;

  const { data: customers = [], isLoading, refetch } = trpc.customers.list.useQuery(
    { segment: segmentFilter !== "all" ? (segmentFilter as any) : undefined, isActive },
    { refetchOnWindowFocus: false }
  );

  const { data: nextNumberData } = trpc.customers.getNextNumber.useQuery(undefined, {
    enabled: dialogOpen && editingId === null,
    refetchOnWindowFocus: false,
  });

  const createMutation = trpc.customers.create.useMutation({
    onSuccess: () => { toast.success("Customer created successfully"); setDialogOpen(false); setForm(emptyForm()); refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const updateMutation = trpc.customers.update.useMutation({
    onSuccess: () => { toast.success("Customer updated successfully"); setDialogOpen(false); setEditingId(null); setForm(emptyForm()); refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.customers.delete.useMutation({
    onSuccess: () => { toast.success("Customer deactivated"); setDeleteDialogOpen(false); setDeletingId(null); refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const reactivateMutation = trpc.customers.update.useMutation({
    onSuccess: () => { toast.success("Customer reactivated"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const handleOpenCreate = () => { setEditingId(null); setForm(emptyForm()); setDialogOpen(true); };
  const handleOpenEdit = (c: any) => {
    setEditingId(c.id);
    setForm({ name: c.name ?? "", companyName: c.companyName ?? "", contactPerson: c.contactPerson ?? "",
      email: c.email ?? "", phone: c.phone ?? "", whatsapp: c.whatsapp ?? "", segment: c.segment ?? "retail",
      creditLimit: String(c.creditLimit ?? 0), paymentTerms: c.paymentTerms ?? "Cash",
      taxNumber: c.taxNumber ?? "", vatNumber: c.vatNumber ?? "", notes: c.notes ?? "" });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("Customer name is required"); return; }
    const payload = {
      name: form.name.trim(), companyName: form.companyName.trim() || null,
      contactPerson: form.contactPerson.trim() || null, email: form.email.trim() || null,
      phone: form.phone.trim() || null, whatsapp: form.whatsapp.trim() || null,
      segment: form.segment, creditLimit: parseInt(form.creditLimit) || 0,
      paymentTerms: form.paymentTerms, taxNumber: form.taxNumber.trim() || null,
      vatNumber: form.vatNumber.trim() || null, notes: form.notes.trim() || null,
    };
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, ...payload });
    } else {
      createMutation.mutate({ customerNumber: nextNumberData?.customerNumber ?? `CUST-${Date.now()}`, ...payload } as any);
    }
  };

  const filtered = customers.filter((c: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name?.toLowerCase().includes(q) || c.companyName?.toLowerCase().includes(q) ||
      c.customerNumber?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) ||
      c.contactPerson?.toLowerCase().includes(q);
  });

  const totalCustomers = customers.length;
  const activeCustomers = customers.filter((c: any) => c.isActive).length;
  const wholesaleCustomers = customers.filter((c: any) => c.segment === "wholesale").length;
  const totalCreditLimit = customers.reduce((sum: number, c: any) => sum + (Number(c.creditLimit) || 0), 0);
  const isMutating = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Customers</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage customer accounts, credit limits, and contact details</p>
        </div>
        <Button onClick={handleOpenCreate} className="gap-2">
          <Plus className="h-4 w-4" />Add Customer
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: <Users className="h-4 w-4 text-primary" />, bg: "bg-primary/10", label: "Total", value: totalCustomers },
          { icon: <UserCheck className="h-4 w-4 text-green-600" />, bg: "bg-green-500/10", label: "Active", value: activeCustomers },
          { icon: <TrendingUp className="h-4 w-4 text-blue-600" />, bg: "bg-blue-500/10", label: "Wholesale", value: wholesaleCustomers },
          { icon: <CreditCard className="h-4 w-4 text-amber-600" />, bg: "bg-amber-500/10", label: "Total Credit", value: `R${totalCreditLimit.toLocaleString("en-ZA")}` },
        ].map((s) => (
          <Card key={s.label}><CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 ${s.bg} rounded-lg`}>{s.icon}</div>
              <div><p className="text-xs text-muted-foreground">{s.label}</p><p className="text-xl font-bold">{s.value}</p></div>
            </div>
          </CardContent></Card>
        ))}
      </div>

      <Card><CardContent className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by name, company, number, email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={segmentFilter} onValueChange={setSegmentFilter}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Segment" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Segments</SelectItem>
              <SelectItem value="wholesale">Wholesale</SelectItem>
              <SelectItem value="retail">Retail</SelectItem>
              <SelectItem value="contract">Contract</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent></Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">{filtered.length} customer{filtered.length !== 1 ? "s" : ""}</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading customers...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No customers found.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={handleOpenCreate}>Add your first customer</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Number</TableHead><TableHead>Name / Company</TableHead>
                    <TableHead>Segment</TableHead><TableHead>Contact</TableHead>
                    <TableHead>Payment Terms</TableHead><TableHead className="text-right">Credit Limit</TableHead>
                    <TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c: any) => (
                    <TableRow key={c.id} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-xs text-muted-foreground">{c.customerNumber}</TableCell>
                      <TableCell>
                        <div className="font-medium">{c.name}</div>
                        {c.companyName && <div className="text-xs text-muted-foreground flex items-center gap-1"><Building2 className="h-3 w-3" />{c.companyName}</div>}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${SEGMENT_COLORS[c.segment] ?? "bg-gray-100 text-gray-700"}`}>
                          {SEGMENT_LABELS[c.segment] ?? c.segment}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{c.contactPerson || "—"}</div>
                        {c.email && <div className="text-xs text-muted-foreground truncate max-w-[160px]">{c.email}</div>}
                        {c.phone && <div className="text-xs text-muted-foreground">{c.phone}</div>}
                      </TableCell>
                      <TableCell className="text-sm">{c.paymentTerms || "—"}</TableCell>
                      <TableCell className="text-right font-medium text-sm">
                        {Number(c.creditLimit) > 0 ? `R${Number(c.creditLimit).toLocaleString("en-ZA")}` : "—"}
                      </TableCell>
                      <TableCell><Badge variant={c.isActive ? "default" : "secondary"} className="text-xs">{c.isActive ? "Active" : "Inactive"}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="View" onClick={() => { setViewingCustomer(c); setDetailDialogOpen(true); }}><Eye className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => handleOpenEdit(c)}><Edit2 className="h-3.5 w-3.5" /></Button>
                          {c.isActive ? (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Deactivate" onClick={() => { setDeletingId(c.id); setDeleteDialogOpen(true); }}><UserX className="h-3.5 w-3.5" /></Button>
                          ) : (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:text-green-700" title="Reactivate" onClick={() => reactivateMutation.mutate({ id: c.id, isActive: true })}><UserCheck className="h-3.5 w-3.5" /></Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId !== null ? "Edit Customer" : "New Customer"}</DialogTitle></DialogHeader>
          <div className="space-y-5 pt-2">
            {editingId === null && (
              <div className="flex items-center gap-2 p-3 bg-muted/40 rounded-lg">
                <span className="text-xs text-muted-foreground">Customer Number:</span>
                <span className="font-mono font-semibold text-sm">{nextNumberData?.customerNumber ?? "Generating..."}</span>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Customer Name <span className="text-destructive">*</span></Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. John Smith" />
              </div>
              <div className="space-y-1.5">
                <Label>Company Name</Label>
                <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder="e.g. Smith Poultry (Pty) Ltd" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Contact Person</Label>
                <Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} placeholder="e.g. Jane Smith" />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="e.g. jane@company.co.za" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="e.g. +27 11 123 4567" />
              </div>
              <div className="space-y-1.5">
                <Label>WhatsApp</Label>
                <Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="e.g. +27 82 123 4567" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Segment</Label>
                <Select value={form.segment} onValueChange={(v) => setForm({ ...form, segment: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wholesale">Wholesale</SelectItem>
                    <SelectItem value="retail">Retail</SelectItem>
                    <SelectItem value="contract">Contract</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Payment Terms</Label>
                <Select value={form.paymentTerms} onValueChange={(v) => setForm({ ...form, paymentTerms: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PAYMENT_TERMS_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Credit Limit (R)</Label>
              <Input type="number" min={0} value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} placeholder="0" />
              <p className="text-xs text-muted-foreground">Set to 0 for cash-only customers.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Tax Number</Label>
                <Input value={form.taxNumber} onChange={(e) => setForm({ ...form, taxNumber: e.target.value })} placeholder="e.g. 4123456789" />
              </div>
              <div className="space-y-1.5">
                <Label>VAT Number</Label>
                <Input value={form.vatNumber} onChange={(e) => setForm({ ...form, vatNumber: e.target.value })} placeholder="e.g. 4123456789" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Any additional information..." rows={3} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isMutating}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={isMutating}>{isMutating ? "Saving..." : editingId !== null ? "Save Changes" : "Create Customer"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Deactivate Customer</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This will deactivate the customer account. All historical data is preserved and the account can be reactivated at any time.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleteMutation.isPending}>Cancel</Button>
            <Button variant="destructive" onClick={() => deletingId !== null && deleteMutation.mutate({ id: deletingId })} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deactivating..." : "Deactivate"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail View */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Customer Details</DialogTitle></DialogHeader>
          {viewingCustomer && (
            <div className="space-y-4 pt-1">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-lg">{viewingCustomer.name}</h3>
                  {viewingCustomer.companyName && <p className="text-sm text-muted-foreground flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{viewingCustomer.companyName}</p>}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="font-mono text-xs text-muted-foreground">{viewingCustomer.customerNumber}</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${SEGMENT_COLORS[viewingCustomer.segment] ?? "bg-gray-100 text-gray-700"}`}>{SEGMENT_LABELS[viewingCustomer.segment] ?? viewingCustomer.segment}</span>
                  <Badge variant={viewingCustomer.isActive ? "default" : "secondary"} className="text-xs">{viewingCustomer.isActive ? "Active" : "Inactive"}</Badge>
                </div>
              </div>
              <Card>
                <CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-sm">Contact Information</CardTitle></CardHeader>
                <CardContent className="px-4 pb-3 grid grid-cols-2 gap-2 text-sm">
                  <div><p className="text-xs text-muted-foreground">Contact Person</p><p>{viewingCustomer.contactPerson || "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Email</p><p className="truncate">{viewingCustomer.email || "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Phone</p><p>{viewingCustomer.phone || "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">WhatsApp</p><p>{viewingCustomer.whatsapp || "—"}</p></div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-sm">Financial Details</CardTitle></CardHeader>
                <CardContent className="px-4 pb-3 grid grid-cols-2 gap-2 text-sm">
                  <div><p className="text-xs text-muted-foreground">Payment Terms</p><p>{viewingCustomer.paymentTerms || "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Credit Limit</p><p>{Number(viewingCustomer.creditLimit) > 0 ? `R${Number(viewingCustomer.creditLimit).toLocaleString("en-ZA")}` : "Cash only"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Tax Number</p><p>{viewingCustomer.taxNumber || "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">VAT Number</p><p>{viewingCustomer.vatNumber || "—"}</p></div>
                </CardContent>
              </Card>
              {viewingCustomer.notes && (
                <Card>
                  <CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-sm">Notes</CardTitle></CardHeader>
                  <CardContent className="px-4 pb-3"><p className="text-sm text-muted-foreground whitespace-pre-wrap">{viewingCustomer.notes}</p></CardContent>
                </Card>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => { setDetailDialogOpen(false); handleOpenEdit(viewingCustomer); }}><Edit2 className="h-3.5 w-3.5 mr-1.5" />Edit</Button>
                <Button variant="outline" size="sm" onClick={() => setDetailDialogOpen(false)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
