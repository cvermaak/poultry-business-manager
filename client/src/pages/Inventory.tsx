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
  const [editingItem, setEditingItem] = useState<any>(null);
  const [itemForm, setItemForm] = useState({
    itemNumber: "",
    name: "",
    category: "feed" as "feed" | "raw_materials" | "supplies" | "equipment" | "live_birds",
    unit: "",
    reorderPoint: "",
    unitCost: "",
  });
  const [locationForm, setLocationForm] = useState({
    name: "",
    locationType: "warehouse" as "warehouse" | "house" | "silo" | "cold_storage" | "other",
    description: "",
  });

  // Queries
  const { data: items = [], refetch: refetchItems } = trpc.inventory.listItems.useQuery({ isActive: true });
  const { data: locations = [], refetch: refetchLocations } = trpc.inventory.listLocations.useQuery({ isActive: true });
  const { data: stockLevels = [] } = trpc.inventory.getAllStockLevels.useQuery();
  const { data: reorderAlerts = [] } = trpc.inventory.getReorderAlerts.useQuery();

  // Mutations
  const createItemMutation = trpc.inventory.createItem.useMutation({
    onSuccess: () => {
      toast.success("Item created successfully");
      setItemDialogOpen(false);
      resetItemForm();
      refetchItems();
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

  const resetItemForm = () => {
    setItemForm({
      itemNumber: "",
      name: "",
      category: "feed",
      unit: "",
      reorderPoint: "",
      unitCost: "",
    });
  };

  const resetLocationForm = () => {
    setLocationForm({
      name: "",
      locationType: "warehouse",
      description: "",
    });
  };

  const handleCreateItem = () => {
    createItemMutation.mutate({
      itemNumber: itemForm.itemNumber,
      name: itemForm.name,
      category: itemForm.category,
      unit: itemForm.unit,
      reorderPoint: itemForm.reorderPoint ? parseFloat(itemForm.reorderPoint) : undefined,
      unitCost: itemForm.unitCost ? Math.round(parseFloat(itemForm.unitCost) * 100) : undefined,
    });
  };

  const handleUpdateItem = () => {
    if (!editingItem) return;
    updateItemMutation.mutate({
      id: editingItem.id,
      name: itemForm.name,
      category: itemForm.category,
      unit: itemForm.unit,
      reorderPoint: itemForm.reorderPoint ? parseFloat(itemForm.reorderPoint) : undefined,
      unitCost: itemForm.unitCost ? Math.round(parseFloat(itemForm.unitCost) * 100) : undefined,
    });
  };

  const handleEditItem = (item: any) => {
    setEditingItem(item);
    setItemForm({
      itemNumber: item.itemNumber,
      name: item.name,
      category: item.category,
      unit: item.unit,
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
      locationName: stock.locationName,
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
                    <TableHead>Category</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Total Stock</TableHead>
                    <TableHead>Reorder Point</TableHead>
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
                        <TableCell>{item.name}</TableCell>
                        <TableCell>
                          <Badge className={getCategoryBadge(item.category)}>
                            {item.category.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>{item.unit}</TableCell>
                        <TableCell>
                          {stock.total.toFixed(2)} {item.unit}
                          {isLowStock && <AlertTriangle className="inline h-4 w-4 ml-2 text-orange-500" />}
                        </TableCell>
                        <TableCell>
                          {reorderPoint > 0 ? `${reorderPoint.toFixed(2)} ${item.unit}` : "-"}
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
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="itemNumber">Item Number</Label>
              <Input
                id="itemNumber"
                value={itemForm.itemNumber}
                onChange={(e) => setItemForm({ ...itemForm, itemNumber: e.target.value })}
                disabled={!!editingItem}
                placeholder="FEED-001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={itemForm.name}
                onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                placeholder="Starter Feed Premium"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
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
              <Label htmlFor="unit">Unit</Label>
              <Input
                id="unit"
                value={itemForm.unit}
                onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })}
                placeholder="kg, bags, liters"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reorderPoint">Reorder Point (optional)</Label>
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
              <Label htmlFor="unitCost">Unit Cost (R, optional)</Label>
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
    </div>
  );
}
