import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Download, Plus, Eye, Loader2 } from "lucide-react";
import { format } from "date-fns";

export function Invoices() {
  const [, setLocation] = useLocation();
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  // Fetch invoices
  const { data: invoices, isLoading, refetch } = trpc.invoices.list.useQuery({
    status: selectedStatus === "all" ? undefined : selectedStatus,
  });

  // Generate PDF mutation
  const generatePdfMutation = trpc.invoices.generatePDF.useMutation({
    onSuccess: (data) => {
      // Create blob from base64
      const binaryString = atob(data.pdfBuffer);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: "application/pdf" });

      // Create download link
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="outline">Draft</Badge>;
      case "sent":
        return <Badge className="bg-blue-500">Sent</Badge>;
      case "paid":
        return <Badge className="bg-green-500">Paid</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Invoices</h1>
        <Button className="bg-orange-500 hover:bg-orange-600" onClick={() => setLocation("/sales/invoices/create")}>
          <Plus className="w-4 h-4 mr-2" />
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
                        <p className="text-sm text-gray-600">
                          Customer: {invoice.customerName || "Unknown"}
                        </p>
                        <p className="text-sm text-gray-600">
                          Date: {format(new Date(invoice.invoiceDate), "dd MMM yyyy")}
                        </p>
                        <p className="text-sm text-gray-600">
                          Due: {format(new Date(invoice.dueDate), "dd MMM yyyy")}
                        </p>
                      </div>
                      <div className="text-right mr-4">
                        <p className="text-2xl font-bold text-orange-600">
                          R{parseFloat(invoice.inclusiveTotal || "0").toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-500">Including VAT</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadPDF(invoice.id)}
                          disabled={generatePdfMutation.isPending}
                        >
                          {generatePdfMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                        </Button>
                        <Button variant="outline" size="sm">
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
                <p className="text-center text-gray-500">
                  No invoices found. Create your first invoice to get started.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
