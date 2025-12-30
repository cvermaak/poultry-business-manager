import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapView } from "@/components/Map";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Home as HomeIcon, Edit, Trash2, Map, LayoutGrid, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

// Parse DMS (Degrees Minutes Seconds) coordinates from Google Maps format
// e.g., "26°11'39.9"S 28°36'02.9"E" -> { lat: -26.194417, lng: 28.600806 }
function parseDMSCoordinates(input: string): { lat: number; lng: number } | null {
  try {
    // Clean up the input - handle various quote styles
    const cleaned = input
      .replace(/[\u2018\u2019\u201C\u201D]/g, (c) => c === '\u2018' || c === '\u2019' ? "'" : '"')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Pattern for DMS: degrees°minutes'seconds"direction
    const dmsPattern = /(\d+)[\u00b0](\d+)['′](\d+\.?\d*)["\u2033]?\s*([NSns])\s+(\d+)[\u00b0](\d+)['′](\d+\.?\d*)["\u2033]?\s*([EWew])/;
    const match = cleaned.match(dmsPattern);
    
    if (match) {
      const latDeg = parseFloat(match[1]);
      const latMin = parseFloat(match[2]);
      const latSec = parseFloat(match[3]);
      const latDir = match[4].toUpperCase();
      
      const lngDeg = parseFloat(match[5]);
      const lngMin = parseFloat(match[6]);
      const lngSec = parseFloat(match[7]);
      const lngDir = match[8].toUpperCase();
      
      let lat = latDeg + latMin / 60 + latSec / 3600;
      let lng = lngDeg + lngMin / 60 + lngSec / 3600;
      
      if (latDir === 'S') lat = -lat;
      if (lngDir === 'W') lng = -lng;
      
      return { lat, lng };
    }
    
    // Also try to parse decimal format: "-26.194417, 28.600806"
    const decimalPattern = /(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/;
    const decMatch = cleaned.match(decimalPattern);
    if (decMatch) {
      return { lat: parseFloat(decMatch[1]), lng: parseFloat(decMatch[2]) };
    }
    
    return null;
  } catch {
    return null;
  }
}

type HouseFormData = {
  name: string;
  houseNumber: string;
  length: string;
  width: string;
  capacity: string;
  houseType: "open_sided" | "closed" | "semi_closed";
  breed: "ross_308" | "cobb_500" | "arbor_acres";
  farmName: string;
  physicalAddress: string;
  gpsLatitude: string;
  gpsLongitude: string;
  province: string;
  district: string;
  beddingType: string;
  beddingDepth: string;
  numberOfFeeders: string;
  numberOfDrinkers: string;
  heatingType: string;
  ventilationType: string;
  notes: string;
};

const emptyFormData: HouseFormData = {
  name: "",
  houseNumber: "",
  length: "",
  width: "",
  capacity: "",
  houseType: "closed",
  breed: "ross_308",
  farmName: "",
  physicalAddress: "",
  gpsLatitude: "",
  gpsLongitude: "",
  province: "",
  district: "",
  beddingType: "pine_shavings",
  beddingDepth: "30",
  numberOfFeeders: "",
  numberOfDrinkers: "",
  heatingType: "",
  ventilationType: "",
  notes: "",
};

export default function Houses() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedHouseId, setSelectedHouseId] = useState<number | null>(null);
  const [formData, setFormData] = useState<HouseFormData>(emptyFormData);
  const [showMapPicker, setShowMapPicker] = useState(false);

  const utils = trpc.useUtils();
  const { data: houses, isLoading } = trpc.houses.list.useQuery();
  
  const createHouse = trpc.houses.create.useMutation({
    onSuccess: () => {
      toast.success("House created successfully");
      setCreateDialogOpen(false);
      utils.houses.list.invalidate();
      setFormData(emptyFormData);
    },
    onError: (error) => {
      toast.error(`Failed to create house: ${error.message}`);
    },
  });

  const updateHouse = trpc.houses.update.useMutation({
    onSuccess: () => {
      toast.success("House updated successfully");
      setEditDialogOpen(false);
      utils.houses.list.invalidate();
      setFormData(emptyFormData);
      setSelectedHouseId(null);
    },
    onError: (error) => {
      toast.error(`Failed to update house: ${error.message}`);
    },
  });

  const deleteHouse = trpc.houses.delete.useMutation({
    onSuccess: (result) => {
      if (result.softDeleted) {
        toast.success("House marked as inactive (has historical flocks)");
      } else {
        toast.success("House deleted successfully");
      }
      setDeleteDialogOpen(false);
      utils.houses.list.invalidate();
      setSelectedHouseId(null);
    },
    onError: (error) => {
      toast.error(`Failed to delete house: ${error.message}`);
    },
  });

  const handleOpenEdit = (house: NonNullable<typeof houses>[number]) => {
    setSelectedHouseId(house.id);
    setFormData({
      name: house.name,
      houseNumber: house.houseNumber || "",
      length: house.length?.toString() || "",
      width: house.width?.toString() || "",
      capacity: house.capacity?.toString() || "",
      houseType: house.houseType || "closed",
      breed: house.breed || "ross_308",
      farmName: house.farmName || "",
      physicalAddress: house.physicalAddress || "",
      gpsLatitude: house.gpsLatitude?.toString() || "",
      gpsLongitude: house.gpsLongitude?.toString() || "",
      province: house.province || "",
      district: house.district || "",
      beddingType: house.beddingType || "pine_shavings",
      beddingDepth: house.beddingDepth?.toString() || "30",
      numberOfFeeders: house.numberOfFeeders?.toString() || "",
      numberOfDrinkers: house.numberOfDrinkers?.toString() || "",
      heatingType: house.heatingType || "",
      ventilationType: house.ventilationType || "",
      notes: house.notes || "",
    });
    setEditDialogOpen(true);
  };

  const handleOpenDelete = (houseId: number) => {
    setSelectedHouseId(houseId);
    setDeleteDialogOpen(true);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createHouse.mutate({
      name: formData.name,
      houseNumber: formData.houseNumber || undefined,
      length: parseFloat(formData.length),
      width: parseFloat(formData.width),
      capacity: parseInt(formData.capacity),
      houseType: formData.houseType,
      breed: formData.breed,
      farmName: formData.farmName || undefined,
      physicalAddress: formData.physicalAddress || undefined,
      gpsLatitude: formData.gpsLatitude ? parseFloat(formData.gpsLatitude) : undefined,
      gpsLongitude: formData.gpsLongitude ? parseFloat(formData.gpsLongitude) : undefined,
      province: formData.province || undefined,
      district: formData.district || undefined,
      beddingType: formData.beddingType,
      beddingDepth: parseInt(formData.beddingDepth),
      numberOfFeeders: formData.numberOfFeeders ? parseInt(formData.numberOfFeeders) : undefined,
      numberOfDrinkers: formData.numberOfDrinkers ? parseInt(formData.numberOfDrinkers) : undefined,
      heatingType: formData.heatingType || undefined,
      ventilationType: formData.ventilationType || undefined,
      notes: formData.notes || undefined,
    });
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedHouseId) return;
    
    updateHouse.mutate({
      id: selectedHouseId,
      name: formData.name,
      houseNumber: formData.houseNumber || undefined,
      length: parseFloat(formData.length),
      width: parseFloat(formData.width),
      capacity: parseInt(formData.capacity),
      houseType: formData.houseType,
      beddingType: formData.beddingType,
      beddingDepth: parseInt(formData.beddingDepth),
      numberOfFeeders: formData.numberOfFeeders ? parseInt(formData.numberOfFeeders) : undefined,
      numberOfDrinkers: formData.numberOfDrinkers ? parseInt(formData.numberOfDrinkers) : undefined,
      heatingType: formData.heatingType || undefined,
      ventilationType: formData.ventilationType || undefined,
      notes: formData.notes || undefined,
      farmName: formData.farmName || undefined,
      physicalAddress: formData.physicalAddress || undefined,
      province: formData.province || undefined,
      district: formData.district || undefined,
      gpsLatitude: formData.gpsLatitude || undefined,
      gpsLongitude: formData.gpsLongitude || undefined,
    });
  };

  const handleDelete = () => {
    if (!selectedHouseId) return;
    deleteHouse.mutate({ id: selectedHouseId });
  };

  const selectedHouse = houses?.find(h => h.id === selectedHouseId);

  // Form content to reuse between create and edit dialogs
  const renderFormContent = (isEdit: boolean) => (
    <>
      <div className="grid gap-4 py-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="name">House Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="houseNumber">House Number</Label>
            <Input
              id="houseNumber"
              value={formData.houseNumber}
              onChange={(e) => setFormData({ ...formData, houseNumber: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="length">Length (m) *</Label>
            <Input
              id="length"
              type="number"
              step="0.01"
              value={formData.length}
              onChange={(e) => setFormData({ ...formData, length: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="width">Width (m) *</Label>
            <Input
              id="width"
              type="number"
              step="0.01"
              value={formData.width}
              onChange={(e) => setFormData({ ...formData, width: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="capacity">Capacity (birds) *</Label>
            <Input
              id="capacity"
              type="number"
              value={formData.capacity}
              onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="houseType">House Type</Label>
            <Select
              value={formData.houseType}
              onValueChange={(value) => setFormData({ ...formData, houseType: value as typeof formData.houseType })}
            >
              <SelectTrigger id="houseType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="open_sided">Open Sided</SelectItem>
                <SelectItem value="semi_closed">Semi Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="breed">Default Breed</Label>
            <Select
              value={formData.breed}
              onValueChange={(value) => setFormData({ ...formData, breed: value as typeof formData.breed })}
              disabled={isEdit}
            >
              <SelectTrigger id="breed">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ross_308">Ross 308</SelectItem>
                <SelectItem value="cobb_500">Cobb 500</SelectItem>
                <SelectItem value="arbor_acres">Arbor Acres</SelectItem>
              </SelectContent>
            </Select>
            {isEdit && <p className="text-xs text-muted-foreground">Breed cannot be changed after creation</p>}
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="font-medium text-sm">Location Information</h4>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="farmName">Farm Name</Label>
            <Input
              id="farmName"
              value={formData.farmName}
              onChange={(e) => setFormData({ ...formData, farmName: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="physicalAddress">Physical Address</Label>
            <Input
              id="physicalAddress"
              value={formData.physicalAddress}
              onChange={(e) => setFormData({ ...formData, physicalAddress: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="province">Province</Label>
            <Input
              id="province"
              value={formData.province}
              onChange={(e) => setFormData({ ...formData, province: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="district">District</Label>
            <Input
              id="district"
              value={formData.district}
              onChange={(e) => setFormData({ ...formData, district: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>GPS Coordinates</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowMapPicker(true)}
              className="flex items-center gap-1"
            >
              <MapPin className="h-3 w-3" />
              Pick on Map
            </Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dmsInput" className="text-xs text-muted-foreground">Paste Google Maps coordinates (DMS format)</Label>
            <Input
              id="dmsInput"
              type="text"
              placeholder="e.g., 26°11'39.9&quot;S 28°36'02.9&quot;E"
              onChange={(e) => {
                const converted = parseDMSCoordinates(e.target.value);
                if (converted) {
                  setFormData({ 
                    ...formData, 
                    gpsLatitude: converted.lat.toFixed(7), 
                    gpsLongitude: converted.lng.toFixed(7) 
                  });
                }
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="gpsLatitude" className="text-xs text-muted-foreground">Latitude (decimal)</Label>
              <Input
                id="gpsLatitude"
                type="number"
                step="0.0000001"
                placeholder="e.g., -25.7479"
                value={formData.gpsLatitude}
                onChange={(e) => setFormData({ ...formData, gpsLatitude: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gpsLongitude" className="text-xs text-muted-foreground">Longitude (decimal)</Label>
              <Input
                id="gpsLongitude"
                type="number"
                step="0.0000001"
                placeholder="e.g., 28.2293"
                value={formData.gpsLongitude}
                onChange={(e) => setFormData({ ...formData, gpsLongitude: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="font-medium text-sm">Bedding & Equipment</h4>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="beddingType">Bedding Type</Label>
            <Input
              id="beddingType"
              value={formData.beddingType}
              onChange={(e) => setFormData({ ...formData, beddingType: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="beddingDepth">Bedding Depth (mm)</Label>
            <Input
              id="beddingDepth"
              type="number"
              value={formData.beddingDepth}
              onChange={(e) => setFormData({ ...formData, beddingDepth: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="numberOfFeeders">Number of Feeders</Label>
            <Input
              id="numberOfFeeders"
              type="number"
              value={formData.numberOfFeeders}
              onChange={(e) => setFormData({ ...formData, numberOfFeeders: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="numberOfDrinkers">Number of Drinkers</Label>
            <Input
              id="numberOfDrinkers"
              type="number"
              value={formData.numberOfDrinkers}
              onChange={(e) => setFormData({ ...formData, numberOfDrinkers: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="heatingType">Heating Type</Label>
            <Input
              id="heatingType"
              value={formData.heatingType}
              onChange={(e) => setFormData({ ...formData, heatingType: e.target.value })}
              placeholder="e.g., Gas, Electric, Coal"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ventilationType">Ventilation Type</Label>
            <Input
              id="ventilationType"
              value={formData.ventilationType}
              onChange={(e) => setFormData({ ...formData, ventilationType: e.target.value })}
              placeholder="e.g., Natural, Mechanical"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={3}
          />
        </div>
      </div>
      <DialogFooter>
        <Button 
          type="button" 
          variant="outline" 
          onClick={() => isEdit ? setEditDialogOpen(false) : setCreateDialogOpen(false)}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isEdit ? updateHouse.isPending : createHouse.isPending}>
          {isEdit 
            ? (updateHouse.isPending ? "Saving..." : "Save Changes")
            : (createHouse.isPending ? "Creating..." : "Create House")
          }
        </Button>
      </DialogFooter>
    </>
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32 mb-2" />
                <Skeleton className="h-4 w-48" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Houses</h1>
          <p className="text-muted-foreground">Manage your chicken house configurations</p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={(open) => {
          setCreateDialogOpen(open);
          if (!open) setFormData(emptyFormData);
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add House
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New House</DialogTitle>
              <DialogDescription>Create a new chicken house configuration</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate}>
              {renderFormContent(false)}
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {houses && houses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <HomeIcon className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No houses configured</h3>
            <p className="text-muted-foreground mb-4">Get started by adding your first chicken house</p>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add House
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="grid" className="w-full">
          <TabsList>
            <TabsTrigger value="grid" className="flex items-center gap-2">
              <LayoutGrid className="h-4 w-4" />
              Grid View
            </TabsTrigger>
            <TabsTrigger value="map" className="flex items-center gap-2">
              <Map className="h-4 w-4" />
              Map View
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="grid" className="mt-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {houses?.map((house) => (
            <Card key={house.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{house.name}</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(house)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleOpenDelete(house.id)} className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardTitle>
                <CardDescription>
                  {house.houseNumber && `House #${house.houseNumber} • `}
                  {house.houseType?.replace("_", " ")}
                  {house.breed && ` • ${house.breed === 'ross_308' ? 'Ross 308' : house.breed === 'cobb_500' ? 'Cobb 500' : 'Arbor Acres'}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Dimensions:</dt>
                    <dd className="font-medium">
                      {house.length}m × {house.width}m
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Floor Area:</dt>
                    <dd className="font-medium">{house.floorArea} m²</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Capacity:</dt>
                    <dd className="font-medium">{house.capacity.toLocaleString()} birds</dd>
                  </div>
                  {house.farmName && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Farm:</dt>
                      <dd className="font-medium">{house.farmName}</dd>
                    </div>
                  )}
                  {house.province && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Location:</dt>
                      <dd className="font-medium">{house.province}{house.district && `, ${house.district}`}</dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Bedding:</dt>
                    <dd className="font-medium">
                      {house.beddingType} ({house.beddingDepth}mm)
                    </dd>
                  </div>
                  {house.numberOfFeeders && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Feeders:</dt>
                      <dd className="font-medium">{house.numberOfFeeders}</dd>
                    </div>
                  )}
                  {house.numberOfDrinkers && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Drinkers:</dt>
                      <dd className="font-medium">{house.numberOfDrinkers}</dd>
                    </div>
                  )}
                </dl>
              </CardContent>
            </Card>
          ))}
            </div>
          </TabsContent>
          
          <TabsContent value="map" className="mt-4">
            <HouseMapView houses={houses || []} onHouseClick={(houseId: number) => {
              const house = houses?.find(h => h.id === houseId);
              if (house) {
                handleOpenEdit(house);
              }
            }} />
          </TabsContent>
        </Tabs>
      )}

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => {
        setEditDialogOpen(open);
        if (!open) {
          setFormData(emptyFormData);
          setSelectedHouseId(null);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit House</DialogTitle>
            <DialogDescription>Update the house configuration for {selectedHouse?.name}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdate}>
            {renderFormContent(true)}
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete House</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{selectedHouse?.name}</strong>?
              <br /><br />
              <span className="text-muted-foreground">
                If this house has historical flocks, it will be marked as inactive instead of permanently deleted.
                Houses with active or planned flocks cannot be deleted.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteHouse.isPending}
            >
              {deleteHouse.isPending ? "Deleting..." : "Delete House"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Map Picker Dialog */}
      <Dialog open={showMapPicker} onOpenChange={setShowMapPicker}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Pick Location on Map</DialogTitle>
            <DialogDescription>Click on the map to set the GPS coordinates for this house</DialogDescription>
          </DialogHeader>
          <LocationPicker
            initialLat={formData.gpsLatitude ? parseFloat(formData.gpsLatitude) : undefined}
            initialLng={formData.gpsLongitude ? parseFloat(formData.gpsLongitude) : undefined}
            onLocationSelect={(lat, lng) => {
              setFormData({
                ...formData,
                gpsLatitude: lat.toFixed(7),
                gpsLongitude: lng.toFixed(7),
              });
              setShowMapPicker(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Location Picker Component
function LocationPicker({ 
  initialLat, 
  initialLng, 
  onLocationSelect 
}: { 
  initialLat?: number; 
  initialLng?: number; 
  onLocationSelect: (lat: number, lng: number) => void;
}) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(
    initialLat && initialLng ? { lat: initialLat, lng: initialLng } : null
  );
  
  const defaultCenter = { lat: -26.2041, lng: 28.0473 }; // Johannesburg
  const center = selectedLocation || defaultCenter;

  const handleMapReady = (map: google.maps.Map) => {
    mapRef.current = map;
    
    // Add initial marker if coordinates exist
    if (selectedLocation) {
      addMarker(selectedLocation.lat, selectedLocation.lng);
    }
    
    // Add click listener to map
    map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (e.latLng) {
        const lat = e.latLng.lat();
        const lng = e.latLng.lng();
        setSelectedLocation({ lat, lng });
        addMarker(lat, lng);
      }
    });
  };
  
  const addMarker = (lat: number, lng: number) => {
    // Remove existing marker
    if (markerRef.current) {
      markerRef.current.map = null;
    }
    
    if (!mapRef.current) return;
    
    const markerDiv = document.createElement('div');
    markerDiv.innerHTML = `
      <div style="
        background: #dc2626;
        border: 3px solid white;
        border-radius: 50%;
        width: 24px;
        height: 24px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      "></div>
    `;
    
    markerRef.current = new google.maps.marker.AdvancedMarkerElement({
      map: mapRef.current,
      position: { lat, lng },
      content: markerDiv,
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0 overflow-hidden rounded-lg">
          <MapView
            className="h-[400px] w-full"
            initialCenter={center}
            initialZoom={selectedLocation ? 15 : 6}
            onMapReady={handleMapReady}
          />
        </CardContent>
      </Card>
      {selectedLocation && (
        <div className="flex items-center justify-between">
          <p className="text-sm">
            Selected: <span className="font-mono">{selectedLocation.lat.toFixed(7)}, {selectedLocation.lng.toFixed(7)}</span>
          </p>
          <Button onClick={() => onLocationSelect(selectedLocation.lat, selectedLocation.lng)}>
            Confirm Location
          </Button>
        </div>
      )}
      {!selectedLocation && (
        <p className="text-sm text-muted-foreground text-center">Click on the map to select a location</p>
      )}
    </div>
  );
}

// House Map View Component
type House = {
  id: number;
  name: string;
  gpsLatitude: string | null;
  gpsLongitude: string | null;
  capacity: number | null;
  farmName: string | null;
  houseType: string | null;
  activeFlockCount: number;
  plannedFlockCount: number;
};

// Get marker color based on house status
function getMarkerColor(house: House): string {
  if (house.activeFlockCount > 0) return '#f59e0b'; // Amber - active flock
  if (house.plannedFlockCount > 0) return '#3b82f6'; // Blue - planned flock
  return '#16a34a'; // Green - empty/available
}

function getStatusLabel(house: House): string {
  if (house.activeFlockCount > 0) return 'Active Flock';
  if (house.plannedFlockCount > 0) return 'Planned Flock';
  return 'Available';
}

function HouseMapView({ houses, onHouseClick }: { houses: House[], onHouseClick: (houseId: number) => void }) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  
  // Filter houses with valid coordinates and parse them
  const housesWithCoords = houses
    .filter(h => h.gpsLatitude && h.gpsLongitude)
    .map(h => ({
      ...h,
      lat: parseFloat(h.gpsLatitude!),
      lng: parseFloat(h.gpsLongitude!),
    }))
    .filter(h => !isNaN(h.lat) && !isNaN(h.lng));
  
  // Calculate center from houses or use default (South Africa)
  const defaultCenter = { lat: -26.2041, lng: 28.0473 }; // Johannesburg
  const center = housesWithCoords.length > 0 
    ? {
        lat: housesWithCoords.reduce((sum, h) => sum + h.lat, 0) / housesWithCoords.length,
        lng: housesWithCoords.reduce((sum, h) => sum + h.lng, 0) / housesWithCoords.length,
      }
    : defaultCenter;

  const handleMapReady = (map: google.maps.Map) => {
    mapRef.current = map;
    
    // Clear existing markers
    markersRef.current.forEach(m => m.map = null);
    markersRef.current = [];
    
    // Create info window
    infoWindowRef.current = new google.maps.InfoWindow();
    
    // Add markers for each house with coordinates
    housesWithCoords.forEach(house => {
      
      // Create custom marker element with color based on status
      const markerColor = getMarkerColor(house);
      const markerDiv = document.createElement('div');
      markerDiv.innerHTML = `
        <div style="
          background: ${markerColor};
          border: 2px solid white;
          border-radius: 50%;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          cursor: pointer;
        ">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
        </div>
      `;
      
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat: house.lat, lng: house.lng },
        title: house.name,
        content: markerDiv,
      });
      
      // Add click listener to show info window and zoom
      marker.addListener('click', () => {
        const content = `
          <div style="padding: 8px; min-width: 200px;">
            <h3 style="margin: 0 0 8px 0; font-weight: 600;">${house.name}</h3>
            ${house.farmName ? `<p style="margin: 4px 0; color: #666;">Farm: ${house.farmName}</p>` : ''}
            ${house.capacity ? `<p style="margin: 4px 0; color: #666;">Capacity: ${house.capacity.toLocaleString()} birds</p>` : ''}
            ${house.houseType ? `<p style="margin: 4px 0; color: #666;">Type: ${house.houseType.replace('_', ' ')}</p>` : ''}
            <p style="margin: 4px 0; font-weight: 500; color: ${getMarkerColor(house)};">
              Status: ${getStatusLabel(house)}
            </p>
            <button id="view-house-${house.id}" style="
              margin-top: 8px;
              padding: 6px 12px;
              background: #16a34a;
              color: white;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              font-size: 14px;
            ">View Details</button>
          </div>
        `;
        
        infoWindowRef.current?.setContent(content);
        infoWindowRef.current?.open(map, marker);
        
        // Zoom to marker
        map.setZoom(16);
        map.panTo({ lat: house.lat, lng: house.lng });
        
        // Add click listener to button after info window opens
        setTimeout(() => {
          const btn = document.getElementById(`view-house-${house.id}`);
          if (btn) {
            btn.onclick = () => onHouseClick(house.id);
          }
        }, 100);
      });
      
      markersRef.current.push(marker);
    });
    
    // Fit bounds to show all markers
    if (housesWithCoords.length > 1) {
      const bounds = new google.maps.LatLngBounds();
      housesWithCoords.forEach(h => {
        bounds.extend({ lat: h.lat, lng: h.lng });
      });
      map.fitBounds(bounds, 50);
    }
  };

  if (housesWithCoords.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No house locations set</h3>
          <p className="text-muted-foreground text-center max-w-md">
            Add GPS coordinates to your houses to see them on the map. 
            Edit a house and enter latitude/longitude values in the Location section.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <p className="text-sm text-muted-foreground">
            Showing {housesWithCoords.length} of {houses.length} houses
          </p>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-green-600"></span>
              Available
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-amber-500"></span>
              Active Flock
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-blue-500"></span>
              Planned
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => {
            if (mapRef.current) {
              mapRef.current.setMapTypeId('satellite');
            }
          }}>
            Satellite
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            if (mapRef.current) {
              mapRef.current.setMapTypeId('terrain');
            }
          }}>
            Terrain
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            if (mapRef.current) {
              mapRef.current.setMapTypeId('roadmap');
            }
          }}>
            Roadmap
          </Button>
        </div>
      </div>
      <Card>
        <CardContent className="p-0 overflow-hidden rounded-lg">
          <MapView
            className="h-[500px] w-full"
            initialCenter={center}
            initialZoom={housesWithCoords.length === 1 ? 15 : 10}
            onMapReady={handleMapReady}
          />
        </CardContent>
      </Card>
    </div>
  );
}
