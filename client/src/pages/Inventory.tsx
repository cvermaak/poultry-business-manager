import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Package, MapPin, TrendingDown, Edit, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export default function Inventory() {
  const [activeTab, setActiveTab] = useState("items");
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [transactionDialogOpen, setTransactionDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [selectedStock, setSelectedStock] = useState<any>(null);
  const [transactionType, setTransactionType] = useState<"receipt" | "issue" | "transfer" | "adjustment">("receipt");
  const [itemForm, setItemForm] = useState({
    itemNumber: "",
    primaryClass: "",
    subType: "",
    form: "",
    name: "",
    longDescription: "",
    itemStatus: "active" as "active" | "inactive" | "discontinued" | "obsolete",
    itemType: "stocked_item" as "stocked_item" | "non_stocked" | "service" | "raw_material" | "finished_good" | "consumable",
    barcode: "",
    manufacturerPartNumber: "",
    internalReference: "",
    supplierPartNumber: "",
    brand: "",
    model: "",
    category: "feed" as "feed" | "raw_materials" | "supplies" | "equipment" | "live_birds",
    unit: "",
    currentStock: "",
    reorderPoint: "",
    unitCost: "",
    locationId: "",
  });
  const [locationForm, setLocationForm] = useState({
    name: "",
    locationType: "warehouse" as "warehouse" | "house" | "silo" | "cold_storage" | "other",
    description: "",
  });
  const [transactionForm, setTransactionForm] = useState({
    quantity: "",
    unitCost: "",
    totalCost: "",
    referenceNumber: "",
    notes: "",
    toLocationId: "", // For transfers
    flockId: "", // For issues to flocks
  });

  // Queries
  const { data: items = [], refetch: refetchItems } = trpc.inventory.listItems.useQuery({ isActive: true });
  const { data: locations = [], refetch: refetchLocations } = trpc.inventory.listLocations.useQuery({ isActive: true });
  const { data: stockLevels = [], refetch: refetchStockLevels } = trpc.inventory.getAllStockLevels.useQuery();
  const { data: reorderAlerts = [], refetch: refetchReorderAlerts } = trpc.inventory.getReorderAlerts.useQuery();

  // Mutations
  const createItemMutation = trpc.inventory.createItem.useMutation({
    onSuccess: () => {
      toast.success("Item created successfully");
      setItemDialogOpen(false);
      resetItemForm();
      refetchItems();
      refetchStockLevels(); // Refresh stock levels after creating item with initial stock
    },
    onError: (error) => {
      toast.error(`Failed to create item: ${error.message}`);
    },
  });

  const updateItemMutation = trpc.inventory.updateItem.useMutation({
    onSuccess: () => {
      toast.success("Item updated successfully");
      setItemDialogOpen(false);
      setEditingItem(null);
      resetItemForm();
      refetchItems();
    },
    onError: (error) => {
      toast.error(`Failed to update item: ${error.message}`);
    },
  });

  const deleteItemMutation = trpc.inventory.deleteItem.useMutation({
    onSuccess: () => {
      toast.success("Item deleted successfully");
      refetchItems();
    },
    onError: (error) => {
      toast.error(`Failed to delete item: ${error.message}`);
    },
  });

  const createLocationMutation = trpc.inventory.createLocation.useMutation({
    onSuccess: () => {
      toast.success("Location created successfully");
      setLocationDialogOpen(false);
      resetLocationForm();
      refetchLocations();
    },
    onError: (error) => {
      toast.error(`Failed to create location: ${error.message}`);
    },
  });

  const recordTransactionMutation = trpc.inventory.recordTransaction.useMutation({
    onSuccess: () => {
      toast.success("Stock transaction recorded successfully");
      setTransactionDialogOpen(false);
      resetTransactionForm();
      refetchStockLevels();
      refetchReorderAlerts(); // Refresh reorder alerts after transaction
    },
    onError: (error) => {
      toast.error(`Transaction failed: ${error.message}`);
    },
  });

  const resetItemForm = () => {
    setItemForm({
      itemNumber: "",
      primaryClass: "",
      subType: "",
      form: "",
      name: "",
      longDescription: "",
      itemStatus: "active",
      itemType: "stocked_item",
      barcode: "",
      manufacturerPartNumber: "",
      internalReference: "",
      supplierPartNumber: "",
      brand: "",
      model: "",
      category: "feed",
      unit: "",
      currentStock: "",
      reorderPoint: "",
      unitCost: "",
      locationId: "",
    });
  };

  const resetLocationForm = () => {
    setLocationForm({
      name: "",
      locationType: "warehouse",
      description: "",
    });
  };

  const resetTransactionForm = () => {
    setTransactionForm({
      quantity: "",
      unitCost: "",
      totalCost: "",
      referenceNumber: "",
      notes: "",
      toLocationId: "",
      flockId: "",
    });
  };

  const openTransactionDialog = (stock: any, type: "receipt" | "issue" | "transfer" | "adjustment") => {
    setSelectedStock(stock);
    setTransactionType(type);
    resetTransactionForm();
    setTransactionDialogOpen(true);
  };

  const handleTransaction = () => {
    if (!selectedStock) return;

    const quantity = parseFloat(transactionForm.quantity);
    if (isNaN(quantity) || quantity <= 0) {
      toast.error("Please enter a valid quantity");
      return;
    }

    recordTransactionMutation.mutate({
      itemId: selectedStock.itemId,
      locationId: selectedStock.locationId,
      transactionType,
      quantity,
      unitCost: transactionForm.unitCost ? parseFloat(transactionForm.unitCost) : undefined,
      totalCost: transactionForm.totalCost ? parseFloat(transactionForm.totalCost) : undefined,
      referenceNumber: transactionForm.referenceNumber || undefined,
      notes: transactionForm.notes || undefined,
      transactionDate: new Date(),
      toLocationId: transactionForm.toLocationId ? parseInt(transactionForm.toLocationId) : undefined,
      flockId: transactionForm.flockId ? parseInt(transactionForm.flockId) : undefined,
    });
  };

  const handleCreateItem = () => {
    createItemMutation.mutate({
      primaryClass: itemForm.primaryClass || undefined,
      subType: itemForm.subType || undefined,
      form: itemForm.form || undefined,
      name: itemForm.name,
      longDescription: itemForm.longDescription || undefined,
      itemStatus: itemForm.itemStatus,
      itemType: itemForm.itemType,
      barcode: itemForm.barcode || undefined,
      manufacturerPartNumber: itemForm.manufacturerPartNumber || undefined,
      internalReference: itemForm.internalReference || undefined,
      supplierPartNumber: itemForm.supplierPartNumber || undefined,
      brand: itemForm.brand || undefined,
      model: itemForm.model || undefined,
      category: itemForm.category,
      unit: itemForm.unit,
      currentStock: itemForm.currentStock ? parseFloat(itemForm.currentStock) : 0,
      reorderPoint: itemForm.reorderPoint ? parseFloat(itemForm.reorderPoint) : undefined,
      unitCost: itemForm.unitCost ? Math.round(parseFloat(itemForm.unitCost) * 100) : undefined,
      locationId: itemForm.locationId ? parseInt(itemForm.locationId) : undefined,
    });
  };

  const handleUpdateItem = () => {
    if (!editingItem) return;
    updateItemMutation.mutate({
      id: editingItem.id,
      name: itemForm.name,
      longDescription: itemForm.longDescription || undefined,
      itemStatus: itemForm.itemStatus,
      itemType: itemForm.itemType,
      barcode: itemForm.barcode || undefined,
      manufacturerPartNumber: itemForm.manufacturerPartNumber || undefined,
      internalReference: itemForm.internalReference || undefined,
      supplierPartNumber: itemForm.supplierPartNumber || undefined,
      brand: itemForm.brand || undefined,
      model: itemForm.model || undefined,
      category: itemForm.category,
      unit: itemForm.unit,
      currentStock: itemForm.currentStock ? parseFloat(itemForm.currentStock) : undefined,
      reorderPoint: itemForm.reorderPoint ? parseFloat(itemForm.reorderPoint) : undefined,
      unitCost: itemForm.unitCost ? Math.round(parseFloat(itemForm.unitCost) * 100) : undefined,
    });
  };

  const handleEditItem = (item: any) => {
    setEditingItem(item);
    setItemForm({
      itemNumber: item.itemNumber,
      primaryClass: item.primaryClass || "",
      subType: item.subType || "",
      form: item.form || "",
      name: item.name,
      longDescription: item.longDescription || "",
      itemStatus: item.itemStatus || "active",
      itemType: item.itemType || "stocked_item",
      barcode: item.barcode || "",
      manufacturerPartNumber: item.manufacturerPartNumber || "",
      internalReference: item.internalReference || "",
      supplierPartNumber: item.supplierPartNumber || "",
      brand: item.brand || "",
      model: item.model || "",
      category: item.category,
      unit: item.unit,
      currentStock: item.currentStock || "",
      reorderPoint: item.reorderPoint || "",
      unitCost: item.unitCost ? (item.unitCost / 100).toFixed(2) : "",
    });
    setItemDialogOpen(true);
  };

  const handleDeleteItem = (id: number) => {
    if (confirm("Are you sure you want to delete this item?")) {
      deleteItemMutation.mutate({ id });
    }
  };

  const handleCreateLocation = () => {
    createLocationMutation.mutate(locationForm);
  };

  const getCategoryBadge = (category: string) => {
    const colors: Record<string, string> = {
      feed: "bg-green-100 text-green-800",
      raw_materials: "bg-blue-100 text-blue-800",
      supplies: "bg-purple-100 text-purple-800",
      equipment: "bg-gray-100 text-gray-800",
      live_birds: "bg-yellow-100 text-yellow-800",
    };
    return colors[category] || "bg-gray-100 text-gray-800";
  };

  const getLocationTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      warehouse: "bg-blue-100 text-blue-800",
      house: "bg-green-100 text-green-800",
      silo: "bg-purple-100 text-purple-800",
      cold_storage: "bg-cyan-100 text-cyan-800",
      other: "bg-gray-100 text-gray-800",
    };
    return colors[type] || "bg-gray-100 text-gray-800";
  };

  // Calculate total stock per item
  const itemStockMap = stockLevels.reduce((acc, stock) => {
    if (!acc[stock.itemId!]) {
      acc[stock.itemId!] = {
        total: 0,
        locations: [],
      };
    }
    acc[stock.itemId!].total += parseFloat(stock.quantity || "0");
    acc[stock.itemId!].locations.push({
      locationName: stock.locationName || "Unknown",
      quantity: parseFloat(stock.quantity || "0"),
    });
    return acc;
  }, {} as Record<number, { total: number; locations: Array<{ locationName: string; quantity: number }> }>);

  return (
    <div className="container py-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Inventory Management</h1>
          <p className="text-muted-foreground">Track feed, supplies, equipment, and raw materials across locations</p>
        </div>
      </div>

      {/* Reorder Alerts */}
      {reorderAlerts.length > 0 && (
        <Card className="mb-6 border-orange-200 bg-orange-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-800">
              <AlertTriangle className="h-5 w-5" />
              Reorder Alerts ({reorderAlerts.length})
            </CardTitle>
            <CardDescription className="text-orange-700">Items below reorder point</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {reorderAlerts.map((alert) => (
                <div key={alert.itemId} className="flex justify-between items-center p-3 bg-white rounded-lg">
                  <div>
                    <p className="font-medium">{alert.itemName}</p>
                    <p className="text-sm text-muted-foreground">
                      {alert.itemNumber} • {alert.category}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-orange-600">
                      Stock: {parseFloat(alert.totalStock || "0").toFixed(2)} {alert.unit}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Reorder at: {parseFloat(alert.reorderPoint || "0").toFixed(2)} {alert.unit}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="items">
            <Package className="h-4 w-4 mr-2" />
            Items
          </TabsTrigger>
          <TabsTrigger value="stock">
            <TrendingDown className="h-4 w-4 mr-2" />
            Stock Levels
          </TabsTrigger>
          <TabsTrigger value="locations">
            <MapPin className="h-4 w-4 mr-2" />
            Locations
          </TabsTrigger>
        </TabsList>

        {/* Items Tab */}
        <TabsContent value="items">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Inventory Items</CardTitle>
                  <CardDescription>Manage your inventory catalog</CardDescription>
                </div>
                <Button onClick={() => { resetItemForm(); setEditingItem(null); setItemDialogOpen(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item Number</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Barcode</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Total Stock</TableHead>
                    <TableHead>Unit Cost</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const stock = itemStockMap[item.id] || { total: 0, locations: [] };
                    const reorderPoint = parseFloat(item.reorderPoint || "0");
                    const isLowStock = reorderPoint > 0 && stock.total < reorderPoint;

                    return (
                      <TableRow key={item.id} className={isLowStock ? "bg-orange-50" : ""}>
                        <TableCell className="font-medium">{item.itemNumber}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{item.name}</p>
                            {item.longDescription && (
                              <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                {item.longDescription}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={
                              item.itemStatus === "active"
                                ? "bg-green-100 text-green-800"
                                : item.itemStatus === "inactive"
                                ? "bg-gray-100 text-gray-800"
                                : item.itemStatus === "discontinued"
                                ? "bg-orange-100 text-orange-800"
                                : "bg-red-100 text-red-800"
                            }
                          >
                            {item.itemStatus || "active"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {item.itemType?.replace("_", " ") || "stocked item"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge className={getCategoryBadge(item.category)}>
                            {item.category.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-mono">{item.barcode || "-"}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{item.brand || "-"}</span>
                        </TableCell>
                        <TableCell>
                          {stock.total.toFixed(2)} {item.unit}
                          {isLowStock && <AlertTriangle className="inline h-4 w-4 ml-2 text-orange-500" />}
                        </TableCell>
                        <TableCell>
                          {item.unitCost ? `R${(item.unitCost / 100).toFixed(2)}` : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => handleEditItem(item)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteItem(item.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Stock Levels Tab */}
        <TabsContent value="stock">
          <Card>
            <CardHeader>
              <CardTitle>Stock Levels by Location</CardTitle>
              <CardDescription>View inventory quantities across all locations</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockLevels.map((stock) => (
                    <TableRow key={stock.itemId + "-" + stock.locationId}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{stock.itemName}</p>
                          <p className="text-sm text-muted-foreground">{stock.itemNumber}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getCategoryBadge(stock.category || "")}>
                          {stock.category?.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{stock.locationName}</p>
                          <Badge className={getLocationTypeBadge(stock.locationType || "")} variant="outline">
                            {stock.locationType?.replace("_", " ")}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        {parseFloat(stock.quantity || "0").toFixed(2)} {stock.unit}
                      </TableCell>
                      <TableCell>
                        {stock.lastUpdated ? new Date(stock.lastUpdated).toLocaleDateString() : "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openTransactionDialog(stock, "receipt")}
                            title="Receive Stock"
                          >
                            📥 Receive
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openTransactionDialog(stock, "issue")}
                            title="Issue Stock"
                          >
                            📤 Issue
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openTransactionDialog(stock, "transfer")}
                            title="Transfer Stock"
                          >
                            🔄 Transfer
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Locations Tab */}
        <TabsContent value="locations">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Storage Locations</CardTitle>
                  <CardDescription>Manage warehouses, silos, and storage facilities</CardDescription>
                </div>
                <Button onClick={() => { resetLocationForm(); setLocationDialogOpen(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Location
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {locations.map((location) => (
                  <Card key={location.id}>
                    <CardHeader>
                      <CardTitle className="text-lg">{location.name}</CardTitle>
                      <Badge className={getLocationTypeBadge(location.locationType)}>
                        {location.locationType.replace("_", " ")}
                      </Badge>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{location.description || "No description"}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Item Dialog */}
      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Item" : "Add New Item"}</DialogTitle>
            <DialogDescription>
              {editingItem ? "Update item details" : "Add a new item to your inventory catalog"}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto space-y-6">
            {/* SKU Generation */}
            {!editingItem && (
              <div className="border-b pb-4">
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground">SKU Generation</h3>
                <div className="grid grid-cols-3 gap-4 mb-3">
                  <div className="space-y-2">
                    <Label htmlFor="primaryClass">Primary Class *</Label>
                    <Select 
                      value={itemForm.primaryClass} 
                      onValueChange={(value) => setItemForm({ ...itemForm, primaryClass: value, subType: "" })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select class" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FD">FD - Feed</SelectItem>
                        <SelectItem value="RM">RM - Raw Materials</SelectItem>
                        <SelectItem value="MD">MD - Medication</SelectItem>
                        <SelectItem value="VX">VX - Vaccine</SelectItem>
                        <SelectItem value="DS">DS - Disinfectant</SelectItem>
                        <SelectItem value="BD">BD - Birds</SelectItem>
                        <SelectItem value="LT">LT - Litter/Bedding</SelectItem>
                        <SelectItem value="PK">PK - Packaging</SelectItem>
                        <SelectItem value="EQ">EQ - Equipment</SelectItem>
                        <SelectItem value="SP">SP - Spare Parts</SelectItem>
                        <SelectItem value="CL">CL - Cleaning Supplies</SelectItem>
                        <SelectItem value="AD">AD - Additives</SelectItem>
                        <SelectItem value="VT">VT - Veterinary Consumables</SelectItem>
                        <SelectItem value="UT">UT - Utilities Consumables</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subType">Sub-Type *</Label>
                    <Select 
                      value={itemForm.subType} 
                      onValueChange={(value) => setItemForm({ ...itemForm, subType: value })}
                      disabled={!itemForm.primaryClass}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select sub-type" />
                      </SelectTrigger>
                      <SelectContent>
                        {itemForm.primaryClass === "FD" && (
                          <>
                            <SelectItem value="ST">ST - Starter</SelectItem>
                            <SelectItem value="GR">GR - Grower</SelectItem>
                            <SelectItem value="FN">FN - Finisher</SelectItem>
                            <SelectItem value="PR">PR - Pre-starter</SelectItem>
                            <SelectItem value="LY">LY - Layer Mash</SelectItem>
                            <SelectItem value="BR">BR - Breeder</SelectItem>
                            <SelectItem value="CR">CR - Crumble</SelectItem>
                            <SelectItem value="WS">WS - Wheat/Straight</SelectItem>
                          </>
                        )}
                        {itemForm.primaryClass === "MD" && (
                          <>
                            <SelectItem value="AB">AB - Antibiotic</SelectItem>
                            <SelectItem value="CC">CC - Coccidiostat</SelectItem>
                            <SelectItem value="VT">VT - Vitamin</SelectItem>
                            <SelectItem value="EL">EL - Electrolyte</SelectItem>
                            <SelectItem value="DP">DP - Dewormer</SelectItem>
                          </>
                        )}
                        {itemForm.primaryClass === "VX" && (
                          <>
                            <SelectItem value="ND">ND - Newcastle</SelectItem>
                            <SelectItem value="IB">IB - Infectious Bronchitis</SelectItem>
                            <SelectItem value="IBD">IBD - Gumboro</SelectItem>
                            <SelectItem value="MG">MG - Mycoplasma</SelectItem>
                            <SelectItem value="AI">AI - Avian Influenza</SelectItem>
                          </>
                        )}
                        {itemForm.primaryClass === "BD" && (
                          <>
                            <SelectItem value="BR">BR - Broiler Chicks</SelectItem>
                            <SelectItem value="PL">PL - Pullets</SelectItem>
                            <SelectItem value="LY">LY - Layers</SelectItem>
                          </>
                        )}
                        {itemForm.primaryClass && !["FD", "MD", "VX", "BD"].includes(itemForm.primaryClass) && (
                          <SelectItem value="GN">GN - General</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="form">Form *</Label>
                    <Select 
                      value={itemForm.form} 
                      onValueChange={(value) => setItemForm({ ...itemForm, form: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select form" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="P">P - Pellet</SelectItem>
                        <SelectItem value="C">C - Crumble</SelectItem>
                        <SelectItem value="M">M - Mash</SelectItem>
                        <SelectItem value="L">L - Liquid</SelectItem>
                        <SelectItem value="S">S - Soluble Powder</SelectItem>
                        <SelectItem value="G">G - Granule</SelectItem>
                        <SelectItem value="D">D - Dust/Powder</SelectItem>
                        <SelectItem value="INJ">INJ - Injectable</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {itemForm.primaryClass && itemForm.subType && itemForm.form && (
                  <div className="bg-muted/50 p-3 rounded-md">
                    <p className="text-sm text-muted-foreground">Generated SKU Preview:</p>
                    <p className="text-lg font-mono font-semibold text-primary">
                      {itemForm.primaryClass}-{itemForm.subType}-{itemForm.form}-###
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Sequential number will be auto-assigned on creation
                    </p>
                  </div>
                )}
              </div>
            )}
            {editingItem && (
              <div className="border-b pb-4">
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground">SKU (Immutable)</h3>
                <div className="bg-muted/30 p-3 rounded-md">
                  <p className="text-lg font-mono font-semibold">{itemForm.itemNumber}</p>
                  <p className="text-xs text-muted-foreground mt-1">Item number cannot be changed after creation</p>
                </div>
              </div>
            )}

            {/* Basic Information */}
            <div>
              <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Basic Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={itemForm.name}
                    onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                    placeholder="Starter Feed Premium"
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="longDescription">Long Description</Label>
                  <textarea
                    id="longDescription"
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={itemForm.longDescription}
                    onChange={(e) => setItemForm({ ...itemForm, longDescription: e.target.value })}
                    placeholder="Detailed description of the item..."
                  />
                </div>
              </div>
            </div>

            {/* Item Classification */}
            <div>
              <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Classification</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="itemStatus">Item Status</Label>
                  <Select value={itemForm.itemStatus} onValueChange={(value: any) => setItemForm({ ...itemForm, itemStatus: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="discontinued">Discontinued</SelectItem>
                      <SelectItem value="obsolete">Obsolete</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="itemType">Item Type</Label>
                  <Select value={itemForm.itemType} onValueChange={(value: any) => setItemForm({ ...itemForm, itemType: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stocked_item">Stocked Item</SelectItem>
                      <SelectItem value="non_stocked">Non-Stocked</SelectItem>
                      <SelectItem value="service">Service</SelectItem>
                      <SelectItem value="raw_material">Raw Material</SelectItem>
                      <SelectItem value="finished_good">Finished Good</SelectItem>
                      <SelectItem value="consumable">Consumable</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Category *</Label>
                  <Select value={itemForm.category} onValueChange={(value: any) => setItemForm({ ...itemForm, category: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="feed">Feed</SelectItem>
                      <SelectItem value="raw_materials">Raw Materials</SelectItem>
                      <SelectItem value="supplies">Supplies</SelectItem>
                      <SelectItem value="equipment">Equipment</SelectItem>
                      <SelectItem value="live_birds">Live Birds</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unit">Unit *</Label>
                  <Input
                    id="unit"
                    value={itemForm.unit}
                    onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })}
                    placeholder="kg, bags, liters"
                  />
                </div>
              </div>
            </div>

            {/* External Identifiers */}
            <div>
              <h3 className="text-sm font-semibold mb-3 text-muted-foreground">External Identifiers</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="barcode">Barcode</Label>
                  <Input
                    id="barcode"
                    value={itemForm.barcode}
                    onChange={(e) => setItemForm({ ...itemForm, barcode: e.target.value })}
                    placeholder="Scan or enter barcode"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manufacturerPartNumber">Manufacturer Part Number</Label>
                  <Input
                    id="manufacturerPartNumber"
                    value={itemForm.manufacturerPartNumber}
                    onChange={(e) => setItemForm({ ...itemForm, manufacturerPartNumber: e.target.value })}
                    placeholder="MPN-12345"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="supplierPartNumber">Supplier Part Number</Label>
                  <Input
                    id="supplierPartNumber"
                    value={itemForm.supplierPartNumber}
                    onChange={(e) => setItemForm({ ...itemForm, supplierPartNumber: e.target.value })}
                    placeholder="SPN-67890"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="internalReference">Internal Reference</Label>
                  <Input
                    id="internalReference"
                    value={itemForm.internalReference}
                    onChange={(e) => setItemForm({ ...itemForm, internalReference: e.target.value })}
                    placeholder="Internal code"
                  />
                </div>
              </div>
            </div>

            {/* Product Details */}
            <div>
              <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Product Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="brand">Brand</Label>
                  <Input
                    id="brand"
                    value={itemForm.brand}
                    onChange={(e) => setItemForm({ ...itemForm, brand: e.target.value })}
                    placeholder="AFGRO, Epol, etc."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="model">Model</Label>
                  <Input
                    id="model"
                    value={itemForm.model}
                    onChange={(e) => setItemForm({ ...itemForm, model: e.target.value })}
                    placeholder="Model number or name"
                  />
                </div>
              </div>
            </div>

            {/* Inventory Management */}
            <div>
              <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Inventory Management</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="currentStock">Current Stock *</Label>
                  <Input
                    id="currentStock"
                    type="number"
                    step="0.01"
                    value={itemForm.currentStock}
                    onChange={(e) => setItemForm({ ...itemForm, currentStock: e.target.value })}
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground">Quantity on hand</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="locationId">Stock Location *</Label>
                  <Select
                    value={itemForm.locationId}
                    onValueChange={(value) => setItemForm({ ...itemForm, locationId: value })}
                  >
                    <SelectTrigger id="locationId">
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((loc: any) => (
                        <SelectItem key={loc.id} value={loc.id.toString()}>
                          {loc.name} ({loc.locationType})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Where stock is stored</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reorderPoint">Reorder Point</Label>
                  <Input
                    id="reorderPoint"
                    type="number"
                    step="0.01"
                    value={itemForm.reorderPoint}
                    onChange={(e) => setItemForm({ ...itemForm, reorderPoint: e.target.value })}
                    placeholder="100"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unitCost">Unit Cost (R)</Label>
                  <Input
                    id="unitCost"
                    type="number"
                    step="0.01"
                    value={itemForm.unitCost}
                    onChange={(e) => setItemForm({ ...itemForm, unitCost: e.target.value })}
                    placeholder="25.50"
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setItemDialogOpen(false); setEditingItem(null); }}>
              Cancel
            </Button>
            <Button onClick={editingItem ? handleUpdateItem : handleCreateItem}>
              {editingItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Location Dialog */}
      <Dialog open={locationDialogOpen} onOpenChange={setLocationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Location</DialogTitle>
            <DialogDescription>Create a new storage location</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="locationName">Location Name</Label>
              <Input
                id="locationName"
                value={locationForm.name}
                onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })}
                placeholder="Main Warehouse"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="locationType">Location Type</Label>
              <Select value={locationForm.locationType} onValueChange={(value: any) => setLocationForm({ ...locationForm, locationType: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="warehouse">Warehouse</SelectItem>
                  <SelectItem value="house">House</SelectItem>
                  <SelectItem value="silo">Silo</SelectItem>
                  <SelectItem value="cold_storage">Cold Storage</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="locationDescription">Description (optional)</Label>
              <Input
                id="locationDescription"
                value={locationForm.description}
                onChange={(e) => setLocationForm({ ...locationForm, description: e.target.value })}
                placeholder="Primary storage facility"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLocationDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateLocation}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transaction Dialog */}
      <Dialog open={transactionDialogOpen} onOpenChange={setTransactionDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {transactionType === "receipt" && "📥 Receive Stock"}
              {transactionType === "issue" && "📤 Issue Stock"}
              {transactionType === "transfer" && "🔄 Transfer Stock"}
              {transactionType === "adjustment" && "✏️ Adjust Stock"}
            </DialogTitle>
            <DialogDescription>
              {selectedStock && (
                <div className="space-y-1">
                  <p><strong>Item:</strong> {selectedStock.itemName} ({selectedStock.itemNumber})</p>
                  <p><strong>Location:</strong> {selectedStock.locationName}</p>
                  <p><strong>Current Stock:</strong> {parseFloat(selectedStock.quantity || "0").toFixed(2)} {selectedStock.unit}</p>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Quantity */}
            <div>
              <Label htmlFor="quantity">Quantity *</Label>
              <Input
                id="quantity"
                type="number"
                step="0.01"
                placeholder="Enter quantity"
                value={transactionForm.quantity}
                onChange={(e) => setTransactionForm({ ...transactionForm, quantity: e.target.value })}
              />
            </div>

            {/* Transfer: To Location */}
            {transactionType === "transfer" && (
              <div>
                <Label htmlFor="toLocation">To Location *</Label>
                <Select
                  value={transactionForm.toLocationId}
                  onValueChange={(value) => setTransactionForm({ ...transactionForm, toLocationId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select destination" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations
                      .filter((loc) => loc.id !== selectedStock?.locationId)
                      .map((loc) => (
                        <SelectItem key={loc.id} value={loc.id.toString()}>
                          {loc.name} ({loc.locationType})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Receipt: Unit Cost */}
            {transactionType === "receipt" && (
              <div>
                <Label htmlFor="unitCost">Unit Cost</Label>
                <Input
                  id="unitCost"
                  type="number"
                  step="0.01"
                  placeholder="Cost per unit"
                  value={transactionForm.unitCost}
                  onChange={(e) => setTransactionForm({ ...transactionForm, unitCost: e.target.value })}
                />
              </div>
            )}

            {/* Reference Number */}
            <div>
              <Label htmlFor="referenceNumber">Reference Number</Label>
              <Input
                id="referenceNumber"
                placeholder="PO#, Invoice#, etc."
                value={transactionForm.referenceNumber}
                onChange={(e) => setTransactionForm({ ...transactionForm, referenceNumber: e.target.value })}
              />
            </div>

            {/* Notes */}
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                placeholder="Additional information"
                value={transactionForm.notes}
                onChange={(e) => setTransactionForm({ ...transactionForm, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransactionDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleTransaction} disabled={recordTransactionMutation.isPending}>
              {recordTransactionMutation.isPending ? "Processing..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
