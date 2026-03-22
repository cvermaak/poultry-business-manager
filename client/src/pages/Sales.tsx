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
  const [formData, setFormData] = useState({
    customerId: "",
    catchSessionId: "",
    processorId: "",
    pricePerKgExcl: "",
  });

  const { data: invoices, isLoading, refetch, error: invoicesError } = trpc.invoices.list.useQuery({}, { retry: 1 });
  const { data: customers, error: customersError } = trpc.customers.list.useQuery({ isActive: true }, { retry: 1 });
  const { data: catchSessions } = trpc.catch.listCatchSessions.useQuery({ status: "completed" }, { retry: 1 });
  const { data: processors } = trpc.processor.list.useQuery({}, { retry: 1 });
  const createMutation = trpc.invoices.create.useMutation();
  const createMultipleMutation = trpc.invoices.createMultiple.useMutation();

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
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
          customerId: parseInt(formData.customerId),
          catchSessionIds: selectedSessions,
          processorId: parseInt(formData.processorId),
          catchSessionPrices: pricesRecord,
        });
      } else {
        // Single select mode
        await createMutation.mutateAsync({
          customerId: parseInt(formData.customerId),
          catchSessionId: parseInt(formData.catchSessionId),
          processorId: parseInt(formData.processorId),
          pricePerKgExcl: parseFloat(formData.pricePerKgExcl),
        });
      }

      setFormData({
        customerId: "",
        catchSessionId: "",
        processorId: "",
        pricePerKgExcl: "",
      });
      setSelectedSessions([]);
      setSessionPrices({});
      setUseMultiSelect(false);
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

  const formatCatchSessionDisplay = (session: any) => {
    const catchDate = new Date(session.catchDate).toISOString().split('T')[0];
    const sequence = session.sequence || 1;
    const displayId = `FL-${session.flockId}-${catchDate}-${session.catchTeam || 'Unknown'}-CATCH#${sequence}`;
    return `${displayId} - ${session.totalBirdsCaught || 0} birds, ${session.totalNetWeight || 0}kg`;
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
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Invoice</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
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
              </div>

              {/* Single select mode */}
              {!useMultiSelect && (
                <div className="grid grid-cols-2 gap-4">
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
                      value={formData.pricePerKgExcl}
                      onChange={handleInputChange}
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
                            placeholder="Price/kg"
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
                        <strong>{selectedSessions.length} session(s) selected</strong>
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
                  {createMutation.isPending || createMultipleMutation.isPending ? "Creating..." : "Create Invoice"}
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
