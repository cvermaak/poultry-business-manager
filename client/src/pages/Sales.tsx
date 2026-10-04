import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Download, Eye, X } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function Sales() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);

  const { data: invoices, isLoading, refetch, error: invoicesError } = trpc.invoices.list.useQuery({}, { retry: 1 });
  const { data: customers, error: customersError } = trpc.customers.list.useQuery({ isActive: true }, { retry: 1 });
  const { data: catchSessionsResponse } = trpc.catch.listCatchSessions.useQuery({ status: "completed" as const, page: 1, pageSize: 100 }, { retry: 1 });
  const catchSessions = catchSessionsResponse?.sessions;
  const { data: processors } = trpc.processor.list.useQuery(undefined, { retry: 1 });
  const createMutation = trpc.invoices.create.useMutation();
  const generatePDFMutation = trpc.invoices.generatePDF.useMutation();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    try {
      // Use FormData API to get form values directly
      const formData = new FormData(e.currentTarget);
      const customerId = formData.get('customerId') as string;
      const processorId = formData.get('processorId') as string;
      const catchSessionId = formData.get('catchSessionId') as string;
      const pricePerKgExcl = formData.get('pricePerKgExcl') as string;

      console.log('Form submission - FormData values:', { customerId, processorId, catchSessionId, pricePerKgExcl });

      // Validate required fields
      if (!customerId || !processorId || !pricePerKgExcl) {
        alert("Please fill in all required fields");
        return;
      }

      if (!catchSessionId) {
        alert("Please select a catch session");
        return;
      }

      await createMutation.mutateAsync({
        customerId: parseInt(customerId),
        catchSessionId: parseInt(catchSessionId),
        processorId: parseInt(processorId),
        pricePerKgExcl: parseFloat(pricePerKgExcl),
      });

      setIsOpen(false);
      refetch();
    } catch (error) {
      console.error("Error creating invoice:", error);
      alert("Error creating invoice. Please try again.");
    }
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

  const formatCatchSessionDisplay = (session: any) => {
    const catchDate = new Date(session.catchDate).toISOString().split('T')[0];
    const sequence = session.sequence || 1;
    const displayId = `FL-${session.flockId}-${catchDate}-${session.catchTeam || 'Unknown'}-CATCH#${sequence}`;
    return `${displayId} - ${session.totalBirdsCaught || 0} birds, ${session.totalNetWeight || 0}kg`;
  };

  const handleViewInvoice = (invoiceId: number) => {
    const invoice = invoices?.find((inv: any) => inv.id === invoiceId);
    if (invoice) {
      setSelectedInvoice(invoice);
      setViewModalOpen(true);
    }
  };

  const handleDownloadPDF = async (invoiceId: number) => {
    try {
      const result = await generatePDFMutation.mutateAsync(invoiceId);

      if (result.success && result.pdfBuffer) {
        // Convert base64 to blob
        const binaryString = atob(result.pdfBuffer);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'application/pdf' });

        // Create download link
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = result.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } else {
        alert('Failed to generate PDF');
      }
    } catch (error) {
      console.error('Error downloading PDF:', error);
      alert('Failed to download PDF: ' + (error instanceof Error ? error.message : 'Unknown error'));
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
          <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Invoice</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 p-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="customerId">Customer *</Label>
                  <select
                    id="customerId"
                    name="customerId"
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
                  <Label htmlFor="processorId">Processor *</Label>
                  <select
                    id="processorId"
                    name="processorId"
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
              </div>

			  <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="catchSessionId">Catch Session *</Label>
                    <select
                      id="catchSessionId"
                      name="catchSessionId"
                      required
                      className="w-full px-3 py-2 border border-input rounded-md bg-background"
                    >
                      <option value="">Select a catch session</option>
                      {(catchSessions ?? []).map((session: any) => (
                        <option key={session.id} value={session.id}>
                          {formatCatchSessionDisplay(session)}
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
                <Button 
                  type="submit" 
                  disabled={createMutation.isPending}
                >
				  {createMutation.isPending ? "Generating..." : "Generate Invoice"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Invoice View Modal */}
        <Dialog open={viewModalOpen} onOpenChange={setViewModalOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Invoice Details</DialogTitle>
            </DialogHeader>
            {selectedInvoice ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Invoice Number</p>
                    <p className="font-semibold">{selectedInvoice.invoiceNumber}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <Badge className={getStatusColor(selectedInvoice.status)}>
                      {selectedInvoice.status}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Customer</p>
                    <p className="font-semibold">{customers?.find((c: any) => c.id === selectedInvoice.customerId)?.name || "Unknown"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Invoice Date</p>
                    <p className="font-semibold">{new Date(selectedInvoice.invoiceDate).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Due Date</p>
                    <p className="font-semibold">{new Date(selectedInvoice.dueDate).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Birds</p>
                    <p className="font-semibold">{selectedInvoice.totalBirds}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Weight (kg)</p>
                    <p className="font-semibold">{selectedInvoice.totalWeight}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Price per KG</p>
                    <p className="font-semibold">R {(typeof selectedInvoice.pricePerKgExcl === 'number' ? selectedInvoice.pricePerKgExcl : parseFloat(selectedInvoice.pricePerKgExcl || 0)).toFixed(2)}</p>
                  </div>
                </div>
                <div className="border-t pt-4 space-y-2">
                  <div className="flex justify-between">
                    <span>Subtotal (Excl. VAT):</span>
                    <span>R {(typeof selectedInvoice.exclusiveTotal === 'number' ? selectedInvoice.exclusiveTotal : parseFloat(selectedInvoice.exclusiveTotal || 0)).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>VAT (15%):</span>
                    <span>R {(typeof selectedInvoice.vatAmount === 'number' ? selectedInvoice.vatAmount : parseFloat(selectedInvoice.vatAmount || 0)).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg border-t pt-2">
                    <span>Total (Incl. VAT):</span>
                    <span>R {(typeof selectedInvoice.inclusiveTotal === 'number' ? selectedInvoice.inclusiveTotal : parseFloat(selectedInvoice.inclusiveTotal || 0)).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <p>Loading invoice details...</p>
            )}
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
                    <TableCell>R {(typeof invoice.inclusiveTotal === 'number' ? invoice.inclusiveTotal : parseFloat(invoice.inclusiveTotal || 0)).toFixed(2) || "0.00"}</TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(invoice.status)}>
                        {invoice.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(invoice.dueDate).toLocaleDateString()}</TableCell>
                    <TableCell className="flex gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="gap-1"
                        onClick={() => handleViewInvoice(invoice.id)}
                      >
                        <Eye className="w-4 h-4" />
                        View
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="gap-1"
                        onClick={() => handleDownloadPDF(invoice.id)}
                      >
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
