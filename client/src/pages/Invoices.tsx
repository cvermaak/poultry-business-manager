import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Download, Plus, Eye, Loader2, Send, CreditCard, XCircle } from "lucide-react";
import { format } from "date-fns";

export function Invoices() {
  const [, setLocation] = useLocation();
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [viewInvoice, setViewInvoice] = useState<any>(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);

  // Send dialog state
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendTarget, setSendTarget] = useState<any>(null);
  const [sentDate, setSentDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Payment dialog state
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<any>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("EFT");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Cancel dialog state
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<any>(null);

  const utils = trpc.useUtils();

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

  // Mark as Sent mutation
  const markAsSentMutation = trpc.invoices.markAsSent.useMutation({
    onSuccess: () => {
      toast.success("Invoice marked as sent");
      setSendDialogOpen(false);
      utils.invoices.list.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to mark as sent: ${error.message}`);
    },
  });

  // Record Payment mutation
  const recordPaymentMutation = trpc.invoices.recordPayment.useMutation({
    onSuccess: (data) => {
      toast.success(data?.newStatus === "paid" ? "Invoice marked as paid" : "Partial payment recorded");
      setPaymentDialogOpen(false);
      utils.invoices.list.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to record payment: ${error.message}`);
    },
  });

  // Cancel mutation
  const cancelMutation = trpc.invoices.cancel.useMutation({
    onSuccess: () => {
      toast.success("Invoice cancelled");
      setCancelDialogOpen(false);
      utils.invoices.list.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to cancel invoice: ${error.message}`);
    },
  });

  const handleDownloadPDF = (invoiceId: number) => {
    generatePdfMutation.mutate(invoiceId);
  };

  const handleViewInvoice = (invoice: any) => {
    setViewInvoice(invoice);
    setViewModalOpen(true);
  };

  const openSendDialog = (invoice: any) => {
    setSendTarget(invoice);
    setSentDate(new Date().toISOString().slice(0, 10));
    setSendDialogOpen(true);
  };

  const openPaymentDialog = (invoice: any) => {
    setPaymentTarget(invoice);
    const balance = parseFloat(invoice.inclusiveTotal || "0") - (invoice.paidAmount || 0) / 100;
    setPaymentAmount(balance.toFixed(2));
    setPaymentMethod("EFT");
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentDialogOpen(true);
  };

  const openCancelDialog = (invoice: any) => {
    setCancelTarget(invoice);
    setCancelDialogOpen(true);
  };

  const handleConfirmSent = () => {
    if (!sendTarget) return;
    markAsSentMutation.mutate({
      invoiceId: sendTarget.id,
      sentAt: sentDate + " 00:00:00",
    });
  };

  const handleConfirmPayment = () => {
    if (!paymentTarget) return;
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid payment amount");
      return;
    }
    recordPaymentMutation.mutate({
      invoiceId: paymentTarget.id,
      amount,
      paymentMethod,
      paymentDate: paymentDate + " 00:00:00",
    });
  };

  const handleConfirmCancel = () => {
    if (!cancelTarget) return;
    cancelMutation.mutate(cancelTarget.id);
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
      case "partial": return <Badge className="bg-yellow-500 text-white">Partial</Badge>;
      case "overdue": return <Badge className="bg-red-500 text-white">Overdue</Badge>;
      case "cancelled": return <Badge className="bg-gray-400 text-white">Cancelled</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getTransitionButtons = (invoice: any) => {
    const status = invoice.status || "draft";
    const buttons = [];

    if (status === "draft") {
      buttons.push(
        <Button
          key="send"
          variant="outline"
          size="sm"
          title="Mark as Sent"
          onClick={() => openSendDialog(invoice)}
          className="gap-1 text-blue-600 border-blue-300 hover:bg-blue-50"
        >
          <Send className="w-3 h-3" />
          Send
        </Button>
      );
    }

    if (["sent", "partial", "overdue"].includes(status)) {
      buttons.push(
        <Button
          key="payment"
          variant="outline"
          size="sm"
          title="Record Payment"
          onClick={() => openPaymentDialog(invoice)}
          className="gap-1 text-green-600 border-green-300 hover:bg-green-50"
        >
          <CreditCard className="w-3 h-3" />
          Payment
        </Button>
      );
    }

    if (["draft", "sent", "partial", "overdue"].includes(status)) {
      buttons.push(
        <Button
          key="cancel"
          variant="outline"
          size="sm"
          title="Cancel Invoice"
          onClick={() => openCancelDialog(invoice)}
          className="gap-1 text-red-600 border-red-300 hover:bg-red-50"
        >
          <XCircle className="w-3 h-3" />
          Cancel
        </Button>
      );
    }

    return buttons;
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
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="draft">Draft</TabsTrigger>
          <TabsTrigger value="sent">Sent</TabsTrigger>
          <TabsTrigger value="partial">Partial</TabsTrigger>
          <TabsTrigger value="paid">Paid</TabsTrigger>
          <TabsTrigger value="overdue">Overdue</TabsTrigger>
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
                        {invoice.status === "partial" && (
                          <p className="text-sm text-yellow-600 font-medium">
                            Paid: {formatCurrency((invoice.paidAmount || 0) / 100)} · Balance: {formatCurrency((invoice.balanceDue || 0) / 100)}
                          </p>
                        )}
                      </div>
                      <div className="text-right mr-4">
                        <p className="text-2xl font-bold text-orange-600">
                          {formatCurrency(invoice.inclusiveTotal || "0")}
                        </p>
                        <p className="text-xs text-muted-foreground">Including VAT</p>
                      </div>
                      <div className="flex flex-col gap-2 items-end">
                        {/* Status transition buttons */}
                        <div className="flex gap-2">
                          {getTransitionButtons(invoice)}
                        </div>
                        {/* View / Download buttons */}
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

      {/* ===== MARK AS SENT DIALOG ===== */}
      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark Invoice as Sent</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Invoice <strong>{sendTarget?.invoiceNumber}</strong> will be marked as sent.
            </p>
            <div className="space-y-2">
              <Label htmlFor="sentDate">Sent Date</Label>
              <Input
                id="sentDate"
                type="date"
                value={sentDate}
                onChange={(e) => setSentDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendDialogOpen(false)}>Cancel</Button>
            <Button
              className="bg-blue-500 hover:bg-blue-600 text-white gap-2"
              onClick={handleConfirmSent}
              disabled={markAsSentMutation.isPending}
            >
              {markAsSentMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirm Sent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== RECORD PAYMENT DIALOG ===== */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Recording payment for invoice <strong>{paymentTarget?.invoiceNumber}</strong>.
            </p>
            <div className="space-y-2">
              <Label htmlFor="payAmount">Payment Amount (R)</Label>
              <Input
                id="payAmount"
                type="number"
                min="0.01"
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payMethod">Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger id="payMethod">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EFT">EFT</SelectItem>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Card">Card</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payDate">Payment Date</Label>
              <Input
                id="payDate"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>Cancel</Button>
            <Button
              className="bg-green-500 hover:bg-green-600 text-white gap-2"
              onClick={handleConfirmPayment}
              disabled={recordPaymentMutation.isPending}
            >
              {recordPaymentMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== CANCEL INVOICE DIALOG ===== */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel Invoice</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to cancel invoice <strong>{cancelTarget?.invoiceNumber}</strong>? This action cannot be undone.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>Keep Invoice</Button>
            <Button
              variant="destructive"
              onClick={handleConfirmCancel}
              disabled={cancelMutation.isPending}
              className="gap-2"
            >
              {cancelMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Cancel Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                {viewInvoice.sentAt && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Sent Date</p>
                    <p className="font-semibold">{format(new Date(String(viewInvoice.sentAt)), "dd MMM yyyy")}</p>
                  </div>
                )}
                {viewInvoice.paymentDate && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Payment Date</p>
                    <p className="font-semibold">{format(new Date(String(viewInvoice.paymentDate)), "dd MMM yyyy")}</p>
                  </div>
                )}
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
                        <TableHead className="text-right">Discount %</TableHead>
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
                            <TableCell className="text-right">{parseFloat(item.discountPercent || '0').toFixed(2)}%</TableCell>
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
                          <TableCell className="text-right">0%</TableCell>
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
                  {viewInvoice.status === "partial" && (
                    <>
                      <div className="flex justify-between text-sm text-yellow-600">
                        <span>Paid</span>
                        <span>{formatCurrency((viewInvoice.paidAmount || 0) / 100)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-semibold text-red-600">
                        <span>Balance Due</span>
                        <span>{formatCurrency((viewInvoice.balanceDue || 0) / 100)}</span>
                      </div>
                    </>
                  )}
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
