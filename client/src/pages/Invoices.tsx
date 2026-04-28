import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Download, Plus, Eye, Loader2 } from "lucide-react";
import { format } from "date-fns";

export function Invoices() {
  const [, setLocation] = useLocation();
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [viewInvoice, setViewInvoice] = useState<any>(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);

  // Fetch invoices
  const { data: invoices, isLoading } = trpc.invoices.list.useQuery({
    status: selectedStatus === "all" ? undefined : selectedStatus,
  });

  // Fetch line items for the currently viewed invoice
  const { data: viewInvoiceItems, isLoading: itemsLoading } = trpc.invoices.getItems.useQuery(
    viewInvoice?.id ?? 0,
    { enabled: !!viewInvoice?.id }
  );

  // Generate PDF mutation
  const generatePdfMutation = trpc.invoices.generatePDF.useMutation({
    onSuccess: (data) => {
      const binaryString = atob(data.pdfBuffer);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = data.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("Invoice downloaded successfully");
    },
    onError: (error) => {
      toast.error(`Failed to generate PDF: ${error.message}`);
    },
  });

  const handleDownloadPDF = (invoiceId: number) => {
    generatePdfMutation.mutate(invoiceId);
  };

  const handleViewInvoice = (invoice: any) => {
    setViewInvoice(invoice);
    setViewModalOpen(true);
  };

  const formatCurrency = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return `R ${num.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft": return <Badge variant="outline">Draft</Badge>;
      case "sent": return <Badge className="bg-blue-500 text-white">Sent</Badge>;
      case "paid": return <Badge className="bg-green-500 text-white">Paid</Badge>;
      case "overdue": return <Badge className="bg-red-500 text-white">Overdue</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invoices</h1>
          <p className="text-muted-foreground">Manage and track all invoices</p>
        </div>
        <Button
          className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
          onClick={() => setLocation("/sales/invoices/create")}
        >
          <Plus className="w-4 h-4" />
          Create Invoice
        </Button>
      </div>

      <Tabs defaultValue="all" onValueChange={setSelectedStatus} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="draft">Draft</TabsTrigger>
          <TabsTrigger value="sent">Sent</TabsTrigger>
          <TabsTrigger value="paid">Paid</TabsTrigger>
        </TabsList>

        <TabsContent value={selectedStatus} className="space-y-4 mt-6">
          {invoices && invoices.length > 0 ? (
            <div className="grid gap-4">
              {invoices.map((invoice: any) => (
                <Card key={invoice.id} className="hover:shadow-lg transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold">{invoice.invoiceNumber}</h3>
                          {getStatusBadge(invoice.status || "draft")}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Customer: <span className="font-medium text-foreground">{invoice.customerName || "Unknown"}</span>
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Date: {format(new Date(invoice.invoiceDate), "dd MMM yyyy")}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Due: {format(new Date(invoice.dueDate), "dd MMM yyyy")}
                        </p>
                      </div>
                      <div className="text-right mr-4">
                        <p className="text-2xl font-bold text-orange-600">
                          {formatCurrency(invoice.inclusiveTotal || "0")}
                        </p>
                        <p className="text-xs text-muted-foreground">Including VAT</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadPDF(invoice.id)}
                          disabled={generatePdfMutation.isPending}
                          title="Download PDF"
                        >
                          {generatePdfMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewInvoice(invoice)}
                          title="View Invoice"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground py-8">
                  No invoices found. Use the <strong>Create Invoice</strong> button to generate your first invoice.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ===== VIEW INVOICE MODAL ===== */}
      <Dialog open={viewModalOpen} onOpenChange={setViewModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {viewInvoice?.invoiceNumber}
              {viewInvoice && getStatusBadge(viewInvoice.status || "draft")}
            </DialogTitle>
          </DialogHeader>

          {viewInvoice && (
            <div className="space-y-6">
              {/* Header info */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Customer</p>
                  <p className="font-semibold">{viewInvoice.customerName || "Unknown"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Processor</p>
                  <p className="font-semibold">{viewInvoice.processorName || "—"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Invoice Date</p>
                  <p className="font-semibold">{format(new Date(viewInvoice.invoiceDate), "dd MMM yyyy")}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Due Date</p>
                  <p className="font-semibold">{format(new Date(viewInvoice.dueDate), "dd MMM yyyy")}</p>
                </div>
              </div>

              <Separator />

              {/* Line items */}
              <div>
                <p className="text-sm font-semibold mb-3">Line Items</p>
                {itemsLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">VAT %</TableHead>
                        <TableHead className="text-right">Amount (incl.)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {viewInvoiceItems && viewInvoiceItems.length > 0 ? (
                        viewInvoiceItems.map((item: any, idx: number) => (
                          <TableRow key={idx}>
                            <TableCell>{item.description}</TableCell>
                            <TableCell className="text-right">{parseFloat(item.quantity || '1').toFixed(2)}</TableCell>
                            <TableCell className="text-right">{formatCurrency((item.unitPrice || 0) / 100)}</TableCell>
                            <TableCell className="text-right">{parseFloat(item.taxRate || '15').toFixed(2)}%</TableCell>
                            <TableCell className="text-right">{formatCurrency((item.totalAmount || 0) / 100)}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        // Fallback for older invoices without stored line items
                        <TableRow>
                          <TableCell>
                            {viewInvoice.catchSessionId
                              ? `${viewInvoice.totalBirds || 0} Broiler Chickens @ R${parseFloat(viewInvoice.pricePerKgExcl || '0').toFixed(2)} per kg`
                              : "Invoice item"}
                          </TableCell>
                          <TableCell className="text-right">{viewInvoice.totalBirds || "—"}</TableCell>
                          <TableCell className="text-right">{formatCurrency(viewInvoice.pricePerKgExcl || 0)}</TableCell>
                          <TableCell className="text-right">{viewInvoice.vatPercentage || 15}%</TableCell>
                          <TableCell className="text-right">{formatCurrency(viewInvoice.inclusiveTotal || 0)}</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </div>

              <Separator />

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-64 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal (excl. VAT)</span>
                    <span>{formatCurrency(viewInvoice.exclusiveTotal || 0)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">VAT ({viewInvoice.vatPercentage || 15}%)</span>
                    <span>{formatCurrency(viewInvoice.vatAmount || 0)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total (incl. VAT)</span>
                    <span className="text-orange-600">{formatCurrency(viewInvoice.inclusiveTotal || 0)}</span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {viewInvoice.notes && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm">{viewInvoice.notes}</p>
                  </div>
                </>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setViewModalOpen(false)}>
                  Close
                </Button>
                <Button
                  className="bg-orange-500 hover:bg-orange-600 text-white gap-2"
                  onClick={() => {
                    setViewModalOpen(false);
                    handleDownloadPDF(viewInvoice.id);
                  }}
                  disabled={generatePdfMutation.isPending}
                >
                  {generatePdfMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  Download PDF
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
