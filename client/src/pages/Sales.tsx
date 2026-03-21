import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Download, Eye } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function Sales() {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    customerId: "",
    catchSessionId: "",
    processorId: "",
    pricePerKgExcl: "",
  });

  const { data: invoices, isLoading, refetch, error: invoicesError } = trpc.invoices.list.useQuery({}, { retry: 1 });
  const { data: customers, error: customersError } = trpc.customers.list.useQuery({ isActive: true }, { retry: 1 });
  const { data: catchSessions } = trpc.catchSessions.list.useQuery({}, { retry: 1 });
  const { data: processors } = trpc.processors.list.useQuery({}, { retry: 1 });
  const createMutation = trpc.invoices.create.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await createMutation.mutateAsync({
        customerId: parseInt(formData.customerId),
        catchSessionId: parseInt(formData.catchSessionId),
        processorId: parseInt(formData.processorId),
        pricePerKgExcl: parseFloat(formData.pricePerKgExcl),
      });

      setFormData({
        customerId: "",
        catchSessionId: "",
        processorId: "",
        pricePerKgExcl: "",
      });
      setIsOpen(false);
      refetch();
    } catch (error) {
      console.error("Error creating invoice:", error);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft":
        return "bg-gray-100 text-gray-800";
      case "sent":
        return "bg-blue-100 text-blue-800";
      case "paid":
        return "bg-green-100 text-green-800";
      case "partial":
        return "bg-yellow-100 text-yellow-800";
      case "overdue":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sales & Invoicing</h1>
          <p className="text-muted-foreground">Manage invoices and track sales</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Create Invoice
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Invoice</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="customerId">Customer *</Label>
                  <select
                    id="customerId"
                    name="customerId"
                    value={formData.customerId}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-input rounded-md bg-background"
                  >
                    <option value="">Select a customer</option>
                    {customers?.map((customer: any) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name} {customer.companyName ? `(${customer.companyName})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="catchSessionId">Catch Session *</Label>
                  <select
                    id="catchSessionId"
                    name="catchSessionId"
                    value={formData.catchSessionId}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-input rounded-md bg-background"
                  >
                    <option value="">Select a catch session</option>
                    {catchSessions?.map((session: any) => (
                      <option key={session.id} value={session.id}>
                        Session #{session.id} - {session.totalBirdsCaught || 0} birds
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="processorId">Processor *</Label>
                  <select
                    id="processorId"
                    name="processorId"
                    value={formData.processorId}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-input rounded-md bg-background"
                  >
                    <option value="">Select a processor</option>
                    {processors?.map((processor: any) => (
                      <option key={processor.id} value={processor.id}>
                        {processor.name || `Processor #${processor.id}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="pricePerKgExcl">Price per KG (Excl. VAT) *</Label>
                  <Input
                    id="pricePerKgExcl"
                    name="pricePerKgExcl"
                    type="number"
                    step="0.01"
                    value={formData.pricePerKgExcl}
                    onChange={handleInputChange}
                    placeholder="e.g., 45.50"
                    required
                  />
                </div>
              </div>

              <div className="bg-blue-50 p-4 rounded-md">
                <p className="text-sm text-blue-900">
                  <strong>Note:</strong> VAT (15%) will be automatically calculated and added to the invoice total.
                </p>
              </div>

              <div className="flex gap-2 justify-end border-t pt-4">
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating..." : "Create Invoice"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {invoicesError && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-sm text-red-800">Error loading invoices: {invoicesError.message}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading invoices...</p>
          ) : invoices && invoices.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Amount (Incl. VAT)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice: any) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                    <TableCell>{customers?.find((c: any) => c.id === invoice.customerId)?.name || "Unknown"}</TableCell>
                    <TableCell>R {invoice.inclusiveTotal?.toFixed(2) || "0.00"}</TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(invoice.status)}>
                        {invoice.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(invoice.dueDate).toLocaleDateString()}</TableCell>
                    <TableCell className="flex gap-2">
                      <Button variant="ghost" size="sm" className="gap-1">
                        <Eye className="w-4 h-4" />
                        View
                      </Button>
                      <Button variant="ghost" size="sm" className="gap-1">
                        <Download className="w-4 h-4" />
                        PDF
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground">No invoices found. Create one to get started.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
