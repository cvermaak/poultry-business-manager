import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit2, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth";

export default function Customers() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    companyName: "",
    vatNumber: "",
    registrationNumber: "",
    email: "",
    phone: "",
    postalAddress: "",
    physicalAddress: "",
    paymentTerms: "cash",
  });

  const { user } = useAuth();
  const { data: customers, isLoading, refetch, error } = trpc.customers.list.useQuery({ isActive: true }, { retry: 1 });
  const createMutation = trpc.customers.create.useMutation({
    onSuccess: () => {
      setFormData({
        name: "",
        companyName: "",
        vatNumber: "",
        registrationNumber: "",
        email: "",
        phone: "",
        postalAddress: "",
        physicalAddress: "",
        paymentTerms: "cash",
      });
      setEditingId(null);
      setIsOpen(false);
      refetch();
    },
    onError: (err) => {
      console.error("Error creating customer:", err);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // Generate customer number if not provided
      const customerNumber = `CUST-${Date.now()}`;
      
      await createMutation.mutateAsync({
        customerNumber,
        name: formData.name,
        contactPerson: formData.name,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        segment: "retail",
        paymentTerms: formData.paymentTerms,
        taxNumber: formData.vatNumber || undefined,
      });

    } catch (error) {
      console.error("Error creating customer:", error);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const openNewCustomerDialog = () => {
    setEditingId(null);
    setFormData({
      name: "",
      companyName: "",
      vatNumber: "",
      registrationNumber: "",
      email: "",
      phone: "",
      postalAddress: "",
      physicalAddress: "",
      paymentTerms: "cash",
    });
    setIsOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Customers</h1>
          <p className="text-muted-foreground">Manage your customer accounts and company details</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNewCustomerDialog} className="gap-2">
              <Plus className="w-4 h-4" />
              Add Customer
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Customer" : "Add New Customer"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Contact Information */}
              <div className="space-y-4">
                <h3 className="font-semibold text-sm">Contact Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Contact Name *</Label>
                    <Input
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      placeholder="e.g., John Doe"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="john@example.com"
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      placeholder="+27 123 456 7890"
                    />
                  </div>
                  <div>
                    <Label htmlFor="paymentTerms">Payment Terms</Label>
                    <select
                      id="paymentTerms"
                      name="paymentTerms"
                      value={formData.paymentTerms}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-input rounded-md bg-background"
                    >
                      <option value="cash">Cash</option>
                      <option value="30days">30 Days</option>
                      <option value="60days">60 Days</option>
                      <option value="90days">90 Days</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Company Information */}
              <div className="space-y-4 border-t pt-4">
                <h3 className="font-semibold text-sm">Company Information (for Invoicing)</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="companyName">Company Name</Label>
                    <Input
                      id="companyName"
                      name="companyName"
                      value={formData.companyName}
                      onChange={handleInputChange}
                      placeholder="e.g., ABC Trading (Pty) Ltd"
                    />
                  </div>
                  <div>
                    <Label htmlFor="vatNumber">VAT Number</Label>
                    <Input
                      id="vatNumber"
                      name="vatNumber"
                      value={formData.vatNumber}
                      onChange={handleInputChange}
                      placeholder="e.g., 4960323782"
                    />
                  </div>
                  <div>
                    <Label htmlFor="registrationNumber">Registration Number</Label>
                    <Input
                      id="registrationNumber"
                      name="registrationNumber"
                      value={formData.registrationNumber}
                      onChange={handleInputChange}
                      placeholder="e.g., 2024/149547/07"
                    />
                  </div>
                </div>
              </div>

              {/* Addresses */}
              <div className="space-y-4 border-t pt-4">
                <h3 className="font-semibold text-sm">Addresses</h3>
                <div>
                  <Label htmlFor="postalAddress">Postal Address</Label>
                  <Input
                    id="postalAddress"
                    name="postalAddress"
                    value={formData.postalAddress}
                    onChange={handleInputChange}
                    placeholder="P.O. Box 123, City, 2000"
                  />
                </div>
                <div>
                  <Label htmlFor="physicalAddress">Physical Address</Label>
                  <Input
                    id="physicalAddress"
                    name="physicalAddress"
                    value={formData.physicalAddress}
                    onChange={handleInputChange}
                    placeholder="123 Main Street, City, 2000"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end border-t pt-4">
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Saving..." : "Save Customer"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Customers Table */}
      <Card>
        <CardHeader>
          <CardTitle>Customer List</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading customers...</div>
          ) : error ? (
            <div className="text-center py-8 text-red-600">Error loading customers: {error.message}</div>
          ) : customers && customers.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contact Name</TableHead>
                    <TableHead>Company Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>VAT Number</TableHead>
                    <TableHead>Payment Terms</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium">{customer.name}</TableCell>
                      <TableCell>{customer.companyName || "-"}</TableCell>
                      <TableCell>{customer.email || "-"}</TableCell>
                      <TableCell>{customer.phone || "-"}</TableCell>
                      <TableCell>{customer.vatNumber || "-"}</TableCell>
                      <TableCell>{customer.paymentTerms}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button variant="ghost" size="sm" className="gap-1">
                            <Edit2 className="w-4 h-4" />
                            Edit
                          </Button>
                          {user?.role === "admin" && (
                            <Button variant="ghost" size="sm" className="gap-1 text-destructive hover:text-destructive">
                              <Trash2 className="w-4 h-4" />
                              Delete
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No customers found. Create your first customer to get started.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
