import { useState, useMemo } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, TrendingUp, TrendingDown, DollarSign, Calendar, ArrowUpRight, ArrowDownRight } from "lucide-react";

function formatCents(cents: number): string {
  return `R${(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const INCOME_CATEGORIES = [
  "Client Payment",
  "AFGRO Collection Payment",
  "Other Income",
];

const EXPENSE_CATEGORIES = [
  "Chicks",
  "Feed - Starter",
  "Feed - Grower",
  "Feed - Finisher",
  "Feed Delivery",
  "House Cleaning",
  "Chick Vaccine",
  "Coal",
  "Bedding",
  "Labour",
  "Power",
  "Rental",
  "Other Expense",
];

// Pre-built forecast from the operational parameters
const OPERATIONAL_PARAMS = {
  chicksPerHouse: 15000,
  chickCostPerChick: 826, // R8.26 in cents
  houseCleaning: 391304,
  chickVaccine: 450000,
  coal: 784000,
  bedding: 560000,
  feedDelivery: 1028100,
  feedStarter: 9865260,
  feedGrower: 11915280,
  feedFinisher: 6999408,
  rental: 1739130,
  labourMonthly: 3645440,
  powerMonthly: 680000,
};

// Client payment schedule (in cents)
const CLIENT_PAYMENT_SCHEDULE = [
  { date: "2026-02-09", amount: 150000000, description: "Advance - Cycle 1 Houses 1 & 2" },
  { date: "2026-03-09", amount: 118800000, description: "Advance - Cycle 1 Houses 5 & 6" },
  { date: "2026-04-06", amount: 118800000, description: "Advance - Cycle 2 Houses 3 & 4" },
  { date: "2026-05-04", amount: 118800000, description: "Advance - Cycle 3 Houses 1 & 2" },
  { date: "2026-06-01", amount: 118800000, description: "Advance - Cycle 3 Houses 5 & 6" },
  { date: "2026-06-29", amount: 118800000, description: "Advance - Cycle 4 Houses 3 & 4" },
  { date: "2026-07-27", amount: 118800000, description: "Advance - Cycle 5 Houses 1 & 2" },
  { date: "2026-08-24", amount: 118800000, description: "Advance - Cycle 5 Houses 5 & 6" },
  { date: "2026-09-21", amount: 118800000, description: "Advance - Cycle 6 Houses 3 & 4" },
  { date: "2026-10-19", amount: 118800000, description: "Advance - Cycle 7 Houses 1 & 2" },
  { date: "2026-11-16", amount: 118800000, description: "Advance - Cycle 7 Houses 5 & 6" },
  { date: "2026-12-14", amount: 118800000, description: "Advance - Cycle 8 Houses 3 & 4" },
];

export default function CashFlow() {
  const utils = trpc.useUtils();

  const [selectedForecastId, setSelectedForecastId] = useState<number | null>(null);
  const [showNewForecastDialog, setShowNewForecastDialog] = useState(false);
  const [showAddItemDialog, setShowAddItemDialog] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  // New forecast form
  const [forecastForm, setForecastForm] = useState({
    startDate: new Date().toISOString().split("T")[0],
    endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    notes: "",
  });

  // New item form
  const [itemForm, setItemForm] = useState({
    itemDate: new Date().toISOString().split("T")[0],
    itemType: "expense" as "income" | "expense",
    category: "",
    description: "",
    amount: "",
    notes: "",
  });

  const { data: forecasts, isLoading: forecastsLoading } = trpc.cashFlow.listForecasts.useQuery({ limit: 20 });
  const { data: forecastDetail } = trpc.cashFlow.getForecast.useQuery(
    { forecastId: selectedForecastId! },
    { enabled: selectedForecastId !== null }
  );
  const { data: summary } = trpc.cashFlow.getSummary.useQuery(
    { forecastId: selectedForecastId! },
    { enabled: selectedForecastId !== null }
  );

  const createForecastMutation = trpc.cashFlow.createForecast.useMutation({
    onSuccess: (data: any) => {
      toast.success("Cash flow forecast created");
      utils.cashFlow.listForecasts.invalidate();
      setShowNewForecastDialog(false);
      if (data?.insertId) setSelectedForecastId(data.insertId);
    },
    onError: (err) => toast.error(err.message),
  });

  const addItemMutation = trpc.cashFlow.addItem.useMutation({
    onSuccess: () => {
      toast.success("Item added to forecast");
      utils.cashFlow.getForecast.invalidate({ forecastId: selectedForecastId! });
      utils.cashFlow.getSummary.invalidate({ forecastId: selectedForecastId! });
      setShowAddItemDialog(false);
      setItemForm({ itemDate: new Date().toISOString().split("T")[0], itemType: "expense", category: "", description: "", amount: "", notes: "" });
    },
    onError: (err) => toast.error(err.message),
  });

  // Group items by month for the monthly view
  const monthlyData = useMemo(() => {
    if (!forecastDetail?.items) return [];
    const byMonth: Record<string, { income: number; expense: number; items: any[] }> = {};
    for (const item of forecastDetail.items) {
      const month = item.itemDate.split(" ")[0].slice(0, 7);
      if (!byMonth[month]) byMonth[month] = { income: 0, expense: 0, items: [] };
      if (item.itemType === "income") byMonth[month].income += item.amount;
      else byMonth[month].expense += item.amount;
      byMonth[month].items.push(item);
    }
    return Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([month, data]) => ({
      month,
      ...data,
      net: data.income - data.expense,
    }));
  }, [forecastDetail]);

  const handleCreateForecast = () => {
    if (!forecastForm.startDate || !forecastForm.endDate) {
      toast.error("Please set start and end dates");
      return;
    }
    createForecastMutation.mutate({
      startDate: forecastForm.startDate + " 00:00:00",
      endDate: forecastForm.endDate + " 00:00:00",
      notes: forecastForm.notes || undefined,
    });
  };

  const handleAddItem = () => {
    if (!itemForm.category || !itemForm.description || !itemForm.amount || !selectedForecastId) {
      toast.error("Please fill in all required fields");
      return;
    }
    addItemMutation.mutate({
      forecastId: selectedForecastId,
      itemDate: itemForm.itemDate + " 00:00:00",
      itemType: itemForm.itemType,
      category: itemForm.category,
      description: itemForm.description,
      amount: Math.round(parseFloat(itemForm.amount) * 100),
      notes: itemForm.notes || undefined,
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cash Flow Forecasting</h1>
          <p className="text-muted-foreground text-sm mt-1">Plan and track projected income and expenses</p>
        </div>
        <Button onClick={() => setShowNewForecastDialog(true)}>
          <Plus className="h-4 w-4 mr-2" /> New Forecast
        </Button>
      </div>

      {/* Operational Parameters Reference */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-blue-800 flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Operational Reference — Cost per House (excl. VAT)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div><span className="text-muted-foreground">Chicks (15,000):</span> <span className="font-medium">R123,900</span></div>
            <div><span className="text-muted-foreground">Feed - Starter:</span> <span className="font-medium">R98,652.60</span></div>
            <div><span className="text-muted-foreground">Feed - Grower:</span> <span className="font-medium">R119,152.80</span></div>
            <div><span className="text-muted-foreground">Feed - Finisher:</span> <span className="font-medium">R69,994.08</span></div>
            <div><span className="text-muted-foreground">Feed Delivery:</span> <span className="font-medium">R10,281</span></div>
            <div><span className="text-muted-foreground">Rental:</span> <span className="font-medium">R17,391.30</span></div>
            <div><span className="text-muted-foreground">Labour (monthly):</span> <span className="font-medium">R36,454.40</span></div>
            <div><span className="text-muted-foreground">Power (monthly):</span> <span className="font-medium">R6,800</span></div>
          </div>
          <div className="mt-2 pt-2 border-t border-blue-200 text-xs text-blue-700">
            Client payment schedule: R1,500,000 initial (09 Feb 2026), then R1,188,000 every 4 weeks for subsequent house pairs.
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Forecast List */}
        <div className="lg:col-span-1 space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Forecasts</h2>
          {forecastsLoading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : !forecasts?.length ? (
            <div className="text-sm text-muted-foreground bg-muted/40 rounded-lg p-4 text-center">
              No forecasts yet. Create one to get started.
            </div>
          ) : (
            (forecasts || []).map((f: any) => (
              <button
                key={f.id}
                onClick={() => setSelectedForecastId(f.id)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedForecastId === f.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}
              >
                <p className="text-sm font-medium">
                  {f.startDate.split(" ")[0]} → {f.endDate.split(" ")[0]}
                </p>
                {f.notes && <p className="text-xs text-muted-foreground mt-1 truncate">{f.notes}</p>}
              </button>
            ))
          )}
        </div>

        {/* Forecast Detail */}
        <div className="lg:col-span-3">
          {!selectedForecastId ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground bg-muted/20 rounded-lg border-2 border-dashed">
              <DollarSign className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">Select a forecast or create a new one</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary Cards */}
              {summary && (
                <div className="grid grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-green-600 mb-1">
                        <ArrowUpRight className="h-4 w-4" />
                        <span className="text-xs font-medium">Total Income</span>
                      </div>
                      <p className="text-xl font-bold text-green-700">{formatCents(summary.totalIncome)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-red-600 mb-1">
                        <ArrowDownRight className="h-4 w-4" />
                        <span className="text-xs font-medium">Total Expenses</span>
                      </div>
                      <p className="text-xl font-bold text-red-700">{formatCents(summary.totalExpense)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className={`flex items-center gap-2 mb-1 ${summary.netCashFlow >= 0 ? "text-blue-600" : "text-orange-600"}`}>
                        {summary.netCashFlow >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                        <span className="text-xs font-medium">Net Cash Flow</span>
                      </div>
                      <p className={`text-xl font-bold ${summary.netCashFlow >= 0 ? "text-blue-700" : "text-orange-700"}`}>
                        {formatCents(summary.netCashFlow)}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              )}

              <div className="flex justify-end">
                <Button size="sm" onClick={() => setShowAddItemDialog(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Add Item
                </Button>
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                  <TabsTrigger value="overview">Monthly Overview</TabsTrigger>
                  <TabsTrigger value="items">All Items</TabsTrigger>
                  <TabsTrigger value="schedule">Client Schedule</TabsTrigger>
                </TabsList>

                <TabsContent value="overview">
                  {monthlyData.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">No items in this forecast yet.</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Month</TableHead>
                          <TableHead className="text-right text-green-700">Income</TableHead>
                          <TableHead className="text-right text-red-700">Expenses</TableHead>
                          <TableHead className="text-right">Net</TableHead>
                          <TableHead className="text-right">Items</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {monthlyData.map((row) => (
                          <TableRow key={row.month}>
                            <TableCell className="font-medium">{row.month}</TableCell>
                            <TableCell className="text-right text-green-700">{formatCents(row.income)}</TableCell>
                            <TableCell className="text-right text-red-700">{formatCents(row.expense)}</TableCell>
                            <TableCell className={`text-right font-semibold ${row.net >= 0 ? "text-blue-700" : "text-orange-700"}`}>
                              {row.net >= 0 ? "+" : ""}{formatCents(row.net)}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">{row.items.length}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>

                <TabsContent value="items">
                  {!forecastDetail?.items?.length ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">No items yet. Add income or expense items to this forecast.</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {forecastDetail.items.map((item: any) => (
                          <TableRow key={item.id}>
                            <TableCell className="text-sm">{item.itemDate.split(" ")[0]}</TableCell>
                            <TableCell>
                              <Badge className={item.itemType === "income" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                                {item.itemType === "income" ? "Income" : "Expense"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{item.category}</TableCell>
                            <TableCell className="text-sm">{item.description}</TableCell>
                            <TableCell className={`text-right text-sm font-medium ${item.itemType === "income" ? "text-green-700" : "text-red-700"}`}>
                              {item.itemType === "income" ? "+" : "-"}{formatCents(item.amount)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>

                <TabsContent value="schedule">
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground mb-3">
                      Reference client payment schedule based on operational parameters. Use "Add Item" to include these in your forecast.
                    </p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Amount (excl. VAT)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {CLIENT_PAYMENT_SCHEDULE.map((p) => (
                          <TableRow key={p.date}>
                            <TableCell className="text-sm font-medium">{p.date}</TableCell>
                            <TableCell className="text-sm">{p.description}</TableCell>
                            <TableCell className="text-right text-sm font-semibold text-green-700">{formatCents(p.amount)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </div>

      {/* New Forecast Dialog */}
      <Dialog open={showNewForecastDialog} onOpenChange={setShowNewForecastDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Cash Flow Forecast</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Start Date <span className="text-red-500">*</span></Label>
                <Input
                  type="date"
                  value={forecastForm.startDate}
                  onChange={e => setForecastForm(f => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>End Date <span className="text-red-500">*</span></Label>
                <Input
                  type="date"
                  value={forecastForm.endDate}
                  onChange={e => setForecastForm(f => ({ ...f, endDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea
                placeholder="e.g. Q1 2026 operational forecast"
                value={forecastForm.notes}
                onChange={e => setForecastForm(f => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewForecastDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateForecast} disabled={createForecastMutation.isPending}>
              {createForecastMutation.isPending ? "Creating..." : "Create Forecast"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Item Dialog */}
      <Dialog open={showAddItemDialog} onOpenChange={setShowAddItemDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Cash Flow Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Date <span className="text-red-500">*</span></Label>
                <Input
                  type="date"
                  value={itemForm.itemDate}
                  onChange={e => setItemForm(f => ({ ...f, itemDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Type <span className="text-red-500">*</span></Label>
                <Select value={itemForm.itemType} onValueChange={v => setItemForm(f => ({ ...f, itemType: v as "income" | "expense", category: "" }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">Income</SelectItem>
                    <SelectItem value="expense">Expense</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Category <span className="text-red-500">*</span></Label>
              <Select value={itemForm.category} onValueChange={v => setItemForm(f => ({ ...f, category: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {(itemForm.itemType === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Description <span className="text-red-500">*</span></Label>
              <Input
                placeholder="e.g. Client payment - Houses 1 & 2"
                value={itemForm.description}
                onChange={e => setItemForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <Label>Amount (R) <span className="text-red-500">*</span></Label>
              <Input
                type="number"
                placeholder="0.00"
                value={itemForm.amount}
                onChange={e => setItemForm(f => ({ ...f, amount: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea
                placeholder="Additional notes..."
                value={itemForm.notes}
                onChange={e => setItemForm(f => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddItemDialog(false)}>Cancel</Button>
            <Button onClick={handleAddItem} disabled={addItemMutation.isPending}>
              {addItemMutation.isPending ? "Adding..." : "Add Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
