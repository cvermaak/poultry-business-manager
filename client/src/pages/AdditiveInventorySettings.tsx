import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FlaskConical, Package, CheckCircle2, AlertCircle, Info } from "lucide-react";

const ADDITIVE_TYPES = [
  {
    key: "macro" as const,
    label: "MACRO Additive Pack",
    description: "Critical path item — 14-day lead time. Inclusion rate defined per formulation (kg/ton).",
    leadTime: 14,
    color: "bg-red-100 text-red-800 border-red-200",
    icon: "🔴",
  },
  {
    key: "soya_oil" as const,
    label: "Soya Oil",
    description: "7-day lead time. Inclusion rate defined per formulation (kg/ton).",
    leadTime: 7,
    color: "bg-amber-100 text-amber-800 border-amber-200",
    icon: "🟡",
  },
  {
    key: "probiotic" as const,
    label: "Probiotic",
    description: "7-day lead time. Inclusion rate defined per formulation (kg/ton).",
    leadTime: 7,
    color: "bg-green-100 text-green-800 border-green-200",
    icon: "🟢",
  },
];

export default function AdditiveInventorySettings() {
  const { data: mappings, isLoading: loadingMappings, refetch } = trpc.feedOrders.getAdditiveMappings.useQuery();
  const { data: inventoryItems, isLoading: loadingItems } = trpc.inventory.listItems.useQuery({});

  const setMapping = trpc.feedOrders.setAdditiveMapping.useMutation({
    onSuccess: () => {
      toast.success("Mapping saved successfully");
      refetch();
    },
    onError: (err) => toast.error(`Failed to save: ${err.message}`),
  });

  const [editState, setEditState] = useState<Record<string, { inventoryItemId: string; notes: string }>>({});

  const getMappingForType = (type: string) =>
    mappings?.find((m) => m.additiveType === type);

  const getEditState = (type: string) =>
    editState[type] ?? {
      inventoryItemId: String(getMappingForType(type)?.inventoryItemId ?? ""),
      notes: getMappingForType(type)?.notes ?? "",
    };

  const handleSave = (type: "macro" | "soya_oil" | "probiotic") => {
    const state = getEditState(type);
    if (!state.inventoryItemId || state.inventoryItemId === "none") {
      toast.error("Please select an inventory item");
      return;
    }
    setMapping.mutate({
      additiveType: type,
      inventoryItemId: parseInt(state.inventoryItemId),
      notes: state.notes || undefined,
    });
  };

  // Filter inventory items to raw_materials category
  const rawMaterialItems = inventoryItems?.filter(
    (item: any) => item.category === "raw_materials" || item.itemType === "raw_material"
  ) ?? [];

  const allItems = inventoryItems ?? [];

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-primary/10">
            <FlaskConical className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Additive Inventory Mappings</h1>
            <p className="text-muted-foreground mt-1">
              Map each feed additive type to its corresponding inventory item. The system uses these
              mappings to check stock levels and reserve quantities when a new feed order is created.
            </p>
          </div>
        </div>

        {/* Info banner */}
        <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50 border border-blue-200 text-blue-800">
          <Info className="h-5 w-5 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium mb-1">How stock integration works</p>
            <ul className="list-disc list-inside space-y-1 text-blue-700">
              <li>When a feed order is created, the system calculates required kg per additive (kg/ton × order tons).</li>
              <li>Available stock is checked and reserved against the order (reducing on-hand stock).</li>
              <li>If stock is insufficient, an additive purchase order is generated for the shortfall only.</li>
              <li>MACRO POs are flagged as critical path (14-day lead time); Soya Oil and Probiotic are 7-day.</li>
            </ul>
          </div>
        </div>

        {/* Mapping cards */}
        {ADDITIVE_TYPES.map((additive) => {
          const existing = getMappingForType(additive.key);
          const state = getEditState(additive.key);
          const isMapped = !!existing;
          const selectedItem = allItems.find((i: any) => String(i.id) === state.inventoryItemId);

          return (
            <Card key={additive.key} className="border-2">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{additive.icon}</span>
                    <div>
                      <CardTitle className="text-lg">{additive.label}</CardTitle>
                      <CardDescription className="mt-0.5">{additive.description}</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={additive.color}>
                      {additive.leadTime}-day lead time
                    </Badge>
                    {isMapped ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Mapped
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 gap-1">
                        <AlertCircle className="h-3 w-3" /> Not mapped
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="pt-4 space-y-4">
                {/* Current mapping display */}
                {isMapped && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="text-sm">
                      <span className="font-medium">Currently mapped to: </span>
                      <span>{existing.itemName ?? "Unknown item"}</span>
                      {existing.itemNumber && (
                        <span className="text-muted-foreground ml-1">({existing.itemNumber})</span>
                      )}
                      {existing.currentStock !== null && existing.currentStock !== undefined && (
                        <span className="ml-2 text-muted-foreground">
                          — Stock on hand: <strong>{parseFloat(String(existing.currentStock)).toFixed(2)} {existing.unit ?? "kg"}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Inventory item selector */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Inventory Item</Label>
                    <Select
                      value={state.inventoryItemId || "none"}
                      onValueChange={(val) =>
                        setEditState((prev) => ({
                          ...prev,
                          [additive.key]: { ...getEditState(additive.key), inventoryItemId: val === "none" ? "" : val },
                        }))
                      }
                      disabled={loadingItems}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select inventory item…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Select an item —</SelectItem>
                        {rawMaterialItems.length > 0 && (
                          <>
                            <SelectItem value="__header_raw__" disabled>
                              ── Raw Materials ──
                            </SelectItem>
                            {rawMaterialItems.map((item: any) => (
                              <SelectItem key={item.id} value={String(item.id)}>
                                {item.name}
                                {item.itemNumber ? ` (${item.itemNumber})` : ""}
                                {item.unit ? ` — ${item.unit}` : ""}
                              </SelectItem>
                            ))}
                          </>
                        )}
                        {allItems.filter((i: any) => i.category !== "raw_materials" && i.itemType !== "raw_material").length > 0 && (
                          <>
                            <SelectItem value="__header_other__" disabled>
                              ── Other Items ──
                            </SelectItem>
                            {allItems
                              .filter((i: any) => i.category !== "raw_materials" && i.itemType !== "raw_material")
                              .map((item: any) => (
                                <SelectItem key={item.id} value={String(item.id)}>
                                  {item.name}
                                  {item.itemNumber ? ` (${item.itemNumber})` : ""}
                                  {item.unit ? ` — ${item.unit}` : ""}
                                </SelectItem>
                              ))}
                          </>
                        )}
                      </SelectContent>
                    </Select>
                    {selectedItem && (
                      <p className="text-xs text-muted-foreground">
                        Current stock: <strong>{parseFloat(String((selectedItem as any).currentStock ?? 0)).toFixed(2)} {(selectedItem as any).unit ?? "kg"}</strong>
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Notes (optional)</Label>
                    <Textarea
                      placeholder="e.g., supplier preference, storage location…"
                      value={state.notes}
                      onChange={(e) =>
                        setEditState((prev) => ({
                          ...prev,
                          [additive.key]: { ...getEditState(additive.key), notes: e.target.value },
                        }))
                      }
                      rows={2}
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={() => handleSave(additive.key)}
                    disabled={setMapping.isPending || !state.inventoryItemId || state.inventoryItemId === "none"}
                  >
                    {setMapping.isPending ? "Saving…" : isMapped ? "Update Mapping" : "Save Mapping"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </DashboardLayout>
  );
}
