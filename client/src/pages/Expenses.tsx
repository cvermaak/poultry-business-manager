import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Filter, CheckCircle, XCircle, Clock, AlertCircle, TrendingDown } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  paid: "bg-green-100 text-green-800",
  overdue: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-600",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <Clock className="h-3 w-3" />,
  paid: <CheckCircle className="h-3 w-3" />,
  overdue: <AlertCircle className="h-3 w-3" />,
  cancelled: <XCircle className="h-3 w-3" />,
};

const PAYMENT_METHODS = ["EFT", "Cash", "Cheque", "Credit Card", "Debit Order"];

function formatCents(cents: number): string {
  return `R${(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Expenses() {

  const utils = trpc.useUtils();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showMarkPaidDialog, setShowMarkPaidDialog] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  // Form state
  const [form, setForm] = useState({
    categoryId: "",
    houseId: "",
    description: "",
    amount: "",
    vatPercentage: "15",
    expenseDate: new Date().toISOString().split("T")[0],
    paymentMethod: "",
    reference: "",
    notes: "",
  });
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);

  const { data: categories } = trpc.expenses.getCategories.useQuery();
  const { data: houses } = trpc.houses.list.useQuery();
  const { data: expenseData, isLoading } = trpc.expenses.list.useQuery({
    status: filterStatus as any || undefined,
    startDate: filterStartDate || undefined,
    endDate: filterEndDate || undefined,
  });
  const { data: summary } = trpc.expenses.getSummary.useQuery({
    startDate: filterStartDate || undefined,
    endDate: filterEndDate || undefined,
  });

  const createMutation = trpc.expenses.create.useMutation({
    onSuccess: () => {
      toast.success("Expense recorded successfully");
      utils.expenses.list.invalidate();
      utils.expenses.getSummary.invalidate();
      setShowAddDialog(false);
      setForm({
        categoryId: "", houseId: "", description: "", amount: "",
        vatPercentage: "15", expenseDate: new Date().toISOString().split("T")[0],
        paymentMethod: "", reference: "", notes: "",
      });
    },
    onError: (err) => toast.error(err.message),
  });

  const updateStatusMutation = trpc.expenses.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Expense status updated");
      utils.expenses.list.invalidate();
      utils.expenses.getSummary.invalidate();
      setShowMarkPaidDialog(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const amountCents = Math.round(parseFloat(form.amount || "0") * 100);
  const vatPct = parseFloat(form.vatPercentage || "15");
  const vatCents = Math.round(amountCents * (vatPct / 100));
  const totalCents = amountCents + vatCents;

  const handleSubmit = () => {
    if (!form.categoryId || !form.description || !form.amount || !form.expenseDate) {
      toast.error("Please fill in all required fields");
      return;
    }
    createMutation.mutate({
      categoryId: parseInt(form.categoryId),
      houseId: form.houseId ? parseInt(form.houseId) : undefined,
      description: form.description,
      amount: amountCents,
      vatPercentage: vatPct,
      expenseDate: form.expenseDate + " 00:00:00",
      paymentMethod: form.paymentMethod || undefined,
      reference: form.reference || undefined,
      notes: form.notes || undefined,
    });
  };

  const expenseList = expenseData?.expenses || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Expense Tracking</h1>
          <p className="text-muted-foreground text-sm mt-1">Record and manage operational expenses</p>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-2" /> Record Expense
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" /> Total Expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCents(summary?.totalExpenses || 0)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {filterStartDate || filterEndDate ? "Filtered period" : "All time"} · incl. VAT
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatCents(expenseList.filter(e => e.status === "pending").reduce((s, e) => s + e.totalAmount, 0))}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{expenseList.filter(e => e.status === "pending").length} expense(s) awaiting payment</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Overdue</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">
              {formatCents(expenseList.filter(e => e.status === "overdue").reduce((s, e) => s + e.totalAmount, 0))}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{expenseList.filter(e => e.status === "overdue").length} overdue expense(s)</p>
          </CardContent>
        </Card>
      </div>

      {/* Category Breakdown */}
      {summary && summary.totalByCategory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Breakdown by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {summary.totalByCategory.map((cat: any) => (
                <div key={cat.categoryName} className="bg-muted/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">{cat.categoryName}</p>
                  <p className="text-sm font-semibold mt-1">{formatCents(cat.totalAmount || 0)}</p>
                  <p className="text-xs text-muted-foreground">{cat.count} item(s)</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Filter className="h-4 w-4" /> Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} className="w-36 h-9" />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} className="w-36 h-9" />
            </div>
            {(filterStatus || filterStartDate || filterEndDate) && (
              <Button variant="ghost" size="sm" onClick={() => { setFilterStatus(""); setFilterStartDate(""); setFilterEndDate(""); }}>
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Expense Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Expenses ({expenseList.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading expenses...</div>
          ) : expenseList.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <TrendingDown className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>No expenses recorded yet.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowAddDialog(true)}>
                Record your first expense
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount (excl. VAT)</TableHead>
                  <TableHead className="text-right">Total (incl. VAT)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenseList.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell className="text-sm">{expense.expenseDate.split(" ")[0]}</TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">{expense.description}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">—</TableCell>
                    <TableCell className="text-right text-sm">{formatCents(expense.amount)}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{formatCents(expense.totalAmount)}</TableCell>
                    <TableCell>
                      <Badge className={`${STATUS_COLORS[expense.status]} flex items-center gap-1 w-fit text-xs`}>
                        {STATUS_ICONS[expense.status]}
                        {expense.status.charAt(0).toUpperCase() + expense.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {expense.status === "pending" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => setShowMarkPaidDialog(expense.id)}
                        >
                          Mark Paid
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Expense Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Record Expense</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Category <span className="text-red-500">*</span></Label>
                <Select value={form.categoryId} onValueChange={v => setForm(f => ({ ...f, categoryId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {(categories || []).map((cat: any) => (
                      <SelectItem key={cat.id} value={String(cat.id)}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>House (optional)</Label>
                <Select value={form.houseId} onValueChange={v => setForm(f => ({ ...f, houseId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="All houses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No specific house</SelectItem>
                    {(houses || []).map((h: any) => (
                      <SelectItem key={h.id} value={String(h.id)}>{h.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Description <span className="text-red-500">*</span></Label>
              <Input
                placeholder="e.g. Feed delivery - House 1 Starter"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Amount (excl. VAT) <span className="text-red-500">*</span></Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>VAT %</Label>
                <Select value={form.vatPercentage} onValueChange={v => setForm(f => ({ ...f, vatPercentage: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0% (Zero-rated)</SelectItem>
                    <SelectItem value="15">15% (Standard)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Total (incl. VAT)</Label>
                <Input value={totalCents > 0 ? `R${(totalCents / 100).toFixed(2)}` : ""} readOnly className="bg-muted" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Expense Date <span className="text-red-500">*</span></Label>
                <Input
                  type="date"
                  value={form.expenseDate}
                  onChange={e => setForm(f => ({ ...f, expenseDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Payment Method</Label>
                <Select value={form.paymentMethod} onValueChange={v => setForm(f => ({ ...f, paymentMethod: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Reference / Invoice #</Label>
              <Input
                placeholder="e.g. INV-001"
                value={form.reference}
                onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea
                placeholder="Additional notes..."
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Saving..." : "Record Expense"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark Paid Dialog */}
      <Dialog open={showMarkPaidDialog !== null} onOpenChange={() => setShowMarkPaidDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark Expense as Paid</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Payment Date</Label>
              <Input
                type="date"
                value={paymentDate}
                onChange={e => setPaymentDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMarkPaidDialog(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (showMarkPaidDialog !== null) {
                  updateStatusMutation.mutate({
                    expenseId: showMarkPaidDialog,
                    status: "paid",
                    paymentDate: paymentDate + " 00:00:00",
                  });
                }
              }}
              disabled={updateStatusMutation.isPending}
            >
              Confirm Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
