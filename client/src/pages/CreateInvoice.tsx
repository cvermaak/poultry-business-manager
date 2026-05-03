import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Info } from "lucide-react";

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  vatPercent: number;
}

export function CreateInvoice() {
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: "1", description: "", quantity: 1, unitPrice: 0, discountPercent: 0, vatPercent: 15 },
  ]);

  const [formData, setFormData] = useState({
    customerId: "",
    catchSessionId: "",
    processorId: "",
    invoiceDate: new Date().toISOString().split("T")[0],
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    notes: "",
  });

  // Fetch data for dropdowns
  const { data: customers } = trpc.customers.list.useQuery(undefined);
  const catchSessionsInput = useMemo(() => ({ status: "completed" as const, pageSize: 100, page: 1 }), []);
  const { data: catchSessionsData } = trpc.catch.listCatchSessions.useQuery(catchSessionsInput);
  const catchSessions = catchSessionsData?.sessions || [];
  const { data: processors } = trpc.processor.list.useQuery();

  // When a catch session is selected, auto-populate the first line item description
  const handleCatchSessionChange = (value: string) => {
    setFormData((prev) => ({ ...prev, catchSessionId: value }));
    if (value) {
      const session = catchSessions.find((s: any) => s.id.toString() === value);
      if (session) {
        const birds = (session as any).totalBirdsCaught || 0;
        const weight = parseFloat((session as any).totalNetWeight || "0");
        // Update the first line item with session details
        setLineItems((prev) =>
          prev.map((item, idx) =>
            idx === 0
              ? {
                  ...item,
                  description: `${birds} Broiler Chickens`,
                  quantity: weight,
                }
              : item
          )
        );
      }
    }
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleLineItemChange = (id: string, field: string, value: any) => {
    setLineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const addLineItem = () => {
    const newId = (Math.max(...lineItems.map((item) => parseInt(item.id)), 0) + 1).toString();
    setLineItems((prev) => [
      ...prev,
      { id: newId, description: "", quantity: 1, unitPrice: 0, discountPercent: 0, vatPercent: 15 },
    ]);
  };

  const removeLineItem = (id: string) => {
    if (lineItems.length > 1) {
      setLineItems((prev) => prev.filter((item) => item.id !== id));
    } else {
      toast.error("You must have at least one line item");
    }
  };

  const calculateLineTotal = (item: LineItem) => {
    const subtotal = item.quantity * item.unitPrice;
    const discount = subtotal * (item.discountPercent / 100);
    const exclusive = subtotal - discount;
    const vat = exclusive * (item.vatPercent / 100);
    return { subtotal, discount, exclusive, vat, inclusive: exclusive + vat };
  };

  const calculateTotals = () => {
    let totalExclusive = 0;
    let totalVat = 0;
    let totalDiscount = 0;
    lineItems.forEach((item) => {
      const { exclusive, vat, discount } = calculateLineTotal(item);
      totalExclusive += exclusive;
      totalVat += vat;
      totalDiscount += discount;
    });
    return { totalDiscount, totalExclusive, totalVat, totalInclusive: totalExclusive + totalVat };
  };

  const totals = calculateTotals();

  // Create invoice mutation
  const createInvoiceMutation = trpc.invoices.create.useMutation({
    onSuccess: () => {
      toast.success("Invoice created successfully");
      setLocation("/sales/invoices");
    },
    onError: (error) => {
      toast.error(`Failed to create invoice: ${error.message}`);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.customerId) {
      toast.error("Please select a customer");
      return;
    }
    if (lineItems.some((item) => !item.description.trim())) {
      toast.error("All line items must have a description");
      return;
    }

    setIsLoading(true);
    try {
      // Derive totalBirds and totalWeight from the selected catch session if available
      let totalBirds = 0;
      let totalWeight = 0;
      let pricePerKgExcl = 0;

      if (formData.catchSessionId) {
        const session = catchSessions.find((s: any) => s.id.toString() === formData.catchSessionId);
        if (session) {
          totalBirds = (session as any).totalBirdsCaught || 0;
          totalWeight = parseFloat((session as any).totalNetWeight || "0");
          // price per kg = exclusive total / weight (if weight > 0)
          pricePerKgExcl = totalWeight > 0 ? totals.totalExclusive / totalWeight : 0;
        }
      }

      await createInvoiceMutation.mutateAsync({
        customerId: parseInt(formData.customerId),
        catchSessionId: formData.catchSessionId !== "" ? parseInt(formData.catchSessionId, 10) : undefined,
        processorId: formData.processorId !== "" ? parseInt(formData.processorId, 10) : undefined,
        invoiceDate: new Date(formData.invoiceDate),
        dueDate: new Date(formData.dueDate),
        pricePerKgExcl,
        totalBirds,
        totalWeight,
        vatPercentage: lineItems[0]?.vatPercent ?? 15,
        items: lineItems.map((item) => ({
		  description: item.description,
		  quantity: item.quantity,
		  unitPrice: item.unitPrice,
		  discountPercent: item.discountPercent,
		  taxRate: item.vatPercent,
        })),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="outline" size="sm" onClick={() => setLocation("/sales/invoices")}>
            ← Back
          </Button>
          <h1 className="text-3xl font-bold">Create Invoice</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Invoice Header */}
          <Card>
            <CardHeader>
              <CardTitle>Invoice Details</CardTitle>
              <CardDescription>Customer, dates, and optional catch session linkage</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Customer — required */}
                <div>
                  <Label htmlFor="customerId">Customer <span className="text-red-500">*</span></Label>
                  <Select value={formData.customerId} onValueChange={(value) => setFormData({ ...formData, customerId: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers?.map((customer: any) => (
                        <SelectItem key={customer.id} value={customer.id.toString()}>
                          {customer.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Invoice Date */}
                <div>
                  <Label htmlFor="invoiceDate">Invoice Date</Label>
                  <Input id="invoiceDate" name="invoiceDate" type="date" value={formData.invoiceDate} onChange={handleFormChange} />
                </div>

                {/* Due Date */}
                <div>
                  <Label htmlFor="dueDate">Due Date</Label>
                  <Input id="dueDate" name="dueDate" type="date" value={formData.dueDate} onChange={handleFormChange} />
                </div>
              </div>

              {/* Optional: Catch Session + Processor */}
              <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Info className="w-4 h-4" />
                  <span>Optional — link to a catch session and processor for poultry sales</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Catch Session <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <Select value={formData.catchSessionId} onValueChange={handleCatchSessionChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select catch session" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— None —</SelectItem>
                        {catchSessions.map((session: any) => (
                          <SelectItem key={session.id} value={session.id.toString()}>
                            {session.flockNumber ? `${session.flockNumber} — ` : ""}
                            {session.catchDate ? new Date(session.catchDate).toLocaleDateString("en-ZA") : `Session #${session.id}`}
                            {session.totalBirdsCaught ? ` — ${session.totalBirdsCaught} birds` : ""}
                            {session.totalNetWeight ? `, ${parseFloat(session.totalNetWeight).toFixed(2)} kg` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Processor <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <Select value={formData.processorId} onValueChange={(value) => setFormData({ ...formData, processorId: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select processor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— None —</SelectItem>
                        {processors?.map((processor: any) => (
                          <SelectItem key={processor.id} value={processor.id.toString()}>
                            {processor.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" name="notes" value={formData.notes} onChange={handleFormChange} placeholder="Additional notes for the invoice" rows={3} />
              </div>
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Line Items</CardTitle>
                  <CardDescription>Add the products or services being invoiced</CardDescription>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Item
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-2">Description</th>
                      <th className="text-right py-2 w-24">Qty / Weight</th>
                      <th className="text-right py-2 w-28">Unit Price</th>
                      <th className="text-right py-2 w-24">Discount %</th>
                      <th className="text-right py-2 w-20">VAT %</th>
                      <th className="text-right py-2 w-28">Total (incl.)</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item) => {
                      const itemTotal = calculateLineTotal(item);
                      return (
                        <tr key={item.id} className="border-b">
                          <td className="py-2 pr-2">
                            <Input
                              value={item.description}
                              onChange={(e) => handleLineItemChange(item.id, "description", e.target.value)}
                              placeholder="Item description"
                              className="text-sm"
                            />
                          </td>
                          <td className="py-2">
                            <Input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => handleLineItemChange(item.id, "quantity", parseFloat(e.target.value) || 0)}
                              className="text-sm text-right"
                              min="0"
                              step="0.001"
                            />
                          </td>
                          <td className="py-2">
                            <Input
                              type="number"
                              value={item.unitPrice}
                              onChange={(e) => handleLineItemChange(item.id, "unitPrice", parseFloat(e.target.value) || 0)}
                              className="text-sm text-right"
                              min="0"
                              step="0.01"
                            />
                          </td>
                          <td className="py-2">
                            <Input
                              type="number"
                              value={item.discountPercent}
                              onChange={(e) => handleLineItemChange(item.id, "discountPercent", parseFloat(e.target.value) || 0)}
                              className="text-sm text-right"
                              min="0"
                              max="100"
                            />
                          </td>
                          <td className="py-2">
                            <Input
                              type="number"
                              value={item.vatPercent}
                              onChange={(e) => handleLineItemChange(item.id, "vatPercent", parseFloat(e.target.value) || 0)}
                              className="text-sm text-right"
                              min="0"
                              max="100"
                            />
                          </td>
                          <td className="py-2 text-right font-semibold">
                            R{itemTotal.inclusive.toFixed(2)}
                          </td>
                          <td className="py-2 text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeLineItem(item.id)}
                              className="text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Totals */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex justify-end">
                <div className="w-80 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal (before discount):</span>
                    <span>R{(totals.totalExclusive + totals.totalDiscount).toFixed(2)}</span>
                  </div>
                  {totals.totalDiscount > 0 && (
                    <div className="flex justify-between text-sm text-orange-600">
                      <span>Discount:</span>
                      <span>-R{totals.totalDiscount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="border-t pt-2 flex justify-between text-sm">
                    <span>Exclusive Total:</span>
                    <span>R{totals.totalExclusive.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>VAT:</span>
                    <span>R{totals.totalVat.toFixed(2)}</span>
                  </div>
                  <div className="border-t pt-2 flex justify-between font-bold text-lg">
                    <span>Total Due:</span>
                    <span className="text-orange-600">R{totals.totalInclusive.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => setLocation("/sales/invoices")}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading || createInvoiceMutation.isPending}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {isLoading || createInvoiceMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Invoice"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
