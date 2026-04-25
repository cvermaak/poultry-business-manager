import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";

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
    {
      id: "1",
      description: "",
      quantity: 1,
      unitPrice: 0,
      discountPercent: 0,
      vatPercent: 15,
    },
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
  const { data: customers } = trpc.customers.list.useQuery();
  const { data: catchSessions } = trpc.catch.listCatchSessions.useQuery({});
  const { data: processors } = trpc.processor.list.useQuery();

  // Fetch selected catch session details
  const { data: selectedCatchSession } = trpc.catch.getCatchSessionDetails.useQuery(
    { sessionId: parseInt(formData.catchSessionId) },
    { enabled: !!formData.catchSessionId && !isNaN(parseInt(formData.catchSessionId)) }
  );

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

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleLineItemChange = (id: string, field: string, value: any) => {
    setLineItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const addLineItem = () => {
    const newId = Math.max(...lineItems.map((item) => parseInt(item.id)), 0) + 1;
    setLineItems((prev) => [
      ...prev,
      {
        id: newId.toString(),
        description: "",
        quantity: 1,
        unitPrice: 0,
        discountPercent: 0,
        vatPercent: 15,
      },
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

    return {
      totalDiscount,
      totalExclusive,
      totalVat,
      totalInclusive: totalExclusive + totalVat,
    };
  };

  const totals = calculateTotals();

  // Update line items when catch session is selected
  useEffect(() => {
    if (selectedCatchSession?.session && formData.catchSessionId) {
      const session = selectedCatchSession.session;
      const totalBirds = session.totalBirdsCaught || 0;
      const totalWeight = parseFloat(session.totalNetWeight?.toString() || '0');
      const pricePerKg = totalWeight > 0 ? totals.totalExclusive / totalWeight : 0;

      setLineItems([
        {
          id: "1",
          description: `${totalBirds} Broiler Chickens @ R${pricePerKg.toFixed(2)} per kg`,
          quantity: totalWeight,
          unitPrice: pricePerKg,
          discountPercent: 0,
          vatPercent: 15,
        },
      ]);
    }
  }, [selectedCatchSession, formData.catchSessionId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.customerId) {
      toast.error("Please select a customer");
      return;
    }

    setIsLoading(true);
    try {
      const session = selectedCatchSession?.session;
      const totalBirds = session?.totalBirdsCaught || 0;
      const totalWeight = parseFloat(session?.totalNetWeight?.toString() || '0');

      await createInvoiceMutation.mutateAsync({
        customerId: parseInt(formData.customerId),
        catchSessionId: formData.catchSessionId ? parseInt(formData.catchSessionId) : undefined,
        processorId: formData.processorId ? parseInt(formData.processorId) : undefined,
        invoiceDate: new Date(formData.invoiceDate),
        dueDate: new Date(formData.dueDate),
        pricePerKgExcl: totals.totalExclusive > 0 && totalWeight > 0 ? totals.totalExclusive / totalWeight : 0,
        totalBirds: totalBirds,
        totalWeight: totalWeight,
        vatPercentage: lineItems.some((item) => item.vatPercent > 0)
          ? lineItems.find((item) => item.vatPercent > 0)?.vatPercent ?? 0
          : 0,
        lineItems: lineItems.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountPercent: item.discountPercent,
          vatPercent: item.vatPercent,
        })),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Create Invoice</h1>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Invoice Header */}
          <Card>
            <CardHeader>
              <CardTitle>Invoice Details</CardTitle>
              <CardDescription>Basic invoice information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="customerId">Customer *</Label>
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

                <div>
                  <Label htmlFor="catchSessionId">Catch Session</Label>
                  <Select value={formData.catchSessionId} onValueChange={(value) => setFormData({ ...formData, catchSessionId: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select catch session (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {catchSessions?.map((session: any) => (
                        <SelectItem key={session.id} value={session.id.toString()}>
                          {session.flockNumber ? `Flock ${session.flockNumber} — ` : ""}Session {session.id} ({session.catchDate?.slice(0, 10) ?? ""})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="processorId">Processor</Label>
                  <Select value={formData.processorId} onValueChange={(value) => setFormData({ ...formData, processorId: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select processor (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {processors?.map((processor: any) => (
                        <SelectItem key={processor.id} value={processor.id.toString()}>
                          {processor.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="invoiceDate">Invoice Date</Label>
                  <Input
                    id="invoiceDate"
                    name="invoiceDate"
                    type="date"
                    value={formData.invoiceDate}
                    onChange={handleFormChange}
                  />
                </div>

                <div>
                  <Label htmlFor="dueDate">Due Date</Label>
                  <Input
                    id="dueDate"
                    name="dueDate"
                    type="date"
                    value={formData.dueDate}
                    onChange={handleFormChange}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  value={formData.notes}
                  onChange={handleFormChange}
                  placeholder="Additional notes for the invoice"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Line Items</CardTitle>
                  <CardDescription>Add products or services</CardDescription>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Item
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Description</th>
                      <th className="text-right py-2 w-20">Qty</th>
                      <th className="text-right py-2 w-24">Unit Price</th>
                      <th className="text-right py-2 w-20">Discount %</th>
                      <th className="text-right py-2 w-28">
                        <div>VAT %</div>
                        <div className="text-xs font-normal text-muted-foreground">0% for zero-rated</div>
                      </th>
                      <th className="text-center py-2 w-24">
                        <div>Zero-rated</div>
                        <div className="text-xs font-normal text-muted-foreground">Set VAT to 0%</div>
                      </th>
                      <th className="text-right py-2 w-24">Total</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item) => {
                      const itemTotal = calculateLineTotal(item);
                      return (
                        <tr key={item.id} className="border-b">
                          <td className="py-2">
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
                              onChange={(e) => handleLineItemChange(item.id, "quantity", parseFloat(e.target.value))}
                              className="text-sm text-right"
                              min="1"
                            />
                          </td>
                          <td className="py-2">
                            <Input
                              type="number"
                              value={item.unitPrice}
                              onChange={(e) => handleLineItemChange(item.id, "unitPrice", parseFloat(e.target.value))}
                              className="text-sm text-right"
                              step="0.01"
                            />
                          </td>
                          <td className="py-2">
                            <Input
                              type="number"
                              value={item.discountPercent}
                              onChange={(e) => handleLineItemChange(item.id, "discountPercent", parseFloat(e.target.value))}
                              className="text-sm text-right"
                              min="0"
                              max="100"
                            />
                          </td>
                          <td className="py-2">
                            <Input
                              type="number"
                              value={item.vatPercent}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                handleLineItemChange(item.id, "vatPercent", isNaN(val) ? 0 : val);
                              }}
                              className="text-sm text-right"
                              min="0"
                              max="100"
                              step="1"
                              aria-label="VAT percentage"
                            />
                          </td>
                          <td className="py-2 text-center">
                            <div className="flex items-center justify-center">
                              <Checkbox
                                id={`zero-rated-${item.id}`}
                                checked={item.vatPercent === 0}
                                onCheckedChange={(checked) =>
                                  handleLineItemChange(item.id, "vatPercent", checked ? 0 : 15)
                                }
                                aria-label="Zero-rated (0% VAT)"
                              />
                            </div>
                          </td>
                          <td className="py-2 text-right font-semibold">
                            R{itemTotal.inclusive.toFixed(2)}
                          </td>
                          <td className="py-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeLineItem(item.id)}
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
                    <span>Subtotal:</span>
                    <span>R{(totals.totalExclusive + totals.totalDiscount).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-orange-600">
                    <span>Discount:</span>
                    <span>-R{totals.totalDiscount.toFixed(2)}</span>
                  </div>
                  <div className="border-t pt-2 flex justify-between text-sm">
                    <span>Exclusive Total:</span>
                    <span>R{totals.totalExclusive.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>
                      VAT{" "}
                      {lineItems.every((item) => item.vatPercent === 0)
                        ? "(Zero-rated)"
                        : lineItems.every((item) => item.vatPercent === lineItems[0].vatPercent)
                        ? `(${lineItems[0].vatPercent}%)`
                        : "(mixed rates)"}
                      :
                    </span>
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

          {/* Submit Buttons */}
          <div className="flex justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setLocation("/sales/invoices")}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading || createInvoiceMutation.isPending}
              className="bg-orange-500 hover:bg-orange-600"
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
