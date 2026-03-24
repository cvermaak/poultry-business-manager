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
import { Checkbox } from "@/components/ui/checkbox";

export default function Sales() {
  const [isOpen, setIsOpen] = useState(false);
  const [useMultiSelect, setUseMultiSelect] = useState(false);
  const [selectedSessions, setSelectedSessions] = useState<number[]>([]);
  const [sessionPrices, setSessionPrices] = useState<{ [key: number]: string }>({});
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);

  const { data: invoices, isLoading, refetch, error: invoicesError } = trpc.invoices.list.useQuery({}, { retry: 1 });
  const { data: customers, error: customersError } = trpc.customers.list.useQuery({ isActive: true }, { retry: 1 });
  const { data: catchSessions } = trpc.catch.listCatchSessions.useQuery({ status: "completed" as const }, { retry: 1 });
  const { data: processors } = trpc.processor.list.useQuery(undefined, { retry: 1 });
  const createMutation = trpc.invoices.create.useMutation();
  const createMultipleMutation = trpc.invoices.createMultiple.useMutation();
  const generatePDFMutation = trpc.invoices.generatePDF.useMutation();

  const handleToggleSession = (sessionId: number) => {
    setSelectedSessions(prev => {
      if (prev.includes(sessionId)) {
        return prev.filter(id => id !== sessionId);
      } else {
        return [...prev, sessionId];
      }
    });
  };

  const handleSessionPriceChange = (sessionId: number, price: string) => {
    setSessionPrices(prev => ({ ...prev, [sessionId]: price }));
  };

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

      if (useMultiSelect) {
        // Multi-select mode
        if (selectedSessions.length === 0) {
          alert("Please select at least one catch session");
          return;
        }

        // Validate all prices are filled
        for (const sessionId of selectedSessions) {
          if (!sessionPrices[sessionId]) {
            alert(`Please enter price for session ${sessionId}`);
            return;
          }
        }

        const pricesRecord: { [key: string]: number } = {};
        for (const [key, value] of Object.entries(sessionPrices)) {
          if (selectedSessions.includes(parseInt(key))) {
            pricesRecord[key] = parseFloat(value);
          }
        }

        await createMultipleMutation.mutateAsync({
          customerId: parseInt(customerId),
          catchSessionIds: selectedSessions,
          processorId: parseInt(processorId),
          catchSessionPrices: pricesRecord,
        });
      } else {
        // Single select mode
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
      }

      setIsOpen(false);
      setSelectedSessions([]);
      setSessionPrices({});
      setUseMultiSelect(false);
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
              {/* Toggle between single and multi-select */}
              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-md">
                <Checkbox
                  id="multiSelect"
                  checked={useMultiSelect}
                  onCheckedChange={(checked) => {
                    setUseMultiSelect(checked as boolean);
                    setSelectedSessions([]);
                    setSessionPrices({});
                  }}
                />
                <Label htmlFor="multiSelect" className="cursor-pointer">
                  Select multiple catch sessions for this invoice
                </Label>
              </div>

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

              {/* Single select mode */}
              {!useMultiSelect && (
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
                      {catchSessions?.map((session: any) => (
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
              )}

              {/* Multi-select mode */}
              {useMultiSelect && (
                <div className="space-y-3">
                  <Label>Select Catch Sessions & Set Prices *</Label>
                  <div className="border rounded-md p-3 max-h-64 overflow-y-auto space-y-2">
                    {catchSessions?.map((session: any) => (
                      <div key={session.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded">
                        <Checkbox
                          id={`session-${session.id}`}
                          checked={selectedSessions.includes(session.id)}
                          onCheckedChange={() => handleToggleSession(session.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <label
                            htmlFor={`session-${session.id}`}
                            className="text-sm cursor-pointer truncate block"
                          >
                            {formatCatchSessionDisplay(session)}
                          </label>
                        </div>
                        {selectedSessions.includes(session.id) && (
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="Price"
                            value={sessionPrices[session.id] || ""}
                            onChange={(e) => handleSessionPriceChange(session.id, e.target.value)}
                            className="w-24"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  {selectedSessions.length > 0 && (
                    <div className="bg-blue-50 p-3 rounded-md">
                      <p className="text-sm text-blue-900">
                        Selected {selectedSessions.length} session(s)
                      </p>
                    </div>
                  )}
                </div>
              )}

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
                  disabled={createMutation.isPending || createMultipleMutation.isPending}
                >
                  {createMutation.isPending || createMultipleMutation.isPending ? "Generating..." : "Generate Invoice"}
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
