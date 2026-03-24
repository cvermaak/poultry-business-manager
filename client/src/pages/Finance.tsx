import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, DollarSign, AlertCircle } from "lucide-react";

export default function Finance() {
  // Placeholder data for financial overview
  const financialMetrics = [
    { label: "Total Revenue", value: "R 125,450.00", trend: "up", change: "+12.5%" },
    { label: "Total Expenses", value: "R 45,230.00", trend: "up", change: "+8.2%" },
    { label: "Net Profit", value: "R 80,220.00", trend: "up", change: "+15.3%" },
    { label: "Outstanding Invoices", value: "R 23,500.00", trend: "down", change: "-5.1%" },
  ];

  const recentTransactions = [
    { id: 1, date: "2026-03-21", description: "Invoice INV0011 - SugarBerry Trading", amount: 15450.00, type: "income", status: "paid" },
    { id: 2, date: "2026-03-20", description: "Feed Purchase - Supplier A", amount: -8500.00, type: "expense", status: "paid" },
    { id: 3, date: "2026-03-19", description: "Invoice INV0010 - ABC Processors", amount: 22300.00, type: "income", status: "pending" },
    { id: 4, date: "2026-03-18", description: "Veterinary Services", amount: -2150.00, type: "expense", status: "paid" },
    { id: 5, date: "2026-03-17", description: "Invoice INV0009 - XYZ Trading", amount: 18750.00, type: "income", status: "paid" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Finance & Accounting</h1>
        <p className="text-muted-foreground">Track financial performance and transactions</p>
      </div>

      {/* Financial Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {financialMetrics.map((metric) => (
          <Card key={metric.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{metric.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold">{metric.value}</div>
                <div className={`flex items-center gap-1 ${metric.trend === "up" ? "text-green-600" : "text-red-600"}`}>
                  {metric.trend === "up" ? (
                    <TrendingUp className="w-4 h-4" />
                  ) : (
                    <TrendingDown className="w-4 h-4" />
                  )}
                  <span className="text-sm">{metric.change}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentTransactions.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell>{new Date(transaction.date).toLocaleDateString()}</TableCell>
                    <TableCell className="font-medium">{transaction.description}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {transaction.type === "income" ? (
                          <DollarSign className="w-4 h-4 text-green-600" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-600" />
                        )}
                        <span className="capitalize">{transaction.type}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      <span className={transaction.type === "income" ? "text-green-600" : "text-red-600"}>
                        {transaction.type === "income" ? "+" : "-"}R {Math.abs(transaction.amount).toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={transaction.status === "paid" ? "default" : "secondary"}>
                        {transaction.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Financial Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Income Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-2 border-b">
                <span className="text-muted-foreground">Total Invoices</span>
                <span className="font-semibold">R 125,450.00</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b">
                <span className="text-muted-foreground">Paid</span>
                <span className="font-semibold text-green-600">R 101,950.00</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Outstanding</span>
                <span className="font-semibold text-orange-600">R 23,500.00</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Expense Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-2 border-b">
                <span className="text-muted-foreground">Total Expenses</span>
                <span className="font-semibold">R 45,230.00</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b">
                <span className="text-muted-foreground">Feed & Supplies</span>
                <span className="font-semibold">R 28,500.00</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Other</span>
                <span className="font-semibold">R 16,730.00</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
